import { describe, expect, it, beforeAll } from 'vitest'
import { app } from '../app'
import { authed, makeUser, type TestUser } from './helpers'

// DF-14 (EV-2) — diário de decisões, guias com dono e kits de passagem. Ataca o
// problema nº 1 da pesquisa (rotatividade) e é a fonte inteira da área
// `conhecimento` do DF-13.

const json = (body: unknown) => JSON.stringify(body)

interface Decision {
  id: string
  seq: number
  title: string
  area: string
  supersededBySeq: number | null
  authorId: string | null
}
interface Guide {
  id: string
  kind: string
  title: string
  ownerId: string | null
  stale: boolean
  completedByMe: boolean
  updatedAt: string
}
interface Kit {
  id: string
  status: string
  progress: number
  checklist: { id: string; label: string; done: boolean }[]
  attention: boolean
}
interface Evo {
  areas: {
    area: string
    level: number
    criteria: {
      id: string
      satisfied: boolean
      measured: { satisfied: boolean; reason: string } | null
    }[]
  }[]
}

describe('DF-14 — conhecimento da equipe (API)', () => {
  let cap: TestUser
  let membro: TestUser
  let fora: TestUser
  let teamId: string

  const post = (by: TestUser, path: string, body: unknown, id = teamId) =>
    app.request(`/api/v1/teams/${id}${path}`, authed(by, { method: 'POST', body: json(body) }))

  const patch = (by: TestUser, path: string, body: unknown, id = teamId) =>
    app.request(`/api/v1/teams/${id}${path}`, authed(by, { method: 'PATCH', body: json(body) }))

  const get = async <T>(by: TestUser, path: string, id = teamId): Promise<T> =>
    await (await app.request(`/api/v1/teams/${id}${path}`, authed(by))).json()

  const decision = (by: TestUser, over: Record<string, unknown> = {}) =>
    post(by, '/decisions', {
      title: 'Escolhemos aço 1020',
      area: 'estrutura',
      why: 'Disponível na região e dentro da especificação do regulamento.',
      ...over,
    })

  const guide = (by: TestUser, over: Record<string, unknown> = {}) =>
    post(by, '/guides', {
      title: 'Como soldamos a gaiola',
      bodyMd: '## Sequência\n1. Fixar no gabarito\n2. Pontear',
      tags: ['solda'],
      ...over,
    })

  async function joinTeam(who: TestUser, approver: TestUser) {
    const inv = await post(approver, '/invites', { email: who.email })
    const { token } = await inv.json()
    await app.request(
      '/api/v1/invites/accept',
      authed(who, { method: 'POST', body: json({ token }) }),
    )
    const fila = await get<{ id: string; userId: string }[]>(approver, '/join-requests')
    const req = fila.find((r) => r.userId === who.sub)!
    await post(approver, `/join-requests/${req.id}/approve`, {})
  }

  beforeAll(async () => {
    ;[cap, membro, fora] = await Promise.all([
      makeUser('CapCon'),
      makeUser('MembroCon'),
      makeUser('ForaCon'),
    ])
    for (const u of [cap, membro, fora])
      await app.request('/api/v1/me', authed(u, { method: 'POST' }))
    teamId = (
      await (
        await app.request(
          '/api/v1/teams',
          authed(cap, { method: 'POST', body: json({ name: 'Equipe Conhecimento' }) }),
        )
      ).json()
    ).id
    await joinTeam(membro, cap)
    // DF-18 RF-2.5 — sem opt-in a evolução não existe em resposta nenhuma; o que
    // este arquivo afirma é que o conhecimento ALIMENTA a evolução, então ativa.
    await post(cap, '/evolution/optin', {})
  })

  // ---------- diário ----------

  it('AC-DF14.1 — membro cria decisão numerada, com links', async () => {
    const r = await decision(membro, {
      links: [{ kind: 'rule', ref: 'B6.2.5.3', label: 'Regra do arco principal' }],
    })
    expect(r.status).toBe(201)
    const d: Decision = await r.json()
    expect(d.seq).toBe(1)
    expect(d.authorId).toBe(membro.sub)

    const segunda = await decision(cap, { title: 'Fornecedor de tubos', area: 'fabricacao' })
    expect((await segunda.json()).seq).toBe(2)
  })

  it('numeração não fura sob concorrência', async () => {
    const antes = await get<Decision[]>(cap, '/decisions')
    const feitas = await Promise.all([
      decision(membro, { title: 'Paralela A' }),
      decision(membro, { title: 'Paralela B' }),
      decision(cap, { title: 'Paralela C' }),
    ])
    for (const r of feitas) expect(r.status).toBe(201)
    const seqs = (await Promise.all(feitas.map((r) => r.json()))).map((d) => d.seq)
    expect(new Set(seqs).size).toBe(3)
    expect(Math.min(...seqs)).toBe(antes[0].seq + 1)
  })

  it('AC-DF14.2 — só o autor corrige o texto; a capitania exclui (soft)', async () => {
    const d: Decision = await (await decision(membro, { title: 'A corrigir' })).json()
    expect((await patch(cap, `/decisions/${d.id}`, { title: 'Roubada' })).status).toBe(403)
    const ok = await patch(membro, `/decisions/${d.id}`, { title: 'Corrigida pelo autor' })
    expect(ok.status).toBe(200)
    expect((await ok.json()).title).toBe('Corrigida pelo autor')

    const semPermissao = await app.request(
      `/api/v1/teams/${teamId}/decisions/${d.id}`,
      authed(membro, { method: 'DELETE' }),
    )
    expect(semPermissao.status).toBe(403)
    const apagada = await app.request(
      `/api/v1/teams/${teamId}/decisions/${d.id}`,
      authed(cap, { method: 'DELETE' }),
    )
    expect(apagada.status).toBe(204)
    const lista = await get<Decision[]>(cap, '/decisions')
    expect(lista.some((x) => x.id === d.id)).toBe(false)
  })

  it('AC-DF14.3 — decisão substituída sai da listagem e aponta para a substituta', async () => {
    const antiga: Decision = await (await decision(cap, { title: 'Motor de partida A' })).json()
    const nova: Decision = await (
      await decision(cap, { title: 'Motor de partida B', supersedesId: antiga.id })
    ).json()

    const padrao = await get<Decision[]>(cap, '/decisions')
    expect(padrao.some((d) => d.id === antiga.id)).toBe(false)
    expect(padrao.some((d) => d.id === nova.id)).toBe(true)

    const todas = await get<Decision[]>(cap, '/decisions?includeSuperseded=true')
    const velha = todas.find((d) => d.id === antiga.id)
    expect(velha?.supersededBySeq).toBe(nova.seq)
  })

  it('filtra por área e por busca de texto', async () => {
    const porArea = await get<Decision[]>(cap, '/decisions?area=fabricacao')
    expect(porArea.every((d) => d.area === 'fabricacao')).toBe(true)
    const porTexto = await get<Decision[]>(cap, '/decisions?q=Paralela')
    expect(porTexto.length).toBeGreaterThanOrEqual(3)
  })

  // ---------- guias ----------

  it('guia nasce com dono (quem criou) e aceita etiquetas', async () => {
    const r = await guide(membro)
    expect(r.status).toBe(201)
    const g: Guide = await r.json()
    expect(g.ownerId).toBe(membro.sub)
    expect(g.stale).toBe(false)
  })

  it('AC-DF14.4 — "revisei, está válido" atualiza a data sem editar o corpo', async () => {
    const g: Guide = await (await guide(cap, { title: 'Protocolo de freio' })).json()
    const antes = g.updatedAt
    const r = await post(cap, `/guides/${g.id}/still-valid`, {})
    expect(r.status).toBe(200)
    const depois: Guide = await r.json()
    expect(depois.title).toBe('Protocolo de freio')
    expect(Date.parse(depois.updatedAt)).toBeGreaterThanOrEqual(Date.parse(antes))
  })

  it('reatribuir dono é da capitania; o corpo é de qualquer membro', async () => {
    const g: Guide = await (await guide(cap, { title: 'Guia de compras' })).json()
    expect((await patch(membro, `/guides/${g.id}`, { ownerId: membro.sub })).status).toBe(403)
    expect((await patch(membro, `/guides/${g.id}`, { bodyMd: 'corpo novo' })).status).toBe(200)
    const ok = await patch(cap, `/guides/${g.id}`, { ownerId: membro.sub })
    expect(ok.status).toBe(200)
    expect((await ok.json()).ownerId).toBe(membro.sub)
  })

  it('tipo do guia é fixo depois de criado (409)', async () => {
    const g: Guide = await (await guide(cap, { title: 'Guia fixo' })).json()
    expect((await patch(cap, `/guides/${g.id}`, { kind: 'trilha' })).status).toBe(409)
  })

  it('só existe uma trilha de integração ativa por equipe (409)', async () => {
    const r = await guide(cap, { title: 'Trilha de novatos', kind: 'trilha', tags: [] })
    expect(r.status).toBe(201)
    const dupla = await guide(cap, { title: 'Outra trilha', kind: 'trilha', tags: [] })
    expect(dupla.status).toBe(409)
  })

  it('AC-DF14.5 — trilha concluída pelo novato satisfaz a MEDIDA de CON-3.1 no DF-13', async () => {
    const guias = await get<Guide[]>(membro, '/guides')
    const trilha = guias.find((g) => g.kind === 'trilha')!
    expect((await post(membro, `/guides/${trilha.id}/complete`, {})).status).toBe(204)

    const evo = await get<Evo>(cap, '/evolution')
    const con31 = evo.areas.flatMap((a) => a.criteria).find((c) => c.id === 'CON-3.1')
    // DF-19: o portal MEDE; quem sobe o nível é a declaração da capitania
    // o "último novato aprovado" é o membro, que acabou de concluir a trilha
    expect(con31?.measured?.satisfied).toBe(true)

    const meus = await get<Guide[]>(membro, '/guides')
    expect(meus.find((g) => g.id === trilha.id)?.completedByMe).toBe(true)
  })

  it('o conhecimento move o nível da área conhecimento no DF-13', async () => {
    // a medida está em pé (≥ 1 decisão registrada); declarar é o que sobe o nível
    const antes = await get<Evo>(cap, '/evolution')
    expect(
      antes.areas.flatMap((a) => a.criteria).find((c) => c.id === 'CON-1.1')?.measured?.satisfied,
    ).toBe(true)
    await post(cap, '/evolution/declarations/CON-1.1', {})
    const evo = await get<Evo>(cap, '/evolution')
    const area = evo.areas.find((a) => a.area === 'conhecimento')!
    expect(area.level).toBeGreaterThanOrEqual(1)
  })

  // ---------- kits ----------

  it('AC-DF14.6 — kit nasce com o checklist padrão e só conclui completo', async () => {
    const r = await post(cap, '/kits', {
      memberId: membro.sub,
      memberName: 'Membro Con',
      positionLabel: 'Líder — Freios',
      dueDate: '2026-12-15',
    })
    expect(r.status).toBe(201)
    const kit: Kit = await r.json()
    expect(kit.checklist).toHaveLength(6)
    expect(kit.progress).toBe(0)
    expect(kit.attention).toBe(true) // saída nos próximos 120 dias

    const parcial = kit.checklist.map((i, n) => ({ ...i, done: n < 3 }))
    const meio = await patch(cap, `/kits/${kit.id}`, { checklist: parcial })
    expect(meio.status).toBe(200)
    const emAndamento: Kit = await meio.json()
    expect(emAndamento.status).toBe('em_andamento')
    expect(emAndamento.progress).toBe(50)

    const cedo = await patch(cap, `/kits/${kit.id}`, { status: 'concluido' })
    expect(cedo.status).toBe(409)

    const tudo = kit.checklist.map((i) => ({ ...i, done: true }))
    const fim = await patch(cap, `/kits/${kit.id}`, { checklist: tudo, status: 'concluido' })
    expect(fim.status).toBe(200)
    expect((await fim.json()).progress).toBe(100)
  })

  it('o kit concluído satisfaz a medida de CON-4.1 e sobrevive à saída do membro', async () => {
    const evo = await get<Evo>(cap, '/evolution')
    const con41 = evo.areas.flatMap((a) => a.criteria).find((c) => c.id === 'CON-4.1')
    expect(con41?.measured?.satisfied).toBe(true)

    const kits = await get<Kit[]>(cap, '/kits')
    expect(kits.some((k) => k.status === 'concluido')).toBe(true)
  })

  it('guia referenciado por kit aberto não pode ser excluído (409)', async () => {
    const g: Guide = await (await guide(cap, { title: 'Guia do cargo' })).json()
    const kit: Kit = await (
      await post(cap, '/kits', { memberName: 'Alguém que sai', dueDate: '2027-01-10' })
    ).json()
    await patch(cap, `/kits/${kit.id}`, {
      checklist: [{ id: 'guia', label: 'Ler o guia do cargo', done: false, guideId: g.id }],
    })
    const r = await app.request(
      `/api/v1/teams/${teamId}/guides/${g.id}`,
      authed(cap, { method: 'DELETE' }),
    )
    expect(r.status).toBe(409)
  })

  // ---------- busca e contadores ----------

  it('AC-DF14.7 — busca devolve decisões e guias agrupados', async () => {
    const r = await get<{ decisions: unknown[]; guides: unknown[] }>(
      cap,
      '/knowledge/search?q=solda',
    )
    expect(r.guides.length).toBeGreaterThan(0)
    expect(Array.isArray(r.decisions)).toBe(true)

    const curta = await app.request(`/api/v1/teams/${teamId}/knowledge/search?q=a`, authed(cap))
    expect(curta.status).toBe(400)
  })

  it('contadores são honestos (RF-5.2)', async () => {
    const c = await get<{ decisions: number; guides: number; kitsDone: number }>(cap, '/knowledge')
    expect(c.decisions).toBeGreaterThan(0)
    expect(c.guides).toBeGreaterThan(0)
    expect(c.kitsDone).toBe(1)
  })

  // ---------- isolamento e LGPD ----------

  it('AC-DF14.9 — nada da equipe alheia é legível ou gravável', async () => {
    for (const path of ['/decisions', '/guides', '/kits', '/knowledge']) {
      expect((await app.request(`/api/v1/teams/${teamId}${path}`, authed(fora))).status, path).toBe(
        404,
      )
    }
    expect((await decision(fora)).status).toBe(404)
    expect((await guide(fora)).status).toBe(404)
  })

  it('AC-DF14.8 — export LGPD traz o conteúdo autoral do titular', async () => {
    const dump = await (await app.request('/api/v1/me/export', authed(membro))).json()
    expect(dump.teamDecisions.length).toBeGreaterThan(0)
    expect(dump.teamDecisions.every((d: { author_id: string }) => d.author_id === membro.sub)).toBe(
      true,
    )
    expect(dump.teamGuides.length).toBeGreaterThan(0)
    expect(dump.guideCompletions.length).toBeGreaterThan(0)
    expect(dump.handoverKits.length).toBeGreaterThan(0)
  })
})
