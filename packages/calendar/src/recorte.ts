import { daysBetween } from './dates'
import { chipDaCompeticao } from './labels'
import type { CalendarCompetition, CalendarMilestone, CalendarPayload, TeamCalendar } from './types'

// Recorte pessoal (DF-33 §4.4) e as leituras derivadas (próximos 30 dias, agrupamento por
// mês). Puro: a rota do .ics com `teamId` e a tela aplicam a MESMA função.

/** Filtro rápido da lista (FR-DF33.11 / FR-DF33.28). */
export type QuickFilter = 'tudo' | 'prazos' | 'equipe'

export interface RecorteOptions {
  /** "Só o que afeta minha equipe" (FR-DF33.13). Sem equipe é sempre `false`. */
  mine: boolean
  quick: QuickFilter
  /** Chips de competição ligados (`chipDaCompeticao`). Vazio = todas. */
  chips: ReadonlySet<string>
}

/** Quando o alternador nasce ligado: a equipe tem ao menos uma competição marcada (FR-DF33.13). */
export function defaultMine(team: TeamCalendar | null): boolean {
  return !!team && team.competitionIds.length + team.interestCompetitionIds.length > 0
}

export function bondOf(
  team: Pick<TeamCalendar, 'competitionIds' | 'interestCompetitionIds'> | null,
  competitionId: string,
): CalendarCompetition['bond'] {
  if (!team) return null
  if (team.competitionIds.includes(competitionId)) return 'inscrita'
  if (team.interestCompetitionIds.includes(competitionId)) return 'interesse'
  return null
}

/**
 * Competições visíveis. Com o recorte ligado, só as inscritas e as de interesse; os chips do
 * cabeçalho valem em cima disso.
 */
export function competicoesVisiveis(
  p: Pick<CalendarPayload, 'competitions' | 'team'>,
  o: RecorteOptions,
): CalendarCompetition[] {
  return p.competitions.filter((c) => {
    if (o.chips.size && !o.chips.has(chipDaCompeticao(c))) return false
    if (o.mine && p.team && !bondOf(p.team, c.id)) return false
    return true
  })
}

/**
 * Marcos visíveis. Marco com `appliesTo` só aparece, no recorte, se a categoria da equipe
 * estiver nele; sem categoria declarada, todos os lotes aparecem (FR-DF33.13).
 */
export function marcosVisiveis(
  p: Pick<CalendarPayload, 'competitions' | 'milestones' | 'team'>,
  o: RecorteOptions,
): CalendarMilestone[] {
  const comps = new Set(competicoesVisiveis(p, o).map((c) => c.id))
  const kind = p.team?.registrationKind ?? null
  return p.milestones.filter((m) => {
    if (m.status === 'cancelado') return false
    if (m.kind === 'equipe') return o.quick !== 'prazos'
    if (o.quick === 'equipe') return false
    if (o.quick === 'prazos' && m.kind === 'comunicado') return false
    if (m.competitionId && !comps.has(m.competitionId)) return false
    if (o.mine && kind && m.appliesTo.length && !m.appliesTo.includes(kind)) return false
    return true
  })
}

export const UPCOMING_DAYS = 30
export const UPCOMING_LIMIT = 5

/** "Próximos 30 dias": até cinco, em ordem, contando o de hoje (FR-DF33.7). */
export function proximos(
  milestones: CalendarMilestone[],
  today: string,
  days = UPCOMING_DAYS,
  limit = UPCOMING_LIMIT,
): CalendarMilestone[] {
  return milestones
    .filter((m) => {
      const d = daysBetween(today, m.dueOn)
      return d >= 0 && d <= days
    })
    .sort(porData)
    .slice(0, limit)
}

/** O próximo marco futuro (Início e faixa de temporada). */
export function proximo(milestones: CalendarMilestone[], today: string): CalendarMilestone | null {
  return milestones.filter((m) => daysBetween(today, m.dueOn) >= 0).sort(porData)[0] ?? null
}

export function porData(a: CalendarMilestone, b: CalendarMilestone): number {
  return a.dueOn.localeCompare(b.dueOn) || a.title.localeCompare(b.title)
}

export interface MonthGroup {
  key: string
  items: CalendarMilestone[]
}

/** Lista agrupada por mês, em ordem de data (FR-DF33.9). */
export function porMes(milestones: CalendarMilestone[]): MonthGroup[] {
  const groups = new Map<string, CalendarMilestone[]>()
  for (const m of [...milestones].sort(porData)) {
    const key = m.dueOn.slice(0, 7)
    const list = groups.get(key)
    if (list) list.push(m)
    else groups.set(key, [m])
  }
  return [...groups.entries()].map(([key, items]) => ({ key, items }))
}

/** Passados vão para "Já passou" (colapsado); o resto fica em ordem (FR-DF33.9). */
export function separaPassados(
  milestones: CalendarMilestone[],
  today: string,
): { futuros: CalendarMilestone[]; passados: CalendarMilestone[] } {
  const futuros: CalendarMilestone[] = []
  const passados: CalendarMilestone[] = []
  for (const m of milestones) (daysBetween(today, m.dueOn) < 0 ? passados : futuros).push(m)
  return { futuros, passados }
}

/** `checked_at` > 30 dias e há marco futuro → VERIFICAR (FR-DF33.18). */
export const STALE_DAYS = 30

export function isStale(
  checkedAt: string | null,
  today: string,
  hasFutureMilestone: boolean,
): boolean {
  if (!hasFutureMilestone) return false
  if (!checkedAt) return true
  return daysBetween(checkedAt.slice(0, 10), today) > STALE_DAYS
}
