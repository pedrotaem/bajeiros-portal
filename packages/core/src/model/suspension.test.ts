import { describe, expect, it } from 'vitest'
import { templateCage } from './template'
import type { Cage } from './types'
import {
  ANCHOR_ROLES_BY_TYPE,
  anchorMismatch,
  defaultSuspension,
  inferType,
  measuredTrack,
  measuredWheelbase,
  reconcileAnchors,
  sanitizeSuspension,
  suspensionBodies,
} from './suspension'

const clone = () => structuredClone(templateCage) as Cage

describe('DF-30 — configuração default a partir das ancoragens', () => {
  it('AC-DF30.1: o template nasce com duplo A nos dois eixos e entre-eixos igual ao medido', () => {
    const s = templateCage.suspension!
    expect(s.dianteira.type).toBe('duplo-a')
    expect(s.traseira.type).toBe('duplo-a')
    expect(Math.round(measuredWheelbase(s))).toBe(s.wheelbaseMm)
  })

  it('defaultSuspension infere duplo A e reproduz os centros congelados no template', () => {
    const cage = clone()
    delete cage.suspension
    const d = defaultSuspension(cage)
    expect(d.dianteira.type).toBe('duplo-a')
    expect(d.traseira.type).toBe('duplo-a')
    expect(d.dianteira.wheelCenter).toEqual(templateCage.suspension!.dianteira.wheelCenter)
    expect(d.traseira.wheelCenter).toEqual(templateCage.suspension!.traseira.wheelCenter)
    expect(d.wheelbaseMm).toBe(1102)
    expect(measuredTrack(d, 'dianteira')).toBe(1106)
    expect(measuredTrack(d, 'traseira')).toBe(1258)
  })

  it('sem bandeja superior o tipo inferido é o de três pontos do eixo', () => {
    const anchors = (templateCage.anchors ?? []).filter((a) => !a.role.startsWith('sup'))
    expect(inferType(anchors, 'dianteira')).toBe('mcpherson')
    expect(inferType(anchors, 'traseira')).toBe('trailing')
  })
})

describe('DF-30 — reconciliação das ancoragens ao trocar o tipo (FR-DF30.4)', () => {
  it('AC-DF30.4: McPherson na dianteira remove sup1/sup2 dos dois lados e não toca a traseira', () => {
    const cage = clone()
    const wc = cage.suspension!.dianteira.wheelCenter
    const next = reconcileAnchors(cage.anchors!, 'dianteira', 'mcpherson', wc)
    expect(next).toHaveLength(16)
    expect(
      next
        .filter((a) => a.axle === 'dianteira')
        .map((a) => a.role)
        .sort(),
    ).toEqual(['amort', 'amort', 'inf1', 'inf1', 'inf2', 'inf2'].sort())
    expect(next.filter((a) => a.axle === 'traseira')).toEqual(
      cage.anchors!.filter((a) => a.axle === 'traseira'),
    )
    expect(anchorMismatch(next, 'dianteira', 'mcpherson')).toEqual({ missing: [], extra: [] })
  })

  it('AC-DF30.5: voltar para duplo A recria sup1/sup2 em par espelhado, 200 mm acima das inferiores', () => {
    const cage = clone()
    const wc = cage.suspension!.dianteira.wheelCenter
    const mc = reconcileAnchors(cage.anchors!, 'dianteira', 'mcpherson', wc)
    const back = reconcileAnchors(mc, 'dianteira', 'duplo-a', wc)
    expect(back).toHaveLength(20)
    const inf1L = back.find((a) => a.id === 'dianteira-inf1-L')!
    const sup1L = back.find((a) => a.id === 'dianteira-sup1-L')!
    const sup1R = back.find((a) => a.id === 'dianteira-sup1-R')!
    expect(sup1L.pos).toEqual({ ...inf1L.pos, y: inf1L.pos.y + 200 })
    expect(sup1R.pos).toEqual({ ...sup1L.pos, x: -sup1L.pos.x })
  })

  it('eixo sem nenhuma ancoragem ganha o conjunto inteiro em torno do centro de roda', () => {
    const cage = clone()
    const rest = cage.anchors!.filter((a) => a.axle !== 'traseira')
    const next = reconcileAnchors(
      rest,
      'traseira',
      'trailing',
      cage.suspension!.traseira.wheelCenter,
    )
    const tras = next.filter((a) => a.axle === 'traseira')
    expect(tras).toHaveLength(6)
    for (const a of tras) expect(Math.sign(a.pos.x)).toBe(a.side === 'L' ? -1 : 1)
  })

  it('anchorMismatch acusa faltando e sobrando', () => {
    const cage = clone()
    const semInf = cage.anchors!.filter((a) => a.id !== 'traseira-inf1-R')
    expect(anchorMismatch(semInf, 'traseira', 'duplo-a').missing).toEqual(['traseira-inf1-R'])
    const extra = anchorMismatch(cage.anchors!, 'traseira', 'trailing').extra
    expect(extra.sort()).toEqual(
      ['traseira-sup1-L', 'traseira-sup1-R', 'traseira-sup2-L', 'traseira-sup2-R'].sort(),
    )
  })
})

