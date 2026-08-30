import { Hono } from 'hono'
import { z } from 'zod'
import { AREA_IDS } from '@bajeiros/evolution/areas'
import { withUser, type DbClient } from '../../db'
import { problem } from '../../problem'
import { audit, clientIp } from '../../audit'
import { can } from '../../policy'
import { lockTeam, myRole } from '../teams/shared'
import { recordEvidence } from '../evolution/engine'
import { publishKnowledgeSummary } from './summary'
import type { AuthEnv } from '../../auth/middleware'

// DF-14 — conhecimento da equipe: diário de decisões, guias (incluindo a trilha de
// integração) e kits de passagem. Montado em /api/v1/teams.

export const knowledge = new Hono<AuthEnv>()

// Caps anti-abuso (DF-14 §5). Erro claro, nunca silêncio (AC-DF14.10).
const MAX_DECISIONS = 2000
const MAX_GUIDES = 200
const MAX_KITS = 50
const MAX_LINKS = 8
const SEARCH_PER_GROUP = 10

/** Áreas do DF-13 + `geral` para o que não cabe em nenhuma (DF-14 RF-1.1). */
const DECISION_AREAS = [...AREA_IDS, 'geral'] as unknown as [string, ...string[]]

/** Checklist padrão do kit de passagem (RF-3.2) — editável por kit depois de aberto. */
export const KIT_TEMPLATE = [
  { id: 'responsabilidades', label: 'Responsabilidades do cargo descritas', done: false },
  { id: 'decisoes', label: 'Decisões da área revisadas e vinculadas', done: false },
  { id: 'guias', label: 'Guias da área atualizados', done: false },
  { id: 'pendencias', label: 'Pendências listadas com dono novo', done: false },
  { id: 'contatos', label: 'Contatos e fornecedores registrados', done: false },
  { id: 'sucessor', label: 'Sucessor indicado (opcional)', done: false },
]

const linkSchema = z.object({
  kind: z.enum(['project', 'snapshot', 'rule', 'guide', 'decision', 'url']),
  ref: z.string().trim().min(1).max(500),
  label: z.string().trim().max(120).optional(),
})

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

// ---------- diário de decisões (E1) ----------

const decisionBody = z.object({
  title: z.string().trim().min(1).max(120),
  area: z.enum(DECISION_AREAS),
  why: z.string().trim().min(1).max(2000),
  links: z.array(linkSchema).max(MAX_LINKS).optional(),
  supersedesId: z.string().uuid().nullable().optional(),
})

knowledge.get('/:id/decisions', async (c) => {
  const { sub } = c.get('auth')
  const teamId = c.req.param('id')
  const area = c.req.query('area')
  const author = c.req.query('author')
  const q = c.req.query('q')
  const includeSuperseded = c.req.query('includeSuperseded') === 'true'
  const limit = Math.min(Number(c.req.query('limit') ?? 25) || 25, 100)
  const offset = Math.max(Number(c.req.query('offset') ?? 0) || 0, 0)

  const rows = await withUser(sub, async (db) => {
    if (!(await myRole(db, teamId, sub))) return null
    const r = await db.query(
      `SELECT d.*, s.seq AS supersedes_seq,
              (SELECT seq FROM team_decisions n
               WHERE n.supersedes_id = d.id AND n.deleted_at IS NULL
               ORDER BY n.seq LIMIT 1) AS superseded_by_seq
       FROM team_decisions d
       LEFT JOIN team_decisions s ON s.id = d.supersedes_id
       WHERE d.team_id = $1 AND d.deleted_at IS NULL
         AND ($2::text IS NULL OR d.area = $2)
         AND ($3::uuid IS NULL OR d.author_id = $3)
         AND ($4::text IS NULL OR d.title ILIKE '%' || $4 || '%' OR d.why ILIKE '%' || $4 || '%')
         AND ($5::boolean OR NOT EXISTS (
               SELECT 1 FROM team_decisions n
               WHERE n.supersedes_id = d.id AND n.deleted_at IS NULL))
       ORDER BY d.seq DESC
       LIMIT $6 OFFSET $7`,
      [teamId, area ?? null, author ?? null, q ?? null, includeSuperseded, limit, offset],
    )
    return r.rows
  })
  if (!rows) return problem(c, 404, 'Equipe não encontrada')
  return c.json(rows.map(toDecision))
})

