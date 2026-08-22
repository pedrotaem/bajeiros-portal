import { describe, expect, it } from 'vitest'
import {
  chainOf,
  continuityPartner,
  inferContinuity,
  isContinuousAt,
  physicalChains,
  sanitizeContinuity,
  spliceCandidates,
} from './continuity'
import { countJoints } from './mass'
import { templateCage } from './template'
import { useStore } from '../store'
import type { Cage } from './types'

function lCage(): Cage {
  return {
    nodes: {
      N1: { x: 0, y: 0, z: 0 },
      N2: { x: 0, y: 1000, z: 0 },
      N3: { x: 0, y: 2000, z: 10 }, // quase colinear com N1→N2 (deflexão < 5°)
      N4: { x: 0, y: 1000, z: 800 },
    },
    members: [
      { id: 'm1', type: 'RRH', a: 'N1', b: 'N2' },
      { id: 'm2', type: 'RRH', a: 'N2', b: 'N3' },
      { id: 'm3', type: 'FREE', a: 'N2', b: 'N4' },
    ],
    geraldao: { x: 0, y: 0, z: 0 },
    seatBottomY: 0,
    primarySection: { od: 25.4, wall: 3.05, materialId: '1018' },
    secondarySection: { od: 25.4, wall: 0.89, materialId: '1018' },
  }
}

describe('sanitizeContinuity (FR-DF6.4/6.5)', () => {
  it('remove entradas órfãs, não incidentes e extremidades duplicadas', () => {
    const cage = lCage()
    cage.continuity = [
      { node: 'N2', pair: ['m1', 'm2'] },
      { node: 'N2', pair: ['m1', 'm3'] }, // m1 já usado em N2
      { node: 'N9', pair: ['m1', 'm2'] }, // nó inexistente
      { node: 'N1', pair: ['m1', 'm3'] }, // m3 não incide em N1
    ]
    expect(sanitizeContinuity(cage)).toEqual([{ node: 'N2', pair: ['m1', 'm2'] }])
  })
})

describe('consultas (FR-DF6.6)', () => {
  it('isContinuousAt / continuityPartner / chainOf / physicalChains', () => {
    const cage = lCage()
    cage.continuity = [{ node: 'N2', pair: ['m1', 'm2'] }]
    expect(isContinuousAt(cage, 'N2', 'm1')).toBe(true)
    expect(isContinuousAt(cage, 'N2', 'm3')).toBe(false)
    expect(continuityPartner(cage, 'N2', 'm1')).toBe('m2')
    expect(
      chainOf(cage, 'm1')
        .map((m) => m.id)
        .sort(),
    ).toEqual(['m1', 'm2'])
    expect(physicalChains(cage).length).toBe(2) // {m1,m2} e {m3}
  })
})

describe('inferContinuity (FR-DF6.2)', () => {
  it('pareia 2 membros do mesmo tipo num nó; tipos diferentes ficam descontínuos', () => {
    const cage = lCage()
    const inf = inferContinuity(cage)
    expect(inf).toContainEqual({ node: 'N2', pair: ['m1', 'm2'] })
    expect(inf.some((c) => c.pair.includes('m3'))).toBe(false)
  })
  it('template declara RHO+FBM_UP contínuo no ponto C (B6.2.7.2)', () => {
    const cont = templateCage.continuity ?? []
    const atCL = cont.filter((c) => c.node === 'CL')
    expect(atCL.length).toBe(1)
    const types = atCL[0].pair
      .map((id) => templateCage.members.find((m) => m.id === id)?.type)
      .sort()
    expect(types).toEqual(['FBM_UP', 'RHO'])
  })
})

describe('spliceCandidates (B6.3.1, FR-DF6.7)', () => {
  it('par quase colinear sem continuidade é emenda; declarado contínuo deixa de ser', () => {
    const cage = lCage()
    expect(spliceCandidates(cage)).toContainEqual({ node: 'N2', pair: ['m1', 'm2'] })
    cage.continuity = [{ node: 'N2', pair: ['m1', 'm2'] }]
    expect(spliceCandidates(cage)).toEqual([])
  })
})

describe('DF-2 v2: juntas descontam passagens contínuas (AC-DF2.5)', () => {
  it('declarar passagem reduz o nº de juntas em 1', () => {
    const cage = lCage()
    const before = countJoints(cage) // N2 grau 3 → 2 juntas
    expect(before).toBe(2)
    cage.continuity = [{ node: 'N2', pair: ['m1', 'm2'] }]
    expect(countJoints(cage)).toBe(1)
  })
})

describe('hooks do store (AC-DF6.1/6.3/6.4)', () => {
  it('splitMember cria passagem contínua no novo nó e migra declarações', () => {
    useStore.getState().loadCage(lCage())
    useStore.getState().splitMember('m1')
    const cage = useStore.getState().cage
    const nid = useStore.getState().selectedNode!
    expect(cage.members.map((m) => m.id).sort()).toEqual(['m1a', 'm1b', 'm2', 'm3'])
    expect(isContinuousAt(cage, nid, 'm1a')).toBe(true)
    expect(continuityPartner(cage, nid, 'm1a')).toBe('m1b')
    useStore.getState().reset()
  })
  it('setContinuity bloqueia extremidade já usada; deleteMember limpa declarações', () => {
    useStore.getState().loadCage(lCage())
    useStore.getState().setContinuity('N2', ['m1', 'm2'])
    useStore.getState().setContinuity('N2', ['m1', 'm3']) // bloqueado
    expect(useStore.getState().cage.continuity).toEqual([{ node: 'N2', pair: ['m1', 'm2'] }])
    useStore.getState().deleteMember('m2')
    expect(useStore.getState().cage.continuity).toEqual([])
    useStore.getState().reset()
  })
  it('AC-DF6.5: JSON antigo (sem campo) importa sem erro, tudo descontínuo', () => {
    const cage = lCage()
    delete cage.continuity
    useStore.getState().loadCage(JSON.parse(JSON.stringify(cage)))
    expect(useStore.getState().cage.continuity).toEqual([])
    useStore.getState().reset()
  })
})
