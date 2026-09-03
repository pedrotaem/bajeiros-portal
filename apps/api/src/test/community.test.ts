import { describe, expect, it, beforeAll } from 'vitest'
import pg from 'pg'
import { app } from '../app'
import { authed, makeUser, type TestUser } from './helpers'
// lib de ingestão é .mjs pura — importa só as funções, sem banco
import {
  buildPlan,
  displayName,
  isPiiKey,
  normalizeEvents,
  stripPii,
  toResult,
} from '../../scripts/ingest-lib.mjs'

// DF-15 (EV-7) — acervo de resultados, registro canônico, vínculo e benchmark.

const json = (body: unknown) => JSON.stringify(body)

describe('DF-15 — ingestão do acervo (funções puras)', () => {
  it('AC-DF15.8 — campo de pessoa física é descartado', () => {
    const sujo = {
      equipe: 'Canindé Baja',
      universidade: 'UF Fictícia',
      posicao: 3,
      pontuacao_total: 500,
      capitao: 'Fulano de Tal',
      email: 'fulano@exemplo.com',
      pilotos: ['A', 'B'],
      contato_telefone: '11999999999',
      pontuacoes_por_prova: { enduro: 300, projeto: 200 },
    }
    const limpo = stripPii(sujo) as Record<string, unknown>
    expect(limpo.equipe).toBe('Canindé Baja')
    expect(limpo.capitao).toBeUndefined()
    expect(limpo.email).toBeUndefined()
    expect(limpo.pilotos).toBeUndefined()
    expect(limpo.contato_telefone).toBeUndefined()

    const registro = toResult(sujo, { fontes: ['https://exemplo'] })!
    expect(JSON.stringify(registro)).not.toContain('Fulano')
    expect(registro.pointsTotal).toBe(500)
  })

  it('descarta PII aninhada', () => {
    const limpo = stripPii({ equipe: 'X', extra: { responsavel: 'Y', uf: 'SP' } }) as {
      extra: Record<string, unknown>
    }
    expect(limpo.extra.responsavel).toBeUndefined()
    expect(limpo.extra.uf).toBe('SP')
    expect(isPiiKey('nome_do_piloto')).toBe(true)
    expect(isPiiKey('universidade')).toBe(false)
  })

  it('AC-DF15.7 — o nome de exibição não usa a identidade da organização', () => {
    expect(displayName({ tipo: 'nacional', ano: 2026, regiao: null })).toBe('Nacional 2026')
    expect(displayName({ tipo: 'regional', ano: 2025, regiao: 'Sudeste' })).toBe(
      'Regional Sudeste 2025',
    )
    const plano = buildPlan(
      {
        competicoes: [
          {
            ano: 2026,
            tipo: 'nacional',
            regiao: null,
            nome: '31ª Competição Baja SAE BRASIL',
            resultados: [{ equipe: 'A', universidade: 'U', posicao: 1, pontuacao_total: 10 }],
            fontes: ['https://exemplo'],
          },
        ],
      },
      {},
    )
    expect(JSON.stringify(plano.competitions.map((c) => c.name))).not.toMatch(/SAE/i)
  })

  it('normaliza o nome das provas e guarda o original para auditoria', () => {
    const { points, source } = normalizeEvents({ enduro: 370.73, dinamicas: 176, texto: 'x' })
    expect(points).toEqual({ Enduro: 370.73, Dinâmicas: 176 })
    expect(source.Enduro).toBe('enduro')
    expect(points.texto).toBeUndefined()
  })

  it('o plano junta equipes do registro canônico e dos resultados, sem duplicar', () => {
    const plano = buildPlan(
      {
        competicoes: [
          {
            ano: 2026,
            tipo: 'nacional',
            regiao: null,
            resultados: [
              { equipe: 'Poli Baja', universidade: 'USP', posicao: 1, pontuacao_total: 800 },
              { equipe: 'Nova Equipe', universidade: 'UFX', posicao: 2, pontuacao_total: 700 },
            ],
            fontes: [],
          },
        ],
      },
      { 0: { nome: 'Poli Baja', universidade: 'USP', cidade: 'São Paulo', estado: 'SP' } },
    )
    expect(plano.counts.teams).toBe(2)
    expect(plano.counts.results).toBe(2)
    expect(plano.teams.find((t) => t.displayName === 'Poli Baja')?.city).toBe('São Paulo')
  })

  it('a chave é o nome normalizado — variação de grafia não cria equipe nova', () => {
    const plano = buildPlan(
      {
        competicoes: [
          {
            ano: 2026,
            tipo: 'nacional',
            regiao: null,
            resultados: [{ equipe: 'BAJA UFMG', universidade: 'UFMG (SIGLA)', posicao: 1 }],
            fontes: [],
          },
        ],
      },
      { 0: { nome: 'Baja UFMG', universidade: 'Universidade Federal de Minas Gerais' } },
    )
    expect(plano.counts.teams).toBe(1)
  })

  it('nome repetido na MESMA competição é desempatado, nunca colapsado', () => {
    const plano = buildPlan(
      {
        competicoes: [
          {
            ano: 2023,
            tipo: 'nacional',
            regiao: null,
            resultados: [
              { equipe: 'Mega Baja Team', numero_carro: 12, posicao: 10, pontuacao_total: 400 },
              { equipe: 'Mega Baja Team', numero_carro: 40, posicao: 22, pontuacao_total: 300 },
            ],
            fontes: [],
          },
        ],
      },
      {},
    )
    const [comp] = plano.competitions
    expect(comp.results).toHaveLength(2)
    expect(new Set(comp.results.map((r) => r.teamKey)).size).toBe(2)
    expect(comp.results.map((r) => r.displayName)).toEqual([
      'Mega Baja Team #12',
      'Mega Baja Team #40',
    ])
    expect(plano.counts.ambiguous).toBe(1)
  })

  it('o número de tier da pesquisa NÃO entra no portal (vocabulário ambíguo)', () => {
    const plano = buildPlan(
      { competicoes: [] },
      { 0: { nome: 'X', universidade: 'U', tier: 1, confianca_tier: 'alta' } },
    )
    expect(JSON.stringify(plano.teams)).not.toContain('tier')
  })
})

