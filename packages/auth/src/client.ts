// Cliente do Cognito Managed Login: authorization code + PKCE via redirect.
// Tokens SÓ em memória (plano v2, 12.4); verifier/state/appState em sessionStorage
// apenas durante o roundtrip do redirect (removidos no callback).

import { codeChallengeS256, generateCodeVerifier, randomState } from './pkce'

export interface CognitoAuthConfig {
  domain: string // https://<prefix>.auth.<região>.amazoncognito.com (sem barra final)
  clientId: string
  redirectUri: string
  logoutUri: string
  scopes?: string[]
}

export interface AuthTokens {
  idToken: string
  expiresAt: number // epoch ms
}

export interface LoginOptions {
  // Nome do IdP no pool (DF-17: 'Google'). Ausente = tela do Managed Login.
  identityProvider?: string
}

// `retrying` só acontece na 1ª entrada por Google de quem já tinha conta local: a
// vinculação (trigger PreSignUp) acabou de ser feita e o Cognito devolveu
// AliasExists — refazemos o authorize uma única vez, sem UI (DF-17 §3.4).
export type CallbackOutcome =
  | { status: 'ok'; tokens: AuthTokens; appState: Record<string, string> }
  | { status: 'error'; message: string }
  | { status: 'retrying' }
  | { status: 'none' }

export interface AuthClient {
  login(appState?: Record<string, string>, options?: LoginOptions): Promise<void>
  hasCallbackParams(): boolean
  handleCallback(): Promise<CallbackOutcome>
  refresh(): Promise<AuthTokens | null>
  logout(): void
  getIdToken(): string | null
}

const KEY_VERIFIER = 'bajeiros:auth:verifier'
const KEY_STATE = 'bajeiros:auth:state'
const KEY_APP_STATE = 'bajeiros:auth:app-state'
const KEY_LINK_RETRY = 'bajeiros:auth:link-retry'
const KEY_IDP = 'bajeiros:auth:idp'

// Erro do Cognito logo depois de AdminLinkProviderForUser; a 2ª tentativa passa.
const ALIAS_EXISTS = /Already found an entry for username/i

// O Cognito devolve erro em inglês; os casos que a pessoa provoca ganham texto nosso.
function describeError(error: string, description: string | null): string {
  if (error === 'access_denied') return 'Entrada cancelada no provedor.'
  if (description?.startsWith('Google Error')) {
    return 'O Google recusou a entrada. Tente de novo em instantes.'
  }
  return description ?? `Falha na entrada (${error}).`
}

interface TokenResponse {
  id_token?: string
  refresh_token?: string
  expires_in?: number
}

export function createAuthClient(cfg: CognitoAuthConfig): AuthClient {
  const domain = cfg.domain.replace(/\/$/, '')
  const scopes = cfg.scopes ?? ['openid', 'email', 'profile']

  let idToken: string | null = null
  let refreshToken: string | null = null

  async function exchangeToken(body: URLSearchParams): Promise<AuthTokens | null> {
    const res = await fetch(`${domain}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
    if (!res.ok) return null
    const data = (await res.json()) as TokenResponse
    if (!data.id_token) return null
    idToken = data.id_token
    if (data.refresh_token) refreshToken = data.refresh_token
    return { idToken: data.id_token, expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 }
  }

  async function authorize(
    appState: Record<string, string>,
    options: LoginOptions = {},
  ): Promise<void> {
    const verifier = generateCodeVerifier()
    const state = randomState()
    sessionStorage.setItem(KEY_VERIFIER, verifier)
    sessionStorage.setItem(KEY_STATE, state)
    sessionStorage.setItem(KEY_APP_STATE, JSON.stringify(appState))
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: cfg.clientId,
      redirect_uri: cfg.redirectUri,
      scope: scopes.join(' '),
      state,
      code_challenge: await codeChallengeS256(verifier),
      code_challenge_method: 'S256',
    })
    if (options.identityProvider) {
      params.set('identity_provider', options.identityProvider)
      // quem tem mais de uma conta no navegador escolhe qual usar
      params.set('prompt', 'select_account')
      // guardado p/ a reautorização do AliasExists voltar pelo mesmo provedor
      sessionStorage.setItem(KEY_IDP, options.identityProvider)
    } else {
      sessionStorage.removeItem(KEY_IDP)
    }
    window.location.assign(`${domain}/oauth2/authorize?${params}`)
  }

  return {
    login(appState = {}, options = {}) {
      return authorize(appState, options)
    },

    hasCallbackParams() {
      const q = new URLSearchParams(window.location.search)
      return (q.has('code') && q.has('state')) || q.has('error')
    },

    async handleCallback() {
      const q = new URLSearchParams(window.location.search)
      const code = q.get('code')
      const state = q.get('state')
      const error = q.get('error')
      const errorDescription = q.get('error_description')
      const verifier = sessionStorage.getItem(KEY_VERIFIER)
      const expectedState = sessionStorage.getItem(KEY_STATE)
      const appStateRaw = sessionStorage.getItem(KEY_APP_STATE)
      const identityProvider = sessionStorage.getItem(KEY_IDP) ?? undefined
      sessionStorage.removeItem(KEY_VERIFIER)
      sessionStorage.removeItem(KEY_STATE)
      sessionStorage.removeItem(KEY_APP_STATE)
      sessionStorage.removeItem(KEY_IDP)

      // limpa code/state/error da URL mesmo em falha (não vazar em histórico/refer[r]er)
      for (const key of ['code', 'state', 'error', 'error_description']) q.delete(key)
      const rest = q.toString()
      window.history.replaceState(
        null,
        '',
        window.location.pathname + (rest ? `?${rest}` : '') + window.location.hash,
      )

      let appState: Record<string, string> = {}
      try {
        appState = appStateRaw ? (JSON.parse(appStateRaw) as Record<string, string>) : {}
      } catch {
        appState = {}
      }

      if (error) {
        // Vinculação recém-feita pela trigger PreSignUp: uma única reautorização,
        // sem UI. A sentinela impede laço se o erro insistir.
        if (ALIAS_EXISTS.test(errorDescription ?? '') && !sessionStorage.getItem(KEY_LINK_RETRY)) {
          sessionStorage.setItem(KEY_LINK_RETRY, '1')
          await authorize(appState, { identityProvider })
          return { status: 'retrying' as const }
        }
        return { status: 'error' as const, message: describeError(error, errorDescription) }
      }

      if (!code || !state || !verifier || state !== expectedState) {
        return { status: 'none' as const }
      }

      const tokens = await exchangeToken(
        new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: cfg.clientId,
          redirect_uri: cfg.redirectUri,
          code,
          code_verifier: verifier,
        }),
      )
      if (!tokens) {
        return { status: 'error' as const, message: 'Não foi possível concluir a entrada.' }
      }
      sessionStorage.removeItem(KEY_LINK_RETRY)
      return { status: 'ok' as const, tokens, appState }
    },

    async refresh() {
      if (!refreshToken) return null
      const tokens = await exchangeToken(
        new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: cfg.clientId,
          refresh_token: refreshToken,
        }),
      )
      if (!tokens) {
        // refresh inválido/revogado — descarta p/ não insistir
        refreshToken = null
        idToken = null
      }
      return tokens
    },

    logout() {
      idToken = null
      refreshToken = null
      const params = new URLSearchParams({ client_id: cfg.clientId, logout_uri: cfg.logoutUri })
      window.location.assign(`${domain}/logout?${params}`)
    },

    getIdToken() {
      return idToken
    },
  }
}
