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

community.get('/teams', async (c) => {
  const { sub } = c.get('auth')
  const q = (c.req.query('q') ?? '').trim()
  const region = c.req.query('region')
  const limit = Math.min(Number(c.req.query('limit') ?? 50) || 50, 200)
  const rows = await withUser(
    sub,
    async (db) =>
      (
        await db.query(
          `SELECT * FROM community_teams
           WHERE ($2::text IS NULL OR display_name ILIKE '%' || $2 || '%'
                  OR university ILIKE '%' || $2 || '%')
             AND ($3::text IS NULL OR region = $3)
           ORDER BY display_name LIMIT $1`,
          [limit, q || null, region ?? null],
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
  return {
    id: row.id,
    displayName: row.display_name,
    university: row.university ?? null,
    city: row.city ?? null,
    uf: row.uf ?? null,
    region: row.region ?? null,
    links: asJson<unknown[]>(row.links, []),
    claimed: row.claimed_by_team_id != null,
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
