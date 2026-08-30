// Policy layer (RBAC fino) — a RLS garante ISOLAMENTO (membro × não-membro);
// quem decide O QUE cada papel pode fazer dentro da equipe é esta camada (plano v2, C9).
//
// DF-10: o papel de acesso continua owner/admin/member no banco; no domínio Baja
// ele se chama capitão/capitã (owner), co-capitão/co-capitã (admin) e membro.
// A função organizacional (organograma) é outra coisa — ver team_positions.

export type TeamRole = 'owner' | 'admin' | 'member'

export type TeamAction =
  | 'team.update' // renomear equipe / universidade
  | 'invite.create' // convidar por e-mail
  | 'invite.revoke' // revogar convite pendente
  | 'invite.list' // ver convites pendentes
  | 'member.remove' // remover OUTRO membro (sair é sempre permitido, com guardas)
  | 'member.role' // trocar papel de membro
  | 'member.approve' // confirmar/recusar entrada na equipe (DF-10)
  | 'member.assign' // atribuir função do organograma / status trainee-efetivo (DF-10)
  | 'position.manage' // criar, mover, descrever e excluir funções (DF-10)
  | 'project.transfer' // trazer projeto pessoal p/ a equipe
  | 'evolution.declare' // declarar/revogar critério de maturidade (DF-13)
  | 'evolution.season' // configurar a temporada: rótulo, projeto, marcos (DF-13)
  | 'step.manage' // dono, ordem e descarte da fila de próximos passos (DF-13)
  | 'knowledge.moderate' // excluir decisão/guia, reatribuir dono de guia (DF-14)

const PERMISSIONS: Record<TeamRole, ReadonlySet<TeamAction>> = {
  owner: new Set<TeamAction>([
    'team.update',
    'invite.create',
    'invite.revoke',
    'invite.list',
    'member.remove',
    'member.role',
    'member.approve',
    'member.assign',
    'position.manage',
    'project.transfer',
    'evolution.declare',
    'evolution.season',
    'step.manage',
    'knowledge.moderate',
  ]),
  // co-capitã(o) faz a gestão do dia a dia (confirma entrada, organiza o
  // organograma), mas não mexe em papel de acesso nem na capitania
  admin: new Set<TeamAction>([
    'team.update',
    'invite.create',
    'invite.revoke',
    'invite.list',
    'member.remove',
    'member.approve',
    'member.assign',
    'position.manage',
    'project.transfer',
    'evolution.declare',
    'evolution.season',
    'step.manage',
    'knowledge.moderate',
  ]),
  // membro registra conhecimento e cria passo manual (rotas próprias, sem gate de
  // papel); o que exige capitania é declarar critério, mexer na fila alheia e moderar
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

// ---------- capitania (DF-10) ----------

// 1 capitão/capitã + até 2 co-capitães confirmam entradas e gerem pessoas.
// Aplicado na app, dentro da transação com SELECT ... FOR UPDATE: equipes
// legadas com N owners continuam funcionando, mas escrita nova não piora.
export const MAX_COCAPTAINS = 2

const ROLE_LABELS: Record<TeamRole, string> = {
  owner: 'capitão/capitã',
  admin: 'co-capitão/co-capitã',
  member: 'membro',
}

export function roleLabel(role: TeamRole): string {
  return ROLE_LABELS[role]
}
