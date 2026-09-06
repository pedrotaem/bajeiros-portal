import type {
  Anchor,
  AnchorRole,
  Axle,
  AxleSuspension,
  Cage,
  Side,
  SuspensionConfig,
  SuspensionType,
  TireSpec,
  Vec3,
} from './types'

// DF-30 — suspensão. Módulo puro: papéis de ancoragem por tipo, reconciliação do conjunto ao
// trocar o tipo, medidas derivadas (entre-eixos, bitola) e os corpos genéricos que a cena
// desenha. Nada aqui grava geometria além das ancoragens: corpo é derivado, como junta e plano.

export const SUSPENSION_TYPES_BY_AXLE: Record<Axle, readonly SuspensionType[]> = {
  dianteira: ['duplo-a', 'mcpherson'],
  traseira: ['duplo-a', 'semi-trailing', 'trailing'],
}

export const SUSPENSION_TYPE_LABELS: Record<SuspensionType, string> = {
  'duplo-a': 'duplo A',
  mcpherson: 'McPherson',
  'semi-trailing': 'braço semi-arrastado',
  trailing: 'braço arrastado',
}

/** Papéis de ancoragem que cada tipo exige POR RODA (o conjunto é o mesmo nos dois lados). */
export const ANCHOR_ROLES_BY_TYPE: Record<SuspensionType, readonly AnchorRole[]> = {
  'duplo-a': ['sup1', 'sup2', 'inf1', 'inf2', 'amort'],
  mcpherson: ['inf1', 'inf2', 'amort'],
  'semi-trailing': ['inf1', 'inf2', 'amort'],
  trailing: ['inf1', 'inf2', 'amort'],
}

/** Tolerância de modelagem entre o entre-eixos declarado e o medido (SUSP.2). */
export const WHEELBASE_TOL_MM = 5

/** 22×7-10: o pneu mais comum do Baja brasileiro. */
export function defaultTire(): TireSpec {
  return { od: 559, width: 178, rim: 254 }
}

export const AXLES: readonly Axle[] = ['dianteira', 'traseira']
export const SIDES: readonly Side[] = ['L', 'R']

export function anchorId(axle: Axle, role: AnchorRole, side: Side): string {
  return `${axle}-${role}-${side}`
}

export function isTypeAllowed(axle: Axle, type: string): type is SuspensionType {
  return (SUSPENSION_TYPES_BY_AXLE[axle] as readonly string[]).includes(type)
}

const mirror = (p: Vec3): Vec3 => ({ x: -p.x, y: p.y, z: p.z })
const round = (p: Vec3): Vec3 => ({ x: Math.round(p.x), y: Math.round(p.y), z: Math.round(p.z) })
const mean = (ps: Vec3[]): Vec3 => {
  const n = Math.max(1, ps.length)
  return {
    x: ps.reduce((a, p) => a + p.x, 0) / n,
    y: ps.reduce((a, p) => a + p.y, 0) / n,
    z: ps.reduce((a, p) => a + p.z, 0) / n,
  }
}

/** Lado L de uma ancoragem: a posição do L, ou o espelho do R quando só o R existe. */
function leftOf(anchors: Anchor[], axle: Axle, role: AnchorRole): Vec3 | null {
  const l = anchors.find((a) => a.axle === axle && a.role === role && a.side === 'L')
  if (l) return l.pos
  const r = anchors.find((a) => a.axle === axle && a.role === role && a.side === 'R')
  return r ? mirror(r.pos) : null
}

/**
 * Tipo inferido das ancoragens presentes: bandeja superior nos dois papéis ⇒ duplo A; senão
 * o tipo de três pontos do eixo (McPherson na frente, braço arrastado atrás).
 */
export function inferType(anchors: Anchor[], axle: Axle): SuspensionType {
  const has = (role: AnchorRole) => anchors.some((a) => a.axle === axle && a.role === role)
  if (has('sup1') && has('sup2')) return 'duplo-a'
  return axle === 'dianteira' ? 'mcpherson' : 'trailing'
}

