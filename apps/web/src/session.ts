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

export type PanelId = 'login' | 'profile' | 'projects' | 'feedback' | null

// Destinos da SPA (DF-12 §3.2). O rail é EVOLUÇÃO-cêntrico: o primeiro destino é o
// dia da equipe, não a ferramenta. `editor` e `assistant` continuam páginas próprias,
// abertas pelo hub — no rail, quem acende é **Ferramentas**.
//
// Restrição intocada (ADR-009, decisão 4): NÃO existe router. O editor fica sempre
// montado com `display: none` quando outra página está ativa; desmontá-lo perderia a
// câmera, porque não há estado de câmera no store para restaurar.
export type PageId =
  | 'inicio'
  | 'equipe'
  | 'ferramentas'
  | 'comunidade'
  | 'editor'
  | 'assistant'
  | 'admin'
  | 'sobre'
  | 'projeto'

/** Nome de cada destino na tela. Mora junto do `PageId` porque é sobre ele. */
export const TITULO_PAGINA: Record<PageId, string> = {
  inicio: 'Início',
  equipe: 'Equipe',
  ferramentas: 'Ferramentas',
  comunidade: 'Comunidade',
  editor: 'Validador de gaiola',
  assistant: 'Assistente do regulamento',
  admin: 'Administração',
  sobre: 'Sobre o portal',
  projeto: 'Projeto',
}

/** Abas do espaço da equipe (DF-12 O2). Sub-estado no store, nunca `useState` local. */
export type TeamTab = 'evolucao' | 'pessoas' | 'conhecimento' | 'projetos'
export type CommunityTab = 'resultados' | 'equipes'

/**
 * Abas da página de projeto (DF-21 §3.5). A Ficha é a primeira porque ela vale sem o
 * validador; a Validação pode ficar vazia a vida inteira sem afetar a Ficha em nada.
 */
export type ProjectTab = 'ficha' | 'versoes' | 'validacao'

/** Ferramentas acesas quando o item Ferramentas está ativo (DF-12 RF-1.2/AC-DF12.4). */
export const TOOL_PAGES: PageId[] = ['ferramentas', 'editor', 'assistant']

/** Equipe ativa entre sessões — dado não sensível (DF-12 RF-2.3). */
const ACTIVE_TEAM_KEY = 'bajeiros:equipe-ativa'

function readActiveTeam(): string | null {
  try {
    return localStorage.getItem(ACTIVE_TEAM_KEY)
  } catch {
    return null
  }
}

/**
 * Rail recolhido entre sessões (DF-24). Quem trabalha no editor recolhe uma vez e
 * quer assim toda vez; guardar é o que faz o botão valer a pena. Mesmo contrato do
 * `ACTIVE_TEAM_KEY`: storage bloqueado só custa a memória entre sessões.
 */
const RAIL_KEY = 'bajeiros:rail-compacto'

function readRailCompact(): boolean {
  try {
    return localStorage.getItem(RAIL_KEY) === '1'
  } catch {
    return false
  }
}

