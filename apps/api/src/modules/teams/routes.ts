import { randomBytes, randomUUID } from 'node:crypto'
import { Hono } from 'hono'
import { z } from 'zod'
import { withUser } from '../../db'
import { problem } from '../../problem'
import { audit, clientIp } from '../../audit'
import { can, isTeamRole, outranks, roleLabel, MAX_COCAPTAINS, type TeamRole } from '../../policy'
import { countRole, hashToken, lockTeam, myRole, teamMembers, toTeam } from './shared'
import { loadPositions, registerPositionRoutes, seedPositions } from './positions'
import { publishOrgSummary } from '../evolution/engine'
import type { AuthEnv } from '../../auth/middleware'

export const teams = new Hono<AuthEnv>()
export const invites = new Hono<AuthEnv>()

const INVITE_TTL_DAYS = 7
const MAX_PENDING_INVITES = 20 // anti-abuso; entitlements de verdade na fase 15

// ---------- equipes ----------

// "Minhas equipes": o admin do portal enxerga todas as equipes pela RLS (DF-9),
// mas esta rota é a lista pessoal — a visão de operação é /admin/teams.
teams.get('/', async (c) => {
  const { sub } = c.get('auth')
  const rows = await withUser(
    sub,
    async (db) =>
      (
        await db.query(
          `SELECT t.*,
                  (SELECT role FROM team_members m WHERE m.team_id = t.id AND m.user_id = $1) AS my_role,
                  (SELECT count(*)::int FROM team_members m2 WHERE m2.team_id = t.id) AS member_count,
                  (SELECT count(*)::int FROM team_join_request_profiles(t.id)) AS join_request_count
           FROM teams t
           WHERE t.id IN (SELECT team_id FROM team_members m3 WHERE m3.user_id = $1)
           ORDER BY t.created_at`,
          [sub],
        )
      ).rows,
  )
  // fila de entrada é assunto da capitania — membro comum não vê nem a contagem
  return c.json(
    rows.map((r) =>
      toTeam({
        ...r,
        join_request_count:
          isTeamRole(r.my_role) && can(r.my_role, 'member.approve') ? r.join_request_count : 0,
      }),
    ),
  )
})

// "Aguardando confirmação da capitania": quem aceitou convite ainda NÃO é membro
// e não enxerga a equipe pela RLS (spec §7, P-1.3). Registrada antes de /:id.
teams.get('/join-requests/mine', async (c) => {
  const { sub } = c.get('auth')
  const rows = await withUser(
    sub,
    async (db) => (await db.query('SELECT * FROM my_join_requests()', [])).rows,
  )
  return c.json(
    rows.map((r) => ({
      id: r.r_id,
      teamId: r.r_team_id,
      teamName: r.r_team_name,
      requestedAt: r.r_requested_at,
      expiresAt: r.r_expires_at,
    })),
  )
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
    // DF-10: equipe nasce com o organograma padrão de equipe de elite
    await seedPositions(db, id)
    // DF-13: a primeira evidência da equipe nasce junto — sem ela a tela de
    // evolução abriria em branco antes de qualquer ação
    await publishOrgSummary(db, id, sub)
    await audit(db, {
      actorUserId: sub,
      action: 'team.create',
      resourceType: 'team',
      resourceId: id,
      ip: clientIp(c.req.raw.headers),
    })
    return (await db.query('SELECT * FROM teams WHERE id = $1', [id])).rows[0]
  })
  return c.json(toTeam({ ...row, my_role: 'owner', member_count: 1, join_request_count: 0 }), 201)
})

