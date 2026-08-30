import { CATALOG } from './catalog'
import type { Criterion } from './types'

/**
 * Mapa `criterion_id → destino` (DF-16 RF-1.2): o CTA de um passo tem que cair no
 * lugar onde a coisa se resolve, senão a fila vira lista de lamentos. Vive junto do
 * catálogo de propósito — critério novo sem destino é erro de teste, não surpresa na tela.
 */
export type StepDestination =
  | { page: 'editor' } // abre o validador com o projeto da temporada
  | { page: 'equipe'; tab: 'evolucao' } // painel de critérios (declarar)
  | { page: 'equipe'; tab: 'conhecimento' } // diário, guias, kits
  | { page: 'equipe'; tab: 'pessoas' } // organograma, cargos, entradas
  | { page: 'equipe'; tab: 'projetos' } // designar o projeto da temporada

/**
 * Passo especial de bootstrap (DF-13 P-4.1): sem projeto da temporada designado, os
 * critérios do validador ficam todos insatisfeitos sem que a equipe entenda por quê.
 * Ele mora na MESMA fila dos passos de critério, então o id precisa ter destino
 * aqui — senão o CTA cairia no painel genérico, que não resolve nada.
 */
const DESIGNATE_PROJECT_ID = '__designar-projeto'

const EDITOR = new Set(['EST-1.1', 'EST-2.1', 'EST-3.1', 'DIN-2.1', 'DIN-2.2', 'FAB-2.1'])
const PESSOAS = new Set(['GES-1.1', 'GES-2.1', 'DIN-1.1'])
const CONHECIMENTO = new Set([
  'FAB-3.1',
  'CON-1.1',
  'CON-2.1',
  'CON-2.2',
  'CON-3.1',
  'CON-3.2',
  'CON-4.1',
  'CON-4.2',
])

export function destinationFor(criterionId: string): StepDestination {
  if (criterionId === DESIGNATE_PROJECT_ID) return { page: 'equipe', tab: 'projetos' }
  if (EDITOR.has(criterionId)) return { page: 'editor' }
  if (PESSOAS.has(criterionId)) return { page: 'equipe', tab: 'pessoas' }
  if (CONHECIMENTO.has(criterionId)) return { page: 'equipe', tab: 'conhecimento' }
  // GES-3.1 (temporada) e todos os declarados resolvem no painel de critérios.
  return { page: 'equipe', tab: 'evolucao' }
}

/** Título do passo gerado por um critério pendente (RF-4.1) — ≤ 140 (checado em teste). */
export function stepTitle(criterion: Criterion): string {
  return criterion.label
}

export const DESIGNATE_PROJECT_STEP = {
  criterionId: DESIGNATE_PROJECT_ID,
  title: 'Designar o projeto da temporada',
  destination: { page: 'equipe', tab: 'projetos' } as StepDestination,
}

export const CRITERION_IDS: readonly string[] = CATALOG.map((c) => c.id)
