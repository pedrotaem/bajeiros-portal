import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { templateCage } from '@bajeiros/core/model/template'
import { app } from '../app'
import { authed, makeUser, type TestUser } from './helpers'

// DF-20 (EV-10) — aferição das declarações. A carência do DF-18 §3.5 é testada em
// `patentes.test.ts`, no modo declarado: ela é mecanismo de patente, não de aferição.
//
// Este arquivo roda com `EVOLUTION_MODE=aferido`: é o gate que a v1 do produto ainda
// não liga (DF-20 §9 pede uma temporada de autodeclaração acumulada antes). Virar o
// modo NÃO exige migração (AC-DF19.10) — é o mesmo dado, outro cálculo —, e é
// exatamente isso que esta suíte prova de ponta a ponta.

const json = (body: unknown) => JSON.stringify(body)

/** Gaiola do template com os membros removidos: falha por PRESENÇA e por regra. */
const CAGE_INCOMPLETA = { ...templateCage, members: [] }

interface Criterion {
  id: string
  satisfied: boolean
  state: string
  reason: string
  counterCheck: { kind: string; message: string; measured: string } | null
  notComparable: string | null
  reaffirmable: boolean
}
interface Evo {
  mode: string
  areas: { area: string; level: number; criteria: Criterion[] }[]
  rank: { rank: { n: number } | null; grace: { target: { n: number } } | null } | null
}

