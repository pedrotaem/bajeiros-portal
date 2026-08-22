import type { TubeSection } from './types'

/**
 * Catálogo de aços para tubos da gaiola (DF-1).
 * Propriedades nominais de fontes metalúrgicas genéricas (tubo trefilado/normalizado),
 * não derivadas do texto do regulamento.
 */
export interface SteelMaterial {
  id: string // '1018', '4130', 'custom'
  label: string // "SAE 1018"
  carbon: number // %C nominal
  youngGPa: number // E — módulo de elasticidade
  yieldMPa: number // Sy — tensão de escoamento
  densityKgM3: number
}

export const STEELS: SteelMaterial[] = [
  { id: '1010', label: 'SAE 1010', carbon: 0.1, youngGPa: 205, yieldMPa: 305, densityKgM3: 7870 },
  { id: '1018', label: 'SAE 1018', carbon: 0.18, youngGPa: 205, yieldMPa: 370, densityKgM3: 7870 },
  { id: '1020', label: 'SAE 1020', carbon: 0.2, youngGPa: 205, yieldMPa: 350, densityKgM3: 7870 },
  { id: '1026', label: 'SAE 1026', carbon: 0.26, youngGPa: 205, yieldMPa: 415, densityKgM3: 7860 },
  { id: '4130', label: 'SAE 4130', carbon: 0.3, youngGPa: 205, yieldMPa: 435, densityKgM3: 7850 },
]

export const DEFAULT_MATERIAL_ID = '1018'

/** Faixas plausíveis para material customizado (FR-DF1.2) — fora delas ⇒ warn. */
export const PLAUSIBLE = {
  youngGPa: [180, 220] as const,
  yieldMPa: [180, 1200] as const,
  densityKgM3: [7500, 8100] as const,
  carbon: [0.03, 1.5] as const,
}

export function materialOf(s: TubeSection): SteelMaterial {
  if (s.materialId === 'custom' && s.custom) return s.custom
  return (
    STEELS.find((m) => m.id === s.materialId) ?? STEELS.find((m) => m.id === DEFAULT_MATERIAL_ID)!
  )
}

export function carbonOf(s: TubeSection): number {
  return materialOf(s).carbon
}

/** Momento de inércia de área da seção anular, mm⁴. */
export function sectionI(s: TubeSection): number {
  const idr = s.od - 2 * s.wall
  return (Math.PI / 64) * (s.od ** 4 - idr ** 4)
}

/** Área da seção anular, mm². */
export function sectionArea(s: TubeSection): number {
  const idr = s.od - 2 * s.wall
  return (Math.PI / 4) * (s.od ** 2 - idr ** 2)
}

/** Rigidez à flexão E·I, N·mm² (E em GPa → N/mm² ×1000). */
export function bendingStiffness(s: TubeSection): number {
  return materialOf(s).youngGPa * 1000 * sectionI(s)
}

/** Resistência à flexão Sy·I/c, N·mm (c = od/2). */
export function bendingStrength(s: TubeSection): number {
  return (materialOf(s).yieldMPa * sectionI(s)) / (s.od / 2)
}

/**
 * Tubo de referência da equivalência B6.3.3.2 (mesmos valores já adotados
 * pelo motor no MVP): aço SAE 1018, Ø 25,4 mm × parede 3,05 mm.
 */
export const REFERENCE_SECTION: TubeSection = { od: 25.4, wall: 3.05, materialId: '1018' }

/**
 * Migração FR-DF1.6: seção antiga tinha `carbon` manual e não tinha `materialId`.
 * Regra documentada: %C que casa um aço do catálogo ⇒ esse aço; senão material
 * customizado preservando o %C com E/Sy/ρ do default (SAE 1018).
 */
export function migrateSection(raw: unknown): TubeSection {
  const r = (raw ?? {}) as Partial<TubeSection> & { carbon?: number }
  const od = typeof r.od === 'number' ? r.od : 25.4
  const wall = typeof r.wall === 'number' ? r.wall : 3.05
  if (typeof r.materialId === 'string') {
    return { od, wall, materialId: r.materialId, ...(r.custom ? { custom: r.custom } : {}) }
  }
  if (typeof r.carbon === 'number') {
    const match = STEELS.find((m) => Math.abs(m.carbon - r.carbon!) < 0.005)
    if (match) return { od, wall, materialId: match.id }
    const base = STEELS.find((m) => m.id === DEFAULT_MATERIAL_ID)!
    return {
      od,
      wall,
      materialId: 'custom',
      custom: { ...base, id: 'custom', label: 'Customizado (migrado)', carbon: r.carbon },
    }
  }
  return { od, wall, materialId: DEFAULT_MATERIAL_ID }
}
