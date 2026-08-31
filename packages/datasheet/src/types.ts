// Tipos da ficha do protótipo (DF-21). Puro: nada aqui conhece banco, HTTP ou React.
//
// O princípio que restringe o pacote inteiro (DF-21 §3.2): o validador 3D é MEIO,
// não porta de entrada. Por isso não existe tipo "derivado" e nenhum campo tem
// atributo de somente leitura — `suggest` diz apenas que o portal sabe calcular um
// palpite para aquele campo, e nada mais.

export type SectionId =
  | 'identificacao'
  | 'dimensoes'
  | 'chassi'
  | 'suspensao'
  | 'direcao'
  | 'freios'
  | 'trem-forca'
  | 'eletrica'
  | 'ergonomia'

export type FieldType = 'number' | 'enum' | 'boolean' | 'text' | 'longtext' | 'date' | 'link'

/**
 * `design` — o que a equipe assume como projeto · `measured` — o que saiu da oficina,
 * na balança ou na trena. A terceira coluna (sugerido) NÃO é guardada: é computada na
 * leitura a partir do último modelo 3D salvo (DF-21 §3.3).
 */
export type ValueKind = 'design' | 'measured'

export const VALUE_KINDS: readonly ValueKind[] = ['design', 'measured']

export type FieldValue = number | string | boolean

export interface FieldOption {
  id: string
  label: string
}

export interface Range {
  min: number
  max: number
}

/** Cálculos que o portal sabe fazer a partir do modelo 3D (DF-21 §5, seis campos). */
export type SuggestId =
  | 'cageMassKg'
  | 'tubeLengthMm'
  | 'tubeCount'
  | 'primarySection'
  | 'secondarySection'
  | 'helmetClearanceMm'

export interface Field {
  id: string
  section: SectionId
  /** Cânone único do rótulo — nenhuma tela reescreve texto de campo (RF-1.2). */
  label: string
  type: FieldType
  /** Unidade fixa do catálogo; a tela mostra à direita da entrada, nunca só no rótulo (§8). */
  unit?: string
  /** Faixa ABSOLUTA: fora dela o valor não pode estar certo — a borda recusa (RF-4.2). */
  absolute?: Range
  /** Faixa TÍPICA: fora dela avisa e salva assim mesmo (RF-4.1). */
  typical?: Range
  options?: readonly FieldOption[]
  /** Para que serve o campo. Texto canônico, exibido como ajuda (RF-1.2). */
  help: string
  /** Tem coluna de medido: projetado × medido é o as-built (§3.3). */
  dual?: boolean
  /** O portal sabe sugerir a partir do modelo 3D — e o campo continua editável à mão (§3.2). */
  suggest?: SuggestId
  /** Entra nas medianas por classe da comunidade (RF-6.4). */
  comparable?: boolean
  /** Teto de caracteres para `text`/`longtext`/`link`; default por tipo em `maxLengthOf`. */
  maxLength?: number
}

export interface Section {
  id: SectionId
  label: string
  /** Cada seção abre dizendo para que serve — a defesa contra "formulário de burocracia" (P-1.2). */
  purpose: string
}

// ---------- valores guardados ----------

export interface StoredValue {
  fieldId: string
  kind: ValueKind
  value: FieldValue
  updatedBy?: string | null
  updatedAt?: string | null
}

/** Origem da revisão: aceitar uma sugestão é escrita normal, só anotada (RF-2.7). */
export type WriteSource = 'manual' | 'suggestion'

export interface SectionWaiver {
  sectionId: SectionId
  reason?: string | null
}

// ---------- saídas computadas ----------

export interface Suggestion {
  fieldId: string
  value: FieldValue
  /** De onde veio o palpite, para a linha "modelo 3D · v14: 26,4 kg — usar" (§8). */
  origin: string
}

/** Diferença entre duas das três colunas; computada na leitura, nunca guardada (RF-3.3). */
export interface Delta {
  abs: number
  /** Percentual sobre a referência (a primeira coluna do par). `null` se a referência é 0. */
  pct: number | null
}

export interface Divergence {
  fieldId: string
  suggestedVsDesign?: Delta
  designVsMeasured?: Delta
  suggestedVsMeasured?: Delta
}

export interface SectionProgress {
  sectionId: SectionId
  filled: number
  total: number
  /** Inteiro 0–100. */
  pct: number
  waived: boolean
}

export interface Progress {
  filled: number
  total: number
  pct: number
  sections: SectionProgress[]
  /** Quantas seções saíram do denominador — o total sempre mostra a contagem (RF-5.2). */
  waivedSections: number
}
