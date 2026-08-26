import { describe, expect, it, beforeAll } from 'vitest'
import pg from 'pg'
import { app } from '../app'
import { authed, makeUser, type TestUser } from './helpers'

// DF-10 — capitania (1 capitã/capitão + até 2 co-capitães), organograma de funções
// e confirmação de entrada. Invariantes de capitania são gate desta feature.

interface Position {
  id: string
  parentId: string | null
  kind: 'captain' | 'cocaptain' | 'lead' | 'custom'
  name: string
  description: string | null
  sortOrder: number
}

interface Member {
  userId: string
  role: string
  status: string
  positionId: string | null
}

const json = (body: unknown) => JSON.stringify(body)

describe('DF-10 — capitania, organograma e confirmação de entrada', () => {
  let cap: TestUser // capitã (owner)
  let co1: TestUser // co-capitão
  let co2: TestUser // co-capitã
  let m1: TestUser // membro
  let m2: TestUser // membro
  let fora: TestUser // de fora
  let teamId: string

  async function newTeam(by: TestUser, name: string): Promise<string> {
    const r = await app.request(
      '/api/v1/teams',
      authed(by, { method: 'POST', body: json({ name }) }),
    )
    expect(r.status).toBe(201)
    return (await r.json()).id
  }

  async function detail(by: TestUser, id = teamId) {
    const r = await app.request(`/api/v1/teams/${id}`, authed(by))
    return { status: r.status, body: await r.json() }
  }

  async function positionsOf(by: TestUser, id = teamId): Promise<Position[]> {
    return (await detail(by, id)).body.positions
  }

  async function membersOf(by: TestUser, id = teamId): Promise<Member[]> {
    return (await detail(by, id)).body.members
  }

  // convite → aceite (vira solicitação) → confirmação da capitania
  async function joinTeam(who: TestUser, approver: TestUser, id = teamId) {
    const inv = await app.request(
      `/api/v1/teams/${id}/invites`,
      authed(approver, { method: 'POST', body: json({ email: who.email }) }),
    )
    const { token } = await inv.json()
    expect(
      (
        await app.request(
          '/api/v1/invites/accept',
          authed(who, { method: 'POST', body: json({ token }) }),
        )
      ).status,
    ).toBe(200)
    const fila = await (
      await app.request(`/api/v1/teams/${id}/join-requests`, authed(approver))
    ).json()
    const request = fila.find((r: { userId: string }) => r.userId === who.sub)
    expect(request).toBeTruthy()
    const ok = await app.request(
      `/api/v1/teams/${id}/join-requests/${request.id}/approve`,
      authed(approver, { method: 'POST', body: json({}) }),
    )
    expect(ok.status).toBe(204)
  }

  async function setRole(by: TestUser, target: TestUser, role: string, id = teamId) {
    return app.request(
      `/api/v1/teams/${id}/members/${target.sub}`,
      authed(by, { method: 'PATCH', body: json({ role }) }),
    )
  }

  beforeAll(async () => {
    ;[cap, co1, co2, m1, m2, fora] = await Promise.all([
      makeUser('Cap'),
      makeUser('Co1'),
      makeUser('Co2'),
      makeUser('M1'),
      makeUser('M2'),
      makeUser('Fora'),
    ])
    for (const u of [cap, co1, co2, m1, m2, fora])
      await app.request('/api/v1/me', authed(u, { method: 'POST' }))
    teamId = await newTeam(cap, 'Equipe Organograma')
    for (const u of [co1, co2, m1, m2]) await joinTeam(u, cap)
  })

  // ---------- organograma padrão ----------

  it('equipe nova nasce com o organograma padrão de equipe de elite', async () => {
    const { body } = await detail(cap)
    const positions: Position[] = body.positions
    expect(positions).toHaveLength(14) // capitania (2) + 6 líderes + 6 nós de membros
    const captain = positions.find((p) => p.kind === 'captain')!
    const cocaptain = positions.find((p) => p.kind === 'cocaptain')!
    expect(captain.parentId).toBeNull()
    expect(cocaptain.parentId).toBe(captain.id)
    expect(positions.filter((p) => p.kind === 'lead')).toHaveLength(6)
    // toda função traz descrição de responsabilidades (RF-5.1)
    expect(positions.every((p) => (p.description ?? '').length > 10)).toBe(true)
    // a capitania não é atribuída: os nós de capitania mostram quem tem o papel
    const me = body.members.find((m: Member) => m.userId === cap.sub)
    expect(me.positionId).toBeNull()
    expect(me.role).toBe('owner')
  })

  it('seed é idempotente: rodar de novo não duplica funções', async () => {
    const r = await app.request(
      `/api/v1/teams/${teamId}/positions/seed`,
      authed(cap, { method: 'POST' }),
    )
    expect(r.status).toBe(200)
    const body = await r.json()
    expect(body.created).toBe(0)
    expect(body.positions).toHaveLength(14)
  })

  it('não-membro não enxerga funções nem a fila de entrada', async () => {
    expect((await app.request(`/api/v1/teams/${teamId}/positions`, authed(fora))).status).toBe(404)
    expect((await app.request(`/api/v1/teams/${teamId}/join-requests`, authed(fora))).status).toBe(
      404,
    )
  })

  // ---------- CRUD de funções ----------

  it('capitania cria função filha; membro comum não', async () => {
    const positions = await positionsOf(cap)
    const freios = positions.find((p) => p.name.includes('Freios'))!
    const negado = await app.request(
      `/api/v1/teams/${teamId}/positions`,
      authed(m1, {
        method: 'POST',
        body: json({ name: 'Ensaios', parentId: freios.id }),
      }),
    )
    expect(negado.status).toBe(403)

    const r = await app.request(
      `/api/v1/teams/${teamId}/positions`,
      authed(cap, {
        method: 'POST',
        body: json({
          name: 'Ensaios de frenagem',
          description: 'Planeja e executa os ensaios de frenagem antes da competição.',
          parentId: freios.id,
        }),
      }),
    )
    expect(r.status).toBe(201)
    const node = await r.json()
    expect(node.parentId).toBe(freios.id)
    expect(node.kind).toBe('custom')
  })

  it('função-mãe inexistente → 400; profundidade acima de 5 níveis → 409', async () => {
    const semMae = await app.request(
      `/api/v1/teams/${teamId}/positions`,
      authed(cap, {
        method: 'POST',
        body: json({ name: 'Solta', parentId: '00000000-0000-0000-0000-000000000000' }),
      }),
    )
    expect(semMae.status).toBe(400)

    // captain(1) > cocaptain(2) > lead(3) > Membros(4) > novo(5) > estouraria(6)
    const positions = await positionsOf(cap)
    const membros = positions.find(
      (p) =>
        p.name === 'Membros' &&
        positions.find((x) => x.id === p.parentId)?.name.includes('Eletrônica'),
    )!
    const nivel5 = await app.request(
      `/api/v1/teams/${teamId}/positions`,
      authed(cap, { method: 'POST', body: json({ name: 'Telemetria', parentId: membros.id }) }),
    )
    expect(nivel5.status).toBe(201)
    const nivel6 = await app.request(
      `/api/v1/teams/${teamId}/positions`,
      authed(cap, {
        method: 'POST',
        body: json({ name: 'Fundo do poço', parentId: (await nivel5.json()).id }),
      }),
    )
    expect(nivel6.status).toBe(409)
    expect((await nivel6.json()).title).toBe('Hierarquia muito profunda')
  })

  it('capitania não se move nem se exclui, mas pode ser renomeada', async () => {
    const positions = await positionsOf(cap)
    const captain = positions.find((p) => p.kind === 'captain')!
    const lead = positions.find((p) => p.kind === 'lead')!

    const mover = await app.request(
      `/api/v1/teams/${teamId}/positions/${captain.id}`,
      authed(cap, { method: 'PATCH', body: json({ parentId: lead.id }) }),
    )
    expect(mover.status).toBe(409)
    expect((await mover.json()).title).toBe('Função da capitania')

    const excluir = await app.request(
      `/api/v1/teams/${teamId}/positions/${captain.id}`,
      authed(cap, { method: 'DELETE' }),
    )
    expect(excluir.status).toBe(409)

    const renomear = await app.request(
      `/api/v1/teams/${teamId}/positions/${captain.id}`,
      authed(cap, { method: 'PATCH', body: json({ name: 'Capitã-geral' }) }),
    )
    expect(renomear.status).toBe(200)
    expect((await renomear.json()).name).toBe('Capitã-geral')
  })

  it('mover função para baixo de um descendente → 409 (ciclo)', async () => {
    const positions = await positionsOf(cap)
    const lead = positions.find((p) => p.name.includes('Trem de Força'))!
    const filho = positions.find((p) => p.parentId === lead.id)!
    const r = await app.request(
      `/api/v1/teams/${teamId}/positions/${lead.id}`,
      authed(cap, { method: 'PATCH', body: json({ parentId: filho.id }) }),
    )
    expect(r.status).toBe(409)
    expect((await r.json()).title).toBe('Hierarquia inválida')
  })

  it('excluir função: filhos sobem de nível e ocupantes ficam sem função (sem sair da equipe)', async () => {
    const positions = await positionsOf(cap)
    const lead = positions.find((p) => p.name.includes('Suspensão'))!
    const filho = positions.find((p) => p.parentId === lead.id)!

    // m1 ocupa a função que será excluída
    const atribuir = await app.request(
      `/api/v1/teams/${teamId}/members/${m1.sub}`,
      authed(cap, { method: 'PATCH', body: json({ positionId: lead.id }) }),
    )
    expect(atribuir.status).toBe(204)

    const r = await app.request(
      `/api/v1/teams/${teamId}/positions/${lead.id}`,
      authed(cap, { method: 'DELETE' }),
    )
    expect(r.status).toBe(204)

    const depois = await detail(cap)
    expect(depois.body.positions.find((p: Position) => p.id === lead.id)).toBeUndefined()
    expect(depois.body.positions.find((p: Position) => p.id === filho.id)!.parentId).toBe(
      lead.parentId,
    )
    const membro = depois.body.members.find((m: Member) => m.userId === m1.sub)!
    expect(membro.positionId).toBeNull()
    expect(membro.role).toBe('member') // continua na equipe
  })

  it('função de outra equipe → 400; nó de capitania não se atribui à mão → 409', async () => {
    const outraId = await newTeam(fora, 'Equipe alheia')
    const alheias = await positionsOf(fora, outraId)
    const r = await app.request(
      `/api/v1/teams/${teamId}/members/${m1.sub}`,
      authed(cap, { method: 'PATCH', body: json({ positionId: alheias[0].id }) }),
    )
    expect(r.status).toBe(400)

    const captain = (await positionsOf(cap)).find((p) => p.kind === 'captain')!
    const capt = await app.request(
      `/api/v1/teams/${teamId}/members/${m1.sub}`,
      authed(cap, { method: 'PATCH', body: json({ positionId: captain.id }) }),
    )
    expect(capt.status).toBe(409)
    expect((await capt.json()).title).toBe('Função da capitania')
  })

  it('limite de 40 funções por equipe', async () => {
    const soloId = await newTeam(fora, 'Equipe do limite')
    const raiz = (await positionsOf(fora, soloId)).find((p) => p.kind === 'captain')!
    let ultimo = 201
    for (let i = 0; i < 27 && ultimo === 201; i++) {
      const r = await app.request(
        `/api/v1/teams/${soloId}/positions`,
        authed(fora, { method: 'POST', body: json({ name: `Extra ${i}`, parentId: raiz.id }) }),
      )
      ultimo = r.status
    }
    expect(ultimo).toBe(409)
    expect(await positionsOf(fora, soloId)).toHaveLength(40)
  })

  // ---------- ciclo de vida do membro ----------

  it('capitania alterna trainee/efetivo e o membro vê a própria situação', async () => {
    const r = await app.request(
      `/api/v1/teams/${teamId}/members/${m2.sub}`,
      authed(cap, { method: 'PATCH', body: json({ status: 'trainee' }) }),
    )
    expect(r.status).toBe(204)
    expect((await membersOf(m2)).find((m) => m.userId === m2.sub)!.status).toBe('trainee')

    await app.request(
      `/api/v1/teams/${teamId}/members/${m2.sub}`,
      authed(cap, { method: 'PATCH', body: json({ status: 'efetivo' }) }),
    )
    expect((await membersOf(cap)).find((m) => m.userId === m2.sub)!.status).toBe('efetivo')
  })

  it('quem está na capitania também pode liderar um subsistema', async () => {
    const lead = (await positionsOf(cap)).find((p) => p.name.includes('Eletrônica'))!
    const r = await app.request(
      `/api/v1/teams/${teamId}/members/${cap.sub}`,
      authed(cap, { method: 'PATCH', body: json({ positionId: lead.id }) }),
    )
    expect(r.status).toBe(204)
    expect((await membersOf(cap)).find((m) => m.userId === cap.sub)!.positionId).toBe(lead.id)
    // e volta atrás sem prejuízo
    await app.request(
      `/api/v1/teams/${teamId}/members/${cap.sub}`,
      authed(cap, { method: 'PATCH', body: json({ positionId: null }) }),
    )
  })

  it('nó de capitania não se atribui à mão (quem ocupa é quem tem o papel)', async () => {
    const captain = (await positionsOf(cap)).find((p) => p.kind === 'captain')!
    const r = await app.request(
      `/api/v1/teams/${teamId}/members/${m1.sub}`,
      authed(cap, { method: 'PATCH', body: json({ positionId: captain.id }) }),
    )
    expect(r.status).toBe(409)
    expect((await r.json()).title).toBe('Função da capitania')
  })

  it('"minhas equipes" não lista equipe alheia, nem para admin do portal', async () => {
    const root = await makeUser('Root10')
    await app.request('/api/v1/me', authed(root, { method: 'POST' }))
    const owner = new pg.Client({ connectionString: process.env.DATABASE_URL })
    await owner.connect()
    await owner.query('UPDATE users SET is_admin = true WHERE id = $1', [root.sub])
    await owner.end()

    const rows = await (await app.request('/api/v1/teams', authed(root))).json()
    expect(rows.map((t: { id: string }) => t.id)).not.toContain(teamId)
  })

  it('PATCH que falha na validação não deixa meia mutação gravada', async () => {
    const antes = (await membersOf(cap)).find((m) => m.userId === m1.sub)!
    const r = await app.request(
      `/api/v1/teams/${teamId}/members/${m1.sub}`,
      authed(cap, {
        method: 'PATCH',
        body: json({ status: 'trainee', positionId: '00000000-0000-0000-0000-000000000000' }),
      }),
    )
    expect(r.status).toBe(400)
    const depois = (await membersOf(cap)).find((m) => m.userId === m1.sub)!
    expect(depois.status).toBe(antes.status)
    expect(depois.positionId).toBe(antes.positionId)
  })

  it('membro comum não atribui função nem situação a outra pessoa', async () => {
    const alvo = (await positionsOf(m1)).find((p) => p.kind === 'lead')!
    const r = await app.request(
      `/api/v1/teams/${teamId}/members/${m2.sub}`,
      authed(m1, { method: 'PATCH', body: json({ positionId: alvo.id }) }),
    )
    expect(r.status).toBe(403)
  })

  // ---------- capitania ----------

  it('co-capitã confirma entrada e organiza funções, mas não troca papéis', async () => {
    expect((await setRole(cap, co1, 'admin')).status).toBe(204)
    const novo = await makeUser('Novato')
    await app.request('/api/v1/me', authed(novo, { method: 'POST' }))
    await joinTeam(novo, co1) // co-capitã convida, aceita e CONFIRMA

    const lead = (await positionsOf(co1)).find((p) => p.kind === 'lead')!
    const criar = await app.request(
      `/api/v1/teams/${teamId}/positions`,
      authed(co1, { method: 'POST', body: json({ name: 'Bancada', parentId: lead.id }) }),
    )
    expect(criar.status).toBe(201)

    expect((await setRole(co1, m2, 'admin')).status).toBe(403)
  })

  it('promover a co-capitão preserva a função de subsistema da pessoa', async () => {
    const lead = (await positionsOf(cap)).find((p) => p.name.includes('Freios'))!
    expect(
      (
        await app.request(
          `/api/v1/teams/${teamId}/members/${m2.sub}`,
          authed(cap, { method: 'PATCH', body: json({ positionId: lead.id }) }),
        )
      ).status,
    ).toBe(204)
    expect((await setRole(cap, m2, 'admin')).status).toBe(204)
    // a promoção não pode apagar a liderança que a pessoa já exercia
    expect((await membersOf(cap)).find((m) => m.userId === m2.sub)!.positionId).toBe(lead.id)
    expect((await setRole(cap, m2, 'member')).status).toBe(204)
    expect((await membersOf(cap)).find((m) => m.userId === m2.sub)!.positionId).toBe(lead.id)
    await app.request(
      `/api/v1/teams/${teamId}/members/${m2.sub}`,
      authed(cap, { method: 'PATCH', body: json({ positionId: null }) }),
    )
  })

  it('máximo de 2 co-capitães', async () => {
    expect((await setRole(cap, co2, 'admin')).status).toBe(204)
    const terceiro = await setRole(cap, m2, 'admin')
    expect(terceiro.status).toBe(409)
    expect((await terceiro.json()).title).toBe('Limite de co-capitania')
  })

  it('duas promoções concorrentes não furam o limite de co-capitania', async () => {
    const [x, y, z] = await Promise.all([makeUser('X'), makeUser('Y'), makeUser('Z')])
    for (const u of [x, y, z]) await app.request('/api/v1/me', authed(u, { method: 'POST' }))
    const raceId = await newTeam(cap, 'Equipe da corrida')
    for (const u of [x, y, z]) await joinTeam(u, cap, raceId)

    expect((await setRole(cap, x, 'admin', raceId)).status).toBe(204) // 1 de 2 vagas
    const [a, b] = await Promise.all([
      setRole(cap, y, 'admin', raceId),
      setRole(cap, z, 'admin', raceId),
    ])
    const status = [a.status, b.status].sort()
    expect(status).toEqual([204, 409])
    const admins = (await membersOf(cap, raceId)).filter((m) => m.role === 'admin')
    expect(admins).toHaveLength(2)
  })

  it('promover a capitão via PATCH é recusado — a capitania é única', async () => {
    const r = await setRole(cap, m2, 'owner')
    expect(r.status).toBe(409)
    expect((await r.json()).title).toBe('Capitania é única')
  })

  it('só a capitã transfere a capitania, e não para si mesma', async () => {
    const porCo = await app.request(
      `/api/v1/teams/${teamId}/transfer-captaincy`,
      authed(co1, { method: 'POST', body: json({ toUserId: m2.sub }) }),
    )
    expect(porCo.status).toBe(403)

    const paraSi = await app.request(
      `/api/v1/teams/${teamId}/transfer-captaincy`,
      authed(cap, { method: 'POST', body: json({ toUserId: cap.sub }) }),
    )
    expect(paraSi.status).toBe(409)
  })

  it('transferência troca a capitania numa transação: sempre exatamente 1 capitão', async () => {
    // co1 e co2 ocupam as duas vagas de co-capitania → a ex-capitã vira membro
    const r = await app.request(
      `/api/v1/teams/${teamId}/transfer-captaincy`,
      authed(cap, { method: 'POST', body: json({ toUserId: m2.sub }) }),
    )
    expect(r.status).toBe(200)
    expect((await r.json()).previousCaptainRole).toBe('member')

    const members = await membersOf(m2)
    expect(members.filter((m) => m.role === 'owner').map((m) => m.userId)).toEqual([m2.sub])
    expect(members.find((m) => m.userId === cap.sub)!.role).toBe('member')
  })

  it('ex-capitã vira co-capitã quando há vaga', async () => {
    expect((await setRole(m2, co2, 'member')).status).toBe(204) // abre 1 vaga
    const r = await app.request(
      `/api/v1/teams/${teamId}/transfer-captaincy`,
      authed(m2, { method: 'POST', body: json({ toUserId: cap.sub }) }),
    )
    expect(r.status).toBe(200)
    expect((await r.json()).previousCaptainRole).toBe('admin')
    const members = await membersOf(cap)
    expect(members.find((m) => m.userId === cap.sub)!.role).toBe('owner')
    expect(members.find((m) => m.userId === m2.sub)!.role).toBe('admin')
  })

  // ---------- fila de entrada ----------

  it('capitania recusa solicitação e ela some da fila', async () => {
    const alvo = await makeUser('Recusado')
    await app.request('/api/v1/me', authed(alvo, { method: 'POST' }))
    const inv = await app.request(
      `/api/v1/teams/${teamId}/invites`,
      authed(cap, { method: 'POST', body: json({ email: alvo.email }) }),
    )
    const { token } = await inv.json()
    await app.request(
      '/api/v1/invites/accept',
      authed(alvo, { method: 'POST', body: json({ token }) }),
    )
    const fila = await (
      await app.request(`/api/v1/teams/${teamId}/join-requests`, authed(cap))
    ).json()
    const pedido = fila.find((r: { userId: string }) => r.userId === alvo.sub)
    expect(pedido).toBeTruthy()

    const r = await app.request(
      `/api/v1/teams/${teamId}/join-requests/${pedido.id}`,
      authed(cap, { method: 'DELETE' }),
    )
    expect(r.status).toBe(204)
    expect((await detail(cap)).body.joinRequests).toEqual([])
    // recusado continua fora da equipe
    expect((await detail(alvo)).status).toBe(404)
  })

  it('quem pediu pode desistir da própria solicitação', async () => {
    const alvo = await makeUser('Desistente')
    await app.request('/api/v1/me', authed(alvo, { method: 'POST' }))
    const inv = await app.request(
      `/api/v1/teams/${teamId}/invites`,
      authed(cap, { method: 'POST', body: json({ email: alvo.email }) }),
    )
    const { token } = await inv.json()
    await app.request(
      '/api/v1/invites/accept',
      authed(alvo, { method: 'POST', body: json({ token }) }),
    )
    const mine = await (await app.request('/api/v1/teams/join-requests/mine', authed(alvo))).json()
    expect(mine).toHaveLength(1)

    const r = await app.request(
      `/api/v1/teams/${teamId}/join-requests/${mine[0].id}`,
      authed(alvo, { method: 'DELETE' }),
    )
    expect(r.status).toBe(204)
    expect(
      await (await app.request('/api/v1/teams/join-requests/mine', authed(alvo))).json(),
    ).toEqual([])
  })

  it('estranho não recusa solicitação de outra equipe (404 uniforme)', async () => {
    const alvo = await makeUser('Pendente')
    await app.request('/api/v1/me', authed(alvo, { method: 'POST' }))
    const inv = await app.request(
      `/api/v1/teams/${teamId}/invites`,
      authed(cap, { method: 'POST', body: json({ email: alvo.email }) }),
    )
    const { token } = await inv.json()
    await app.request(
      '/api/v1/invites/accept',
      authed(alvo, { method: 'POST', body: json({ token }) }),
    )
    const fila = await (
      await app.request(`/api/v1/teams/${teamId}/join-requests`, authed(cap))
    ).json()
    const pedido = fila.find((r: { userId: string }) => r.userId === alvo.sub)
    const r = await app.request(
      `/api/v1/teams/${teamId}/join-requests/${pedido.id}`,
      authed(fora, { method: 'DELETE' }),
    )
    expect(r.status).toBe(404)
  })

  // ---------- concorrência e estados legados ----------

  it('sair da equipe durante uma transferência não deixa a equipe sem capitã(o)', async () => {
    const [a, b] = await Promise.all([makeUser('CorridaA'), makeUser('CorridaB')])
    for (const u of [a, b]) await app.request('/api/v1/me', authed(u, { method: 'POST' }))
    const id = await newTeam(a, 'Equipe da saída')
    await joinTeam(b, a, id)

    const [transfer, leave] = await Promise.all([
      app.request(
        `/api/v1/teams/${id}/transfer-captaincy`,
        authed(a, { method: 'POST', body: json({ toUserId: b.sub }) }),
      ),
      app.request(`/api/v1/teams/${id}/members/${b.sub}`, authed(b, { method: 'DELETE' })),
    ])
    // qualquer ordem serve, desde que a equipe não fique acéfala
    expect([200, 404]).toContain(transfer.status)
    expect([204, 409]).toContain(leave.status)
    const restantes = await membersOf(a, id).catch(() => [])
    if (restantes.length > 0) {
      expect(restantes.filter((m) => m.role === 'owner').length).toBe(1)
    }
  })

  it('equipe que fica sem ninguém não deixa convite vivo apontando p/ o vazio', async () => {
    const [solo, convidado] = await Promise.all([makeUser('Solo'), makeUser('Convidado')])
    for (const u of [solo, convidado])
      await app.request('/api/v1/me', authed(u, { method: 'POST' }))
    const id = await newTeam(solo, 'Equipe efêmera')
    const inv = await app.request(
      `/api/v1/teams/${id}/invites`,
      authed(solo, { method: 'POST', body: json({ email: convidado.email }) }),
    )
    const { token } = await inv.json()
    expect(
      (
        await app.request(
          `/api/v1/teams/${id}/members/${solo.sub}`,
          authed(solo, { method: 'DELETE' }),
        )
      ).status,
    ).toBe(204)
    // sem o expurgo, quem aceitasse ficaria esperando para sempre uma capitania inexistente
    const aceite = await app.request(
      '/api/v1/invites/accept',
      authed(convidado, { method: 'POST', body: json({ token }) }),
    )
    expect(aceite.status).toBe(404)
  })

  it('equipe legada com 2 capitães pode ser regularizada rebaixando um deles', async () => {
    const [x, y] = await Promise.all([makeUser('LegadoX'), makeUser('LegadoY')])
    for (const u of [x, y]) await app.request('/api/v1/me', authed(u, { method: 'POST' }))
    const id = await newTeam(x, 'Equipe legada')
    await joinTeam(y, x, id)
    // estado que só existe em equipe anterior ao DF-10 (a API não cria mais isso)
    const owner = new pg.Client({ connectionString: process.env.DATABASE_URL })
    await owner.connect()
    await owner.query(
      `UPDATE team_members SET role = 'owner' WHERE team_id = $1 AND user_id = $2`,
      [id, y.sub],
    )
    await owner.end()

    expect((await setRole(x, y, 'member', id)).status).toBe(204)
    const members = await membersOf(x, id)
    expect(members.filter((m) => m.role === 'owner').map((m) => m.userId)).toEqual([x.sub])
  })

  it('quem já é membro e aceita convite de novo não vira solicitação', async () => {
    const inv = await app.request(
      `/api/v1/teams/${teamId}/invites`,
      authed(cap, { method: 'POST', body: json({ email: m1.email }) }),
    )
    const { token } = await inv.json()
    const r = await app.request(
      '/api/v1/invites/accept',
      authed(m1, { method: 'POST', body: json({ token }) }),
    )
    expect(r.status).toBe(200)
    expect((await r.json()).outcome).toBe('member')
  })
})
