import type { CompetitionKind } from './types'

// Ciclo, não ano civil (DF-33 §3.2): a temporada vai de 1º de julho ao Nacional do ano
// seguinte, e é rotulada pelo ano do Nacional. As regionais de 2026 pertencem à
// "Temporada 2027"; o NOME delas continua o do DF-15 ("Regional Sul 2026").

/** Mês (1–12) em que o ciclo vira. Julho: a inscrição do Nacional abre em julho. */
export const CYCLE_START_MONTH = 7

/** Ano do Nacional a que uma data pertence. */
export function cycleOf(dateIso: string): number {
  const [y, m] = dateIso.split('-').map(Number)
  return m >= CYCLE_START_MONTH ? y + 1 : y
}

/** Faixa do ciclo: 1º de julho do ano anterior a 30 de junho do ano do Nacional. */
export function cycleRange(season: number): { from: string; to: string } {
  return { from: `${season - 1}-07-01`, to: `${season}-06-30` }
}

/** Ciclo de uma competição pelo tipo e pelo ano em que ela ocorre. */
export function competitionCycle(kind: CompetitionKind, season: number): number {
  return kind === 'nacional' ? season : season + 1
}

export function seasonLabel(season: number): string {
  return `Temporada ${season}`
}

export const MONTHS_SHORT = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
] as const

export const MONTHS_LONG = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
] as const

export interface MonthCell {
  /** "2026-07" */
  key: string
  year: number
  /** 1–12 */
  month: number
  label: (typeof MONTHS_SHORT)[number]
  /** Dias no mês — é o peso da coluna na linha do tempo. */
  days: number
}

/** Os meses do ciclo, em ordem, com o número de dias de cada um. */
export function monthsOf(range: { from: string; to: string }): MonthCell[] {
  const [fy, fm] = range.from.split('-').map(Number)
  const [ty, tm] = range.to.split('-').map(Number)
  const out: MonthCell[] = []
  let y = fy
  let m = fm
  while (y < ty || (y === ty && m <= tm)) {
    out.push({
      key: `${y}-${String(m).padStart(2, '0')}`,
      year: y,
      month: m,
      label: MONTHS_SHORT[m - 1],
      days: new Date(Date.UTC(y, m, 0)).getUTCDate(),
    })
    m++
    if (m > 12) {
      m = 1
      y++
    }
  }
  return out
}