// Header de auth p/ fetches feitos fora do método api() (track, streaming SSE).
export function authHeaders(): Record<string, string> {
  const { token } = useSession.getState()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

// ---------- DF-26: o que vai junto com uma sugestão ----------

export interface EnvioContexto {
  page: PageId
  view: string | null
  context: { viewport: [number, number]; rail: 'aberto' | 'compacto' }
}

/** Rótulos das abas, para a linha que a pessoa lê antes de enviar (RF-DF26.9). */
const TITULO_ABA: Record<string, string> = {
  evolucao: 'Evolução',
  pessoas: 'Pessoas',
  conhecimento: 'Conhecimento',
  projetos: 'Projetos',
  resultados: 'Resultados',
  equipes: 'Equipes do Brasil',
  ficha: 'Ficha',
  versoes: 'Versões',
  validacao: 'Validação',
}

/**
 * O que a sugestão carrega além do texto (DF-26 §4.2). Função PURA sobre o estado
 * e o tamanho da janela — é ela que o teste percorre, não a tela.
 *
 * A lista é ENUMERADA e é isso que a separa de telemetria (§5.3): o que não está
 * aqui não é capturado. Sem user-agent, sem captura de tela, sem console, sem rede,
 * sem URL. Tamanho da janela e estado do menu entram porque a classe de defeito que
 * mais escapou dos testes neste repo é apresentação numa largura específica.
 */
export function contextoDaPagina(
  s: Pick<SessionState, 'page' | 'teamTab' | 'communityTab' | 'projectTab' | 'railCompact'>,
  janela: { innerWidth: number; innerHeight: number },
): EnvioContexto {
  const view =
    s.page === 'equipe'
      ? s.teamTab
      : s.page === 'comunidade'
        ? s.communityTab
        : s.page === 'projeto'
          ? s.projectTab
          : null
  return {
    page: s.page,
    view,
    context: {
      viewport: [Math.round(janela.innerWidth), Math.round(janela.innerHeight)],
      rail: s.railCompact ? 'compacto' : 'aberto',
    },
  }
}

/** A mesma coisa em uma linha legível — contexto que a pessoa não vê é telemetria. */
export function resumoDoContexto(e: EnvioContexto): string {
  const partes = [TITULO_PAGINA[e.page]]
  if (e.view) partes.push(TITULO_ABA[e.view] ?? e.view)
  partes.push(`janela ${e.context.viewport[0]}×${e.context.viewport[1]}`)
  partes.push(e.context.rail === 'compacto' ? 'menu recolhido' : 'menu aberto')
  return partes.join(' · ')
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
  teamTab: TeamTab
  communityTab: CommunityTab
  projectTab: ProjectTab
  activeTeamId: string | null
  /** Rail recolhido a só-ícone (DF-24 / design-system C-02 `rail-compact`). */
  railCompact: boolean
  setRailCompact: (v: boolean) => void
  inviteToken: string | null
  inviteNotice: string | null
  authNotice: string | null // falha do pós-login cognito (ex.: 409 de e-mail), exibida no LoginPanel
  /**
   * DF-26 RF-DF26.3 — por que o login abriu, quando não foi a pessoa que pediu.
   * Campo SEPARADO do `authNotice` de propósito: aquele é falha e é pintado como
   * erro; este é explicação, e pintar explicação de vermelho ensina errado.
   */
  loginReason: string | null
  setPanel: (p: PanelId) => void
  setPage: (p: PageId) => void
  setTeamTab: (t: TeamTab) => void
  setCommunityTab: (t: CommunityTab) => void
  setProjectTab: (t: ProjectTab) => void
  /** Abre a página do projeto na aba certa (DF-21 §3.5) — sem desmontar o editor. */
  goToProject: (p: CurrentProject, tab?: ProjectTab) => void
  setActiveTeam: (id: string | null) => void
  /** Abre a equipe já na aba certa — usado pelos CTAs de passo do Início (DF-16). */
  goToTeam: (tab?: TeamTab) => void
  setCurrentProject: (p: CurrentProject | null) => void
  clearInviteNotice: () => void
  // dev: exige email+name (form local); cognito: ignora args e redireciona
  login: (email?: string, name?: string) => Promise<void>
  // cognito: vai direto ao IdP social (DF-17), pulando a tela do Managed Login
  loginWithProvider: (provider: string) => Promise<void>
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
// pelo listener de hashchange. DF-10: aceitar não entra na equipe — o pedido vai
// para a capitania confirmar, e a pessoa cai na página de equipe já sabendo disso.
async function acceptPendingInvite(invite: string): Promise<void> {
  try {
    const r = await useSession
      .getState()
      .api<{ teamName: string; outcome: 'pending' | 'member' }>('/api/v1/invites/accept', {
        method: 'POST',
        body: JSON.stringify({ token: invite }),
      })
    useSession.setState({
      page: 'equipe',
      teamTab: 'pessoas',
      inviteNotice:
        r.outcome === 'member'
          ? `Você já faz parte da equipe ${r.teamName}.`
          : `Pedido enviado à equipe ${r.teamName}. A entrada é confirmada por quem capitaneia a equipe.`,
    })
  } catch {
    useSession.setState({
      page: 'equipe',
      teamTab: 'pessoas',
      inviteNotice:
        'Convite inválido ou expirado. Peça um novo link a quem convidou (confira se entrou com o e-mail convidado).',
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

/** Config do ambiente já resolvida no boot (DF-26 usa o `comingSoon`). */
export function appConfigAtual(): AppConfig {
  return appConfig
}

// IdPs sociais habilitados neste ambiente (DF-17); vazio = só e-mail e senha.
export function authProviders(): NonNullable<NonNullable<AppConfig['cognito']>['providers']> {
  return appConfig.cognito?.providers ?? []
}

// Como esta sessão entrou (claim `identities` do ID token), SÓ para rotular a UI
// (DF-17 RF-4.5). Não é verificação de nada: quem valida o token é a API.
export function identityProviderOf(token: string | null): string | null {
  if (!token) return null
  try {
    const raw = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const payload = JSON.parse(atob(raw.padEnd(Math.ceil(raw.length / 4) * 4, '='))) as {
      identities?: { providerName?: string }[]
    }
    return payload.identities?.[0]?.providerName ?? null
  } catch {
    return null
  }
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
  // 'retrying' = reautorização em curso (vinculação Google, DF-17 §3.4): a navegação
  // já saiu da página. 'none' = state/verifier ausentes → segue no Início público.
  if (result.status === 'retrying' || result.status === 'none') return
  if (result.status === 'error') {
    useSession.setState({ panel: 'login', authNotice: result.message })
    return
  }

  useSession.setState({ token: result.tokens.idToken, page: 'inicio' })
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
        'O backend ainda não está disponível neste ambiente. A conta funciona, mas os recursos que dependem da API (projetos, equipes) ficam para quando ele for publicado.',
    })
  }
  return body as T
}

export const useSession = create<SessionState>((set, get) => ({
  token: null,
  user: null,
  currentProject: null,
  page: 'inicio',
  teamTab: 'evolucao',
  communityTab: 'resultados',
  projectTab: 'ficha',
  activeTeamId: readActiveTeam(),
  railCompact: readRailCompact(),
  setRailCompact: (railCompact) => {
    try {
      localStorage.setItem(RAIL_KEY, railCompact ? '1' : '0')
    } catch {
      /* storage bloqueado: vale só esta sessão */
    }
    set({ railCompact })
  },
  // A home é o Início do shell, logado ou não (a apresentação pública mora nele).
  // Convite pendente pula direto para o login.
  panel: initialInvite ? 'login' : null,
  inviteToken: initialInvite,
  inviteNotice: null,
  authNotice: null,
  loginReason: null,
  clearInviteNotice: () => set({ inviteNotice: null }),
  setPanel: (panel) => {
    if (panel) track(`panel:${panel}`)
    // o motivo vale para a abertura do login que o gerou, e não sobrevive a ela
    set(panel === 'login' ? { panel } : { panel, loginReason: null })
  },
  setPage: (page) => {
    track(`page:${page}`)
    set({ page })
  },
  setTeamTab: (teamTab) => {
    track(`tab:equipe:${teamTab}`)
    set({ teamTab })
  },
  setCommunityTab: (communityTab) => {
    track(`tab:comunidade:${communityTab}`)
    set({ communityTab })
  },
  setProjectTab: (projectTab) => {
    track(`tab:projeto:${projectTab}`)
    set({ projectTab })
  },
  goToProject: (currentProject, tab) => {
    track('page:projeto')
    set({ currentProject, page: 'projeto', ...(tab ? { projectTab: tab } : {}) })
  },
  setActiveTeam: (activeTeamId) => {
    try {
      if (activeTeamId) localStorage.setItem(ACTIVE_TEAM_KEY, activeTeamId)
      else localStorage.removeItem(ACTIVE_TEAM_KEY)
    } catch {
      /* máquina de oficina com storage bloqueado: a equipe ativa vale só a sessão */
    }
    set({ activeTeamId })
  },
  goToTeam: (tab) => {
    track(`page:equipe`)
    set(tab ? { page: 'equipe', teamTab: tab } : { page: 'equipe' })
  },
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
    // pós-login cai no Início, não no editor (DF-12 AC-DF12.1)
    set({ user, panel: null, page: 'inicio', loginReason: null })

    // convite pendente na URL? aceita agora, já autenticado
    const invite = get().inviteToken
    if (invite) {
      set({ inviteToken: null })
      await acceptPendingInvite(invite)
    }
  },

  loginWithProvider: async (provider) => {
    if (appConfig.authMode !== 'cognito' || !authClient) return
    set({ authNotice: null })
    const invite = get().inviteToken
    await authClient.login(invite ? { invite } : {}, { identityProvider: provider })
  },

  logout: () => {
    // logout volta ao Início público, não ao editor
    set({ token: null, user: null, currentProject: null, panel: null, page: 'inicio' })
    // cognito: encerra também a sessão do Managed Login (senão o próximo
    // "Entrar" volta logado silenciosamente pelo cookie do domínio auth)
    if (appConfig.authMode === 'cognito' && authClient) authClient.logout()
  },
}))
