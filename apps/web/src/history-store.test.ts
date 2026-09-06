import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { templateCage } from '@bajeiros/core/model/template'
import type { Cage } from '@bajeiros/core/model/types'
import { useStore } from './store'

const st = () => useStore.getState()

/** Limpa o histórico entre testes: `reset()` é uma ação como outra e entraria em `past`. */
function fresh() {
  st().reset()
  useStore.setState({ past: [], future: [], histSig: null, histAt: 0, histGesture: 0 })
}

describe('DF-32 — desfazer/refazer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-06T12:00:00Z'))
    fresh()
  })
  afterEach(() => vi.useRealTimers())

  it('AC-DF32.1: mover um nó, desfazer volta, refazer reaplica', () => {
    const before = st().cage.nodes.AL
    st().moveNode('AL', { x: -400, y: 0, z: 0 })
    expect(st().cage.nodes.AL.x).toBe(-400)
    expect(st().past).toHaveLength(1)
    st().undo()
    expect(st().cage.nodes.AL).toEqual(before)
    expect(st().future).toHaveLength(1)
    st().redo()
    expect(st().cage.nodes.AL.x).toBe(-400)
    expect(st().future).toHaveLength(0)
  })

  it('AC-DF32.2: digitação no mesmo campo funde num passo só; mudanças distintas não', () => {
    st().moveNode('AL', { x: -350, y: 0, z: 0 })
    vi.advanceTimersByTime(200)
    st().moveNode('AL', { x: -355, y: 0, z: 0 })
    vi.advanceTimersByTime(200)
    st().moveNode('AL', { x: -358, y: 0, z: 0 })
    expect(st().past).toHaveLength(1)
    // outro nó: outra assinatura → outro passo
    st().moveNode('BL', { x: -310, y: 1150, z: -218.5 })
    expect(st().past).toHaveLength(2)
    // mesmo nó, mas depois da janela → outro passo
    vi.advanceTimersByTime(2000)
    st().moveNode('BL', { x: -320, y: 1150, z: -218.5 })
    expect(st().past).toHaveLength(3)
    st().undo()
    expect(st().cage.nodes.BL.x).toBe(-310)
    st().undo()
    expect(st().cage.nodes.BL.x).toBe(-300)
    st().undo()
    expect(st().cage.nodes.AL.x).toBe(-348)
  })

  it('AC-DF32.3: arrasto no 3D (gesto) é um passo só, mesmo demorado', () => {
    st().beginGesture()
    for (let i = 1; i <= 5; i++) {
      vi.advanceTimersByTime(1000)
      st().moveNode('SL', { x: -406 - i, y: 340, z: -64.6 })
    }
    st().endGesture()
    expect(st().past).toHaveLength(1)
    st().undo()
    expect(st().cage.nodes.SL.x).toBe(-406.1)
  })

  it('gesto sem movimento (clique) não grava nada', () => {
    st().beginGesture()
    st().endGesture()
    expect(st().past).toHaveLength(0)
  })

  it('AC-DF32.4: ação nova depois de desfazer descarta o refazer', () => {
    st().moveNode('AL', { x: -400, y: 0, z: 0 })
    st().undo()
    expect(st().future).toHaveLength(1)
    st().setSeatBottomY(120)
    expect(st().future).toHaveLength(0)
    st().redo()
    expect(st().cage.seatBottomY).toBe(120)
  })

  it('AC-DF32.5: desfazer limpa seleção que deixou de existir e pendente', () => {
    st().addFreeNode()
    const id = st().selectedNode!
    expect(st().cage.nodes[id]).toBeDefined()
    st().undo()
    expect(st().cage.nodes[id]).toBeUndefined()
    expect(st().selectedNode).toBeNull()
    // seleção que continua existindo é preservada
    st().selectNode('AL')
    st().moveNode('AL', { x: -400, y: 0, z: 0 })
    st().undo()
    expect(st().selectedNode).toBe('AL')
  })

  it('importar, restaurar o template e recalcular são desfazíveis', () => {
    const other = structuredClone(templateCage) as Cage
    other.seatBottomY = 90
    st().loadCage(other)
    expect(st().cage.seatBottomY).toBe(90)
    st().recalculate()
    expect(st().cage.nodes.DL).toBeDefined()
    st().reset()
    expect(st().past).toHaveLength(3)
    st().undo()
    expect(st().cage.nodes.DL).toBeDefined()
    st().undo()
    expect(st().cage.nodes.NL).toBeDefined()
    expect(st().cage.seatBottomY).toBe(90)
    st().undo()
    expect(st().cage.seatBottomY).toBe(100)
    expect(st().past).toHaveLength(0)
  })

  it('estado de tela não entra no histórico', () => {
    st().setShowLabels(false)
    st().selectNode('AL')
    st().setMirror(false)
    expect(st().past).toHaveLength(0)
    st().setMirror(true)
    st().setShowLabels(true)
  })

  it('teto de 100 passos', () => {
    for (let i = 0; i < 130; i++) {
      vi.advanceTimersByTime(1000)
      st().setSeatBottomY(100 + i)
    }
    expect(st().past).toHaveLength(100)
    st().undo()
    expect(st().cage.seatBottomY).toBe(228)
  })

  it('desfazer sem histórico e refazer sem futuro não fazem nada', () => {
    const cage = st().cage
    st().undo()
    st().redo()
    expect(st().cage).toBe(cage)
  })
})