knowledge.post('/:id/decisions', async (c) => {
  const parsed = decisionBody.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return problem(c, 400, 'Body inválido', parsed.error.message)
  const { sub } = c.get('auth')
  const teamId = c.req.param('id')

  const result = await withUser(sub, async (db) => {
    // trava a equipe: `seq` é vocabulário interno ("a decisão nº 96") — dois
    // registros concorrentes não podem receber o mesmo número (AC-DF14.1)
    if (!(await lockTeam(db, teamId))) return 'notfound' as const
    if (!(await myRole(db, teamId, sub))) return 'notfound' as const

    const n = await db.query(
      'SELECT count(*)::int AS n FROM team_decisions WHERE team_id = $1 AND deleted_at IS NULL',
      [teamId],
    )
    if (Number(n.rows[0].n) >= MAX_DECISIONS) return 'limit' as const

    if (parsed.data.supersedesId) {
      const prev = await db.query(
        'SELECT 1 FROM team_decisions WHERE id = $1 AND team_id = $2 AND deleted_at IS NULL',
        [parsed.data.supersedesId, teamId],
      )
      if (!prev.rowCount) return 'bad-supersedes' as const
    }

    const seq = await db.query(
      'SELECT COALESCE(max(seq), 0) + 1 AS seq FROM team_decisions WHERE team_id = $1',
      [teamId],
    )
    const r = await db.query(
      `INSERT INTO team_decisions (team_id, seq, title, area, why, links, supersedes_id, author_id)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8) RETURNING *`,
      [
        teamId,
        Number(seq.rows[0].seq),
        parsed.data.title,
        parsed.data.area,
        parsed.data.why,
        JSON.stringify(parsed.data.links ?? []),
        parsed.data.supersedesId ?? null,
        sub,
      ],
    )
    await recordEvidence(db, {
      teamId,
      source: 'knowledge',
      kind: 'decision.created',
      payload: { area: parsed.data.area, seq: Number(seq.rows[0].seq), title: parsed.data.title },
      refKind: 'decision',
      refId: r.rows[0].id,
      actorUserId: sub,
    })
    await audit(db, {
      actorUserId: sub,
      action: 'knowledge.decision.create',
      resourceType: 'team',
      resourceId: teamId,
      ip: clientIp(c.req.raw.headers),
      metadata: { decisionId: r.rows[0].id, area: parsed.data.area },
    })
    await publishKnowledgeSummary(db, teamId, sub)
    return r.rows[0]
  })

  if (result === 'notfound') return problem(c, 404, 'Equipe não encontrada')
  if (result === 'limit')
    return problem(c, 409, 'Diário cheio', `Máximo de ${MAX_DECISIONS} decisões por equipe.`)
  if (result === 'bad-supersedes')
    return problem(c, 400, 'Decisão inválida', 'A decisão substituída precisa ser desta equipe.')
  return c.json(toDecision(result), 201)
})

knowledge.patch('/:id/decisions/:did', async (c) => {
  const parsed = decisionBody.partial().safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return problem(c, 400, 'Body inválido', parsed.error.message)
  const { sub } = c.get('auth')
  const teamId = c.req.param('id')
  const decisionId = c.req.param('did')

  const result = await withUser(sub, async (db) => {
    if (!(await myRole(db, teamId, sub))) return 'notfound' as const
    const cur = await db.query(
      'SELECT author_id, area FROM team_decisions WHERE id = $1 AND team_id = $2 AND deleted_at IS NULL',
      [decisionId, teamId],
    )
    if (!cur.rowCount) return 'no-decision' as const
    // decisão é fato datado: o autor corrige o texto, ninguém reescreve o alheio
    if (cur.rows[0].author_id !== sub) return 'forbidden' as const

    const r = await db.query(
      `UPDATE team_decisions SET
         title = COALESCE($3, title),
         area  = COALESCE($4, area),
         why   = COALESCE($5, why),
         links = COALESCE($6::jsonb, links),
         updated_at = now()
       WHERE id = $1 AND team_id = $2 RETURNING *`,
      [
        decisionId,
        teamId,
        parsed.data.title ?? null,
        parsed.data.area ?? null,
        parsed.data.why ?? null,
        parsed.data.links ? JSON.stringify(parsed.data.links) : null,
      ],
    )
    await audit(db, {
      actorUserId: sub,
      action: 'knowledge.decision.update',
      resourceType: 'team',
      resourceId: teamId,
      ip: clientIp(c.req.raw.headers),
      metadata: { decisionId },
    })
    return r.rows[0]
  })

  if (result === 'notfound') return problem(c, 404, 'Equipe não encontrada')
  if (result === 'no-decision') return problem(c, 404, 'Decisão não encontrada')
  if (result === 'forbidden')
    return problem(c, 403, 'Sem permissão', 'Só quem escreveu a decisão pode corrigir o texto.')
  return c.json(toDecision(result))
})

