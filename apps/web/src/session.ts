import { createAuthClient, type AuthClient } from '@bajeiros/auth/client'
import { create } from 'zustand'
import type { AppConfig } from './config'

// Sessão do portal. Token SÓ em memória (plano v2, 12.4) — recarregar a página
// exige novo login (no modo cognito o cookie do Managed Login torna a volta
// silenciosa). Modo dev: sub estável por e-mail via localStorage (só o
// mapeamento e-mail→sub, nunca o token). Modo cognito: redirect OIDC
// (code + PKCE) via @bajeiros/auth — nada de Cognito fora daquele package.

export interface ApiProblem {
  title: string
  status: number
  detail?: string
  [k: string]: unknown
}

export class ApiError extends Error {
  problem: ApiProblem
  constructor(problem: ApiProblem) {
    super(problem.detail ?? problem.title)
    this.problem = problem
  }
}

export interface UserInfo {
  id: string
  email: string
  displayName: string
  university: string | null
  isAdmin?: boolean
}

export interface CurrentProject {
  id: string
  name: string
  seq: number
}

export type PanelId = 'login' | 'profile' | 'projects' | 'teams' | null

// Páginas inteiras da SPA (DF-8/DF-9): editor 3D, assistente e admin.
export type PageId = 'editor' | 'assistant' | 'admin'

// Header de auth p/ fetches feitos fora do método api() (track, streaming SSE).
export function authHeaders(): Record<string, string> {
  const { token } = useSession.getState()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

// DF-9: pageview de melhor esforço (só logado; falha é silenciosa)
export function track(page: string) {
  if (!useSession.getState().token) return
  void fetch('/api/v1/activity/pageview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ page }),
  }).catch(() => {})
}

interface SessionState {
  token: string | null
  user: UserInfo | null
  currentProject: CurrentProject | null
  panel: PanelId
  page: PageId
  landing: boolean
  inviteToken: string | null
  inviteNotice: string | null
  authNotice: string | null // falha do pós-login cognito (ex.: 409 de e-mail), exibida no LoginPanel
  setPanel: (p: PanelId) => void
  setPage: (p: PageId) => void
  setLanding: (v: boolean) => void
  setCurrentProject: (p: CurrentProject | null) => void
  clearInviteNotice: () => void
  // dev: exige email+name (form local); cognito: ignora args e redireciona
  login: (email?: string, name?: string) => Promise<void>
  logout: () => void
  api: <T = unknown>(path: string, init?: RequestInit) => Promise<T>
  setUser: (u: UserInfo | null) => void
}

// Link copiável de convite: https://…/#convite=TOKEN — capturado no load e
// consumido logo após o login (o token some da URL p/ não vazar em histórico/refer[r]er).
function readInviteFromUrl(): string | null {
  if (typeof window === 'undefined') return null
  const m = window.location.hash.match(/convite=([A-Za-z0-9_-]{20,200})/)
  if (!m) return null
  history.replaceState(null, '', window.location.pathname + window.location.search)
  return m[1]
}
const initialInvite = readInviteFromUrl()

// Link aberto numa aba já carregada (só o hash muda, sem reload): captura também.
// Aceita um convite estando autenticado; usado pós-login (dev e cognito) e
// pelo listener de hashchange.
async function acceptPendingInvite(invite: string): Promise<void> {
  try {
    const team = await useSession.getState().api<{ name: string }>('/api/v1/invites/accept', {
      method: 'POST',
      body: JSON.stringify({ token: invite }),
    })
    useSession.setState({ panel: 'teams', inviteNotice: `Você entrou na equipe ${team.name}.` })
  } catch {
    useSession.setState({
      panel: 'teams',
      inviteNotice:
        'Convite inválido ou expirado — peça um novo link a quem convidou (confira se entrou com o e-mail convidado).',
    })
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => {
    const token = readInviteFromUrl()
    if (!token) return
    if (!useSession.getState().user) {
      useSession.setState({ inviteToken: token, panel: 'login' })
      return
    }
    void acceptPendingInvite(token)
  })
}

const DEV_SUBS_KEY = 'bajeiros:dev-subs'

function devSubFor(email: string): string | undefined {
  try {
    return JSON.parse(localStorage.getItem(DEV_SUBS_KEY) ?? '{}')[email]
  } catch {
    return undefined
  }
}

function rememberDevSub(email: string, sub: string) {
  try {
    const map = JSON.parse(localStorage.getItem(DEV_SUBS_KEY) ?? '{}')
    map[email] = sub
    localStorage.setItem(DEV_SUBS_KEY, JSON.stringify(map))
  } catch {
    /* dev only */
  }
}

// ---------- modo cognito (config chega no boot, via initSession) ----------

let appConfig: AppConfig = { authMode: 'dev' }
let authClient: AuthClient | null = null

export function authMode(): AppConfig['authMode'] {
  return appConfig.authMode
}

// Refresh único mesmo com chamadas 401 concorrentes.
let refreshInFlight: Promise<string | null> | null = null
function refreshOnce(): Promise<string | null> {
  if (!authClient) return Promise.resolve(null)
  refreshInFlight ??= authClient
    .refresh()
    .then((t) => t?.idToken ?? null)
    .catch(() => null)
    .finally(() => {
      refreshInFlight = null
    })
  return refreshInFlight
}

