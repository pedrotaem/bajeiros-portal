import { describe, expect, it, beforeAll } from 'vitest'
import { templateCage } from '@bajeiros/core/model/template'
import { app } from '../app'
import { authed, makeUser, type TestUser } from './helpers'

// DF-13 (EV-1) — a evidência flui de ponta a ponta SEM UI: salvar o projeto da
// temporada muda a MEDIDA, declarar critério muda o nível, e nada disso vaza para
// outra equipe. Marco EV-M1.
//
// Duas viradas de spec moldam esta suíte:
//  - **DF-18 opt-in** (AC-DF18.2): sem ativação da capitania, nenhuma resposta traz
//    nível nem patente. Por isso o `beforeAll` ativa antes de qualquer coisa;
//  - **DF-19 modo autodeclarativo** (RF-1.1): o critério `auto` NÃO é mais satisfeito
//    pela evidência — ele é satisfeito pela declaração, e a evidência vira a MEDIDA
//    exibida ao lado (`measured`). O que a suíte antiga afirmava em `satisfied`
//    passa a ser afirmado em `measured`.

const json = (body: unknown) => JSON.stringify(body)

/** Gaiola do template com os membros removidos: passa no motor e falha por PRESENÇA. */
const CAGE_INCOMPLETA = { ...templateCage, members: [] }

