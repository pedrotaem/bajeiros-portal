import { describe, expect, it } from 'vitest'
import { templateCage } from './template'
import type { Cage, NodeId } from './types'
import {
  PLANE_TOL_MM,
  detectPlanes,
  namedAdjacency,
  planeAngle,
  planeCarry,
  planeOf,
  rotatePlaneTo,
  setPointDistance,
} from './planes'
import { dist, distPointToSegment } from '../rules/geometry'

const key = (ids: NodeId[]) => [...ids].sort().join(' ')
const find = (cage: Cage, ids: NodeId[], tol?: number) =>
  detectPlanes(cage, tol).find((p) => key(p.points) === key(ids))

/** Caixa 1000 mm com os 8 vértices denominados — 6 faces, ângulos retos exatos. */
function boxCage(): Cage {
  const c = 1000
  const nodes: Record<string, { x: number; y: number; z: number }> = {
    P1: { x: 0, y: 0, z: 0 },
    P2: { x: c, y: 0, z: 0 },
    P3: { x: c, y: 0, z: c },
    P4: { x: 0, y: 0, z: c },
    P5: { x: 0, y: c, z: 0 },
    P6: { x: c, y: c, z: 0 },
    P7: { x: c, y: c, z: c },
    P8: { x: 0, y: c, z: c },
  }
  const edges: [string, string][] = [
    ['P1', 'P2'],
    ['P2', 'P3'],
    ['P3', 'P4'],
    ['P4', 'P1'],
    ['P5', 'P6'],
    ['P6', 'P7'],
    ['P7', 'P8'],
    ['P8', 'P5'],
    ['P1', 'P5'],
    ['P2', 'P6'],
    ['P3', 'P7'],
    ['P4', 'P8'],
  ]
  return {
    nodes,
    members: edges.map(([a, b], i) => ({ id: `e${i}`, type: 'FREE' as const, a, b })),
    geraldao: { x: 0, y: 0, z: 0 },
    seatBottomY: 0,
    primarySection: { od: 31.75, wall: 1.6, materialId: '4130' },
    secondarySection: { od: 25.4, wall: 0.9, materialId: '4130' },
    namedExtra: Object.keys(nodes),
  }
}

describe('detecção de planos (DF-22)', () => {
  it('AC-DF22.1: o plano do corta-fogo sai com os 8 pontos do RRH e resíduo zero', () => {
    const p = find(templateCage, ['AL', 'AR', 'SL', 'SR', 'HL', 'HR', 'BL', 'BR'])
    expect(p).toBeDefined()
    expect(p!.residualMm).toBeCloseTo(0, 6)
    expect(p!.orientation).toBe('transversal')
    // contorno fechado: o primeiro e o último ponto são vizinhos no giro
    expect(p!.points).toHaveLength(8)
  })

  it('teto, amarração traseira e quadro frontal também são planos do template', () => {
    expect(find(templateCage, ['BL', 'BR', 'CL', 'CR'])).toBeDefined()
    expect(find(templateCage, ['BL', 'BR', 'RL', 'RR'])).toBeDefined()
    expect(find(templateCage, ['NL', 'NR', 'FL', 'FR'])).toBeDefined()
  })

  it('AC-DF22.2: todo plano é circuito fechado de denominados, dentro da tolerância', () => {
    const adj = namedAdjacency(templateCage)
    for (const p of detectPlanes(templateCage)) {
      expect(p.points.length).toBeGreaterThanOrEqual(3)
      expect(p.residualMm).toBeLessThanOrEqual(PLANE_TOL_MM)
      expect(p.areaMm2).toBeGreaterThan(0)
      for (const id of p.points) {
        const dentro = [...(adj.get(id) ?? [])].filter((n) => p.points.includes(n))
        expect(dentro.length, `${id} em ${p.id}`).toBeGreaterThanOrEqual(2)
      }
    }
  })

  it('AC-DF22.2: nenhum plano é subconjunto de outro (só os maximais sobrevivem)', () => {
    const ps = detectPlanes(templateCage)
    for (const a of ps) {
      for (const b of ps) {
        if (a === b) continue
        const set = new Set(b.points)
        expect(a.points.every((id) => set.has(id))).toBe(false)
      }
    }
  })

  it('AC-DF22.3: nó de curva não denominado não entra no plano nem o desfaz', () => {
    const cage = structuredClone(templateCage)
    // divide o RHO BL→CL num nó intermediário de grau 2 (o que "+ Nó no tubo" faz)
    const rho = cage.members.find((m) => m.id === 'RHO-11')!
    cage.nodes['K1'] = { x: -266, y: 1148, z: 115 }
    cage.members = cage.members.filter((m) => m.id !== rho.id)
    cage.members.push({ id: 'RHO-11a', type: 'RHO', a: 'BL', b: 'K1' })
    cage.members.push({ id: 'RHO-11b', type: 'RHO', a: 'K1', b: 'CL' })
    const teto = find(cage, ['BL', 'BR', 'CL', 'CR'])
    expect(teto).toBeDefined()
    expect(teto!.points).not.toContain('K1')
  })

  it('AC-DF22.3: afrouxar a tolerância funde o assoalho num plano só', () => {
    expect(find(templateCage, ['AL', 'AR', 'IL', 'IR'], 5)).toBeDefined()
    expect(find(templateCage, ['AL', 'AR', 'IL', 'IR', 'FL', 'FR'], 5)).toBeUndefined()
    expect(find(templateCage, ['AL', 'AR', 'IL', 'IR', 'FL', 'FR'], 20)).toBeDefined()
  })

  it('a caixa de teste dá exatamente as 6 faces', () => {
    const ps = detectPlanes(boxCage())
    expect(ps).toHaveLength(6)
    expect(ps.every((p) => p.points.length === 4)).toBe(true)
  })
})

