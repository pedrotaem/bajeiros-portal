import type { Cage, Member, NodeId, Vec3 } from './types'
import { PRIMARY_TYPES, isNamedIn } from './types'
import {
  add,
  centroid,
  cross,
  dist,
  distPointToSegment,
  dot,
  len,
  norm,
  scale,
  sub,
} from '../rules/geometry'

/**
 * Planos da gaiola (DF-22) — módulo PURO e derivado: nenhum plano é armazenado no
 * `Cage`, todos saem da geometria a cada consulta (mesmo contrato de `joints.ts`).
 *
 * Definição adotada: um plano é um **circuito fechado de pontos denominados
 * adjacentes** cujos vértices cabem todos dentro de `tolMm` de um mesmo plano
 * ajustado. "Adjacente" é a adjacência de vão do §5.2 do design — dois pontos
 * denominados ligados por tubo, atravessando nós de curva (não denominados de grau 2).
 * O circuito fechado é o que separa plano de trecho: três pontos em cadeia aberta
 * definem um plano matemático, mas não um painel da estrutura.
 */

/**
 * Desvio máximo de um ponto ao plano ajustado. 5 mm ≈ 0,3° num painel de 1 m, e é
 * apertado de propósito: afrouxar funde painéis vizinhos (o assoalho da gaiola
 * default vira um plano só, escondendo a dobra nos pontos I). Perder um plano é
 * recuperável pelo campo de tolerância na tela; anunciar um plano que não existe, não.
 */
export const PLANE_TOL_MM = 5

/** Abaixo disto o "plano" é uma lasca entre pontos quase colineares, não um painel. */
const MIN_AREA_MM2 = 10_000

export type PlaneOrientation = 'transversal' | 'horizontal' | 'lateral'

export interface CagePlane {
  /** ids dos pontos em ordem alfabética, unidos por `-` — estável enquanto o conjunto for o mesmo. */
  id: string
  /** pontos denominados do plano, em ordem de contorno (giro em torno do centro). */
  points: NodeId[]
  normal: Vec3
  center: Vec3
  /** maior distância de um ponto ao plano ajustado (mm). */
  residualMm: number
  areaMm2: number
  orientation: PlaneOrientation
}

export interface PlaneAngle {
  /** graus. Com dobradiça: abertura entre os dois semiplanos [0, 180]. Sem: ângulo entre normais [0, 90]. */
  deg: number
  /** pontos que os dois planos têm em comum. */
  shared: NodeId[]
  /** true = existe aresta comum (≥ 2 pontos colineares) e o ângulo é editável. */
  hinged: boolean
  axisPoint: Vec3
  axisDir: Vec3
}

const ORIENTATION_LABELS: Record<PlaneOrientation, string> = {
  transversal: 'transversal (corta-fogo, quadro frontal)',
  horizontal: 'horizontal (assoalho, teto)',
  lateral: 'lateral (flanco)',
}

export function orientationLabel(o: PlaneOrientation): string {
  return ORIENTATION_LABELS[o]
}

/** Ligação entre dois pontos denominados: por onde ela passa e de que tubos é feita. */
export interface NamedLink {
  to: NodeId
  /** nós de curva atravessados (não denominados, grau 2). */
  via: NodeId[]
  /** ids dos membros percorridos. */
  members: string[]
}

/**
 * Caminha de um ponto denominado ao próximo atravessando nós não denominados de
 * grau 2 (dobras). Mesma travessia do algoritmo de vãos — dividir um tubo para
 * criar uma curva não desfaz o plano.
 */
export function namedLinks(cage: Cage): Map<NodeId, NamedLink[]> {
  const inc = new Map<NodeId, Member[]>()
  for (const m of cage.members) {
    if (!cage.nodes[m.a] || !cage.nodes[m.b]) continue
    inc.set(m.a, [...(inc.get(m.a) ?? []), m])
    inc.set(m.b, [...(inc.get(m.b) ?? []), m])
  }
  const named = (id: NodeId) => isNamedIn(cage, id)
  const out = new Map<NodeId, NamedLink[]>()
  for (const id of Object.keys(cage.nodes)) if (named(id)) out.set(id, [])
  const other = (m: Member, n: NodeId) => (m.a === n ? m.b : m.a)
  const limit = cage.members.length + 1 // trava contra anel só de nós de grau 2
  for (const start of out.keys()) {
    for (const m0 of inc.get(start) ?? []) {
      let cur = m0
      let node = other(m0, start)
      const via: NodeId[] = []
      const members = [m0.id]
      let steps = 0
      while (!named(node) && (inc.get(node)?.length ?? 0) === 2 && steps++ < limit) {
        const pair = inc.get(node)!
        const next = pair[0] === cur ? pair[1] : pair[0]
        via.push(node)
        members.push(next.id)
        cur = next
        node = other(next, node)
      }
      if (node !== start && out.has(node)) out.get(start)!.push({ to: node, via, members })
    }
  }
  return out
}

