import { MONTHS_LONG, MONTHS_SHORT } from './cycle'

// Datas do calendário são DIAS (AAAA-MM-DD), nunca instantes: um prazo "até 25/01" vale o
// dia inteiro em qualquer fuso. Toda conta aqui é em UTC sobre a meia-noite do dia, de
// propósito — `new Date('2027-01-25')` local daria dia 24 à noite em Brasília.

const DAY_MS = 86_400_000

export function isIsoDate(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
}

function utc(iso: string): number {
  return Date.parse(`${iso}T00:00:00Z`)
}

/** Dias inteiros de `from` até `to` (negativo quando `to` já passou). */
export function daysBetween(from: string, to: string): number {
  return Math.round((utc(to) - utc(from)) / DAY_MS)
}

export function addDays(iso: string, days: number): string {
  return new Date(utc(iso) + days * DAY_MS).toISOString().slice(0, 10)
}

/** Hoje como AAAA-MM-DD no fuso do navegador/servidor. */
export function todayIso(now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export type MilestoneState = 'passado' | 'hoje' | 'em-breve' | 'futuro'

/** Vence em ≤ 7 dias ganha aviso (FR-DF33.5). */
export const SOON_DAYS = 7

export function stateOf(dueOn: string, today: string): MilestoneState {
  const d = daysBetween(today, dueOn)
  if (d < 0) return 'passado'
  if (d === 0) return 'hoje'
  if (d <= SOON_DAYS) return 'em-breve'
  return 'futuro'
}

/** Contagem em dias inteiros, na voz do DS §11 ("faltam 9 dias", "vence hoje", "passou há 3 dias"). */
export function countdown(dueOn: string, today: string): { days: number; text: string } {
  const days = daysBetween(today, dueOn)
  if (days === 0) return { days, text: 'vence hoje' }
  if (days === 1) return { days, text: 'falta 1 dia' }
  if (days > 1) return { days, text: `faltam ${days} dias` }
  if (days === -1) return { days, text: 'passou há 1 dia' }
  return { days, text: `passou há ${-days} dias` }
}

/** Chip de estado (C-07 `warn`) — só quando há urgência; `null` é "sem chip". */
export function stateChip(dueOn: string, today: string): string | null {
  const d = daysBetween(today, dueOn)
  if (d === 0) return 'HOJE'
  if (d > 0 && d <= SOON_DAYS) return d === 1 ? 'EM 1 DIA' : `EM ${d} DIAS`
  return null
}

/** "25 jan 2027" */
export function dataCurta(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return `${d} ${MONTHS_SHORT[m - 1]} ${y}`
}

/** "25 jan" — para a coluna mono da lista. */
export function diaMes(iso: string): string {
  const [, m, d] = iso.split('-').map(Number)
  return `${String(d).padStart(2, '0')} ${MONTHS_SHORT[m - 1]}`
}

/** "25 de janeiro de 2027" — para `aria-label`. */
export function dataExtensa(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return `${d} de ${MONTHS_LONG[m - 1]} de ${y}`
}

/** "31 mar – 4 abr 2027" · "25 – 27 set 2026" · "15 set 2026" */
export function faixaDeDatas(from: string | null, to: string | null): string {
  if (!from && !to) return 'datas a confirmar'
  if (!from || !to || from === to) return dataCurta((from ?? to) as string)
  const [fy, fm, fd] = from.split('-').map(Number)
  const [ty, tm, td] = to.split('-').map(Number)
  if (fy === ty && fm === tm) return `${fd} – ${td} ${MONTHS_SHORT[tm - 1]} ${ty}`
  if (fy === ty) return `${fd} ${MONTHS_SHORT[fm - 1]} – ${td} ${MONTHS_SHORT[tm - 1]} ${ty}`
  return `${dataCurta(from)} – ${dataCurta(to)}`
}