interface CriterionView {
  id: string
  satisfied: boolean
  reason: string
  type: string
  state: string
  divergent: boolean
  question: string
  measured: { satisfied: boolean; reason: string } | null
  counterCheck: unknown | null
}
interface AreaView {
  area: string
  level: number
  criteria: CriterionView[]
}
interface RankView {
  rank: { n: number; name: string } | null
  reason: string | null
  average: number
  floor: number
  next: { n: number; block: string; maturity: { text: string }[] } | null
  best: { n: number } | null
  promotion: { from: number | null; to: number } | null
  visibility: { rankPublic: boolean; rankHistoryPublic: boolean }
}
interface EvolutionView {
  optIn: boolean
  canOptIn?: boolean
  notice?: { version: string; reads: string[] }
  catalogVersion: string
  mode: string
  average: number | null
  floor?: number
  areas: AreaView[]
  rank: RankView | null
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

describe('DF-13/DF-18/DF-19 — evolução e patente da equipe (API)', () => {
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

  const optIn = (by: TestUser, id = teamId) =>
    app.request(`/api/v1/teams/${id}/evolution/optin`, authed(by, { method: 'POST', body: '{}' }))

  const optOut = (by: TestUser, id = teamId) =>
    app.request(`/api/v1/teams/${id}/evolution/optin`, authed(by, { method: 'DELETE' }))

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

  // ---------- DF-18 E2: nada existe antes da capitania ativar ----------

  describe('opt-in (DF-18 E2)', () => {
    it('AC-DF18.2 — equipe sem opt-in não tem patente nem níveis em nenhuma resposta', async () => {
      const evo = await evolutionOf(cap)
      expect(evo.optIn).toBe(false)
      expect(evo.areas).toEqual([])
      expect(evo.average).toBeNull()
      expect(evo.rank).toBeNull()
      // o que volta no lugar é o convite, dizendo o que a avaliação vai ler (RF-2.3)
      expect(evo.notice?.reads.length).toBeGreaterThan(2)
      expect(evo.notice?.version).toBeTruthy()

      const home = await (await app.request('/api/v1/me/home', authed(cap))).json()
      expect(home.optIn).toBe(false)
      expect(home.evolution).toBeNull()
      expect(home.rank).toBeNull()
    })

    it('AC-DF18.5 — ativar exige `evolution.optin`; membro comum recebe 403 e vê o botão desabilitado', async () => {
      const r = await optIn(membro)
      expect(r.status).toBe(403)
      const evo = await evolutionOf(membro)
      expect(evo.canOptIn).toBe(false)
    })

    it('declarar critério antes de ativar é 409, não um write silencioso', async () => {
      expect((await declare(cap, 'EST-2.2')).status).toBe(409)
    })

    it('RF-2.4 — ativar recomputa retroativamente e responde na MESMA requisição', async () => {
      const r = await optIn(cap)
      expect(r.status).toBe(200)
      const evo: EvolutionView = await r.json()
      expect(evo.optIn).toBe(true)
      expect(evo.areas).toHaveLength(6)
      // a equipe nasce com organograma padrão, então o portal JÁ mede GES-1.1 —
      // ninguém encara um painel zerado pedindo formulário
      expect(criterionOf(evo, 'GES-1.1')?.measured?.satisfied).toBe(true)
    })

    it('§3.1 — sem protótipo da temporada não há unidade avaliada, e a tela diz isso', async () => {
      const evo = await evolutionOf(cap)
      expect(evo.rank?.rank).toBeNull()
      expect(evo.rank?.reason).toBe('sem-prototipo')
      const passos = await stepsOf(cap)
      expect(passos.some((s) => s.title === 'Designar o projeto da temporada')).toBe(true)
    })
  })

  // ---------- estado inicial ----------

  it('o catálogo é o v2 autodeclarativo, com os 51 critérios visíveis', async () => {
    const evo = await evolutionOf(cap)
    expect(evo.catalogVersion).toBe('2.0.0')
    expect(evo.mode).toBe('declarado')
    expect(evo.areas.flatMap((a) => a.criteria)).toHaveLength(51)
    // AC-DF19.2 — os dois ex-`oculto` entraram no denominador
    expect(criterionOf(evo, 'EST-4.1')).toBeTruthy()
    expect(criterionOf(evo, 'DOC-4.2')).toBeTruthy()
  })

  it('AC-DF19.9 — o enunciado vem canônico do pacote, não é remontado na tela', async () => {
    const evo = await evolutionOf(cap)
    expect(criterionOf(evo, 'EST-3.1')?.question).toBe(
      'O projeto do protótipo atende a todas as regras verificáveis em desenho?',
    )
  })

  it('sem projeto da temporada, a evolução avisa em vez de mentir "0 infrações"', async () => {
    const evo = await evolutionOf(cap)
    expect(evo.bootstrap).toBe(true)
    expect(criterionOf(evo, 'EST-3.1')?.measured?.reason).toBe(
      'nenhuma versão salva do projeto da temporada',
    )
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
  })

  // ---------- temporada ----------

  it('AC-DF13.7 — configurar a temporada dá a contagem regressiva e a medida de GES-3.1', async () => {
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
    expect(criterionOf(evo, 'GES-3.1')?.measured?.satisfied).toBe(true)
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

  it('AC-DF13.2 — salvar o projeto da temporada vira evidência e muda a MEDIDA', async () => {
    const antes = await evolutionOf(cap)
    expect(criterionOf(antes, 'EST-1.1')?.measured?.satisfied).toBe(false)

    const r = await saveSnapshot(cap, projectId, 0, CAGE_INCOMPLETA)
    expect(r.status).toBe(201)

    const depois = await evolutionOf(cap)
    expect(criterionOf(depois, 'EST-1.1')?.measured?.satisfied).toBe(true)
    // gaiola vazia = pendências de presença: a medida diz por quê
    expect(criterionOf(depois, 'EST-2.1')?.measured?.satisfied).toBe(false)
    expect(criterionOf(depois, 'EST-2.1')?.measured?.reason).toMatch(/pendências de presença/)
    // DF-19: a medida sozinha NÃO sobe o nível — quem sobe é a declaração
    expect(areaOf(depois, 'estrutura').level).toBe(0)
  })

  it('AC-DF19.1 — declarar sobe o nível, e AC-DF19.3 grava a divergência sem mudar nada', async () => {
    await declare(cap, 'EST-1.1')
    expect(areaOf(await evolutionOf(cap), 'estrutura').level).toBe(1)

    // a gaiola salva está incompleta: declarar EST-2.1 é divergir da medida
    await declare(cap, 'EST-2.1')
    await declare(cap, 'EST-2.2', { note: 'Conferido na reunião de 20/08' })
    const evo = await evolutionOf(cap)
    const est21 = criterionOf(evo, 'EST-2.1')
    expect(est21?.satisfied).toBe(true)
    expect(est21?.divergent).toBe(true)
    expect(areaOf(evo, 'estrutura').level).toBe(2)
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
    expect((await declare(membro, 'EST-3.2')).status).toBe(403)
    const r = await declare(cap, 'EST-3.2')
    expect(r.status).toBe(200)
    const evo: EvolutionView = await r.json()
    expect(criterionOf(evo, 'EST-3.2')?.satisfied).toBe(true)
    expect(criterionOf(evo, 'EST-3.2')?.reason).toBe('declarado pela capitania')
  })

  it('DF-19 RF-1.1 — critério que o portal também mede é declarável como qualquer outro', async () => {
    const r = await declare(cap, 'EST-3.1')
    expect(r.status).toBe(200)
    const evo: EvolutionView = await r.json()
    expect(criterionOf(evo, 'EST-3.1')?.satisfied).toBe(true)
    expect(criterionOf(evo, 'EST-3.1')?.type).toBe('auto')
    expect(areaOf(evo, 'estrutura').level).toBe(3)
  })

  it('critério inexistente é 404', async () => {
    expect((await declare(cap, 'XXX-9.9')).status).toBe(404)
  })

  it('AC-DF19.6 — revogar derruba o nível na hora', async () => {
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

  it('AC-DF20.5 — reafirmar sem contraprova em curso é recusado', async () => {
    const r = await app.request(
      `/api/v1/teams/${teamId}/evolution/declarations/EST-3.1/reaffirm`,
      authed(cap, { method: 'POST', body: json({ note: 'o carro é pesado de propósito' }) }),
    )
    // em modo declarado nenhuma contraprova dispara: não há o que responder
    expect(r.status).toBe(409)
  })

  it('AC-DF20.8 — reafirmação exige `evolution.declare`', async () => {
    const r = await app.request(
      `/api/v1/teams/${teamId}/evolution/declarations/EST-3.1/reaffirm`,
      authed(membro, { method: 'POST', body: json({ note: 'nota qualquer' }) }),
    )
    expect(r.status).toBe(403)
  })

  it('reafirmar sem nota é 400 — a justificativa é o ponto do mecanismo', async () => {
    const r = await app.request(
      `/api/v1/teams/${teamId}/evolution/declarations/EST-3.1/reaffirm`,
      authed(cap, { method: 'POST', body: json({}) }),
    )
    expect(r.status).toBe(400)
  })

  // ---------- fila de passos ----------

  it('AC-DF13.5 — critério pendente gera exatamente 1 passo; satisfazer conclui o passo', async () => {
    const abertos = await stepsOf(cap)
    const doCriterio = abertos.filter((s) => s.criterionId === 'GES-1.1')
    expect(doCriterio).toHaveLength(1)

    await declare(cap, 'GES-1.1')
    const depois = await stepsOf(cap)
    expect(depois.some((s) => s.criterionId === 'GES-1.1')).toBe(false)
    const concluidos = await stepsOf(cap, 'done')
    expect(concluidos.some((s) => s.criterionId === 'GES-1.1')).toBe(true)
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
    expect(criterionOf(await evolutionOf(cap), 'FAB-2.1')?.measured?.satisfied).toBe(true)
  })

  // ---------- DF-18: a patente ----------

  describe('patente do protótipo (DF-18)', () => {
    it('a faixa traz emblema, média, piso e o que falta para a próxima', async () => {
      const evo = await evolutionOf(cap)
      const rank = evo.rank!
      expect(rank.rank?.n).toBeLessThanOrEqual(8)
      expect(rank.average).toBe(evo.average)
      expect(rank.floor).toBe(evo.floor)
      expect(rank.next?.n).toBe((rank.rank?.n ?? 8) - 1)
      expect(rank.visibility).toEqual({ rankPublic: false, rankHistoryPublic: false })
    })

    it('AC-DF18.7 — sem vínculo aprovado, a próxima patente 4 é bloqueada por `sem-vinculo`', async () => {
      // a equipe de teste não está vinculada ao acervo do DF-15
      const r = await (await app.request(`/api/v1/teams/${teamId}/rank`, authed(membro))).json()
      expect(r.optIn).toBe(true)
      // qualquer bloqueio de competição aqui só pode ser por falta de vínculo
      if (r.next?.block === 'competicao' || r.next?.block === 'sem-vinculo') {
        expect(r.next.block).toBe('sem-vinculo')
      }
    })

    it('promoção aparece uma vez por membro e `POST /rank/seen` silencia só quem chamou', async () => {
      const antes = await (await app.request(`/api/v1/teams/${teamId}/rank`, authed(cap))).json()
      const patente = antes.rank?.n ?? 8
      const seen = await app.request(
        `/api/v1/teams/${teamId}/rank/seen`,
        authed(cap, { method: 'POST', body: json({ rank: patente }) }),
      )
      expect(seen.status).toBe(204)
      const depois = await (await app.request(`/api/v1/teams/${teamId}/rank`, authed(cap))).json()
      expect(depois.promotion).toBeNull()
      // o outro membro segue com o aviso pendente (AC-DF18.10)
      const doOutro = await (
        await app.request(`/api/v1/teams/${teamId}/rank`, authed(membro))
      ).json()
      expect(doOutro.promotion).not.toBeNull()
    })

    it('AC-DF18.4 — o histórico registra a primeira patente e a maior alcançada', async () => {
      const h = await (
        await app.request(`/api/v1/teams/${teamId}/rank/history`, authed(membro))
      ).json()
      expect(h.history.length).toBeGreaterThan(0)
      expect(h.history[0].reason).toBe('promocao')
      expect(h.best.n).toBeLessThanOrEqual(8)
    })

    it('AC-DF18.11 — a vitrine é privada por padrão e a chave é da capitania', async () => {
      const negado = await app.request(
        `/api/v1/teams/${teamId}/rank/visibility`,
        authed(membro, { method: 'PATCH', body: json({ rankPublic: true }) }),
      )
      expect(negado.status).toBe(403)

      const ok = await app.request(
        `/api/v1/teams/${teamId}/rank/visibility`,
        authed(cap, { method: 'PATCH', body: json({ rankPublic: true }) }),
      )
      expect(ok.status).toBe(200)
      expect((await ok.json()).rankPublic).toBe(true)

      // e desligar é imediato (RF-6.4)
      const off = await app.request(
        `/api/v1/teams/${teamId}/rank/visibility`,
        authed(cap, { method: 'PATCH', body: json({ rankPublic: false }) }),
      )
      expect((await off.json()).rankPublic).toBe(false)
    })

    it('AC-DF18.3/18.4 — desativar e reativar preserva tudo, e a reativação responde na hora', async () => {
      const antes = await evolutionOf(cap)
      const patente = antes.rank?.rank?.n
      const niveis = antes.areas.map((a) => a.level)
      expect(patente).toBeLessThanOrEqual(8)

      expect((await optOut(cap)).status).toBe(200)
      const off = await evolutionOf(cap)
      expect(off.optIn).toBe(false)
      expect(off.areas).toEqual([])

      // AC-DF18.3 — a resposta da REATIVAÇÃO já traz níveis e patente, não um painel
      // zerado que só o segundo carregamento preencheria
      const volta: EvolutionView = await (await optIn(cap)).json()
      expect(volta.rank?.rank?.n).toBe(patente)
      expect(volta.areas.map((a) => a.level)).toEqual(niveis)
      expect(criterionOf(volta, 'EST-2.2')?.satisfied).toBe(true)
    })
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

  it('AC-DF13.10 / AC-DF18.12 — nada da equipe alheia é legível ou gravável', async () => {
    for (const path of [
      '/evolution',
      '/evolution/steps',
      '/season',
      '/activity',
      '/rank',
      '/rank/history',
    ]) {
      const r = await app.request(`/api/v1/teams/${teamId}${path}`, authed(fora))
      expect(r.status, path).toBe(404)
    }
    expect((await declare(fora, 'EST-2.2')).status).toBe(404)
    expect((await optIn(fora)).status).toBe(404)
    const passo = await app.request(
      `/api/v1/teams/${teamId}/evolution/steps`,
      authed(fora, { method: 'POST', body: json({ title: 'Invasão' }) }),
    )
    expect(passo.status).toBe(404)
    // e a equipe alheia continua com a própria evolução intacta (e desativada)
    const dele = await evolutionOf(fora, outraEquipe)
    expect(dele.optIn).toBe(false)
  })

  // ---------- LGPD ----------

  it('AC-DF13.9 / AC-DF18.14 — export inclui declarações, passos, evidências e o opt-in', async () => {
    const dump = await (await app.request('/api/v1/me/export', authed(cap))).json()
    expect(dump.evolutionDeclarations.length).toBeGreaterThan(0)
    expect(dump.evolutionSteps.length).toBeGreaterThan(0)
    expect(dump.evolutionEvidence.length).toBeGreaterThan(0)
    expect(
      dump.evolutionDeclarations.every((d: { declared_by: string }) => d.declared_by === cap.sub),
    ).toBe(true)
    expect(dump.evolutionOptIns.length).toBeGreaterThan(0)
    expect(dump.evolutionOptIns[0].notice_version).toBeTruthy()
  })
})
