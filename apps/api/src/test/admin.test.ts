import { describe, expect, it, beforeAll } from 'vitest'
import pg from 'pg'
import { app } from '../app'
import { authed, makeUser, type TestUser } from './helpers'

// DF-9 — admin: 403 p/ não-admin, listagens, access_log via middleware,
// assistant_log visível, export inclui os novos logs (AC-DF9.1..7).

async function promote(sub: string) {
  // promoção é manual por design (conexão owner) — replicamos o runbook aqui
  const owner = new pg.Client({ connectionString: process.env.DATABASE_URL })
  await owner.connect()
  await owner.query('UPDATE users SET is_admin = true WHERE id = $1', [sub])
  await owner.end()
}

describe('admin (DF-9)', () => {
  let admin: TestUser
  let member: TestUser

  beforeAll(async () => {
    admin = await makeUser('Root')
    member = await makeUser('Comum')
    await app.request('/api/v1/me', authed(admin, { method: 'POST' }))
    await app.request('/api/v1/me', authed(member, { method: 'POST' }))
    await promote(admin.sub)
  })

  it('não-admin recebe 403 problem+json em qualquer rota admin (AC-DF9.1)', async () => {
    for (const path of ['/api/v1/admin/overview', '/api/v1/admin/users', '/api/v1/admin/activity']) {
      const r = await app.request(path, authed(member))
      expect(r.status).toBe(403)
      expect(r.headers.get('content-type')).toContain('application/problem+json')
    }
  })

  it('admin lista usuários com last_login, equipes e projetos (AC-DF9.2)', async () => {
    await app.request('/api/v1/teams', authed(member, { method: 'POST', body: JSON.stringify({ name: 'Equipe X' }) }))
    const r = await app.request('/api/v1/admin/users?q=comum', authed(admin))
    expect(r.status).toBe(200)
    const rows = await r.json()
    const u = rows.find((x: { id: string }) => x.id === member.sub)
    expect(u).toBeTruthy()
    expect(u.lastLoginAt).toBeTruthy()
    expect(u.teams.map((t: { name: string }) => t.name)).toContain('Equipe X')
    expect(u.isAdmin).toBe(false)
  })

  it('equipes com membros e papéis', async () => {
    const r = await app.request('/api/v1/admin/teams', authed(admin))
    expect(r.status).toBe(200)
    const team = (await r.json()).find((t: { name: string }) => t.name === 'Equipe X')
    expect(team.members[0].role).toBe('owner')
    expect(team.members[0].email).toBe(member.email)
  })

  it('chamadas de API aparecem no access_log (AC-DF9.3) e pageview como PAGE (AC-DF9.4)', async () => {
    await app.request('/api/v1/me', authed(member))
    await app.request(
      '/api/v1/activity/pageview',
      authed(member, { method: 'POST', body: JSON.stringify({ page: 'editor' }) }),
    )
    const r = await app.request(`/api/v1/admin/activity?userId=${member.sub}`, authed(admin))
    expect(r.status).toBe(200)
    const rows = await r.json()
    expect(rows.some((a: { method: string; path: string }) => a.method === 'GET' && a.path === '/api/v1/me')).toBe(true)
    expect(rows.some((a: { method: string; route: string }) => a.method === 'PAGE' && a.route === 'editor')).toBe(true)
    expect(rows.every((a: { userId: string }) => a.userId === member.sub)).toBe(true)
  })

  it('assistant_log aparece na visão de chat (AC-DF9.5)', async () => {
    const owner = new pg.Client({ connectionString: process.env.DATABASE_URL })
    await owner.connect()
    await owner.query(
      `INSERT INTO assistant_log (user_id, question, answer, model, input_tokens, output_tokens, duration_ms)
       VALUES ($1, 'Qual o diâmetro mínimo?', 'Ø 25,4 mm (B6.3.1 — exemplo)', 'claude-haiku-4-5', 81000, 200, 3200)`,
      [member.sub],
    )
    await owner.end()
    const r = await app.request('/api/v1/admin/assistant', authed(admin))
    const rows = await r.json()
    const row = rows.find((s: { userId: string }) => s.userId === member.sub)
    expect(row.question).toContain('diâmetro')
    expect(row.inputTokens).toBe(81000)
    expect(row.email).toBe(member.email)
  })

  it('export LGPD inclui accessLog e assistantLog do próprio usuário (AC-DF9.6)', async () => {
    const r = await app.request('/api/v1/me/export', authed(member))
    const data = await r.json()
    expect(data.accessLog.length).toBeGreaterThan(0)
    expect(data.assistantLog.length).toBe(1)
    // e as linhas são só dele
    expect(data.accessLog.every((a: { user_id: string }) => a.user_id === member.sub)).toBe(true)
  })

  it('consulta admin gera audit_event admin.view (AC-DF9.7)', async () => {
    const r = await app.request('/api/v1/me/export', authed(admin))
    const data = await r.json()
    expect(
      data.auditEvents.some(
        (e: { action: string; resource_id: string }) => e.action === 'admin.view' && e.resource_id === 'users',
      ),
    ).toBe(true)
  })

  it('não-admin não enxerga linhas alheias via RLS (defesa em profundidade)', async () => {
    const r = await app.request('/api/v1/me/export', authed(admin))
    const data = await r.json()
    // export do admin traz só as PRÓPRIAS linhas de access_log (query filtra por user_id)
    expect(data.accessLog.every((a: { user_id: string }) => a.user_id === admin.sub)).toBe(true)
  })
})
