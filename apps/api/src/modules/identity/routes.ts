import { Hono } from 'hono'
import { z } from 'zod'
import { withUser, fetchAllPaged } from '../../db'
import { problem } from '../../problem'
import { audit, clientIp } from '../../audit'
import type { AuthEnv } from '../../auth/middleware'

export const identity = new Hono<AuthEnv>()

const CONSENT_PURPOSES = ['marketing_email', 'analytics'] as const

// Bootstrap idempotente: cria (ou retorna) o usuário a partir dos claims do token.
// Base legal: execução de contrato (art. 7º, V) — não gera registro de consentimento.
identity.post('/', async (c) => {
  const { sub, email, name } = c.get('auth')
  let user: Record<string, unknown>
  try {
    user = await bootstrap(sub, email, name, clientIp(c.req.raw.headers))
  } catch (e) {
    // e-mail já pertence a outro sub (ex.: conta antiga do dev issuer, ou
    // recadastro após exclusão) — 409 claro em vez de 500 opaco
    const pg = e as { code?: string; constraint?: string }
    if (pg.code === '23505' && pg.constraint === 'users_email_key') {
      return problem(
        c,
        409,
        'E-mail já cadastrado',
        'Este e-mail já está associado a outra conta. Se você acabou de entrar com o Google, entre uma vez com e-mail e senha — a conta Google é vinculada no próximo login. Se você excluiu a conta antiga, aguarde o processamento; caso contrário, contate o suporte.',
      )
    }
    throw e
  }
  if (user.deleted_at) return problem(c, 410, 'Conta excluída', 'Exclusão em processamento.')
  return c.json(toUser(user))
})

function bootstrap(sub: string, email: string, name: string, ip: string | undefined) {
  return withUser(sub, async (db) => {
    // bootstrap = início de sessão → carimba last_login_at (DF-9)
    const existing = await db.query(
      'UPDATE users SET last_login_at = now() WHERE id = $1 RETURNING *',
      [sub],
    )
    if (existing.rowCount) return existing.rows[0]
    const created = await db.query(
      `INSERT INTO users (id, email, display_name, last_login_at) VALUES ($1, $2, $3, now()) RETURNING *`,
      [sub, email, name],
    )
    await audit(db, {
      actorUserId: sub,
      action: 'user.bootstrap',
      resourceType: 'user',
      resourceId: sub,
      ip,
    })
    return created.rows[0]
  })
}

identity.get('/', async (c) => {
  const { sub } = c.get('auth')
  const row = await withUser(
    sub,
    async (db) =>
      (await db.query('SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL', [sub])).rows[0],
  )
  if (!row) return problem(c, 404, 'Usuário não cadastrado', 'Chame POST /api/v1/me primeiro.')
  return c.json(toUser(row))
})

const patchBody = z.object({
  displayName: z.string().min(1).max(120).optional(),
  university: z.string().max(200).nullable().optional(),
})

