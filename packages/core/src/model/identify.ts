import type { Cage, Member, MemberType, NodeId } from './types'
import { NAMED_POINTS, isNamedNode } from './types'

// DF-31 — re-identificação dos pontos denominados pela TOPOLOGIA. O regulamento define cada
// ponto pelo encontro de membros (A = pé do RRH com a travessa ALC / o LFS; C = onde o RHO
// encontra o FBM; D = a dobra do FBM…). Um nó criado no editor nasce com id genérico (N7) e
// as regras que leem `p('CL')` ou `has('DL')` não o enxergam. Este módulo propõe o id do
// regulamento para os nós genéricos a partir dos tipos de membro que chegam neles — e nunca
// mexe num nó que já tem letra: id de regulamento é decisão de quem modela.

/**
 * Regra de identificação, em ordem de prioridade: o nó recebe a primeira letra cujos dois
 * conjuntos de tipos estão presentes entre os membros incidentes (e nenhum tipo de `not`).
 * R antes de P porque o vértice traseiro R também junta FAB_UP e FAB_LOW; A antes de P pela
 * mesma razão (o pé do RRH recebe o FAB_LOW).
 */
export interface LetterRule {
  letter: string
  a: readonly MemberType[]
  b: readonly MemberType[]
  not?: readonly MemberType[]
}

export const LETTER_RULES: readonly LetterRule[] = [
  { letter: 'A', a: ['RRH'], b: ['ALC', 'LFS', 'FAB_LOW', 'LFDB'] },
  { letter: 'B', a: ['RRH'], b: ['BLC', 'RHO', 'FAB_UP'] },
  { letter: 'H', a: ['RRH'], b: ['SHC'] },
  { letter: 'S', a: ['RRH'], b: ['SIM', 'FAB_MID'] },
  { letter: 'C', a: ['RHO'], b: ['CLC', 'FBM_UP'] },
  { letter: 'D', a: ['FBM_UP'], b: ['FBM_LOW', 'DLC'] },
  { letter: 'F', a: ['LFS'], b: ['FLC', 'FBM_LOW'] },
  { letter: 'I', a: ['LFS'], b: ['ILC'] },
  { letter: 'R', a: ['RLC'], b: ['FAB_UP', 'FAB_MID', 'FAB_LOW'] },
  { letter: 'P', a: ['FAB_UP'], b: ['FAB_LOW', 'SIM'], not: ['RRH', 'RLC'] },
]

/** Id de regulamento: letra do catálogo + lado. É o que `isNamedNode` reconhece. */
export function regulationId(letter: string, side: 'L' | 'R'): NodeId {
  return `${letter}${side}`
}

/** Letra que a topologia atribui ao nó, ou null. */
export function letterFor(cage: Cage, id: NodeId): string | null {
  const types = new Set<MemberType>()
  for (const m of cage.members) if (m.a === id || m.b === id) types.add(m.type)
  if (!types.size) return null
  for (const r of LETTER_RULES) {
    if (r.not?.some((t) => types.has(t))) continue
    if (r.a.some((t) => types.has(t)) && r.b.some((t) => types.has(t))) return r.letter
  }
  return null
}

export interface Identification {
  /** id atual → id do regulamento, só para nós genéricos com letra inequívoca e vaga livre */
  renames: Record<NodeId, NodeId>
  /** o que a topologia sugeriu mas não foi aplicado, com a razão */
  skipped: { id: NodeId; wanted: NodeId; reason: string }[]
}

/**
 * Propõe ids de regulamento para os nós genéricos. Conservador por construção:
 * - nó que já tem letra do regulamento nunca é tocado;
 * - nó no plano de simetria (|x| < 1 mm) não tem lado, e as letras do B6 têm;
 * - vaga já ocupada por outro nó, ou dois candidatos para a mesma vaga: nenhum é renomeado.
 */
export function identifyNamedPoints(cage: Cage): Identification {
  const renames: Record<NodeId, NodeId> = {}
  const skipped: Identification['skipped'] = []
  const wanted = new Map<NodeId, NodeId[]>() // alvo → candidatos

  for (const id of Object.keys(cage.nodes)) {
    if (isNamedNode(id)) continue
    const letter = letterFor(cage, id)
    if (!letter || !NAMED_POINTS.includes(letter)) continue
    const x = cage.nodes[id].x
    if (Math.abs(x) < 1) {
      skipped.push({ id, wanted: letter, reason: 'no plano de simetria: sem lado L/R' })
      continue
    }
    const target = regulationId(letter, x < 0 ? 'L' : 'R')
    const list = wanted.get(target) ?? []
    list.push(id)
    wanted.set(target, list)
  }

  for (const [target, ids] of wanted) {
    if (ids.length > 1) {
      for (const id of ids)
        skipped.push({ id, wanted: target, reason: `${ids.length} candidatos para ${target}` })
      continue
    }
    if (cage.nodes[target]) {
      skipped.push({ id: ids[0], wanted: target, reason: `${target} já existe` })
      continue
    }
    renames[ids[0]] = target
  }
  return { renames, skipped }
}

/**
 * Aplica os renomes em tudo que referencia id de nó: nós, membros, continuidade, travas e
 * `namedExtra` (um nó que virou letra sai da lista extra — `isNamedNode` já o cobre).
 * Ancoragens, volante e suspensão guardam posição, não id de nó: não mudam.
 */
export function applyRenames(cage: Cage, renames: Record<NodeId, NodeId>): Cage {
  const ids = Object.keys(renames)
  if (!ids.length) return cage
  const map = (id: NodeId) => renames[id] ?? id
  const nodes: Cage['nodes'] = {}
  for (const [id, pos] of Object.entries(cage.nodes)) nodes[map(id)] = pos
  const members: Member[] = cage.members.map((m) => ({ ...m, a: map(m.a), b: map(m.b) }))
  const continuity = cage.continuity?.map((c) => ({ ...c, node: map(c.node) }))
  const locked = cage.locked?.map(map)
  const namedExtra = cage.namedExtra?.map(map).filter((id) => !isNamedNode(id))
  return {
    ...cage,
    nodes,
    members,
    ...(continuity ? { continuity } : {}),
    ...(locked ? { locked } : {}),
    ...(namedExtra ? { namedExtra } : {}),
  }
}
