import { Hono } from 'hono'
import { env } from './env'
import { problem } from './problem'
import { requireAuth } from './auth/middleware'
import { devIssuer } from './auth/dev-issuer'
import { identity } from './modules/identity/routes'
import { projects } from './modules/projects/routes'
import { teams, invites } from './modules/teams/routes'
import { admin } from './modules/admin/routes'
import { assistant } from './modules/assistant/routes'
import { accessLog, activity } from './access-log'

export const app = new Hono()

// rotas públicas ANTES do middleware de auth
app.get('/api/v1/health', (c) => c.json({ ok: true, service: 'bajeiros-api' }))
if (env('AUTH_MODE') === 'dev') app.route('/api/v1/dev', devIssuer)

// assistente aceita anônimo (2 perguntas/dia) — auth opcional dentro do módulo,
// por isso montado ANTES do requireAuth global
app.route('/api/v1/assistant', assistant)

app.use('/api/v1/*', requireAuth)
app.use('/api/v1/*', accessLog) // DF-9: atividade por usuário (após auth)
app.route('/api/v1/me', identity)
app.route('/api/v1/projects', projects)
app.route('/api/v1/teams', teams)
app.route('/api/v1/invites', invites)
app.route('/api/v1/activity', activity)
app.route('/api/v1/admin', admin)

app.notFound((c) => problem(c, 404, 'Rota não encontrada'))
app.onError((err, c) => {
  console.error(JSON.stringify({ level: 'error', msg: err.message, path: c.req.path }))
  return problem(c, 500, 'Erro interno')
})
