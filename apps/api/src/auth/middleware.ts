import { createMiddleware } from 'hono/factory'
import { verifyToken, type AuthClaims } from './jwt'
import { problem } from '../problem'

export type AuthEnv = { Variables: { auth: AuthClaims } }
// Rotas que aceitam anônimo (assistente): auth pode estar ausente.
export type OptionalAuthEnv = { Variables: { auth: AuthClaims | null } }

// Auth opcional: sem header → segue anônimo (auth = null); token presente mas
// inválido → 401 (não silenciar credencial quebrada como se fosse anônimo).
export const optionalAuth = createMiddleware<OptionalAuthEnv>(async (c, next) => {
  const header = c.req.header('Authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) {
    c.set('auth', null)
  } else {
    try {
      c.set('auth', await verifyToken(token))
    } catch {
      return problem(c, 401, 'Token inválido ou expirado')
    }
  }
  await next()
})

export const requireAuth = createMiddleware<AuthEnv>(async (c, next) => {
  const header = c.req.header('Authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return problem(c, 401, 'Não autenticado', 'Envie Authorization: Bearer <token>.')
  try {
    c.set('auth', await verifyToken(token))
  } catch {
    return problem(c, 401, 'Token inválido ou expirado')
  }
  await next()
})
