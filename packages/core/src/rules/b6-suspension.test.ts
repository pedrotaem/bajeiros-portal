import { describe, expect, it } from 'vitest'
import { evaluate } from './b6'
import { templateCage } from '../model/template'
import { reconcileAnchors } from '../model/suspension'
import type { Cage } from '../model/types'

const byId = (cage: Cage, id: string) => evaluate(cage).find((r) => r.id === id)
const clone = () => structuredClone(templateCage) as Cage

describe('SUSP.2 / SUSP.3 (DF-30)', () => {
  it('AC-DF30.1: template passa SUSP.2 e SUSP.3, e SUSP.1 segue igual', () => {
    expect(byId(templateCage, 'SUSP.2')?.status).toBe('pass')
    expect(byId(templateCage, 'SUSP.3')?.status).toBe('pass')
    expect(byId(templateCage, 'SUSP.1')?.status).toBe('pass')
    expect(byId(templateCage, 'SUSP.3')?.measured).toContain('duplo A')
  })

  it('AC-DF30.2: sem `suspension` nenhuma das duas é emitida', () => {
    const cage = clone()
    delete cage.suspension
    expect(byId(cage, 'SUSP.2')).toBeUndefined()
    expect(byId(cage, 'SUSP.3')).toBeUndefined()
    expect(byId(cage, 'SUSP.1')?.status).toBe('pass')
  })

  it('AC-DF30.3: entre-eixos declarado 1400 falha com medido, declarado e diferença', () => {
    const cage = clone()
    cage.suspension!.wheelbaseMm = 1400
    const r = byId(cage, 'SUSP.2')!
    expect(r.status).toBe('fail')
    expect(r.measured).toContain('1102')
    expect(r.measured).toContain('1400')
    expect(r.measured).toContain('-298')
  })

  it('tolerância de 5 mm: 1106 declarado ainda passa, 1108 não', () => {
    const ok = clone()
    ok.suspension!.wheelbaseMm = 1106
    expect(byId(ok, 'SUSP.2')?.status).toBe('pass')
    const bad = clone()
    bad.suspension!.wheelbaseMm = 1108
    expect(byId(bad, 'SUSP.2')?.status).toBe('fail')
  })

  it('AC-DF30.7: ancoragem exigida apagada do JSON → SUSP.3 fail com presence', () => {
    const cage = clone()
    cage.anchors = cage.anchors!.filter((a) => a.id !== 'traseira-sup2-L')
    const r = byId(cage, 'SUSP.3')!
    expect(r.status).toBe('fail')
    expect(r.presence).toBe(true)
    expect(r.measured).toContain('faltando: traseira-sup2-L')
  })

  it('tipo trocado sem reconciliar acusa as que sobram (sem presence)', () => {
    const cage = clone()
    cage.suspension!.traseira.type = 'trailing'
    const r = byId(cage, 'SUSP.3')!
    expect(r.status).toBe('fail')
    expect(r.presence).toBe(false)
    expect(r.measured).toContain('sobrando')
    // reconciliado, volta a passar
    cage.anchors = reconcileAnchors(
      cage.anchors!,
      'traseira',
      'trailing',
      cage.suspension!.traseira.wheelCenter,
    )
    expect(byId(cage, 'SUSP.3')?.status).toBe('pass')
  })
})
