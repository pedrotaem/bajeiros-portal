import { Hono } from 'hono'
import { z } from 'zod'
import { withUser, type DbClient } from '../../db'
import { problem } from '../../problem'
import { audit, clientIp } from '../../audit'
import { can } from '../../policy'
import { myRole } from '../teams/shared'
import { recordEvidence, recomputeTeam } from '../evolution/engine'
import { rankShowcase } from '../evolution/rank'
import type { AuthEnv } from '../../auth/middleware'

// DF-15 — comunidade: acervo de resultados, registro canônico das equipes do
// Brasil, vínculo ("claim") e benchmark por prova.
//
// Restrição de marca (spec.md §1): nenhuma tela e nenhum payload usa a identidade
// da organização; a competição é "Nacional 2026" e a fonte é citada como
// "resultados públicos das competições". O nome original da fonte fica em
// `points._fonte`, para auditoria — não para exibição.

export const community = new Hono<AuthEnv>()

/** Mesmo piso do DF-13 RF-7.2: abaixo de 8, mediana identifica gente. */
export const COHORT_FLOOR = 8

export const COHORT_LABELS: Record<string, string> = {
  iniciante: 'iniciante',
  intermediaria: 'intermediária',
  'alta-performance': 'alta performance',
}

function asJson<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T
    } catch {
      return fallback
    }
  }
  return value as T
}

// ---------- região do Brasil ----------

/**
 * Agrupamento do IBGE. Gêmeo de `UFS_DA_REGIAO` em `apps/web/src/data/panorama.ts`
 * (a web já tem o mapa para desenhar o panorama; a API precisa dele para FILTRAR).
 * Mudar um lado sem o outro é o único jeito de isto divergir — e as macrorregiões
 * não mudam desde 1990.
 */
export const UFS_DA_REGIAO: Readonly<Record<RegiaoId, readonly string[]>> = {
  N: ['AC', 'AP', 'AM', 'PA', 'RO', 'RR', 'TO'],
  NE: ['AL', 'BA', 'CE', 'MA', 'PB', 'PE', 'PI', 'RN', 'SE'],
  CO: ['DF', 'GO', 'MT', 'MS'],
  SE: ['ES', 'MG', 'RJ', 'SP'],
  S: ['PR', 'RS', 'SC'],
}

export type RegiaoId = 'N' | 'NE' | 'CO' | 'SE' | 'S'

export const REGIAO_IDS = ['N', 'NE', 'CO', 'SE', 'S'] as const

export const REGIAO_NOME: Readonly<Record<RegiaoId, string>> = {
  N: 'Norte',
  NE: 'Nordeste',
  CO: 'Centro-Oeste',
  SE: 'Sudeste',
  S: 'Sul',
}

const REGIAO_DA_UF: Readonly<Record<string, RegiaoId>> = Object.fromEntries(
  REGIAO_IDS.flatMap((id) => UFS_DA_REGIAO[id].map((uf) => [uf, id])),
)

/**
 * A região é DERIVADA da UF, não lida da coluna `region`.
 *
 * O acervo tem 189 equipes com UF em 178 delas e `region` preenchida em menos da
 * metade — filtrar pela coluna esconderia a maioria das equipes de uma região que
 * de fato está no registro. A coluna vira fallback: vale só para a linha sem UF,
 * onde ela é a única informação de origem que existe.
 */
export function regiaoDe(uf: unknown, region: unknown): RegiaoId | null {
  const sigla = typeof uf === 'string' ? uf.trim().toUpperCase() : ''
  if (REGIAO_DA_UF[sigla]) return REGIAO_DA_UF[sigla]
  const nome = typeof region === 'string' ? region.trim().toLowerCase() : ''
  const achado = REGIAO_IDS.find((id) => REGIAO_NOME[id].toLowerCase() === nome)
  return achado ?? null
}

// ---------- calendário e resultados ----------

community.get('/competitions', async (c) => {
  const { sub } = c.get('auth')
  const season = c.req.query('season')
  const rows = await withUser(
    sub,
    async (db) =>
      (
        await db.query(
          `SELECT c.*, (SELECT count(*)::int FROM competition_results r
                        WHERE r.competition_id = c.id) AS results
           FROM competitions c
           WHERE ($1::int IS NULL OR c.season = $1)
           ORDER BY c.season DESC, c.kind, c.region NULLS FIRST`,
          [season ? Number(season) : null],
        )
      ).rows,
  )
  return c.json(rows.map(toCompetition))
})

