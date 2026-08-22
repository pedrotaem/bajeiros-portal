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

export type PanelId = 'login' | 'profile' | 'projects' | null

interface SessionState {
  token: string | null
  user: UserInfo | null
  currentProject: CurrentProject | null
  panel: PanelId
  setPanel: (p: PanelId) => void
  setCurrentProject: (p: CurrentProject | null) => void
  login: (email: string, name: string) => Promise<void>
  logout: () => void
  api: <T = unknown>(path: string, init?: RequestInit) => Promise<T>
  setUser: (u: UserInfo | null) => void
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
  panel: null,
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
  },

  logout: () => set({ token: null, user: null, currentProject: null, panel: null }),
}))
