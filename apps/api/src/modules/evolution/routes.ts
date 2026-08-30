import { Hono } from 'hono'
import { z } from 'zod'
import { AREA_IDS, AREA_LABELS, levelName } from '@bajeiros/evolution/areas'
import { CATALOG_VERSION, criterionById } from '@bajeiros/evolution/catalog'
import { destinationFor } from '@bajeiros/evolution/destinations'
import type { EvolutionResult } from '@bajeiros/evolution/types'
import { withUser, type DbClient } from '../../db'
import { problem } from '../../problem'
import { audit, clientIp } from '../../audit'
import { can } from '../../policy'
import { lockTeam, myRole } from '../teams/shared'
import type { AuthEnv } from '../../auth/middleware'
import { recomputeTeam, recordEvidence, syncSeasonProjectStep } from './engine'

// DF-13 — API da evolução. Montada em /api/v1/teams (rotas por equipe) e
// /api/v1/evolution (benchmark, que não é de uma equipe só).

export const evolution = new Hono<AuthEnv>()
export const evolutionRoot = new Hono<AuthEnv>()

/** Piso de coorte: abaixo disso a linha de benchmark não aparece (RF-7.2 / P-5.2). */
export const COHORT_FLOOR = 8

const MAX_MANUAL_STEPS = 100
const MAX_MILESTONES = 12

// ---------- leitura ----------

evolution.get('/:id/evolution', async (c) => {
  const { sub } = c.get('auth')
  const teamId = c.req.param('id')
  const result = await withUser(sub, async (db) => {
    if (!(await myRole(db, teamId, sub))) return 'notfound' as const
    const season = await loadSeason(db, teamId)
    await syncSeasonProjectStep(db, teamId, !!season?.seasonProjectId)
    // O GET recomputa: os critérios com janela temporal (CON-3.2/4.1/4.2) expiram
    // sem evidência nova, e o recálculo diário pode não ter rodado ainda (RF-2.3).
    // Só escreve quando algo mudou de verdade.
    const evo = await recomputeTeam(db, teamId, { actorUserId: sub })
    return { evo, season }
  })
  if (result === 'notfound') return problem(c, 404, 'Equipe não encontrada')
  return c.json({
    ...toEvolution(result.evo),
    season: result.season,
    bootstrap: !result.season?.seasonProjectId,
  })
})

function toEvolution(evo: EvolutionResult) {
  return {
    catalogVersion: evo.catalogVersion,
    average: evo.average,
    areas: evo.areas.map((a) => ({
      area: a.area,
      label: AREA_LABELS[a.area],
      level: a.level,
      levelName: levelName(a.level),
      criteria: a.criteria.map((cr) => ({
        id: cr.id,
        level: cr.level,
        type: cr.type,
        label: cr.label,
        source: cr.source,
        satisfied: cr.satisfied,
        reason: cr.reason,
        linkHint: cr.linkHint ?? null,
        destination: destinationFor(cr.id),
      })),
      pending: a.pending.map((cr) => cr.id),
    })),
  }
}

// ---------- declarações (RF-3.x) ----------

const declareBody = z.object({
  note: z.string().trim().max(500).optional(),
  linkKind: z.enum(['decision', 'guide', 'project', 'url']).optional(),
  linkRef: z.string().trim().max(500).optional(),
})