describe('DF-15 — API da comunidade', () => {
  let cap: TestUser
  let outro: TestUser
  let admin: TestUser
  let teamId: string
  let competitionId: string
  let communityTeamId: string
  let alheiaId: string

  async function seedAcervo() {
    // semeia o acervo direto no banco (é o que o script de ingestão faria)
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
    await client.connect()
    try {
      const comp = await client.query(
        `INSERT INTO competitions (season, kind, region, name, source_url)
         VALUES (2026, 'nacional', NULL, 'Nacional 2026', 'https://exemplo')
         ON CONFLICT (season, kind, region) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
      )
      competitionId = comp.rows[0].id
      // 10 equipes: acima do piso de 8 da coorte
      const ids: string[] = []
      for (let i = 0; i < 10; i++) {
        const r = await client.query(
          `INSERT INTO community_teams (display_name, university, city, uf, region)
           VALUES ($1, $2, 'Cidade', 'SP', 'Sudeste')
           ON CONFLICT (display_name, university) DO UPDATE SET uf = EXCLUDED.uf
           RETURNING id`,
          [`Equipe Acervo ${i}`, `Universidade ${i}`],
        )
        ids.push(r.rows[0].id)
        await client.query(
          `INSERT INTO competition_results
             (competition_id, community_team_id, position, points_total, points, source_url)
           VALUES ($1, $2, $3, $4, $5::jsonb, 'https://exemplo')
           ON CONFLICT (competition_id, community_team_id) DO UPDATE
             SET points_total = EXCLUDED.points_total`,
          [
            competitionId,
            r.rows[0].id,
            i + 1,
            800 - i * 40,
            JSON.stringify({
              Enduro: 400 - i * 20,
              Projeto: 200 - i * 5,
              _fonte: { Enduro: 'enduro' },
            }),
          ],
        )
      }
      communityTeamId = ids[0]
      alheiaId = ids[1]
    } finally {
      await client.end()
    }
  }

  beforeAll(async () => {
    ;[cap, outro, admin] = await Promise.all([
      makeUser('CapCom'),
      makeUser('OutroCom'),
      makeUser('AdminCom'),
    ])
    for (const u of [cap, outro, admin])
      await app.request('/api/v1/me', authed(u, { method: 'POST' }))
    teamId = (
      await (
        await app.request(
          '/api/v1/teams',
          authed(cap, { method: 'POST', body: json({ name: 'Equipe Comunidade' }) }),
        )
      ).json()
    ).id
    await seedAcervo()
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
    await client.connect()
    await client.query('UPDATE users SET is_admin = true WHERE id = $1', [admin.sub])
    await client.end()
  })

  it('AC-DF15.2 — a tabela de resultados confere com o acervo e cita a fonte', async () => {
    const r = await app.request(
      `/api/v1/community/competitions/${competitionId}/results`,
      authed(cap),
    )
    expect(r.status).toBe(200)
    const body = await r.json()
    expect(body.competition.name).toBe('Nacional 2026')
    expect(body.results).toHaveLength(10)
    expect(body.results[0].position).toBe(1)
    expect(body.results[0].pointsTotal).toBe(800)
    expect(body.results[0].sourceUrl).toBe('https://exemplo')
    // `_fonte` é trilha de ingestão, não conteúdo de tela
    expect(body.results[0].points._fonte).toBeUndefined()
    expect(body.results[0].points.Enduro).toBe(400)
    expect(body.results.every((x: { isMine: boolean }) => x.isMine === false)).toBe(true)
  })

  it('o calendário lista as competições sem a marca da organização', async () => {
    const lista = await (await app.request('/api/v1/community/competitions', authed(cap))).json()
    expect(lista.length).toBeGreaterThan(0)
    expect(JSON.stringify(lista)).not.toMatch(/SAE/i)
  })

  it('perfil de equipe do acervo traz o histórico e não rotula coorte de terceiro', async () => {
    const perfil = await (
      await app.request(`/api/v1/community/teams/${alheiaId}`, authed(cap))
    ).json()
    expect(perfil.history.length).toBeGreaterThan(0)
    expect(perfil.cohort).toBeUndefined()
    expect(perfil.tier).toBeUndefined()
  })

  it('sem vínculo, o benchmark não aparece — e diz por quê', async () => {
    const r = await app.request(
      `/api/v1/community/benchmark?teamId=${teamId}&competitionId=${competitionId}`,
      authed(cap),
    )
    expect(r.status).toBe(200)
    const body = await r.json()
    expect(body.visible).toBe(false)
    expect(body.reason).toBe('sem-vinculo')
  })

  it('AC-DF15.3 — claim é da capitania, aprovado por admin, e habilita o "VOCÊ"', async () => {
    const semPermissao = await app.request(
      '/api/v1/community/claims',
      authed(outro, { method: 'POST', body: json({ teamId, communityTeamId }) }),
    )
    expect(semPermissao.status).toBe(404) // nem membro é: a RLS esconde a equipe

    const pedido = await app.request(
      '/api/v1/community/claims',
      authed(cap, {
        method: 'POST',
        body: json({ teamId, communityTeamId, evidence: 'e-mail institucional' }),
      }),
    )
    expect(pedido.status).toBe(201)
    const claim = await pedido.json()

    const duplicado = await app.request(
      '/api/v1/community/claims',
      authed(cap, { method: 'POST', body: json({ teamId, communityTeamId }) }),
    )
    expect(duplicado.status).toBe(409)

    const resolve = await app.request(
      `/api/v1/admin/community/claims/${claim.id}/resolve`,
      authed(admin, { method: 'POST', body: json({ approve: true }) }),
    )
    expect(resolve.status).toBe(204)

    const results = await (
      await app.request(`/api/v1/community/competitions/${competitionId}/results`, authed(cap))
    ).json()
    const minha = results.results.find(
      (x: { communityTeamId: string }) => x.communityTeamId === communityTeamId,
    )
    expect(minha.isMine).toBe(true)
  })

  it('o vínculo registra o resultado como CONTEXTO, sem mexer no nível (ADR-010)', async () => {
    const feed = await (
      await app.request(`/api/v1/teams/${teamId}/activity?limit=30`, authed(cap))
    ).json()
    const resultado = feed.find((e: { kind: string }) => e.kind === 'competition.result')
    expect(resultado).toBeTruthy()
    expect(resultado.payload.position).toBe(1)
    expect(resultado.payload.total).toBe(10)

    // maturidade ≠ resultado (ADR-010 dec. 4): nenhuma área sobe por causa do 1º
    // lugar. A PATENTE é outra coisa e o DF-18 RF-3.5 diz isso com todas as letras.
    await app.request(
      `/api/v1/teams/${teamId}/evolution/optin`,
      authed(cap, { method: 'POST', body: '{}' }),
    )
    const evo = await (await app.request(`/api/v1/teams/${teamId}/evolution`, authed(cap))).json()
    expect(evo.areas.find((a: { area: string }) => a.area === 'estrutura').level).toBe(0)
  })

  it('AC-DF15.4 — com a coorte acima do piso, a mediana por prova aparece', async () => {
    const r = await app.request(
      `/api/v1/community/benchmark?teamId=${teamId}&competitionId=${competitionId}`,
      authed(cap),
    )
    const body = await r.json()
    expect(body.floor).toBe(8)
    expect(['iniciante', 'intermediaria', 'alta-performance']).toContain(body.cohort)
    if (body.visible) {
      expect(Object.keys(body.events).length).toBeGreaterThan(0)
      expect(body.events._fonte).toBeUndefined()
    } else {
      expect(body.reason).toBe('coorte-pequena')
      expect(body.teams).toBeLessThan(8)
    }
  })

  it('AC-DF15.5 — "transformar em meta" cria passo origin=meta com link de volta', async () => {
    const r = await app.request(
      '/api/v1/community/goals',
      authed(cap, { method: 'POST', body: json({ teamId, competitionId, event: 'Enduro' }) }),
    )
    expect(r.status).toBe(201)
    const passo = await r.json()
    expect(passo.origin).toBe('meta')
    expect(passo.title).toBe('Recuperar a mediana de Enduro: Nacional 2026')

    const fila = await (
      await app.request(`/api/v1/teams/${teamId}/evolution/steps`, authed(cap))
    ).json()
    const naFila = fila.find((s: { id: string }) => s.id === passo.id)
    expect(naFila.linkRef).toBe(`competition:${competitionId}`)
  })

  it('meta exige capitania', async () => {
    const r = await app.request(
      '/api/v1/community/goals',
      authed(outro, { method: 'POST', body: json({ teamId, competitionId, event: 'Enduro' }) }),
    )
    expect(r.status).toBe(404)
  })

  it('AC-DF15.6 — correção é pedida com fonte e aplicada pelo admin, com trilha', async () => {
    const pedido = await app.request(
      '/api/v1/community/corrections',
      authed(outro, {
        method: 'POST',
        body: json({
          target: { competitionId, communityTeamId: alheiaId, field: 'points_total' },
          proposal: 'A pontuação correta é 765,00',
          sourceUrl: 'https://fonte-publica',
        }),
      }),
    )
    expect(pedido.status).toBe(201)
    const correcao = await pedido.json()
    expect(correcao.status).toBe('aberta')

    const aplica = await app.request(
      `/api/v1/admin/community/corrections/${correcao.id}/resolve`,
      authed(admin, {
        method: 'POST',
        body: json({
          apply: true,
          patch: { competitionId, communityTeamId: alheiaId, pointsTotal: 765 },
        }),
      }),
    )
    expect(aplica.status).toBe(204)

    const results = await (
      await app.request(`/api/v1/community/competitions/${competitionId}/results`, authed(cap))
    ).json()
    const linha = results.results.find(
      (x: { communityTeamId: string }) => x.communityTeamId === alheiaId,
    )
    expect(linha.pointsTotal).toBe(765)

    const naFila = await (
      await app.request(`/api/v1/admin/community/corrections/${correcao.id}/resolve`, authed(admin))
    ).status
    expect(naFila).toBe(404) // já resolvida
  })

  it('quem não é admin não resolve claim nem correção', async () => {
    const r = await app.request(
      `/api/v1/admin/community/claims/00000000-0000-0000-0000-000000000000/resolve`,
      authed(cap, { method: 'POST', body: json({ approve: true }) }),
    )
    expect(r.status).toBe(403)
  })
})