teams.get('/:id', async (c) => {
  const { sub } = c.get('auth')
  const teamId = c.req.param('id')
  const data = await withUser(sub, async (db) => {
    const t = await db.query('SELECT * FROM teams WHERE id = $1', [teamId])
    if (!t.rowCount) return null
    const role = await myRole(db, teamId, sub)
    if (!role) return null
    // perfis vêm da função SECURITY DEFINER; função/status moram em team_members
    const members = await db.query(
      `SELECT p.*, m.position_id, m.status
       FROM team_member_profiles($1) p
       JOIN team_members m ON m.user_id = p.user_id AND m.team_id = $1
       ORDER BY p.joined_at`,
      [teamId],
    )
    const pending = can(role, 'invite.list')
      ? (
          await db.query(
            `SELECT id, email, expires_at FROM team_invites
             WHERE team_id = $1 AND expires_at > now() ORDER BY expires_at`,
            [teamId],
          )
        ).rows
      : []
    const requests = can(role, 'member.approve')
      ? (await db.query('SELECT * FROM team_join_request_profiles($1)', [teamId])).rows
      : []
    const positions = await loadPositions(db, teamId)
    return { team: t.rows[0], role, members: members.rows, pending, requests, positions }
  })
  if (!data) return problem(c, 404, 'Equipe não encontrada')
  return c.json({
    ...toTeam({
      ...data.team,
      my_role: data.role,
      member_count: data.members.length,
      join_request_count: data.requests.length,
    }),
    members: data.members.map((m) => ({
      userId: m.user_id,
      displayName: m.display_name,
      email: m.email,
      role: m.role,
      joinedAt: m.joined_at,
      positionId: m.position_id ?? null,
      status: m.status,
    })),
    pendingInvites: data.pending.map((i) => ({
      id: i.id,
      email: i.email,
      expiresAt: i.expires_at,
    })),
    joinRequests: data.requests.map((r) => ({
      id: r.r_id,
      userId: r.r_user_id,
      displayName: r.r_display_name,
      email: r.r_email,
      requestedAt: r.r_requested_at,
      expiresAt: r.r_expires_at,
    })),
    positions: data.positions,
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
      [
        teamId,
        parsed.data.name ?? null,
        parsed.data.university ?? null,
        'university' in parsed.data,
      ],
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
    return problem(c, 403, 'Sem permissão', 'Apenas a capitania altera a equipe.')
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
  if (result === 'forbidden') return problem(c, 403, 'Sem permissão', 'Apenas a capitania convida.')
  if (result === 'limit')
    return problem(
      c,
      403,
      'Limite de convites',
      `Máximo de ${MAX_PENDING_INVITES} convites pendentes.`,
    )
  // Resposta idêntica exista ou não conta com esse e-mail (C9 — sem enumeração).
  // O token só aparece AQUI, uma única vez; no banco fica apenas o hash.
  return c.json({ id: result.id, email: result.email, expiresAt: result.expires_at, token }, 201)
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
    return problem(c, 403, 'Sem permissão', 'Apenas a capitania revoga convites.')
  return c.body(null, 204)
})

// Aceite por link copiável (envio de e-mail entra em fase futura).
// DF-10: aceitar NÃO entra na equipe — registra solicitação p/ a capitania confirmar.
// Resposta uniforme p/ token errado, expirado, e-mail não vinculado ou conta inexistente.
invites.post('/accept', async (c) => {
  const parsed = z
    .object({ token: z.string().min(20).max(200) })
    .safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return problem(c, 400, 'Body inválido', parsed.error.message)
  const { sub } = c.get('auth')
  const row = await withUser(sub, async (db) => {
    const r = await db.query(
      `SELECT r_team_id AS team_id, r_team_name AS team_name, r_outcome AS outcome
       FROM accept_team_invite($1)`,
      [hashToken(parsed.data.token)],
    )
    const found = r.rows[0]
    if (!found) return null
    await audit(db, {
      actorUserId: sub,
      action: found.outcome === 'member' ? 'team.join' : 'team.join.request',
      resourceType: 'team',
      resourceId: found.team_id,
      ip: clientIp(c.req.raw.headers),
    })
    return found
  })
  if (!row) return problem(c, 404, 'Convite inválido ou expirado')
  return c.json({ teamId: row.team_id, teamName: row.team_name, outcome: row.outcome })
})

// ---------- solicitações de entrada (DF-10) ----------

teams.get('/:id/join-requests', async (c) => {
  const { sub } = c.get('auth')
  const teamId = c.req.param('id')
  const result = await withUser(sub, async (db) => {
    const role = await myRole(db, teamId, sub)
    if (!role) return 'notfound' as const
    if (!can(role, 'member.approve')) return 'forbidden' as const
    return (await db.query('SELECT * FROM team_join_request_profiles($1)', [teamId])).rows
  })
  if (result === 'notfound') return problem(c, 404, 'Equipe não encontrada')
  if (result === 'forbidden')
    return problem(c, 403, 'Sem permissão', 'Apenas a capitania confirma entradas.')
  return c.json(
    result.map((r) => ({
      id: r.r_id,
      userId: r.r_user_id,
      displayName: r.r_display_name,
      email: r.r_email,
      requestedAt: r.r_requested_at,
      expiresAt: r.r_expires_at,
    })),
  )
})

const approveBody = z.object({
  status: z.enum(['trainee', 'efetivo']).optional(),
  positionId: z.string().uuid().nullable().optional(),
})

teams.post('/:id/join-requests/:requestId/approve', async (c) => {
  const parsed = approveBody.safeParse((await c.req.json().catch(() => null)) ?? {})
  if (!parsed.success) return problem(c, 400, 'Body inválido', parsed.error.message)
  const { sub } = c.get('auth')
  const teamId = c.req.param('id')
  const requestId = c.req.param('requestId')

  const result = await withUser(sub, async (db) => {
    if (!(await lockTeam(db, teamId))) return 'notfound' as const
    const role = await myRole(db, teamId, sub)
    if (!role) return 'notfound' as const
    if (!can(role, 'member.approve')) return 'forbidden' as const

    // valida a função ANTES de consumir a solicitação: um retorno de erro daqui
    // faz COMMIT (só exceção causa ROLLBACK), e a fila não pode perder o pedido
    let positionId: string | null = null
    if (parsed.data.positionId) {
      const p = await db.query(
        'SELECT id, kind FROM team_positions WHERE id = $1 AND team_id = $2',
        [parsed.data.positionId, teamId],
      )
      if (!p.rowCount) return 'bad-position' as const
      if (p.rows[0].kind === 'captain' || p.rows[0].kind === 'cocaptain')
        return 'captaincy-position' as const
      positionId = p.rows[0].id
    }

    // DELETE ... RETURNING consome a solicitação de forma atômica: duas
    // confirmações concorrentes, só uma acha a linha (SELECT ... FOR UPDATE não
    // serve — sob RLS ele exige policy de UPDATE, que esta tabela não tem)
    const r = await db.query(
      `DELETE FROM team_join_requests
       WHERE id = $1 AND team_id = $2 AND expires_at > now()
       RETURNING user_id`,
      [requestId, teamId],
    )
    const target = r.rows[0]?.user_id
    if (!target) return 'notfound' as const

    await db.query(
      `INSERT INTO team_members (team_id, user_id, role, status, position_id)
       VALUES ($1, $2, 'member', $3, $4)
       ON CONFLICT (team_id, user_id) DO NOTHING`,
      [teamId, target, parsed.data.status ?? 'efetivo', positionId],
    )
    await audit(db, {
      actorUserId: sub,
      action: 'team.join.approve',
      resourceType: 'team',
      resourceId: teamId,
      ip: clientIp(c.req.raw.headers),
      metadata: { targetUserId: target, status: parsed.data.status ?? 'efetivo' },
    })
    await publishOrgSummary(db, teamId, sub)
    return 'ok' as const
  })

  if (result === 'notfound') return problem(c, 404, 'Solicitação não encontrada')
  if (result === 'forbidden')
    return problem(c, 403, 'Sem permissão', 'Apenas a capitania confirma entradas.')
  if (result === 'bad-position') return problem(c, 400, 'Função inválida')
  if (result === 'captaincy-position')
    return problem(
      c,
      409,
      'Função da capitania',
      'Capitão/capitã e co-capitães são definidos pelo papel de acesso, não pela atribuição de função.',
    )
  return c.body(null, 204)
})

// Recusar (capitania) ou desistir (o próprio solicitante).
teams.delete('/:id/join-requests/:requestId', async (c) => {
  const { sub } = c.get('auth')
  const teamId = c.req.param('id')
  const requestId = c.req.param('requestId')
  const result = await withUser(sub, async (db) => {
    // a RLS deixa o solicitante ver a PRÓPRIA linha mesmo sem ser membro
    const r = await db.query(
      'SELECT user_id FROM team_join_requests WHERE id = $1 AND team_id = $2',
      [requestId, teamId],
    )
    const owner = r.rows[0]?.user_id
    if (!owner) return 'notfound' as const
    if (owner !== sub) {
      const role = await myRole(db, teamId, sub)
      if (!role) return 'notfound' as const
      if (!can(role, 'member.approve')) return 'forbidden' as const
    }
    await db.query('DELETE FROM team_join_requests WHERE id = $1', [requestId])
    await audit(db, {
      actorUserId: sub,
      action: owner === sub ? 'team.join.cancel' : 'team.join.reject',
      resourceType: 'team',
      resourceId: teamId,
      ip: clientIp(c.req.raw.headers),
      metadata: { targetUserId: owner },
    })
    return 'ok' as const
  })
  if (result === 'notfound') return problem(c, 404, 'Solicitação não encontrada')
  if (result === 'forbidden')
    return problem(c, 403, 'Sem permissão', 'Apenas a capitania recusa entradas.')
  return c.body(null, 204)
})

// ---------- membros ----------

teams.delete('/:id/members/:userId', async (c) => {
  const { sub } = c.get('auth')
  const teamId = c.req.param('id')
  const targetId = c.req.param('userId')
  const result = await withUser(sub, async (db) => {
    // trava a equipe ANTES de ler papéis: sem isso, uma saída concorrente a uma
    // transferência de capitania apagava o capitão recém-promovido
    if (!(await lockTeam(db, teamId))) return 'notfound' as const
    const members = await teamMembers(db, teamId)
    const actor = members.find((m) => m.userId === sub)
    if (!actor) return 'notfound' as const
    const target = members.find((m) => m.userId === targetId)
    if (!target) return 'notfound' as const

    const sozinho = members.length === 1
    if (targetId === sub) {
      // sair da equipe — guardas p/ não deixar equipe acéfala ou projetos órfãos
      if (actor.role === 'owner' && countRole(members, 'owner') === 1 && members.length > 1)
        return 'last-owner' as const
      if (sozinho) {
        const proj = await db.query(
          'SELECT count(*)::int AS n FROM projects WHERE owner_team_id = $1',
          [teamId],
        )
        if (proj.rows[0].n > 0) return 'has-projects' as const
      }
    } else if (!can(actor.role, 'member.remove') || !outranks(actor.role, target.role)) {
      return 'forbidden' as const
    }

    // Equipe vai ficar sem ninguém: convite ou solicitação viva deixaria a próxima
    // pessoa esperando para sempre uma capitania que não existe mais. Tem de vir
    // ANTES da saída — depois dela a RLS já não enxerga as linhas da equipe.
    if (sozinho) {
      await db.query('DELETE FROM team_invites WHERE team_id = $1', [teamId])
      await db.query('DELETE FROM team_join_requests WHERE team_id = $1', [teamId])
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
    // quem saiu não é mais membro: a RLS recusaria a evidência e derrubaria a
    // própria saída por exceção. Só publica quando o ator continua na equipe.
    if (targetId !== sub) await publishOrgSummary(db, teamId, sub)
    return 'ok' as const
  })
  if (result === 'notfound') return problem(c, 404, 'Membro não encontrado')
  if (result === 'forbidden')
    return problem(c, 403, 'Sem permissão', 'Seu papel não permite remover este membro.')
  if (result === 'last-owner')
    return problem(
      c,
      409,
      'Última pessoa na capitania',
      'Passe a capitania a alguém (transferir capitania) antes de sair.',
    )
  if (result === 'has-projects')
    return problem(
      c,
      409,
      'Equipe possui projetos',
      'Transfira ou exclua os projetos antes de sair.',
    )
  return c.body(null, 204)
})

const memberPatchBody = z
  .object({
    role: z.enum(['owner', 'admin', 'member']).optional(),
    positionId: z.string().uuid().nullable().optional(),
    status: z.enum(['trainee', 'efetivo']).optional(),
  })
  .refine((d) => d.role !== undefined || 'positionId' in d || d.status !== undefined, {
    message: 'informe role, positionId ou status',
  })

teams.patch('/:id/members/:userId', async (c) => {
  const parsed = memberPatchBody.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return problem(c, 400, 'Body inválido', parsed.error.message)
  const { sub } = c.get('auth')
  const teamId = c.req.param('id')
  const targetId = c.req.param('userId')
  const wantsRole = parsed.data.role !== undefined
  const wantsAssign = 'positionId' in parsed.data || parsed.data.status !== undefined

  const result = await withUser(sub, async (db) => {
    // trava primeiro e SÓ DEPOIS lê papéis: decidir permissão com leitura de
    // antes da trava deixava o ex-capitão executar uma última ação owner-only
    if (!(await lockTeam(db, teamId))) return 'notfound' as const
    const members = await teamMembers(db, teamId)
    const actor = members.find((m) => m.userId === sub)
    if (!actor) return 'notfound' as const
    if (wantsRole && !can(actor.role, 'member.role')) return 'forbidden-role' as const
    if (wantsAssign && !can(actor.role, 'member.assign')) return 'forbidden-assign' as const

    const target = members.find((m) => m.userId === targetId)
    if (!target) return 'notfound' as const
    if (wantsAssign && targetId !== sub && !outranks(actor.role, target.role))
      return 'forbidden-assign' as const

    // TODAS as validações antes de qualquer escrita: um retorno de erro daqui
    // faz COMMIT, então validar no meio deixaria mutação gravada com resposta 4xx
    const nextRole = wantsRole ? (parsed.data.role as TeamRole) : target.role
    if (wantsRole && nextRole !== target.role) {
      if (nextRole === 'owner') return 'use-transfer' as const
      if (nextRole === 'admin' && countRole(members, 'admin') >= MAX_COCAPTAINS)
        return 'cocaptain-limit' as const
      if (target.role === 'owner' && countRole(members, 'owner') === 1) return 'last-owner' as const
    }
    let positionId: string | null = null
    if (parsed.data.positionId) {
      const p = await db.query(
        'SELECT id, kind FROM team_positions WHERE id = $1 AND team_id = $2',
        [parsed.data.positionId, teamId],
      )
      if (!p.rowCount) return 'bad-position' as const
      // os nós de capitania mostram quem tem o papel de acesso — não se atribuem à mão
      if (p.rows[0].kind === 'captain' || p.rows[0].kind === 'cocaptain')
        return 'captaincy-position' as const
      positionId = p.rows[0].id
    }

    if (wantsRole && nextRole !== target.role) {
      await db.query('UPDATE team_members SET role = $3 WHERE team_id = $1 AND user_id = $2', [
        teamId,
        targetId,
        nextRole,
      ])
      await audit(db, {
        actorUserId: sub,
        action: 'team.member.role',
        resourceType: 'team',
        resourceId: teamId,
        ip: clientIp(c.req.raw.headers),
        metadata: { targetUserId: targetId, role: nextRole },
      })
    }
    if (parsed.data.status !== undefined) {
      await db.query('UPDATE team_members SET status = $3 WHERE team_id = $1 AND user_id = $2', [
        teamId,
        targetId,
        parsed.data.status,
      ])
    }
    if ('positionId' in parsed.data) {
      await db.query(
        'UPDATE team_members SET position_id = $3 WHERE team_id = $1 AND user_id = $2',
        [teamId, targetId, positionId],
      )
    }
    if (wantsAssign) {
      await audit(db, {
        actorUserId: sub,
        action: 'team.member.assign',
        resourceType: 'team',
        resourceId: teamId,
        ip: clientIp(c.req.raw.headers),
        metadata: {
          targetUserId: targetId,
          positionId: parsed.data.positionId ?? null,
          status: parsed.data.status ?? null,
        },
      })
    }
    await publishOrgSummary(db, teamId, sub)
    return 'ok' as const
  })

  if (result === 'notfound') return problem(c, 404, 'Membro não encontrado')
  if (result === 'forbidden-role')
    return problem(c, 403, 'Sem permissão', `Apenas ${roleLabel('owner')} troca papéis de acesso.`)
  if (result === 'forbidden-assign')
    return problem(
      c,
      403,
      'Sem permissão',
      'Seu papel não permite alterar função ou situação deste membro.',
    )
  if (result === 'use-transfer')
    return problem(
      c,
      409,
      'Capitania é única',
      'A equipe tem um capitão/capitã só — use "transferir capitania" para passar o posto.',
    )
  if (result === 'cocaptain-limit')
    return problem(
      c,
      409,
      'Limite de co-capitania',
      `A equipe já tem ${MAX_COCAPTAINS} co-capitães. Rebaixe alguém antes de promover.`,
    )
  if (result === 'last-owner')
    return problem(
      c,
      409,
      'Última pessoa na capitania',
      'Transfira a capitania a outra pessoa antes de rebaixar esta.',
    )
  if (result === 'bad-position') return problem(c, 400, 'Função inválida')
  if (result === 'captaincy-position')
    return problem(
      c,
      409,
      'Função da capitania',
      'Capitão/capitã e co-capitães são definidos pelo papel de acesso, não pela atribuição de função.',
    )
  return c.body(null, 204)
})

// Troca de capitania em UMA transação: nunca 0 nem 2 capitães (spec §7, P-1.1).
const transferBody = z.object({ toUserId: z.string().uuid() })

teams.post('/:id/transfer-captaincy', async (c) => {
  const parsed = transferBody.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return problem(c, 400, 'Body inválido', parsed.error.message)
  const { sub } = c.get('auth')
  const teamId = c.req.param('id')
  const toUserId = parsed.data.toUserId

  const result = await withUser(sub, async (db) => {
    if (!(await lockTeam(db, teamId))) return 'notfound' as const
    const members = await teamMembers(db, teamId)
    const me = members.find((m) => m.userId === sub)
    if (!me) return 'notfound' as const
    if (me.role !== 'owner') return 'forbidden' as const
    if (toUserId === sub) return 'self' as const
    const target = members.find((m) => m.userId === toUserId)
    if (!target) return 'notfound-member' as const

    // ex-capitã(o) vira co-capitã(o) se houver vaga; senão, membro
    const cocaptainsAfter = members.filter(
      (m) => m.role === 'admin' && m.userId !== toUserId,
    ).length
    const demoted: TeamRole = cocaptainsAfter < MAX_COCAPTAINS ? 'admin' : 'member'

    await db.query('UPDATE team_members SET role = $3 WHERE team_id = $1 AND user_id = $2', [
      teamId,
      toUserId,
      'owner',
    ])
    await db.query('UPDATE team_members SET role = $3 WHERE team_id = $1 AND user_id = $2', [
      teamId,
      sub,
      demoted,
    ])
    await audit(db, {
      actorUserId: sub,
      action: 'team.captaincy.transfer',
      resourceType: 'team',
      resourceId: teamId,
      ip: clientIp(c.req.raw.headers),
      metadata: { targetUserId: toUserId, previousCaptainRole: demoted },
    })
    await publishOrgSummary(db, teamId, sub)
    return { newCaptainUserId: toUserId, previousCaptainRole: demoted }
  })

  if (result === 'notfound') return problem(c, 404, 'Equipe não encontrada')
  if (result === 'notfound-member') return problem(c, 404, 'Membro não encontrado')
  if (result === 'forbidden')
    return problem(c, 403, 'Sem permissão', `Apenas ${roleLabel('owner')} transfere a capitania.`)
  if (result === 'self')
    return problem(c, 409, 'Sem efeito', 'Você já é o capitão/capitã desta equipe.')
  return c.json(result)
})

registerPositionRoutes(teams)