evolution.post('/:id/evolution/declarations/:cid', async (c) => {
  const parsed = declareBody.safeParse((await c.req.json().catch(() => null)) ?? {})
  if (!parsed.success) return problem(c, 400, 'Body inválido', parsed.error.message)
  const { sub } = c.get('auth')
  const teamId = c.req.param('id')
  const criterionId = c.req.param('cid')

  const criterion = criterionById(criterionId)
  if (!criterion) return problem(c, 404, 'Critério não encontrado')
  if (criterion.type !== 'declarado') {
    return problem(
      c,
      409,
      'Critério não é declarável',
      criterion.type === 'auto'
        ? 'Este critério é verificado automaticamente pelo portal.'
        : 'Este critério depende de uma ferramenta que ainda não existe.',
    )
  }

  const result = await withUser(sub, async (db) => {
    if (!(await lockTeam(db, teamId))) return 'notfound' as const
    const role = await myRole(db, teamId, sub)
    if (!role) return 'notfound' as const
    if (!can(role, 'evolution.declare')) return 'forbidden' as const

    await db.query(
      `INSERT INTO evolution_declarations (team_id, criterion_id, note, link_kind, link_ref, declared_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (team_id, criterion_id) DO UPDATE
         SET note = EXCLUDED.note, link_kind = EXCLUDED.link_kind,
             link_ref = EXCLUDED.link_ref, declared_by = EXCLUDED.declared_by,
             declared_at = now()`,
      [
        teamId,
        criterionId,
        parsed.data.note ?? null,
        parsed.data.linkKind ?? null,
        parsed.data.linkRef ?? null,
        sub,
      ],
    )
    await recordEvidence(db, {
      teamId,
      source: 'evolution',
      kind: 'criterion.declared',
      payload: { criterionId, area: criterion.area, label: criterion.label },
      actorUserId: sub,
    })
    await audit(db, {
      actorUserId: sub,
      action: 'evolution.declare',
      resourceType: 'team',
      resourceId: teamId,
      ip: clientIp(c.req.raw.headers),
      metadata: { criterionId },
    })
    return { evo: await recomputeTeam(db, teamId, { actorUserId: sub }) }
  })

  if (result === 'notfound') return problem(c, 404, 'Equipe não encontrada')
  if (result === 'forbidden')
    return problem(c, 403, 'Sem permissão', 'Apenas a capitania declara critérios.')
  return c.json(toEvolution(result.evo))
})

evolution.delete('/:id/evolution/declarations/:cid', async (c) => {
  const { sub } = c.get('auth')
  const teamId = c.req.param('id')
  const criterionId = c.req.param('cid')

  const result = await withUser(sub, async (db) => {
    if (!(await lockTeam(db, teamId))) return 'notfound' as const
    const role = await myRole(db, teamId, sub)
    if (!role) return 'notfound' as const
    if (!can(role, 'evolution.declare')) return 'forbidden' as const
    const r = await db.query(
      'DELETE FROM evolution_declarations WHERE team_id = $1 AND criterion_id = $2 RETURNING criterion_id',
      [teamId, criterionId],
    )
    if (!r.rowCount) return 'no-declaration' as const
    await audit(db, {
      actorUserId: sub,
      action: 'evolution.revoke',
      resourceType: 'team',
      resourceId: teamId,
      ip: clientIp(c.req.raw.headers),
      metadata: { criterionId },
    })
    return { evo: await recomputeTeam(db, teamId, { actorUserId: sub }) }
  })

  if (result === 'notfound') return problem(c, 404, 'Equipe não encontrada')
  if (result === 'no-declaration') return problem(c, 404, 'Declaração não encontrada')
  if (result === 'forbidden')
    return problem(c, 403, 'Sem permissão', 'Apenas a capitania revoga declarações.')
  return c.json(toEvolution(result.evo))
})

// ---------- fila de próximos passos (RF-4.x) ----------

evolution.get('/:id/evolution/steps', async (c) => {
  const { sub } = c.get('auth')
  const teamId = c.req.param('id')
  const status = c.req.query('status') ?? 'open'
  if (!['open', 'done', 'dismissed', 'all'].includes(status))
    return problem(c, 400, 'Filtro inválido', 'status: open | done | dismissed | all')

  const rows = await withUser(sub, async (db) => {
    if (!(await myRole(db, teamId, sub))) return null
    const r = await db.query(
      `SELECT * FROM evolution_steps
       WHERE team_id = $1 AND ($2 = 'all' OR status = $2)
       ORDER BY position, created_at
       LIMIT 200`,
      [teamId, status],
    )
    return r.rows
  })
  if (!rows) return problem(c, 404, 'Equipe não encontrada')
  return c.json(rows.map(toStep))
})

