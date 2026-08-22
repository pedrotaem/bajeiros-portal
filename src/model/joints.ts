import type { Cage, Member, NodeId, Vec3 } from './types'
import { PRIMARY_TYPES } from './types'
import { continuityAt } from './continuity'
import { angleDeg, dist, distPointToSegment, distSegToSeg, norm, sub } from '../rules/geometry'

/**
 * Detecção e caracterização de juntas entre tubos (DF-7).
 * Tudo derivado da geometria + continuidade (DF-6) + seções por classe (DF-1).
 * Funções puras, tolerantes a modelo parcial (design.md §1).
 */

export interface Joint {
  node: NodeId | null // null = cruzamento por proximidade (FR-DF7.2)
  kind: 'butt' | 'tee' | 'wye' | 'kn' | 'crossing'
  target: string // membro de destino (quem NÃO é cortado)
  coped: string[] // membros que recebem boca de lobo
  angleDeg: number // menor ângulo θ entre eixos na junta
  contactLenMm: number // comprimento total da(s) linha(s) de contato de solda
  pairDistMm?: number // crossing: distância entre eixos medida
}

export function radiusOf(cage: Cage, m: Member): number {
  const s = PRIMARY_TYPES.includes(m.type) ? cage.primarySection : cage.secondarySection
  return s.od / 2
}

/** Direção unitária do membro saindo do nó (segmento local, não a corda da cadeia). */
function dirFrom(cage: Cage, m: Member, node: NodeId): Vec3 | null {
  const here = cage.nodes[node]
  const other = cage.nodes[m.a === node ? m.b : m.a]
  if (!here || !other) return null
  return norm(sub(other, here))
}

const N_SAMPLES = 96

/**
 * Perfil da boca de lobo (desenvolvimento planificado) do membro `memberId`
 * na extremidade `node`, contra o tubo de destino resolvido na junta.
 * phi ∈ [0, 2π); axial = avanço da geratriz até a superfície do destino (mm).
 * Fórmula clássica de cope para eixos concorrentes:
 *   t(φ) = (√(ra² − rb²·sin²φ) − rb·cosθ·cosφ) / sinθ
 */
export function copeProfile(
  cage: Cage,
  memberId: string,
  node: NodeId,
): { phi: number; axial: number }[] | null {
  const params = copeParams(cage, memberId, node)
  if (!params) return null
  const { ra, rb, thetaDeg } = params
  const th = (thetaDeg * Math.PI) / 180
  if (Math.sin(th) < 1e-6) return null
  const rbe = Math.min(rb, ra) // v1: clampa coped mais largo que o destino
  const pts: { phi: number; axial: number }[] = []
  for (let i = 0; i <= N_SAMPLES; i++) {
    const phi = (2 * Math.PI * i) / N_SAMPLES
    const root = Math.sqrt(Math.max(0, ra * ra - rbe * rbe * Math.sin(phi) ** 2))
    const t = (root - rbe * Math.cos(th) * Math.cos(phi)) / Math.sin(th)
    pts.push({ phi, axial: t })
  }
  return pts
}

export function copeParams(
  cage: Cage,
  memberId: string,
  node: NodeId,
): { target: Member; ra: number; rb: number; thetaDeg: number } | null {
  const joint = detectJoints(cage).find((j) => j.node === node && j.coped.includes(memberId))
  if (!joint) return null
  const target = cage.members.find((m) => m.id === joint.target)
  const me = cage.members.find((m) => m.id === memberId)
  if (!target || !me) return null
  const dT = dirFrom(cage, target, targetTouches(target, node) ? node : target.a)
  const dM = dirFrom(cage, me, node)
  if (!dT || !dM) return null
  const theta = Math.max(5, angleDeg(dT, dM)) // eixos de tubo não têm sentido; θ ∈ (0, 90]
  return { target, ra: radiusOf(cage, target), rb: radiusOf(cage, me), thetaDeg: theta }
}

const targetTouches = (m: Member, node: NodeId) => m.a === node || m.b === node

/** Comprimento 3D da curva de contato de uma boca de lobo (integração por cordas). */
function contactLength(ra: number, rb: number, thetaDeg: number): number {
  const th = (thetaDeg * Math.PI) / 180
  if (Math.sin(th) < 1e-6) return 2 * Math.PI * Math.min(rb, ra)
  const rbe = Math.min(rb, ra)
  let prev: Vec3 | null = null
  let sum = 0
  for (let i = 0; i <= N_SAMPLES; i++) {
    const phi = (2 * Math.PI * i) / N_SAMPLES
    const root = Math.sqrt(Math.max(0, ra * ra - rbe * rbe * Math.sin(phi) ** 2))
    const t = (root - rbe * Math.cos(th) * Math.cos(phi)) / Math.sin(th)
    const p: Vec3 = {
      x: t * Math.cos(th) - rbe * Math.sin(th) * Math.cos(phi),
      y: t * Math.sin(th) + rbe * Math.cos(th) * Math.cos(phi),
      z: rbe * Math.sin(phi),
    }
    if (prev) sum += dist(prev, p)
    prev = p
  }
  return sum
}