identity.patch('/', async (c) => {
  const parsed = patchBody.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return problem(c, 400, 'Body inválido', parsed.error.message)
  const { sub } = c.get('auth')
  const row = await withUser(sub, async (db) => {
    const r = await db.query(
      `UPDATE users SET
         display_name = COALESCE($2, display_name),
         university   = CASE WHEN $4 THEN $3 ELSE university END
       WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
      [
        sub,
        parsed.data.displayName ?? null,
        parsed.data.university ?? null,
        'university' in parsed.data,
      ],
    )
    return r.rows[0]
  })
  if (!row) return problem(c, 404, 'Usuário não cadastrado')
  return c.json(toUser(row))
})

// Direito de exclusão (LGPD, fase 12.3): soft delete agora, purge em 30d (job futuro).
identity.delete('/', async (c) => {
  const { sub } = c.get('auth')
  await withUser(sub, async (db) => {
    await db.query('UPDATE users SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL', [
      sub,
    ])
    await audit(db, {
      actorUserId: sub,
      action: 'user.delete',
      resourceType: 'user',
      resourceId: sub,
      ip: clientIp(c.req.raw.headers),
    })
  })
  return c.body(null, 204)
})

// Direito de portabilidade: tudo que a RLS deixa este usuário ver.
identity.get('/export', async (c) => {
  const { sub } = c.get('auth')
  const data = await withUser(sub, async (db) => {
    const [
      user,
      consents,
      projects,
      snapshots,
      events,
      accessLog,
      assistantLog,
      memberships,
      joinRequests,
      declarations,
      steps,
      evidence,
      decisions,
      guides,
      trailCompletions,
      kits,
      optIns,
    ] = await Promise.all([
      db.query('SELECT * FROM users WHERE id = $1', [sub]),
      db.query('SELECT * FROM consents ORDER BY occurred_at', []),
      db.query('SELECT * FROM projects ORDER BY created_at', []),
      // cage_json é grande — paginado p/ caber no limite de 1 MB do Data API
      fetchAllPaged(db, 'SELECT * FROM cage_snapshots ORDER BY created_at, id', []),
      db.query('SELECT * FROM audit_events ORDER BY occurred_at', []),
      // DF-9: RLS mostra só as próprias linhas (admin exporta as SUAS aqui, não as dos outros)
      db.query('SELECT * FROM access_log WHERE user_id = $1 ORDER BY occurred_at', [sub]),
      db.query('SELECT * FROM assistant_log WHERE user_id = $1 ORDER BY occurred_at', [sub]),
      // DF-10: função no organograma e situação (trainee/efetivo) também são dados da pessoa
      db.query(
        `SELECT t.id, t.name, t.university, m.role, m.status, m.position_id, m.joined_at
         FROM team_members m JOIN teams t ON t.id = m.team_id
         WHERE m.user_id = $1 ORDER BY m.joined_at`,
        [sub],
      ),
      // solicitações de entrada ainda pendentes (SECURITY DEFINER: a RLS mostra as próprias)
      db.query('SELECT * FROM my_join_requests()', []),
      // DF-13: o que o titular declarou, carrega e produziu na evolução da equipe
      db.query('SELECT * FROM evolution_declarations WHERE declared_by = $1 ORDER BY declared_at', [
        sub,
      ]),
      db.query(
        `SELECT * FROM evolution_steps
         WHERE owner_user_id = $1 OR created_by = $1 OR done_by = $1
         ORDER BY created_at`,
        [sub],
      ),
      db.query('SELECT * FROM evolution_evidence WHERE actor_user_id = $1 ORDER BY created_at', [
        sub,
      ]),
      // DF-14: conteúdo autoral do titular. O texto é da EQUIPE e permanece na
      // exclusão da conta (autoria vira "ex-membro"); o export mostra o que é seu.
      db.query('SELECT * FROM team_decisions WHERE author_id = $1 ORDER BY created_at', [sub]),
      db.query(
        'SELECT * FROM team_guides WHERE author_id = $1 OR owner_id = $1 ORDER BY created_at',
        [sub],
      ),
      db.query('SELECT * FROM guide_completions WHERE user_id = $1 ORDER BY completed_at', [sub]),
      db.query(
        'SELECT * FROM team_handover_kits WHERE member_id = $1 OR created_by = $1 ORDER BY created_at',
        [sub],
      ),
      // DF-18 AC-DF18.14: os atos de opt-in/opt-out em que o titular foi o ator.
      // Eles também estão em `audit_events`, mas ali como metadata — aqui saem com
      // as datas e a versão do texto aceito, que é o que a portabilidade pede.
      db.query(
        'SELECT * FROM evolution_optin WHERE enabled_by = $1 OR disabled_by = $1 ORDER BY enabled_at',
        [sub],
      ),
    ])
    await audit(db, {
      actorUserId: sub,
      action: 'user.export',
      resourceType: 'user',
      resourceId: sub,
      ip: clientIp(c.req.raw.headers),
    })
    return {
      exportedAt: new Date().toISOString(),
      user: user.rows[0] ?? null,
      consents: consents.rows,
      projects: projects.rows,
      cageSnapshots: snapshots,
      auditEvents: events.rows,
      teamMemberships: memberships.rows,
      teamJoinRequests: joinRequests.rows,
      accessLog: accessLog.rows,
      assistantLog: assistantLog.rows,
      evolutionDeclarations: declarations.rows,
      evolutionSteps: steps.rows,
      evolutionEvidence: evidence.rows,
      evolutionOptIns: optIns.rows,
      teamDecisions: decisions.rows,
      teamGuides: guides.rows,
      guideCompletions: trailCompletions.rows,
      handoverKits: kits.rows,
    }
  })
  return c.json(data)
})

const consentBody = z.object({
  purpose: z.enum(CONSENT_PURPOSES),
  granted: z.boolean(),
  termVersion: z.string().min(1),
})

// Append-only: revogação é um novo registro granted=false (contrato consent).
identity.post('/consents', async (c) => {
  const parsed = consentBody.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return problem(c, 400, 'Body inválido', parsed.error.message)
  const { sub } = c.get('auth')
  const ip = clientIp(c.req.raw.headers) ?? '0.0.0.0'
  const row = await withUser(sub, async (db) => {
    const r = await db.query(
      `INSERT INTO consents (user_id, purpose, term_version, granted, ip_address)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [sub, parsed.data.purpose, parsed.data.termVersion, parsed.data.granted, ip],
    )
    await audit(db, {
      actorUserId: sub,
      action: parsed.data.granted ? 'consent.grant' : 'consent.revoke',
      resourceType: 'consent',
      resourceId: r.rows[0].id,
      ip,
      metadata: { purpose: parsed.data.purpose, termVersion: parsed.data.termVersion },
    })
    return r.rows[0]
  })
  return c.json(row, 201)
})

identity.get('/consents', async (c) => {
  const { sub } = c.get('auth')
  const rows = await withUser(
    sub,
    async (db) => (await db.query('SELECT * FROM consents ORDER BY occurred_at DESC', [])).rows,
  )
  return c.json(rows)
})

function toUser(row: Record<string, unknown>) {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    university: row.university,
    createdAt: row.created_at,
    isAdmin: row.is_admin === true,
  }
}
