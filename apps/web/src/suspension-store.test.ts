import { beforeEach, describe, expect, it } from 'vitest'
import { templateCage } from '@bajeiros/core/model/template'
import { wheelLockId, type Cage } from '@bajeiros/core/model/types'
import { useStore } from './store'

const st = () => useStore.getState()
const load = (patch: Partial<Cage> = {}) =>
  st().loadCage({ ...(structuredClone(templateCage) as Cage), ...patch })

describe('DF-30 — módulo de suspensão no store', () => {
  beforeEach(() => st().reset())

  it('FR-DF30.3: enableSuspension cria a configuração a partir das ancoragens; presente, é no-op', () => {
    load({ suspension: undefined })
    expect(st().cage.suspension).toBeUndefined()
    st().enableSuspension()
    const s = st().cage.suspension!
    expect(s.dianteira.type).toBe('duplo-a')
    expect(s.traseira.type).toBe('trailing')
    // centros derivados das ancoragens (não os do template): declarado = medido
    expect(s.wheelbaseMm).toBe(939)
    st().setWheelbase(1300)
    st().enableSuspension()
    expect(st().cage.suspension!.wheelbaseMm).toBe(1300)
  })

  it('AC-DF30.4: McPherson na dianteira reconcilia as ancoragens e limpa a trava das removidas', () => {
    load()
    st().toggleLock('dianteira-sup1-L')
    expect(st().cage.locked).toContain('dianteira-sup1-L')
    st().selectAnchor('dianteira-sup2-R')
    st().setSuspensionType('dianteira', 'mcpherson')
    const c = st().cage
    expect(c.suspension!.dianteira.type).toBe('mcpherson')
    expect(c.anchors).toHaveLength(12)
    expect(c.anchors!.some((a) => a.role.startsWith('sup') && a.axle === 'dianteira')).toBe(false)
    expect(c.locked).not.toContain('dianteira-sup1-L')
    // a ancoragem selecionada deixou de existir: seleção limpa, sem fantasma
    expect(st().selectedAnchor).toBeNull()
  })

  it('AC-DF30.5: voltar para duplo A recria as superiores em par espelhado', () => {
    load()
    st().setSuspensionType('dianteira', 'mcpherson')
    st().setSuspensionType('dianteira', 'duplo-a')
    const a = st().cage.anchors!
    expect(a).toHaveLength(16)
    const l = a.find((x) => x.id === 'dianteira-sup2-L')!
    const r = a.find((x) => x.id === 'dianteira-sup2-R')!
    expect(r.pos).toEqual({ ...l.pos, x: -l.pos.x })
  })

  it('tipo não permitido para o eixo é ignorado', () => {
    load()
    st().setSuspensionType('dianteira', 'trailing')
    expect(st().cage.suspension!.dianteira.type).toBe('duplo-a')
    expect(st().cage.anchors).toHaveLength(16)
  })

  it('AC-DF30.6: mover o centro R para x = +600 deixa o L em −600 (bitola 1200)', () => {
    load()
    st().moveWheelCenter('traseira', 'R', { x: 600, y: 200, z: -300 })
    expect(st().cage.suspension!.traseira.wheelCenter).toEqual({ x: -600, y: 200, z: -300 })
    st().moveWheelCenter('traseira', 'L', { x: -650, y: 210, z: -310 })
    expect(st().cage.suspension!.traseira.wheelCenter).toEqual({ x: -650, y: 210, z: -310 })
  })

  it('centro travado (id do eixo) não se move, por nenhum dos lados', () => {
    load()
    const before = { ...st().cage.suspension!.dianteira.wheelCenter }
    st().toggleLock(wheelLockId('dianteira'))
    st().moveWheelCenter('dianteira', 'L', { x: -700, y: 100, z: 900 })
    st().moveWheelCenter('dianteira', 'R', { x: 700, y: 100, z: 900 })
    expect(st().cage.suspension!.dianteira.wheelCenter).toEqual(before)
  })

  it('setWheelbase e setTire recusam valores não positivos', () => {
    load()
    st().setWheelbase(0)
    st().setWheelbase(Number.NaN)
    expect(st().cage.suspension!.wheelbaseMm).toBe(1121)
    st().setTire('dianteira', { od: -10 })
    expect(st().cage.suspension!.dianteira.tire.od).toBe(559)
    st().setTire('dianteira', { od: 584 })
    expect(st().cage.suspension!.dianteira.tire.od).toBe(584)
  })

  it('FR-DF30.5: removeSuspension mantém as ancoragens e limpa a trava dos centros', () => {
    load()
    st().toggleLock(wheelLockId('traseira'))
    st().selectWheel({ axle: 'traseira', side: 'L' })
    st().removeSuspension()
    expect(st().cage.suspension).toBeUndefined()
    expect(st().cage.anchors).toHaveLength(16)
    expect(st().cage.locked).not.toContain(wheelLockId('traseira'))
    expect(st().selectedWheel).toBeNull()
  })

  it('AC-DF30.9: loadCage descarta configuração inválida e a trava órfã do centro', () => {
    const cage = structuredClone(templateCage) as Cage
    ;(cage.suspension!.dianteira as { type: string }).type = 'trailing'
    cage.locked = [wheelLockId('dianteira'), 'AL']
    st().loadCage(cage)
    expect(st().cage.suspension).toBeUndefined()
    expect(st().cage.locked).toEqual(['AL'])
  })

  it('selecionar o centro limpa as outras seleções, e vice-versa', () => {
    load()
    st().selectNode('AL')
    st().selectWheel({ axle: 'dianteira', side: 'R' })
    expect(st().selectedNode).toBeNull()
    expect(st().selectedWheel).toEqual({ axle: 'dianteira', side: 'R' })
    st().selectMember('RRH-0')
    expect(st().selectedWheel).toBeNull()
  })
})
