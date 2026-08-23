import { Hono } from 'hono'
import { createMiddleware } from 'hono/factory'
import { z } from 'zod'
import { withUser } from './db'
import { problem } from './problem'
import { clientIp } from './audit'
import type { AuthEnv } from './auth/middleware'

// DF-9 §3.2 — atividade por usuário autenticado (contracts/access-log.odcs.yaml).
// Anônimo não é registrado (rotas públicas ficam antes do requireAuth).

async function insertAccess(row: {
  userId: string
  method: string
  route: string
  path: string
  status?: number
  durationMs?: number
  ip?: string
}) {
  await withUser(row.userId, (db) =>
    db.query(
      `INSERT INTO access_log (user_id, method, route, path, status, duration_ms, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        row.userId,
        row.method,
        row.route.slice(0, 200),
        row.path.slice(0, 500),
        row.status ?? null,
        row.durationMs ?? null,
        row.ip ?? null,
      ],
    ),
  )
}

// Registra toda chamada de API autenticada. O insert roda após a resposta estar
// pronta e é aguardado (Lambda congela após o return — fire-and-forget perderia linhas);
// falha de log nunca derruba a requisição.
export const accessLog = createMiddleware<AuthEnv>(async (c, next) => {
  const started = Date.now()
  await next()
  const path = c.req.path
  if (path === '/api/v1/activity/pageview') return // a rota já grava a linha PAGE
  const auth = c.get('auth')
  if (!auth) return
  try {
    await insertAccess({
      userId: auth.sub,
      method: c.req.method,
      route: c.req.routePath || path,
      path,
      status: c.res.status,
      durationMs: Date.now() - started,
      ip: clientIp(c.req.raw.headers),
    })
  } catch (err) {
    console.error(
      JSON.stringify({ level: 'warn', msg: 'access_log falhou', err: (err as Error).message }),
    )
  }
})

const pageviewBody = z.object({ page: z.string().min(1).max(100) })

export const activity = new Hono<AuthEnv>()

// Pageview da SPA (landing, editor, painéis) — método lógico 'PAGE'.
activity.post('/pageview', async (c) => {
  const parsed = pageviewBody.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return problem(c, 400, 'Body inválido', parsed.error.message)
  const { sub } = c.get('auth')
  try {
    await insertAccess({
      userId: sub,
      method: 'PAGE',
      route: parsed.data.page,
      path: parsed.data.page,
      ip: clientIp(c.req.raw.headers),
    })
  } catch {
    // usuário ainda sem bootstrap (FK) ou banco fora — pageview é melhor esforço
  }
  return c.body(null, 204)
})
