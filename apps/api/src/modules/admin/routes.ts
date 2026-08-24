import { Hono } from 'hono'
import { createMiddleware } from 'hono/factory'
import { z } from 'zod'
import { withUser } from '../../db'
import { problem } from '../../problem'
import { audit, clientIp } from '../../audit'
import type { AuthEnv } from '../../auth/middleware'

// DF-9 — área administrativa. Autorização: users.is_admin (promoção só manual no
// banco; nenhuma rota concede). RLS: policies *_admin_read (0003) fazem o SELECT
// amplo funcionar sob o mesmo withUser do usuário admin — sem role especial.
// Todo acesso é auditado (admin.view) — admin lendo dado pessoal deixa trilha.

export const admin = new Hono<AuthEnv>()

const requireAdmin = createMiddleware<AuthEnv>(async (c, next) => {
  const { sub } = c.get('auth')
  const row = await withUser(
    sub,
    async (db) =>
      (await db.query('SELECT is_admin FROM users WHERE id = $1 AND deleted_at IS NULL', [sub]))
        .rows[0],
  )
  if (!row?.is_admin) return problem(c, 403, 'Acesso restrito', 'Requer perfil de administrador.')
  await next()
})

admin.use('*', requireAdmin)

const pageQuery = z.object({
  q: z.string().max(200).optional().default(''),
  userId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
})

function parseQuery(c: { req: { query: () => Record<string, string> } }) {
  return pageQuery.safeParse(c.req.query())
}

async function auditView(
  db: Parameters<Parameters<typeof withUser>[1]>[0],
  sub: string,
  what: string,
  ip: string | undefined,
  filters: Record<string, unknown>,
) {
  await audit(db, {
    actorUserId: sub,
    action: 'admin.view',
    resourceType: 'admin',
    resourceId: what,
    ip,
    metadata: filters,
  })
}

// ---------- visão geral ----------

admin.get('/overview', async (c) => {
  const { sub } = c.get('auth')
  const ip = clientIp(c.req.raw.headers)
  const data = await withUser(sub, async (db) => {
    const [r] = (
      await db.query(`
        SELECT
          (SELECT count(*) FROM users WHERE deleted_at IS NULL)                          AS users_active,
          (SELECT count(*) FROM users WHERE deleted_at IS NOT NULL)                      AS users_deleted,
          (SELECT count(*) FROM teams)                                                   AS teams,
          (SELECT count(*) FROM projects)                                                AS projects,
          (SELECT count(*) FROM access_log    WHERE occurred_at > now() - interval '24 hours') AS accesses_24h,
          (SELECT count(*) FROM assistant_log WHERE occurred_at > now() - interval '24 hours') AS assistant_24h,
          (SELECT COALESCE(sum(input_tokens + output_tokens), 0) FROM assistant_log
             WHERE occurred_at > now() - interval '30 days')                             AS assistant_tokens_30d
      `)
    ).rows
    await auditView(db, sub, 'overview', ip, {})
    return r
  })
  return c.json({
    usersActive: Number(data.users_active),
    usersDeleted: Number(data.users_deleted),
    teams: Number(data.teams),
    projects: Number(data.projects),
    accesses24h: Number(data.accesses_24h),
    assistant24h: Number(data.assistant_24h),
    assistantTokens30d: Number(data.assistant_tokens_30d),
  })
})

// ---------- usuários ----------

admin.get('/users', async (c) => {
  const parsed = parseQuery(c)
  if (!parsed.success) return problem(c, 400, 'Query inválida', parsed.error.message)
  const { q, limit, offset } = parsed.data
  const { sub } = c.get('auth')
  const ip = clientIp(c.req.raw.headers)
  const rows = await withUser(sub, async (db) => {
    const r = await db.query(
      `SELECT u.id, u.email, u.display_name, u.university, u.created_at, u.deleted_at,
              u.is_admin, u.last_login_at,
              (SELECT count(*) FROM projects p WHERE p.owner_user_id = u.id) AS project_count,
              COALESCE(
                json_agg(json_build_object('teamId', t.id, 'name', t.name, 'role', m.role))
                  FILTER (WHERE t.id IS NOT NULL),
                '[]'
              ) AS teams
       FROM users u
       LEFT JOIN team_members m ON m.user_id = u.id
       LEFT JOIN teams t ON t.id = m.team_id
       WHERE ($1 = '' OR u.email ILIKE '%' || $1 || '%' OR u.display_name ILIKE '%' || $1 || '%')
       GROUP BY u.id
       ORDER BY u.created_at DESC
       LIMIT $2 OFFSET $3`,
      [q, limit, offset],
    )
    await auditView(db, sub, 'users', ip, { q, limit, offset })
    return r.rows
  })
  return c.json(
    rows.map((u) => ({
      id: u.id,
      email: u.email,
      displayName: u.display_name,
      university: u.university,
      createdAt: u.created_at,
      deletedAt: u.deleted_at,
      isAdmin: u.is_admin,
      lastLoginAt: u.last_login_at,
      projectCount: Number(u.project_count),
      teams: u.teams,
    })),
  )
})

