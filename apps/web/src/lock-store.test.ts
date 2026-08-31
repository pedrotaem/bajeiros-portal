import { afterEach, describe, expect, it } from 'vitest'
import { templateCage } from '@bajeiros/core/model/template'
import { PLANE_TOL_MM, detectPlanes } from '@bajeiros/core/model/planes'
import type { Cage, NodeId } from '@bajeiros/core/model/types'
import { useStore } from './store'

const load = (patch: Partial<Cage> = {}) =>
  useStore.getState().loadCage({ ...structuredClone(templateCage), ...patch })
const cage = () => useStore.getState().cage
const planeWith = (ids: NodeId[]) => {
  const want = [...ids].sort().join(' ')
  const p = detectPlanes(cage(), useStore.getState().planeTolMm).find(
    (x) => [...x.points].sort().join(' ') === want,
  )
  if (!p) throw new Error(`plano ${want} não detectado`)
  return p
}

afterEach(() => {
  useStore.getState().reset()
  useStore.setState({ mirror: true, showPlanes: false, planeTolMm: PLANE_TOL_MM, cameraView: null })
})

describe('travar elemento no espaço (DF-23)', () => {
  it('AC-DF23.1: nó travado não se move por campo numérico nem por arrasto', () => {
    load({ locked: ['BL'] })
    useStore.getState().moveNode('BL', { x: -100, y: 100, z: 100 })
    expect(cage().nodes.BL).toEqual(templateCage.nodes.BL)
    // e destravar devolve o movimento
    useStore.getState().toggleLock('BL')
    useStore.getState().moveNode('BL', { x: -100, y: 100, z: 100 })
    expect(cage().nodes.BL).toEqual({ x: -100, y: 100, z: 100 })
  })

  it('AC-DF23.2: gêmeo travado não acompanha o espelho — o lado livre continua livre', () => {
    load({ locked: ['BR'] })
    useStore.getState().moveNode('BL', { x: -310, y: 1150, z: -218.5 })
    expect(cage().nodes.BL.x).toBe(-310)
    expect(cage().nodes.BR).toEqual(templateCage.nodes.BR)
  })

  it('AC-DF23.3: cota recusa quando quem se move está travado, e aceita pelo outro lado', () => {
    load({ locked: ['SML'] })
    useStore.setState({ mirror: false })
    useStore.getState().setDistance('SL', 'SML', 800, 'b')
    expect(cage().nodes.SML).toEqual(templateCage.nodes.SML)
    useStore.getState().setDistance('SL', 'SML', 800, 'a')
    expect(cage().nodes.SL).not.toEqual(templateCage.nodes.SL)
    expect(cage().nodes.SML).toEqual(templateCage.nodes.SML)
  })

  it('AC-DF23.4: giro de plano é recusado inteiro se um ponto que viajaria está travado', () => {
    load({ locked: ['HL'] })
    const hoop = planeWith(['AL', 'AR', 'SL', 'SR', 'HL', 'HR', 'BL', 'BR'])
    const chao = planeWith(['AL', 'AR', 'IL', 'IR'])
    useStore.getState().setPlaneAngle(hoop.id, chao.id, 102)
    expect(cage().nodes).toEqual(templateCage.nodes)
  })

  it('AC-DF23.5: ancoragem e ponto do volante travados não se movem', () => {
    load({ locked: ['traseira-amort-L'] })
    useStore.getState().moveAnchor('traseira-amort-L', { x: -1, y: -1, z: -1 })
    const a = (cage().anchors ?? []).find((x) => x.id === 'traseira-amort-L')!
    expect(a.pos).toEqual({ x: -371, y: 378, z: -267 })

    useStore.getState().addSteering('central')
    useStore.getState().toggleLock('SW')
    const antes = cage().steering!.points[0].pos
    useStore.getState().moveSteeringPoint('SW', { x: 0, y: 0, z: 0 })
    expect(cage().steering!.points[0].pos).toEqual(antes)
  })

  it('nó travado não pode ser excluído', () => {
    load({ locked: ['U2'] })
    useStore.getState().deleteMember('USM-35')
    useStore.getState().deleteNode('U2')
    expect(cage().nodes.U2).toBeDefined()
  })

  it('AC-DF23.6: a trava vai para o JSON e ids fantasmas caem na importação', () => {
    load({ locked: ['AL', 'NAO_EXISTE', 'dianteira-inf1-L', 'SWL'] })
    expect(cage().locked?.sort()).toEqual(['AL', 'dianteira-inf1-L'])
  })

  it('trocar o modo do volante não deixa trava fantasma do id antigo', () => {
    load()
    useStore.getState().addSteering('central')
    useStore.getState().toggleLock('SW')
    useStore.getState().setSteeringMode('mesa')
    expect(cage().locked).not.toContain('SW')
    useStore.getState().removeSteering()
    expect(cage().locked).toEqual([])
  })
})

describe('vistas de câmera (DF-23)', () => {
  it('cada clique publica a vista com sequência nova — o mesmo botão reenquadra', () => {
    useStore.getState().setCameraView('lateral')
    const a = useStore.getState().cameraView!
    expect(a.view).toBe('lateral')
    useStore.getState().setCameraView('lateral')
    const b = useStore.getState().cameraView!
    expect(b.seq).toBe(a.seq + 1)
    useStore.getState().setCameraView('iso')
    expect(useStore.getState().cameraView!.view).toBe('iso')
  })

  it('mudar de vista não toca na gaiola', () => {
    load()
    const antes = structuredClone(cage())
    useStore.getState().setCameraView('superior')
    expect(cage()).toEqual(antes)
  })
})
