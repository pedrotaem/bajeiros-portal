import type { Cage, Member } from './types'
import { PRIMARY_TYPES } from './types'
import { materialOf, sectionArea } from './materials'
import { sanitizeContinuity } from './continuity'
import { totalWeldLength } from './joints'
import { dist } from '../rules/geometry'

/**
 * Estimativa de massa da gaiola (DF-2 v1).
 * Pura, síncrona e tolerante a modelo parcial, como o motor de regras.
 * v1: junta soldada = nó compartilhado; nó de grau g conta (g − 1) juntas.
 */
export interface MassReport {
  totalKg: number
  primaryKg: number
  secondaryKg: number
  weldKg: number
  jointCount: number
  perMember: Record<string, number> // g por membro
}

export const DEFAULT_WELD_PER_JOINT_G = 30

export function weldPerJointG(cage: Cage): number {
  return cage.weightParams?.weldPerJointG ?? DEFAULT_WELD_PER_JOINT_G
}

function memberMassG(cage: Cage, m: Member): number {
  const a = cage.nodes[m.a]
  const b = cage.nodes[m.b]
  if (!a || !b) return 0
  const section = PRIMARY_TYPES.includes(m.type) ? cage.primarySection : cage.secondarySection
  const volMm3 = dist(a, b) * sectionArea(section)
  // mm³ × kg/m³ → g:  vol[m³] = mm³/1e9;  kg = vol × ρ;  g = kg × 1000
  return (volMm3 * materialOf(section).densityKgM3) / 1e6
}

export function countJoints(cage: Cage): number {
  const degree = new Map<string, number>()
  for (const m of cage.members) {
    if (!cage.nodes[m.a] || !cage.nodes[m.b]) continue
    degree.set(m.a, (degree.get(m.a) ?? 0) + 1)
    degree.set(m.b, (degree.get(m.b) ?? 0) + 1)
  }
  // DF-6 (DF-2 v2): passagem contínua não é junta de topo — desconta 1 solda no nó
  const passages = new Map<string, number>()
  for (const c of sanitizeContinuity(cage)) {
    passages.set(c.node, (passages.get(c.node) ?? 0) + 1)
  }
  let joints = 0
  for (const [node, g] of degree) {
    if (g >= 2) joints += g - 1 - (passages.get(node) ?? 0)
  }
  return joints
}

export function estimateMass(cage: Cage): MassReport {
  const perMember: Record<string, number> = {}
  let primaryG = 0
  let secondaryG = 0
  for (const m of cage.members) {
    const g = memberMassG(cage, m)
    perMember[m.id] = g
    if (PRIMARY_TYPES.includes(m.type)) primaryG += g
    else secondaryG += g
  }
  const jointCount = countJoints(cage)
  // DF-2 v2 (DF-7): com g/mm definido, a massa de solda usa o cordão real detectado
  const perMm = cage.weightParams?.weldPerMmG
  const weldG = perMm != null ? totalWeldLength(cage) * perMm : jointCount * weldPerJointG(cage)
  return {
    totalKg: (primaryG + secondaryG + weldG) / 1000,
    primaryKg: primaryG / 1000,
    secondaryKg: secondaryG / 1000,
    weldKg: weldG / 1000,
    jointCount,
    perMember,
  }
}

/**
 * Economia de massa (g) ao remover totalmente o membro:
 * tubo + juntas que deixam de existir (FR-DF2.4).
 */
export function removalMassDelta(cage: Cage, memberId: string, report?: MassReport): number {
  const base = report ?? estimateMass(cage)
  const tube = base.perMember[memberId] ?? 0
  const sub: Cage = { ...cage, members: cage.members.filter((m) => m.id !== memberId) }
  const joints = base.jointCount - countJoints(sub)
  return tube + joints * weldPerJointG(cage)
}
