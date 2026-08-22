import { Hono } from 'hono'
import { env } from './env'
import { problem } from './problem'
import { requireAuth } from './auth/middleware'
import { devIssuer } from './auth/dev-issuer'
import { identity } from './modules/identity/routes'
import { projects } from './modules/projects/routes'

export const app = new Hono()

// rotas públicas ANTES do middleware de auth
app.get('/api/v1/health', (c) => c.json({ ok: true, service: 'bajeiros-api' }))
if (env('AUTH_MODE') === 'dev') app.route('/api/v1/dev', devIssuer)

app.use('/api/v1/*', requireAuth)
app.route('/api/v1/me', identity)
app.route('/api/v1/projects', projects)

app.notFound((c) => problem(c, 404, 'Rota não encontrada'))
app.onError((err, c) => {
  console.error(JSON.stringify({ level: 'error', msg: err.message, path: c.req.path }))
  return problem(c, 500, 'Erro interno')
})