/**
 * Centro de roda default de um eixo (lado L): fora da ancoragem mais externa (|x| máx + 250),
 * na altura média das bandejas e no z médio delas. Sem ancoragem no eixo, um chute honesto
 * relativo ao Geraldão — o usuário vai arrastar de qualquer jeito.
 */
export function defaultWheelCenter(cage: Cage, axle: Axle): Vec3 {
  const arms = (cage.anchors ?? []).filter((a) => a.axle === axle && a.role !== 'amort')
  if (!arms.length) {
    const g = cage.geraldao
    return { x: -600, y: g.y + 50, z: axle === 'dianteira' ? g.z + 700 : g.z - 400 }
  }
  const maxX = Math.max(...arms.map((a) => Math.abs(a.pos.x)))
  const m = mean(arms.map((a) => a.pos))
  return round({ x: -(maxX + 250), y: m.y, z: m.z })
}

/** Configuração inicial a partir do que a gaiola já tem (FR-DF30.3). */
export function defaultSuspension(cage: Cage): SuspensionConfig {
  const anchors = cage.anchors ?? []
  const axle = (a: Axle): AxleSuspension => ({
    type: inferType(anchors, a),
    wheelCenter: defaultWheelCenter(cage, a),
    tire: defaultTire(),
  })
  const dianteira = axle('dianteira')
  const traseira = axle('traseira')
  return {
    wheelbaseMm: Math.round(Math.abs(traseira.wheelCenter.z - dianteira.wheelCenter.z)),
    dianteira,
    traseira,
  }
}

/**
 * Reconcilia as ancoragens de UM eixo com um tipo (FR-DF30.4): mantém as que têm papel no tipo,
 * remove as sem papel, cria as que faltam a partir das vizinhas — sempre em par L/R espelhado.
 * As ancoragens do outro eixo saem intocadas e na mesma ordem.
 */
export function reconcileAnchors(
  anchors: Anchor[],
  axle: Axle,
  type: SuspensionType,
  wheelCenter: Vec3,
): Anchor[] {
  const roles = ANCHOR_ROLES_BY_TYPE[type]
  const kept = anchors.filter((a) => a.axle !== axle || roles.includes(a.role))
  const left = (role: AnchorRole) => leftOf(kept, axle, role)
  const c = wheelCenter.x <= 0 ? wheelCenter : mirror(wheelCenter)

  // posição default (lado L) de um papel ausente, derivada do que existe
  const guess = (role: AnchorRole): Vec3 => {
    const inf1 = left('inf1')
    const inf2 = left('inf2')
    const sup1 = left('sup1')
    const sup2 = left('sup2')
    const up = (p: Vec3, dy: number): Vec3 => ({ x: p.x, y: p.y + dy, z: p.z })
    switch (role) {
      case 'sup1':
        if (inf1) return up(inf1, 200)
        break
      case 'sup2':
        if (inf2) return up(inf2, 200)
        break
      case 'inf1':
        if (sup1) return up(sup1, -200)
        break
      case 'inf2':
        if (sup2) return up(sup2, -200)
        break
      case 'amort': {
        const arms = [inf1, inf2, sup1, sup2].filter((p): p is Vec3 => !!p)
        if (arms.length) return up(mean(arms), 250)
        break
      }
    }
    // eixo sem nenhuma ancoragem: geometria em torno do centro de roda, puxada para dentro
    const inb = { x: c.x * 0.5, y: c.y, z: c.z }
    const byRole: Record<AnchorRole, Vec3> = {
      inf1: { x: inb.x, y: inb.y - 80, z: inb.z - 120 },
      inf2: { x: inb.x, y: inb.y - 80, z: inb.z + 120 },
      sup1: { x: inb.x * 1.1, y: inb.y + 120, z: inb.z - 100 },
      sup2: { x: inb.x * 1.1, y: inb.y + 120, z: inb.z + 100 },
      amort: { x: inb.x, y: inb.y + 300, z: inb.z },
    }
    return byRole[role]
  }

  const out = [...kept]
  for (const role of roles) {
    for (const side of SIDES) {
      if (out.some((a) => a.axle === axle && a.role === role && a.side === side)) continue
      const l = round(guess(role))
      out.push({
        id: anchorId(axle, role, side),
        axle,
        side,
        role,
        pos: side === 'L' ? l : mirror(l),
      })
    }
  }
  return out
}

