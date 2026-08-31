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

interface WindowStub {
  location: { search: string; hash: string; pathname: string; assign: (u: string) => void }
  history: { replaceState: (s: unknown, t: string, u: string) => void }
}

const globals = globalThis as unknown as {
  sessionStorage?: ReturnType<typeof makeStorage>
  window?: WindowStub
}

function setUrl(search: string, hash = '') {
  globals.window!.location.search = search
  globals.window!.location.hash = hash
}

beforeEach(() => {
  assigned = []
  replaced = []
  globals.sessionStorage = makeStorage()
  globals.window = {
    location: {
      search: '',
      hash: '',
      pathname: '/',
      assign: (u) => void assigned.push(u),
    },
    history: { replaceState: (_s, _t, u) => void replaced.push(u) },
  }
})

afterEach(() => {
  vi.restoreAllMocks()
  delete globals.sessionStorage
  delete globals.window
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
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') throw new Error('esperado ok')
    expect(result.tokens.idToken).toBe('ID.TOKEN')
    expect(result.appState).toEqual({ invite: 'tok123' })
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
    expect((await client.handleCallback()).status).toBe('none')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('handleCallback devolve none sem params (aba nova sem verifier)', async () => {
    const client = createAuthClient(CFG)
    setUrl('')
    expect((await client.handleCallback()).status).toBe('none')
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

  // ---------- DF-17: IdP social e erros no callback ----------

  it('login com identityProvider vai direto ao Google, sem passar pelo Managed Login', async () => {
    const client = createAuthClient(CFG)
    await client.login({}, { identityProvider: 'Google' })
    const p = new URL(assigned[0]).searchParams
    expect(p.get('identity_provider')).toBe('Google')
    expect(p.get('prompt')).toBe('select_account')
    expect(p.get('code_challenge_method')).toBe('S256')
  })

  it('login sem identityProvider não manda identity_provider nem prompt', async () => {
    const client = createAuthClient(CFG)
    await client.login()
    const p = new URL(assigned[0]).searchParams
    expect(p.has('identity_provider')).toBe(false)
    expect(p.has('prompt')).toBe(false)
  })

  it('hasCallbackParams reconhece o retorno de erro do provedor', async () => {
    const client = createAuthClient(CFG)
    setUrl('?error=access_denied&error_description=nope')
    expect(client.hasCallbackParams()).toBe(true)
  })

  it('callback com erro devolve o motivo, limpa a URL e não chama o token endpoint', async () => {
    const client = createAuthClient(CFG)
    await client.login({}, { identityProvider: 'Google' })
    setUrl('?error=access_denied&error_description=User%20cancelled')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const result = await client.handleCallback()
    expect(result.status).toBe('error')
    if (result.status !== 'error') throw new Error('esperado error')
    expect(result.message).toBe('Entrada cancelada no provedor.')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(replaced.at(-1)).toBe('/')
    expect(assigned).toHaveLength(1) // nenhuma reautorização
  })

  it('AliasExists (conta recém-vinculada) refaz o authorize uma vez, pelo mesmo IdP', async () => {
    const client = createAuthClient(CFG)
    await client.login({ invite: 'tok123' }, { identityProvider: 'Google' })
    setUrl('?error=invalid_request&error_description=Already+found+an+entry+for+username+google_1')

    const result = await client.handleCallback()
    expect(result.status).toBe('retrying')
    expect(assigned).toHaveLength(2)
    const p = new URL(assigned[1]).searchParams
    expect(p.get('identity_provider')).toBe('Google')
    // o convite pendente sobrevive à reautorização
    expect(sessionStorage.getItem('bajeiros:auth:app-state')).toBe('{"invite":"tok123"}')
  })

  it('AliasExists duas vezes seguidas vira erro — sem laço de redirect', async () => {
    const client = createAuthClient(CFG)
    await client.login({}, { identityProvider: 'Google' })
    const erro = '?error=invalid_request&error_description=Already+found+an+entry+for+username+g_1'
    setUrl(erro)
    expect((await client.handleCallback()).status).toBe('retrying')
    setUrl(erro)

    const result = await client.handleCallback()
    expect(result.status).toBe('error')
    expect(assigned).toHaveLength(2) // login + 1 retentativa, nada além
  })

  it('entrada bem-sucedida rearma a sentinela p/ uma vinculação futura', async () => {
    const client = createAuthClient(CFG)
    await client.login({}, { identityProvider: 'Google' })
    setUrl('?error=invalid_request&error_description=Already+found+an+entry+for+username+g_1')
    await client.handleCallback()
    expect(sessionStorage.getItem('bajeiros:auth:link-retry')).toBe('1')

    setUrl(`?code=abc&state=${sessionStorage.getItem('bajeiros:auth:state')}`)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id_token: 'ID.TOKEN', expires_in: 3600 }),
      }),
    )
    expect((await client.handleCallback()).status).toBe('ok')
    expect(sessionStorage.getItem('bajeiros:auth:link-retry')).toBeNull()
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
