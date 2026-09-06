import { describe, expect, it, beforeAll } from 'vitest'
import pg from 'pg'
import { cycleOf } from '@bajeiros/calendar/cycle'
import { addDays, todayIso } from '@bajeiros/calendar/dates'
import { app } from '../app'
import { authed, makeUser, type TestUser } from './helpers'

// DF-33 — calendário de competições: rota pública, recorte da equipe, temporada,
// passo a partir do marco, .ics, curadoria e colagem da tabela oficial.

const json = (body: unknown) => JSON.stringify(body)
const HOJE = todayIso()
const CICLO = cycleOf(HOJE)
const daqui = (dias: number) => addDays(HOJE, dias)

async function owner<T>(fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL })
  await c.connect()
  try {
    return await fn(c)
  } finally {
    await c.end()
  }
}

describe('calendário (DF-33)', () => {
  let admin: TestUser
  let cap: TestUser
  let membro: TestUser
  let teamId: string
  let nacId: string
  let sudesteId: string
  let inf09Id: string
  let marcoIntegrantes: string

  beforeAll(async () => {
    admin = await makeUser('Curadora')
    cap = await makeUser('Capita')
    membro = await makeUser('Membro')
    for (const u of [admin, cap, membro])
      await app.request('/api/v1/me', authed(u, { method: 'POST' }))
    await owner((c) => c.query('UPDATE users SET is_admin = true WHERE id = $1', [admin.sub]))

    const team = await (
      await app.request(
        '/api/v1/teams',
        authed(cap, { method: 'POST', body: json({ name: 'Equipe Calendário' }) }),
      )
    ).json()
    teamId = team.id
    await owner((c) =>
      c.query(
        `INSERT INTO team_members (team_id, user_id, role, status) VALUES ($1, $2, 'member', 'efetivo')`,
        [teamId, membro.sub],
      ),
    )

    // competições do ciclo corrente: o Nacional do ano e uma regional do ano anterior
    const nac = await app.request(
      '/api/v1/admin/calendar/competitions',
      authed(admin, {
        method: 'POST',
        body: json({
          season: CICLO,
          kind: 'nacional',
          name: `Nacional ${CICLO}`,
          startsOn: daqui(200),
          endsOn: daqui(204),
          location: 'FATEC São José dos Campos – SP',
          officialUrl: 'https://exemplo.test/eventos/nacional/',
          registrationOpensOn: daqui(-30),
          registrationClosesOn: daqui(10),
        }),
      }),
    )
    expect(nac.status).toBe(201)
    nacId = (await nac.json()).id
    const sud = await app.request(
      '/api/v1/admin/calendar/competitions',
      authed(admin, {
        method: 'POST',
        body: json({
          season: CICLO - 1,
          kind: 'regional',
          region: 'Sudeste',
          name: `Regional Sudeste ${CICLO - 1}`,
          startsOn: daqui(40),
          endsOn: daqui(44),
        }),
      }),
    )
    expect(sud.status).toBe(201)
    sudesteId = (await sud.json()).id

    const inf = await app.request(
      '/api/v1/admin/calendar/sources',
      authed(admin, {
        method: 'POST',
        body: json({
          competitionId: nacId,
          kind: 'informativo',
          number: 9,
          title: 'Inscrição de Integrantes e Associação',
          url: 'https://exemplo.test/Informativo09.pdf',
          publishedOn: daqui(-3),
        }),
      }),
    )
    expect(inf.status).toBe(201)
    inf09Id = (await inf.json()).id
    await app.request(
      '/api/v1/admin/calendar/sources',
      authed(admin, {
        method: 'POST',
        body: json({
          competitionId: nacId,
          kind: 'pagina',
          title: 'Inscrições',
          url: 'https://exemplo.test/nacional-inscricoes/',
        }),
      }),
    )

    const m1 = await app.request(
      '/api/v1/admin/calendar/milestones',
      authed(admin, {
        method: 'POST',
        body: json({
          competitionId: nacId,
          kind: 'pessoas',
          title: 'Inscrição de integrantes e orientadores',
          summary: 'Cadastro de estudantes e orientadores no sistema da organização.',
          dueOn: daqui(60),
          sourceId: inf09Id,
          status: 'confirmado',
        }),
      }),
    )
    expect(m1.status).toBe(201)
    marcoIntegrantes = (await m1.json()).id
    for (const [title, appliesTo, dias] of [
      ['2º lote integral', ['integral', 'promocional'], 25],
      ['Lote único novata e light', ['novata', 'light'], 45],
    ] as const) {
      const r = await app.request(
        '/api/v1/admin/calendar/milestones',
        authed(admin, {
          method: 'POST',
          body: json({
            competitionId: nacId,
            kind: 'pagamento',
            title,
            dueOn: daqui(dias),
            appliesTo,
          }),
        }),
      )
      expect(r.status).toBe(201)
    }
    const rs = await app.request(
      '/api/v1/admin/calendar/milestones',
      authed(admin, {
        method: 'POST',
        body: json({
          competitionId: sudesteId,
          kind: 'inscricao',
          title: 'Inscrição de equipe',
          startsOn: daqui(-10),
          dueOn: daqui(5),
        }),
      }),
    )
    expect(rs.status).toBe(201)
  })

  // ---------- público ----------

  it('AC-DF33.10 — a rota pública responde sem Authorization e com cache público', async () => {
    const r = await app.request(`/api/v1/public/calendar?season=${CICLO}`)
    expect(r.status).toBe(200)
    expect(r.headers.get('cache-control')).toBe('public, max-age=3600')
    const p = await r.json()
    expect(p.season).toBe(CICLO)
    expect(p.range).toEqual({ from: `${CICLO - 1}-07-01`, to: `${CICLO}-06-30` })
    expect(p.competitions.map((c: { name: string }) => c.name).sort()).toEqual(
      [`Nacional ${CICLO}`, `Regional Sudeste ${CICLO - 1}`].sort(),
    )
    expect(p.team).toBeNull()
    // sem sessão, nenhum marco de equipe
    expect(p.milestones.some((m: { kind: string }) => m.kind === 'equipe')).toBe(false)
    const nac = p.competitions.find((c: { id: string }) => c.id === nacId)
    expect(nac.registrationClosesOn).toBe(daqui(10))
    expect(nac.links.map((l: { title: string }) => l.title)).toEqual(['Inscrições'])
    expect(nac.stale).toBe(false)
  })

  it('a temporada padrão é o ciclo corrente; ano inválido é 400', async () => {
    const r = await app.request('/api/v1/public/calendar')
    expect((await r.json()).season).toBe(CICLO)
    expect((await app.request('/api/v1/public/calendar?season=abc')).status).toBe(400)
  })

  it('FR-DF33.11 — o informativo publicado no ciclo vira marco `comunicado` e é fonte do prazo', async () => {
    const p = await (await app.request(`/api/v1/public/calendar?season=${CICLO}`)).json()
    const comunicado = p.milestones.find((m: { id: string }) => m.id === `src:${inf09Id}`)
    expect(comunicado).toMatchObject({ kind: 'comunicado', dueOn: daqui(-3) })
    expect(comunicado.title).toContain('Informativo 09')
    const prazo = p.milestones.find((m: { id: string }) => m.id === marcoIntegrantes)
    expect(prazo.source).toMatchObject({ number: 9, url: 'https://exemplo.test/Informativo09.pdf' })
    expect(prazo.summary).toContain('Cadastro')
  })

  it('AC-DF33.7 — o .ics público tem um VEVENT por marco e por competição, sem equipe', async () => {
    const r = await app.request(`/api/v1/public/calendar.ics?season=${CICLO}`)
    expect(r.status).toBe(200)
    expect(r.headers.get('content-type')).toContain('text/calendar')
    const body = await r.text()
    expect(body).toContain(`UID:${marcoIntegrantes}@calendario.bajeiros`)
    expect(body).toContain(`UID:competition-${nacId}@calendario.bajeiros`)
    expect(body).toContain('URL:https://exemplo.test/Informativo09.pdf')
    expect(body).not.toContain('CATEGORIES:Equipe')
  })

  it('a rota da comunidade exige sessão; a de administração exige admin', async () => {
    expect((await app.request('/api/v1/community/calendar')).status).toBe(401)
    expect((await app.request('/api/v1/admin/calendar', authed(cap))).status).toBe(403)
    expect(
      (
        await app.request(
          '/api/v1/admin/calendar/milestones',
          authed(cap, { method: 'POST', body: json({}) }),
        )
      ).status,
    ).toBe(403)
  })

  // ---------- temporada da equipe ----------

  it('AC-DF33.13 — a capitania marca inscrita (integral) e interesse; o calendário devolve o vínculo', async () => {
    const r = await app.request(
      `/api/v1/teams/${teamId}/season`,
      authed(cap, {
        method: 'PUT',
        body: json({
          label: String(CICLO),
          competitionIds: [nacId],
          interestCompetitionIds: [sudesteId],
          registrationKind: 'integral',
        }),
      }),
    )
    expect(r.status).toBe(200)
    const season = await r.json()
    expect(season.registrationKind).toBe('integral')
    expect(season.interestCompetitionIds).toEqual([sudesteId])
    // AC-DF33.11 — a próxima competição marcada vem do calendário
    expect(season.nextCompetition).toMatchObject({ id: sudesteId, daysLeft: 40 })

    const cal = await (
      await app.request(`/api/v1/community/calendar?season=${CICLO}&teamId=${teamId}`, authed(cap))
    ).json()
    const bond = Object.fromEntries(
      cal.competitions.map((c: { id: string; bond: string | null }) => [c.id, c.bond]),
    )
    expect(bond[nacId]).toBe('inscrita')
    expect(bond[sudesteId]).toBe('interesse')
    expect(cal.team).toMatchObject({
      registrationKind: 'integral',
      canManage: true,
      canSteps: true,
    })
  })

  it('AC-DF33.5 — o .ics com teamId aplica o recorte: some o lote de novata/light', async () => {
    const body = await (
      await app.request(
        `/api/v1/community/calendar.ics?season=${CICLO}&teamId=${teamId}`,
        authed(cap),
      )
    ).text()
    expect(body).toContain('2º lote integral')
    expect(body).not.toContain('Lote único novata e light')
    expect(body).toContain('Inscrição de equipe') // interesse entra no recorte
  })

  it('competição fora do calendário não pode ser marcada (400); campo omitido preserva o salvo', async () => {
    const r = await app.request(
      `/api/v1/teams/${teamId}/season`,
      authed(cap, {
        method: 'PUT',
        body: json({
          label: String(CICLO),
          competitionIds: ['00000000-0000-4000-8000-000000000000'],
        }),
      }),
    )
    expect(r.status).toBe(400)
    // a aba Projetos "designa" mandando só label/projeto/marcos — o vínculo não pode sumir
    const r2 = await app.request(
      `/api/v1/teams/${teamId}/season`,
      authed(cap, { method: 'PUT', body: json({ label: String(CICLO), milestones: [] }) }),
    )
    expect(r2.status).toBe(200)
    const s = await r2.json()
    expect(s.competitionIds).toEqual([nacId])
    expect(s.registrationKind).toBe('integral')
  })

  it('AC-DF33.14 — marcos da temporada entram como `equipe` na rota da equipe, nunca na pública', async () => {
    const r = await app.request(
      `/api/v1/teams/${teamId}/season`,
      authed(cap, {
        method: 'PUT',
        body: json({
          label: String(CICLO),
          milestones: [{ title: 'Relatório de projeto', date: daqui(30), kind: 'entrega' }],
        }),
      }),
    )
    expect(r.status).toBe(200)
    const cal = await (
      await app.request(`/api/v1/community/calendar?season=${CICLO}&teamId=${teamId}`, authed(cap))
    ).json()
    const equipe = cal.milestones.filter((m: { kind: string }) => m.kind === 'equipe')
    expect(equipe).toHaveLength(1)
    expect(equipe[0]).toMatchObject({
      id: 'team:0',
      title: 'Relatório de projeto',
      dueOn: daqui(30),
      team: { index: 0, kind: 'entrega', sourceMilestoneId: null, sourceDueOn: null },
    })
    const pub = await (await app.request(`/api/v1/public/calendar?season=${CICLO}`)).json()
    expect(pub.milestones.some((m: { kind: string }) => m.kind === 'equipe')).toBe(false)
    // o .ics da equipe carrega o marco com a categoria própria
    const ics = await (
      await app.request(
        `/api/v1/community/calendar.ics?season=${CICLO}&teamId=${teamId}`,
        authed(cap),
      )
    ).text()
    expect(ics).toContain('CATEGORIES:Equipe')
    expect(ics).toContain('Relatório de projeto')
  })

  it('AC-DF33.15 — copiar um marco oficial guarda a origem; a fonte mudar não muda a cópia', async () => {
    const r = await app.request(
      `/api/v1/teams/${teamId}/season`,
      authed(cap, {
        method: 'PUT',
        body: json({
          label: String(CICLO),
          milestones: [
            { title: 'Relatório de projeto', date: daqui(30), kind: 'entrega' },
            {
              title: 'Inscrição de integrantes e orientadores',
              date: daqui(60),
              kind: 'marco',
              sourceMilestoneId: marcoIntegrantes,
            },
          ],
        }),
      }),
    )
    expect(r.status).toBe(200)
    expect((await r.json()).milestones[1].sourceMilestoneId).toBe(marcoIntegrantes)

    // a organização adia o prazo (novo checked_at, histórico em audit_events)
    const patch = await app.request(
      `/api/v1/admin/calendar/milestones/${marcoIntegrantes}`,
      authed(admin, { method: 'PATCH', body: json({ dueOn: daqui(75) }) }),
    )
    expect(patch.status).toBe(204)

    const cal = await (
      await app.request(`/api/v1/community/calendar?season=${CICLO}&teamId=${teamId}`, authed(cap))
    ).json()
    const copia = cal.milestones.find((m: { id: string }) => m.id === 'team:1')
    expect(copia.dueOn).toBe(daqui(60)) // a cópia NÃO mudou sozinha
    expect(copia.team.sourceDueOn).toBe(daqui(75)) // mas o painel sabe o que a fonte diz hoje
    const original = cal.milestones.find((m: { id: string }) => m.id === marcoIntegrantes)
    expect(original.dueOn).toBe(daqui(75))

    const trilha = await owner((c) =>
      c.query(
        `SELECT metadata FROM audit_events WHERE action = 'calendar.milestone_upsert' AND resource_id = $1
         ORDER BY occurred_at DESC LIMIT 1`,
        [marcoIntegrantes],
      ),
    )
    expect(trilha.rows[0].metadata.from.dueOn).toBe(daqui(60))
    expect(trilha.rows[0].metadata.to.dueOn).toBe(daqui(75))
  })

  it('o teto de marcos da temporada é 24 (era 12)', async () => {
    const marcos = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ title: `Marco ${i}`, date: daqui(i + 1) }))
    const ok = await app.request(
      `/api/v1/teams/${teamId}/season`,
      authed(cap, { method: 'PUT', body: json({ label: String(CICLO), milestones: marcos(13) }) }),
    )
    expect(ok.status).toBe(200)
    const demais = await app.request(
      `/api/v1/teams/${teamId}/season`,
      authed(cap, { method: 'PUT', body: json({ label: String(CICLO), milestones: marcos(25) }) }),
    )
    expect(demais.status).toBe(400)
    // volta ao estado dos testes seguintes
    await app.request(
      `/api/v1/teams/${teamId}/season`,
      authed(cap, {
        method: 'PUT',
        body: json({
          label: String(CICLO),
          milestones: [{ title: 'Relatório de projeto', date: daqui(30), kind: 'entrega' }],
        }),
      }),
    )
  })

  // ---------- passo a partir do marco ----------

  it('AC-DF33.6 — "Transformar em passo" cria passo com due_on e link de volta; membro comum não', async () => {
    const body = {
      title: 'Inscrever integrantes e orientadores',
      origin: 'calendario',
      linkRef: `milestone:${marcoIntegrantes}`,
      dueOn: daqui(75),
    }
    const r = await app.request(
      `/api/v1/teams/${teamId}/evolution/steps`,
      authed(cap, { method: 'POST', body: json(body) }),
    )
    expect(r.status).toBe(201)
    const step = await r.json()
    expect(step).toMatchObject({ origin: 'calendario', dueOn: daqui(75), linkRef: body.linkRef })

    const lista = await (
      await app.request(`/api/v1/teams/${teamId}/evolution/steps`, authed(cap))
    ).json()
    expect(lista.find((s: { id: string }) => s.id === step.id).dueOn).toBe(daqui(75))

    const nao = await app.request(
      `/api/v1/teams/${teamId}/evolution/steps`,
      authed(membro, { method: 'POST', body: json(body) }),
    )
    expect(nao.status).toBe(403)
  })

  // ---------- Início ----------

  it('AC-DF33.11 — o Início mostra o próximo prazo vindo do calendário', async () => {
    const home = await (await app.request(`/api/v1/me/home?teamId=${teamId}`, authed(cap))).json()
    // o mais próximo que afeta a equipe: a inscrição da regional de interesse (5 dias),
    // antes do lote integral (25) e do marco da equipe (30)
    expect(home.deadline).toMatchObject({
      title: 'Inscrição de equipe',
      daysLeft: 5,
      competition: `Regional Sudeste ${CICLO - 1}`,
    })
    expect(home.season.nextCompetition.id).toBe(sudesteId)
  })

  // ---------- frescor ----------

  it('AC-DF33.8 — conferido há mais de 30 dias com marco futuro sai `stale`', async () => {
    await owner((c) =>
      c.query(`UPDATE competitions SET checked_at = now() - interval '40 days' WHERE id = $1`, [
        nacId,
      ]),
    )
    const p = await (await app.request(`/api/v1/public/calendar?season=${CICLO}`)).json()
    expect(p.competitions.find((c: { id: string }) => c.id === nacId).stale).toBe(true)
    // qualquer salvar da curadoria carimba de novo
    const patch = await app.request(
      `/api/v1/admin/calendar/competitions/${nacId}`,
      authed(admin, { method: 'PATCH', body: json({ location: 'São José dos Campos – SP' }) }),
    )
    expect(patch.status).toBe(204)
    const p2 = await (await app.request(`/api/v1/public/calendar?season=${CICLO}`)).json()
    expect(p2.competitions.find((c: { id: string }) => c.id === nacId).stale).toBe(false)
  })

  // ---------- curadoria ----------

  it('AC-DF33.9 — colar a tabela oficial propõe 8 marcos, resolve "até a competição" e o informativo', async () => {
    const tabela = [
      'ATIVIDADE\tLOCAL\tPRAZO\tINFORMATIVO',
      'Inscrição de equipe\tSite\taté 15/09/2025\tInformativo 01',
      'Inscrição dos integrantes e professores orientadores\tSite\taté 25/01/2026\tInformativo 09',
      'Associação dos integrantes\tSite\taté a competição\tInformativo 09',
      'Envio de atestado de matrícula\tE-mail\taté 08/03/2026\tInformativo 13',
      'Representante de imprensa\tSite\taté 08/03/2026\tInformativo 14',
      'Apresentação em escolas de ensino médio\tPresencial\taté 15/03/2026\tInformativo 10',
      'Pesquisa sobre hospedagem\tFormulário\taté 15/03/2026\tInformativo 15',
      'Agendamento para credenciamento\tSite\taté 15/03/2026\t(em breve)',
    ].join('\n')
    const r = await app.request(
      '/api/v1/admin/calendar/parse-table',
      authed(admin, { method: 'POST', body: json({ text: tabela, competitionId: nacId }) }),
    )
    expect(r.status).toBe(200)
    const { rows } = await r.json()
    expect(rows).toHaveLength(8)
    expect(rows[1]).toMatchObject({ dueOn: '2026-01-25', sourceNumber: 9, sourceId: inf09Id })
    expect(rows[2]).toMatchObject({ dueOn: daqui(200), dateResolved: true, sourceId: inf09Id })
    expect(rows[7]).toMatchObject({ sourceNumber: null, sourceId: null })
    // nada foi gravado: o rascunho é conferido antes de salvar
    const p = await (await app.request(`/api/v1/public/calendar?season=${CICLO}`)).json()
    expect(
      p.milestones.some((m: { title: string }) => m.title === 'Envio de atestado de matrícula'),
    ).toBe(false)
  })

  it('FR-DF33.24 — documento-fonte é único por URL: repetir atualiza em vez de duplicar', async () => {
    const r = await app.request(
      '/api/v1/admin/calendar/sources',
      authed(admin, {
        method: 'POST',
        body: json({
          competitionId: nacId,
          kind: 'informativo',
          number: 9,
          title: 'Inscrição de Integrantes e Associação (rev. 1)',
          url: 'https://exemplo.test/Informativo09.pdf',
          publishedOn: daqui(-3),
        }),
      }),
    )
    expect(r.status).toBe(201)
    expect((await r.json()).id).toBe(inf09Id)
    const n = await owner((c) =>
      c.query(`SELECT count(*)::int AS n FROM source_documents WHERE url = $1`, [
        'https://exemplo.test/Informativo09.pdf',
      ]),
    )
    expect(n.rows[0].n).toBe(1)
  })

  it('marco cancelado some da leitura; excluir marco e documento deixa trilha', async () => {
    const criado = await (
      await app.request(
        '/api/v1/admin/calendar/milestones',
        authed(admin, {
          method: 'POST',
          body: json({
            competitionId: nacId,
            kind: 'evento',
            title: 'Briefing',
            dueOn: daqui(199),
          }),
        }),
      )
    ).json()
    await app.request(
      `/api/v1/admin/calendar/milestones/${criado.id}`,
      authed(admin, { method: 'PATCH', body: json({ status: 'cancelado' }) }),
    )
    const cal = await (
      await app.request(`/api/v1/community/calendar?season=${CICLO}&teamId=${teamId}`, authed(cap))
    ).json()
    const ics = await (
      await app.request(
        `/api/v1/community/calendar.ics?season=${CICLO}&teamId=${teamId}`,
        authed(cap),
      )
    ).text()
    // a rota devolve o vigente com status; o recorte do .ics já o descarta
    expect(cal.milestones.find((m: { id: string }) => m.id === criado.id).status).toBe('cancelado')
    expect(ics).not.toContain('Briefing')

    expect(
      (
        await app.request(
          `/api/v1/admin/calendar/milestones/${criado.id}`,
          authed(admin, { method: 'DELETE' }),
        )
      ).status,
    ).toBe(204)
    expect(
      (
        await app.request(
          `/api/v1/admin/calendar/milestones/${criado.id}`,
          authed(admin, { method: 'DELETE' }),
        )
      ).status,
    ).toBe(404)
    const trilha = await owner((c) =>
      c.query(
        `SELECT 1 FROM audit_events WHERE action = 'calendar.milestone_delete' AND resource_id = $1`,
        [criado.id],
      ),
    )
    expect(trilha.rowCount).toBe(1)
  })
})
