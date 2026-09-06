import { beforeEach, describe, expect, it } from 'vitest'
import { templateCage } from '@bajeiros/core/model/template'
import type { Cage } from '@bajeiros/core/model/types'
import { useStore } from './store'

const st = () => useStore.getState()

describe('DF-29 — rótulos dos nós', () => {
  beforeEach(() => {
    st().reset()
    st().setShowLabels(true)
  })

  it('AC-DF29.1: nasce ligado e alterna', () => {
    expect(st().showLabels).toBe(true)
    st().setShowLabels(false)
    expect(st().showLabels).toBe(false)
    st().setShowLabels(true)
    expect(st().showLabels).toBe(true)
  })

  it('AC-DF29.3: importar JSON e restaurar o template não mexem no alternador', () => {
    st().setShowLabels(false)
    st().loadCage(structuredClone(templateCage) as Cage)
    expect(st().showLabels).toBe(false)
    st().reset()
    expect(st().showLabels).toBe(false)
  })

  it('FR-DF29.3: o estado não vai para o JSON', () => {
    st().setShowLabels(false)
    expect('showLabels' in st().cage).toBe(false)
  })
})

describe('DF-30 — camadas da suspensão na cena', () => {
  beforeEach(() => st().reset())

  it('corpos e marcadores nascem ligados e alternam de forma independente', () => {
    expect(st().showSuspension).toBe(true)
    expect(st().showAnchors).toBe(true)
    st().setShowSuspension(false)
    expect(st().showSuspension).toBe(false)
    expect(st().showAnchors).toBe(true)
    st().setShowAnchors(false)
    expect(st().showAnchors).toBe(false)
    st().setShowSuspension(true)
    st().setShowAnchors(true)
  })

  it('desligar os marcadores não desmarca a seleção (FR-DF30.14)', () => {
    st().selectAnchor('dianteira-inf1-L')
    st().setShowAnchors(false)
    expect(st().selectedAnchor).toBe('dianteira-inf1-L')
    st().setShowAnchors(true)
  })
})
