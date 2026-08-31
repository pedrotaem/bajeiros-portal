import { FIELDS, SECTIONS, fieldById } from './catalog'
import type {
  Delta,
  Divergence,
  Progress,
  SectionId,
  SectionProgress,
  StoredValue,
  Suggestion,
} from './types'

// Progresso e divergências da ficha (DF-21 E3).
//
// RF-3.2 — o denominador é **todo campo preenchível**, que são todos os campos do
// catálogo: não existe campo somente leitura (§3.2). Sugestão não aceita NÃO conta
// como preenchida; enquanto ninguém digitar ou aceitar, o campo está vazio. Só saem
// do denominador as seções dispensadas (RF-5.1), e a contagem de dispensas anda
// junto do total, para "62% de 9 seções (2 não se aplicam)" (RF-5.2).
//
// RF-3.3 — divergência é computada aqui, na leitura, e nunca guardada. Ela não tem
// cor de status: não é conformidade, é informação (§3.3).

function pctOf(filled: number, total: number): number {
  return total === 0 ? 100 : Math.round((filled / total) * 100)
}

/** Um campo conta como preenchido quando tem QUALQUER valor — projetado ou medido. */
function filledIds(values: readonly StoredValue[]): Set<string> {
  const out = new Set<string>()
  for (const v of values) {
    if (v.value === null || v.value === undefined) continue
    if (fieldById(v.fieldId)) out.add(v.fieldId)
  }
  return out
}

export function computeProgress(
  values: readonly StoredValue[],
  waived: readonly SectionId[] = [],
): Progress {
  const preenchidos = filledIds(values)
  const dispensadas = new Set(waived)

  const sections: SectionProgress[] = SECTIONS.map((s) => {
    const campos = FIELDS.filter((f) => f.section === s.id)
    const filled = campos.filter((f) => preenchidos.has(f.id)).length
    return {
      sectionId: s.id,
      filled,
      total: campos.length,
      pct: pctOf(filled, campos.length),
      waived: dispensadas.has(s.id),
    }
  })

  const contam = sections.filter((s) => !s.waived)
  const filled = contam.reduce((n, s) => n + s.filled, 0)
  const total = contam.reduce((n, s) => n + s.total, 0)

  return {
    filled,
    total,
    pct: pctOf(filled, total),
    sections,
    waivedSections: sections.filter((s) => s.waived).length,
  }
}

function delta(ref: unknown, other: unknown): Delta | undefined {
  if (typeof ref !== 'number' || typeof other !== 'number') return undefined
  if (!Number.isFinite(ref) || !Number.isFinite(other)) return undefined
  const abs = Math.round((other - ref) * 1000) / 1000
  // diferença zero não é divergência: exibi-la ("sugerido → projetado 0 (0%)") é ruído
  // do mesmo tipo que a linha de sugestão repetindo o valor já digitado (§8)
  if (abs === 0) return undefined
  return { abs, pct: ref === 0 ? null : Math.round((abs / ref) * 1000) / 10 }
}

/**
 * As três leituras do §3.3, quando os valores existem:
 * sugerido × projetado (o modelo representa o que se decidiu?),
 * projetado × medido (o as-built) e sugerido × medido (o desvio do processo inteiro).
 */
export function computeDivergences(
  values: readonly StoredValue[],
  suggestions: readonly Suggestion[] = [],
): Divergence[] {
  const design = new Map<string, StoredValue['value']>()
  const measured = new Map<string, StoredValue['value']>()
  for (const v of values) {
    ;(v.kind === 'measured' ? measured : design).set(v.fieldId, v.value)
  }
  const sug = new Map(suggestions.map((s) => [s.fieldId, s.value]))

  const out: Divergence[] = []
  for (const f of FIELDS) {
    if (f.type !== 'number') continue
    const d: Divergence = { fieldId: f.id }
    const sv = sug.get(f.id)
    const dv = design.get(f.id)
    const mv = measured.get(f.id)
    const a = delta(sv, dv)
    const b = delta(dv, mv)
    const c = delta(sv, mv)
    if (a) d.suggestedVsDesign = a
    if (b) d.designVsMeasured = b
    if (c) d.suggestedVsMeasured = c
    if (a || b || c) out.push(d)
  }
  return out
}