const createStepBody = z.object({
  title: z.string().trim().min(1).max(140),
  area: z.enum(AREA_IDS as unknown as [string, ...string[]]).optional(),
  origin: z.enum(['manual', 'meta']).optional(),
  linkRef: z.string().trim().max(500).optional(),
})

evolution.post('/:id/evolution/steps', async (c) => {
  const parsed = createStepBody.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return problem(c, 400, 'Body inválido', parsed.error.message)
  const { sub } = c.get('auth')
  const teamId = c.req.param('id')
  const origin = parsed.data.origin ?? 'manual'

  const result = await withUser(sub, async (db) => {
    const role = await myRole(db, teamId, sub)
    if (!role) return 'notfound' as const
    // meta vem do benchmark (DF-15 RF-3.3) e é ato de capitania, não de qualquer membro
    if (origin === 'meta' && !can(role, 'step.manage')) return 'forbidden' as const
    const n = await db.query(
      `SELECT count(*)::int AS n FROM evolution_steps
       WHERE team_id = $1 AND origin <> 'criterion' AND status = 'open'`,
      [teamId],
    )
    if (Number(n.rows[0].n) >= MAX_MANUAL_STEPS) return 'limit' as const
    const r = await db.query(
      `INSERT INTO evolution_steps (team_id, title, area, origin, link_ref, created_by, position)
       VALUES ($1, $2, $3, $4, $5, $6, 0) RETURNING *`,
      [
        teamId,
        parsed.data.title,
        parsed.data.area ?? null,
        origin,
        parsed.data.linkRef ?? null,
        sub,
      ],
    )
    await audit(db, {
      actorUserId: sub,
      action: 'evolution.step.create',
      resourceType: 'team',
      resourceId: teamId,
      ip: clientIp(c.req.raw.headers),
      metadata: { origin },
    })
    return r.rows[0]
  })

  if (result === 'notfound') return problem(c, 404, 'Equipe não encontrada')
  if (result === 'forbidden')
    return problem(c, 403, 'Sem permissão', 'Metas da temporada são definidas pela capitania.')
  if (result === 'limit')
    return problem(c, 409, 'Fila cheia', `Máximo de ${MAX_MANUAL_STEPS} passos abertos.`)
  return c.json(toStep(result), 201)
})

const patchStepBody = z.object({
  ownerUserId: z.string().uuid().nullable().optional(),
  position: z.number().int().min(0).max(999).optional(),
  status: z.enum(['open', 'done', 'dismissed']).optional(),
})

evolution.patch('/:id/evolution/steps/:sid', async (c) => {
  const parsed = patchStepBody.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return problem(c, 400, 'Body inválido', parsed.error.message)
  const { sub } = c.get('auth')
  const teamId = c.req.param('id')
  const stepId = c.req.param('sid')
  const body = parsed.data

  const result = await withUser(sub, async (db) => {
    if (!(await lockTeam(db, teamId))) return 'notfound' as const
    const role = await myRole(db, teamId, sub)
    if (!role) return 'notfound' as const
    const cur = await db.query(
      'SELECT owner_user_id, criterion_id FROM evolution_steps WHERE id = $1 AND team_id = $2',
      [stepId, teamId],
    )
    if (!cur.rowCount) return 'no-step' as const

    const manages = can(role, 'step.manage')
    const isOwner = cur.rows[0].owner_user_id === sub
    // dono/ordem/descarte é capitania; concluir é de quem carrega o passo (RF-4.3)
    if ((body.ownerUserId !== undefined || body.position !== undefined) && !manages)
      return 'forbidden' as const
    if (body.status !== undefined && !manages && !(isOwner && body.status === 'done'))
      return 'forbidden' as const

    if (body.ownerUserId) {
      const m = await db.query('SELECT 1 FROM team_members WHERE team_id = $1 AND user_id = $2', [
        teamId,
        body.ownerUserId,
      ])
      if (!m.rowCount) return 'bad-owner' as const
    }

    const r = await db.query(
      `UPDATE evolution_steps SET
         owner_user_id = CASE WHEN $3::boolean THEN $4 ELSE owner_user_id END,
         position      = COALESCE($5, position),
         status        = COALESCE($6, status),
         done_at       = CASE WHEN $6 = 'done' THEN now()
                              WHEN $6 IS NOT NULL THEN NULL ELSE done_at END,
         done_by       = CASE WHEN $6 = 'done' THEN $7::uuid
                              WHEN $6 IS NOT NULL THEN NULL ELSE done_by END
       WHERE id = $1 AND team_id = $2 RETURNING *`,
      [
        stepId,
        teamId,
        body.ownerUserId !== undefined,
        body.ownerUserId ?? null,
        body.position ?? null,
        body.status ?? null,
        sub,
      ],
    )
    await audit(db, {
      actorUserId: sub,
      action: 'evolution.step.update',
      resourceType: 'team',
      resourceId: teamId,
      ip: clientIp(c.req.raw.headers),
      metadata: { stepId, ...body },
    })
    return r.rows[0]
  })

  if (result === 'notfound') return problem(c, 404, 'Equipe não encontrada')
  if (result === 'no-step') return problem(c, 404, 'Passo não encontrado')
  if (result === 'bad-owner') return problem(c, 400, 'Dono inválido', 'A pessoa não é da equipe.')
  if (result === 'forbidden')
    return problem(c, 403, 'Sem permissão', 'Apenas a capitania organiza a fila.')
  return c.json(toStep(result))
})

