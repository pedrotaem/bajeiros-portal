import { describe, expect, it, beforeAll } from 'vitest'
import { templateCage } from '@bajeiros/core/model/template'
import { app } from '../app'
import { authed, makeUser, type TestUser } from './helpers'

// Isolamento entre tenants = GATE DO M1 (revisão v2, C12).
describe('RLS — isolamento entre usuários', () => {
  let ana: TestUser
  let beto: TestUser
  let anaProjectId: string

  beforeAll(async () => {
    ana = await makeUser('Ana')
    beto = await makeUser('Beto')
    await app.request('/api/v1/me', authed(ana, { method: 'POST' }))
    await app.request('/api/v1/me', authed(beto, { method: 'POST' }))
    const r = await app.request(
      '/api/v1/projects',
      authed(ana, { method: 'POST', body: JSON.stringify({ name: 'MBF-29' }) }),
    )
    anaProjectId = (await r.json()).id
  })

  it('projeto de A não aparece na lista de B', async () => {
    const list = await (await app.request('/api/v1/projects', authed(beto))).json()
    expect(list.map((p: { id: string }) => p.id)).not.toContain(anaProjectId)
  })

  it('B não acessa projeto de A por id (nem sabe que existe → 404)', async () => {
    const r = await app.request(`/api/v1/projects/${anaProjectId}`, authed(beto))
    expect(r.status).toBe(404)
  })

  it('B não altera nem deleta projeto de A', async () => {
    const patch = await app.request(
      `/api/v1/projects/${anaProjectId}`,
      authed(beto, { method: 'PATCH', body: JSON.stringify({ name: 'hack' }) }),
    )
    expect(patch.status).toBe(404)
    const del = await app.request(
      `/api/v1/projects/${anaProjectId}`,
      authed(beto, { method: 'DELETE' }),
    )
    expect(del.status).toBe(404)
  })

  it('B não salva snapshot em projeto de A', async () => {
    const r = await app.request(
      `/api/v1/projects/${anaProjectId}/snapshots`,
      authed(beto, {
        method: 'POST',
        body: JSON.stringify({ cage: templateCage, expectedSeq: 0 }),
      }),
    )
    expect(r.status).toBe(404)
  })

  it('snapshot valida com o motor B6 e guarda o resultado', async () => {
    const r = await app.request(
      `/api/v1/projects/${anaProjectId}/snapshots`,
      authed(ana, { method: 'POST', body: JSON.stringify({ cage: templateCage, expectedSeq: 0 }) }),
    )
    expect(r.status).toBe(201)
    const body = await r.json()
    expect(body.seq).toBe(1)
    expect(typeof body.rulesFailCount).toBe('number')
  })

  it('lock otimista: expectedSeq defasado → 409 com seq atual', async () => {
    const r = await app.request(
      `/api/v1/projects/${anaProjectId}/snapshots`,
      authed(ana, { method: 'POST', body: JSON.stringify({ cage: templateCage, expectedSeq: 0 }) }),
    )
    expect(r.status).toBe(409)
    expect((await r.json()).currentSeq).toBe(1)
  })

  it('gaiola que o motor não entende → 422', async () => {
    const r = await app.request(
      `/api/v1/projects/${anaProjectId}/snapshots`,
      authed(ana, {
        method: 'POST',
        body: JSON.stringify({ cage: { lixo: true }, expectedSeq: 1 }),
      }),
    )
    expect(r.status).toBe(422)
  })

  it('entitlement free: 3º projeto → 403 problem+json', async () => {
    await app.request(
      '/api/v1/projects',
      authed(ana, { method: 'POST', body: JSON.stringify({ name: 'Projeto 2' }) }),
    )
    const r = await app.request(
      '/api/v1/projects',
      authed(ana, { method: 'POST', body: JSON.stringify({ name: 'Projeto 3' }) }),
    )
    expect(r.status).toBe(403)
    expect((await r.json()).entitlement).toBe('max_projects')
  })

  it('export de B não vaza dados de A', async () => {
    const data = await (await app.request('/api/v1/me/export', authed(beto))).json()
    expect(data.projects.map((p: { id: string }) => p.id)).not.toContain(anaProjectId)
    expect(data.user.id).toBe(beto.sub)
  })
})
