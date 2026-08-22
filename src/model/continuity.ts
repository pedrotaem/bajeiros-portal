import type { Cage, Continuity, Member, NodeId } from './types'

/**
 * Continuidade de tubos (DF-6): declaração física de que dois membros incidentes
 * a um nó são uma peça única que atravessa o nó (sem solda de topo).
 * Funções puras; nenhum estado derivado é armazenado (design.md §1).
 */

const incident = (cage: Cage, node: NodeId) =>
  cage.members.filter((m) => m.a === node || m.b === node)

/** Entradas válidas: nó existe, ambos os membros existem e incidem no nó; sem duplicatas;
 *  cada membro tem no máximo uma passagem por extremidade. */
export function sanitizeContinuity(cage: Cage): Continuity[] {
  const out: Continuity[] = []
  const usedEnd = new Set<string>() // `${memberId}@${node}`
  for (const c of cage.continuity ?? []) {
    if (!c || !cage.nodes[c.node] || !Array.isArray(c.pair)) continue
    const [i1, i2] = c.pair
    if (i1 === i2) continue
    const inc = incident(cage, c.node)
    const m1 = inc.find((m) => m.id === i1)
    const m2 = inc.find((m) => m.id === i2)
    if (!m1 || !m2) continue
    const k1 = `${i1}@${c.node}`
    const k2 = `${i2}@${c.node}`
    if (usedEnd.has(k1) || usedEnd.has(k2)) continue
    usedEnd.add(k1)
    usedEnd.add(k2)
    out.push({ node: c.node, pair: [i1, i2] })
  }
  return out
}

export function isContinuousAt(cage: Cage, node: NodeId, memberId: string): boolean {
  return (cage.continuity ?? []).some((c) => c.node === node && c.pair.includes(memberId))
}

export function continuityPartner(cage: Cage, node: NodeId, memberId: string): string | null {
  const c = (cage.continuity ?? []).find((x) => x.node === node && x.pair.includes(memberId))
  if (!c) return null
  return c.pair[0] === memberId ? c.pair[1] : c.pair[0]
}

/** Passagens declaradas num nó. */
export function continuityAt(cage: Cage, node: NodeId): Continuity[] {
  return (cage.continuity ?? []).filter((c) => c.node === node)
}

/** Tubos lógicos: componentes conexos dos membros sob a relação de passagem contínua. */
export function physicalChains(cage: Cage): Member[][] {
  const parent = new Map<string, string>()
  const find = (x: string): string => {
    let r = x
    while (parent.get(r) !== r) r = parent.get(r)!
    parent.set(x, r)
    return r
  }
  for (const m of cage.members) parent.set(m.id, m.id)
  for (const c of sanitizeContinuity(cage)) {
    const [a, b] = c.pair
    if (parent.has(a) && parent.has(b)) parent.set(find(a), find(b))
  }
  const groups = new Map<string, Member[]>()
  for (const m of cage.members) {
    const r = find(m.id)
    groups.set(r, [...(groups.get(r) ?? []), m])
  }
  return [...groups.values()]
}

/** Cadeia física à qual o membro pertence (contém sempre o próprio membro). */
export function chainOf(cage: Cage, memberId: string): Member[] {
  return physicalChains(cage).find((ch) => ch.some((m) => m.id === memberId)) ?? []
}

/**
 * Defaults do FR-DF6.2 para gaiolas geradas (template/assistente):
 * - num nó, exatamente 2 membros do MESMO tipo ⇒ passagem contínua (dobra/segmentação);
 * - par RHO + FBM_UP num ponto C ⇒ contínuo (B6.2.7.2: tubo único com curva no C).
 * Não é aplicado retroativamente em import de projetos antigos (conservador).
 */
export function inferContinuity(cage: Cage): Continuity[] {
  const out: Continuity[] = []
  const usedEnd = new Set<string>()
  const claim = (node: NodeId, a: string, b: string) => {
    const ka = `${a}@${node}`
    const kb = `${b}@${node}`
    if (usedEnd.has(ka) || usedEnd.has(kb)) return
    usedEnd.add(ka)
    usedEnd.add(kb)
    out.push({ node, pair: [a, b] })
  }
  for (const node of Object.keys(cage.nodes)) {
    const inc = incident(cage, node)
    const byType = new Map<string, Member[]>()
    for (const m of inc) byType.set(m.type, [...(byType.get(m.type) ?? []), m])
    for (const ms of byType.values()) {
      if (ms.length === 2) claim(node, ms[0].id, ms[1].id)
    }
    const rho = byType.get('RHO') ?? []
    const fbmUp = byType.get('FBM_UP') ?? []
    if (rho.length === 1 && fbmUp.length === 1) claim(node, rho[0].id, fbmUp[0].id)
  }
  return out
}

/**
 * Emendas candidatas (B6.3.1.1): par de membros incidentes a um nó, quase colineares
 * (deflexão < 5°), SEM passagem contínua declarada ⇒ solda de topo que exige luva
 * interna (B6.3.1.2–.5). Retorna descrições por nó para o checklist.
 */
export function spliceCandidates(cage: Cage): Array<{ node: NodeId; pair: [string, string] }> {
  const res: Array<{ node: NodeId; pair: [string, string] }> = []
  for (const node of Object.keys(cage.nodes)) {
    const inc = incident(cage, node)
    for (let i = 0; i < inc.length; i++) {
      for (let j = i + 1; j < inc.length; j++) {
        const m1 = inc[i]
        const m2 = inc[j]
        if (isContinuousAt(cage, node, m1.id) && continuityPartner(cage, node, m1.id) === m2.id)
          continue
        const n = cage.nodes[node]
        const o1 = cage.nodes[m1.a === node ? m1.b : m1.a]
        const o2 = cage.nodes[m2.a === node ? m2.b : m2.a]
        if (!n || !o1 || !o2) continue
        // deflexão entre "chegar por m1" e "seguir por m2"
        const v1 = { x: n.x - o1.x, y: n.y - o1.y, z: n.z - o1.z }
        const v2 = { x: o2.x - n.x, y: o2.y - n.y, z: o2.z - n.z }
        const l1 = Math.hypot(v1.x, v1.y, v1.z)
        const l2 = Math.hypot(v2.x, v2.y, v2.z)
        if (!l1 || !l2) continue
        const cos = (v1.x * v2.x + v1.y * v2.y + v1.z * v2.z) / (l1 * l2)
        const deg = (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI
        if (deg < 5) res.push({ node, pair: [m1.id, m2.id] })
      }
    }
  }
  return res
}