function toStep(row: Record<string, unknown>) {
  const criterionId = (row.criterion_id as string | null) ?? null
  return {
    id: row.id,
    title: row.title,
    area: row.area ?? null,
    origin: row.origin,
    criterionId,
    linkRef: row.link_ref ?? null,
    ownerUserId: row.owner_user_id ?? null,
    position: Number(row.position ?? 0),
    status: row.status,
    destination: criterionId ? destinationFor(criterionId) : null,
    createdAt: row.created_at,
    doneAt: row.done_at ?? null,
  }
}

// ---------- temporada (RF-5.x) ----------

const milestone = z.object({
  title: z.string().trim().min(1).max(120),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'data no formato AAAA-MM-DD'),
})

const seasonBody = z.object({
  label: z.string().trim().min(1).max(20),
  seasonProjectId: z.string().uuid().nullable().optional(),
  milestones: z.array(milestone).max(MAX_MILESTONES).optional(),
  competitionIds: z.array(z.string().uuid()).max(MAX_MILESTONES).optional(),
})

export interface SeasonView {
  label: string
  seasonProjectId: string | null
  milestones: { title: string; date: string }[]
  competitionIds: string[]
  next: { title: string; date: string; daysLeft: number } | null
  updatedAt: string | null
}

export async function loadSeason(db: DbClient, teamId: string): Promise<SeasonView | null> {
  const r = await db.query('SELECT * FROM team_season WHERE team_id = $1', [teamId])
  if (!r.rowCount) return null
  return toSeason(r.rows[0])
}

