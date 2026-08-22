import { describe, expect, it } from 'vitest'
import { copeProfile, copeSvg, detectJoints, totalWeldLength } from './joints'
import { estimateMass } from './mass'
import { templateCage } from './template'
import type { Cage } from './types'

/** T a 90°: travessa FREE morre no meio... aqui via nó compartilhado no topo do montante. */
function teeCage(): Cage {
  return {
    nodes: {
      N1: { x: 0, y: 0, z: 0 },
      N2: { x: 0, y: 1000, z: 0 },
      N3: { x: 800, y: 1000, z: 0 },
      N4: { x: 0, y: 2000, z: 0 },
    },
    members: [
      { id: 'post1', type: 'RRH', a: 'N1', b: 'N2' },
      { id: 'post2', type: 'RRH', a: 'N2', b: 'N4' },
      { id: 'arm', type: 'FREE', a: 'N2', b: 'N3' },
    ],
    continuity: [{ node: 'N2', pair: ['post1', 'post2'] }],
    geraldao: { x: 0, y: 0, z: 0 },
    seatBottomY: 0,
    // seções iguais para o caso analítico ra = rb
    primarySection: { od: 25.4, wall: 3.05, materialId: '1018' },
    secondarySection: { od: 25.4, wall: 0.89, materialId: '1018' },
  }
}

describe('detectJoints (DF-7)', () => {
  it('AC-DF7.3: membro contínuo é o destino; a travessa recebe a boca de lobo', () => {
    const j = detectJoints(teeCage()).filter((x) => x.node === 'N2')
    expect(j.length).toBe(1)
    expect(['post1', 'post2']).toContain(j[0].target)
    expect(j[0].coped).toEqual(['arm'])
    expect(j[0].kind).toBe('tee')
    expect(j[0].angleDeg).toBeCloseTo(90, 0)
  })

  it('AC-DF7.1: T 90° tubos iguais — perfil reproduz a sela t(φ) = r·|cosφ| e o cordão bate a referência analítica (±1%)', () => {
    const cage = teeCage()
    const prof = copeProfile(cage, 'arm', 'N2')!
    const r = 12.7
    for (const p of prof.filter((_, i) => i % 8 === 0)) {
      expect(p.axial).toBeCloseTo(r * Math.abs(Math.cos(p.phi)), 1)
    }
    // referência: comprimento por integração fina da mesma curva paramétrica
    const fine = (n: number) => {
      let sum = 0
      let prev: [number, number, number] | null = null
      for (let i = 0; i <= n; i++) {
        const phi = (2 * Math.PI * i) / n
        const t = r * Math.abs(Math.cos(phi))
        const p: [number, number, number] = [-r * Math.cos(phi), t, r * Math.sin(phi)]
        if (prev) sum += Math.hypot(p[0] - prev[0], p[1] - prev[1], p[2] - prev[2])
        prev = p
      }
      return sum
    }
    const j = detectJoints(cage).find((x) => x.node === 'N2')!
    expect(Math.abs(j.contactLenMm - fine(4096)) / fine(4096)).toBeLessThan(0.01)
  })

  it('junta a 45° vira wye e o cordão cresce vs 90°', () => {
    const cage = teeCage()
    cage.nodes.N3 = { x: 800, y: 1800, z: 0 } // ~45°
    const j = detectJoints(cage).find((x) => x.node === 'N2')!
    expect(j.kind).toBe('wye')
    const j90 = detectJoints(teeCage()).find((x) => x.node === 'N2')!
    expect(j.contactLenMm).toBeGreaterThan(j90.contactLenMm)
  })

  it('emenda de topo: cordão = perímetro do tubo', () => {
    const cage = teeCage()
    cage.continuity = []
    cage.members = cage.members.filter((m) => m.id !== 'arm')
    const j = detectJoints(cage).find((x) => x.node === 'N2')!
    expect(j.kind).toBe('butt')
    expect(j.contactLenMm).toBeCloseTo(2 * Math.PI * 12.7, 1)
  })

  it('AC-DF7.4: cruzamento sem nó a < ra+rb gera aviso com distância', () => {
    const cage = teeCage()
    cage.nodes.X1 = { x: -400, y: 500, z: 10 }
    cage.nodes.X2 = { x: 400, y: 500, z: 10 }
    cage.members.push({ id: 'cross', type: 'FREE', a: 'X1', b: 'X2' })
    const c = detectJoints(cage).filter((j) => j.kind === 'crossing')
    expect(c.length).toBe(1)
    expect(c[0].pairDistMm).toBeCloseTo(10, 0)
  })

  it('extremidade encostada no corpo de outro tubo vira junta T (não colisão)', () => {
    const cage = teeCage()
    cage.nodes.E1 = { x: 0, y: 500, z: 0 } // sobre o eixo do post1
    cage.nodes.E2 = { x: 600, y: 500, z: 0 }
    cage.members.push({ id: 'stub', type: 'FREE', a: 'E1', b: 'E2' })
    const js = detectJoints(cage)
    const tee = js.find((j) => j.node === 'E1' && j.coped.includes('stub'))
    expect(tee).toBeDefined()
    expect(tee!.target).toBe('post1')
    expect(js.some((j) => j.kind === 'crossing' && j.coped.includes('stub'))).toBe(false)
  })

  it('AC-DF7.6: total de cordão = soma das juntas listadas', () => {
    const js = detectJoints(templateCage)
    const sum = js.filter((j) => j.kind !== 'crossing').reduce((a, j) => a + j.contactLenMm, 0)
    expect(totalWeldLength(templateCage, js)).toBeCloseTo(sum, 6)
    expect(sum).toBeGreaterThan(0)
  })
})

describe('gabarito SVG (FR-DF7.5)', () => {
  it('AC-DF7.5: unidades em mm (1:1) e barra de escala de 100 mm', () => {
    const svg = copeSvg(teeCage(), 'arm', 'N2')!
    expect(svg).toContain('width="')
    expect(svg).toMatch(/width="[\d.]+mm"/)
    expect(svg).toMatch(/height="[\d.]+mm"/)
    // largura do desenvolvimento = perímetro do tubo cortado + margens (2×15)
    const w = Number(svg.match(/width="([\d.]+)mm"/)![1])
    expect(w).toBeCloseTo(2 * Math.PI * 12.7 + 30, 0)
    // barra de escala: segmento de exatamente 100 unidades (= 100 mm em 1:1)
    const bar = svg.match(/<line x1="([\d.]+)" y1="[\d.]+" x2="([\d.]+)"[^/]*stroke-width="0.8"/)!
    expect(Number(bar[2]) - Number(bar[1])).toBeCloseTo(100, 5)
  })
})

describe('DF-2 v2 completo: g/mm de cordão (FR-DF2.5)', () => {
  it('weldPerMmG definido usa o cordão real; ausente cai no g/junta', () => {
    const cage = teeCage()
    const v1 = estimateMass(cage)
    const withMm: Cage = { ...cage, weightParams: { weldPerJointG: 30, weldPerMmG: 0.25 } }
    const v2 = estimateMass(withMm)
    expect(v2.weldKg).toBeCloseTo((totalWeldLength(cage) * 0.25) / 1000, 6)
    expect(v1.weldKg).not.toBeCloseTo(v2.weldKg, 6)
  })
})
