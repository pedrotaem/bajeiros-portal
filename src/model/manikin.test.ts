import { describe, expect, it } from 'vitest'
import {
  JOINT_RANGES,
  PROFILES,
  defaultManikin,
  manikinReadings,
  profileById,
  solveManikin,
} from './manikin'
import { evaluate } from '../rules/b6'
import { templateCage } from './template'

const cfg = defaultManikin()

describe('solveManikin (DF-4)', () => {
  it('AC-DF4.1: percentis mudam estatura e alcances de forma consistente', () => {
    const p5 = solveManikin(cfg, profileById('F-P5'), 100, 120)
    const p95 = solveManikin(cfg, profileById('M-P95'), 100, 120)
    const reach5 = manikinReadings(p5).hipToHeelMm
    const reach95 = manikinReadings(p95).hipToHeelMm
    expect(reach95).toBeGreaterThan(reach5)
    // razão de alcance ≈ razão de estatura (mesmos ângulos, segmentos proporcionais)
    expect(reach95 / reach5).toBeCloseTo(1860 / 1510, 2)
    expect(manikinReadings(p95).helmetTopY).toBeGreaterThan(manikinReadings(p5).helmetTopY)
  })

  it('geometria: comprimentos de segmento batem as frações de Drillis & Contini', () => {
    const H = 1750
    const lm = solveManikin(cfg, profileById('M-P50'), 100, 120)
    const seg = (a: keyof typeof lm, b: keyof typeof lm) =>
      Math.hypot(lm[a].y - lm[b].y, lm[a].z - lm[b].z)
    expect(seg('hip', 'knee')).toBeCloseTo(0.245 * H, 6)
    expect(seg('knee', 'ankle')).toBeCloseTo(0.246 * H, 6)
    expect(seg('hip', 'shoulder')).toBeCloseTo(0.288 * H, 6)
    expect(seg('shoulder', 'elbow')).toBeCloseTo(0.186 * H, 6)
    expect(seg('elbow', 'wrist')).toBeCloseTo(0.146 * H, 6)
  })

  it('AC-DF4.4: alterar seatBottomY translada o manequim inteiro em y', () => {
    const a = solveManikin(cfg, profileById('M-P50'), 100, 120)
    const b = solveManikin(cfg, profileById('M-P50'), 300, 120)
    for (const k of Object.keys(a) as (keyof typeof a)[]) {
      expect(b[k].y - a[k].y).toBeCloseTo(200, 6)
      expect(b[k].z).toBeCloseTo(a[k].z, 6)
    }
  })

  it('todos os defaults caem dentro das faixas recomendadas', () => {
    for (const [j, range] of Object.entries(JOINT_RANGES)) {
      const v = cfg.angles[j as keyof typeof cfg.angles]
      expect(v, j).toBeGreaterThanOrEqual(range.min)
      expect(v, j).toBeLessThanOrEqual(range.max)
    }
  })

  it('tabela tem os 4 perfis mínimos (FR-DF4.1)', () => {
    for (const id of ['F-P5', 'F-P50', 'M-P50', 'M-P95']) {
      expect(
        PROFILES.find((p) => p.id === id),
        id,
      ).toBeDefined()
    }
  })

  it('AC-DF4.5/4.6: manequim no Cage não altera nenhum resultado B6', () => {
    const without = evaluate(templateCage)
    const withManikin = evaluate({ ...structuredClone(templateCage), manikin: defaultManikin() })
    expect(withManikin.map((r) => `${r.id}:${r.status}`)).toEqual(
      without.map((r) => `${r.id}:${r.status}`),
    )
  })
})
