import { describe, expect, it } from 'vitest'
import { evaluate } from './b6'
import { templateCage } from '../model/template'
import type { Cage, TubeSection } from '../model/types'

const byId = (cage: Cage, id: string) => evaluate(cage).find((r) => r.id === id)

function withPrimary(section: TubeSection): Cage {
  return { ...structuredClone(templateCage), primarySection: section }
}

describe('B6.3.3.1 / B6.3.3.2 (DF-1)', () => {
  it('template padrão (4130 Ø31,75×1,60 da literatura): passa via equivalência B6.3.3.2', () => {
    const cage = structuredClone(templateCage)
    expect(byId(cage, 'B6.3.3.1')?.status).toBe('pass')
    expect(byId(cage, 'B6.3.3.2')?.status).toBe('pass')
  })

  it('seção de referência do regulamento: passa direto, equivalência não é emitida', () => {
    const cage = withPrimary({ od: 25.4, wall: 3.05, materialId: '1018' })
    expect(byId(cage, 'B6.3.3.1')?.status).toBe('pass')
    expect(byId(cage, 'B6.3.3.2')).toBeUndefined()
  })

  it('AC-DF1.2: seção fora do padrão passa com 4130 e falha com 1010', () => {
    const s4130 = withPrimary({ od: 31.75, wall: 1.57, materialId: '4130' })
    expect(byId(s4130, 'B6.3.3.2')?.status).toBe('pass')
    expect(byId(s4130, 'B6.3.3.1')?.status).toBe('pass')

    const s1010 = withPrimary({ od: 31.75, wall: 1.57, materialId: '1010' })
    const eq = byId(s1010, 'B6.3.3.2')
    expect(eq?.status).toBe('fail')
    expect(eq?.measured).toBeTruthy()
    expect(eq?.limit).toBeTruthy()
    expect(byId(s1010, 'B6.3.3.1')?.status).toBe('fail')
  })

  it('AC-DF1.4: %C do checklist deriva do material', () => {
    const s = withPrimary({ od: 25.4, wall: 3.05, materialId: '4130' })
    expect(byId(s, 'B6.3.3.1')?.measured).toContain('SAE 4130')
    expect(byId(s, 'B6.3.3.1')?.measured).toContain('0,30')
  })

  it('parede abaixo de 1,57 mm falha sem caminho de equivalência', () => {
    const s = withPrimary({ od: 25.4, wall: 1.2, materialId: '4130' })
    expect(byId(s, 'B6.3.3.1')?.status).toBe('fail')
    expect(byId(s, 'B6.3.3.2')).toBeUndefined()
  })

  it('material com %C < 0,18 falha mesmo com seção padrão', () => {
    const s = withPrimary({ od: 25.4, wall: 3.05, materialId: '1010' })
    expect(byId(s, 'B6.3.3.1')?.status).toBe('fail')
  })
})

describe('MAT.1 — plausibilidade do material customizado (FR-DF1.2)', () => {
  it('E fora de 180–220 GPa gera warn', () => {
    const cage = withPrimary({
      od: 25.4,
      wall: 3.05,
      materialId: 'custom',
      custom: {
        id: 'custom',
        label: 'X',
        carbon: 0.2,
        youngGPa: 120,
        yieldMPa: 370,
        densityKgM3: 7870,
      },
    })
    expect(byId(cage, 'MAT.1')?.status).toBe('warn')
  })
  it('custom plausível não gera MAT.1', () => {
    const cage = withPrimary({
      od: 25.4,
      wall: 3.05,
      materialId: 'custom',
      custom: {
        id: 'custom',
        label: 'X',
        carbon: 0.2,
        youngGPa: 205,
        yieldMPa: 420,
        densityKgM3: 7870,
      },
    })
    expect(byId(cage, 'MAT.1')).toBeUndefined()
  })
})

describe('B6.3.4.1 secundário (DF-1)', () => {
  it('%C do secundário também deriva do material', () => {
    const cage: Cage = {
      ...structuredClone(templateCage),
      secondarySection: { od: 25.4, wall: 0.89, materialId: '1010' },
    }
    expect(byId(cage, 'B6.3.4.1')?.status).toBe('fail')
  })
})
