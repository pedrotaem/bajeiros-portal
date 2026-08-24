import { create } from 'zustand'

// Sessão do portal (fase 12/13). Token SÓ em memória (plano v2, 12.4) —
// recarregar a página exige novo login; em dev o sub é estável por e-mail
// (localStorage guarda apenas o mapeamento e-mail→sub, nunca o token).

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
}

export interface CurrentProject {
  id: string
  name: string
  seq: number
}

export type PanelId = 'login' | 'profile' | 'projects' | 'teams' | null

interface SessionState {
  token: string | null
  user: UserInfo | null
  currentProject: CurrentProject | null
  panel: PanelId
  inviteToken: string | null
  inviteNotice: string | null
  setPanel: (p: PanelId) => void
  setCurrentProject: (p: CurrentProject | null) => void
  clearInviteNotice: () => void
  login: (email: string, name: string) => Promise<void>
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
if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => {
    const token = readInviteFromUrl()
    if (!token) return
    const s = useSession.getState()
    if (!s.user) {
      useSession.setState({ inviteToken: token, panel: 'login' })
      return
    }
    s.api<{ name: string }>('/api/v1/invites/accept', {
      method: 'POST',
      body: JSON.stringify({ token }),
    })
      .then((team) =>
        useSession.setState({
          panel: 'teams',
          inviteNotice: `Você entrou na equipe ${team.name}.`,
        }),
      )
      .catch(() =>
        useSession.setState({
          panel: 'teams',
          inviteNotice:
            'Convite inválido ou expirado — peça um novo link a quem convidou (confira se entrou com o e-mail convidado).',
        }),
      )
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

async function parseOrThrow<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T
  const isProblem = res.headers.get('content-type')?.includes('problem+json')
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    throw new ApiError(
      isProblem && body ? body : { title: `Erro ${res.status}`, status: res.status },
    )
  }
  return body as T
}

export const useSession = create<SessionState>((set, get) => ({
  token: null,
  user: null,
  currentProject: null,
  panel: initialInvite ? 'login' : null,
  inviteToken: initialInvite,
  inviteNotice: null,
  clearInviteNotice: () => set({ inviteNotice: null }),
  setPanel: (panel) => set({ panel }),
  setCurrentProject: (currentProject) => set({ currentProject }),
  setUser: (user) => set({ user }),

  api: async <T>(path: string, init: RequestInit = {}): Promise<T> => {
    const { token } = get()
    const res = await fetch(path, {
      ...init,
      headers: {
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init.headers ?? {}),
      },
    })
    if (res.status === 401 && get().token) {
      set({ token: null, user: null, currentProject: null, panel: 'login' })
    }
    return parseOrThrow<T>(res)
  },

  // Login de desenvolvimento (AUTH_MODE=dev). Cognito hosted/OIDC entra na fase 12 real.
  login: async (email, name) => {
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
      try {
        const team = await get().api<{ name: string }>('/api/v1/invites/accept', {
          method: 'POST',
          body: JSON.stringify({ token: invite }),
        })
        set({ panel: 'teams', inviteNotice: `Você entrou na equipe ${team.name}.` })
      } catch {
        set({
          panel: 'teams',
          inviteNotice:
            'Convite inválido ou expirado — peça um novo link a quem convidou (confira se entrou com o e-mail convidado).',
        })
      }
    }
  },

  logout: () => set({ token: null, user: null, currentProject: null, panel: null }),
}))