/** Papéis exigidos pelo tipo que faltam / ancoragens do eixo sem papel no tipo (SUSP.3). */
export function anchorMismatch(
  anchors: Anchor[],
  axle: Axle,
  type: SuspensionType,
): { missing: string[]; extra: string[] } {
  const roles = ANCHOR_ROLES_BY_TYPE[type]
  const missing: string[] = []
  for (const role of roles) {
    for (const side of SIDES) {
      if (!anchors.some((a) => a.axle === axle && a.role === role && a.side === side)) {
        missing.push(anchorId(axle, role, side))
      }
    }
  }
  const extra = anchors.filter((a) => a.axle === axle && !roles.includes(a.role)).map((a) => a.id)
  return { missing, extra }
}

export function wheelCenter(cfg: SuspensionConfig, axle: Axle, side: Side): Vec3 {
  const l = cfg[axle].wheelCenter
  return side === 'L' ? l : mirror(l)
}

export function measuredWheelbase(cfg: SuspensionConfig): number {
  return Math.abs(cfg.traseira.wheelCenter.z - cfg.dianteira.wheelCenter.z)
}

export function measuredTrack(cfg: SuspensionConfig, axle: Axle): number {
  return 2 * Math.abs(cfg[axle].wheelCenter.x)
}

/**
 * Saneamento ao importar (FR-DF30.6): configuração com número não finito, pneu não positivo ou
 * tipo inválido para o eixo é descartada INTEIRA — o projeto abre sem módulo, como antes do DF-30.
 */
export function sanitizeSuspension(cage: Cage): SuspensionConfig | undefined {
  const s = cage.suspension
  if (!s || typeof s !== 'object') return undefined
  const fin = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)
  const vec = (v: unknown): v is Vec3 =>
    !!v && typeof v === 'object' && fin((v as Vec3).x) && fin((v as Vec3).y) && fin((v as Vec3).z)
  const axleOk = (axle: Axle): boolean => {
    const a = s[axle]
    if (!a || typeof a !== 'object') return false
    if (!isTypeAllowed(axle, a.type)) return false
    if (!vec(a.wheelCenter)) return false
    const t = a.tire
    return !!t && fin(t.od) && fin(t.width) && fin(t.rim) && t.od > 0 && t.width > 0 && t.rim > 0
  }
  if (!fin(s.wheelbaseMm) || s.wheelbaseMm <= 0) return undefined
  if (!axleOk('dianteira') || !axleOk('traseira')) return undefined
  // o centro é guardado para o lado L; um JSON editado à mão com x > 0 é normalizado
  const norm = (a: AxleSuspension): AxleSuspension => ({
    type: a.type,
    wheelCenter: a.wheelCenter.x > 0 ? mirror(a.wheelCenter) : { ...a.wheelCenter },
    tire: { od: a.tire.od, width: a.tire.width, rim: a.tire.rim },
  })
  return { wheelbaseMm: s.wheelbaseMm, dianteira: norm(s.dianteira), traseira: norm(s.traseira) }
}

// ---------------------------------------------------------------------------------------
// Corpos genéricos (FR-DF30.15) — todos cilindros de `a` a `b` com raio `r`, em mm.

