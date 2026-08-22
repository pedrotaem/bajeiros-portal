import type { Anchor, Cage, Member, MemberType, Vec3 } from './types'
import { inferContinuity } from './continuity'

// Parâmetros do assistente de criação de gaiola do zero.
// Defaults escolhidos para nascer aderente ao B6.
export interface WizardParams {
  // Passo 1 — plano da corta-fogo (RRH)
  baseWidth: number // largura entre pontos A
  topWidth: number // largura entre pontos B
  height: number // altura dos pontos B
  topOffsetZ: number // recuo do topo (inclinação do RRH; ≤20°)
  seatY: number // ponto do Geraldão (Y)
  seatZ: number // ponto do Geraldão (Z)
  simY: number // altura dos pontos S
  shcY: number // altura do SHC (pontos H)
  // Passo 2 — chão (LFS)
  floorLen: number // z dos pontos F
  ilcZ: number // z da travessa ILC
  frontWidth: number // largura entre pontos F
  // Passo 3 — teto (RHO)
  cWidth: number
  cY: number
  cZ: number
  // Passo 4 — frente (FBM/SIM)
  dWidth: number
  dY: number
  dZ: number
  // Passo 6 — amarração
  bracing: 'rear' | 'front' | 'both'
  rearZ: number
  rearY: number
}

export const defaultParams: WizardParams = {
  baseWidth: 760,
  topWidth: 740,
  height: 1219,
  topOffsetZ: -107,
  seatY: 240,
  seatZ: 120,
  simY: 350,
  shcY: 690,
  floorLen: 1050,
  ilcZ: 600,
  frontWidth: 660,
  cWidth: 700,
  cY: 1290,
  cZ: 500,
  dWidth: 680,
  dY: 440,
  dZ: 900,
  bracing: 'rear',
  rearZ: -430,
  rearY: 500,
}

const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  z: a.z + (b.z - a.z) * t,
})

