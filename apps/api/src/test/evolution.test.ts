import { describe, expect, it, beforeAll } from 'vitest'
import { templateCage } from '@bajeiros/core/model/template'
import { app } from '../app'
import { authed, makeUser, type TestUser } from './helpers'

// DF-13 (EV-1) — a evidência flui de ponta a ponta SEM UI: salvar o projeto da
// temporada muda o nível, declarar critério muda o nível, e nada disso vaza para
// outra equipe. Marco EV-M1.

const json = (body: unknown) => JSON.stringify(body)

/** Gaiola do template com os membros removidos: passa no motor e falha por PRESENÇA. */
const CAGE_INCOMPLETA = { ...templateCage, members: [] }

interface AreaView {
  area: string
  level: number
  criteria: { id: string; satisfied: boolean; reason: string; type: string }[]
}
interface EvolutionView {
  catalogVersion: string
  average: number
  areas: AreaView[]
  season: { label: string; seasonProjectId: string | null } | null
  bootstrap: boolean
}
interface StepView {
  id: string
  title: string
  origin: string
  criterionId: string | null
  status: string
  ownerUserId: string | null
}

describe('DF-13 — evolução da equipe (API)', () => {
  let cap: TestUser
  let membro: TestUser
  let fora: TestUser
  let teamId: string
  let outraEquipe: string
  let projectId: string

  const evolutionOf = async (by: TestUser, id = teamId): Promise<EvolutionView> =>
    await (await app.request(`/api/v1/teams/${id}/evolution`, authed(by))).json()

  const areaOf = (evo: EvolutionView, area: string) =>
    evo.areas.find((a) => a.area === area) as AreaView

  const criterionOf = (evo: EvolutionView, id: string) =>
    evo.areas.flatMap((a) => a.criteria).find((c) => c.id === id)

  const stepsOf = async (by: TestUser, status = 'open', id = teamId): Promise<StepView[]> =>
    await (
      await app.request(`/api/v1/teams/${id}/evolution/steps?status=${status}`, authed(by))
    ).json()

  const declare = (by: TestUser, criterionId: string, body: unknown = {}, id = teamId) =>
    app.request(
      `/api/v1/teams/${id}/evolution/declarations/${criterionId}`,
      authed(by, { method: 'POST', body: json(body) }),
    )

  async function saveSnapshot(by: TestUser, project: string, seq: number, cage: unknown) {
    return app.request(
      `/api/v1/projects/${project}/snapshots`,
      authed(by, { method: 'POST', body: json({ cage, expectedSeq: seq }) }),
    )
  }

  async function joinTeam(who: TestUser, approver: TestUser, id = teamId) {
    const inv = await app.request(
      `/api/v1/teams/${id}/invites`,
      authed(approver, { method: 'POST', body: json({ email: who.email }) }),
    )
    const { token } = await inv.json()
    await app.request(
      '/api/v1/invites/accept',
      authed(who, { method: 'POST', body: json({ token }) }),
    )
    const fila = await (
      await app.request(`/api/v1/teams/${id}/join-requests`, authed(approver))
    ).json()
    const req = fila.find((r: { userId: string }) => r.userId === who.sub)
    await app.request(
      `/api/v1/teams/${id}/join-requests/${req.id}/approve`,
      authed(approver, { method: 'POST', body: json({}) }),
    )
  }

  beforeAll(async () => {
    ;[cap, membro, fora] = await Promise.all([
      makeUser('CapEvo'),
      makeUser('MembroEvo'),
      makeUser('ForaEvo'),
    ])
    for (const u of [cap, membro, fora])
      await app.request('/api/v1/me', authed(u, { method: 'POST' }))

    teamId = (
      await (
        await app.request(
          '/api/v1/teams',
          authed(cap, { method: 'POST', body: json({ name: 'Equipe Evolução' }) }),
        )
      ).json()
    ).id
    outraEquipe = (
      await (
        await app.request(
          '/api/v1/teams',
          authed(fora, { method: 'POST', body: json({ name: 'Equipe Alheia' }) }),
        )
      ).json()
    ).id
    await joinTeam(membro, cap)

    // projeto da equipe (transferido de pessoal) para virar o da temporada
    projectId = (
      await (
        await app.request(
          '/api/v1/projects',
          authed(cap, { method: 'POST', body: json({ name: 'Protótipo 2027' }) }),
        )
      ).json()
    ).id
    await app.request(
      `/api/v1/projects/${projectId}/transfer`,
      authed(cap, { method: 'POST', body: json({ teamId }) }),
    )
  })

  // ---------- estado inicial ----------

  it('equipe nova já tem evidência de organograma e nível de gestão', async () => {
    const evo = await evolutionOf(cap)
    expect(evo.catalogVersion).toMatch(/^\d+\.\d+\.\d+$/)
    // a equipe nasce com organograma padrão e capitania regular → GES-1.1 satisfeito
    expect(criterionOf(evo, 'GES-1.1')?.satisfied).toBe(true)
    expect(areaOf(evo, 'gestao').level).toBe(1)
  })

  it('sem projeto da temporada, a evolução avisa em vez de mentir "0 infrações"', async () => {
    const evo = await evolutionOf(cap)
    expect(evo.bootstrap).toBe(true)
    expect(criterionOf(evo, 'EST-3.1')?.reason).toBe('nenhuma versão salva do projeto da temporada')
    const passos = await stepsOf(cap)
    expect(passos.some((s) => s.title === 'Designar o projeto da temporada')).toBe(true)
  })

  it('a primeira computação não narra queda que nunca aconteceu', async () => {
    // area que nasce em 0 nao tem "voltou para o nivel 0": sem linha anterior, 0 -> 0
    // nao e mudanca. Sem esta guarda a atividade da equipe nova abria com 5 quedas.
    const feed = await (
      await app.request(`/api/v1/teams/${teamId}/activity?limit=50`, authed(cap))
    ).json()
    const nulas = feed.filter(
      (e: { kind: string; payload: { from: number; to: number } }) =>
        e.kind === 'level.changed' && e.payload.from === e.payload.to,
    )
    expect(nulas).toEqual([])
    // a subida real (gestao 0 -> 1, do organograma padrao) continua sendo narrada
    const subida = feed.find(
      (e: { kind: string; payload: { area: string } }) =>
        e.kind === 'level.changed' && e.payload.area === 'gestao',
    )
    expect(subida?.payload).toMatchObject({ from: 0, to: 1 })
  })

  it('AC-DF13.6 — critério oculto não aparece na resposta', async () => {
    const evo = await evolutionOf(cap)
    expect(criterionOf(evo, 'EST-4.1')).toBeUndefined()
    expect(evo.areas.flatMap((a) => a.criteria).some((c) => c.type === 'oculto')).toBe(false)
  })

  // ---------- temporada ----------

  it('AC-DF13.7 — configurar a temporada satisfaz GES-3.1 e dá a contagem regressiva', async () => {
    const futuro = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10)
    const r = await app.request(
      `/api/v1/teams/${teamId}/season`,
      authed(cap, {
        method: 'PUT',
        body: json({
          label: '2027',
          seasonProjectId: projectId,
          milestones: [{ title: 'Entrega do relatório', date: futuro }],
        }),
      }),
    )
    expect(r.status).toBe(200)
    const season = await r.json()
    expect(season.next.title).toBe('Entrega do relatório')
    expect(season.next.daysLeft).toBe(30)

    const evo = await evolutionOf(cap)
    expect(criterionOf(evo, 'GES-3.1')?.satisfied).toBe(true)
    expect(evo.bootstrap).toBe(false)
  })

  it('membro comum não configura a temporada (403)', async () => {
    const r = await app.request(
      `/api/v1/teams/${teamId}/season`,
      authed(membro, { method: 'PUT', body: json({ label: '2028' }) }),
    )
    expect(r.status).toBe(403)
  })

  it('projeto de fora da equipe não pode ser o da temporada (400)', async () => {
    const alheio = (
      await (
        await app.request(
          '/api/v1/projects',
          authed(fora, { method: 'POST', body: json({ name: 'Pessoal' }) }),
        )
      ).json()
    ).id
    const r = await app.request(
      `/api/v1/teams/${teamId}/season`,
      authed(cap, {
        method: 'PUT',
        body: json({ label: '2027', seasonProjectId: alheio }),
      }),
    )
    expect(r.status).toBe(400)
  })

  // ---------- o ciclo do validador ----------

  it('AC-DF13.2 — salvar o projeto da temporada vira evidência e mexe no nível', async () => {
    const antes = await evolutionOf(cap)
    expect(criterionOf(antes, 'EST-1.1')?.satisfied).toBe(false)

    const r = await saveSnapshot(cap, projectId, 0, CAGE_INCOMPLETA)
    expect(r.status).toBe(201)

    const depois = await evolutionOf(cap)
    expect(criterionOf(depois, 'EST-1.1')?.satisfied).toBe(true)
    expect(areaOf(depois, 'estrutura').level).toBe(1)
    // gaiola vazia = pendências de presença: o nível 2 não fecha, e o motivo é dito
    expect(criterionOf(depois, 'EST-2.1')?.satisfied).toBe(false)
    expect(criterionOf(depois, 'EST-2.1')?.reason).toMatch(/pendências de presença/)
  })

  it('a atividade narra o salvamento com as contagens canônicas', async () => {
    const feed = await (
      await app.request(`/api/v1/teams/${teamId}/activity?limit=20`, authed(membro))
    ).json()
    const save = feed.find((e: { kind: string }) => e.kind === 'validation.summary')
    expect(save).toBeTruthy()
    expect(save.payload.counts.fail).toBeGreaterThan(0)
    expect(save.snapshotSeq).toBe(1)
    // resumo de estado é ruído, não notícia
    expect(feed.some((e: { kind: string }) => e.kind === 'org.summary')).toBe(false)
  })

  it('AC-DF13.3 — snapshot de projeto que NÃO é o da temporada não gera evidência', async () => {
    const outro = (
      await (
        await app.request(
          '/api/v1/projects',
          authed(cap, { method: 'POST', body: json({ name: 'Mula de testes' }) }),
        )
      ).json()
    ).id
    await app.request(
      `/api/v1/projects/${outro}/transfer`,
      authed(cap, { method: 'POST', body: json({ teamId }) }),
    )
    const antes = await (
      await app.request(`/api/v1/teams/${teamId}/activity?limit=50`, authed(cap))
    ).json()
    expect((await saveSnapshot(cap, outro, 0, CAGE_INCOMPLETA)).status).toBe(201)
    const depois = await (
      await app.request(`/api/v1/teams/${teamId}/activity?limit=50`, authed(cap))
    ).json()
    const conta = (feed: { kind: string }[]) =>
      feed.filter((e) => e.kind === 'validation.summary').length
    expect(conta(depois)).toBe(conta(antes))
  })

  // ---------- declarações ----------

  it('AC-DF13.4 — declarar exige capitania; membro comum recebe 403', async () => {
    expect((await declare(membro, 'EST-2.2')).status).toBe(403)
    const r = await declare(cap, 'EST-2.2', { note: 'Conferido na reunião de 20/08' })
    expect(r.status).toBe(200)
    const evo: EvolutionView = await r.json()
    expect(criterionOf(evo, 'EST-2.2')?.satisfied).toBe(true)
    expect(criterionOf(evo, 'EST-2.2')?.reason).toBe('declarado pela capitania')
  })

  it('critério automático não é declarável (409)', async () => {
    expect((await declare(cap, 'EST-3.1')).status).toBe(409)
  })

  it('critério oculto não é declarável (409) e inexistente é 404', async () => {
    expect((await declare(cap, 'EST-4.1')).status).toBe(409)
    expect((await declare(cap, 'XXX-9.9')).status).toBe(404)
  })

  it('revogar a declaração derruba o critério de volta', async () => {
    await declare(cap, 'DIN-1.1')
    expect(criterionOf(await evolutionOf(cap), 'DIN-1.1')?.satisfied).toBe(true)
    const r = await app.request(
      `/api/v1/teams/${teamId}/evolution/declarations/DIN-1.1`,
      authed(cap, { method: 'DELETE' }),
    )
    expect(r.status).toBe(200)
    expect(criterionOf(await evolutionOf(cap), 'DIN-1.1')?.satisfied).toBe(false)
    expect(
      (
        await app.request(
          `/api/v1/teams/${teamId}/evolution/declarations/DIN-1.1`,
          authed(cap, { method: 'DELETE' }),
        )
      ).status,
    ).toBe(404)
  })

  // ---------- fila de passos ----------

  it('AC-DF13.5 — critério pendente gera exatamente 1 passo; satisfazer conclui o passo', async () => {
    const abertos = await stepsOf(cap)
    const doCriterio = abertos.filter((s) => s.criterionId === 'GES-2.2')
    expect(doCriterio).toHaveLength(1)

    await declare(cap, 'GES-2.2', { note: 'Reunião toda terça, 19h' })
    const depois = await stepsOf(cap)
    expect(depois.some((s) => s.criterionId === 'GES-2.2')).toBe(false)
    const concluidos = await stepsOf(cap, 'done')
    expect(concluidos.some((s) => s.criterionId === 'GES-2.2')).toBe(true)
  })

  it('recomputar de novo não duplica passo (idempotente)', async () => {
    await evolutionOf(cap)
    await evolutionOf(cap)
    const abertos = await stepsOf(cap)
    const ids = abertos.map((s) => s.criterionId).filter(Boolean)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('membro cria passo manual; meta exige capitania', async () => {
    const r = await app.request(
      `/api/v1/teams/${teamId}/evolution/steps`,
      authed(membro, {
        method: 'POST',
        body: json({ title: 'Comprar tubos', area: 'fabricacao' }),
      }),
    )
    expect(r.status).toBe(201)
    expect((await r.json()).origin).toBe('manual')

    const meta = await app.request(
      `/api/v1/teams/${teamId}/evolution/steps`,
      authed(membro, {
        method: 'POST',
        body: json({ title: 'Recuperar mediana', origin: 'meta' }),
      }),
    )
    expect(meta.status).toBe(403)
  })

  it('dono do passo conclui; quem não é dono nem capitania recebe 403', async () => {
    const criado = await (
      await app.request(
        `/api/v1/teams/${teamId}/evolution/steps`,
        authed(cap, { method: 'POST', body: json({ title: 'Ligar para o patrocinador' }) }),
      )
    ).json()

    const semDono = await app.request(
      `/api/v1/teams/${teamId}/evolution/steps/${criado.id}`,
      authed(membro, { method: 'PATCH', body: json({ status: 'done' }) }),
    )
    expect(semDono.status).toBe(403)

    const atribui = await app.request(
      `/api/v1/teams/${teamId}/evolution/steps/${criado.id}`,
      authed(cap, { method: 'PATCH', body: json({ ownerUserId: membro.sub }) }),
    )
    expect(atribui.status).toBe(200)

    const conclui = await app.request(
      `/api/v1/teams/${teamId}/evolution/steps/${criado.id}`,
      authed(membro, { method: 'PATCH', body: json({ status: 'done' }) }),
    )
    expect(conclui.status).toBe(200)
    expect((await conclui.json()).status).toBe('done')
  })

  it('dono precisa ser da equipe (400)', async () => {
    const criado = await (
      await app.request(
        `/api/v1/teams/${teamId}/evolution/steps`,
        authed(cap, { method: 'POST', body: json({ title: 'Passo com dono errado' }) }),
      )
    ).json()
    const r = await app.request(
      `/api/v1/teams/${teamId}/evolution/steps/${criado.id}`,
      authed(cap, { method: 'PATCH', body: json({ ownerUserId: fora.sub }) }),
    )
    expect(r.status).toBe(400)
  })

  // ---------- evidência declarativa do cliente ----------

  it('gabarito gerado só conta para o projeto da temporada', async () => {
    const errado = await app.request(
      `/api/v1/teams/${teamId}/evolution/events/template-generated`,
      authed(membro, { method: 'POST', body: json({ projectId: fora.sub }) }),
    )
    expect(errado.status).toBe(409)

    const certo = await app.request(
      `/api/v1/teams/${teamId}/evolution/events/template-generated`,
      authed(membro, { method: 'POST', body: json({ projectId }) }),
    )
    expect(certo.status).toBe(204)
    expect(criterionOf(await evolutionOf(cap), 'FAB-2.1')?.satisfied).toBe(true)
  })

  // ---------- benchmark ----------

  it('AC-DF13.8 — benchmark fica oculto com coorte abaixo do piso de 8', async () => {
    const r = await app.request(`/api/v1/teams/${teamId}/evolution/benchmark`, authed(cap))
    expect(r.status).toBe(200)
    const body = await r.json()
    expect(body.floor).toBe(8)
    // a suíte roda vários arquivos contra o mesmo banco: o que se afirma é a REGRA
    // do piso, não um total de equipes que depende de quem mais está testando
    expect(body.visible).toBe(body.teams >= 8)
    if (!body.visible) expect(body.average).toBeNull()
    else expect(Object.keys(body.areas)).toContain('estrutura')
  })

  // ---------- isolamento ----------

  it('AC-DF13.10 — nada da equipe alheia é legível ou gravável', async () => {
    for (const path of ['/evolution', '/evolution/steps', '/season', '/activity']) {
      const r = await app.request(`/api/v1/teams/${teamId}${path}`, authed(fora))
      expect(r.status, path).toBe(404)
    }
    expect((await declare(fora, 'EST-2.2')).status).toBe(404)
    const passo = await app.request(
      `/api/v1/teams/${teamId}/evolution/steps`,
      authed(fora, { method: 'POST', body: json({ title: 'Invasão' }) }),
    )
    expect(passo.status).toBe(404)
    // e a equipe alheia continua com a própria evolução intacta
    const dele = await evolutionOf(fora, outraEquipe)
    expect(dele.areas.find((a) => a.area === 'estrutura')?.level).toBe(0)
  })

  // ---------- LGPD ----------

  it('AC-DF13.9 — export do titular inclui declarações, passos e evidências', async () => {
    const dump = await (await app.request('/api/v1/me/export', authed(cap))).json()
    expect(dump.evolutionDeclarations.length).toBeGreaterThan(0)
    expect(dump.evolutionSteps.length).toBeGreaterThan(0)
    expect(dump.evolutionEvidence.length).toBeGreaterThan(0)
    expect(
      dump.evolutionDeclarations.every((d: { declared_by: string }) => d.declared_by === cap.sub),
    ).toBe(true)
  })
})
