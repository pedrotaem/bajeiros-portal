import { addDays } from './dates'
import { KIND_LABEL, nomeDaFonte } from './labels'
import type { CalendarCompetition, CalendarMilestone } from './types'

// iCalendar (RFC 5545) — um VEVENT de dia inteiro por marco e um multi-dia por competição
// (FR-DF33.20). `UID` estável = id do marco: exportar duas vezes atualiza, não duplica.
// Sem `DTSTAMP` variável quando `stamp` é dado — é o que torna a saída testável byte a byte.

const PRODID = '-//Bajeiros//Calendario de competicoes//PT'
const UID_DOMAIN = 'calendario.bajeiros'

/** Vírgula, ponto e vírgula e barra invertida são separadores no formato (§3.3.11). */
export function icsEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

/** Linhas de no máximo 75 octetos; a continuação começa com um espaço (§3.1). */
export function foldLine(line: string): string {
  const bytes = new TextEncoder().encode(line)
  if (bytes.length <= 75) return line
  const out: string[] = []
  let chunk = ''
  let size = 0
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length
    const limit = out.length ? 74 : 75
    if (size + n > limit) {
      out.push(chunk)
      chunk = ch
      size = n
    } else {
      chunk += ch
      size += n
    }
  }
  if (chunk) out.push(chunk)
  return out.join('\r\n ')
}

export function icsDate(iso: string): string {
  return iso.replace(/-/g, '')
}

export interface IcsInput {
  milestones: CalendarMilestone[]
  competitions: CalendarCompetition[]
  /** "Calendário Baja · Temporada 2027" */
  name: string
  /** ISO instant; ausente → agora. Fixo nos testes. */
  stamp?: string
}

function stampOf(iso?: string): string {
  const d = iso ? new Date(iso) : new Date()
  return d
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z')
}

function vevent(lines: string[]): string[] {
  return ['BEGIN:VEVENT', ...lines, 'END:VEVENT']
}

export function buildIcs(input: IcsInput): string {
  const stamp = stampOf(input.stamp)
  const byId = new Map(input.competitions.map((c) => [c.id, c]))
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PRODID}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsEscape(input.name)}`,
  ]

  for (const c of input.competitions) {
    if (!c.startsOn) continue
    const end = addDays(c.endsOn ?? c.startsOn, 1)
    lines.push(
      ...vevent([
        `UID:competition-${c.id}@${UID_DOMAIN}`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${icsDate(c.startsOn)}`,
        `DTEND;VALUE=DATE:${icsDate(end)}`,
        `SUMMARY:${icsEscape(c.name)}`,
        ...(c.location ? [`LOCATION:${icsEscape(c.location)}`] : []),
        ...(c.officialUrl ? [`URL:${c.officialUrl}`] : []),
        `DESCRIPTION:${icsEscape('Competição. Confira o documento oficial vigente na página do evento.')}`,
        'CATEGORIES:Competição',
      ]),
    )
  }

  for (const m of input.milestones) {
    const comp = m.competitionId ? byId.get(m.competitionId) : undefined
    const start = m.startsOn ?? m.dueOn
    const end = addDays(m.dueOn, 1)
    const fonte = m.source
      ? `Fonte: ${nomeDaFonte(m.source)} — confira o documento oficial`
      : m.kind === 'equipe'
        ? 'Marco interno da equipe (temporada no portal)'
        : 'Confira o documento oficial'
    const desc = [m.summary, comp?.name, fonte].filter(Boolean).join('\n')
    lines.push(
      ...vevent([
        `UID:${m.id}@${UID_DOMAIN}`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${icsDate(start)}`,
        `DTEND;VALUE=DATE:${icsDate(end)}`,
        `SUMMARY:${icsEscape(comp ? `${m.title} · ${comp.name}` : m.title)}`,
        ...(m.source?.url ? [`URL:${m.source.url}`] : []),
        `DESCRIPTION:${icsEscape(desc)}`,
        `CATEGORIES:${m.kind === 'equipe' ? 'Equipe' : icsEscape(KIND_LABEL[m.kind])}`,
        ...(m.status === 'cancelado' ? ['STATUS:CANCELLED'] : []),
      ]),
    )
  }

  lines.push('END:VCALENDAR')
  return lines.map(foldLine).join('\r\n') + '\r\n'
}