/** Junta por nó + cruzamentos por proximidade. */
export function detectJoints(cage: Cage): Joint[] {
  const joints: Joint[] = []

  for (const node of Object.keys(cage.nodes)) {
    const inc = cage.members.filter(
      (m) => (m.a === node || m.b === node) && cage.nodes[m.a] && cage.nodes[m.b],
    )
    if (inc.length < 2) continue
    const passages = continuityAt(cage, node)
    const inPassage = new Set(passages.flatMap((p) => p.pair))

    // entidades: passagem contínua = 1 entidade (tubo que atravessa); demais = 1 cada
    interface Entity {
      rep: Member
      members: Member[]
      through: boolean
    }
    const entities: Entity[] = []
    for (const p of passages) {
      const ms = p.pair.map((id) => inc.find((m) => m.id === id)).filter((m): m is Member => !!m)
      if (ms.length) entities.push({ rep: ms[0], members: ms, through: true })
    }
    for (const m of inc) {
      if (!inPassage.has(m.id)) entities.push({ rep: m, members: [m], through: false })
    }
    if (entities.length < 2) continue

    // alvo (FR-DF7.1): contínuo > maior Ø > classe primária > id estável
    const rank = (e: Entity) =>
      [
        e.through ? 1 : 0,
        radiusOf(cage, e.rep),
        PRIMARY_TYPES.includes(e.rep.type) ? 1 : 0,
      ] as const
    const sorted = [...entities].sort((a, b) => {
      const ra = rank(a)
      const rb = rank(b)
      for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return rb[i] - ra[i]
      return a.rep.id < b.rep.id ? -1 : 1
    })
    const target = sorted[0]
    const coped = sorted.slice(1)

    // topo (butt): exatamente 2 entidades simples quase colineares
    if (entities.length === 2 && !target.through && !coped[0]?.through) {
      const d1 = dirFrom(cage, target.rep, node)
      const d2 = dirFrom(cage, coped[0].rep, node)
      if (d1 && d2) {
        // vetores saem do nó: quase opostos (ângulo ≈ 180°) ⇒ deflexão ≈ 0 ⇒ solda de topo
        const between =
          (Math.acos(Math.max(-1, Math.min(1, d1.x * d2.x + d1.y * d2.y + d1.z * d2.z))) * 180) /
          Math.PI
        const deflect = 180 - between
        if (deflect < 5) {
          const rb = Math.min(radiusOf(cage, target.rep), radiusOf(cage, coped[0].rep))
          joints.push({
            node,
            kind: 'butt',
            target: target.rep.id,
            coped: [coped[0].rep.id],
            angleDeg: deflect,
            contactLenMm: 2 * Math.PI * rb,
          })
          continue
        }
      }
    }

    const dT = dirFrom(cage, target.rep, node)
    if (!dT) continue
    let minTheta = 90
    let contact = 0
    const copedIds: string[] = []
    for (const e of coped) {
      const dM = dirFrom(cage, e.rep, node)
      if (!dM) continue
      const theta = Math.max(5, angleDeg(dT, dM))
      minTheta = Math.min(minTheta, theta)
      contact += contactLength(radiusOf(cage, target.rep), radiusOf(cage, e.rep), theta)
      copedIds.push(e.rep.id)
    }
    if (!copedIds.length) continue
    joints.push({
      node,
      kind: copedIds.length >= 2 ? 'kn' : minTheta >= 60 ? 'tee' : 'wye',
      target: target.rep.id,
      coped: copedIds,
      angleDeg: minTheta,
      contactLenMm: contact,
    })
  }

  // Sem nó comum, dois casos (FR-DF7.1/7.2):
  //  a) extremidade de um membro encostada no CORPO de outro tubo (dist do nó ao eixo
  //     ≤ r do alvo + 5 mm) ⇒ junta T/Y real em meio de tubo — o membro que morre
  //     recebe a boca de lobo (ex.: LDB nos montantes, USM nas travessas);
  //  b) eixos que se aproximam a menos de ra+rb longe de qualquer extremidade ⇒
  //     aviso de colisão (kind 'crossing', regra JOINT.X).
  const ms = cage.members.filter((m) => cage.nodes[m.a] && cage.nodes[m.b])
  const endTouch = new Map<string, { target: Member; coped: Member; theta: number; d: number }>()
  const touchedPair = new Set<string>()
  for (const me of ms) {
    for (const endNode of [me.a, me.b]) {
      // extremidade já tratada como junta de nó compartilhado?
      const sharesNode = ms.some((o) => o !== me && (o.a === endNode || o.b === endNode))
      if (sharesNode) continue
      const end = cage.nodes[endNode]
      let best: { target: Member; d: number } | null = null
      for (const other of ms) {
        if (other === me) continue
        const d = distPointToSegment(end, cage.nodes[other.a], cage.nodes[other.b])
        if (d <= radiusOf(cage, other) + 5 && (!best || d < best.d)) best = { target: other, d }
      }
      if (!best) continue
      const dM = dirFrom(cage, me, endNode)
      const dT = sub(cage.nodes[best.target.b], cage.nodes[best.target.a])
      if (!dM) continue
      const theta = Math.max(5, angleDeg(dM, dT))
      endTouch.set(`${me.id}@${endNode}`, { target: best.target, coped: me, theta, d: best.d })
      touchedPair.add([me.id, best.target.id].sort().join('|'))
    }
  }
  for (const [key, t] of endTouch) {
    const node = key.split('@')[1]
    joints.push({
      node,
      kind: t.theta >= 60 ? 'tee' : 'wye',
      target: t.target.id,
      coped: [t.coped.id],
      angleDeg: t.theta,
      contactLenMm: contactLength(radiusOf(cage, t.target), radiusOf(cage, t.coped), t.theta),
    })
  }
  for (let i = 0; i < ms.length; i++) {
    for (let j = i + 1; j < ms.length; j++) {
      const m1 = ms[i]
      const m2 = ms[j]
      if (m1.a === m2.a || m1.a === m2.b || m1.b === m2.a || m1.b === m2.b) continue
      if (touchedPair.has([m1.id, m2.id].sort().join('|'))) continue
      const d = distSegToSeg(cage.nodes[m1.a], cage.nodes[m1.b], cage.nodes[m2.a], cage.nodes[m2.b])
      const lim = radiusOf(cage, m1) + radiusOf(cage, m2)
      if (d < lim) {
        const th = angleDeg(
          sub(cage.nodes[m1.b], cage.nodes[m1.a]),
          sub(cage.nodes[m2.b], cage.nodes[m2.a]),
        )
        joints.push({
          node: null,
          kind: 'crossing',
          target: m1.id,
          coped: [m2.id],
          angleDeg: th,
          contactLenMm: 0,
          pairDistMm: d,
        })
      }
    }
  }

  return joints
}

