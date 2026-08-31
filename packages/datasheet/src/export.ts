import { FIELDS, SECTIONS, fieldById } from './catalog'
import { computeProgress } from './progress'
import type { Field, FieldValue, SectionWaiver, StoredValue, Suggestion } from './types'

// Exportação da ficha (DF-21 RF-6.1) — Markdown para colar no relatório da temporada,
// CSV para abrir na planilha que a equipe já usa.
//
// As três colunas aparecem **quando existirem**: sem gaiola salva não há coluna de
// sugerido, e sem nenhum valor medido não há coluna de medido. Coluna vazia cobrando
// o uso do editor é exatamente o que o §3.2 proíbe na tela — e vale igual no arquivo.

export interface ExportInput {
  projectName: string
  values: readonly StoredValue[]
  suggestions?: readonly Suggestion[]
  waivers?: readonly SectionWaiver[]
  /** Versão do catálogo que gerou o arquivo — o leitor de daqui a dois anos precisa dela. */
  catalogVersion: string
}

function labelOf(field: Field, value: FieldValue | undefined): string {
  if (value === undefined || value === null) return ''
  if (field.type === 'boolean') return value ? 'sim' : 'não'
  if (field.type === 'enum') {
    return field.options?.find((o) => o.id === value)?.label ?? String(value)
  }
  if (field.type === 'number') return String(value).replace('.', ',')
  return String(value)
}

interface Row {
  field: Field
  suggested: string
  design: string
  measured: string
}

function build(input: ExportInput) {
  const design = new Map<string, FieldValue>()
  const measured = new Map<string, FieldValue>()
  for (const v of input.values) {
    if (!fieldById(v.fieldId)) continue
    ;(v.kind === 'measured' ? measured : design).set(v.fieldId, v.value)
  }
  const sug = new Map((input.suggestions ?? []).map((s) => [s.fieldId, s.value]))
  const waived = new Map((input.waivers ?? []).map((w) => [w.sectionId, w.reason ?? null]))

  const rows: Row[] = FIELDS.map((field) => ({
    field,
    suggested: labelOf(field, sug.get(field.id)),
    design: labelOf(field, design.get(field.id)),
    measured: labelOf(field, measured.get(field.id)),
  }))

  return {
    rows,
    waived,
    hasSuggested: rows.some((r) => r.suggested !== ''),
    hasMeasured: rows.some((r) => r.measured !== ''),
    progress: computeProgress(
      input.values,
      [...waived.keys()].map((k) => k),
    ),
  }
}

function unitOf(field: Field): string {
  return field.unit ?? ''
}

export function exportMarkdown(input: ExportInput): string {
  const { rows, waived, hasSuggested, hasMeasured, progress } = build(input)
  const out: string[] = []
  out.push(`# Ficha do protótipo — ${input.projectName}`, '')
  out.push(
    `Catálogo v${input.catalogVersion} · ficha ${progress.pct}% ` +
      `(${progress.filled} de ${progress.total} campos` +
      (progress.waivedSections ? `, ${progress.waivedSections} seção(ões) não se aplicam` : '') +
      ')',
    '',
  )

  const head = ['Campo', 'Unidade']
  if (hasSuggested) head.push('Sugerido')
  head.push('Projetado')
  if (hasMeasured) head.push('Medido')

  for (const section of SECTIONS) {
    const dispensada = waived.has(section.id)
    out.push(`## ${section.label}${dispensada ? ' — não se aplica' : ''}`)
    if (dispensada) {
      const motivo = waived.get(section.id)
      out.push('', motivo ? `Motivo: ${motivo}` : 'Sem motivo registrado.', '')
      continue
    }
    out.push('')
    out.push(`| ${head.join(' | ')} |`)
    out.push(`| ${head.map(() => '---').join(' | ')} |`)
    for (const row of rows.filter((r) => r.field.section === section.id)) {
      const cells = [row.field.label, unitOf(row.field)]
      if (hasSuggested) cells.push(row.suggested || '—')
      cells.push(row.design || '—')
      if (hasMeasured) cells.push(row.measured || '—')
      out.push(`| ${cells.join(' | ')} |`)
    }
    out.push('')
  }
  return out.join('\n')
}

function csvCell(v: string): string {
  return /[",\n;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

export function exportCsv(input: ExportInput): string {
  const { rows, waived, hasSuggested, hasMeasured } = build(input)
  const head = ['secao', 'campo', 'unidade']
  if (hasSuggested) head.push('sugerido')
  head.push('projetado')
  if (hasMeasured) head.push('medido')

  const lines = [head.join(',')]
  for (const section of SECTIONS) {
    if (waived.has(section.id)) continue
    for (const row of rows.filter((r) => r.field.section === section.id)) {
      const cells = [section.label, row.field.label, unitOf(row.field)]
      if (hasSuggested) cells.push(row.suggested)
      cells.push(row.design)
      if (hasMeasured) cells.push(row.measured)
      lines.push(cells.map(csvCell).join(','))
    }
  }
  return lines.join('\n')
}
