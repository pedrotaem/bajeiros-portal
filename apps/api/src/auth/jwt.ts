import { createRemoteJWKSet, jwtVerify, SignJWT } from 'jose'
import { env } from '../env'

export interface AuthClaims {
  sub: string
  email: string
  name: string
}

const devSecret = () => new TextEncoder().encode(env('DEV_JWT_SECRET'))

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined

// AUTH_MODE=dev: HS256 c/ segredo local (claims idênticos aos do Cognito).
// AUTH_MODE=cognito: RS256 validado contra o JWKS do User Pool.
export async function verifyToken(token: string): Promise<AuthClaims> {
  if (env('AUTH_MODE') === 'cognito') {
    const issuer = env('COGNITO_ISSUER')
    jwks ??= createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`))
    const { payload } = await jwtVerify(token, jwks, { issuer })
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
