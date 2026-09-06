import type { MilestoneKind } from './types'

// Colar tabela (FR-DF33.23): a pessoa cola a tabela "ATIVIDADE · LOCAL · PRAZO · INFORMATIVO"
// copiada da página oficial e o portal propõe marcos em rascunho. Regex simples, sem IA — o
// formato é estável desde 2023 (§12.3). O rascunho é conferido por uma pessoa antes de salvar;
// aqui nada é gravado.

export interface ParsedRow {
  /** Linha original, para a pessoa conferir lado a lado. */
  raw: string
  title: string
  /** AAAA-MM-DD quando a linha traz dd/mm/aaaa; nulo quando é "até a competição" ou vazio. */
  dueOn: string | null
  /** O que a coluna de prazo dizia quando não era uma data ("até a competição"). */
  dateHint: string | null
  /** "Informativo 09" → 9; nulo em "(em breve)" ou ausente. */
  sourceNumber: number | null
  location: string | null
  kindGuess: MilestoneKind
}

export interface ParsedTable {
  rows: ParsedRow[]
  /** Linhas que não viraram marco (cabeçalho, vazias, sem atividade). */
  ignored: string[]
}

const DATE_RE = /(\d{1,2})\/(\d{1,2})\/(\d{4})/
const INFORMATIVO_RE = /informativo\s*(?:n[ºo°.]?\s*)?(\d{1,3})/i
const HEADER_RE = /^(atividade|prazo|informativo|local)\b/i

/** Palavras que dizem o tipo. Ordem importa: a primeira que casa ganha. */
const KIND_HINTS: [RegExp, MilestoneKind][] = [
  [/inscri[cç][aã]o de equipe|inscri[cç][oõ]es? de equipe/i, 'inscricao'],
  [/pagamento|lote|boleto|valor/i, 'pagamento'],
  [/integrante|orientador|associa[cç][aã]o|imprensa|comiss[aá]rio|piloto/i, 'pessoas'],
  [/atestado|relat[oó]rio|documento|envio|termo|ficha|cronograma/i, 'documento'],
  [/hospedagem|credenciamento|agendamento|box|oficina|transporte/i, 'logistica'],
  [/apresenta[cç][aã]o|briefing|prova|competi[cç][aã]o|treinamento/i, 'evento'],
  [/inscri[cç]/i, 'inscricao'],
]

export function guessKind(title: string): MilestoneKind {
  for (const [re, kind] of KIND_HINTS) if (re.test(title)) return kind
  return 'logistica'
}

export function parseDate(text: string): string | null {
  const m = DATE_RE.exec(text)
  if (!m) return null
  const [, d, mo, y] = m
  const day = Number(d)
  const month = Number(mo)
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function parseInformativo(text: string): number | null {
  const m = INFORMATIVO_RE.exec(text)
  return m ? Number(m[1]) : null
}

/** Separa as colunas: tabulação, ` | `, ou dois ou mais espaços. */
function splitCells(line: string): string[] {
  const byTab = line.split('\t')
  if (byTab.length > 1) return byTab.map((c) => c.trim())
  // split literal + trim, e não /\s*\|\s*/: o \s* dos dois lados era quadrático numa
  // linha cheia de espaços sem barra (CodeQL js/polynomial-redos)
  const byPipe = line.split('|')
  if (byPipe.length > 1) return byPipe.map((c) => c.trim()).filter(Boolean)
  return line
    .split(/\s{2,}/)
    .map((c) => c.trim())
    .filter(Boolean)
}

/** Colunas que são só informação de onde acontece ("Site", "Portal", "Presencial", "E-mail"). */
const LOCATION_RE = /^(site|portal|presencial|e-?mail|online|formul[aá]rio|sistema|plataforma)\b/i

export function parseMilestoneTable(text: string): ParsedTable {
  const rows: ParsedRow[] = []
  const ignored: string[] = []
  for (const rawLine of text.split(/\r?\n/)) {
    const raw = rawLine.trim()
    if (!raw) continue
    const cells = splitCells(raw)
    const first = cells[0] ?? ''
    if (!first || HEADER_RE.test(first)) {
      ignored.push(raw)
      continue
    }
    // uma célula só e nenhuma data/informativo: é prosa, não linha da tabela
    if (cells.length === 1 && !DATE_RE.test(raw) && !INFORMATIVO_RE.test(raw)) {
      ignored.push(raw)
      continue
    }
    const title = first.replace(/\s+/g, ' ')
    const rest = cells.slice(1)
    const dueOn = parseDate(rest.join(' ') || raw)
    const sourceNumber = parseInformativo(rest.join(' ') || raw)
    const location = rest.find((c) => LOCATION_RE.test(c)) ?? null
    const prazoCell =
      rest.find((c) => DATE_RE.test(c)) ??
      rest.find((c) => /^at[ée]\b/i.test(c) || /competi[cç][aã]o/i.test(c)) ??
      null
    const dateHint = dueOn === null && prazoCell ? prazoCell : null
    rows.push({
      raw,
      title,
      dueOn,
      dateHint,
      sourceNumber,
      location,
      kindGuess: guessKind(title),
    })
  }
  return { rows, ignored }
}
