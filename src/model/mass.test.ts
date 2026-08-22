import { describe, expect, it } from 'vitest'
import { countJoints, estimateMass, removalMassDelta } from './mass'
import { sectionArea } from './materials'
import { templateCage } from './template'
import type { Cage } from './types'

/** Gaiola sintética: 2 tubos primários de 1000 mm em L, seção 25,4×3,05, 1018 (ρ 7870). */
function synthetic(): Cage {
  return {
    nodes: {
      N1: { x: 0, y: 0, z: 0 },
      N2: { x: 0, y: 1000, z: 0 },
      N3: { x: 0, y: 1000, z: 1000 },
    },
    members: [
      { id: 'm1', type: 'RRH', a: 'N1', b: 'N2' },
      { id: 'm2', type: 'RRH', a: 'N2', b: 'N3' },
    ],
    geraldao: { x: 0, y: 0, z: 0 },
    seatBottomY: 0,
    primarySection: { od: 25.4, wall: 3.05, materialId: '1018' },
    secondarySection: { od: 25.4, wall: 0.89, materialId: '1018' },
  }
}

describe('estimateMass (DF-2 v1)', () => {
  it('massa de tubo bate com cálculo manual (AC-DF2.1)', () => {
    const cage = synthetic()
    const r = estimateMass(cage)
    // 1000 mm × A × 7870 kg/m³; A(25,4×3,05) ≈ 214,17 mm² → ≈ 1685,5 g por tubo
    const expected = (1000 * sectionArea(cage.primarySection) * 7870) / 1e6
    expect(r.perMember.m1).toBeCloseTo(expected, 0)
    expect(r.primaryKg).toBeCloseTo((2 * expected) / 1000, 2)
    // 1 nó compartilhado (N2, grau 2) = 1 junta × 30 g
    expect(r.jointCount).toBe(1)
    expect(r.weldKg).toBeCloseTo(0.03, 5)
    expect(r.totalKg).toBeCloseTo((2 * expected + 30) / 1000, 2)
  })

  it('AC-DF2.2: trocar 1018 → 4130 muda a massa pela razão de densidades', () => {
    const cage = synthetic()
    const base = estimateMass(cage).primaryKg
    const c4130: Cage = { ...cage, primarySection: { ...cage.primarySection, materialId: '4130' } }
    expect(estimateMass(c4130).primaryKg).toBeCloseTo(base * (7850 / 7870), 4)
  })

  it('AC-DF2.3: novo membro entre nós existentes soma tubo + 2 juntas', () => {
    const cage = synthetic()
    const before = estimateMass(cage)
    const withNew: Cage = {
      ...cage,
      members: [...cage.members, { id: 'm3', type: 'FREE', a: 'N1', b: 'N3' }],
    }
    const after = estimateMass(withNew)
    expect(after.jointCount).toBe(before.jointCount + 2)
    expect(after.totalKg).toBeGreaterThan(before.totalKg)
  })

  it('AC-DF2.4: removalMassDelta = tubo + juntas desfeitas', () => {
    const cage = synthetic()
    const r = estimateMass(cage)
    // remover m2: some o tubo (~1685 g) e a junta em N2 (30 g)
    expect(removalMassDelta(cage, 'm2', r)).toBeCloseTo((r.perMember.m2 ?? 0) + 30, 5)
  })

  it('parametrização g/junta (FR-DF2.2/2.6)', () => {
    const cage: Cage = { ...synthetic(), weightParams: { weldPerJointG: 50 } }
    expect(estimateMass(cage).weldKg).toBeCloseTo(0.05, 5)
  })

  it('nó de grau 3 conta 2 juntas', () => {
    const cage = synthetic()
    cage.members.push({ id: 'm3', type: 'FREE', a: 'N2', b: 'N1' })
    // N2 agora grau 3 → 2 juntas; N1 grau 2 → 1 junta
    expect(countJoints(cage)).toBe(3)
  })

  it('template: relatório sano (total > 0, juntas > 0, tolerante a modelo parcial)', () => {
    const r = estimateMass(templateCage)
    expect(r.totalKg).toBeGreaterThan(5)
    expect(r.totalKg).toBeLessThan(100)
    expect(r.jointCount).toBeGreaterThan(10)
  })
})