community.get('/competitions/:id/results', async (c) => {
  const { sub } = c.get('auth')
  const competitionId = c.req.param('id')
  const result = await withUser(sub, async (db) => {
    const comp = await db.query('SELECT * FROM competitions WHERE id = $1', [competitionId])
    if (!comp.rowCount) return 'notfound' as const
    const rows = await db.query(
      `SELECT r.*, t.display_name, t.university, t.uf, t.region, t.claimed_by_team_id
       FROM competition_results r
       JOIN community_teams t ON t.id = r.community_team_id
       WHERE r.competition_id = $1
       ORDER BY r.position NULLS LAST, r.points_total DESC NULLS LAST`,
      [competitionId],
    )
    // "VOCÊ" na tabela: só as equipes do PRÓPRIO usuário são marcadas
    const mine = await db.query(
      `SELECT ct.id FROM community_teams ct
       WHERE ct.claimed_by_team_id IN (SELECT user_team_ids($1))`,
      [sub],
    )
    const mineIds = new Set(mine.rows.map((r) => r.id as string))
    return {
      competition: toCompetition(comp.rows[0]),
      results: rows.rows.map((row) => ({
        ...toResult(row),
        isMine: mineIds.has(row.community_team_id as string),
      })),
    }
  })
  if (result === 'notfound') return problem(c, 404, 'Competição não encontrada')
  return c.json(result)
})

function toCompetition(row: Record<string, unknown>) {
  return {
    id: row.id,
    season: Number(row.season),
    kind: row.kind,
    region: row.region ?? null,
    name: row.name,
    startsOn: row.starts_on ?? null,
    endsOn: row.ends_on ?? null,
    location: row.location ?? null,
    sourceUrl: row.source_url ?? null,
    results: row.results != null ? Number(row.results) : undefined,
  }
}

function toResult(row: Record<string, unknown>) {
  const points = asJson<Record<string, unknown>>(row.points, {})
  // `_fonte` é trilha de auditoria da ingestão, não conteúdo de tela
  const events = Object.fromEntries(Object.entries(points).filter(([k]) => k !== '_fonte'))
  return {
    communityTeamId: row.community_team_id,
    displayName: row.display_name,
    university: row.university ?? null,
    uf: row.uf ?? null,
    position: row.position != null ? Number(row.position) : null,
    pointsTotal: row.points_total != null ? Number(row.points_total) : null,
    points: events,
    sourceUrl: row.source_url ?? null,
  }
}

// ---------- registro canônico das equipes ----------

/**
 * Registro canônico, com os dois recortes que a aba oferece: estado e região.
 *
 * O filtro de região roda pela LISTA DE UFS da região (`$4::jsonb`), com a coluna
 * `region` só como fallback para a linha sem UF — é a mesma regra de `regiaoDe`,
 * escrita em SQL para o recorte acontecer antes do `LIMIT`. Filtrar depois de
 * paginar devolveria meia página e uma contagem mentirosa.
 */
community.get('/teams', async (c) => {
  const { sub } = c.get('auth')
  const q = (c.req.query('q') ?? '').trim()
  const uf = (c.req.query('uf') ?? '').trim().toUpperCase()
  const regiao = REGIAO_IDS.find((id) => id === c.req.query('region')) ?? null
  const limit = Math.min(Number(c.req.query('limit') ?? 200) || 200, 500)
  const rows = await withUser(
    sub,
    async (db) =>
      (
        await db.query(
          `SELECT * FROM community_teams
           WHERE ($2::text IS NULL OR display_name ILIKE '%' || $2 || '%'
                  OR university ILIKE '%' || $2 || '%')
             AND ($3::text IS NULL OR upper(uf) = $3)
             AND ($4::text IS NULL
                  OR upper(uf) IN (SELECT jsonb_array_elements_text($5::jsonb))
                  OR (uf IS NULL AND lower(region) = lower($4)))
           ORDER BY display_name LIMIT $1`,
          [
            limit,
            q || null,
            uf || null,
            regiao ? REGIAO_NOME[regiao] : null,
            JSON.stringify(regiao ? UFS_DA_REGIAO[regiao] : []),
          ],
        )
      ).rows,
  )
  return c.json(rows.map(toCommunityTeam))
})

community.get('/teams/:id', async (c) => {
  const { sub } = c.get('auth')
  const id = c.req.param('id')
  const result = await withUser(sub, async (db) => {
    const t = await db.query('SELECT * FROM community_teams WHERE id = $1', [id])
    if (!t.rowCount) return 'notfound' as const
    const history = await db.query(
      `SELECT r.position, r.points_total, c.id AS competition_id, c.name, c.season, c.kind
       FROM competition_results r JOIN competitions c ON c.id = r.competition_id
       WHERE r.community_team_id = $1
       ORDER BY c.season DESC, c.kind`,
      [id],
    )
    // DF-18 RF-6.2 — vitrine: SÓ emblema, número, nome e temporada, e só com a chave
    // ligada pela capitania. Níveis por área, critérios, declarações e fila nunca são
    // publicáveis, e não existe filtro nem ordenação por patente aqui (RF-6.3).
    const claimed = t.rows[0].claimed_by_team_id as string | null
    const rank = claimed ? await rankShowcase(db, claimed) : null
    return {
      ...toCommunityTeam(t.rows[0]),
      rank,
      history: history.rows.map((row) => ({
        competitionId: row.competition_id,
        name: row.name,
        season: Number(row.season),
        kind: row.kind,
        position: row.position != null ? Number(row.position) : null,
        pointsTotal: row.points_total != null ? Number(row.points_total) : null,
      })),
    }
  })
  if (result === 'notfound') return problem(c, 404, 'Equipe não encontrada no acervo')
  return c.json(result)
})

