import { describe, expect, it, beforeAll } from 'vitest'
import { templateCage } from '@bajeiros/core/model/template'
import { app } from '../app'
import { authed, makeUser, type TestUser } from './helpers'

// DF-16 (EV-6) — o agregador do Início. UMA chamada alimenta a página inteira; o
// conteúdo todo nasce em outro DF.

const json = (body: unknown) => JSON.stringify(body)

interface Home {
  user: { id: string; displayName: string | null }
  team: { id: string; name: string; role: string } | null
  teams: { id: string }[]
  state: 'normal' | 'bootstrap' | 'sem-equipe'
  season?: { label: string; next: { title: string; daysLeft: number } | null } | null
  optIn?: boolean
  rank?: { rank: { n: number } | null; next: { missing: number } | null } | null
  evolution?: { average: number; areas: { area: string; level: number }[] } | null
  steps?: { id: string; title: string; destination: { page: string; tab?: string } }[]
  openSteps?: number
  activity?: { kind: string; payload: Record<string, unknown> }[]
  knowledge?: { decisions: number; guides: number }
  lastResult?: unknown
  continueEditor: { projectId: string; seq: number } | null
  continueAssistant: unknown
}

describe('DF-16 — GET /me/home', () => {
  let cap: TestUser
  let novato: TestUser
  let semEquipe: TestUser
  let teamId: string
  let projectId: string

  const home = async (by: TestUser, query = ''): Promise<Home> =>
    await (await app.request(`/api/v1/me/home${query}`, authed(by))).json()

  const post = (by: TestUser, path: string, body: unknown, id = teamId) =>
    app.request(`/api/v1/teams/${id}${path}`, authed(by, { method: 'POST', body: json(body) }))

  async function joinTeam(who: TestUser, approver: TestUser, status = 'efetivo') {
    const inv = await post(approver, '/invites', { email: who.email })
    const { token } = await inv.json()
    await app.request(
      '/api/v1/invites/accept',
      authed(who, { method: 'POST', body: json({ token }) }),
    )
    const fila = await (
      await app.request(`/api/v1/teams/${teamId}/join-requests`, authed(approver))
    ).json()
    const req = fila.find((r: { userId: string }) => r.userId === who.sub)
    await post(approver, `/join-requests/${req.id}/approve`, { status })
  }

  beforeAll(async () => {
    ;[cap, novato, semEquipe] = await Promise.all([
      makeUser('CapHome'),
      makeUser('NovatoHome'),
      makeUser('SozinhoHome'),
    ])
    for (const u of [cap, novato, semEquipe])
      await app.request('/api/v1/me', authed(u, { method: 'POST' }))
    teamId = (
      await (
        await app.request(
          '/api/v1/teams',
          authed(cap, { method: 'POST', body: json({ name: 'Equipe Início' }) }),
        )
      ).json()
    ).id
    await joinTeam(novato, cap, 'trainee')
    projectId = (
      await (
        await app.request(
          '/api/v1/projects',
          authed(cap, { method: 'POST', body: json({ name: 'Carro 2027' }) }),
        )
      ).json()
    ).id
    await app.request(
      `/api/v1/projects/${projectId}/transfer`,
      authed(cap, { method: 'POST', body: json({ teamId }) }),
    )
  })

  it('DF-18 AC-18.2 — sem opt-in o Início não mostra evolução, patente nem fila', async () => {
    const h = await home(cap)
    expect(h.optIn).toBe(false)
    expect(h.evolution).toBeNull()
    expect(h.rank).toBeNull()
    expect(h.steps).toEqual([])
    // o resto da página continua de pé: equipe, conhecimento, "continuar de onde parou"
    expect(h.team?.id).toBe(teamId)
  })

  it('AC-DF16.5 — equipe recém-criada cai no estado de bootstrap', async () => {
    await post(cap, '/evolution/optin', {})
    const h = await home(cap)
    expect(h.state).toBe('bootstrap')
    expect(h.team?.id).toBe(teamId)
    expect(h.team?.role).toBe('owner')
    expect(h.season).toBeNull()
  })

  it('AC-DF16.2 — os passos exibidos são os 3 primeiros da fila', async () => {
    const h = await home(cap)
    expect(h.steps).toHaveLength(3)
    expect(h.openSteps).toBeGreaterThan(3)
    const fila = await (
      await app.request(`/api/v1/teams/${teamId}/evolution/steps`, authed(cap))
    ).json()
    expect(h.steps!.map((s) => s.title)).toEqual(
      fila.slice(0, 3).map((s: { title: string }) => s.title),
    )
  })

  it('AC-DF16.3 — o CTA de cada passo tem destino', async () => {
    const h = await home(cap)
    for (const s of h.steps!) {
      expect(s.destination.page, s.title).toBeTruthy()
    }
    const designar = h.steps!.find((s) => s.title === 'Designar o projeto da temporada')
    expect(designar?.destination).toEqual({ page: 'equipe', tab: 'projetos' })
  })

  it('AC-DF16.6 — o trainee com trilha aberta vê a trilha como primeiro passo', async () => {
    await post(cap, '/guides', {
      title: 'Trilha de integração',
      kind: 'trilha',
      bodyMd: '1. Ler o regulamento\n2. Registrar a primeira decisão',
    })
    const doNovato = await home(novato)
    expect(doNovato.steps![0].title).toBe('Concluir a trilha de integração')
    expect(doNovato.steps![0].destination).toEqual({ page: 'equipe', tab: 'conhecimento' })

    const daCapita = await home(cap)
    expect(daCapita.steps![0].title).not.toBe('Concluir a trilha de integração')
  })

  it('AC-DF16.4/16.8 — temporada, contagem regressiva, evolução e atividade', async () => {
    const futuro = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10)
    await app.request(
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
    await app.request(
      `/api/v1/projects/${projectId}/snapshots`,
      authed(cap, {
        method: 'POST',
        body: json({ cage: { ...templateCage, members: [] }, expectedSeq: 0 }),
      }),
    )

    const h = await home(cap)
    expect(h.state).toBe('normal')
    expect(h.season?.label).toBe('2027')
    expect(h.season?.next?.daysLeft).toBe(10)
    expect(h.evolution?.areas).toHaveLength(6)
    // DF-19: a média só sobe com declaração; a equipe do teste ainda não declarou
    expect(h.evolution?.average).toBe(0)
    await post(cap, '/evolution/declarations/GES-1.1', {})
    expect((await home(cap)).evolution?.average).toBeGreaterThan(0)
    // DF-18 §7 — o Início carrega o emblema e a distância até a próxima patente
    expect(h.rank?.rank?.n).toBe(8)
    expect(h.rank?.next?.missing).toBeGreaterThan(0)

    const salvamento = h.activity!.find((e) => e.kind === 'validation.summary')
    expect(salvamento).toBeTruthy()
    expect((salvamento!.payload.counts as { fail: number }).fail).toBeGreaterThan(0)
  })

  it('AC-DF16.1 — uma chamada alimenta a página e o payload é enxuto', async () => {
    const r = await app.request('/api/v1/me/home', authed(cap))
    expect(r.status).toBe(200)
    const bytes = new TextEncoder().encode(await r.text()).length
    expect(bytes).toBeLessThan(20_000)
  })

  it('"continuar" é do usuário, não da equipe', async () => {
    const daCapita = await home(cap)
    expect(daCapita.continueEditor?.projectId).toBe(projectId)
    expect(daCapita.continueEditor?.seq).toBe(1)
    // o novato não salvou nada: módulo omitido, nunca card vazio
    const doNovato = await home(novato)
    expect(doNovato.continueEditor).toBeNull()
    expect(doNovato.continueAssistant).toBeNull()
  })

  it('AC-DF16.5 — sem equipe, o Início convida em vez de dar beco sem saída', async () => {
    const h = await home(semEquipe)
    expect(h.state).toBe('sem-equipe')
    expect(h.team).toBeNull()
    expect(h.teams).toEqual([])
    expect(h.steps).toBeUndefined()
    expect(h.rank).toBeUndefined()
    expect(h.continueEditor).toBeNull()
  })

  it('teamId inválido cai na equipe padrão em vez de quebrar', async () => {
    const h = await home(cap, '?teamId=00000000-0000-0000-0000-000000000000')
    expect(h.team?.id).toBe(teamId)
  })
})
