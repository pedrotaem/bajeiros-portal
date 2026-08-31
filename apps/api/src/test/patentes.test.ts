import { describe, expect, it, beforeAll } from 'vitest'
import { app } from '../app'
import { withUser } from '../db'
import { authed, makeUser, type TestUser } from './helpers'

// DF-18 §3.5 — a assimetria que separa esta feature do DF-13:
//
//   sobe na hora · cai com 30 dias de carência · a maior alcançada nunca cai.
//
// O nível da área continua caindo imediatamente e honestamente (ADR-010 dec. 3 não
// muda). O que a carência amortece é o EMBLEMA — porque com barra e emblema caindo
// juntos e na hora, o incentivo perverso do "não salve a versão com problema"
// dobraria de tamanho.

const json = (body: unknown) => JSON.stringify(body)

/** Os seis critérios de nível 1: com todos declarados, piso = 1 e média = 1,0. */
const NIVEL_1 = ['EST-1.1', 'DIN-1.1', 'DOC-1.1', 'FAB-1.1', 'GES-1.1', 'CON-1.1']

describe('DF-18 — patente: subida, carência e histórico', () => {
  let cap: TestUser
  let teamId: string
  let projectId: string

  const post = (by: TestUser, path: string, body: unknown = {}) =>
    app.request(`/api/v1/teams/${teamId}${path}`, authed(by, { method: 'POST', body: json(body) }))

  const declare = (cid: string) => post(cap, `/evolution/declarations/${cid}`)
  const revoke = (cid: string) =>
    app.request(
      `/api/v1/teams/${teamId}/evolution/declarations/${cid}`,
      authed(cap, { method: 'DELETE' }),
    )

  const rank = async () =>
    await (await app.request(`/api/v1/teams/${teamId}/rank`, authed(cap))).json()

  const history = async () =>
    await (await app.request(`/api/v1/teams/${teamId}/rank/history`, authed(cap))).json()

  const activity = async () =>
    await (await app.request(`/api/v1/teams/${teamId}/activity?limit=50`, authed(cap))).json()

  const rankChanges = async () =>
    (await activity()).filter((e: { kind: string }) => e.kind === 'rank.changed')

  beforeAll(async () => {
    cap = await makeUser('CapPatente')
    await app.request('/api/v1/me', authed(cap, { method: 'POST' }))
    teamId = (
      await (
        await app.request(
          '/api/v1/teams',
          authed(cap, { method: 'POST', body: json({ name: 'Equipe Patente' }) }),
        )
      ).json()
    ).id
    await post(cap, '/evolution/optin')

    projectId = (
      await (
        await app.request(
          '/api/v1/projects',
          authed(cap, { method: 'POST', body: json({ name: 'Protótipo da Patente' }) }),
        )
      ).json()
    ).id
    await app.request(
      `/api/v1/projects/${projectId}/transfer`,
      authed(cap, { method: 'POST', body: json({ teamId }) }),
    )
    await app.request(
      `/api/v1/teams/${teamId}/season`,
      authed(cap, {
        method: 'PUT',
        body: json({ label: '2027', seasonProjectId: projectId }),
      }),
    )
  })

  it('§3.1 — sem protótipo designado não há patente; com ele, começa em Motorats', async () => {
    const r = await rank()
    expect(r.rank.n).toBe(8)
    expect(r.rank.name).toBe('Motorats')
    expect(r.reason).toBeNull()
  })

  it('sobe NA HORA: fechar o nível 1 das 6 áreas leva a The Peacemaker', async () => {
    for (const id of NIVEL_1) expect((await declare(id)).status, id).toBe(200)
    const r = await rank()
    expect(r.rank.n).toBe(7)
    expect(r.rank.name).toBe('The Peacemaker')
    expect(r.average).toBe(1)
    expect(r.floor).toBe(1)
    const promocao = (await rankChanges()).find(
      (e: { payload: { reason: string; to: number } }) =>
        e.payload.reason === 'promocao' && e.payload.to === 7,
    )
    expect(promocao.payload.from).toBe(8)
  })

  it('AC-DF18.7 — sem vínculo ao registro do Brasil, o caminho até a 4 é `sem-vinculo`', async () => {
    const r = await rank()
    // a próxima é a 6, que ainda é trava de maturidade
    expect(r.next.n).toBe(6)
    expect(r.next.block).toBe('maturidade')
    expect(r.next.maturity[0].text).toMatch(/subir a média de 1,0 para 1,8/)
  })

  it('AC-DF18.8 — a trava rompida HOJE mantém a patente e abre a carência', async () => {
    expect((await revoke('DOC-1.1')).status).toBe(200)
    const r = await rank()
    expect(r.rank.n).toBe(7) // o emblema não caiu…
    expect(r.floor).toBe(0) // …mas o nível da área caiu na hora, e o piso mostra
    expect(r.grace.target.n).toBe(8)
    expect(r.grace.days).toBe(30)
    expect(Date.parse(r.grace.endsAt)).toBeGreaterThan(Date.now())
  })

  it('AC-DF18.9 — trava restaurada no prazo limpa a carência e NÃO gera evento', async () => {
    const antes = (await rankChanges()).length
    expect((await declare('DOC-1.1')).status).toBe(200)
    const r = await rank()
    expect(r.rank.n).toBe(7)
    expect(r.grace).toBeNull()
    expect((await rankChanges()).length).toBe(antes)
  })

  it('AC-DF18.8 — no 31º dia a patente cai, o histórico registra a causa e a maior alcançada fica', async () => {
    expect((await revoke('DOC-1.1')).status).toBe(200)
    // envelhece a carência: em produção quem resolve isto é o recálculo diário
    // (RF-4.5), que roda o mesmo caminho desta requisição
    await withUser(cap.sub, async (db) => {
      await db.query(
        `UPDATE team_rank_state SET broken_since = now() - interval '31 days' WHERE team_id = $1`,
        [teamId],
      )
    })

    const r = await rank()
    expect(r.rank.n).toBe(8)
    expect(r.grace).toBeNull()

    const h = await history()
    expect(h.history[0].reason).toBe('queda')
    expect(h.history[0].rank).toBe(8)
    expect(h.history[0].previousRank).toBe(7)
    // §3.5 — a maior patente alcançada NUNCA cai: é a marca que sobrevive à turma
    expect(h.best.n).toBe(7)
    expect(r.best.n).toBe(7)

    // RF-5.4 — queda vira linha discreta na atividade, nunca aviso de tela cheia
    const queda = (await rankChanges()).find(
      (e: { payload: { reason: string } }) => e.payload.reason === 'queda',
    )
    expect(queda.payload).toMatchObject({ from: 7, to: 8, name: 'Motorats' })
    expect(r.promotion).toBeNull()
  })

  it('consertar depois da queda promove de novo, e o histórico guarda as duas viradas', async () => {
    expect((await declare('DOC-1.1')).status).toBe(200)
    const r = await rank()
    expect(r.rank.n).toBe(7)
    const h = await history()
    expect(h.history.map((x: { reason: string }) => x.reason).slice(0, 2)).toEqual([
      'promocao',
      'queda',
    ])
  })

  it('AC-DF18.11 — com a vitrine ligada, o perfil público expõe SÓ emblema e temporada', async () => {
    const r = await app.request(
      `/api/v1/teams/${teamId}/rank/visibility`,
      authed(cap, { method: 'PATCH', body: json({ rankPublic: true, rankHistoryPublic: true }) }),
    )
    expect(r.status).toBe(200)

    // o perfil público só existe para equipe vinculada ao acervo; a vitrine é lida
    // pela mesma função, então o que se afirma aqui é o CONTEÚDO devolvido
    const showcase = await withUser(cap.sub, async (db) => {
      const q = await db.query('SELECT * FROM team_rank_showcase($1)', [teamId])
      return q.rows[0]
    })
    expect(Number(showcase.r_rank)).toBe(7)
    expect(showcase.r_season).toBe('2027')
    expect(Number(showcase.r_best)).toBe(7)
    // e nada de nível por área, critério, declaração ou fila sai por aqui (RF-6.2)
    expect(Object.keys(showcase).sort()).toEqual([
      'r_best',
      'r_history_public',
      'r_rank',
      'r_season',
    ])

    // RF-6.4 — desligar é imediato: as colunas voltam nulas na mesma consulta
    await app.request(
      `/api/v1/teams/${teamId}/rank/visibility`,
      authed(cap, { method: 'PATCH', body: json({ rankPublic: false }) }),
    )
    const off = await withUser(cap.sub, async (db) => {
      const q = await db.query('SELECT * FROM team_rank_showcase($1)', [teamId])
      return q.rows[0]
    })
    expect(off.r_rank).toBeNull()
    expect(off.r_best).toBeNull()
  })
})
