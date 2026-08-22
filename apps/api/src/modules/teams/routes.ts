import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { Hono } from 'hono'
import { z } from 'zod'
import type pg from 'pg'
import { withUser } from '../../db'
import { problem } from '../../problem'
import { audit, clientIp } from '../../audit'
import { can, outranks, isTeamRole, type TeamRole } from '../../policy'
import type { AuthEnv } from '../../auth/middleware'

export const teams = new Hono<AuthEnv>()
export const invites = new Hono<AuthEnv>()

const INVITE_TTL_DAYS = 7
const MAX_PENDING_INVITES = 20 // anti-abuso; entitlements de verdade na fase 15

// Papel do requisitante na equipe (a RLS já esconde equipes alheias — null = não-membro OU inexistente)
async function myRole(db: pg.PoolClient, teamId: string, sub: string): Promise<TeamRole | null> {
  const r = await db.query('SELECT role FROM team_members WHERE team_id = $1 AND user_id = $2', [
    teamId,
    sub,
  ])
  const role = r.rows[0]?.role
  return isTeamRole(role) ? role : null
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

// ---------- equipes ----------

teams.get('/', async (c) => {
  const { sub } = c.get('auth')
  const rows = await withUser(
    sub,
    async (db) =>
      (
        await db.query(
          `SELECT t.*,
                  (SELECT role FROM team_members m WHERE m.team_id = t.id AND m.user_id = $1) AS my_role,
                  (SELECT count(*)::int FROM team_members m2 WHERE m2.team_id = t.id) AS member_count
           FROM teams t ORDER BY t.created_at`,
          [sub],
        )
      ).rows,
  )
  return c.json(rows.map(toTeam))
})

const teamBody = z.object({
  name: z.string().min(1).max(120),
  university: z.string().max(200).nullable().optional(),
})

teams.post('/', async (c) => {
  const parsed = teamBody.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return problem(c, 400, 'Body inválido', parsed.error.message)
  const { sub } = c.get('auth')
  const row = await withUser(sub, async (db) => {
    // id gerado na app: INSERT ... RETURNING exigiria passar na policy de SELECT,
    // e o criador só vira membro (logo, só enxerga a equipe) na linha seguinte.
    const id = randomUUID()
    await db.query(`INSERT INTO teams (id, name, university) VALUES ($1, $2, $3)`, [
      id,
      parsed.data.name,
      parsed.data.university ?? null,
    ])
    // fundador entra como owner na MESMA transação (policy RLS de "time vazio")
    await db.query(`INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, 'owner')`, [
      id,
      sub,
    ])
    await audit(db, {
      actorUserId: sub,
      action: 'team.create',
      resourceType: 'team',
      resourceId: id,
      ip: clientIp(c.req.raw.headers),
    })
    return (await db.query('SELECT * FROM teams WHERE id = $1', [id])).rows[0]
  })
  return c.json(toTeam({ ...row, my_role: 'owner', member_count: 1 }), 201)
})

teams.get('/:id', async (c) => {
  const { sub } = c.get('auth')
  const teamId = c.req.param('id')
  const data = await withUser(sub, async (db) => {
    const t = await db.query('SELECT * FROM teams WHERE id = $1', [teamId])
    if (!t.rowCount) return null
    const role = await myRole(db, teamId, sub)
    if (!role) return null
    const members = await db.query('SELECT * FROM team_member_profiles($1)', [teamId])
    const pending = can(role, 'invite.list')
      ? (
          await db.query(
            `SELECT id, email, expires_at FROM team_invites
             WHERE team_id = $1 AND expires_at > now() ORDER BY expires_at`,
            [teamId],
          )
        ).rows
      : []
    return { team: t.rows[0], role, members: members.rows, pending }
  })
  if (!data) return problem(c, 404, 'Equipe não encontrada')
  return c.json({
    ...toTeam({ ...data.team, my_role: data.role, member_count: data.members.length }),
    members: data.members.map((m) => ({
      userId: m.user_id,
      displayName: m.display_name,
      email: m.email,
      role: m.role,
      joinedAt: m.joined_at,
    })),
    pendingInvites: data.pending.map((i) => ({
      id: i.id,
      email: i.email,
      expiresAt: i.expires_at,
    })),
  })
})

teams.patch('/:id', async (c) => {
  const parsed = teamBody.partial().safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return problem(c, 400, 'Body inválido', parsed.error.message)
  const { sub } = c.get('auth')
  const teamId = c.req.param('id')
  const result = await withUser(sub, async (db) => {
    const role = await myRole(db, teamId, sub)
    if (!role) return 'notfound' as const
    if (!can(role, 'team.update')) return 'forbidden' as const
    const r = await db.query(
      `UPDATE teams SET
         name = COALESCE($2, name),
         university = CASE WHEN $4 THEN $3 ELSE university END
       WHERE id = $1 RETURNING *`,
      [teamId, parsed.data.name ?? null, parsed.data.university ?? null, 'university' in parsed.data],
    )
    await audit(db, {
      actorUserId: sub,
      action: 'team.update',
      resourceType: 'team',
      resourceId: teamId,
      ip: clientIp(c.req.raw.headers),
    })
    return r.rows[0]
  })
  if (result === 'notfound') return problem(c, 404, 'Equipe não encontrada')
  if (result === 'forbidden')
    return problem(c, 403, 'Sem permissão', 'Apenas owner/admin alteram a equipe.')
  return c.json(toTeam(result))
})

// ---------- convites ----------

const inviteBody = z.object({ email: z.string().email().max(254) })

teams.post('/:id/invites', async (c) => {
  const parsed = inviteBody.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return problem(c, 400, 'Body inválido', parsed.error.message)
  const { sub } = c.get('auth')
  const teamId = c.req.param('id')
  const token = randomBytes(32).toString('base64url')

  const result = await withUser(sub, async (db) => {
    const role = await myRole(db, teamId, sub)
    if (!role) return 'notfound' as const
    if (!can(role, 'invite.create')) return 'forbidden' as const
    const pending = await db.query(
      'SELECT count(*)::int AS n FROM team_invites WHERE team_id = $1 AND expires_at > now()',
      [teamId],
    )
    if (pending.rows[0].n >= MAX_PENDING_INVITES) return 'limit' as const
    const r = await db.query(
      `INSERT INTO team_invites (team_id, email, token_hash, expires_at)
       VALUES ($1, $2, $3, now() + make_interval(days => $4))
       RETURNING id, email, expires_at`,
      [teamId, parsed.data.email, hashToken(token), INVITE_TTL_DAYS],
    )
    await audit(db, {
      actorUserId: sub,
      action: 'team.invite.create',
      resourceType: 'team_invite',
      resourceId: r.rows[0].id,
      ip: clientIp(c.req.raw.headers),
      metadata: { teamId }, // nunca o e-mail em claro na trilha
    })
    return r.rows[0]
  })

  if (result === 'notfound') return problem(c, 404, 'Equipe não encontrada')
  if (result === 'forbidden')
    return problem(c, 403, 'Sem permissão', 'Apenas owner/admin convidam.')
  if (result === 'limit')
    return problem(c, 403, 'Limite de convites', `Máximo de ${MAX_PENDING_INVITES} convites pendentes.`)
  // Resposta idêntica exista ou não conta com esse e-mail (C9 — sem enumeração).
  // O token só aparece AQUI, uma única vez; no banco fica apenas o hash.
  return c.json(
    { id: result.id, email: result.email, expiresAt: result.expires_at, token },
    201,
  )
})

teams.delete('/:id/invites/:inviteId', async (c) => {
  const { sub } = c.get('auth')
  const teamId = c.req.param('id')
  const result = await withUser(sub, async (db) => {
    const role = await myRole(db, teamId, sub)
    if (!role) return 'notfound' as const
    if (!can(role, 'invite.revoke')) return 'forbidden' as const
    const r = await db.query('DELETE FROM team_invites WHERE id = $1 AND team_id = $2', [
      c.req.param('inviteId'),
      teamId,
    ])
    if (!r.rowCount) return 'notfound' as const
    await audit(db, {
      actorUserId: sub,
      action: 'team.invite.revoke',
      resourceType: 'team_invite',
      resourceId: c.req.param('inviteId'),
      ip: clientIp(c.req.raw.headers),
      metadata: { teamId },
    })
    return 'ok' as const
  })
  if (result === 'notfound') return problem(c, 404, 'Convite não encontrado')
  if (result === 'forbidden')
    return problem(c, 403, 'Sem permissão', 'Apenas owner/admin revogam convites.')
  return c.body(null, 204)
})

// Aceite por link copiável (envio de e-mail entra em fase futura).
// Resposta uniforme p/ token errado, expirado, e-mail não vinculado ou conta inexistente.
invites.post('/accept', async (c) => {
  const parsed = z
    .object({ token: z.string().min(20).max(200) })
    .safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return problem(c, 400, 'Body inválido', parsed.error.message)
  const { sub } = c.get('auth')
  const team = await withUser(sub, async (db) => {
    const r = await db.query('SELECT accept_team_invite($1) AS team_id', [
      hashToken(parsed.data.token),
    ])
    const teamId = r.rows[0]?.team_id
    if (!teamId) return null
    await audit(db, {
      actorUserId: sub,
      action: 'team.join',
      resourceType: 'team',
      resourceId: teamId,
      ip: clientIp(c.req.raw.headers),
    })
    const t = await db.query(
      `SELECT t.*, 'member' AS my_role,
              (SELECT count(*)::int FROM team_members m WHERE m.team_id = t.id) AS member_count
       FROM teams t WHERE t.id = $1`,
      [teamId],
    )
    return t.rows[0]
  })
  if (!team) return problem(c, 404, 'Convite inválido ou expirado')
  return c.json(toTeam(team))
})

// ---------- membros ----------

teams.delete('/:id/members/:userId', async (c) => {
  const { sub } = c.get('auth')
  const teamId = c.req.param('id')
  const targetId = c.req.param('userId')
  const result = await withUser(sub, async (db) => {
    const role = await myRole(db, teamId, sub)
    if (!role) return 'notfound' as const
    const target = await myRole(db, teamId, targetId)
    if (!target) return 'notfound' as const

    if (targetId === sub) {
      // sair da equipe — guardas p/ não deixar equipe acéfala ou projetos órfãos
      const counts = await db.query(
        `SELECT count(*)::int AS members,
                count(*) FILTER (WHERE role = 'owner')::int AS owners
         FROM team_members WHERE team_id = $1`,
        [teamId],
      )
      const { members, owners } = counts.rows[0]
      if (role === 'owner' && owners === 1 && members > 1) return 'last-owner' as const
      if (members === 1) {
        const proj = await db.query(
          'SELECT count(*)::int AS n FROM projects WHERE owner_team_id = $1',
          [teamId],
        )
        if (proj.rows[0].n > 0) return 'has-projects' as const
      }
    } else if (!can(role, 'member.remove') || !outranks(role, target)) {
      return 'forbidden' as const
    }

    await db.query('DELETE FROM team_members WHERE team_id = $1 AND user_id = $2', [
      teamId,
      targetId,
    ])
    await audit(db, {
      actorUserId: sub,
      action: targetId === sub ? 'team.leave' : 'team.member.remove',
      resourceType: 'team',
      resourceId: teamId,
      ip: clientIp(c.req.raw.headers),
      metadata: { targetUserId: targetId },
    })
    return 'ok' as const
  })
  if (result === 'notfound') return problem(c, 404, 'Membro não encontrado')
  if (result === 'forbidden')
    return problem(c, 403, 'Sem permissão', 'Seu papel não permite remover este membro.')
  if (result === 'last-owner')
    return problem(c, 409, 'Última pessoa owner', 'Passe a propriedade a alguém antes de sair.')
  if (result === 'has-projects')
    return problem(c, 409, 'Equipe possui projetos', 'Transfira ou exclua os projetos antes de sair.')
  return c.body(null, 204)
})

const roleBody = z.object({ role: z.enum(['owner', 'admin', 'member']) })

teams.patch('/:id/members/:userId', async (c) => {
  const parsed = roleBody.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return problem(c, 400, 'Body inválido', parsed.error.message)
  const { sub } = c.get('auth')
  const teamId = c.req.param('id')
  const targetId = c.req.param('userId')
  const result = await withUser(sub, async (db) => {
    const role = await myRole(db, teamId, sub)
    if (!role) return 'notfound' as const
    if (!can(role, 'member.role')) return 'forbidden' as const
    const target = await myRole(db, teamId, targetId)
    if (!target) return 'notfound' as const
    if (target === 'owner' && parsed.data.role !== 'owner') {
      const owners = await db.query(
        `SELECT count(*)::int AS n FROM team_members WHERE team_id = $1 AND role = 'owner'`,
        [teamId],
      )
      if (owners.rows[0].n === 1) return 'last-owner' as const
    }
    await db.query('UPDATE team_members SET role = $3 WHERE team_id = $1 AND user_id = $2', [
      teamId,
      targetId,
      parsed.data.role,
    ])
    await audit(db, {
      actorUserId: sub,
      action: 'team.member.role',
      resourceType: 'team',
      resourceId: teamId,
      ip: clientIp(c.req.raw.headers),
      metadata: { targetUserId: targetId, role: parsed.data.role },
    })
    return 'ok' as const
  })
  if (result === 'notfound') return problem(c, 404, 'Membro não encontrado')
  if (result === 'forbidden')
    return problem(c, 403, 'Sem permissão', 'Apenas owner troca papéis.')
  if (result === 'last-owner')
    return problem(c, 409, 'Última pessoa owner', 'Promova outra pessoa a owner antes.')
  return c.body(null, 204)
})

function toTeam(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    university: row.university,
    myRole: row.my_role ?? undefined,
    memberCount: row.member_count ?? undefined,
    createdAt: row.created_at,
  }
}