/** Constrói a gaiola até o passo indicado (1–6). */
export function buildCage(p: WizardParams, upTo: number): Cage {
  const nodes: Record<string, Vec3> = {}
  const members: Member[] = []
  let seq = 0
  const m = (type: MemberType, a: string, b: string) =>
    members.push({ id: `w${seq++}-${type}`, type, a, b })

  const hb = p.baseWidth / 2
  const ht = p.topWidth / 2

  // ---- Passo 1: corta-fogo (plano RRH) ----
  nodes.AL = { x: -hb, y: 0, z: 0 }
  nodes.AR = { x: hb, y: 0, z: 0 }
  nodes.BL = { x: -ht, y: p.height, z: p.topOffsetZ }
  nodes.BR = { x: ht, y: p.height, z: p.topOffsetZ }
  const onRRH = (side: 1 | -1, y: number): Vec3 => {
    const t = y / p.height
    return lerp(side < 0 ? nodes.AL : nodes.AR, side < 0 ? nodes.BL : nodes.BR, t)
  }
  nodes.SL = onRRH(-1, p.simY)
  nodes.SR = onRRH(1, p.simY)
  nodes.HL = onRRH(-1, p.shcY)
  nodes.HR = onRRH(1, p.shcY)
  nodes.LDB1 = onRRH(-1, 80)
  nodes.LDB2 = onRRH(1, p.height - 80)
  m('RRH', 'AL', 'SL')
  m('RRH', 'SL', 'HL')
  m('RRH', 'HL', 'BL')
  m('RRH', 'AR', 'SR')
  m('RRH', 'SR', 'HR')
  m('RRH', 'HR', 'BR')
  m('ALC', 'AL', 'AR')
  m('BLC', 'BL', 'BR')
  m('SHC', 'HL', 'HR')
  m('LDB', 'LDB1', 'LDB2')

  // ---- Passo 2: chão ----
  if (upTo >= 2) {
    const hf = p.frontWidth / 2
    nodes.FL = { x: -hf, y: 0, z: p.floorLen }
    nodes.FR = { x: hf, y: 0, z: p.floorLen }
    const tI = p.ilcZ / p.floorLen
    nodes.IL = lerp(nodes.AL, nodes.FL, tI)
    nodes.IR = lerp(nodes.AR, nodes.FR, tI)
    nodes.U1 = { x: 0, y: 0, z: 0 }
    nodes.U2 = { x: 0, y: 0, z: p.ilcZ }
    m('LFS', 'AL', 'IL')
    m('LFS', 'IL', 'FL')
    m('LFS', 'AR', 'IR')
    m('LFS', 'IR', 'FR')
    m('ILC', 'IL', 'IR')
    m('FLC', 'FL', 'FR')
    m('LFDB', 'AL', 'IR')
    m('USM', 'U1', 'U2')
  }

  // ---- Passo 3: teto ----
  if (upTo >= 3) {
    const hc = p.cWidth / 2
    nodes.CL = { x: -hc, y: p.cY, z: p.cZ }
    nodes.CR = { x: hc, y: p.cY, z: p.cZ }
    m('RHO', 'BL', 'CL')
    m('RHO', 'BR', 'CR')
    m('CLC', 'CL', 'CR')
  }

  // ---- Passo 4: frente ----
  if (upTo >= 4) {
    const hd = p.dWidth / 2
    nodes.DL = { x: -hd, y: p.dY, z: p.dZ }
    nodes.DR = { x: hd, y: p.dY, z: p.dZ }
    m('FBM_UP', 'CL', 'DL')
    m('FBM_UP', 'CR', 'DR')
    m('DLC', 'DL', 'DR')
    m('FBM_LOW', 'DL', 'FL')
    m('FBM_LOW', 'DR', 'FR')
    m('SIM', 'SL', 'DL')
    m('SIM', 'SR', 'DR')
  }

  // Vértices do travamento traseiro (usados nas ancoragens e no passo 6)
  const RL: Vec3 = { x: -ht + 10, y: p.rearY, z: p.rearZ }
  const RR: Vec3 = { x: ht - 10, y: p.rearY, z: p.rearZ }

  // ---- Passo 5: ancoragens da suspensão ----
  let anchors: Anchor[] = []
  if (upTo >= 5) {
    const pair = (axle: Anchor['axle'], role: Anchor['role'], left: Vec3): Anchor[] => [
      { id: `${axle}-${role}-L`, axle, side: 'L', role, pos: left },
      { id: `${axle}-${role}-R`, axle, side: 'R', role, pos: { x: -left.x, y: left.y, z: left.z } },
    ]
    const tOnIF = (z: number) => (z - p.ilcZ) / (p.floorLen - p.ilcZ)
    anchors = [
      // dianteira: bandeja inferior no LFS, superior no SIM, amortecedor no FBM superior
      ...pair('dianteira', 'inf1', lerp(nodes.IL, nodes.FL, tOnIF(p.ilcZ + 10))),
      ...pair(
        'dianteira',
        'inf2',
        lerp(nodes.IL, nodes.FL, tOnIF(p.ilcZ + (p.floorLen - p.ilcZ) * 0.55)),
      ),
      ...pair('dianteira', 'sup1', lerp(nodes.SL, nodes.DL, 0.73)),
      ...pair('dianteira', 'sup2', lerp(nodes.SL, nodes.DL, 0.9)),
      ...pair('dianteira', 'amort', lerp(nodes.CL, nodes.DL, 0.7)),
      // traseira: sobre as linhas da futura amarração traseira (soltas até o passo 6)
      ...pair('traseira', 'inf1', lerp(nodes.AL, RL, 0.25)),
      ...pair('traseira', 'inf2', lerp(nodes.AL, RL, 0.75)),
      ...pair('traseira', 'sup1', lerp(nodes.SL, RL, 0.3)),
      ...pair('traseira', 'sup2', lerp(nodes.SL, RL, 0.8)),
      ...pair('traseira', 'amort', lerp(nodes.BL, RL, 0.5)),
    ]
  }

  // ---- Passo 6: amarração ----
  if (upTo >= 6) {
    if (p.bracing === 'rear' || p.bracing === 'both') {
      nodes.RL = RL
      nodes.RR = RR
      m('FAB_UP', 'BL', 'RL')
      m('FAB_UP', 'BR', 'RR')
      m('FAB_MID', 'SL', 'RL')
      m('FAB_MID', 'SR', 'RR')
      m('FAB_LOW', 'AL', 'RL')
      m('FAB_LOW', 'AR', 'RR')
      m('RLC', 'RL', 'RR')
    }
    if (p.bracing === 'front' || p.bracing === 'both') {
      // junção no FBM superior a ~120 mm (vertical) do ponto C, pontos P no SIM,
      // e suporte vertical de P ao LFS (B6.2.14.3)
      const tFU = 120 / Math.max(1, p.cY - p.dY)
      nodes.FUL = lerp(nodes.CL, nodes.DL, tFU)
      nodes.FUR = lerp(nodes.CR, nodes.DR, tFU)
      const tP = (350 - nodes.SL.z) / (nodes.DL.z - nodes.SL.z)
      nodes.PL = lerp(nodes.SL, nodes.DL, tP)
      nodes.PR = lerp(nodes.SR, nodes.DR, tP)
      const tQ = 350 / p.ilcZ
      nodes.QL = lerp(nodes.AL, nodes.IL, tQ)
      nodes.QR = lerp(nodes.AR, nodes.IR, tQ)
      m('FAB_UP', 'FUL', 'PL')
      m('FAB_UP', 'FUR', 'PR')
      m('FAB_LOW', 'PL', 'QL')
      m('FAB_LOW', 'PR', 'QR')
    }
  }

  const cage: Cage = {
    nodes,
    members,
    geraldao: { x: 0, y: p.seatY, z: p.seatZ },
    seatBottomY: 100,
    // Mesmas seções default do template — ver comentário em template.ts (FEI 2014 + literatura)
    primarySection: { od: 31.75, wall: 1.65, materialId: '4130' },
    secondarySection: { od: 25.4, wall: 0.9, materialId: '4130' },
    namedExtra: [],
    anchors,
  }
  // DF-6: declara as passagens fisicamente óbvias da gaiola gerada
  cage.continuity = inferContinuity(cage)
  return cage
}
