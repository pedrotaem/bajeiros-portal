import type { Evidence, EvidenceKind } from './types'

// Formato dos payloads de evidência. Os produtores (API) IMPORTAM estes tipos:
// é o único jeito de o motor e quem grava não divergirem em silêncio.
//
// Regra de ouro do DF-13 §3.3: o que é crítico é computado no servidor. Nenhum
// payload aqui é aceito do cliente — `template.generated` é a única exceção
// declarada (ato do usuário, sem consequência de segurança).

/** Produtor `projects`: resumo do último snapshot salvo do projeto da temporada. */
export interface ValidationSummary {
  projectId: string
  snapshotSeq: number
  counts: { pass: number; fail: number; warn: number; manual: number }
  /** Quantas falhas são de PRESENÇA (elemento ausente) — subconjunto de counts.fail. */
  presence: number
  massKg: number | null
  failedRuleIds: string[]
  manualRuleIds: string[]
}

/** Produtor `teams` (DF-10): estado do organograma e da capitania. */
export interface OrgSummary {
  members: number
  owners: number
  admins: number
  trainees: number
  positions: number
  /** Cargos `lead` do organograma e quantos têm ocupante. */
  leads: number
  leadsFilled: number
  /**
   * Nomes dos cargos de liderança SEM ocupante. O DF-20 precisa saber QUAL cargo
   * está vago para contradizer o DIN-1.1 ("responsáveis por suspensão/direção e trem
   * de força"): uma contagem agregada diria só que falta alguém, em algum lugar.
   */
  unfilledLeads: string[]
  /** Último membro aprovado (entrada confirmada) — base de CON-3.1. */
  lastApprovedUserId: string | null
}

/**
 * Produtor `datasheet` (DF-21): a ficha do protótipo da temporada. Existe porque o
 * `EST-1.1` tem DOIS caminhos que valem igual — gaiola modelada OU ficha com
 * conteúdo (DF-19 §5.1) —, e sem este resumo o portal só enxergaria um deles.
 */
export interface DatasheetSummary {
  projectId: string
  /** Campos preenchidos (qualquer seção, projetado ou medido). */
  filled: number
  sections: number
}

/**
 * Produtor `knowledge` (DF-14): estado VIVO (pós soft delete) de decisões e guias.
 * Adição de implementação sobre o DF-13 §RF-2.1, pelo mesmo motivo de `org.summary`:
 * contar eventos `decision.created` contaria também o que foi excluído. Os eventos
 * continuam sendo gravados — eles alimentam a atividade e a janela de CON-3.2.
 */
export interface KnowledgeSummary {
  decisions: number
  guides: number
  guidesByKind: { guia: number; trilha: number; checklist: number }
  guidesWithoutOwner: number
  /** ISO do guia vivo mais antigo em `updated_at` — CON-4.2 mede contra `now`. */
  oldestGuideUpdatedAt: string | null
  /** União das etiquetas dos guias vivos (FAB-3.1 procura "solda"). */
  guideTags: string[]
}

/** Produtor `evolution`: temporada configurada. */
export interface SeasonConfigured {
  label: string
  milestones: number
  seasonProjectId: string | null
}

export interface DecisionCreated {
  area: string
}

export interface GuidePublished {
  kind: string
  tags?: string[]
}

export interface TrailCompleted {
  userId: string
}

export interface KitOpened {
  kitId: string
  dueDate: string | null
}

export interface KitCompleted {
  kitId: string
}

// ---------- leitura defensiva (payload vem de jsonb) ----------

export function latest(evidences: readonly Evidence[], kind: EvidenceKind): Evidence | undefined {
  let found: Evidence | undefined
  for (const e of evidences) {
    if (e.kind !== kind) continue
    if (!found || e.createdAt.getTime() >= found.createdAt.getTime()) found = e
  }
  return found
}

export function ofKind(evidences: readonly Evidence[], kind: EvidenceKind): Evidence[] {
  return evidences.filter((e) => e.kind === kind)
}

export function num(payload: Record<string, unknown>, key: string): number | null {
  const v = payload[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

export function str(payload: Record<string, unknown>, key: string): string | null {
  const v = payload[key]
  return typeof v === 'string' ? v : null
}

export function strList(payload: Record<string, unknown>, key: string): string[] {
  const v = payload[key]
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

export function obj(payload: Record<string, unknown>, key: string): Record<string, unknown> {
  const v = payload[key]
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}