// Chamado pelo main.tsx ANTES do createRoot: o ?code= do redirect é single-use
// e o StrictMode re-executa effects — o callback não pode viver dentro do React.
export async function initSession(config: AppConfig): Promise<void> {
  appConfig = config
  if (config.authMode !== 'cognito' || !config.cognito) return
  authClient = createAuthClient({
    domain: config.cognito.domain,
    clientId: config.cognito.clientId,
    redirectUri: window.location.origin + '/',
    logoutUri: window.location.origin + '/',
  })
  if (!authClient.hasCallbackParams()) return

  const result = await authClient.handleCallback()
  if (!result) return // state/verifier ausentes ou troca falhou → landing normal

  useSession.setState({ token: result.tokens.idToken, landing: false })
  try {
    const user = await useSession.getState().api<UserInfo>('/api/v1/me', { method: 'POST' })
    useSession.setState({ user, panel: null })
  } catch (e) {
    // API fora do ar (ex.: staging sem backend) ou bootstrap recusado (409/410):
    // segue deslogado, mas com o motivo visível no painel de login
    if (e instanceof ApiError) {
      useSession.setState({
        token: null,
        panel: 'login',
        authNotice: e.problem.detail ?? e.problem.title,
      })
    }
    return
  }
  const invite = result.appState.invite ?? useSession.getState().inviteToken
  if (invite) {
    useSession.setState({ inviteToken: null })
    await acceptPendingInvite(invite)
  }
}

async function parseOrThrow<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T
  const contentType = res.headers.get('content-type') ?? ''
  const isProblem = contentType.includes('problem+json')
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    throw new ApiError(
      isProblem && body ? body : { title: `Erro ${res.status}`, status: res.status },
    )
  }
  // 2xx sem JSON = não veio da API (ex.: fallback SPA do CloudFront quando o
  // backend não existe no ambiente) — tratar como indisponibilidade, não sucesso
  if (!contentType.includes('json') || body === null) {
    throw new ApiError({
      title: 'API indisponível',
      status: res.status,
      detail:
        'O backend ainda não está disponível neste ambiente — a conta funciona, mas os recursos que dependem da API (projetos, equipes) ficam para quando ele for publicado.',
    })
  }
  return body as T
}

export const useSession = create<SessionState>((set, get) => ({
  token: null,
  user: null,
  currentProject: null,
  page: 'editor',
  landing: !initialInvite, // landing é a página inicial; convite pula direto p/ login
  panel: initialInvite ? 'login' : null,
  inviteToken: initialInvite,
  inviteNotice: null,
  authNotice: null,
  clearInviteNotice: () => set({ inviteNotice: null }),
  setPanel: (panel) => {
    if (panel) track(`panel:${panel}`)
    set({ panel })
  },
  setPage: (page) => {
    track(`page:${page}`)
    set({ page })
  },
  setLanding: (landing) => set({ landing }),
  setCurrentProject: (currentProject) => set({ currentProject }),
  setUser: (user) => set({ user }),

  api: async <T>(path: string, init: RequestInit = {}): Promise<T> => {
    const doFetch = (token: string | null) =>
      fetch(path, {
        ...init,
        headers: {
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(init.headers ?? {}),
        },
      })
    let res = await doFetch(get().token)
    if (res.status === 401 && get().token) {
      // cognito: 1 tentativa de refresh + retry antes de derrubar a sessão
      const refreshed = await refreshOnce()
      if (refreshed) {
        set({ token: refreshed })
        res = await doFetch(refreshed)
      }
      if (res.status === 401) {
        set({ token: null, user: null, currentProject: null, panel: 'login' })
      }
    }
    return parseOrThrow<T>(res)
  },

  login: async (email, name) => {
    // Modo cognito: redireciona ao Managed Login; o convite pendente viaja no
    // appState (sessionStorage) e volta em initSession após o callback.
    if (appConfig.authMode === 'cognito' && authClient) {
      set({ authNotice: null })
      const invite = get().inviteToken
      await authClient.login(invite ? { invite } : {})
      return // a navegação sai da página
    }

    // Modo dev (AUTH_MODE=dev, só local): form e-mail+nome, sem senha.
    if (!email || !name) throw new Error('login dev exige e-mail e nome')
    const issued = await parseOrThrow<{ token: string; claims: { sub: string } }>(
      await fetch('/api/v1/dev/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name, sub: devSubFor(email) }),
      }),
    )
    rememberDevSub(email, issued.claims.sub)
    set({ token: issued.token })
    const user = await get().api<UserInfo>('/api/v1/me', { method: 'POST' })
    set({ user, panel: null })

    // convite pendente na URL? aceita agora, já autenticado
    const invite = get().inviteToken
    if (invite) {
      set({ inviteToken: null })
      await acceptPendingInvite(invite)
    }
  },

  logout: () => {
    set({ token: null, user: null, currentProject: null, panel: null, page: 'editor' })
    // cognito: encerra também a sessão do Managed Login (senão o próximo
    // "Entrar" volta logado silenciosamente pelo cookie do domínio auth)
    if (appConfig.authMode === 'cognito' && authClient) authClient.logout()
  },
}))
