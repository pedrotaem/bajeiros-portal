import { describe, expect, it } from 'vitest'
import { templateCage } from '@bajeiros/core/model/template'
import type { Cage } from '@bajeiros/core/model/types'
import {
  SUGGESTED_FIELDS,
  helmetClearanceMm,
  suggestFrom,
  tubeCount,
  tubeLengthMm,
} from './suggest'

const cage = templateCage as Cage

describe('sugestões do modelo 3D (DF-21 §3.2)', () => {
  // AC-DF21.1 — ausência de gaiola é caso NORMAL, não exceção (RF-1.3)
  it('sem versão salva devolve vazio, sem erro', () => {
    expect(suggestFrom(null)).toEqual([])
    expect(suggestFrom(undefined)).toEqual([])
    expect(suggestFrom({} as Cage)).toEqual([])
  })

  it('com snapshot devolve os campos marcados `suggest`, e só eles', () => {
    const s = suggestFrom(cage, { seq: 14 })
    expect(s.length).toBeGreaterThan(0)
    for (const item of s) expect(SUGGESTED_FIELDS).toContain(item.fieldId)
  })

  it('a origem carrega a versão, para a linha "modelo 3D · v14"', () => {
    expect(suggestFrom(cage, { seq: 14 })[0].origin).toBe('modelo 3D · v14')
    expect(suggestFrom(cage)[0].origin).toBe('modelo 3D')
  })

  it('massa, comprimento de tubo e número de cortes saem do modelo', () => {
    const byId = new Map(suggestFrom(cage).map((s) => [s.fieldId, s.value]))
    expect(byId.get('dim.massa-gaiola')).toBeGreaterThan(0)
    expect(byId.get('dim.comprimento-tubo')).toBe(Math.round(tubeLengthMm(cage)))
    expect(byId.get('dim.tubos-cortados')).toBe(tubeCount(cage))
  })

  it('as seções vêm com material e medida legíveis', () => {
    const byId = new Map(suggestFrom(cage).map((s) => [s.fieldId, s.value]))
    expect(String(byId.get('chassi.secao-primaria'))).toMatch(/SAE \d+ · Ø [\d,.]+ × [\d,.]+ mm/)
    expect(String(byId.get('chassi.secao-secundaria'))).toMatch(/Ø/)
  })

  it('folga de capacete sai do manequim; gaiola sem habitáculo não sugere', () => {
    expect(helmetClearanceMm(cage)).toBeGreaterThan(0)
    const semHabitaculo: Cage = { ...cage, members: cage.members.filter((m) => m.type === 'FREE') }
    expect(helmetClearanceMm(semHabitaculo)).toBeNull()
  })

  // AC-DF21.5 (metade pura): salvar versão nova muda a SUGESTÃO. Que ela não toque em
  // valor guardado é garantido por não existir escrita aqui — o módulo é uma função.
  it('modelo novo muda a sugestão', () => {
    const antes = suggestFrom(cage).find((s) => s.fieldId === 'dim.massa-gaiola')!.value as number
    const maisPesada: Cage = {
      ...cage,
      primarySection: { ...cage.primarySection, wall: cage.primarySection.wall + 1 },
    }
    const depois = suggestFrom(maisPesada).find((s) => s.fieldId === 'dim.massa-gaiola')!
      .value as number
    expect(depois).toBeGreaterThan(antes)
  })
})