export function namedAdjacency(cage: Cage): Map<NodeId, Set<NodeId>> {
  const out = new Map<NodeId, Set<NodeId>>()
  for (const [id, links] of namedLinks(cage)) out.set(id, new Set(links.map((l) => l.to)))
  return out
}

/**
 * Plano de mínimos quadrados totais por matriz de covariância. A normal é o
 * autovetor do menor autovalor, obtido pelo maior cofator — evita carregar um
 * solucionador de autovalores para um caso 3×3.
 */
export function fitPlane(pts: Vec3[]): { normal: Vec3; center: Vec3; residualMm: number } {
  const c = pts.length ? centroid(pts) : { x: 0, y: 0, z: 0 }
  let xx = 0
  let xy = 0
  let xz = 0
  let yy = 0
  let yz = 0
  let zz = 0
  for (const p of pts) {
    const r = sub(p, c)
    xx += r.x * r.x
    xy += r.x * r.y
    xz += r.x * r.z
    yy += r.y * r.y
    yz += r.y * r.z
    zz += r.z * r.z
  }
  const dx = yy * zz - yz * yz
  const dy = xx * zz - xz * xz
  const dz = xx * yy - xy * xy
  let n: Vec3
  if (dx >= dy && dx >= dz) n = { x: dx, y: xz * yz - xy * zz, z: xy * yz - xz * yy }
  else if (dy >= dz) n = { x: xz * yz - xy * zz, y: dy, z: xy * xz - yz * xx }
  else n = { x: xy * yz - xz * yy, y: xy * xz - yz * xx, z: dz }
  const l = len(n)
  if (l === 0) return { normal: { x: 0, y: 0, z: 0 }, center: c, residualMm: 0 }
  const u = scale(n, 1 / l)
  let res = 0
  for (const p of pts) res = Math.max(res, Math.abs(dot(sub(p, c), u)))
  return { normal: u, center: c, residualMm: res }
}

function minorAxis(n: Vec3): Vec3 {
  const a = { x: Math.abs(n.x), y: Math.abs(n.y), z: Math.abs(n.z) }
  if (a.x <= a.y && a.x <= a.z) return { x: 1, y: 0, z: 0 }
  return a.y <= a.z ? { x: 0, y: 1, z: 0 } : { x: 0, y: 0, z: 1 }
}

/** Base ortonormal do plano (u, v) tal que u × v aponta na direção da normal. */
function basis(normal: Vec3): { u: Vec3; v: Vec3 } {
  const u = norm(cross(normal, minorAxis(normal)))
  return { u, v: cross(normal, u) }
}

/**
 * Monta o plano de um conjunto de pontos JÁ conhecido (sem detecção). O contorno
 * é a ordem angular em torno do centro — o fecho convexo do conjunto, que é o que
 * a cena desenha como leque de triângulos.
 */