export type BodyKind = 'arm' | 'shock' | 'knuckle' | 'hub' | 'tire' | 'rim'

export interface Body {
  kind: BodyKind
  axle: Axle
  side: Side
  a: Vec3
  b: Vec3
  r: number
}

const R = { arm: 11, knuckle: 22, hub: 18, shock: 16, strut: 20 }

/** Ponto a fração `t` de `a` para `b`. */
const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  z: a.z + (b.z - a.z) * t,
})

/**
 * Corpos de UMA roda. Ancoragem exigida mas ausente ⇒ o corpo que dependia dela não sai
 * (FR-DF30.16); SUSP.3 explica no checklist.
 */
function wheelBodies(cage: Cage, cfg: SuspensionConfig, axle: Axle, side: Side): Body[] {
  const ax = cfg[axle]
  const c = wheelCenter(cfg, axle, side)
  const anchors = cage.anchors ?? []
  const at = (role: AnchorRole): Vec3 | null =>
    anchors.find((a) => a.axle === axle && a.role === role && a.side === side)?.pos ?? null
  const out: Body[] = []
  const push = (kind: BodyKind, a: Vec3 | null, b: Vec3 | null, r: number) => {
    if (a && b) out.push({ kind, axle, side, a, b, r })
  }

  // pneu e aro: cilindros no eixo x, centrados no centro de roda
  const hw = ax.tire.width / 2
  const xs = (dx: number): Vec3 => ({ x: c.x + dx, y: c.y, z: c.z })
  push('tire', xs(-hw), xs(hw), ax.tire.od / 2)
  push('rim', xs(-hw * 0.9), xs(hw * 0.9), ax.tire.rim / 2)

  // plano da manga: 40 mm para dentro da face interna do pneu
  const inb = c.x < 0 ? 1 : -1
  const kx = c.x + inb * (hw + 40)
  const K = (dy: number): Vec3 => ({ x: kx, y: c.y + dy, z: c.z })
  const hub: Vec3 = K(0)
  push('hub', hub, c, R.hub)

  const inf1 = at('inf1')
  const inf2 = at('inf2')
  const midInf = inf1 && inf2 ? lerp(inf1, inf2, 0.5) : (inf1 ?? inf2)

  switch (ax.type) {
    case 'duplo-a': {
      const lbj = K(-100)
      const ubj = K(100)
      push('arm', inf1, lbj, R.arm)
      push('arm', inf2, lbj, R.arm)
      push('arm', at('sup1'), ubj, R.arm)
      push('arm', at('sup2'), ubj, R.arm)
      push('knuckle', lbj, ubj, R.knuckle)
      // amortecedor desce sobre a bandeja inferior, a 3/4 do caminho para a rótula
      push('shock', at('amort'), midInf ? lerp(midInf, lbj, 0.75) : null, R.shock)
      break
    }
    case 'mcpherson': {
      const lbj = K(-100)
      push('arm', inf1, lbj, R.arm)
      push('arm', inf2, lbj, R.arm)
      push('knuckle', lbj, K(60), R.knuckle)
      // a coluna é o próprio amortecedor: da torre à rótula inferior
      push('shock', at('amort'), lbj, R.strut)
      break
    }
    case 'semi-trailing':
    case 'trailing': {
      push('arm', inf1, hub, R.arm + 3)
      push('arm', inf2, hub, R.arm + 3)
      push('knuckle', K(-60), K(60), R.knuckle)
      push('shock', at('amort'), midInf ? lerp(midInf, hub, 0.8) : null, R.shock)
      break
    }
  }
  return out
}

/** Todos os corpos genéricos da suspensão (vazio sem configuração). */
export function suspensionBodies(cage: Cage): Body[] {
  const cfg = cage.suspension
  if (!cfg) return []
  const out: Body[] = []
  for (const axle of AXLES)
    for (const side of SIDES) out.push(...wheelBodies(cage, cfg, axle, side))
  return out
}