describe('DF-20 — aferição, e DF-18 §3.5 — carência', () => {
  let cap: TestUser
  let semGaiola: TestUser
  let teamId: string
  let outroTime: string
  let projectId: string
  let modoAnterior: string | undefined

  const evo = async (by: TestUser, id = teamId): Promise<Evo> =>
    await (await app.request(`/api/v1/teams/${id}/evolution`, authed(by))).json()

  const crit = (e: Evo, id: string) =>
    e.areas.flatMap((a) => a.criteria).find((c) => c.id === id) as Criterion

  const level = (e: Evo, area: string) => e.areas.find((a) => a.area === area)!.level

  const post = (by: TestUser, path: string, body: unknown = {}, id = teamId) =>
    app.request(`/api/v1/teams/${id}${path}`, authed(by, { method: 'POST', body: json(body) }))

  const declare = (by: TestUser, cid: string, id = teamId) =>
    post(by, `/evolution/declarations/${cid}`, {}, id)

  const season = (by: TestUser, body: unknown, id = teamId) =>
    app.request(`/api/v1/teams/${id}/season`, authed(by, { method: 'PUT', body: json(body) }))

  const activity = async (by: TestUser, id = teamId) =>
    await (await app.request(`/api/v1/teams/${id}/activity?limit=50`, authed(by))).json()

  async function novaEquipe(user: TestUser, nome: string): Promise<string> {
    const t = await (
      await app.request(
        '/api/v1/teams',
        authed(user, { method: 'POST', body: json({ name: nome }) }),
      )
    ).json()
    await post(user, '/evolution/optin', {}, t.id)
    return t.id
  }

  beforeAll(async () => {
    modoAnterior = process.env.EVOLUTION_MODE
    process.env.EVOLUTION_MODE = 'aferido'
    ;[cap, semGaiola] = await Promise.all([makeUser('CapAfer'), makeUser('CapSemGaiola')])
    for (const u of [cap, semGaiola]) await app.request('/api/v1/me', authed(u, { method: 'POST' }))

    teamId = await novaEquipe(cap, 'Equipe Aferida')
    outroTime = await novaEquipe(semGaiola, 'Equipe Sem Gaiola')

    projectId = (
      await (
        await app.request(
          '/api/v1/projects',
          authed(cap, { method: 'POST', body: json({ name: 'Protótipo Aferido' }) }),
        )
      ).json()
    ).id
    await app.request(
      `/api/v1/projects/${projectId}/transfer`,
      authed(cap, { method: 'POST', body: json({ teamId }) }),
    )
    // temporada SEM marcos: é o estado que o GES-3.1 contradiz
    await season(cap, { label: '2027', seasonProjectId: projectId, milestones: [] })
    await app.request(
      `/api/v1/projects/${projectId}/snapshots`,
      authed(cap, { method: 'POST', body: json({ cage: CAGE_INCOMPLETA, expectedSeq: 0 }) }),
    )
  })

  afterAll(() => {
    if (modoAnterior === undefined) delete process.env.EVOLUTION_MODE
    else process.env.EVOLUTION_MODE = modoAnterior
  })

  it('o modo aferido vale para o cálculo inteiro', async () => {
    expect((await evo(cap)).mode).toBe('aferido')
  })

  it('AC-DF20.1 — EST-3.1 declarado + versão salva com infração cai, e o nível de Estrutura cai', async () => {
    for (const id of ['EST-1.1', 'EST-2.1', 'EST-2.2', 'EST-3.1', 'EST-3.2']) {
      expect((await declare(cap, id)).status, id).toBe(200)
    }
    const e = await evo(cap)
    const est31 = crit(e, 'EST-3.1')
    expect(est31.state).toBe('em-contraprova')
    expect(est31.satisfied).toBe(false)
    expect(est31.counterCheck?.kind).toBe('contradiction')
    expect(est31.counterCheck?.measured).toMatch(/infrações na última versão/)
    // EST-2.1 também cai (pendência de presença), então a área trava no nível 1
    expect(crit(e, 'EST-2.1').state).toBe('em-contraprova')
    expect(level(e, 'estrutura')).toBe(1)
  })

  it('AC-DF20.5 — reafirmar uma contradição direta é recusado (400)', async () => {
    const r = await post(cap, '/evolution/declarations/EST-3.1/reaffirm', {
      note: 'a gaiola vai ser corrigida antes da inspeção',
    })
    expect(r.status).toBe(400)
    expect((await r.json()).detail).toMatch(/consertar o dado/)
    expect(crit(await evo(cap), 'EST-3.1').reaffirmable).toBe(false)
  })

  it('AC-DF20.2 — corrigir o dado devolve a declaração a `vigente` sem nova declaração, e o nível sobe', async () => {
    // GES-3.1 afirma "temporada configurada COM marcos"; a temporada está sem
    expect((await declare(cap, 'GES-1.1')).status).toBe(200)
    expect((await declare(cap, 'GES-2.2')).status).toBe(200)
    expect((await declare(cap, 'GES-3.1')).status).toBe(200)
    const antes = await evo(cap)
    expect(crit(antes, 'GES-3.1').state).toBe('em-contraprova')
    expect(crit(antes, 'GES-3.1').counterCheck?.measured).toBe('temporada sem marcos datados')

    const futuro = new Date(Date.now() + 40 * 86_400_000).toISOString().slice(0, 10)
    await season(cap, {
      label: '2027',
      seasonProjectId: projectId,
      milestones: [{ title: 'Entrega do relatório', date: futuro }],
    })

    const depois = await evo(cap)
    // nenhuma declaração nova foi feita: a contraprova simplesmente cessou (RF-3.4)
    expect(crit(depois, 'GES-3.1').state).toBe('vigente')
    expect(crit(depois, 'GES-3.1').satisfied).toBe(true)
    expect(level(depois, 'gestao')).toBeGreaterThanOrEqual(1)
  })

  it('AC-DF20.9 — `counter.raised` e `counter.cleared` aparecem na atividade com a causa', async () => {
    const feed = await activity(cap)
    const raised = feed.find(
      (e: { kind: string; payload: { criterionId: string } }) =>
        e.kind === 'counter.raised' && e.payload.criterionId === 'GES-3.1',
    )
    const cleared = feed.find(
      (e: { kind: string; payload: { criterionId: string } }) =>
        e.kind === 'counter.cleared' && e.payload.criterionId === 'GES-3.1',
    )
    expect(raised?.payload.measured).toBe('temporada sem marcos datados')
    expect(raised?.payload.kind).toBe('contradiction')
    expect(cleared).toBeTruthy()
  })

  it('AC-DF20.11/20.12 — projeto sem gaiola salva: nenhuma contraprova de validador dispara', async () => {
    for (const id of ['EST-2.1', 'EST-3.1', 'DIN-2.1', 'DIN-2.2']) {
      expect((await declare(semGaiola, id, outroTime)).status, id).toBe(200)
    }
    const e = await evo(semGaiola, outroTime)
    for (const id of ['EST-2.1', 'EST-3.1', 'DIN-2.1', 'DIN-2.2']) {
      const c = crit(e, id)
      expect(c.state, id).toBe('vigente')
      expect(c.satisfied, id).toBe(true)
      expect(c.counterCheck, id).toBeNull()
      // a tela diz "sem como conferir aqui" em vez de acusar (§2.0)
      expect(c.notComparable, id).toMatch(/não está modelado no validador/)
    }
  })

  it('§2.0 — mas o critério que AFIRMA o dado é contradito pela ausência', async () => {
    expect((await declare(semGaiola, 'EST-1.1', outroTime)).status).toBe(200)
    const c = crit(await evo(semGaiola, outroTime), 'EST-1.1')
    expect(c.state).toBe('em-contraprova')
    expect(c.counterCheck?.measured).toBe('sem versão salva e sem ficha preenchida')
  })

  it('DIN-1.1 — o cargo de dinâmica vago no organograma padrão contradiz a declaração', async () => {
    expect((await declare(semGaiola, 'DIN-1.1', outroTime)).status).toBe(200)
    const c = crit(await evo(semGaiola, outroTime), 'DIN-1.1')
    expect(c.state).toBe('em-contraprova')
    expect(c.counterCheck?.measured).toMatch(/Suspensão e Direção/)
  })
})