// ---------- equipes ----------

admin.get('/teams', async (c) => {
  const parsed = parseQuery(c)
  if (!parsed.success) return problem(c, 400, 'Query inválida', parsed.error.message)
  const { limit, offset } = parsed.data
  const { sub } = c.get('auth')
  const ip = clientIp(c.req.raw.headers)
  const rows = await withUser(sub, async (db) => {
    const r = await db.query(
      `SELECT t.id, t.name, t.university, t.created_at,
              (SELECT count(*) FROM projects p WHERE p.owner_team_id = t.id) AS project_count,
              COALESCE(
                json_agg(
                  json_build_object('userId', u.id, 'displayName', u.display_name,
                                    'email', u.email, 'role', m.role, 'joinedAt', m.joined_at)
                  ORDER BY m.joined_at
                ) FILTER (WHERE u.id IS NOT NULL),
                '[]'
              ) AS members
       FROM teams t
       LEFT JOIN team_members m ON m.team_id = t.id
       LEFT JOIN users u ON u.id = m.user_id
       GROUP BY t.id
       ORDER BY t.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    )
    await auditView(db, sub, 'teams', ip, { limit, offset })
    return r.rows
  })
  return c.json(
    rows.map((t) => ({
      id: t.id,
      name: t.name,
      university: t.university,
      createdAt: t.created_at,
      projectCount: Number(t.project_count),
      members: t.members,
    })),
  )
})

// ---------- atividade (access_log) ----------

admin.get('/activity', async (c) => {
  const parsed = parseQuery(c)
  if (!parsed.success) return problem(c, 400, 'Query inválida', parsed.error.message)
  const { userId, limit, offset } = parsed.data
  const { sub } = c.get('auth')
  const ip = clientIp(c.req.raw.headers)
  const rows = await withUser(sub, async (db) => {
    const r = await db.query(
      `SELECT a.id, a.user_id, u.email, a.method, a.route, a.path, a.status,
              a.duration_ms, a.ip_address, a.occurred_at
       FROM access_log a JOIN users u ON u.id = a.user_id
       WHERE ($1::uuid IS NULL OR a.user_id = $1)
       ORDER BY a.occurred_at DESC
       LIMIT $2 OFFSET $3`,
      [userId ?? null, limit, offset],
    )
    await auditView(db, sub, 'activity', ip, { userId: userId ?? null, limit, offset })
    return r.rows
  })
  return c.json(
    rows.map((a) => ({
      id: a.id,
      userId: a.user_id,
      email: a.email,
      method: a.method,
      route: a.route,
      path: a.path,
      status: a.status,
      durationMs: a.duration_ms,
      ip: a.ip_address,
      occurredAt: a.occurred_at,
    })),
  )
})

// ---------- uso do assistente (assistant_log) ----------

admin.get('/assistant', async (c) => {
  const parsed = parseQuery(c)
  if (!parsed.success) return problem(c, 400, 'Query inválida', parsed.error.message)
  const { userId, limit, offset } = parsed.data
  const { sub } = c.get('auth')
  const ip = clientIp(c.req.raw.headers)
  const rows = await withUser(sub, async (db) => {
    const r = await db.query(
      `SELECT s.id, s.user_id, u.email, s.question, s.answer, s.status, s.model,
              s.corpus_version, s.input_tokens, s.output_tokens, s.cache_read_tokens,
              s.duration_ms, s.occurred_at
       FROM assistant_log s JOIN users u ON u.id = s.user_id
       WHERE ($1::uuid IS NULL OR s.user_id = $1)
       ORDER BY s.occurred_at DESC
       LIMIT $2 OFFSET $3`,
      [userId ?? null, limit, offset],
    )
    await auditView(db, sub, 'assistant', ip, { userId: userId ?? null, limit, offset })
    return r.rows
  })
  return c.json(
    rows.map((s) => ({
      id: s.id,
      userId: s.user_id,
      email: s.email,
      question: s.question,
      answer: s.answer,
      status: s.status,
      model: s.model,
      corpusVersion: s.corpus_version,
      inputTokens: s.input_tokens,
      outputTokens: s.output_tokens,
      cacheReadTokens: s.cache_read_tokens,
      durationMs: s.duration_ms,
      occurredAt: s.occurred_at,
    })),
  )
})
