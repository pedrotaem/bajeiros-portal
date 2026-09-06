import { beforeEach, describe, expect, it } from 'vitest'
import { templateCage } from '@bajeiros/core/model/template'
import type { Cage } from '@bajeiros/core/model/types'
import { useStore } from './store'

const st = () => useStore.getState()
const load = (patch: Partial<Cage> = {}) =>
  st().loadCage({ ...(structuredClone(templateCage) as Cage), ...patch })

describe('DF-31 — Recalcular no store', () => {
  beforeEach(() => st().reset())

  it('AC-DF31.6: renomeia N→D, segue a seleção, limpa o pendente e preenche o relatório', () => {
    load({ locked: ['NL'] })
    st().selectNode('NL')
    st().recalculate()
    const c = st().cage
    expect(c.nodes.DL).toBeDefined()
    expect(c.nodes.NL).toBeUndefined()
    expect(c.locked).toEqual(['DL'])
    expect(c.namedExtra).toEqual(['SML', 'SMR'])
    expect(st().selectedNode).toBe('DL')
    const r = st().recalcReport!
    expect(r.renamed).toEqual([
      ['NL', 'DL'],
      ['NR', 'DR'],
    ])
    expect(r.skipped).toEqual([])
    expect(r.anchorsDelta).toBe(0)
    expect(r.suspensionDropped).toBe(false)
    // "adicionar membro" pendente cai no recálculo (o 1º nó pode ter mudado de id)
    st().startAddMember('FREE')
    st().pickNode('AL')
    expect(st().pending?.first).toBe('AL')
    st().recalculate()
    expect(st().pending).toBeNull()
  })

  it('segundo clique não tem mais o que corrigir e não mexe na geometria', () => {
    load()
    st().recalculate()
    const depoisDoPrimeiro = structuredClone(st().cage)
    st().recalculate()
    expect(st().cage).toEqual(depoisDoPrimeiro)
    expect(st().recalcReport!.renamed).toEqual([])
  })

  it('reconcilia ancoragens com o tipo do eixo e limpa trava órfã (JSON editado à mão)', () => {
    const cage = structuredClone(templateCage) as Cage
    // JSON diz braço arrastado na traseira mas guarda uma bandeja superior a mais, e trava um id fantasma
    cage.anchors!.push({
      id: 'traseira-sup1-L',
      axle: 'traseira',
      side: 'L',
      role: 'sup1',
      pos: { x: -300, y: 300, z: -200 },
    })
    cage.locked = ['traseira-sup1-L', 'ZZ9']
    st().loadCage(cage)
    st().recalculate()
    const c = st().cage
    expect(c.anchors!.some((a) => a.id === 'traseira-sup1-L')).toBe(false)
    expect(c.anchors).toHaveLength(16)
    expect(c.locked).toEqual([])
    const r = st().recalcReport!
    expect(r.anchorsDelta).toBe(-1)
  })

  it('ancoragem selecionada que a reconciliação remove sai da seleção', () => {
    const cage = structuredClone(templateCage) as Cage
    cage.anchors!.push({
      id: 'traseira-sup2-R',
      axle: 'traseira',
      side: 'R',
      role: 'sup2',
      pos: { x: 300, y: 300, z: -300 },
    })
    st().loadCage(cage)
    st().selectAnchor('traseira-sup2-R')
    st().recalculate()
    expect(st().selectedAnchor).toBeNull()
  })
})
