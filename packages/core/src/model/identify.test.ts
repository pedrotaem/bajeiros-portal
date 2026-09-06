import { describe, expect, it } from 'vitest'
import { templateCage } from './template'
import type { Cage } from './types'
import { applyRenames, identifyNamedPoints, letterFor } from './identify'
import { evaluate } from '../rules/b6'

const clone = () => structuredClone(templateCage) as Cage

describe('DF-31 — identificação dos pontos denominados pela topologia', () => {
  it('reconhece as letras do regulamento nos nós já nomeados do template', () => {
    for (const [id, letter] of [
      ['AL', 'A'],
      ['BR', 'B'],
      ['HL', 'H'],
      ['SR', 'S'],
      ['CL', 'C'],
      ['FR', 'F'],
      ['IL', 'I'],
      ['RL', 'R'],
    ]) {
      expect(letterFor(templateCage, id), id).toBe(letter)
    }
  })

  it('AC-DF31.1: no template, só N (dobra do FBM com a DLC) é ponto D sem letra — N1/SM/EM/FX não têm letra', () => {
    const { renames, skipped } = identifyNamedPoints(templateCage)
    expect(renames).toEqual({ NL: 'DL', NR: 'DR' })
    expect(skipped).toEqual([])
    for (const id of ['N1', 'N1L', 'SML', 'EML', 'FX', 'U1', 'LDB1']) {
      expect(letterFor(templateCage, id), id).toBeNull()
    }
  })

  it('AC-DF31.2: nó já com letra nunca é renomeado, mesmo que a topologia diga outra coisa', () => {
    const cage = clone()
    // liga uma SHC no ponto S — a topologia diria H, mas SL é decisão de quem modelou
    cage.members.push({ id: 'x', type: 'SHC', a: 'SL', b: 'SR' })
    expect(identifyNamedPoints(cage).renames.SL).toBeUndefined()
  })

  it('AC-DF31.3: vaga ocupada e candidatos duplos ficam de fora, com a razão', () => {
    const cage = clone()
    // N1L vira "C" artificial (RHO + FBM_UP) — mas CL já existe
    cage.members.push({ id: 'y', type: 'RHO', a: 'N1L', b: 'BL' })
    const r = identifyNamedPoints(cage)
    expect(r.renames.N1L).toBeUndefined()
    expect(r.skipped.find((s) => s.id === 'N1L')?.reason).toContain('CL já existe')

    const dup = clone()
    delete dup.nodes.CL
    dup.members = dup.members.filter((m) => m.a !== 'CL' && m.b !== 'CL')
    dup.nodes.G1 = { x: -232, y: 1146, z: 449 }
    dup.nodes.G2 = { x: -232, y: 1100, z: 500 }
    for (const id of ['G1', 'G2']) {
      dup.members.push({ id: `rho-${id}`, type: 'RHO', a: 'BL', b: id })
      dup.members.push({ id: `fbm-${id}`, type: 'FBM_UP', a: id, b: 'N1L' })
    }
    const d = identifyNamedPoints(dup)
    expect(d.renames.G1).toBeUndefined()
    expect(d.renames.G2).toBeUndefined()
    expect(d.skipped.filter((s) => s.wanted === 'CL')).toHaveLength(2)
  })

  it('nó no plano de simetria não recebe letra (as letras do B6 têm lado)', () => {
    const cage = clone()
    cage.nodes.M0 = { x: 0, y: 1146, z: 449 }
    cage.members.push({ id: 'z1', type: 'RHO', a: 'BL', b: 'M0' })
    cage.members.push({ id: 'z2', type: 'FBM_UP', a: 'M0', b: 'N1L' })
    const r = identifyNamedPoints(cage)
    expect(r.renames.M0).toBeUndefined()
    expect(r.skipped.find((s) => s.id === 'M0')?.reason).toContain('simetria')
  })

  it('AC-DF31.4: applyRenames renomeia nó, membros, continuidade e trava; letra sai de namedExtra', () => {
    const cage = clone()
    cage.locked = ['NL', 'AL']
    const out = applyRenames(cage, identifyNamedPoints(cage).renames)
    expect(out.nodes.DL).toEqual(templateCage.nodes.NL)
    expect(out.nodes.NL).toBeUndefined()
    expect(out.members.find((m) => m.id === 'DLC-47')).toMatchObject({ a: 'DL', b: 'DR' })
    expect(
      out.members.some((m) => m.a === 'NL' || m.b === 'NL' || m.a === 'NR' || m.b === 'NR'),
    ).toBe(false)
    expect(out.locked).toEqual(['DL', 'AL'])
    expect(out.namedExtra).toEqual(['SML', 'SMR'])
    expect(out.continuity?.some((c) => c.node === 'NL')).toBe(false)
    // ancoragens e suspensão guardam posição: intactas
    expect(out.anchors).toEqual(cage.anchors)
    expect(out.suspension).toEqual(cage.suspension)
  })

  it('AC-DF31.5: com D identificado, o motor passa a conferir a cadeia do SIM (B6.2.4.5)', () => {
    // sem DL o B6.2.4.5 pula a cadeia do SIM: um trecho faltando passa em branco
    const broken = clone()
    broken.members = broken.members.filter((m) => m.id !== 'SIM-56') // SML→NL some
    const before = evaluate(broken).find((r) => r.id === 'B6.2.4.5')!
    expect(before.status).toBe('pass')
    // com N → D, a lacuna aparece
    const fixed = applyRenames(broken, identifyNamedPoints(broken).renames)
    const after = evaluate(fixed).find((r) => r.id === 'B6.2.4.5')!
    expect(after.status).toBe('fail')
    expect(after.measured).toContain('SIM esquerdo')
    // e no template íntegro renomear não regride nada
    const fails = (c: Cage) =>
      evaluate(c)
        .filter((r) => r.status === 'fail')
        .map((r) => r.id)
    const t = applyRenames(templateCage, identifyNamedPoints(templateCage).renames)
    expect(fails(t)).toEqual(fails(templateCage))
  })

  it('sem nada a renomear, applyRenames devolve a mesma referência', () => {
    const cage = clone()
    expect(applyRenames(cage, {})).toBe(cage)
  })
})
