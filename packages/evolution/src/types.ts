// Tipos do motor de maturidade (DF-13/DF-19/DF-20) e das patentes (DF-18).
// Puro: nada aqui conhece banco, HTTP ou React.

export type AreaId =
  'estrutura' | 'dinamica' | 'documentacao' | 'fabricacao' | 'gestao' | 'conhecimento'

/** 1 Fundação · 2 Prática · 3 Disciplina · 4 Validação · 5 Excelência (DF-13 §3.2). */
export type Level = 1 | 2 | 3 | 4 | 5

/** 0 = nem o nível 1 fechou (a área ainda não tem fundação). */
export type AreaLevel = 0 | Level

/**
 * `auto` — o portal TAMBÉM mede este critério · `declarado` — só a equipe sabe.
 *
 * DF-19 RF-1.2: o campo não decide mais o cálculo, decide o RÓTULO da tela. Quem
 * decide o cálculo é `CATALOG_MODE`. O tipo `oculto` do v1.0.0 morreu na v2.0.0
 * (RF-1.4): os dois critérios que o usavam viraram afirmação sobre o mundo real e
 * entraram no denominador, que agora é 51 visíveis.
 */
export type CriterionType = 'auto' | 'declarado'

/**
 * DF-19 RF-1.1 / DF-20 RF-1.5 — o mesmo dado, dois cálculos:
 *  - `declarado`: a declaração da capitania satisfaz o critério, ponto;
 *  - `aferido`:   a declaração vale até uma contraprova disparar (DF-20 §2).
 * Alternar NÃO exige migração (AC-DF19.10) — é só outro caminho no motor.
 */
export type CatalogMode = 'declarado' | 'aferido'

/** Onda da aferição do DF-20 em que este critério ganha contraprova. */
export type AuditWave = 'V1' | 'V2' | 'V3' | null

export interface Criterion {
  id: string
  area: AreaId
  level: Level
  type: CriterionType
  /** Linha curta: título de passo da fila e rótulo de lista (≤ 140). */
  label: string
  /** De onde vem a evidência (ou quem declara). Aparece como legenda do critério. */
  source: string
  /** Prática/dificuldade de origem na pesquisa de mercado (governança §9). */
  research: string
  /** DF-19 §3 — o enunciado exato que a capitania responde, fechado em sim/não. */
  question: string
  /** DF-19 §3 — a régua: um fato verificável, nunca uma intenção. */
  fulfilled: string
  /** DF-19 §3 — o contra-exemplo que desarma a leitura generosa. */
  notValid: string
  /** DF-19 §3 — o artefato do portal (ou externo) que sustenta a resposta. */
  where: string
  /** DF-19 §3 — qual dado confronta esta declaração, e em qual onda do DF-20. */
  audit: { wave: AuditWave; note: string }
  /** DF-19 RF-4.4 — expira na virada de temporada e precisa ser reafirmado. */
  seasonal?: boolean
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
  | 'datasheet.summary' // datasheet (DF-21): ficha do projeto da temporada
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
  | 'rank.changed' // evolution (DF-18 RF-4.3 — promoção e queda de patente)
  | 'counter.raised' // evolution (DF-20 RF-2.2 — contraprova disparou)
  | 'counter.cleared' // evolution (DF-20 RF-2.2 — contraprova cessou)
  | 'competition.result' // community (DF-15) — contexto; NÃO afeta nível (ADR-010)

export interface Declaration {
  criterionId: string
  declaredAt: Date
  /**
   * DF-19 RF-4.4 — a temporada em que a resposta foi dada. Critério sazonal só
   * conta enquanto o rótulo bate com o da temporada vigente. `null` é declaração
   * anterior a esta regra: conta, porque expirar retroativamente seria punir a
   * equipe por uma mudança de catálogo.
   */
  seasonLabel?: string | null
  /** DF-20 RF-3.3 — indício respondido com justificativa; volta a contar. */
  reaffirmedAt?: Date | null
  /** Só há indício por temporada: reafirmação de outra temporada não vale (§3.3). */
  reaffirmedSeason?: string | null
  /** DF-19 §5.4 — FAB-2.1: gabarito externo entra como link na declaração. */
  hasLink?: boolean
}

/** Base de comparação da comunidade (DF-20 §2.2) — só entra com o piso batido. */
export interface CommunityInput {
  /** Mediana de massa da gaiola entre protótipos da MESMA classe (§8.1/DF-21 §5.1). */
  massMedianKg: number | null
  /** Quantos protótipos entraram na mediana — piso de 8 (P-1.3). */
  massProjects: number
  /** "biplace/4x4" — sem classe declarada não há comparação honesta. */
  classLabel: string | null
}

export interface ComputeInput {
  evidences: readonly Evidence[]
  declarations: readonly Declaration[]
  /** Injetado: CON-3.2/4.1/4.2 têm janela temporal — sem isto o motor não é determinístico. */
  now: Date
  /** Default: `CATALOG_MODE` do catálogo. Explícito só em teste e no gate do DF-20. */
  mode?: CatalogMode
  /** Rótulo da temporada vigente — régua da validade sazonal (RF-4.4). */
  seasonLabel?: string | null
  community?: CommunityInput
}

// ---------- contraprova (DF-20) ----------

/**
 * DF-20 §2 — a força da inferência decide o efeito:
 *  - `contradiction`: o portal mede o MESMO fato que o critério afirma → derruba;
 *  - `indication`: o portal mede algo correlacionado → suspende e PERGUNTA.
 */
export type CounterKind = 'contradiction' | 'indication'

export interface CounterCheckResult {
  kind: CounterKind
  /** Canônica no pacote (RF-1.2): a tela não reescreve. */
  message: string
  /** O valor medido, em texto — é o que deixa a equipe conferir a acusação (P-1.1). */
  measured: string
}

/** DF-20 §3 — `revogada` é a ausência de declaração; não existe como linha. */
export type DeclarationState = 'vigente' | 'em-contraprova' | 'reafirmada' | 'revogada'

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
  /** DF-20 §3 — `null` quando a equipe não respondeu. */
  state: DeclarationState
  /**
   * DF-19 RF-1.3 — o que o portal mede, quando mede. Aparece ao lado da resposta,
   * sem veredito: na v1 ele NÃO muda o nível.
   */
  measured: { satisfied: boolean; reason: string } | null
  /** Declarado + medida discordando. É o conjunto que calibra o DF-20 (RF-1.3). */
  divergent: boolean
  /** Preenchido só em `mode: 'aferido'` (DF-20 RF-4.1). */
  counterCheck: CounterCheckResult | null
  /**
   * DF-20 §2.0 — existe contraprova desenhada para este critério, mas o dado para
   * compará-la não existe. Ausência de dado NUNCA é contraprova: a tela diz "sem
   * como conferir aqui" e a declaração fica vigente (AC-DF20.11/12).
   */
  notComparable: string | null
  /** DF-20 RF-3.2 — só indício aceita reafirmação. */
  reaffirmable: boolean
  /** RF-4.4 — declarado numa temporada que já virou. */
  expired: boolean
  seasonal: boolean
  linkHint?: LinkKind
}

