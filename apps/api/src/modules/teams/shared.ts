import { createHash } from 'node:crypto'
import type { DbClient } from '../../db'
import { isTeamRole, type TeamRole } from '../../policy'

// Peças usadas pelas rotas de equipe (routes.ts) e de organograma (positions.ts).

export interface MemberRow {
  userId: string
  role: TeamRole
}

// Papel do requisitante na equipe (a RLS já esconde equipes alheias — null = não-membro OU inexistente)
export async function myRole(db: DbClient, teamId: string, sub: string): Promise<TeamRole | null> {
  const r = await db.query('SELECT role FROM team_members WHERE team_id = $1 AND user_id = $2', [
    teamId,
    sub,
  ])
  const role = r.rows[0]?.role
  return isTeamRole(role) ? role : null
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

// Serializa TODA mutação da equipe travando a linha da própria equipe até o fim
// da transação. Travar só team_members não bastava: sair da equipe (DELETE) não
// pegava a trava e conseguia apagar quem a transferência de capitania acabara de
// promover, deixando a equipe sem capitão. Devolve false se a equipe não existe
// (ou a RLS a esconde), o que já serve de guarda de existência.
export async function lockTeam(db: DbClient, teamId: string): Promise<boolean> {
  const r = await db.query('SELECT id FROM teams WHERE id = $1 FOR UPDATE', [teamId])
  return r.rows.length > 0
}

// Membros da equipe. Só use DEPOIS de lockTeam quando a leitura for decidir uma escrita.
export async function teamMembers(db: DbClient, teamId: string): Promise<MemberRow[]> {
  const r = await db.query(
    'SELECT user_id, role FROM team_members WHERE team_id = $1 ORDER BY user_id',
    [teamId],
  )
  return r.rows.map((row) => ({ userId: row.user_id, role: row.role as TeamRole }))
}

export function countRole(members: MemberRow[], role: TeamRole): number {
  return members.filter((m) => m.role === role).length
}

export function toTeam(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    university: row.university,
    myRole: row.my_role ?? undefined,
    memberCount: row.member_count ?? undefined,
    joinRequestCount: row.join_request_count ?? undefined,
    createdAt: row.created_at,
  }
}