export function planeOf(cage: Cage, ids: NodeId[]): CagePlane | null {
  if (ids.length < 3) return null
  const pts = ids.map((id) => cage.nodes[id])
  if (pts.some((p) => !p)) return null
  const { normal, center, residualMm } = fitPlane(pts)
  if (len(normal) === 0) return null
  const { u, v } = basis(normal)
  const ordered = ids
    .map((id) => {
      const r = sub(cage.nodes[id], center)
      return { id, a: Math.atan2(dot(r, v), dot(r, u)) }
    })
    .sort((p, q) => p.a - q.a || (p.id < q.id ? -1 : 1))
    .map((p) => p.id)
  let twice = 0
  for (let i = 0; i < ordered.length; i++) {
    const p = sub(cage.nodes[ordered[i]], center)
    const q = sub(cage.nodes[ordered[(i + 1) % ordered.length]], center)
    twice += dot(p, u) * dot(q, v) - dot(q, u) * dot(p, v)
  }
  const a = { x: Math.abs(normal.x), y: Math.abs(normal.y), z: Math.abs(normal.z) }
  const orientation: PlaneOrientation =
    a.x >= a.y && a.x >= a.z ? 'lateral' : a.y >= a.z ? 'horizontal' : 'transversal'
  return {
    id: [...ids].sort().join('-'),
    points: ordered,
    normal,
    center,
    residualMm,
    areaMm2: Math.abs(twice) / 2,
    orientation,
  }
}

/**
 * Descarta as pontas soltas: um ponto com menos de 2 vizinhos DENTRO do conjunto
 * é extremidade de trecho, não vértice de painel. Depois fica a maior componente
 * conexa do que sobrou.
 */
function closedCircuit(set: Set<NodeId>, adj: Map<NodeId, Set<NodeId>>): NodeId[] {
  const s = new Set(set)
  for (;;) {
    let removed = false
    for (const id of [...s]) {
      let deg = 0
      for (const n of adj.get(id) ?? []) if (s.has(n)) deg++
      if (deg < 2) {
        s.delete(id)
        removed = true
      }
    }
    if (!removed) break
  }
  if (s.size < 3) return []
  const seen = new Set<NodeId>()
  let best: NodeId[] = []
  for (const start of [...s].sort()) {
    if (seen.has(start)) continue
    const comp: NodeId[] = []
    const queue = [start]
    seen.add(start)
    while (queue.length) {
      const id = queue.shift()!
      comp.push(id)
      for (const n of adj.get(id) ?? []) {
        if (s.has(n) && !seen.has(n)) {
          seen.add(n)
          queue.push(n)
        }
      }
    }
    if (comp.length > best.length) best = comp
  }
  return best.length >= 3 ? best.sort() : []
}

/**
 * Detecção: cada "canto" (dois vizinhos de um mesmo ponto) semeia um plano que
 * cresce enquanto houver ponto adjacente ao conjunto dentro da tolerância — o de
 * menor resíduo primeiro, o que torna o resultado independente da ordem de varredura.
 * No fim sobram só os conjuntos maximais.
 */
export function detectPlanes(cage: Cage, tolMm: number = PLANE_TOL_MM): CagePlane[] {
  const adj = namedAdjacency(cage)
  const ids = [...adj.keys()].filter((id) => cage.nodes[id]).sort()
  const found = new Map<string, CagePlane>()

  for (const v of ids) {
    const nb = [...(adj.get(v) ?? [])].filter((id) => cage.nodes[id]).sort()
    for (let i = 0; i < nb.length; i++) {
      for (let j = i + 1; j < nb.length; j++) {
        const set = new Set<NodeId>([nb[i], v, nb[j]])
        for (;;) {
          let best: { id: NodeId; res: number } | null = null
          for (const cand of ids) {
            if (set.has(cand)) continue
            let touches = false
            for (const s of set) {
              if (adj.get(s)?.has(cand)) {
                touches = true
                break
              }
            }
            if (!touches) continue
            const res = fitPlane([...set, cand].map((id) => cage.nodes[id])).residualMm
            if (res <= tolMm && (!best || res < best.res)) best = { id: cand, res }
          }
          if (!best) break
          set.add(best.id)
        }
        const circuit = closedCircuit(set, adj)
        if (circuit.length < 3) continue
        const key = circuit.join('-')
        if (found.has(key)) continue
        const plane = planeOf(cage, circuit)
        if (!plane || plane.areaMm2 < MIN_AREA_MM2 || plane.residualMm > tolMm) continue
        found.set(key, plane)
      }
    }
  }

  const all = [...found.values()]
  return all
    .filter((p) => !all.some((q) => q !== p && isSubsetOf(p.points, q.points)))
    .sort((p, q) => q.areaMm2 - p.areaMm2 || (p.id < q.id ? -1 : 1))
}

function isSubsetOf(a: NodeId[], b: NodeId[]): boolean {
  if (a.length >= b.length) return false
  const s = new Set(b)
  return a.every((id) => s.has(id))
}