export interface AreaResult {
  area: AreaId
  level: AreaLevel
  /** Critérios do próximo nível ainda pendentes (viram passos da fila — RF-4.1). */
  pending: CriterionState[]
  /** Todos os critérios da área (na v2.0.0 não há mais critério fora do denominador). */
  criteria: CriterionState[]
}

/** DF-20 §2.3 — sem lastro nenhum, um aviso, não vinte (RF-1.3). */
export interface ActivityFloor {
  message: string
  measured: string
}

export interface EvolutionResult {
  catalogVersion: string
  mode: CatalogMode
  areas: AreaResult[]
  /** Média aritmética das 6 áreas, uma casa decimal (DF-13 §3.2). */
  average: number
  /** Menor nível entre as 6 áreas — a trava que impede a patente torta (DF-18 §3.4). */
  floor: AreaLevel
  levels: Record<AreaId, AreaLevel>
  /** Só em `aferido`, e só quando dispara: substitui a tela inteira (DF-20 RF-4.3). */
  activityFloor: ActivityFloor | null
  /** Critérios sazonais que vencem com a virada — a tela avisa antes (RF-4.4). */
  expiring: string[]
}

// ---------- patentes (DF-18) ----------

export type RankNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8

/** Trava 2 da escada (DF-18 §3.4) — o que o resultado oficial precisa mostrar. */
export type CompetitionLock = 'participou' | 'enduro' | 'mediana' | 'podio'

export interface RankDef {
  n: RankNumber
  id: string
  /** Nome da arte (§3.3). "PEACEMAKER" é a grafia da obra — não "Piecemaker". */
  nome: string
  /** Reserva livre de marca (§3.3 / RF-8.3): troca sem tocar no motor. */
  nomeLivre: string
  leitura: string
  mediaMin: number
  pisoMin: number
  competicao: CompetitionLock | null
  /** Arquivo do emblema em `public/patentes/` (RF-8.2 — fora do design system). */
  emblema: string
}

/**
 * Recorte do acervo do DF-15 para a equipe VINCULADA. Tudo aqui é público; nada
 * disto afeta o NÍVEL das áreas (ADR-010 dec. 4 sobrevive — RF-3.5).
 */
export interface CompetitionInput {
  /** Sem vínculo aprovado, a trava 2 é falsa da patente 4 para cima (RF-3.1). */
  linked: boolean
  /** Temporadas com participação — a régua é a temporada, não a data (RF-3.2). */
  seasons: number[]
  /** Temporada de referência (a mais recente conhecida do acervo). */
  currentSeason: number | null
  /** Pontuação de enduro na participação mais recente (RF-3.3). */
  enduroPoints: number | null
  /** A prova de enduro existe na edição? Ausente ⇒ `prova-ausente`, nunca falso negativo. */
  enduroPresent: boolean
  pointsTotal: number | null
  /** Mediana usada na trava da patente 2 e a régua declarada na tela (RF-3.4). */
  median: number | null
  medianSource: 'coorte' | 'geral' | null
  medianTeams: number
  position: number | null
  /** Tamanho da geral da competição — base dos 10% superiores da patente 1. */
  fieldSize: number | null
}

export type RankBlock =
  'sem-avaliacao' | 'sem-prototipo' | 'sem-vinculo' | 'prova-ausente' | 'maturidade' | 'competicao'

export interface RankInput {
  optIn: boolean
  seasonProjectId: string | null
  levels: Record<AreaId, AreaLevel>
  competition: CompetitionInput
}

export interface RankStep {
  /** `maturidade` = critérios; `competicao` = resultado oficial. */
  kind: 'maturidade' | 'competicao'
  text: string
}

export interface RankResult {
  rank: RankNumber | null
  /** Preenchido só quando não há patente nenhuma. */
  reason: 'sem-avaliacao' | 'sem-prototipo' | null
  average: number
  floor: AreaLevel
  /** A próxima patente e o que falta — separando maturidade de competição (RF-1.5). */
  next: {
    n: RankNumber
    maturity: RankStep[]
    competition: RankStep | null
    block: RankBlock
  } | null
}
