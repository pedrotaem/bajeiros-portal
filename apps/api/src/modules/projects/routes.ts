import { Hono } from 'hono'
import { z } from 'zod'
import { evaluate } from '@bajeiros/core/rules/b6'
import type { Cage } from '@bajeiros/core/model/types'
import { withUser } from '../../db'
import { problem } from '../../problem'
import { audit, clientIp } from '../../audit'
import type { AuthEnv } from '../../auth/middleware'

export const projects = new Hono<AuthEnv>()

// Entitlement do plano free (hardcoded até a fase 15 — checagem SEMPRE no backend)
const FREE_MAX_PROJECTS = 2
const FREE_MAX_SNAPSHOTS = 10

projects.get('/', async (c) => {
  const { sub } = c.get('auth')
  const rows = await withUser(
    sub,
    async (db) =>
      (
        await db.query(
          `SELECT p.*, (SELECT max(seq) FROM cage_snapshots s WHERE s.project_id = p.id) AS last_seq
           FROM projects p ORDER BY p.updated_at DESC`,
          [],
        )
      ).rows,
  )
  return c.json(rows.map(toProject))
})

const createBody = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
})

projects.post('/', async (c) => {
  const parsed = createBody.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return problem(c, 400, 'Body inválido', parsed.error.message)
  const { sub } = c.get('auth')
  const result = await withUser(sub, async (db) => {
    const count = await db.query(
      'SELECT count(*)::int AS n FROM projects WHERE owner_user_id = $1',
      [sub],
    )
    if (count.rows[0].n >= FREE_MAX_PROJECTS) return 'limit' as const
    const r = await db.query(
      `INSERT INTO projects (owner_user_id, name, description)
       VALUES ($1, $2, $3) RETURNING *`,
      [sub, parsed.data.name, parsed.data.description ?? null],
    )
    await audit(db, {
      actorUserId: sub,
      action: 'project.create',
      resourceType: 'project',
      resourceId: r.rows[0].id,
      ip: clientIp(c.req.raw.headers),
    })
    return r.rows[0]
  })
  if (result === 'limit') {
    return problem(
      c,
      403,
      'Limite do plano atingido',
      `Plano free: ${FREE_MAX_PROJECTS} projetos.`,
      {
        entitlement: 'max_projects',
      },
    )
  }
  return c.json(toProject(result), 201)
})

projects.get('/:id', async (c) => {
  const { sub } = c.get('auth')
  const row = await withUser(
    sub,
    async (db) =>
      (await db.query('SELECT * FROM projects WHERE id = $1', [c.req.param('id')])).rows[0],
  )
  if (!row) return problem(c, 404, 'Projeto não encontrado')
  return c.json(toProject(row))
})

projects.patch('/:id', async (c) => {
  const parsed = createBody.partial().safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return problem(c, 400, 'Body inválido', parsed.error.message)
  const { sub } = c.get('auth')
  const row = await withUser(
    sub,
    async (db) =>
      (
        await db.query(
          `UPDATE projects SET
             name = COALESCE($2, name),
             description = COALESCE($3, description)
           WHERE id = $1 RETURNING *`,
          [c.req.param('id'), parsed.data.name ?? null, parsed.data.description ?? null],
        )
      ).rows[0],
  )
  if (!row) return problem(c, 404, 'Projeto não encontrado')
  return c.json(toProject(row))
})

projects.delete('/:id', async (c) => {
  const { sub } = c.get('auth')
  const deleted = await withUser(sub, async (db) => {
    const r = await db.query('DELETE FROM projects WHERE id = $1 RETURNING id', [c.req.param('id')])
    if (r.rowCount) {
      await audit(db, {
        actorUserId: sub,
        action: 'project.delete',
        resourceType: 'project',
        resourceId: c.req.param('id'),
        ip: clientIp(c.req.raw.headers),
      })
    }
    return r.rowCount
  })
  if (!deleted) return problem(c, 404, 'Projeto não encontrado')
  return c.body(null, 204)
})

// Transferir projeto pessoal p/ uma equipe (fase 14) — todos os membros passam a acessar.
const transferBody = z.object({ teamId: z.string().uuid() })