knowledge.delete('/:id/decisions/:did', async (c) => {
  const { sub } = c.get('auth')
  const teamId = c.req.param('id')
  const decisionId = c.req.param('did')

  const result = await withUser(sub, async (db) => {
    const role = await myRole(db, teamId, sub)
    if (!role) return 'notfound' as const
    if (!can(role, 'knowledge.moderate')) return 'forbidden' as const
    const r = await db.query(
      `UPDATE team_decisions SET deleted_at = now()
       WHERE id = $1 AND team_id = $2 AND deleted_at IS NULL RETURNING id`,
      [decisionId, teamId],
    )
    if (!r.rowCount) return 'no-decision' as const
    await audit(db, {
      actorUserId: sub,
      action: 'knowledge.decision.delete',
      resourceType: 'team',
      resourceId: teamId,
      ip: clientIp(c.req.raw.headers),
      metadata: { decisionId },
    })
    await publishKnowledgeSummary(db, teamId, sub)
    return 'ok' as const
  })

  if (result === 'notfound') return problem(c, 404, 'Equipe não encontrada')
  if (result === 'no-decision') return problem(c, 404, 'Decisão não encontrada')
  if (result === 'forbidden')
    return problem(c, 403, 'Sem permissão', 'Apenas a capitania exclui do diário.')
  return c.body(null, 204)
})

function toDecision(row: Record<string, unknown>) {
  return {
    id: row.id,
    seq: Number(row.seq),
    title: row.title,
    area: row.area,
    why: row.why,
    links: asJson<unknown[]>(row.links, []),
    supersedesId: row.supersedes_id ?? null,
    supersedesSeq: row.supersedes_seq != null ? Number(row.supersedes_seq) : null,
    supersededBySeq: row.superseded_by_seq != null ? Number(row.superseded_by_seq) : null,
    authorId: row.author_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? null,
  }
}

// ---------- guias (E2) ----------

/** Guia sem atualização há mais de 6 meses aparece como VERIFICAR (RF-2.2). */
export const GUIDE_STALE_DAYS = 182

const guideBody = z.object({
  title: z.string().trim().min(1).max(120),
  kind: z.enum(['guia', 'trilha', 'checklist']).optional(),
  bodyMd: z.string().max(20000),
  tags: z.array(z.string().trim().min(1).max(40)).max(12).optional(),
  ownerId: z.string().uuid().nullable().optional(),
})

knowledge.get('/:id/guides', async (c) => {
  const { sub } = c.get('auth')
  const teamId = c.req.param('id')
  const rows = await withUser(sub, async (db) => {
    if (!(await myRole(db, teamId, sub))) return null
    const r = await db.query(
      `SELECT g.*,
              (g.updated_at < now() - make_interval(days => $2)) AS stale,
              EXISTS (SELECT 1 FROM guide_completions gc
                      WHERE gc.guide_id = g.id AND gc.user_id = $3) AS completed_by_me,
              (SELECT count(*)::int FROM guide_completions gc WHERE gc.guide_id = g.id)
                AS completions
       FROM team_guides g
       WHERE g.team_id = $1 AND g.deleted_at IS NULL
       ORDER BY g.updated_at DESC LIMIT 200`,
      [teamId, GUIDE_STALE_DAYS, sub],
    )
    return r.rows
  })
  if (!rows) return problem(c, 404, 'Equipe não encontrada')
  return c.json(rows.map(toGuide))
})