describe('ângulo entre planos (DF-22)', () => {
  const cage = boxCage()
  const base = planeOf(cage, ['P1', 'P2', 'P3', 'P4'])!
  const lado = planeOf(cage, ['P1', 'P2', 'P6', 'P5'])!
  const topo = planeOf(cage, ['P5', 'P6', 'P7', 'P8'])!

  it('AC-DF22.4: faces com aresta comum medem a abertura entre os semiplanos', () => {
    const a = planeAngle(cage, base, lado)
    expect(a.hinged).toBe(true)
    expect(a.shared.sort()).toEqual(['P1', 'P2'])
    expect(a.deg).toBeCloseTo(90, 6)
  })

  it('AC-DF22.4: faces paralelas não têm dobradiça — ângulo entre normais, sem edição', () => {
    const a = planeAngle(cage, base, topo)
    expect(a.hinged).toBe(false)
    expect(a.deg).toBeCloseTo(0, 6)
    expect(rotatePlaneTo(cage, topo, base, 30)).toBeNull()
  })

  it('AC-DF22.5: editar o ângulo gira só os pontos exclusivos, em torno da aresta', () => {
    const moved = rotatePlaneTo(cage, lado, base, 60)!
    expect(Object.keys(moved).sort()).toEqual(['P5', 'P6'])
    const next: Cage = { ...cage, nodes: { ...cage.nodes, ...moved } }
    const girado = planeOf(next, lado.points)!
    expect(planeAngle(next, girado, base).deg).toBeCloseTo(60, 1)
    // rotação rígida: a aresta e o comprimento do montante sobrevivem
    expect(next.nodes.P1).toEqual(cage.nodes.P1)
    expect(dist(next.nodes.P1, next.nodes.P5)).toBeCloseTo(1000, 1)
  })

  it('AC-DF22.8: o giro carrega curvas e nós apoiados dentro do tubo do plano', () => {
    const hoop = planeOf(templateCage, ['AL', 'AR', 'SL', 'SR', 'HL', 'HR', 'BL', 'BR'])!
    const chao = planeOf(templateCage, ['AL', 'AR', 'IL', 'IR'])!
    const carry = planeCarry(templateCage, hoop, chao)
    // as 4 pontas das diagonais do corta-fogo viajam, apesar de não estarem ligadas
    for (const id of ['LDB1', 'LDB2', 'LDB3', 'LDB4']) expect(carry).toContain(id)
    // a dobradiça não
    expect(carry).not.toContain('AL')
    expect(carry).not.toContain('AR')
    // nem nós de outra região da gaiola
    expect(carry).not.toContain('CL')
    expect(carry).not.toContain('FX')

    const moved = rotatePlaneTo(templateCage, hoop, chao, 102)!
    const n = { ...templateCage.nodes, ...moved }
    // LDB2 continua apoiada sobre o montante HR→BR depois do giro
    expect(distPointToSegment(n.LDB2, n.HR, n.BR)).toBeLessThan(1)
  })

  it('AC-DF22.5: o giro vai nos dois sentidos (aumentar e diminuir a abertura)', () => {
    for (const alvo of [45, 120]) {
      const moved = rotatePlaneTo(cage, lado, base, alvo)!
      const next: Cage = { ...cage, nodes: { ...cage.nodes, ...moved } }
      expect(planeAngle(next, planeOf(next, lado.points)!, base).deg).toBeCloseTo(alvo, 1)
    }
  })
})

describe('cota entre dois pontos (DF-22)', () => {
  it('AC-DF22.6: a distância vira o valor pedido sem mudar a direção da reta', () => {
    const moved = setPointDistance(templateCage, 'AL', 'AR', 800, 'b')!
    expect(Object.keys(moved)).toEqual(['AR'])
    const next = { ...templateCage.nodes, ...moved }
    expect(dist(next.AL, next.AR)).toBeCloseTo(800, 1)
    expect(next.AR.y).toBeCloseTo(templateCage.nodes.AR.y, 1)
    expect(next.AR.z).toBeCloseTo(templateCage.nodes.AR.z, 1)
  })

  it('mover o outro ponto dá a mesma distância pelo lado oposto', () => {
    const moved = setPointDistance(templateCage, 'AL', 'AR', 800, 'a')!
    expect(Object.keys(moved)).toEqual(['AL'])
    const next = { ...templateCage.nodes, ...moved }
    expect(dist(next.AL, next.AR)).toBeCloseTo(800, 1)
  })

  it('modo simétrico preserva o ponto médio', () => {
    const a = templateCage.nodes.AL
    const b = templateCage.nodes.AR
    const moved = setPointDistance(templateCage, 'AL', 'AR', 800, 'both')!
    const next = { ...templateCage.nodes, ...moved }
    expect(dist(next.AL, next.AR)).toBeCloseTo(800, 1)
    expect((next.AL.x + next.AR.x) / 2).toBeCloseTo((a.x + b.x) / 2, 1)
    expect((next.AL.y + next.AR.y) / 2).toBeCloseTo((a.y + b.y) / 2, 1)
  })

  it('recusa alvo inválido, ponto inexistente e pontos coincidentes', () => {
    expect(setPointDistance(templateCage, 'AL', 'AR', 0, 'b')).toBeNull()
    expect(setPointDistance(templateCage, 'AL', 'ZZ', 500, 'b')).toBeNull()
    const cage = structuredClone(templateCage)
    cage.nodes.AR = { ...cage.nodes.AL }
    expect(setPointDistance(cage, 'AL', 'AR', 500, 'b')).toBeNull()
  })
})
