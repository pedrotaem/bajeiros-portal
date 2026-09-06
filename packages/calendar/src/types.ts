// Tipos do calendário de competições (DF-33). O payload é o MESMO para a rota pública e
// para a rota da equipe: a segunda só acrescenta `team` e os marcos de origem `equipe`.

export type CompetitionKind = 'nacional' | 'regional'

/** Sete tipos curados (competition_milestones.kind) + `equipe` (team_season.milestones). */
export type MilestoneKind =
  | 'inscricao'
  | 'pagamento'
  | 'pessoas'
  | 'documento'
  | 'logistica'
  | 'evento'
  | 'comunicado'
  | 'equipe'

export const MILESTONE_KINDS: readonly MilestoneKind[] = [
  'inscricao',
  'pagamento',
  'pessoas',
  'documento',
  'logistica',
  'evento',
  'comunicado',
] as const

export type RegistrationKind = 'novata' | 'light' | 'integral' | 'promocional'
export const REGISTRATION_KINDS: readonly RegistrationKind[] = [
  'novata',
  'light',
  'integral',
  'promocional',
] as const

export type MilestoneStatus = 'previsto' | 'confirmado' | 'cancelado'

export type SourceKind =
  'informativo' | 'pagina' | 'regulamento' | 'template' | 'forum' | 'canal' | 'outro'
export const SOURCE_KINDS: readonly SourceKind[] = [
  'informativo',
  'pagina',
  'regulamento',
  'template',
  'forum',
  'canal',
  'outro',
] as const

export interface SourceRef {
  id: string
  competitionId: string | null
  kind: SourceKind
  number: number | null
  title: string
  url: string
  publishedOn: string | null
  edition: string | null
  checkedAt: string
}

/** Marco da equipe (team_season.milestones[i]), quando o item vem da temporada. */
export interface TeamMilestoneRef {
  index: number
  kind: 'marco' | 'entrega' | null
  sourceMilestoneId: string | null
  /** Data que a fonte diz HOJE, quando a cópia divergiu do original (FR-DF33.29). */
  sourceDueOn: string | null
}

export interface CalendarMilestone {
  id: string
  competitionId: string | null
  kind: MilestoneKind
  title: string
  summary: string | null
  startsOn: string | null
  dueOn: string
  appliesTo: RegistrationKind[]
  status: MilestoneStatus
  sectionId: string | null
  checkedAt: string | null
  source: SourceRef | null
  team: TeamMilestoneRef | null
}

export type TeamBond = 'inscrita' | 'interesse'

export interface CalendarCompetition {
  id: string
  season: number
  kind: CompetitionKind
  region: string | null
  name: string
  startsOn: string | null
  endsOn: string | null
  location: string | null
  officialUrl: string | null
  registrationOpensOn: string | null
  registrationClosesOn: string | null
  checkedAt: string | null
  /** `checked_at` > 30 dias com marco futuro (FR-DF33.18). Calculado na API. */
  stale: boolean
  links: SourceRef[]
  /** Vínculo da equipe (FR-DF33.26). Só existe na rota da equipe. */
  bond: TeamBond | null
}

export interface TeamCalendar {
  teamId: string
  label: string
  registrationKind: RegistrationKind | null
  competitionIds: string[]
  interestCompetitionIds: string[]
  updatedAt: string | null
  canManage: boolean
  canSteps: boolean
}

export interface CalendarPayload {
  season: number
  /** Ciclos com alguma competição no banco, do mais novo ao mais velho. */
  seasons: number[]
  range: { from: string; to: string }
  today: string
  competitions: CalendarCompetition[]
  milestones: CalendarMilestone[]
  /** Links oficiais que valem para todas as competições (regulamento, fórum). */
  links: SourceRef[]
  team: TeamCalendar | null
}
