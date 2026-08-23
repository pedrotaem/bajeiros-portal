import { Hono } from 'hono'
import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { signDevToken } from './jwt'
import { env } from '../env'
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

// Cognito real tem sub estável por conta; aqui, se o e-mail já existe, reusamos o id
// (senão um browser sem o mapeamento local geraria sub novo → e-mail duplicado no /me).
// Lookup via conexão owner: RLS impede a role da app de achar usuário por e-mail — dev only.
async function existingSubFor(email: string): Promise<string | undefined> {
  const client = new pg.Client({ connectionString: env('DATABASE_URL') })
  try {
    await client.connect()
    const r = await client.query('SELECT id FROM users WHERE email = $1', [email])
    return r.rows[0]?.id
  } catch {
    return undefined
  } finally {
    await client.end().catch(() => {})
  }
}

devIssuer.post('/token', async (c) => {
  const parsed = body.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return problem(c, 400, 'Body inválido', parsed.error.message)
  const { email, name, sub } = parsed.data
  const claims = { sub: sub ?? (await existingSubFor(email)) ?? randomUUID(), email, name }
  return c.json({ token: await signDevToken(claims), claims })
})
