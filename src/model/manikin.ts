import type { Vec3 } from './types'

/**
 * Manequim ergonômico 2D no plano de simetria (DF-4 v1).
 * Comprimentos segmentares como frações da estatura (modelo proporcional de
 * Drillis & Contini, 1966 — fonte pública clássica de antropometria); estaturas
 * de referência aproximadas de tabelas antropométricas públicas (ANSUR/IBGE).
 * Tabela própria — nenhum conteúdo copiado de material protegido.
 */

export interface AnthroProfile {
  id: string
  label: string
  statureMm: number
  massKg: number
}

export const PROFILES: AnthroProfile[] = [
  { id: 'F-P5', label: 'Mulher P5', statureMm: 1510, massKg: 49 },
  { id: 'F-P50', label: 'Mulher P50', statureMm: 1610, massKg: 62 },
  { id: 'M-P50', label: 'Homem P50', statureMm: 1750, massKg: 78 },
  { id: 'M-P95', label: 'Homem P95', statureMm: 1860, massKg: 98 },
]

// Frações da estatura H (Drillis & Contini, 1966)
const FRAC = {
  thigh: 0.245,
  shank: 0.246,
  foot: 0.152,
  trunk: 0.288, // quadril → ombro
  upperArm: 0.186,
  forearm: 0.146,
  headNeck: 0.182, // ombro → topo da cabeça
}

export type JointId = 'recline' | 'hip' | 'knee' | 'ankle' | 'shoulder' | 'elbow'

/** Faixas ergonômicas recomendadas (graus) — recomendação de projeto, não norma. */
export const JOINT_RANGES: Record<
  JointId,
  { min: number; max: number; label: string; why: string }
> = {
  recline: {
    min: 10,
    max: 25,
    label: 'reclinação do tronco',
    why: 'suporte lombar sem escorregar do assento',
  },
  hip: { min: 95, max: 120, label: 'quadril (tronco–coxa)', why: 'pressão femoral e visibilidade' },
  knee: { min: 100, max: 140, label: 'joelho', why: 'conforto e força de frenagem' },
  ankle: { min: 90, max: 110, label: 'tornozelo', why: 'modulação de pedal sem fadiga' },
  shoulder: {
    min: 10,
    max: 45,
    label: 'ombro (flexão do braço)',
    why: 'alcance do volante sem tirar as costas do encosto',
  },
  elbow: { min: 100, max: 140, label: 'cotovelo', why: 'esterço completo com folga articular' },
}

export interface ManikinConfig {
  profileMin: string
  profileMax: string
  angles: Record<JointId, number>
  seatPadMm: number
  helmetRadiusMm: number
}

export function defaultManikin(): ManikinConfig {
  return {
    profileMin: 'F-P5',
    profileMax: 'M-P95',
    angles: { recline: 20, hip: 100, knee: 120, ankle: 100, shoulder: 30, elbow: 120 },
    seatPadMm: 50,
    helmetRadiusMm: 130,
  }
}

export function profileById(id: string): AnthroProfile {
  return PROFILES.find((p) => p.id === id) ?? PROFILES[PROFILES.length - 1]
}

export type LandmarkId =
  'hip' | 'knee' | 'ankle' | 'heel' | 'toe' | 'shoulder' | 'elbow' | 'wrist' | 'helmetTop'

// H-point ~90 mm à frente do plano do encosto (ponto do Geraldão) — aproximação documentada
const HIP_FORWARD_MM = 90

/**
 * Resolve a cadeia cinemática no plano x = 0 (y ↑, z → frente).
 * Ângulos de articulação são internos entre segmentos adjacentes; a reclinação é
 * medida da vertical. Convenção: ângulo de segmento medido do eixo +z (horário +y).
 */
export function solveManikin(
  cfg: ManikinConfig,
  profile: AnthroProfile,
  seatBottomY: number,
  geraldaoZ: number,
): Record<LandmarkId, Vec3> {
  const H = profile.statureMm
  const a = cfg.angles
  const rad = (deg: number) => (deg * Math.PI) / 180
  const dir = (deg: number): Vec3 => ({ x: 0, y: Math.sin(rad(deg)), z: Math.cos(rad(deg)) })
  const walk = (from: Vec3, deg: number, lenMm: number): Vec3 => {
    const d = dir(deg)
    return { x: 0, y: from.y + d.y * lenMm, z: from.z + d.z * lenMm }
  }

  const hip: Vec3 = { x: 0, y: seatBottomY + cfg.seatPadMm, z: geraldaoZ + HIP_FORWARD_MM }

  const torsoAngle = 90 + a.recline // para cima, inclinado para trás
  const shoulder = walk(hip, torsoAngle, FRAC.trunk * H)
  const helmetTop = walk(shoulder, torsoAngle, FRAC.headNeck * H + cfg.helmetRadiusMm)

  const thighAngle = torsoAngle - a.hip
  const knee = walk(hip, thighAngle, FRAC.thigh * H)
  const shankAngle = thighAngle - (180 - a.knee)
  const ankle = walk(knee, shankAngle, FRAC.shank * H)
  const footAngle = shankAngle + (180 - a.ankle)
  const toe = walk(ankle, footAngle, FRAC.foot * H)
  const heel = ankle // aproximação v1: calcanhar no ponto do tornozelo

  const upperArmAngle = torsoAngle - 180 + a.shoulder
  const elbow = walk(shoulder, upperArmAngle, FRAC.upperArm * H)
  const forearmAngle = upperArmAngle + (180 - a.elbow)
  const wrist = walk(elbow, forearmAngle, FRAC.forearm * H)

  return { hip, knee, ankle, heel, toe, shoulder, elbow, wrist, helmetTop }
}

/** Leituras derivadas do painel (FR-DF4.7). */
export function manikinReadings(lm: Record<LandmarkId, Vec3>) {
  return {
    hipToHeelMm: Math.hypot(lm.heel.y - lm.hip.y, lm.heel.z - lm.hip.z),
    helmetTopY: lm.helmetTop.y,
    wrist: lm.wrist,
    heel: lm.heel,
  }
}
