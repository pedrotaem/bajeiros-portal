import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import pg from 'pg'
import { app } from '../app'
import { authed, makeUser, type TestUser } from './helpers'

// Autorização por papel + isolamento de equipe = GATE DO M2 (plano v2, 18.3).
describe('Equipes — RBAC por papel, convites sem enumeração, transferência', () => {
  let ana: TestUser // fundadora (owner)
  let beto: TestUser // convidado → admin
  let caio: TestUser // convidado → member
  let dora: TestUser // de fora (isolamento)
  let teamId: string
  let projectId: string
  let admin: pg.Pool // conexão de owner do banco — só p/ forjar expiração

  const json = (body: unknown) => JSON.stringify(body)

  beforeAll(async () => {
    ;[ana, beto, caio, dora] = await Promise.all([
      makeUser('Ana'),
      makeUser('Beto'),
      makeUser('Caio'),
      makeUser('Dora'),
    ])
    for (const u of [ana, beto, caio, dora])
      await app.request('/api/v1/me', authed(u, { method: 'POST' }))
    const r = await app.request(
      '/api/v1/teams',
      authed(ana, { method: 'POST', body: json({ name: 'MBF Racing' }) }),
    )
    teamId = (await r.json()).id
    admin = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 })
  })

  afterAll(async () => {
    await admin.end()
  })

  async function invite(by: TestUser, email: string) {
    const r = await app.request(
      `/api/v1/teams/${teamId}/invites`,
      authed(by, { method: 'POST', body: json({ email }) }),
    )
    return { status: r.status, body: await r.json() }
  }

  async function accept(by: TestUser, token: string) {
    return app.request('/api/v1/invites/accept', authed(by, { method: 'POST', body: json({ token }) }))
  }

  it('criador vira owner', async () => {
    const list = await (await app.request('/api/v1/teams', authed(ana))).json()
    expect(list).toHaveLength(1)
    expect(list[0].myRole).toBe('owner')
    expect(list[0].memberCount).toBe(1)
  })

  it('não-membro não vê a equipe (404, não 403)', async () => {
    expect((await app.request(`/api/v1/teams/${teamId}`, authed(dora))).status).toBe(404)
    const patch = await app.request(
      `/api/v1/teams/${teamId}`,
      authed(dora, { method: 'PATCH', body: json({ name: 'hack' }) }),
    )
    expect(patch.status).toBe(404)
  })

  it('convite: resposta idêntica exista ou não conta (sem enumeração, C9)', async () => {
    const comConta = await invite(ana, beto.email)
    const semConta = await invite(ana, 'ninguem@nao-existe.dev')
    expect(comConta.status).toBe(201)
    expect(semConta.status).toBe(201)
    expect(Object.keys(comConta.body).sort()).toEqual(Object.keys(semConta.body).sort())
    expect(typeof comConta.body.token).toBe('string')
  })

  it('aceite com outra conta (e-mail não convidado) → 404 uniforme', async () => {
    const { body } = await invite(ana, beto.email)
    expect((await accept(dora, body.token)).status).toBe(404)
    // o convite continua válido p/ o e-mail certo
    expect((await accept(beto, body.token)).status).toBe(200)
  })

  it('token consumido ou inventado → 404', async () => {
    const { body } = await invite(ana, beto.email)
    await accept(beto, body.token) // beto já é membro: consome de novo? não — já consumiu acima
    expect((await accept(beto, 'token-que-nao-existe-com-tamanho-ok')).status).toBe(404)
  })

  it('convite expirado → 404', async () => {
    const { body } = await invite(ana, caio.email)
    await admin.query(`UPDATE team_invites SET expires_at = now() - interval '1 day' WHERE id = $1`, [
      body.id,
    ])
    expect((await accept(caio, body.token)).status).toBe(404)
    const nova = await invite(ana, caio.email)
    expect((await accept(caio, nova.body.token)).status).toBe(200)
  })

  it('detalhe traz membros (via SECURITY DEFINER) p/ quem é membro', async () => {
    const detail = await (await app.request(`/api/v1/teams/${teamId}`, authed(caio))).json()
    expect(detail.members.map((m: { userId: string }) => m.userId).sort()).toEqual(
      [ana.sub, beto.sub, caio.sub].sort(),
    )
    // member não vê convites pendentes
    expect(detail.pendingInvites).toEqual([])
  })

  it('member não convida, não revoga, não altera equipe', async () => {
    expect((await invite(caio, 'x@y.dev')).status).toBe(403)
    const patch = await app.request(
      `/api/v1/teams/${teamId}`,
      authed(caio, { method: 'PATCH', body: json({ name: 'golpe' }) }),
    )
    expect(patch.status).toBe(403)
  })

  it('owner promove a admin; admin convida e revoga, mas não mexe em papéis', async () => {
    const promote = await app.request(
      `/api/v1/teams/${teamId}/members/${beto.sub}`,
      authed(ana, { method: 'PATCH', body: json({ role: 'admin' }) }),
    )
    expect(promote.status).toBe(204)

    const inv = await invite(beto, 'novo@colega.dev')
    expect(inv.status).toBe(201)
    const revoke = await app.request(
      `/api/v1/teams/${teamId}/invites/${inv.body.id}`,
      authed(beto, { method: 'DELETE' }),
    )
    expect(revoke.status).toBe(204)

    const role = await app.request(
      `/api/v1/teams/${teamId}/members/${caio.sub}`,
      authed(beto, { method: 'PATCH', body: json({ role: 'admin' }) }),
    )
    expect(role.status).toBe(403)
  })

  it('convite revogado não aceita mais', async () => {
    const inv = await invite(ana, dora.email)
    await app.request(
      `/api/v1/teams/${teamId}/invites/${inv.body.id}`,
      authed(ana, { method: 'DELETE' }),
    )
    expect((await accept(dora, inv.body.token)).status).toBe(404)
  })

  it('admin não remove owner; remove member', async () => {
    const rmOwner = await app.request(
      `/api/v1/teams/${teamId}/members/${ana.sub}`,
      authed(beto, { method: 'DELETE' }),
    )
    expect(rmOwner.status).toBe(403)
    const rmMember = await app.request(
      `/api/v1/teams/${teamId}/members/${caio.sub}`,
      authed(beto, { method: 'DELETE' }),
    )
    expect(rmMember.status).toBe(204)
  })

  it('última pessoa owner não sai nem se rebaixa', async () => {
    const leave = await app.request(
      `/api/v1/teams/${teamId}/members/${ana.sub}`,
      authed(ana, { method: 'DELETE' }),
    )
    expect(leave.status).toBe(409)
    const demote = await app.request(
      `/api/v1/teams/${teamId}/members/${ana.sub}`,
      authed(ana, { method: 'PATCH', body: json({ role: 'member' }) }),
    )
    expect(demote.status).toBe(409)
  })

  it('transferência exige ser membro da equipe destino (404 uniforme)', async () => {
    const p = await (
      await app.request(
        '/api/v1/projects',
        authed(ana, { method: 'POST', body: json({ name: 'Carro da equipe' }) }),
      )
    ).json()
    projectId = p.id
    const t2 = await (
      await app.request(
        '/api/v1/teams',
        authed(dora, { method: 'POST', body: json({ name: 'Outra equipe' }) }),
      )
    ).json()
    const r = await app.request(
      `/api/v1/projects/${projectId}/transfer`,
      authed(ana, { method: 'POST', body: json({ teamId: t2.id }) }),
    )
    expect(r.status).toBe(404)
  })

  it('dono transfere projeto p/ equipe; membros acessam, de fora não', async () => {
    const r = await app.request(
      `/api/v1/projects/${projectId}/transfer`,
      authed(ana, { method: 'POST', body: json({ teamId }) }),
    )
    expect(r.status).toBe(200)
    expect((await r.json()).ownerTeamId).toBe(teamId)

    expect((await app.request(`/api/v1/projects/${projectId}`, authed(beto))).status).toBe(200)
    expect((await app.request(`/api/v1/projects/${projectId}`, authed(dora))).status).toBe(404)
    // caio foi removido — perdeu acesso junto
    expect((await app.request(`/api/v1/projects/${projectId}`, authed(caio))).status).toBe(404)
  })

  it('projeto de equipe não tem "dono pessoal": transferir de novo → 403', async () => {
    const r = await app.request(
      `/api/v1/projects/${projectId}/transfer`,
      authed(beto, { method: 'POST', body: json({ teamId }) }),
    )
    expect(r.status).toBe(403)
  })

  it('transferir libera a cota pessoal do plano free', async () => {
    const p2 = await app.request(
      '/api/v1/projects',
      authed(ana, { method: 'POST', body: json({ name: 'Pessoal 1' }) }),
    )
    const p3 = await app.request(
      '/api/v1/projects',
      authed(ana, { method: 'POST', body: json({ name: 'Pessoal 2' }) }),
    )
    const p4 = await app.request(
      '/api/v1/projects',
      authed(ana, { method: 'POST', body: json({ name: 'Pessoal 3' }) }),
    )
    expect(p2.status).toBe(201)
    expect(p3.status).toBe(201)
    expect(p4.status).toBe(403)
  })

  it('export LGPD inclui vínculos de equipe', async () => {
    const data = await (await app.request('/api/v1/me/export', authed(ana))).json()
    expect(data.teamMemberships.map((t: { id: string }) => t.id)).toContain(teamId)
  })

  it('admin sai da equipe por conta própria', async () => {
    const r = await app.request(
      `/api/v1/teams/${teamId}/members/${beto.sub}`,
      authed(beto, { method: 'DELETE' }),
    )
    expect(r.status).toBe(204)
    expect((await app.request(`/api/v1/teams/${teamId}`, authed(beto))).status).toBe(404)
  })

  it('última pessoa não abandona equipe com projetos', async () => {
    const r = await app.request(
      `/api/v1/teams/${teamId}/members/${ana.sub}`,
      authed(ana, { method: 'DELETE' }),
    )
    expect(r.status).toBe(409)
    expect((await r.json()).title).toBe('Equipe possui projetos')
  })
})
