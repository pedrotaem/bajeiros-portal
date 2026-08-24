import { createRemoteJWKSet, jwtVerify, SignJWT, type JWTVerifyGetKey } from 'jose'
import { env } from '../env'

export interface AuthClaims {
  sub: string
  email: string
  name: string
}

const devSecret = () => new TextEncoder().encode(env('DEV_JWT_SECRET'))

let jwks: JWTVerifyGetKey | undefined

// Testes injetam um createLocalJWKSet; undefined volta ao JWKS remoto do pool.
export function configureJwks(resolver: JWTVerifyGetKey | undefined): void {
  jwks = resolver
}

// AUTH_MODE=dev: HS256 c/ segredo local (claims idênticos aos do Cognito).
// AUTH_MODE=cognito: ID token RS256 validado contra o JWKS do User Pool —
// aud = client id (ID token; o access token do Cognito não traz email/name).
export async function verifyToken(token: string): Promise<AuthClaims> {
  if (env('AUTH_MODE') === 'cognito') {
    const issuer = env('COGNITO_ISSUER')
    jwks ??= createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`))
    const { payload } = await jwtVerify(token, jwks, {
      issuer,
      audience: env('COGNITO_CLIENT_ID'),
      clockTolerance: 60,
    })
    if (payload.token_use !== 'id') throw new Error('esperado ID token (token_use=id)')
    if (payload.email_verified !== true) throw new Error('e-mail não verificado')
    return {
      sub: String(payload.sub),
      email: String(payload.email ?? ''),
      name: String(payload.name ?? payload.email ?? ''),
    }
  }
  const { payload } = await jwtVerify(token, devSecret(), { issuer: 'bajeiros-dev' })
  return { sub: String(payload.sub), email: String(payload.email), name: String(payload.name) }
}

// Somente dev/testes — nunca exposto quando AUTH_MODE=cognito.
export async function signDevToken(claims: AuthClaims): Promise<string> {
  return new SignJWT({ email: claims.email, name: claims.name })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setIssuer('bajeiros-dev')
    .setExpirationTime('8h')
    .sign(devSecret())
}