knowledge.post('/:id/guides', async (c) => {
  const parsed = guideBody.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return problem(c, 400, 'Body inválido', parsed.error.message)
  const { sub } = c.get('auth')
  const teamId = c.req.param('id')
  const kind = parsed.data.kind ?? 'guia'

  const result = await withUser(sub, async (db) => {
    if (!(await lockTeam(db, teamId))) return 'notfound' as const
    if (!(await myRole(db, teamId, sub))) return 'notfound' as const
    const n = await db.query(
      'SELECT count(*)::int AS n FROM team_guides WHERE team_id = $1 AND deleted_at IS NULL',
      [teamId],
    )
    if (Number(n.rows[0].n) >= MAX_GUIDES) return 'limit' as const
    if (kind === 'trilha') {
      const t = await db.query(
        `SELECT 1 FROM team_guides
         WHERE team_id = $1 AND kind = 'trilha' AND deleted_at IS NULL`,
        [teamId],
      )
      if (t.rowCount) return 'trail-exists' as const
    }
    // dono é obrigatório e nasce em quem criou: guia sem dono é guia órfão (CON-4.2)
    const r = await db.query(
      `INSERT INTO team_guides (team_id, kind, title, body_md, tags, owner_id, author_id)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7) RETURNING *`,
      [
        teamId,
        kind,
        parsed.data.title,
        parsed.data.bodyMd,
        JSON.stringify(parsed.data.tags ?? []),
        parsed.data.ownerId ?? sub,
        sub,
      ],
    )
    await recordEvidence(db, {
      teamId,
      source: 'knowledge',
      kind: 'guide.published',
      payload: { kind, title: parsed.data.title, tags: parsed.data.tags ?? [] },
      refKind: 'guide',
      refId: r.rows[0].id,
      actorUserId: sub,
    })
    await audit(db, {
      actorUserId: sub,
      action: 'knowledge.guide.create',
      resourceType: 'team',
      resourceId: teamId,
      ip: clientIp(c.req.raw.headers),
      metadata: { guideId: r.rows[0].id, kind },
    })
    await publishKnowledgeSummary(db, teamId, sub)
    return r.rows[0]
  })

  if (result === 'notfound') return problem(c, 404, 'Equipe não encontrada')
  if (result === 'limit')
    return problem(c, 409, 'Limite de guias', `Máximo de ${MAX_GUIDES} guias por equipe.`)
  if (result === 'trail-exists')
    return problem(
      c,
      409,
      'Trilha já existe',
      'A equipe já tem uma trilha de integração ativa. Edite a que existe.',
    )
  return c.json(toGuide(result), 201)
})

knowledge.patch('/:id/guides/:gid', async (c) => {
  const parsed = guideBody.partial().safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return problem(c, 400, 'Body inválido', parsed.error.message)
  const { sub } = c.get('auth')
  const teamId = c.req.param('id')
  const guideId = c.req.param('gid')
  const wantsOwner = parsed.data.ownerId !== undefined

  const result = await withUser(sub, async (db) => {
    const role = await myRole(db, teamId, sub)
    if (!role) return 'notfound' as const
    // corpo é de qualquer membro (documento vivo); reatribuir dono é da capitania
    if (wantsOwner && !can(role, 'knowledge.moderate')) return 'forbidden' as const
    const cur = await db.query(
      'SELECT kind FROM team_guides WHERE id = $1 AND team_id = $2 AND deleted_at IS NULL',
      [guideId, teamId],
    )
    if (!cur.rowCount) return 'no-guide' as const
    if (parsed.data.kind && parsed.data.kind !== cur.rows[0].kind) return 'kind-locked' as const
    if (parsed.data.ownerId) {
      const m = await db.query('SELECT 1 FROM team_members WHERE team_id = $1 AND user_id = $2', [
        teamId,
        parsed.data.ownerId,
      ])
      if (!m.rowCount) return 'bad-owner' as const
    }

    const r = await db.query(
      `UPDATE team_guides SET
         title    = COALESCE($3, title),
         body_md  = COALESCE($4, body_md),
         tags     = COALESCE($5::jsonb, tags),
         owner_id = CASE WHEN $6::boolean THEN $7 ELSE owner_id END
       WHERE id = $1 AND team_id = $2 RETURNING *`,
      [
        guideId,
        teamId,
        parsed.data.title ?? null,
        parsed.data.bodyMd ?? null,
        parsed.data.tags ? JSON.stringify(parsed.data.tags) : null,
        wantsOwner,
        parsed.data.ownerId ?? null,
      ],
    )
    await audit(db, {
      actorUserId: sub,
      action: 'knowledge.guide.update',
      resourceType: 'team',
      resourceId: teamId,
      ip: clientIp(c.req.raw.headers),
      metadata: { guideId },
    })
    await publishKnowledgeSummary(db, teamId, sub)
    return r.rows[0]
  })

  if (result === 'notfound') return problem(c, 404, 'Equipe não encontrada')
  if (result === 'no-guide') return problem(c, 404, 'Guia não encontrado')
  if (result === 'forbidden')
    return problem(c, 403, 'Sem permissão', 'Apenas a capitania reatribui o dono de um guia.')
  if (result === 'bad-owner')
    return problem(c, 400, 'Dono inválido', 'O dono do guia precisa ser da equipe.')
  if (result === 'kind-locked')
    return problem(
      c,
      409,
      'Tipo do guia é fixo',
      'Para virar trilha ou checklist, crie um documento novo.',
    )
  return c.json(toGuide(result))
})