/** Componente de `v` perpendicular ao eixo unitário `d`. */
function perpTo(v: Vec3, d: Vec3): Vec3 {
  return sub(v, scale(d, dot(v, d)))
}

/**
 * Ângulo entre dois planos. Com aresta comum (≥ 2 pontos compartilhados e
 * colineares) devolve a **abertura entre os semiplanos** medida na dobradiça —
 * que é o ângulo que o projetista enxerga entre dois painéis. Sem aresta comum
 * devolve o ângulo entre as normais, dobrado em [0, 90], e não é editável.
 */
export function planeAngle(
  cage: Cage,
  a: CagePlane,
  b: CagePlane,
  tolMm = PLANE_TOL_MM,
): PlaneAngle {
  const shared = a.points.filter((id) => b.points.includes(id))
  const pts = shared.map((id) => cage.nodes[id]).filter(Boolean)
  const fallback = (): PlaneAngle => {
    const c = Math.abs(dot(a.normal, b.normal))
    return {
      deg: (Math.acos(Math.min(1, c)) * 180) / Math.PI,
      shared,
      hinged: false,
      axisPoint: a.center,
      axisDir: norm(cross(a.normal, b.normal)),
    }
  }
  if (pts.length < 2) return fallback()

  let p0 = pts[0]
  let p1 = pts[1]
  let span = -1
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const d = dist(pts[i], pts[j])
      if (d > span) {
        span = d
        p0 = pts[i]
        p1 = pts[j]
      }
    }
  }
  const axisDir = norm(sub(p1, p0))
  if (len(axisDir) === 0) return fallback()
  // três ou mais compartilhados fora de uma reta ⇒ os planos são o mesmo, não vizinhos
  for (const p of pts) if (len(perpTo(sub(p, p0), axisDir)) > tolMm) return fallback()

  const ua = perpTo(sub(a.center, p0), axisDir)
  const ub = perpTo(sub(b.center, p0), axisDir)
  if (len(ua) === 0 || len(ub) === 0) return fallback()
  const c = Math.max(-1, Math.min(1, dot(norm(ua), norm(ub))))
  return {
    deg: (Math.acos(c) * 180) / Math.PI,
    shared,
    hinged: true,
    axisPoint: p0,
    axisDir,
  }
}

/**
 * Quem viaja quando o plano gira. Três camadas, da mais óbvia à menos:
 *  1. os pontos denominados do plano;
 *  2. os nós de curva das arestas do plano (dobra de tubo é parte da aresta);
 *  3. qualquer nó DENTRO do corpo de um tubo do plano — é o caso das pontas das
 *     diagonais LDB do template, apoiadas sobre os montantes sem estarem ligadas
 *     a eles. Sem esta camada, girar o corta-fogo deixa a diagonal para trás e o
 *     B6.2.4.9 (coplanaridade) passa a falhar por um efeito colateral da ferramenta.
 * Os pontos do plano de referência ficam fora: são a dobradiça e o que não se move.
 */
export function planeCarry(cage: Cage, moving: CagePlane, ref: CagePlane): NodeId[] {
  const links = namedLinks(cage)
  const byId = new Map(cage.members.map((m) => [m.id, m]))
  const inPlane = new Set(moving.points)
  const carry = new Set<NodeId>(moving.points)
  const segs: { a: Vec3; b: Vec3; r: number }[] = []
  for (const [from, ls] of links) {
    if (!inPlane.has(from)) continue
    for (const l of ls) {
      if (!inPlane.has(l.to) || l.to < from) continue // cada aresta uma vez só
      for (const n of l.via) carry.add(n)
      for (const mid of l.members) {
        const m = byId.get(mid)
        if (!m || !cage.nodes[m.a] || !cage.nodes[m.b]) continue
        const sec = PRIMARY_TYPES.includes(m.type) ? cage.primarySection : cage.secondarySection
        segs.push({ a: cage.nodes[m.a], b: cage.nodes[m.b], r: sec.od / 2 })
      }
    }
  }
  for (const id of Object.keys(cage.nodes)) {
    if (carry.has(id)) continue
    const p = cage.nodes[id]
    if (segs.some((s) => distPointToSegment(p, s.a, s.b) <= s.r)) carry.add(id)
  }
  for (const id of ref.points) carry.delete(id)
  return [...carry].sort()
}