/**
 * Coorte é mostrada SÓ para a própria equipe (§3.1): perfil de terceiro nunca
 * carrega rótulo de faixa — o objetivo é benchmark, não constrangimento.
 */
function toCommunityTeam(row: Record<string, unknown>) {
  const regiao = regiaoDe(row.uf, row.region)
  return {
    id: row.id,
    displayName: row.display_name,
    university: row.university ?? null,
    city: row.city ?? null,
    uf: row.uf ?? null,
    // `region` sai DERIVADA da UF: a tela e o filtro leem a mesma regra, e a coluna
    // meio preenchida do acervo deixa de ser fonte de verdade (só de fallback).
    regionId: regiao,
    region: regiao ? REGIAO_NOME[regiao] : null,
    links: asJson<unknown[]>(row.links, []),
    claimed: row.claimed_by_team_id != null,
    claimedByTeamId: (row.claimed_by_team_id as string | null) ?? null,
  }
}

// ---------- vínculo (claim) ----------

const claimBody = z.object({
  teamId: z.string().uuid(),
  communityTeamId: z.string().uuid(),
  evidence: z.string().trim().max(1000).optional(),
})

community.post('/claims', async (c) => {
  const parsed = claimBody.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return problem(c, 400, 'Body inválido', parsed.error.message)
  const { sub } = c.get('auth')
  const { teamId, communityTeamId } = parsed.data

  const result = await withUser(sub, async (db) => {
    const role = await myRole(db, teamId, sub)
    if (!role) return 'notfound' as const
    // vínculo é ato de capitania: dá "VOCÊ" na tabela pública da comunidade
    if (!can(role, 'evolution.season')) return 'forbidden' as const
    const ct = await db.query('SELECT claimed_by_team_id FROM community_teams WHERE id = $1', [
      communityTeamId,
    ])
    if (!ct.rowCount) return 'no-community-team' as const
    if (ct.rows[0].claimed_by_team_id) return 'already-claimed' as const
    const aberta = await db.query(
      `SELECT 1 FROM community_claims WHERE team_id = $1 AND status = 'aberta'`,
      [teamId],
    )
    if (aberta.rowCount) return 'pending' as const

    const r = await db.query(
      `INSERT INTO community_claims (team_id, community_team_id, evidence, requested_by)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [teamId, communityTeamId, parsed.data.evidence ?? null, sub],
    )
    await audit(db, {
      actorUserId: sub,
      action: 'community.claim.create',
      resourceType: 'team',
      resourceId: teamId,
      ip: clientIp(c.req.raw.headers),
      metadata: { communityTeamId },
    })
    return r.rows[0]
  })

  if (result === 'notfound') return problem(c, 404, 'Equipe não encontrada')
  if (result === 'no-community-team') return problem(c, 404, 'Equipe não encontrada no acervo')
  if (result === 'forbidden')
    return problem(c, 403, 'Sem permissão', 'Apenas a capitania solicita o vínculo.')
  if (result === 'already-claimed')
    return problem(
      c,
      409,
      'Já vinculada',
      'Esta equipe do acervo já está vinculada a uma equipe do portal.',
    )
  if (result === 'pending')
    return problem(c, 409, 'Solicitação aberta', 'Já existe um pedido de vínculo em análise.')
  return c.json(toClaim(result), 201)
})

community.get('/claims', async (c) => {
  const { sub } = c.get('auth')
  const rows = await withUser(
    sub,
    async (db) =>
      (
        await db.query(
          `SELECT c.*, ct.display_name FROM community_claims c
           JOIN community_teams ct ON ct.id = c.community_team_id
           ORDER BY c.created_at DESC LIMIT 100`,
          [],
        )
      ).rows,
  )
  return c.json(rows.map(toClaim))
})

function toClaim(row: Record<string, unknown>) {
  return {
    id: row.id,
    teamId: row.team_id,
    communityTeamId: row.community_team_id,
    communityTeamName: row.display_name ?? null,
    evidence: row.evidence ?? null,
    status: row.status,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at ?? null,
  }
}

// ---------- correções ----------

const correctionBody = z.object({
  target: z.object({
    competitionId: z.string().uuid().optional(),
    communityTeamId: z.string().uuid().optional(),
    field: z.string().trim().max(60),
  }),
  proposal: z.string().trim().min(1).max(1000),
  sourceUrl: z.string().trim().max(500).optional(),
})

community.post('/corrections', async (c) => {
  const parsed = correctionBody.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return problem(c, 400, 'Body inválido', parsed.error.message)
  const { sub } = c.get('auth')
  const row = await withUser(sub, async (db) => {
    const r = await db.query(
      `INSERT INTO result_corrections (requested_by, target, proposal, source_url)
       VALUES ($1, $2::jsonb, $3, $4) RETURNING *`,
      [
        sub,
        JSON.stringify(parsed.data.target),
        parsed.data.proposal,
        parsed.data.sourceUrl ?? null,
      ],
    )
    await audit(db, {
      actorUserId: sub,
      action: 'community.correction.create',
      resourceType: 'community',
      resourceId: r.rows[0].id,
      ip: clientIp(c.req.raw.headers),
    })
    return r.rows[0]
  })
  return c.json(toCorrection(row), 201)
})

community.get('/corrections', async (c) => {
  const { sub } = c.get('auth')
  const rows = await withUser(
    sub,
    async (db) =>
      (await db.query('SELECT * FROM result_corrections ORDER BY created_at DESC LIMIT 100', []))
        .rows,
  )
  return c.json(rows.map(toCorrection))
})

function toCorrection(row: Record<string, unknown>) {
  return {
    id: row.id,
    target: asJson<Record<string, unknown>>(row.target, {}),
    proposal: row.proposal,
    sourceUrl: row.source_url ?? null,
    status: row.status,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at ?? null,
  }
}

// ---------- coorte e benchmark ----------

export async function cohortOfTeam(db: DbClient, teamId: string): Promise<string | null> {
  const r = await db.query(
    `SELECT co.c_cohort AS cohort
     FROM community_teams ct
     JOIN community_cohorts() co ON co.c_community_team_id = ct.id
     WHERE ct.claimed_by_team_id = $1`,
    [teamId],
  )
  return (r.rows[0]?.cohort as string | undefined) ?? null
}

community.get('/benchmark', async (c) => {
  const { sub } = c.get('auth')
  const teamId = c.req.query('teamId')
  const competitionId = c.req.query('competitionId')
  if (!teamId || !competitionId)
    return problem(c, 400, 'Parâmetros faltando', 'Informe teamId e competitionId.')

  const result = await withUser(sub, async (db) => {
    if (!(await myRole(db, teamId, sub))) return 'notfound' as const
    const cohort = await cohortOfTeam(db, teamId)
    if (!cohort) return 'no-claim' as const
    const rows = await db.query('SELECT * FROM community_benchmark($1, $2)', [
      competitionId,
      cohort,
    ])
    return { cohort, rows: rows.rows }
  })

  if (result === 'notfound') return problem(c, 404, 'Equipe não encontrada')
  if (result === 'no-claim')
    return c.json({ visible: false, reason: 'sem-vinculo', floor: COHORT_FLOOR, cohort: null })
  return c.json(toBenchmark(result.cohort, result.rows))
})

/**
 * Piso de 8 equipes na coorte (RF-3.2). Abaixo disso o marcador de mediana
 * simplesmente não aparece — a resposta diz por quê em vez de devolver um número
 * que a UI teria que aprender a esconder.
 */
export function toBenchmark(cohort: string, rows: Record<string, unknown>[]) {
  const teams = Math.max(0, ...rows.map((r) => Number(r.b_teams ?? 0)))
  if (teams < COHORT_FLOOR) {
    return {
      visible: false,
      reason: 'coorte-pequena',
      floor: COHORT_FLOOR,
      teams,
      cohort,
      cohortLabel: COHORT_LABELS[cohort] ?? cohort,
      events: {},
    }
  }
  const events: Record<string, number> = {}
  for (const r of rows) {
    if (r.b_event === '_fonte') continue
    events[r.b_event as string] = Math.round(Number(r.b_median) * 100) / 100
  }
  return {
    visible: true,
    floor: COHORT_FLOOR,
    teams,
    cohort,
    cohortLabel: COHORT_LABELS[cohort] ?? cohort,
    events,
  }
}

// ---------- meta a partir do benchmark (RF-3.3) ----------

const goalBody = z.object({
  teamId: z.string().uuid(),
  competitionId: z.string().uuid(),
  event: z.string().trim().min(1).max(60),
})

community.post('/goals', async (c) => {
  const parsed = goalBody.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return problem(c, 400, 'Body inválido', parsed.error.message)
  const { sub } = c.get('auth')
  const { teamId, competitionId, event } = parsed.data

  const result = await withUser(sub, async (db) => {
    const role = await myRole(db, teamId, sub)
    if (!role) return 'notfound' as const
    if (!can(role, 'step.manage')) return 'forbidden' as const
    const comp = await db.query('SELECT name FROM competitions WHERE id = $1', [competitionId])
    if (!comp.rowCount) return 'no-competition' as const
    const title = `Recuperar a mediana de ${event}: ${comp.rows[0].name}`.slice(0, 140)
    const r = await db.query(
      `INSERT INTO evolution_steps (team_id, title, origin, link_ref, created_by, position)
       VALUES ($1, $2, 'meta', $3, $4, 0) RETURNING *`,
      [teamId, title, `competition:${competitionId}`, sub],
    )
    await audit(db, {
      actorUserId: sub,
      action: 'evolution.step.create',
      resourceType: 'team',
      resourceId: teamId,
      ip: clientIp(c.req.raw.headers),
      metadata: { origin: 'meta', competitionId, event },
    })
    return r.rows[0]
  })

  if (result === 'notfound') return problem(c, 404, 'Equipe não encontrada')
  if (result === 'no-competition') return problem(c, 404, 'Competição não encontrada')
  if (result === 'forbidden')
    return problem(c, 403, 'Sem permissão', 'Metas da temporada são definidas pela capitania.')
  return c.json({ id: result.id, title: result.title, origin: result.origin }, 201)
})

// ---------- administração (DF-9) ----------

export const communityAdmin = new Hono<AuthEnv>()

const resolveClaimBody = z.object({ approve: z.boolean() })

communityAdmin.post('/claims/:id/resolve', async (c) => {
  const parsed = resolveClaimBody.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return problem(c, 400, 'Body inválido', parsed.error.message)
  const { sub } = c.get('auth')
  const claimId = c.req.param('id')

  const result = await withUser(sub, async (db) => {
    const claim = await db.query(
      `SELECT * FROM community_claims WHERE id = $1 AND status = 'aberta'`,
      [claimId],
    )
    if (!claim.rowCount) return 'notfound' as const
    const { team_id: teamId, community_team_id: communityTeamId } = claim.rows[0]

    if (parsed.data.approve) {
      // 1:1 dos dois lados (RF-2.3): o acervo não pode apontar para duas equipes
      const livre = await db.query(
        'SELECT 1 FROM community_teams WHERE id = $1 AND claimed_by_team_id IS NULL',
        [communityTeamId],
      )
      if (!livre.rowCount) return 'taken' as const
      await db.query('UPDATE community_teams SET claimed_by_team_id = $2 WHERE id = $1', [
        communityTeamId,
        teamId,
      ])
      // resultado da equipe vinculada vira CONTEXTO na atividade; não afeta nível
      // (maturidade ≠ resultado — ADR-010)
      const ultimo = await db.query(
        `SELECT r.position, r.points_total, c.name, c.season
         FROM competition_results r JOIN competitions c ON c.id = r.competition_id
         WHERE r.community_team_id = $1
         ORDER BY c.season DESC LIMIT 1`,
        [communityTeamId],
      )
      if (ultimo.rowCount) {
        const total = await db.query(
          `SELECT count(*)::int AS n FROM competition_results r
           JOIN competitions c ON c.id = r.competition_id
           WHERE c.season = $1 AND c.name = $2`,
          [ultimo.rows[0].season, ultimo.rows[0].name],
        )
        await recordEvidence(db, {
          teamId,
          source: 'community',
          kind: 'competition.result',
          payload: {
            position: ultimo.rows[0].position != null ? Number(ultimo.rows[0].position) : null,
            total: Number(total.rows[0]?.n ?? 0),
            competition: ultimo.rows[0].name,
            pointsTotal:
              ultimo.rows[0].points_total != null ? Number(ultimo.rows[0].points_total) : null,
          },
          actorUserId: sub,
        })
        await recomputeTeam(db, teamId, { actorUserId: sub })
      }
    }

    await db.query(
      `UPDATE community_claims
       SET status = $2, resolved_by = $3, resolved_at = now()
       WHERE id = $1`,
      [claimId, parsed.data.approve ? 'aprovada' : 'recusada', sub],
    )
    await audit(db, {
      actorUserId: sub,
      action: 'admin.community.claim',
      resourceType: 'community',
      resourceId: claimId,
      ip: clientIp(c.req.raw.headers),
      metadata: { approve: parsed.data.approve, teamId, communityTeamId },
    })
    return 'ok' as const
  })

  if (result === 'notfound') return problem(c, 404, 'Solicitação não encontrada')
  if (result === 'taken')
    return problem(c, 409, 'Já vinculada', 'Outra equipe já foi vinculada a este registro.')
  return c.body(null, 204)
})

const resolveCorrectionBody = z.object({
  apply: z.boolean(),
  note: z.string().trim().max(1000).optional(),
  /** Valor novo já validado pelo admin; o portal NUNCA edita em silêncio (§3.2). */
  patch: z
    .object({
      competitionId: z.string().uuid(),
      communityTeamId: z.string().uuid(),
      position: z.number().int().nullable().optional(),
      pointsTotal: z.number().nullable().optional(),
      sourceUrl: z.string().max(500).optional(),
    })
    .optional(),
})

communityAdmin.post('/corrections/:id/resolve', async (c) => {
  const parsed = resolveCorrectionBody.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return problem(c, 400, 'Body inválido', parsed.error.message)
  const { sub } = c.get('auth')
  const id = c.req.param('id')

  const result = await withUser(sub, async (db) => {
    const cur = await db.query(
      `SELECT 1 FROM result_corrections WHERE id = $1 AND status = 'aberta'`,
      [id],
    )
    if (!cur.rowCount) return 'notfound' as const
    if (parsed.data.apply && parsed.data.patch) {
      const p = parsed.data.patch
      const r = await db.query(
        `UPDATE competition_results SET
           position = COALESCE($3, position),
           points_total = COALESCE($4, points_total),
           source_url = COALESCE($5, source_url),
           ingested_at = now()
         WHERE competition_id = $1 AND community_team_id = $2 RETURNING competition_id`,
        [
          p.competitionId,
          p.communityTeamId,
          p.position ?? null,
          p.pointsTotal ?? null,
          p.sourceUrl ?? null,
        ],
      )
      if (!r.rowCount) return 'no-result' as const
    }
    await db.query(
      `UPDATE result_corrections
       SET status = $2, resolved_by = $3, resolved_at = now() WHERE id = $1`,
      [id, parsed.data.apply ? 'aplicada' : 'recusada', sub],
    )
    await audit(db, {
      actorUserId: sub,
      action: 'admin.community.correction',
      resourceType: 'community',
      resourceId: id,
      ip: clientIp(c.req.raw.headers),
      metadata: { apply: parsed.data.apply, note: parsed.data.note ?? null, ...parsed.data.patch },
    })
    return 'ok' as const
  })

  if (result === 'notfound') return problem(c, 404, 'Solicitação não encontrada')
  if (result === 'no-result') return problem(c, 404, 'Resultado não encontrado')
  return c.body(null, 204)
})

communityAdmin.get('/cohorts', async (c) => {
  const { sub } = c.get('auth')
  const rows = await withUser(
    sub,
    async (db) =>
      (
        await db.query(
          `SELECT c_cohort AS cohort, count(*)::int AS teams
           FROM community_cohorts() GROUP BY c_cohort ORDER BY c_cohort`,
          [],
        )
      ).rows,
  )
  return c.json(
    rows.map((r) => ({
      cohort: r.cohort,
      label: COHORT_LABELS[r.cohort as string] ?? r.cohort,
      teams: Number(r.teams),
    })),
  )
})

// ---------- curadoria do registro canônico (DF-15 RF-2.1, admin) ----------

/**
 * A lista de "Equipes do Brasil" nasceu de um levantamento e cresceu com o que os
 * resultados trouxeram: nome grafado de três jeitos, UF faltando, equipe que mudou
 * de instituição. Sem edição pela administração, a única saída era rodar o script de
 * ingestão de novo — e ele não conserta o que veio torto da fonte.
 */
const teamBody = z.object({
  displayName: z.string().trim().min(1).max(200),
  university: z.string().trim().max(200).nullable().optional(),
  city: z.string().trim().max(120).nullable().optional(),
  uf: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, 'UF é a sigla de dois caracteres')
    .nullable()
    .optional(),
  links: z.array(z.url().max(500)).max(8).optional(),
})

const teamPatch = teamBody.partial()

/** Nome de região coerente com a UF — o dado novo nunca nasce divergente. */
function regionNameOf(uf: string | null): string | null {
  const id = uf ? regiaoDe(uf, null) : null
  return id ? REGIAO_NOME[id] : null
}

/** Lista de curadoria: os mesmos recortes da aba pública, mais o estado do vínculo. */
communityAdmin.get('/teams', async (c) => {
  const { sub } = c.get('auth')
  const q = (c.req.query('q') ?? '').trim()
  const uf = (c.req.query('uf') ?? '').trim().toUpperCase()
  const regiao = REGIAO_IDS.find((id) => id === c.req.query('region')) ?? null
  const limit = Math.min(Number(c.req.query('limit') ?? 50) || 50, 200)
  const offset = Math.max(Number(c.req.query('offset') ?? 0) || 0, 0)

  const rows = await withUser(sub, async (db) => {
    const r = await db.query(
      `SELECT ct.*, t.name AS claimed_team_name,
              (SELECT count(*)::int FROM competition_results cr
                WHERE cr.community_team_id = ct.id) AS results
       FROM community_teams ct
       LEFT JOIN teams t ON t.id = ct.claimed_by_team_id
       WHERE ($3::text IS NULL OR ct.display_name ILIKE '%' || $3 || '%'
              OR ct.university ILIKE '%' || $3 || '%')
         AND ($4::text IS NULL OR upper(ct.uf) = $4)
         AND ($5::text IS NULL
              OR upper(ct.uf) IN (SELECT jsonb_array_elements_text($6::jsonb))
              OR (ct.uf IS NULL AND lower(ct.region) = lower($5)))
       ORDER BY ct.display_name LIMIT $1 OFFSET $2`,
      [
        limit,
        offset,
        q || null,
        uf || null,
        regiao ? REGIAO_NOME[regiao] : null,
        JSON.stringify(regiao ? UFS_DA_REGIAO[regiao] : []),
      ],
    )
    await audit(db, {
      actorUserId: sub,
      action: 'admin.view',
      resourceType: 'admin',
      resourceId: 'community.teams',
      ip: clientIp(c.req.raw.headers),
      metadata: { q, uf, region: regiao, limit, offset },
    })
    return r.rows
  })

  return c.json(
    rows.map((row) => ({
      ...toCommunityTeam(row),
      claimedTeamName: (row.claimed_team_name as string | null) ?? null,
      results: Number(row.results ?? 0),
    })),
  )
})

communityAdmin.post('/teams', async (c) => {
  const parsed = teamBody.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return problem(c, 400, 'Body inválido', parsed.error.message)
  const { sub } = c.get('auth')
  const b = parsed.data
  const uf = b.uf ?? null

  const row = await withUser(sub, async (db) => {
    const r = await db.query(
      `INSERT INTO community_teams (display_name, university, city, uf, region, links)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb) RETURNING *`,
      [
        b.displayName,
        b.university ?? null,
        b.city ?? null,
        uf,
        regionNameOf(uf),
        JSON.stringify(b.links ?? []),
      ],
    )
    await audit(db, {
      actorUserId: sub,
      action: 'admin.community.team_create',
      resourceType: 'community_team',
      resourceId: r.rows[0].id as string,
      ip: clientIp(c.req.raw.headers),
      metadata: { displayName: b.displayName, uf },
    })
    return r.rows[0]
  })

  return c.json(toCommunityTeam(row), 201)
})

communityAdmin.patch('/teams/:id', async (c) => {
  const parsed = teamPatch.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return problem(c, 400, 'Body inválido', parsed.error.message)
  const { sub } = c.get('auth')
  const id = c.req.param('id')
  const b = parsed.data

  const row = await withUser(sub, async (db) => {
    const r = await db.query(
      `UPDATE community_teams SET
         display_name = COALESCE($2, display_name),
         university = CASE WHEN $3::boolean THEN $4 ELSE university END,
         city = CASE WHEN $5::boolean THEN $6 ELSE city END,
         uf = CASE WHEN $7::boolean THEN $8 ELSE uf END,
         region = CASE WHEN $7::boolean THEN $9 ELSE region END,
         links = CASE WHEN $10::boolean THEN $11::jsonb ELSE links END
       WHERE id = $1 RETURNING *`,
      [
        id,
        b.displayName ?? null,
        b.university !== undefined,
        b.university ?? null,
        b.city !== undefined,
        b.city ?? null,
        // UF e região andam juntas: trocar o estado sem corrigir a região deixaria a
        // linha com a região velha — que é exatamente o dado de que o filtro depende
        b.uf !== undefined,
        b.uf ?? null,
        regionNameOf(b.uf ?? null),
        b.links !== undefined,
        JSON.stringify(b.links ?? []),
      ],
    )
    if (!r.rowCount) return null
    await audit(db, {
      actorUserId: sub,
      action: 'admin.community.team_update',
      resourceType: 'community_team',
      resourceId: id,
      ip: clientIp(c.req.raw.headers),
      metadata: { patch: Object.keys(b) },
    })
    return r.rows[0]
  })

  if (!row) return problem(c, 404, 'Equipe não encontrada no acervo')
  return c.json(toCommunityTeam(row))
})

/**
 * Excluir só o que não deixou rastro. Uma linha com resultado é a âncora daquele
 * resultado no acervo: apagá-la levaria junto a colocação de uma competição inteira
 * (ON DELETE CASCADE em `competition_results`). Duplicata sem resultado é o caso
 * real — nome grafado de outro jeito na ingestão.
 */
communityAdmin.delete('/teams/:id', async (c) => {
  const { sub } = c.get('auth')
  const id = c.req.param('id')

  const result = await withUser(sub, async (db) => {
    const ct = await db.query('SELECT claimed_by_team_id FROM community_teams WHERE id = $1', [id])
    if (!ct.rowCount) return 'notfound' as const
    if (ct.rows[0].claimed_by_team_id) return 'claimed' as const
    const res = await db.query(
      'SELECT count(*)::int AS n FROM competition_results WHERE community_team_id = $1',
      [id],
    )
    if (Number(res.rows[0].n) > 0) return 'has-results' as const
    // a fila não pode ficar apontando para uma linha que deixou de existir
    await db.query(
      `UPDATE community_claims SET status = 'recusada', resolved_by = $2, resolved_at = now()
       WHERE community_team_id = $1 AND status = 'aberta'`,
      [id, sub],
    )
    await db.query('DELETE FROM community_teams WHERE id = $1', [id])
    await audit(db, {
      actorUserId: sub,
      action: 'admin.community.team_delete',
      resourceType: 'community_team',
      resourceId: id,
      ip: clientIp(c.req.raw.headers),
      metadata: {},
    })
    return 'ok' as const
  })

  if (result === 'notfound') return problem(c, 404, 'Equipe não encontrada no acervo')
  if (result === 'claimed')
    return problem(
      c,
      409,
      'Equipe vinculada',
      'Desfaça o vínculo antes de excluir esta equipe do acervo.',
    )
  if (result === 'has-results')
    return problem(
      c,
      409,
      'Equipe com resultados',
      'Esta equipe tem resultados no acervo e não pode ser excluída. Corrija os dados em vez de apagar.',
    )
  return c.body(null, 204)
})

/** RF-2.3 — desfazer o vínculo é ato de administração. */
communityAdmin.post('/teams/:id/unlink', async (c) => {
  const { sub } = c.get('auth')
  const id = c.req.param('id')

  const result = await withUser(sub, async (db) => {
    const r = await db.query(
      `UPDATE community_teams SET claimed_by_team_id = NULL
       WHERE id = $1 AND claimed_by_team_id IS NOT NULL
       RETURNING id`,
      [id],
    )
    if (!r.rowCount) return 'notfound' as const
    await audit(db, {
      actorUserId: sub,
      action: 'admin.community.team_unlink',
      resourceType: 'community_team',
      resourceId: id,
      ip: clientIp(c.req.raw.headers),
      metadata: {},
    })
    return 'ok' as const
  })

  if (result === 'notfound') return problem(c, 404, 'Vínculo não encontrado')
  return c.body(null, 204)
})

/**
 * Fila de vínculos da administração. `GET /community/claims` já existe, mas devolve
 * o que a RLS deixa passar SEM o nome da equipe do portal — e é justamente ele que a
 * administração precisa ler para decidir. Aqui o join é explícito.
 */
communityAdmin.get('/claims', async (c) => {
  const { sub } = c.get('auth')
  const pedido = c.req.query('status') ?? ''
  const status = ['aberta', 'aprovada', 'recusada'].includes(pedido) ? pedido : null
  const limit = Math.min(Number(c.req.query('limit') ?? 50) || 50, 200)
  const offset = Math.max(Number(c.req.query('offset') ?? 0) || 0, 0)

  const rows = await withUser(sub, async (db) => {
    const r = await db.query(
      `SELECT cl.*, ct.display_name, ct.university, ct.uf, ct.region,
              ct.claimed_by_team_id, t.name AS team_name, t.university AS team_university,
              u.display_name AS requested_by_name, u.email AS requested_by_email
       FROM community_claims cl
       JOIN community_teams ct ON ct.id = cl.community_team_id
       LEFT JOIN teams t ON t.id = cl.team_id
       LEFT JOIN users u ON u.id = cl.requested_by
       WHERE ($3::text IS NULL OR cl.status = $3)
       ORDER BY (cl.status = 'aberta') DESC, cl.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset, status],
    )
    await audit(db, {
      actorUserId: sub,
      action: 'admin.view',
      resourceType: 'admin',
      resourceId: 'community.claims',
      ip: clientIp(c.req.raw.headers),
      metadata: { status, limit, offset },
    })
    return r.rows
  })

  return c.json(
    rows.map((row) => ({
      ...toClaim(row),
      teamName: (row.team_name as string | null) ?? null,
      teamUniversity: (row.team_university as string | null) ?? null,
      communityTeamUniversity: (row.university as string | null) ?? null,
      communityTeamUf: (row.uf as string | null) ?? null,
      // já vinculada a OUTRA equipe: aprovar vai falhar com 409, e a fila avisa antes
      communityTeamTaken: row.claimed_by_team_id != null && row.claimed_by_team_id !== row.team_id,
      requestedBy: (row.requested_by_name as string | null) ?? null,
      requestedByEmail: (row.requested_by_email as string | null) ?? null,
    })),
  )
})