knowledge.delete('/:id/guides/:gid', async (c) => {
  const { sub } = c.get('auth')
  const teamId = c.req.param('id')
  const guideId = c.req.param('gid')

  const result = await withUser(sub, async (db) => {
    const role = await myRole(db, teamId, sub)
    if (!role) return 'notfound' as const
    if (!can(role, 'knowledge.moderate')) return 'forbidden' as const
    // kit aberto que aponta para o guia perderia a referência no meio da passagem
    const used = await db.query(
      `SELECT 1 FROM team_handover_kits k, jsonb_array_elements(k.checklist) AS item
       WHERE k.team_id = $1 AND k.status <> 'concluido' AND item->>'guideId' = $2`,
      [teamId, guideId],
    )
    if (used.rowCount) return 'in-use' as const
    const r = await db.query(
      `UPDATE team_guides SET deleted_at = now()
       WHERE id = $1 AND team_id = $2 AND deleted_at IS NULL RETURNING id`,
      [guideId, teamId],
    )
    if (!r.rowCount) return 'no-guide' as const
    await audit(db, {
      actorUserId: sub,
      action: 'knowledge.guide.delete',
      resourceType: 'team',
      resourceId: teamId,
      ip: clientIp(c.req.raw.headers),
      metadata: { guideId },
    })
    await publishKnowledgeSummary(db, teamId, sub)
    return 'ok' as const
  })

  if (result === 'notfound') return problem(c, 404, 'Equipe não encontrada')
  if (result === 'no-guide') return problem(c, 404, 'Guia não encontrado')
  if (result === 'forbidden')
    return problem(c, 403, 'Sem permissão', 'Apenas a capitania exclui guias.')
  if (result === 'in-use')
    return problem(
      c,
      409,
      'Guia em uso',
      'Um kit de passagem aberto aponta para este guia. Conclua ou edite o kit antes.',
    )
  return c.body(null, 204)
})

/** "Revisei, está válido": limpa o envelhecimento sem tocar no corpo (RF-2.2). */
knowledge.post('/:id/guides/:gid/still-valid', async (c) => {
  const { sub } = c.get('auth')
  const teamId = c.req.param('id')
  const guideId = c.req.param('gid')

  const result = await withUser(sub, async (db) => {
    const role = await myRole(db, teamId, sub)
    if (!role) return 'notfound' as const
    const cur = await db.query(
      'SELECT owner_id FROM team_guides WHERE id = $1 AND team_id = $2 AND deleted_at IS NULL',
      [guideId, teamId],
    )
    if (!cur.rowCount) return 'no-guide' as const
    if (cur.rows[0].owner_id !== sub && !can(role, 'knowledge.moderate'))
      return 'forbidden' as const
    const r = await db.query(
      'UPDATE team_guides SET updated_at = now() WHERE id = $1 AND team_id = $2 RETURNING *',
      [guideId, teamId],
    )
    await publishKnowledgeSummary(db, teamId, sub)
    return r.rows[0]
  })

  if (result === 'notfound') return problem(c, 404, 'Equipe não encontrada')
  if (result === 'no-guide') return problem(c, 404, 'Guia não encontrado')
  if (result === 'forbidden')
    return problem(c, 403, 'Sem permissão', 'Só o dono do guia ou a capitania confirma a revisão.')
  return c.json(toGuide(result))
})