function toSeason(row: Record<string, unknown>): SeasonView {
  const milestones = asJson<{ title: string; date: string }[]>(row.milestones, [])
  return {
    label: row.label as string,
    seasonProjectId: (row.season_project_id as string | null) ?? null,
    milestones,
    competitionIds: asJson<string[]>(row.competition_ids, []),
    next: nextMilestone(milestones, new Date()),
    updatedAt: (row.updated_at as string | null) ?? null,
  }
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

/** "faltam N dias para X" — próximo marco futuro (RF-5.3, consumido pelo Início). */
export function nextMilestone(
  milestones: { title: string; date: string }[],
  now: Date,
): { title: string; date: string; daysLeft: number } | null {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const future = milestones
    .filter((m) => Date.parse(`${m.date}T00:00:00Z`) >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
  const next = future[0]
  if (!next) return null
  const daysLeft = Math.round((Date.parse(`${next.date}T00:00:00Z`) - today) / 86_400_000)
  return { title: next.title, date: next.date, daysLeft }
}

evolution.get('/:id/season', async (c) => {
  const { sub } = c.get('auth')
  const teamId = c.req.param('id')
  const season = await withUser(sub, async (db) => {
    if (!(await myRole(db, teamId, sub))) return 'notfound' as const
    return await loadSeason(db, teamId)
  })
  if (season === 'notfound') return problem(c, 404, 'Equipe não encontrada')
  return c.json(season)
})

evolution.put('/:id/season', async (c) => {
  const parsed = seasonBody.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return problem(c, 400, 'Body inválido', parsed.error.message)
  const { sub } = c.get('auth')
  const teamId = c.req.param('id')
  const milestones = parsed.data.milestones ?? []

  const result = await withUser(sub, async (db) => {
    if (!(await lockTeam(db, teamId))) return 'notfound' as const
    const role = await myRole(db, teamId, sub)
    if (!role) return 'notfound' as const
    if (!can(role, 'evolution.season')) return 'forbidden' as const

    // validação ANTES de qualquer escrita: retorno normal faz COMMIT (lição do DF-10)
    if (parsed.data.seasonProjectId) {
      const p = await db.query('SELECT 1 FROM projects WHERE id = $1 AND owner_team_id = $2', [
        parsed.data.seasonProjectId,
        teamId,
      ])
      if (!p.rowCount) return 'bad-project' as const
    }

    await db.query(
      `INSERT INTO team_season (team_id, label, season_project_id, milestones, competition_ids)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)
       ON CONFLICT (team_id) DO UPDATE
         SET label = EXCLUDED.label,
             season_project_id = EXCLUDED.season_project_id,
             milestones = EXCLUDED.milestones,
             competition_ids = EXCLUDED.competition_ids,
             updated_at = now()`,
      [
        teamId,
        parsed.data.label,
        parsed.data.seasonProjectId ?? null,
        JSON.stringify(milestones),
        JSON.stringify(parsed.data.competitionIds ?? []),
      ],
    )
    await recordEvidence(db, {
      teamId,
      source: 'evolution',
      kind: 'season.configured',
      payload: {
        label: parsed.data.label,
        milestones: milestones.length,
        seasonProjectId: parsed.data.seasonProjectId ?? null,
      },
      projectId: parsed.data.seasonProjectId ?? null,
      actorUserId: sub,
    })
    await syncSeasonProjectStep(db, teamId, !!parsed.data.seasonProjectId)
    await audit(db, {
      actorUserId: sub,
      action: 'evolution.season.update',
      resourceType: 'team',
      resourceId: teamId,
      ip: clientIp(c.req.raw.headers),
      metadata: { label: parsed.data.label, milestones: milestones.length },
    })
    await recomputeTeam(db, teamId, { actorUserId: sub })
    return await loadSeason(db, teamId)
  })

  if (result === 'notfound') return problem(c, 404, 'Equipe não encontrada')
  if (result === 'forbidden')
    return problem(c, 403, 'Sem permissão', 'Apenas a capitania configura a temporada.')
  if (result === 'bad-project')
    return problem(c, 400, 'Projeto inválido', 'O projeto da temporada precisa ser da equipe.')
  return c.json(result)
})

// ---------- atividade (feed) ----------

/** Kinds narráveis: resumo de estado (org/knowledge) é ruído, não notícia (DF-16 §8.2). */
const NARRATABLE = [
  'validation.summary',
  'level.changed',
  'season.configured',
  'criterion.declared',
  'template.generated',
  'decision.created',
  'guide.published',
  'trail.completed',
  'kit.opened',
  'kit.completed',
  'competition.result',
]

export async function loadActivity(
  db: DbClient,
  teamId: string,
  limit: number,
  before?: string,
): Promise<Record<string, unknown>[]> {
  const r = await db.query(
    `SELECT id, source, kind, payload, project_id, snapshot_seq, actor_user_id, created_at
     FROM evolution_evidence
     WHERE team_id = $1
       AND kind IN (SELECT jsonb_array_elements_text($2::jsonb))
       AND ($3::timestamptz IS NULL OR created_at < $3::timestamptz)
     ORDER BY created_at DESC
     LIMIT $4`,
    [teamId, JSON.stringify(NARRATABLE), before ?? null, limit],
  )
  return r.rows.map((row) => ({
    id: row.id,
    source: row.source,
    kind: row.kind,
    payload: asJson<Record<string, unknown>>(row.payload, {}),
    projectId: row.project_id ?? null,
    snapshotSeq: row.snapshot_seq ?? null,
    actorUserId: row.actor_user_id ?? null,
    createdAt: row.created_at,
  }))
}

evolution.get('/:id/activity', async (c) => {
  const { sub } = c.get('auth')
  const teamId = c.req.param('id')
  const limit = Math.min(Number(c.req.query('limit') ?? 20) || 20, 50)
  const before = c.req.query('before')
  const rows = await withUser(sub, async (db) => {
    if (!(await myRole(db, teamId, sub))) return null
    return await loadActivity(db, teamId, limit, before)
  })
  if (!rows) return problem(c, 404, 'Equipe não encontrada')
  return c.json(rows)
})

// ---------- evidência declarativa do cliente ----------

const templateBody = z.object({ projectId: z.string().uuid() })

evolution.post('/:id/evolution/events/template-generated', async (c) => {
  const parsed = templateBody.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return problem(c, 400, 'Body inválido', parsed.error.message)
  const { sub } = c.get('auth')
  const teamId = c.req.param('id')

  const result = await withUser(sub, async (db) => {
    if (!(await myRole(db, teamId, sub))) return 'notfound' as const
    const season = await loadSeason(db, teamId)
    // Gabarito de outro projeto não é evidência da temporada (§3.4).
    if (season?.seasonProjectId !== parsed.data.projectId) return 'not-season' as const
    await recordEvidence(db, {
      teamId,
      source: 'web',
      kind: 'template.generated',
      payload: { projectId: parsed.data.projectId },
      projectId: parsed.data.projectId,
      actorUserId: sub,
    })
    await recomputeTeam(db, teamId, { actorUserId: sub })
    return 'ok' as const
  })

  if (result === 'notfound') return problem(c, 404, 'Equipe não encontrada')
  if (result === 'not-season')
    return problem(
      c,
      409,
      'Projeto fora da temporada',
      'Só o projeto designado como o da temporada gera evidência.',
    )
  return c.body(null, 204)
})

// ---------- benchmark (RF-7.x) ----------

evolution.get('/:id/evolution/benchmark', async (c) => {
  const { sub } = c.get('auth')
  const teamId = c.req.param('id')
  const rows = await withUser(sub, async (db) => {
    if (!(await myRole(db, teamId, sub))) return null
    return (await db.query('SELECT * FROM evolution_benchmark(90)', [])).rows
  })
  if (!rows) return problem(c, 404, 'Equipe não encontrada')
  return c.json(toBenchmark(rows))
})

evolutionRoot.get('/benchmark', async (c) => {
  const { sub } = c.get('auth')
  const rows = await withUser(
    sub,
    async (db) => (await db.query('SELECT * FROM evolution_benchmark(90)', [])).rows,
  )
  return c.json(toBenchmark(rows))
})

/**
 * Piso de 8 equipes: abaixo disso a mediana identifica gente. A resposta diz
 * `visible: false` em vez de mentir um número — a UI simplesmente não desenha a linha.
 */
export function toBenchmark(rows: Record<string, unknown>[]) {
  const teams = Math.max(0, ...rows.map((r) => Number(r.b_teams ?? 0)))
  if (teams < COHORT_FLOOR) {
    return { visible: false, floor: COHORT_FLOOR, teams, cohort: 'geral', areas: {}, average: null }
  }
  const areas: Record<string, number> = {}
  let average: number | null = null
  for (const r of rows) {
    const median = Math.round(Number(r.b_median) * 10) / 10
    if (r.b_area === '__media') average = median
    else areas[r.b_area as string] = median
  }
  return { visible: true, floor: COHORT_FLOOR, teams, cohort: 'geral', areas, average }
}

export { CATALOG_VERSION }
