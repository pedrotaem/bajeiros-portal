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

export interface AuthClient {
  login(appState?: Record<string, string>): Promise<void>
  hasCallbackParams(): boolean
  handleCallback(): Promise<{ tokens: AuthTokens; appState: Record<string, string> } | null>
  refresh(): Promise<AuthTokens | null>
  logout(): void
  getIdToken(): string | null
}

const KEY_VERIFIER = 'bajeiros:auth:verifier'
const KEY_STATE = 'bajeiros:auth:state'
const KEY_APP_STATE = 'bajeiros:auth:app-state'

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

  return {
    async login(appState = {}) {
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
      window.location.assign(`${domain}/oauth2/authorize?${params}`)
    },

    hasCallbackParams() {
      const q = new URLSearchParams(window.location.search)
      return q.has('code') && q.has('state')
    },

    async handleCallback() {
      const q = new URLSearchParams(window.location.search)
      const code = q.get('code')
      const state = q.get('state')
      const verifier = sessionStorage.getItem(KEY_VERIFIER)
      const expectedState = sessionStorage.getItem(KEY_STATE)
      const appStateRaw = sessionStorage.getItem(KEY_APP_STATE)
      sessionStorage.removeItem(KEY_VERIFIER)
      sessionStorage.removeItem(KEY_STATE)
      sessionStorage.removeItem(KEY_APP_STATE)

      // limpa ?code&state da URL mesmo em falha (não vazar em histórico/refer[r]er)
      q.delete('code')
      q.delete('state')
      const rest = q.toString()
      window.history.replaceState(
        null,
        '',
        window.location.pathname + (rest ? `?${rest}` : '') + window.location.hash,
      )

      if (!code || !state || !verifier || state !== expectedState) return null

      const tokens = await exchangeToken(
        new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: cfg.clientId,
          redirect_uri: cfg.redirectUri,
          code,
          code_verifier: verifier,
        }),
      )
      if (!tokens) return null

      let appState: Record<string, string> = {}
      try {
        appState = appStateRaw ? (JSON.parse(appStateRaw) as Record<string, string>) : {}
      } catch {
        appState = {}
      }
      return { tokens, appState }
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