/** Conclusão da trilha é do PRÓPRIO — ninguém marca a integração de outra pessoa. */
knowledge.post('/:id/guides/:gid/complete', async (c) => {
  const { sub } = c.get('auth')
  const teamId = c.req.param('id')
  const guideId = c.req.param('gid')

  const result = await withUser(sub, async (db) => {
    if (!(await myRole(db, teamId, sub))) return 'notfound' as const
    const g = await db.query(
      'SELECT kind FROM team_guides WHERE id = $1 AND team_id = $2 AND deleted_at IS NULL',
      [guideId, teamId],
    )
    if (!g.rowCount) return 'no-guide' as const
    const r = await db.query(
      `INSERT INTO guide_completions (guide_id, user_id) VALUES ($1, $2)
       ON CONFLICT (guide_id, user_id) DO NOTHING RETURNING guide_id`,
      [guideId, sub],
    )
    if (!r.rowCount) return 'already' as const
    if (g.rows[0].kind === 'trilha') {
      await recordEvidence(db, {
        teamId,
        source: 'knowledge',
        kind: 'trail.completed',
        payload: { userId: sub },
        refKind: 'guide',
        refId: guideId,
        actorUserId: sub,
      })
    }
    await publishKnowledgeSummary(db, teamId, sub)
    return 'ok' as const
  })

  if (result === 'notfound') return problem(c, 404, 'Equipe não encontrada')
  if (result === 'no-guide') return problem(c, 404, 'Guia não encontrado')
  if (result === 'already') return c.body(null, 204)
  return c.body(null, 204)
})

function toGuide(row: Record<string, unknown>) {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    bodyMd: row.body_md,
    tags: asJson<string[]>(row.tags, []),
    ownerId: row.owner_id ?? null,
    authorId: row.author_id ?? null,
    stale: row.stale === true,
    completedByMe: row.completed_by_me === true,
    completions: row.completions != null ? Number(row.completions) : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// ---------- kits de passagem (E3) ----------

const checklistItem = z.object({
  id: z.string().trim().min(1).max(60),
  label: z.string().trim().min(1).max(200),
  done: z.boolean(),
  note: z.string().trim().max(500).optional(),
  guideId: z.string().uuid().optional(),
})

const kitBody = z.object({
  memberId: z.string().uuid().nullable().optional(),
  memberName: z.string().trim().min(1).max(120),
  positionLabel: z.string().trim().max(120).nullable().optional(),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'data no formato AAAA-MM-DD')
    .nullable()
    .optional(),
})

const kitPatchBody = z.object({
  checklist: z.array(checklistItem).max(30).optional(),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  positionLabel: z.string().trim().max(120).nullable().optional(),
  status: z.enum(['aberto', 'em_andamento', 'concluido']).optional(),
})

/** Kits vencidos ou com saída nos próximos 120 dias ganham chip VERIFICAR (RF-3.4). */
export const KIT_WARNING_DAYS = 120

export function needsAttention(status: string, dueDate: string | Date | null): boolean {
  if (status === 'concluido' || !dueDate) return false
  const due = dueDate instanceof Date ? dueDate.getTime() : Date.parse(String(dueDate))
  return Number.isFinite(due) && due <= Date.now() + KIT_WARNING_DAYS * 86_400_000
}

knowledge.get('/:id/kits', async (c) => {
  const { sub } = c.get('auth')
  const teamId = c.req.param('id')
  const rows = await withUser(sub, async (db) => {
    if (!(await myRole(db, teamId, sub))) return null
    const r = await db.query(
      `SELECT * FROM team_handover_kits
       WHERE team_id = $1
       ORDER BY (status = 'concluido'), due_date NULLS LAST, created_at
       LIMIT 200`,
      [teamId],
    )
    return r.rows
  })
  if (!rows) return problem(c, 404, 'Equipe não encontrada')
  return c.json(rows.map(toKit))
})