describe('DF-30 — corpos genéricos (FR-DF30.15/16)', () => {
  it('duplo A: pneu, aro, cubo, 4 braços, manga e amortecedor por roda', () => {
    const bodies = suspensionBodies(templateCage)
    const oneWheel = bodies.filter((b) => b.axle === 'dianteira' && b.side === 'L')
    const kinds = oneWheel.map((b) => b.kind).sort()
    expect(kinds).toEqual(
      ['arm', 'arm', 'arm', 'arm', 'hub', 'knuckle', 'rim', 'shock', 'tire'].sort(),
    )
    expect(bodies).toHaveLength(4 * 9)
    const tire = oneWheel.find((b) => b.kind === 'tire')!
    expect(tire.r).toBe(559 / 2)
    expect(Math.abs(tire.b.x - tire.a.x)).toBe(178)
  })

  it('tipos de três pontos têm 2 braços e nenhum corpo depende de sup', () => {
    const cage = clone()
    cage.suspension!.traseira.type = 'trailing'
    cage.anchors = reconcileAnchors(
      cage.anchors!,
      'traseira',
      'trailing',
      cage.suspension!.traseira.wheelCenter,
    )
    const tras = suspensionBodies(cage).filter((b) => b.axle === 'traseira' && b.side === 'R')
    expect(tras.filter((b) => b.kind === 'arm')).toHaveLength(2)
    expect(tras.find((b) => b.kind === 'shock')).toBeDefined()
  })

  it('AC-DF30.7: ancoragem exigida ausente só derruba o corpo que dependia dela', () => {
    const cage = clone()
    cage.anchors = cage.anchors!.filter((a) => a.id !== 'dianteira-amort-L')
    const bodies = suspensionBodies(cage)
    const dl = bodies.filter((b) => b.axle === 'dianteira' && b.side === 'L')
    expect(dl.find((b) => b.kind === 'shock')).toBeUndefined()
    expect(dl.filter((b) => b.kind === 'arm')).toHaveLength(4)
    expect(bodies.filter((b) => b.axle === 'dianteira' && b.side === 'R')).toHaveLength(9)
  })

  it('sem configuração não há corpo', () => {
    const cage = clone()
    delete cage.suspension
    expect(suspensionBodies(cage)).toEqual([])
  })
})

describe('DF-30 — saneamento ao importar (FR-DF30.6)', () => {
  it('AC-DF30.9: tipo inválido para o eixo descarta a configuração inteira', () => {
    const cage = clone()
    ;(cage.suspension!.dianteira as { type: string }).type = 'trailing'
    expect(sanitizeSuspension(cage)).toBeUndefined()
  })

  it('número não finito ou pneu não positivo descartam', () => {
    const a = clone()
    a.suspension!.wheelbaseMm = Number.NaN
    expect(sanitizeSuspension(a)).toBeUndefined()
    const b = clone()
    b.suspension!.traseira.tire.od = 0
    expect(sanitizeSuspension(b)).toBeUndefined()
  })

  it('configuração válida passa igual; centro com x > 0 é normalizado para o lado L', () => {
    const cage = clone()
    expect(sanitizeSuspension(cage)).toEqual(cage.suspension)
    cage.suspension!.dianteira.wheelCenter.x = 553
    expect(sanitizeSuspension(cage)!.dianteira.wheelCenter.x).toBe(-553)
  })

  it('papéis por tipo: duplo A tem 5, os demais 3', () => {
    expect(ANCHOR_ROLES_BY_TYPE['duplo-a']).toHaveLength(5)
    expect(ANCHOR_ROLES_BY_TYPE.mcpherson).toHaveLength(3)
    expect(ANCHOR_ROLES_BY_TYPE.trailing).toHaveLength(3)
  })
})
