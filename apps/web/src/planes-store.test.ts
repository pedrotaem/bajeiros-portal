import { afterEach, describe, expect, it } from 'vitest'
import { templateCage } from '@bajeiros/core/model/template'
import { PLANE_TOL_MM, detectPlanes, planeAngle, planeOf } from '@bajeiros/core/model/planes'
import { dist } from '@bajeiros/core/rules/geometry'
import type { NodeId } from '@bajeiros/core/model/types'
import { useStore } from './store'

const load = () => useStore.getState().loadCage(structuredClone(templateCage))
const cage = () => useStore.getState().cage
const planeWith = (ids: NodeId[]) => {
  const want = [...ids].sort().join(' ')
  const p = detectPlanes(cage(), useStore.getState().planeTolMm).find(
    (x) => [...x.points].sort().join(' ') === want,
  )
  if (!p) throw new Error(`plano ${want} não detectado`)
  return p
}

// `reset()` devolve a gaiola, não o estado de UI — o store é único e vaza entre testes
afterEach(() => {
  useStore.getState().reset()
  useStore.setState({ mirror: true, showPlanes: false, planeTolMm: PLANE_TOL_MM })
})

describe('cota entre pontos no editor (DF-22)', () => {
  it('AC-DF22.6: digitar a distância move só o ponto escolhido, sobre a reta', () => {
    load()
    useStore.setState({ mirror: false })
    const antes = cage().nodes.SML
    useStore.getState().setDistance('SL', 'SML', 800, 'b')
    expect(dist(cage().nodes.SL, cage().nodes.SML)).toBeCloseTo(800, 1)
    expect(cage().nodes.SL).toEqual(templateCage.nodes.SL)
    expect(cage().nodes.SML).not.toEqual(antes)
    // gêmeo do outro lado intocado com o espelho desligado
    expect(cage().nodes.SMR).toEqual(templateCage.nodes.SMR)
  })

  it('com espelho ligado o gêmeo L/R acompanha', () => {
    load()
    useStore.getState().setDistance('SL', 'SML', 800, 'b')
    expect(dist(cage().nodes.SR, cage().nodes.SMR)).toBeCloseTo(800, 1)
    expect(cage().nodes.SMR.x).toBeCloseTo(-cage().nodes.SML.x, 1)
  })

  it('AC-DF22.7: par L/R espelhado se afasta simetricamente, não pelo lado escolhido', () => {
    load()
    useStore.getState().setDistance('AL', 'AR', 800, 'b')
    expect(dist(cage().nodes.AL, cage().nodes.AR)).toBeCloseTo(800, 1)
    expect(cage().nodes.AL.x).toBeCloseTo(-400, 1)
    expect(cage().nodes.AR.x).toBeCloseTo(400, 1)
  })

  it('alvo inválido não mexe na gaiola', () => {
    load()
    const antes = structuredClone(cage().nodes)
    useStore.getState().setDistance('AL', 'AR', 0, 'b')
    useStore.getState().setDistance('AL', 'AL', 500, 'b')
    expect(cage().nodes).toEqual(antes)
  })
})

describe('planos no editor (DF-22)', () => {
  it('AC-DF22.9: o toggle e a tolerância são estado de UI, não do projeto', () => {
    load()
    const json = structuredClone(cage())
    useStore.getState().setShowPlanes(true)
    useStore.getState().setPlaneTol(20)
    expect(useStore.getState().showPlanes).toBe(true)
    expect(cage()).toEqual(json)
    useStore.getState().setPlaneTol(999)
    expect(useStore.getState().planeTolMm).toBe(50)
  })

  it('selecionar plano limpa as outras seleções (e vice-versa)', () => {
    load()
    useStore.getState().selectNode('AL')
    useStore.getState().selectPlane('AL-AR-IL-IR')
    expect(useStore.getState().selectedNode).toBeNull()
    useStore.getState().selectMember('ALC-6')
    expect(useStore.getState().selectedPlane).toBeNull()
  })

  it('AC-DF22.5: editar o ângulo gira o plano e não mexe na dobradiça', () => {
    load()
    const hoop = planeWith(['AL', 'AR', 'SL', 'SR', 'HL', 'HR', 'BL', 'BR'])
    const chao = planeWith(['AL', 'AR', 'IL', 'IR'])
    const antes = planeAngle(cage(), hoop, chao)
    expect(antes.hinged).toBe(true)
    expect(antes.shared.sort()).toEqual(['AL', 'AR'])

    useStore.getState().setPlaneAngle(hoop.id, chao.id, antes.deg + 5)
    const depois = planeOf(cage(), hoop.points)!
    expect(planeAngle(cage(), depois, planeOf(cage(), chao.points)!).deg).toBeCloseTo(
      antes.deg + 5,
      1,
    )
    // pontos da aresta comum e do plano de referência ficam onde estavam
    for (const id of ['AL', 'AR', 'IL', 'IR']) {
      expect(cage().nodes[id]).toEqual(templateCage.nodes[id])
    }
    // e o corta-fogo continua sendo um plano (rotação rígida)
    expect(depois.residualMm).toBeCloseTo(0, 1)
  })

  it('id inexistente ou plano sem dobradiça não muda nada', () => {
    load()
    const antes = structuredClone(cage().nodes)
    useStore.getState().setPlaneAngle('NAO-EXISTE', 'AL-AR-IL-IR', 90)
    expect(cage().nodes).toEqual(antes)
  })
})
