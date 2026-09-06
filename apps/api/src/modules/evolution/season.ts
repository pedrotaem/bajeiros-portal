import { daysBetween, todayIso } from '@bajeiros/calendar/dates'
import type { RegistrationKind } from '@bajeiros/calendar/types'
import type { DbClient } from '../../db'

// Temporada da equipe (DF-13 RF-5.x) — leitura compartilhada por Evolução, Início (DF-16)
// e Calendário (DF-33). Mora fora de routes.ts para o calendário não importar o módulo
// inteiro (e o módulo não importar o calendário de volta).

/** Teto de marcos: subiu de 12 para 24 quando a equipe passou a copiar prazos oficiais (DF-33 §10.8). */
export const MAX_MILESTONES = 24

export interface SeasonMilestone {
  title: string
  date: string
  /** Rótulo na raia e na lista (DF-33 FR-DF33.27). */
  kind?: 'marco' | 'entrega'
  /** Marco oficial de onde este foi copiado (DF-33 FR-DF33.29). */
  sourceMilestoneId?: string
}

export interface SeasonView {
  label: string
  seasonProjectId: string | null
  milestones: SeasonMilestone[]
  /** Competições em que a equipe está INSCRITA. */
  competitionIds: string[]
  /** Competições que a equipe acompanha por INTERESSE (DF-33). */
  interestCompetitionIds: string[]
  registrationKind: RegistrationKind | null
  next: { title: string; date: string; daysLeft: number } | null
  /** A próxima competição marcada, para a faixa de temporada (DF-33 AC-DF33.11). */
  nextCompetition: { id: string; name: string; startsOn: string; daysLeft: number } | null
  updatedAt: string | null
}

export function asJson<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T
    } catch {
      return fallback
    }
  }
  return value as T
}

export async function loadSeason(db: DbClient, teamId: string): Promise<SeasonView | null> {
  const r = await db.query('SELECT * FROM team_season WHERE team_id = $1', [teamId])
  if (!r.rowCount) return null
  const row = r.rows[0]
  const milestones = asJson<SeasonMilestone[]>(row.milestones, [])
  const competitionIds = asJson<string[]>(row.competition_ids, [])
  const interestCompetitionIds = asJson<string[]>(row.interest_competition_ids, [])
  return {
    label: row.label as string,
    seasonProjectId: (row.season_project_id as string | null) ?? null,
    milestones,
    competitionIds,
    interestCompetitionIds,
    registrationKind: (row.registration_kind as RegistrationKind | null) ?? null,
    next: nextMilestone(milestones, new Date()),
    nextCompetition: await nextCompetitionFor(db, [...competitionIds, ...interestCompetitionIds]),
    updatedAt:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : ((row.updated_at as string | null) ?? null),
  }
}

/** "faltam N dias para X" — próximo marco futuro (RF-5.3, consumido pelo Início). */
export function nextMilestone(
  milestones: { title: string; date: string }[],
  now: Date,
): { title: string; date: string; daysLeft: number } | null {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const future = milestones
    .filter((m) => Date.parse(`${m.date}T00:00:00Z`) >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
  const next = future[0]
  if (!next) return null
  const daysLeft = Math.round((Date.parse(`${next.date}T00:00:00Z`) - today) / 86_400_000)
  return { title: next.title, date: next.date, daysLeft }
}

/** A próxima competição marcada pela equipe (inscrita ou de interesse), pela data de início. */
export async function nextCompetitionFor(
  db: DbClient,
  ids: string[],
  today = todayIso(),
): Promise<SeasonView['nextCompetition']> {
  if (!ids.length) return null
  const r = await db.query(
    `SELECT id, name, to_char(starts_on, 'YYYY-MM-DD') AS starts_on FROM competitions
     WHERE id::text IN (SELECT jsonb_array_elements_text($1::jsonb))
       AND starts_on IS NOT NULL AND starts_on >= $2::date
     ORDER BY starts_on LIMIT 1`,
    [JSON.stringify(ids), today],
  )
  const row = r.rows[0]
  if (!row) return null
  return {
    id: row.id as string,
    name: row.name as string,
    startsOn: row.starts_on as string,
    daysLeft: daysBetween(today, row.starts_on as string),
  }
}