/** Rotação de Rodrigues em torno de um eixo (ponto + direção unitária). */
export function rotateAboutAxis(p: Vec3, axisPoint: Vec3, axisDir: Vec3, rad: number): Vec3 {
  const r = sub(p, axisPoint)
  const c = Math.cos(rad)
  const s = Math.sin(rad)
  const rot = add(
    add(scale(r, c), scale(cross(axisDir, r), s)),
    scale(axisDir, dot(axisDir, r) * (1 - c)),
  )
  return add(axisPoint, rot)
}

// 0,01 mm: o arrasto arredonda a 1 mm porque o gesto é grosso, mas aqui o número é
// digitado — com 0,1 mm uma cota de 600 voltava para a tela como 599,97.
const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * Posições novas para levar o ângulo `moving × ref` ao valor pedido, girando o que
 * viaja com `moving` (ver `planeCarry`) em torno da aresta comum. Os pontos
 * compartilhados estão sobre o eixo e não se movem, então a rotação é rígida e o
 * ângulo muda exatamente pelo delta pedido. Devolve `null` quando não há dobradiça.
 */
export function rotatePlaneTo(
  cage: Cage,
  moving: CagePlane,
  ref: CagePlane,
  targetDeg: number,
  tolMm = PLANE_TOL_MM,
): Record<NodeId, Vec3> | null {
  const ang = planeAngle(cage, moving, ref, tolMm)
  if (!ang.hinged) return null
  const targets = planeCarry(cage, moving, ref).filter((id) => cage.nodes[id])
  if (!targets.length) return null
  const delta = ((targetDeg - ang.deg) * Math.PI) / 180
  if (!Number.isFinite(delta)) return null

  const apply = (rad: number): Record<NodeId, Vec3> => {
    const out: Record<NodeId, Vec3> = {}
    for (const id of targets) {
      const p = rotateAboutAxis(cage.nodes[id], ang.axisPoint, ang.axisDir, rad)
      out[id] = { x: round2(p.x), y: round2(p.y), z: round2(p.z) }
    }
    return out
  }
  const measure = (moved: Record<NodeId, Vec3>): number => {
    const next: Cage = { ...cage, nodes: { ...cage.nodes, ...moved } }
    const plane = planeOf(next, moving.points)
    return plane ? planeAngle(next, plane, ref, tolMm).deg : Number.NaN
  }
  // o sentido do giro sai de qual dos dois aproxima do alvo — a abertura é um
  // ângulo sem sinal, então tentar é mais barato (e mais seguro) que orientá-la.
  const plus = apply(delta)
  const errPlus = Math.abs(measure(plus) - targetDeg)
  if (errPlus <= 0.05) return plus
  const minus = apply(-delta)
  const errMinus = Math.abs(measure(minus) - targetDeg)
  return errMinus < errPlus ? minus : plus
}

/**
 * Cota entre dois pontos: devolve as posições que fazem a distância virar
 * `targetMm`, deslocando ao longo da reta que já une os dois.
 * `move` escolhe quem anda — o outro ponto fica exatamente onde está.
 */
export function setPointDistance(
  cage: Cage,
  aId: NodeId,
  bId: NodeId,
  targetMm: number,
  move: 'a' | 'b' | 'both',
): Record<NodeId, Vec3> | null {
  const a = cage.nodes[aId]
  const b = cage.nodes[bId]
  if (!a || !b || aId === bId) return null
  if (!Number.isFinite(targetMm) || targetMm <= 0) return null
  const d0 = dist(a, b)
  if (d0 === 0) return null // pontos coincidentes não definem direção
  const dir = norm(sub(b, a))
  const at = (p: Vec3) => ({ x: round2(p.x), y: round2(p.y), z: round2(p.z) })
  if (move === 'b') return { [bId]: at(add(a, scale(dir, targetMm))) }
  if (move === 'a') return { [aId]: at(sub(b, scale(dir, targetMm))) }
  const mid = scale(add(a, b), 0.5)
  return {
    [aId]: at(sub(mid, scale(dir, targetMm / 2))),
    [bId]: at(add(mid, scale(dir, targetMm / 2))),
  }
}
