export interface Vec3 {
  x: number
  y: number
  z: number
}

export type NodeId = string

export type MemberType =
  | 'RRH'
  | 'RHO'
  | 'FBM_UP'
  | 'FBM_LOW'
  | 'SIM'
  | 'LFS'
  | 'ALC'
  | 'BLC'
  | 'CLC'
  | 'DLC'
  | 'FLC'
  | 'ILC'
  | 'SHC'
  | 'LDB'
  | 'LFDB'
  | 'USM'
  | 'ASB'
  | 'FAB_UP'
  | 'FAB_MID'
  | 'FAB_LOW'
  | 'RLC'
  | 'FREE'

// B6.2.2.2 / B6.2.2.3 — classificação primário vs secundário
export const PRIMARY_TYPES: MemberType[] = [
  'RRH',
  'RHO',
  'FBM_UP',
  'FBM_LOW',
  'ALC',
  'BLC',
  'CLC',
  'DLC',
  'FLC',
  'LFS',
  'SHC',
]

export const TYPE_LABELS: Record<MemberType, string> = {
  RRH: 'RRH, montante do Rear Roll Hoop',
  RHO: 'RHO, Roll Hoop Overhead',
  FBM_UP: 'FBM superior (C→D)',
  FBM_LOW: 'FBM inferior (D→F)',
  SIM: 'SIM, Side Impact Member',
  LFS: 'LFS, Lower Frame Side',
  ALC: 'ALC, travessa dos pontos A',
  BLC: 'BLC, travessa dos pontos B',
  CLC: 'CLC, travessa dos pontos C',
  DLC: 'DLC, travessa dos pontos D',
  FLC: 'FLC, travessa dos pontos F',
  ILC: 'ILC, travessa dos pontos I',
  SHC: 'SHC, travessa do cinto de ombro',
  LDB: 'LDB, diagonal do RRH',
  LFDB: 'LFDB, diagonal do assoalho',
  USM: 'USM, Under Seat Member',
  ASB: 'ASB, antissubmarina',
  FAB_UP: 'FAB superior (amarração)',
  FAB_MID: 'FAB intermediário (amarração)',
  FAB_LOW: 'FAB inferior (amarração)',
  RLC: 'RLC, travessa dos pontos R',
  FREE: 'Tubo genérico / reforço',
}

export interface Member {
  id: string
  type: MemberType
  a: NodeId
  b: NodeId
}

// DF-5 — ancoragem do suporte do volante: identidade fixa, posição livre (como US-4)
export interface SteeringMount {
  mode: 'central' | 'mesa'
  points: { id: 'SW' | 'SWL' | 'SWR'; pos: Vec3 }[]
  zoneRadiusMm?: number // raio da zona recomendada ao redor do punho do manequim (DF-4)
}

// DF-6 — passagem contínua: os dois membros do par são uma única peça que atravessa o nó
export interface Continuity {
  node: NodeId
  pair: [string, string]
}

export interface TubeSection {
  od: number // diâmetro externo, mm
  wall: number // espessura de parede, mm
  materialId: string // id no catálogo de aços (model/materials.ts) ou 'custom'
  custom?: SteelMaterialRef // presente quando materialId === 'custom'
}

// Espelho estrutural de SteelMaterial (materials.ts) para evitar import circular
export interface SteelMaterialRef {
  id: string
  label: string
  carbon: number
  youngGPa: number
  yieldMPa: number
  densityKgM3: number
}

export type AnchorRole = 'sup1' | 'sup2' | 'inf1' | 'inf2' | 'amort'

export interface Anchor {
  id: string
  axle: 'dianteira' | 'traseira'
  side: 'L' | 'R'
  role: AnchorRole
  pos: Vec3
}

export const ANCHOR_ROLE_LABELS: Record<AnchorRole, string> = {
  sup1: 'bandeja superior · ancoragem traseira',
  sup2: 'bandeja superior · ancoragem dianteira',
  inf1: 'bandeja inferior · ancoragem traseira',
  inf2: 'bandeja inferior · ancoragem dianteira',
  amort: 'amortecedor',
}

export function anchorLabel(a: Anchor): string {
  return `${a.axle} ${a.side} · ${ANCHOR_ROLE_LABELS[a.role]}`
}

export interface Cage {
  nodes: Record<NodeId, Vec3>
  members: Member[]
  // Ponto do "Geraldão": interseção do círculo R102 tangente ao assento e encosto (B6.2.4.3)
  geraldao: Vec3
  // Parte inferior do assento (referência B6.2.12.6)
  seatBottomY: number
  primarySection: TubeSection
  secondarySection: TubeSection
  // Nós marcados pelo usuário como ponto denominado (além dos ids padrão A/B/C…)
  namedExtra?: NodeId[]
  // Elementos travados no espaço (DF-23): ids de nós, ancoragens e pontos do volante.
  // Decisão de projeto — vai para o JSON, como `namedExtra` e `manikin`.
  locked?: string[]
  // Ancoragens da suspensão (bandejas e amortecedores)
  anchors?: Anchor[]
  // Passagens contínuas declaradas (DF-6): dois membros = uma peça física através do nó
  continuity?: Continuity[]
  // Ancoragem do suporte do volante (DF-5) — opt-in; STEER.1 valida quando presente
  steering?: SteeringMount
  // Configuração do manequim ergonômico (DF-4) — decisão de projeto, vai para o JSON
  manikin?: import('./manikin').ManikinConfig
  // Parâmetros da estimativa de massa (DF-2); exportados no JSON p/ reprodutibilidade
  weightParams?: {
    weldPerJointG: number // v1 — acréscimo por junta soldada (default 30 g)
    weldPerMmG?: number // v2 — g por mm de cordão (DF-7)
  }
}

// Pontos denominados do regulamento (B6.2.2.4) — sufixo L/R
export const NAMED_POINTS = ['A', 'B', 'C', 'D', 'F', 'H', 'I', 'S', 'O', 'P', 'R']

export function isNamedNode(id: NodeId): boolean {
  const base = id.replace(/[LR]$/, '')
  return /[LR]$/.test(id) && NAMED_POINTS.includes(base)
}

/** Ponto denominado: id padrão do regulamento OU marcado pelo usuário. */
export function isNamedIn(cage: Cage, id: NodeId): boolean {
  return isNamedNode(id) || (cage.namedExtra ?? []).includes(id)
}

/**
 * Travado no espaço (DF-23): o elemento não se move por arrasto, por campo numérico,
 * por cota, por giro de plano nem pelo espelho. Vale para nó, ancoragem e ponto do
 * volante — os três tipos com posição própria.
 */
export function isLocked(cage: Cage, id: string): boolean {
  return (cage.locked ?? []).includes(id)
}

/** Ids travados que ainda existem na gaiola — usado ao importar JSON. */
export function sanitizeLocked(cage: Cage): string[] {
  const known = new Set<string>([
    ...Object.keys(cage.nodes ?? {}),
    ...(cage.anchors ?? []).map((a) => a.id),
    ...(cage.steering?.points ?? []).map((p) => p.id),
  ])
  return [...new Set(cage.locked ?? [])].filter((id) => known.has(id))
}

export function mirrorId(id: NodeId): NodeId | null {
  if (id.endsWith('L')) return id.slice(0, -1) + 'R'
  if (id.endsWith('R')) return id.slice(0, -1) + 'L'
  return null
}
