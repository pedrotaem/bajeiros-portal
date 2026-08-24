import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAuthClient } from './client'
import { codeChallengeS256 } from './pkce'

// Stubs mínimos de browser (vitest roda em node): sessionStorage, window.location,
// history.replaceState e fetch. Sem jsdom — só o que o client usa.

function makeStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  }
}

let assigned: string[]
let replaced: string[]

const CFG = {
  domain: 'https://pool.auth.sa-east-1.amazoncognito.com',
  clientId: 'client123',
  redirectUri: 'https://app.example/',
  logoutUri: 'https://app.example/',
}

function setUrl(search: string, hash = '') {
  ;(globalThis as any).window.location.search = search
  ;(globalThis as any).window.location.hash = hash
}

beforeEach(() => {
  assigned = []
  replaced = []
  ;(globalThis as any).sessionStorage = makeStorage()
  ;(globalThis as any).window = {
    location: {
      search: '',
      hash: '',
      pathname: '/',
      assign: (u: string) => void assigned.push(u),
    },
    history: { replaceState: (_s: unknown, _t: string, u: string) => void replaced.push(u) },
  }
})

afterEach(() => {
  vi.restoreAllMocks()
  delete (globalThis as any).sessionStorage
  delete (globalThis as any).window
})

describe('createAuthClient', () => {
  it('login monta a URL de authorize com PKCE e persiste verifier/state/appState', async () => {
    const client = createAuthClient(CFG)
    await client.login({ invite: 'tok123' })
    expect(assigned).toHaveLength(1)
    const url = new URL(assigned[0])
    expect(url.origin).toBe('https://pool.auth.sa-east-1.amazoncognito.com')
    expect(url.pathname).toBe('/oauth2/authorize')
    const p = url.searchParams
    expect(p.get('response_type')).toBe('code')
    expect(p.get('client_id')).toBe('client123')
    expect(p.get('redirect_uri')).toBe('https://app.example/')
    expect(p.get('scope')).toBe('openid email profile')
    expect(p.get('code_challenge_method')).toBe('S256')
    const verifier = sessionStorage.getItem('bajeiros:auth:verifier')!
    expect(p.get('code_challenge')).toBe(await codeChallengeS256(verifier))
    expect(p.get('state')).toBe(sessionStorage.getItem('bajeiros:auth:state'))
    expect(sessionStorage.getItem('bajeiros:auth:app-state')).toBe('{"invite":"tok123"}')
  })

  it('handleCallback troca o code, devolve appState e limpa URL/storage', async () => {
    const client = createAuthClient(CFG)
    await client.login({ invite: 'tok123' })
    const state = sessionStorage.getItem('bajeiros:auth:state')!
    setUrl(`?code=abc&state=${state}`, '#mantem')

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id_token: 'ID.TOKEN', refresh_token: 'REFRESH', expires_in: 3600 }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await client.handleCallback()
    expect(result).not.toBeNull()
    expect(result!.tokens.idToken).toBe('ID.TOKEN')
    expect(result!.appState).toEqual({ invite: 'tok123' })
    expect(client.getIdToken()).toBe('ID.TOKEN')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${CFG.domain}/oauth2/token`)
    const body = init.body as URLSearchParams
    expect(body.get('grant_type')).toBe('authorization_code')
    expect(body.get('code')).toBe('abc')
    expect(body.get('code_verifier')).toBeTruthy()

    expect(replaced.at(-1)).toBe('/#mantem') // ?code&state removidos, hash preservado
    expect(sessionStorage.getItem('bajeiros:auth:verifier')).toBeNull()
    expect(sessionStorage.getItem('bajeiros:auth:state')).toBeNull()
  })

  it('handleCallback rejeita state divergente sem chamar o token endpoint', async () => {
    const client = createAuthClient(CFG)
    await client.login()
    setUrl('?code=abc&state=OUTRO')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect(await client.handleCallback()).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('handleCallback devolve null sem params (aba nova sem verifier)', async () => {
    const client = createAuthClient(CFG)
    setUrl('')
    expect(await client.handleCallback()).toBeNull()
  })

  it('refresh usa o refresh_token e falha vira null (descarta sessão)', async () => {
    const client = createAuthClient(CFG)
    await client.login()
    setUrl(`?code=abc&state=${sessionStorage.getItem('bajeiros:auth:state')}`)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id_token: 'ID1', refresh_token: 'R1', expires_in: 3600 }),
      }),
    )
    await client.handleCallback()

    const refreshMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id_token: 'ID2', expires_in: 3600 }),
    })
    vi.stubGlobal('fetch', refreshMock)
    const tokens = await client.refresh()
    expect(tokens!.idToken).toBe('ID2')
    const body = refreshMock.mock.calls[0][1].body as URLSearchParams
    expect(body.get('grant_type')).toBe('refresh_token')
    expect(body.get('refresh_token')).toBe('R1')

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
    expect(await client.refresh()).toBeNull()
    expect(client.getIdToken()).toBeNull()
    expect(await client.refresh()).toBeNull() // refresh descartado, não insiste
  })

  it('logout limpa tokens e redireciona ao /logout', async () => {
    const client = createAuthClient(CFG)
    client.logout()
    const url = new URL(assigned[0])
    expect(url.pathname).toBe('/logout')
    expect(url.searchParams.get('client_id')).toBe('client123')
    expect(url.searchParams.get('logout_uri')).toBe('https://app.example/')
    expect(client.getIdToken()).toBeNull()
  })
})
