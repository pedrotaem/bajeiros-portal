import { createMiddleware } from 'hono/factory'
import { verifyToken, type AuthClaims } from './jwt'
import { problem } from '../problem'

export type AuthEnv = { Variables: { auth: AuthClaims } }
/**
 * Ambiente em que `auth` PODE estar ausente. Sobrou para o `accessLog`, que roda em
 * rotas já autenticadas mas guarda a checagem.
 *
 * DF-28: o middleware `optionalAuth` que povoava isto foi REMOVIDO junto com a
 * degustação anônima do assistente — nenhuma rota aceita anônimo. Middleware de auth
 * frouxo sem call site é convite a montar uma rota com ele por engano.
 */
export type OptionalAuthEnv = { Variables: { auth: AuthClaims | null } }

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
