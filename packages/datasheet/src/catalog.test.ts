import { describe, expect, it } from 'vitest'
import {
  COMPARABLE_FIELDS,
  DATASHEET_VERSION,
  FIELDS,
  SECTIONS,
  fieldById,
  fieldsOf,
  maxLengthOf,
} from './catalog'
import { SUGGESTED_FIELDS } from './suggest'
import { validateValue } from './validate'
import type { Field } from './types'

/** Um valor válido qualquer para o tipo — só para provar que o campo aceita escrita. */
function amostra(f: Field): unknown {
  switch (f.type) {
    case 'number':
      return f.typical?.min ?? f.absolute?.min ?? 1
    case 'enum':
      return f.options?.[0]?.id
    case 'boolean':
      return true
    case 'date':
      return '2026-03-01'
    case 'link':
      return 'https://exemplo.org/certificado.pdf'
    default:
      return 'texto'.slice(0, maxLengthOf(f) ?? 5)
  }
}

describe('catálogo da ficha v1 (DF-21 §5)', () => {
  it('tem as 9 seções da spec, com ids únicos', () => {
    expect(SECTIONS).toHaveLength(9)
    expect(new Set(SECTIONS.map((s) => s.id)).size).toBe(9)
    expect(DATASHEET_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it('todo campo tem id único e pertence a uma seção existente', () => {
    expect(new Set(FIELDS.map((f) => f.id)).size).toBe(FIELDS.length)
    const ids = new Set(SECTIONS.map((s) => s.id))
    for (const f of FIELDS) expect(ids.has(f.section), f.id).toBe(true)
  })

  it('nenhuma seção nasce vazia e o total fica na ordem de grandeza da spec (~70)', () => {
    for (const s of SECTIONS) expect(fieldsOf(s.id).length, s.id).toBeGreaterThan(0)
    expect(FIELDS.length).toBeGreaterThanOrEqual(65)
    expect(FIELDS.length).toBeLessThanOrEqual(90)
  })

  // AC-DF21.2 / RF-1.4 — a guarda que impede o princípio §3.2 de se perder numa
  // mudança futura: se algum campo passar a recusar escrita, este teste cai.
  it('nenhum campo do catálogo é somente leitura', () => {
    for (const f of FIELDS) {
      const r = validateValue(f, amostra(f), 'design')
      expect(r.ok, `${f.id} recusou escrita: ${r.ok ? '' : r.error}`).toBe(true)
    }
  })

  it('campo com sugestão continua aceitando digitação (a sugestão é oferta, não trava)', () => {
    for (const id of SUGGESTED_FIELDS) {
      const f = fieldById(id)!
      expect(validateValue(f, amostra(f)).ok, id).toBe(true)
    }
    expect(SUGGESTED_FIELDS).toHaveLength(6)
  })

  it('todo campo traz rótulo e ajuda canônicos (RF-1.2)', () => {
    for (const f of FIELDS) {
      expect(f.label.length, f.id).toBeGreaterThan(2)
      expect(f.help.length, f.id).toBeGreaterThan(15)
    }
  })

  it('enum tem opções com id único; texto tem teto de caracteres', () => {
    for (const f of FIELDS) {
      if (f.type === 'enum') {
        expect(f.options?.length ?? 0, f.id).toBeGreaterThan(1)
        expect(new Set(f.options!.map((o) => o.id)).size, f.id).toBe(f.options!.length)
      }
      if (f.type === 'text' || f.type === 'longtext' || f.type === 'link') {
        expect(maxLengthOf(f), f.id).toBeGreaterThan(0)
      }
    }
  })

  it('faixa típica sempre cabe dentro da absoluta (senão o aviso viraria recusa)', () => {
    for (const f of FIELDS) {
      if (!f.typical) continue
      expect(f.absolute, `${f.id} tem faixa típica sem faixa absoluta`).toBeDefined()
      expect(f.typical.min, f.id).toBeLessThan(f.typical.max)
      expect(f.typical.min, f.id).toBeGreaterThanOrEqual(f.absolute!.min)
      expect(f.typical.max, f.id).toBeLessThanOrEqual(f.absolute!.max)
    }
  })

  it('só campo `dual` tem coluna de medido, e ela existe onde a spec pede', () => {
    const duais = FIELDS.filter((f) => f.dual).map((f) => f.id)
    expect(duais).toContain('dim.massa-gaiola')
    expect(duais).toContain('erg.folga-capacete')
    expect(duais).toContain('dim.entre-eixos')
    // campo não-dual recusa escrita em `measured` — é o que impede a coluna de
    // aparecer onde ela não significa nada
    expect(validateValue(fieldById('chassi.fornecedor')!, 'ACME', 'measured').ok).toBe(false)
  })

  // RF-6.4 — classe, massa, entre-eixos, bitola e pneu são o mínimo comparável
  it('marca como comparável o que a comunidade precisa para medianas por classe', () => {
    for (const id of [
      'id.ocupantes',
      'id.tracao',
      'dim.entre-eixos',
      'dim.bitola-dianteira',
      'dim.bitola-traseira',
      'dim.massa-seco',
      'tf.pneu',
    ]) {
      expect(COMPARABLE_FIELDS, id).toContain(id)
    }
  })
})
