// Tipos do motor de maturidade (DF-13). Puro: nada aqui conhece banco, HTTP ou React.

export type AreaId =
  'estrutura' | 'dinamica' | 'documentacao' | 'fabricacao' | 'gestao' | 'conhecimento'

/** 1 Fundação · 2 Prática · 3 Disciplina · 4 Validação · 5 Excelência (DF-13 §3.2). */
export type Level = 1 | 2 | 3 | 4 | 5

/** 0 = nem o nível 1 fechou (a área ainda não tem fundação). */
export type AreaLevel = 0 | Level

/**
 * `auto` — satisfeito por evidência do servidor · `declarado` — marcado pela capitania ·
 * `oculto` — a fonte ainda não existe no produto; fica FORA do denominador (DF-13 §3.3).
 */
export type CriterionType = 'auto' | 'declarado' | 'oculto'

export interface Criterion {
  id: string
  area: AreaId
  level: Level
  type: CriterionType
  /** Texto exibido na UI — cânone único, não reescrever na tela. */
  label: string
  /** De onde vem a evidência (ou quem declara). Aparece como legenda do critério. */
  source: string
  /** Prática/dificuldade de origem na pesquisa de mercado (governança §9). */
  research: string
  /** Só para `declarado`: sugere link (a UI usa como dica; nunca obriga). */
  linkHint?: LinkKind
}

export type LinkKind = 'decision' | 'guide' | 'project' | 'url'

// ---------- entradas do cálculo ----------

/**
 * Evidência bruta, como sai da tabela append-only `evolution_evidence`.
 * `payload` é jsonb — o motor lê com guardas, nunca confia no formato.
 */
export interface Evidence {
  kind: EvidenceKind
  payload: Record<string, unknown>
  createdAt: Date
}

export type EvidenceKind =
  | 'validation.summary' // projects: último snapshot salvo do projeto da temporada
  | 'org.summary' // teams (DF-10): estado do organograma/capitania
  | 'knowledge.summary' // knowledge (DF-14): estado vivo de decisões e guias
  | 'season.configured' // evolution: temporada com marcos
  | 'template.generated' // web → api: gabarito de corte baixado
  | 'decision.created' // DF-14 (evento — janela temporal de CON-3.2)
  | 'guide.published' // DF-14 (evento — narrativa da atividade)
  | 'trail.completed' // DF-14 (evento — {userId})
  | 'kit.opened' // DF-14 (evento — {kitId, dueDate})
  | 'kit.completed' // DF-14 (evento — {kitId})
  | 'criterion.declared' // evolution (evento — narrativa)
  | 'level.changed' // evolution (evento — narrativa)
  | 'competition.result' // community (DF-15) — contexto; NÃO afeta nível (ADR-010)

export interface Declaration {
  criterionId: string
  declaredAt: Date
}

export interface ComputeInput {
  evidences: readonly Evidence[]
  declarations: readonly Declaration[]
  /** Injetado: CON-3.2/4.1/4.2 têm janela temporal — sem isto o motor não é determinístico. */
  now: Date
}

// ---------- saída do cálculo ----------

export interface CriterionState {
  id: string
  area: AreaId
  level: Level
  type: CriterionType
  label: string
  source: string
  satisfied: boolean
  /** Por que está (ou não está) satisfeito — texto curto para a UI e para o teste. */
  reason: string
  linkHint?: LinkKind
}

export interface AreaResult {
  area: AreaId
  level: AreaLevel
  /** Critérios do próximo nível ainda pendentes (viram passos da fila — RF-4.1). */
  pending: CriterionState[]
  /** Todos os critérios visíveis da área (oculto fica de fora). */
  criteria: CriterionState[]
}

export interface EvolutionResult {
  catalogVersion: string
  areas: AreaResult[]
  /** Média aritmética das 6 áreas, uma casa decimal (DF-13 §3.2). */
  average: number
  levels: Record<AreaId, AreaLevel>
}
