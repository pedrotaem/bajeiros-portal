import { Hono } from 'hono'
import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import { signDevToken } from './jwt'
import { problem } from '../problem'

// "Cognito de mentira" p/ dev local: POST /api/v1/dev/token {email, name}
// devolve um Bearer válido. Montado apenas quando AUTH_MODE=dev.
export const devIssuer = new Hono()

const body = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  // sub fixo permite "logar de novo" como o mesmo usuário entre reinícios
  sub: z.string().uuid().optional(),
})

devIssuer.post('/token', async (c) => {
  const parsed = body.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return problem(c, 400, 'Body inválido', parsed.error.message)
  const { email, name, sub } = parsed.data
  const claims = { sub: sub ?? randomUUID(), email, name }
  return c.json({ token: await signDevToken(claims), claims })
})
