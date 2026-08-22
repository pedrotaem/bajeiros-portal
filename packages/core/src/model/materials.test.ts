import { describe, expect, it } from 'vitest'
import {
  REFERENCE_SECTION,
  STEELS,
  bendingStiffness,
  bendingStrength,
  materialOf,
  migrateSection,
  sectionArea,
  sectionI,
} from './materials'
import type { TubeSection } from './types'

describe('catálogo', () => {
  it('contém os cinco aços mínimos da FR-DF1.1', () => {
    for (const id of ['1010', '1018', '1020', '1026', '4130']) {
      expect(
        STEELS.find((m) => m.id === id),
        id,
      ).toBeDefined()
    }
  })
  it('materialOf resolve catálogo, custom e fallback', () => {
    expect(materialOf({ od: 25.4, wall: 3.05, materialId: '4130' }).yieldMPa).toBe(435)
    const custom: TubeSection = {
      od: 25.4,
      wall: 3.05,
      materialId: 'custom',
      custom: {
        id: 'custom',
        label: 'X',
        carbon: 0.2,
        youngGPa: 200,
        yieldMPa: 500,
        densityKgM3: 7800,
      },
    }
    expect(materialOf(custom).yieldMPa).toBe(500)
    expect(materialOf({ od: 25.4, wall: 3.05, materialId: 'inexistente' }).id).toBe('1018')
  })
})

describe('propriedades de seção', () => {
  const ref = REFERENCE_SECTION
  it('I e A da seção de referência (25,4 × 3,05)', () => {
    expect(sectionI(ref)).toBeCloseTo(13621, -1) // mm⁴, ±5
    expect(sectionArea(ref)).toBeCloseTo(214.2, 0) // mm²
  })
  it('E·I e Sy·I/c da referência', () => {
    expect(bendingStiffness(ref)).toBeCloseTo(205e3 * sectionI(ref), 3)
    expect(bendingStrength(ref)).toBeCloseTo((370 * sectionI(ref)) / 12.7, 3)
  })
})

describe('migração FR-DF1.6', () => {
  it('%C que casa o catálogo vira o aço correspondente', () => {
    expect(migrateSection({ od: 25.4, wall: 3.05, carbon: 0.18 }).materialId).toBe('1018')
    expect(migrateSection({ od: 25.4, wall: 0.89, carbon: 0.3 }).materialId).toBe('4130')
  })
  it('%C sem correspondência vira customizado preservando o carbono', () => {
    const s = migrateSection({ od: 25.4, wall: 3.05, carbon: 0.22 })
    expect(s.materialId).toBe('custom')
    expect(s.custom?.carbon).toBe(0.22)
    expect(s.custom?.youngGPa).toBe(205)
  })
  it('seção já migrada passa intocada; ausência de tudo vira default', () => {
    expect(migrateSection({ od: 30, wall: 2, materialId: '4130' })).toEqual({
      od: 30,
      wall: 2,
      materialId: '4130',
    })
    expect(migrateSection(undefined).materialId).toBe('1018')
  })
})
