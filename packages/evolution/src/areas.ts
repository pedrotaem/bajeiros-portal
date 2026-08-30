import type { AreaId, AreaLevel, Level } from './types'

// Strings canônicas do vocabulário de evolução (DF-13 RF-1.3): a UI IMPORTA daqui,
// nunca reescreve. Mesma regra do vocabulário de status do design-system §11.3 —
// mudar um rótulo é editar este módulo, jamais telas.

export const AREA_IDS: readonly AreaId[] = [
  'estrutura',
  'dinamica',
  'documentacao',
  'fabricacao',
  'gestao',
  'conhecimento',
] as const

export const AREA_LABELS: Record<AreaId, string> = {
  estrutura: 'Estrutura & segurança',
  dinamica: 'Dinâmica & powertrain',
  documentacao: 'Documentação & relatórios',
  fabricacao: 'Fabricação & testes',
  gestao: 'Gestão & pessoas',
  conhecimento: 'Conhecimento & continuidade',
}

/** Legenda curta do rail/cards — cabe em uma linha estreita. */
export const AREA_SHORT: Record<AreaId, string> = {
  estrutura: 'Estrutura',
  dinamica: 'Dinâmica',
  documentacao: 'Documentação',
  fabricacao: 'Fabricação',
  gestao: 'Gestão',
  conhecimento: 'Conhecimento',
}

export const LEVEL_NAMES: Record<Level, string> = {
  1: 'Fundação',
  2: 'Prática',
  3: 'Disciplina',
  4: 'Validação',
  5: 'Excelência',
}

export const LEVEL_MEANINGS: Record<Level, string> = {
  1: 'Existe e está registrado no portal',
  2: 'O básico é feito com as ferramentas e registros mínimos',
  3: 'Processo regular, com responsáveis e prazo',
  4: 'Verificado por evidência, revisão ou teste',
  5: 'Melhoria contínua e resiliência geracional',
}

export const MAX_LEVEL = 5 as const

export function isAreaId(v: unknown): v is AreaId {
  return typeof v === 'string' && (AREA_IDS as readonly string[]).includes(v)
}

/** "nível 3 de 5" / "ainda sem nível" — texto SEMPRE acompanha a barra (CT-3, nunca só cor). */
export function levelLabel(level: AreaLevel): string {
  return level === 0 ? 'ainda sem nível' : `nível ${level} de ${MAX_LEVEL}`
}

export function levelName(level: AreaLevel): string {
  return level === 0 ? 'Sem nível' : LEVEL_NAMES[level as Level]
}

/** Média com uma casa decimal e vírgula decimal (pt-BR) — "2,2". */
export function formatAverage(average: number): string {
  return average.toFixed(1).replace('.', ',')
}