/** Total de cordão de solda (mm) — consumido pelo DF-2 v2 e pelo resumo. */
export function totalWeldLength(cage: Cage, joints?: Joint[]): number {
  return (joints ?? detectJoints(cage))
    .filter((j) => j.kind !== 'crossing')
    .reduce((acc, j) => acc + j.contactLenMm, 0)
}

/**
 * Gabarito SVG 1:1 (mm) da boca de lobo: curva do desenvolvimento, linha de dorso
 * (φ = 0), identificação e barra de escala de 100 mm (FR-DF7.5).
 */
export function copeSvg(cage: Cage, memberId: string, node: NodeId): string | null {
  const profile = copeProfile(cage, memberId, node)
  const params = copeParams(cage, memberId, node)
  if (!profile || !params) return null
  const rbe = Math.min(params.rb, params.ra)
  const tMin = Math.min(...profile.map((p) => p.axial))
  const margin = 15
  const w = 2 * Math.PI * rbe
  const depth = Math.max(...profile.map((p) => p.axial)) - tMin
  const h = depth + 45
  const pts = profile
    .map((p) => `${(p.phi * rbe + margin).toFixed(2)},${(p.axial - tMin + margin).toFixed(2)}`)
    .join(' ')
  const W = (w + 2 * margin).toFixed(1)
  const H = (h + 2 * margin).toFixed(1)
  const me = cage.members.find((m) => m.id === memberId)
  const label = `${memberId} (${me?.type ?? '?'}) @ ${node} — Ø ${(params.rb * 2).toFixed(1)} mm sobre Ø ${(params.ra * 2).toFixed(1)} mm, θ = ${params.thetaDeg.toFixed(0)}°`
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}">`,
    `<rect x="0" y="0" width="${W}" height="${H}" fill="white"/>`,
    `<polyline points="${pts}" fill="none" stroke="black" stroke-width="0.4"/>`,
    // linha de dorso (φ = 0) e fim do perímetro (φ = 2π)
    `<line x1="${margin}" y1="${margin - 5}" x2="${margin}" y2="${(depth + margin + 5).toFixed(2)}" stroke="black" stroke-width="0.2" stroke-dasharray="2,2"/>`,
    `<line x1="${(w + margin).toFixed(2)}" y1="${margin - 5}" x2="${(w + margin).toFixed(2)}" y2="${(depth + margin + 5).toFixed(2)}" stroke="black" stroke-width="0.2" stroke-dasharray="2,2"/>`,
    `<text x="${margin}" y="${(depth + margin + 14).toFixed(2)}" font-size="4" font-family="sans-serif">${label}</text>`,
    `<text x="${margin}" y="${(depth + margin + 20).toFixed(2)}" font-size="3.2" font-family="sans-serif">linha tracejada = dorso (φ = 0) · enrolar no tubo com este lado sobre a geratriz de referência</text>`,
    // barra de escala: 100 mm
    `<line x1="${margin}" y1="${(depth + margin + 26).toFixed(2)}" x2="${(margin + 100).toFixed(2)}" y2="${(depth + margin + 26).toFixed(2)}" stroke="black" stroke-width="0.8"/>`,
    `<text x="${(margin + 35).toFixed(2)}" y="${(depth + margin + 32).toFixed(2)}" font-size="3.5" font-family="sans-serif">barra de escala = 100 mm (conferir na impressão)</text>`,
    `</svg>`,
  ].join('\n')
}