projects.post('/:id/transfer', async (c) => {
  const parsed = transferBody.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return problem(c, 400, 'Body inválido', parsed.error.message)
  const { sub } = c.get('auth')
  const projectId = c.req.param('id')
  const result = await withUser(sub, async (db) => {
    const proj = await db.query('SELECT owner_user_id FROM projects WHERE id = $1', [projectId])
    if (!proj.rowCount) return 'notfound' as const
    if (proj.rows[0].owner_user_id !== sub) return 'not-owner' as const
    // requisitante precisa ser membro da equipe destino (RLS esconde equipes alheias → 404 uniforme)
    const member = await db.query(
      'SELECT 1 FROM team_members WHERE team_id = $1 AND user_id = $2',
      [parsed.data.teamId, sub],
    )
    if (!member.rowCount) return 'no-team' as const
    const r = await db.query(
      `UPDATE projects SET owner_user_id = NULL, owner_team_id = $2 WHERE id = $1 RETURNING *`,
      [projectId, parsed.data.teamId],
    )
    await audit(db, {
      actorUserId: sub,
      action: 'project.transfer',
      resourceType: 'project',
      resourceId: projectId,
      ip: clientIp(c.req.raw.headers),
      metadata: { teamId: parsed.data.teamId },
    })
    return r.rows[0]
  })
  if (result === 'notfound') return problem(c, 404, 'Projeto não encontrado')
  if (result === 'no-team') return problem(c, 404, 'Equipe não encontrada')
  if (result === 'not-owner')
    return problem(c, 403, 'Sem permissão', 'Só quem é dono do projeto pode transferi-lo.')
  return c.json(toProject(result))
})

const snapshotBody = z.object({
  cage: z.record(z.string(), z.unknown()),
  // lock otimista: cliente manda o último seq que conhece; conflito → 409
  expectedSeq: z.number().int().min(0),
})

projects.post('/:id/snapshots', async (c) => {
  const parsed = snapshotBody.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return problem(c, 400, 'Body inválido', parsed.error.message)
  const { sub } = c.get('auth')
  const projectId = c.req.param('id')

  // validação server-side com o MESMO motor B6 do browser (@bajeiros/core)
  let rulesResult
  try {
    rulesResult = evaluate(parsed.data.cage as unknown as Cage)
  } catch {
    return problem(c, 422, 'Gaiola inválida', 'O JSON não é um Cage válido para o motor B6.')
  }

  const result = await withUser(sub, async (db) => {
    const proj = await db.query('SELECT id FROM projects WHERE id = $1', [projectId])
    if (!proj.rowCount) return 'notfound' as const
    const last = await db.query(
      'SELECT COALESCE(max(seq), 0)::int AS seq, count(*)::int AS n FROM cage_snapshots WHERE project_id = $1',
      [projectId],
    )
    if (last.rows[0].seq !== parsed.data.expectedSeq)
      return { conflict: last.rows[0].seq as number }
    if (last.rows[0].n >= FREE_MAX_SNAPSHOTS) return 'limit' as const
    const r = await db.query(
      `INSERT INTO cage_snapshots (project_id, seq, cage_json, rules_result, saved_by_user_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, project_id, seq, created_at, saved_by_user_id`,
      [projectId, parsed.data.expectedSeq + 1, parsed.data.cage, JSON.stringify(rulesResult), sub],
    )
    return r.rows[0]
  })

  if (result === 'notfound') return problem(c, 404, 'Projeto não encontrado')
  if (result === 'limit') {
    return problem(
      c,
      403,
      'Limite do plano atingido',
      `Plano free: ${FREE_MAX_SNAPSHOTS} versões.`,
      {
        entitlement: 'max_snapshots',
      },
    )
  }
  if (typeof result === 'object' && 'conflict' in result) {
    return problem(c, 409, 'Conflito de versão', `Versão atual é ${result.conflict}; recarregue.`, {
      currentSeq: result.conflict,
    })
  }
  const failCount = rulesResult.filter((r) => r.status === 'fail').length
  return c.json({ ...result, rulesFailCount: failCount }, 201)
})

projects.get('/:id/snapshots', async (c) => {
  const { sub } = c.get('auth')
  const rows = await withUser(
    sub,
    async (db) =>
      (
        await db.query(
          `SELECT id, seq, saved_by_user_id, created_at FROM cage_snapshots
           WHERE project_id = $1 ORDER BY seq DESC`,
          [c.req.param('id')],
        )
      ).rows,
  )
  return c.json(rows)
})

projects.get('/:id/snapshots/:seq', async (c) => {
  const { sub } = c.get('auth')
  const row = await withUser(
    sub,
    async (db) =>
      (
        await db.query('SELECT * FROM cage_snapshots WHERE project_id = $1 AND seq = $2', [
          c.req.param('id'),
          Number(c.req.param('seq')),
        ])
      ).rows[0],
  )
  if (!row) return problem(c, 404, 'Versão não encontrada')
  return c.json(row)
})

function toProject(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    ownerUserId: row.owner_user_id,
    ownerTeamId: row.owner_team_id,
    lastSeq: row.last_seq ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