knowledge.post('/:id/kits', async (c) => {
  const parsed = kitBody.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return problem(c, 400, 'Body inválido', parsed.error.message)
  const { sub } = c.get('auth')
  const teamId = c.req.param('id')

  const result = await withUser(sub, async (db) => {
    const role = await myRole(db, teamId, sub)
    if (!role) return 'notfound' as const
    // abre a capitania OU a própria pessoa que sai (RF-3.1)
    const proprio = parsed.data.memberId === sub
    if (!proprio && !can(role, 'knowledge.moderate')) return 'forbidden' as const
    const n = await db.query(
      'SELECT count(*)::int AS n FROM team_handover_kits WHERE team_id = $1',
      [teamId],
    )
    if (Number(n.rows[0].n) >= MAX_KITS) return 'limit' as const

    const r = await db.query(
      `INSERT INTO team_handover_kits
         (team_id, member_id, member_name, position_label, due_date, checklist, created_by)
       VALUES ($1, $2, $3, $4, $5::date, $6::jsonb, $7) RETURNING *`,
      [
        teamId,
        parsed.data.memberId ?? null,
        parsed.data.memberName,
        parsed.data.positionLabel ?? null,
        parsed.data.dueDate ?? null,
        JSON.stringify(KIT_TEMPLATE),
        sub,
      ],
    )
    await recordEvidence(db, {
      teamId,
      source: 'knowledge',
      kind: 'kit.opened',
      payload: {
        kitId: r.rows[0].id,
        dueDate: parsed.data.dueDate ?? null,
        memberName: parsed.data.memberName,
      },
      refKind: 'kit',
      refId: r.rows[0].id,
      actorUserId: sub,
    })
    await audit(db, {
      actorUserId: sub,
      action: 'knowledge.kit.create',
      resourceType: 'team',
      resourceId: teamId,
      ip: clientIp(c.req.raw.headers),
      metadata: { kitId: r.rows[0].id },
    })
    await publishKnowledgeSummary(db, teamId, sub)
    return r.rows[0]
  })

  if (result === 'notfound') return problem(c, 404, 'Equipe não encontrada')
  if (result === 'limit')
    return problem(c, 409, 'Limite de kits', `Máximo de ${MAX_KITS} kits por equipe.`)
  if (result === 'forbidden')
    return problem(c, 403, 'Sem permissão', 'O kit é aberto pela capitania ou por quem sai.')
  return c.json(toKit(result), 201)
})

knowledge.patch('/:id/kits/:kid', async (c) => {
  const parsed = kitPatchBody.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return problem(c, 400, 'Body inválido', parsed.error.message)
  const { sub } = c.get('auth')
  const teamId = c.req.param('id')
  const kitId = c.req.param('kid')

  const result = await withUser(sub, async (db) => {
    const role = await myRole(db, teamId, sub)
    if (!role) return 'notfound' as const
    const cur = await db.query(
      'SELECT member_id, checklist, status FROM team_handover_kits WHERE id = $1 AND team_id = $2',
      [kitId, teamId],
    )
    if (!cur.rowCount) return 'no-kit' as const
    if (cur.rows[0].member_id !== sub && !can(role, 'knowledge.moderate'))
      return 'forbidden' as const

    const checklist =
      parsed.data.checklist ?? asJson<{ done: boolean }[]>(cur.rows[0].checklist, [])
    // concluir exige checklist inteiro marcado — kit pela metade não é passagem
    if (parsed.data.status === 'concluido' && !checklist.every((i) => i.done))
      return 'incomplete' as const

    const status =
      parsed.data.status ??
      (checklist.some((i) => i.done) && cur.rows[0].status === 'aberto'
        ? 'em_andamento'
        : cur.rows[0].status)

    const r = await db.query(
      `UPDATE team_handover_kits SET
         checklist      = COALESCE($3::jsonb, checklist),
         due_date       = CASE WHEN $4::boolean THEN $5::date ELSE due_date END,
         position_label = CASE WHEN $6::boolean THEN $7 ELSE position_label END,
         status         = $8,
         completed_at   = CASE WHEN $8 = 'concluido' THEN now() ELSE NULL END
       WHERE id = $1 AND team_id = $2 RETURNING *`,
      [
        kitId,
        teamId,
        parsed.data.checklist ? JSON.stringify(parsed.data.checklist) : null,
        parsed.data.dueDate !== undefined,
        parsed.data.dueDate ?? null,
        parsed.data.positionLabel !== undefined,
        parsed.data.positionLabel ?? null,
        status,
      ],
    )
    if (status === 'concluido' && cur.rows[0].status !== 'concluido') {
      await recordEvidence(db, {
        teamId,
        source: 'knowledge',
        kind: 'kit.completed',
        payload: { kitId },
        refKind: 'kit',
        refId: kitId,
        actorUserId: sub,
      })
    }
    await audit(db, {
      actorUserId: sub,
      action: 'knowledge.kit.update',
      resourceType: 'team',
      resourceId: teamId,
      ip: clientIp(c.req.raw.headers),
      metadata: { kitId, status },
    })
    await publishKnowledgeSummary(db, teamId, sub)
    return r.rows[0]
  })

  if (result === 'notfound') return problem(c, 404, 'Equipe não encontrada')
  if (result === 'no-kit') return problem(c, 404, 'Kit não encontrado')
  if (result === 'forbidden')
    return problem(c, 403, 'Sem permissão', 'O kit é editado pela capitania ou por quem sai.')
  if (result === 'incomplete')
    return problem(
      c,
      409,
      'Checklist incompleto',
      'Todos os itens precisam estar marcados para concluir a passagem.',
    )
  return c.json(toKit(result))
})

