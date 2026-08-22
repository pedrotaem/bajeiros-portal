import { describe, expect, it } from 'vitest'
import { evaluate, removalImpact } from '@bajeiros/core/rules/b6'
import { templateCage } from '@bajeiros/core/model/template'
import { useStore } from './store'
import type { Cage } from '@bajeiros/core/model/types'

const byId = (cage: Cage, id: string) => evaluate(cage).find((r) => r.id === id)

describe('STEER.1 (DF-5)', () => {
  it('AC-DF5.6: sem steering, nenhuma menção a STEER.1', () => {
    expect(byId(templateCage, 'STEER.1')).toBeUndefined()
  })

  it('AC-DF5.1/5.2: ponto sobre tubo passa; afastado > 25 mm falha com mensagem de ação', () => {
    const cage = structuredClone(templateCage)
    // sobre a travessa DLC (NL→NR em y=342, z=1002)
    cage.steering = { mode: 'central', points: [{ id: 'SW', pos: { x: -150, y: 342, z: 1002 } }] }
    const ok = byId(cage, 'STEER.1')
    expect(ok?.status).toBe('pass')
    expect(ok?.measured).toContain('mm')
    cage.steering = { mode: 'central', points: [{ id: 'SW', pos: { x: 0, y: 800, z: 500 } }] }
    const bad = byId(cage, 'STEER.1')
    expect(bad?.status).toBe('fail')
    expect(bad?.measured).toContain('sem suporte')
  })

  it('AC-DF5.4: remover o tubo que apoia o volante acusa STEER.1', () => {
    const cage = structuredClone(templateCage)
    const dlc = cage.members.find((m) => m.type === 'DLC')!
    cage.steering = { mode: 'central', points: [{ id: 'SW', pos: { x: -150, y: 342, z: 1002 } }] }
    expect(removalImpact(cage, dlc.id)).toContain('STEER.1')
  })

  it('AC-DF5.3: modo mesa espelha o ponto L ao mover o R (mirror ligado)', () => {
    useStore.getState().loadCage(structuredClone(templateCage))
    useStore.getState().addSteering('mesa')
    useStore.getState().moveSteeringPoint('SWL', { x: -180, y: 700, z: 640 })
    const st = useStore.getState().cage.steering!
    expect(st.points.find((p) => p.id === 'SWR')!.pos).toEqual({ x: 180, y: 700, z: 640 })
    useStore.getState().reset()
  })

  it('modo central ↔ mesa converte pontos preservando a posição média', () => {
    useStore.getState().loadCage(structuredClone(templateCage))
    useStore.getState().addSteering('central')
    const c0 = useStore.getState().cage.steering!.points[0].pos
    useStore.getState().setSteeringMode('mesa')
    const st = useStore.getState().cage.steering!
    expect(st.points.map((p) => p.id).sort()).toEqual(['SWL', 'SWR'])
    useStore.getState().setSteeringMode('central')
    const c1 = useStore.getState().cage.steering!.points[0].pos
    expect(c1.y).toBeCloseTo(c0.y, 0)
    expect(c1.z).toBeCloseTo(c0.z, 0)
    useStore.getState().reset()
  })
})
