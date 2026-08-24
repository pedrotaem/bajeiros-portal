// Policy layer (RBAC fino) — a RLS garante ISOLAMENTO (membro × não-membro);
// quem decide O QUE cada papel pode fazer dentro da equipe é esta camada (plano v2, C9).

export type TeamRole = 'owner' | 'admin' | 'member'

export type TeamAction =
  | 'team.update' // renomear equipe / universidade
  | 'invite.create' // convidar por e-mail
  | 'invite.revoke' // revogar convite pendente
  | 'invite.list' // ver convites pendentes
  | 'member.remove' // remover OUTRO membro (sair é sempre permitido, com guardas)
  | 'member.role' // trocar papel de membro
  | 'project.transfer' // trazer projeto pessoal p/ a equipe

const PERMISSIONS: Record<TeamRole, ReadonlySet<TeamAction>> = {
  owner: new Set<TeamAction>([
    'team.update',
    'invite.create',
    'invite.revoke',
    'invite.list',
    'member.remove',
    'member.role',
    'project.transfer',
  ]),
  admin: new Set<TeamAction>([
    'team.update',
    'invite.create',
    'invite.revoke',
    'invite.list',
    'member.remove',
    'project.transfer',
  ]),
  member: new Set<TeamAction>(['project.transfer']),
}

export function can(role: TeamRole, action: TeamAction): boolean {
  return PERMISSIONS[role].has(action)
}

const RANK: Record<TeamRole, number> = { owner: 3, admin: 2, member: 1 }

// Remover/administrar outro membro exige superar o papel dele (admin não remove owner nem admin).
export function outranks(actor: TeamRole, target: TeamRole): boolean {
  return RANK[actor] > RANK[target]
}

export function isTeamRole(v: unknown): v is TeamRole {
  return v === 'owner' || v === 'admin' || v === 'member'
}