function toKit(row: Record<string, unknown>) {
  const checklist = asJson<{ done: boolean }[]>(row.checklist, [])
  const done = checklist.filter((i) => i.done).length
  return {
    // `attention` sai daqui e não do SQL: a rota de criação devolve RETURNING *,
    // que não teria a coluna calculada — e um kit "sem aviso" logo após abrir com
    // data vencida seria mentira de interface
    attention: needsAttention(row.status as string, row.due_date as string | null),
    id: row.id,
    memberId: row.member_id ?? null,
    memberName: row.member_name,
    positionLabel: row.position_label ?? null,
    dueDate: row.due_date ?? null,
    checklist,
    // percentual honesto: itens marcados sobre itens do kit (RF-3.3)
    progress: checklist.length ? Math.round((done / checklist.length) * 100) : 0,
    status: row.status,
    createdAt: row.created_at,
    completedAt: row.completed_at ?? null,
  }
}

// ---------- busca (E4) ----------

/**
 * ILIKE, sem FTS na v1 (DF-14 §8.5): não acha "amortecedor" por "Fox", e isso está
 * declarado. As regras B6 entram pelo índice do checklist, que já é client-side.
 */
export async function searchKnowledge(db: DbClient, teamId: string, q: string) {
  const decisions = await db.query(
    `SELECT id, seq, title, area, created_at FROM team_decisions
     WHERE team_id = $1 AND deleted_at IS NULL
       AND (title ILIKE '%' || $2 || '%' OR why ILIKE '%' || $2 || '%')
     ORDER BY seq DESC LIMIT $3`,
    [teamId, q, SEARCH_PER_GROUP],
  )
  const guides = await db.query(
    `SELECT id, kind, title, updated_at FROM team_guides
     WHERE team_id = $1 AND deleted_at IS NULL
       AND (title ILIKE '%' || $2 || '%' OR body_md ILIKE '%' || $2 || '%')
     ORDER BY updated_at DESC LIMIT $3`,
    [teamId, q, SEARCH_PER_GROUP],
  )
  return {
    decisions: decisions.rows.map((r) => ({
      id: r.id,
      seq: Number(r.seq),
      title: r.title,
      area: r.area,
    })),
    guides: guides.rows.map((r) => ({ id: r.id, kind: r.kind, title: r.title })),
  }
}

knowledge.get('/:id/knowledge/search', async (c) => {
  const { sub } = c.get('auth')
  const teamId = c.req.param('id')
  const q = (c.req.query('q') ?? '').trim()
  if (q.length < 2) return problem(c, 400, 'Busca curta', 'Digite ao menos 2 caracteres.')
  const result = await withUser(sub, async (db) => {
    if (!(await myRole(db, teamId, sub))) return null
    return await searchKnowledge(db, teamId, q)
  })
  if (!result) return problem(c, 404, 'Equipe não encontrada')
  return c.json(result)
})

// ---------- contadores da tela (RF-5.2) ----------

knowledge.get('/:id/knowledge', async (c) => {
  const { sub } = c.get('auth')
  const teamId = c.req.param('id')
  const result = await withUser(sub, async (db) => {
    if (!(await myRole(db, teamId, sub))) return null
    const k = await db.query(
      `SELECT
         (SELECT count(*)::int FROM team_decisions
          WHERE team_id = $1 AND deleted_at IS NULL) AS decisions,
         (SELECT count(*)::int FROM team_guides
          WHERE team_id = $1 AND deleted_at IS NULL) AS guides,
         (SELECT count(*)::int FROM team_handover_kits
          WHERE team_id = $1 AND status <> 'concluido') AS kits_open,
         (SELECT count(*)::int FROM team_handover_kits
          WHERE team_id = $1 AND status = 'concluido') AS kits_done`,
      [teamId],
    )
    return {
      decisions: Number(k.rows[0].decisions),
      guides: Number(k.rows[0].guides),
      kitsOpen: Number(k.rows[0].kits_open),
      kitsDone: Number(k.rows[0].kits_done),
    }
  })
  if (!result) return problem(c, 404, 'Equipe não encontrada')
  return c.json(result)
})
