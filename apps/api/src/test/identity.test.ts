import { describe, expect, it } from 'vitest'
import { app } from '../app'
import { authed, makeUser } from './helpers'

describe('identity (fase 12 — usuários + LGPD)', () => {
  it('bootstrap é idempotente e cria o usuário a partir do token', async () => {
    const u = await makeUser('Ana')
    const r1 = await app.request('/api/v1/me', authed(u, { method: 'POST' }))
    expect(r1.status).toBe(200)
    const body1 = await r1.json()
    expect(body1.id).toBe(u.sub)
    expect(body1.email).toBe(u.email)

    const r2 = await app.request('/api/v1/me', authed(u, { method: 'POST' }))
    expect((await r2.json()).id).toBe(u.sub)
  })

  it('bootstrap com e-mail de outra conta (sub novo) → 409, não 500', async () => {
    const u1 = await makeUser('Carla')
    await app.request('/api/v1/me', authed(u1, { method: 'POST' }))
    // mesmo e-mail, sub diferente — ex.: conta dev antiga × sub novo do Cognito
    const { randomUUID } = await import('node:crypto')
    const { signDevToken } = await import('../auth/jwt')
    const sub2 = randomUUID()
    const u2 = { sub: sub2, email: u1.email, name: u1.name, token: '' }
    u2.token = await signDevToken({ sub: sub2, email: u1.email, name: u1.name })
    const r = await app.request('/api/v1/me', authed(u2, { method: 'POST' }))
    expect(r.status).toBe(409)
    expect(r.headers.get('content-type')).toContain('problem+json')
    expect((await r.json()).title).toBe('E-mail já cadastrado')
  })

  it('GET /me sem bootstrap → 404 problem+json', async () => {
    const u = await makeUser('Novo')
    const r = await app.request('/api/v1/me', authed(u))
    expect(r.status).toBe(404)
    expect(r.headers.get('content-type')).toContain('application/problem+json')
  })

  it('sem token → 401', async () => {
    const r = await app.request('/api/v1/me')
    expect(r.status).toBe(401)
  })

  it('PATCH atualiza perfil', async () => {
    const u = await makeUser('Bia')
    await app.request('/api/v1/me', authed(u, { method: 'POST' }))
    const r = await app.request(
      '/api/v1/me',
      authed(u, { method: 'PATCH', body: JSON.stringify({ university: 'FEI' }) }),
    )
    expect((await r.json()).university).toBe('FEI')
  })

  it('consentimento é append-only: revogação = novo registro', async () => {
    const u = await makeUser('Caio')
    await app.request('/api/v1/me', authed(u, { method: 'POST' }))
    const grant = await app.request(
      '/api/v1/me/consents',
      authed(u, {
        method: 'POST',
        body: JSON.stringify({ purpose: 'marketing_email', granted: true, termVersion: 'v1' }),
      }),
    )
    expect(grant.status).toBe(201)
    await app.request(
      '/api/v1/me/consents',
      authed(u, {
        method: 'POST',
        body: JSON.stringify({ purpose: 'marketing_email', granted: false, termVersion: 'v1' }),
      }),
    )
    const list = await (await app.request('/api/v1/me/consents', authed(u))).json()
    expect(list).toHaveLength(2)
    expect(list[0].granted).toBe(false) // mais recente primeiro
  })

  it('export (portabilidade) traz dados e registra auditoria', async () => {
    const u = await makeUser('Duda')
    await app.request('/api/v1/me', authed(u, { method: 'POST' }))
    const r = await app.request('/api/v1/me/export', authed(u))
    const data = await r.json()
    expect(data.user.id).toBe(u.sub)
    expect(Array.isArray(data.auditEvents)).toBe(true)
    const actions = data.auditEvents.map((e: { action: string }) => e.action)
    expect(actions).toContain('user.bootstrap')
  })

  it('exclusão é soft delete: some do GET, bootstrap responde 410', async () => {
    const u = await makeUser('Eva')
    await app.request('/api/v1/me', authed(u, { method: 'POST' }))
    const del = await app.request('/api/v1/me', authed(u, { method: 'DELETE' }))
    expect(del.status).toBe(204)
    expect((await app.request('/api/v1/me', authed(u))).status).toBe(404)
    expect((await app.request('/api/v1/me', authed(u, { method: 'POST' }))).status).toBe(410)
  })
})
