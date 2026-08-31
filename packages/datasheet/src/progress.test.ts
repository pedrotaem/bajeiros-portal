import { describe, expect, it } from 'vitest'
import { FIELDS, fieldById } from './catalog'
import { computeDivergences, computeProgress } from './progress'
import { validateValue } from './validate'
import type { Field, StoredValue } from './types'

function amostra(f: Field): StoredValue['value'] {
  switch (f.type) {
    case 'number':
      return f.typical?.min ?? f.absolute?.min ?? 1
    case 'enum':
      return f.options![0].id
    case 'boolean':
      return true
    case 'date':
      return '2026-03-01'
    case 'link':
      return 'https://exemplo.org/a.pdf'
    default:
      return 'texto'
  }
}

const tudoPreenchido: StoredValue[] = FIELDS.map((f) => ({
  fieldId: f.id,
  kind: 'design' as const,
  value: amostra(f),
}))

describe('progresso da ficha (DF-21 E3)', () => {
  it('ficha vazia começa em 0% com o denominador cheio', () => {
    const p = computeProgress([])
    expect(p.filled).toBe(0)
    expect(p.total).toBe(FIELDS.length)
    expect(p.pct).toBe(0)
    expect(p.waivedSections).toBe(0)
  })

  // AC-DF21.3 — o coração do §3.2: o validador é meio, não porta de entrada
  it('projeto sem NENHUMA versão de gaiola chega a 100% preenchendo tudo à mão', () => {
    const p = computeProgress(tudoPreenchido)
    expect(p.filled).toBe(FIELDS.length)
    expect(p.pct).toBe(100)
    for (const s of p.sections) expect(s.pct, s.sectionId).toBe(100)
  })

  it('sugestão não aceita NÃO conta como preenchida (RF-3.2)', () => {
    const p = computeProgress([], [])
    // as sugestões existem, mas o progresso só olha valores guardados
    expect(p.filled).toBe(0)
  })

  it('valor medido sozinho já conta o campo como preenchido', () => {
    const p = computeProgress([{ fieldId: 'dim.massa-gaiola', kind: 'measured', value: 31.2 }])
    expect(p.filled).toBe(1)
  })

  // AC-DF21.9
  it('seção dispensada sai do denominador e a contagem aparece', () => {
    const p = computeProgress(tudoPreenchido, ['ergonomia'])
    expect(p.waivedSections).toBe(1)
    expect(p.total).toBeLessThan(FIELDS.length)
    expect(p.sections.find((s) => s.sectionId === 'ergonomia')!.waived).toBe(true)
    expect(p.pct).toBe(100)
  })

  it('campo fora do catálogo não infla o progresso', () => {
    const p = computeProgress([{ fieldId: 'nao.existe', kind: 'design', value: 1 }])
    expect(p.filled).toBe(0)
  })
})

describe('divergências (DF-21 §3.3)', () => {
  // AC-DF21.10 — computadas na leitura, nunca guardadas
  it('devolve as três leituras com sinal e percentual', () => {
    const d = computeDivergences(
      [
        { fieldId: 'dim.massa-gaiola', kind: 'design', value: 30 },
        { fieldId: 'dim.massa-gaiola', kind: 'measured', value: 31.8 },
      ],
      [{ fieldId: 'dim.massa-gaiola', value: 26.4, origin: 'modelo 3D · v14' }],
    ).find((x) => x.fieldId === 'dim.massa-gaiola')!

    expect(d.suggestedVsDesign).toEqual({ abs: 3.6, pct: 13.6 })
    expect(d.designVsMeasured).toEqual({ abs: 1.8, pct: 6 })
    expect(d.suggestedVsMeasured).toEqual({ abs: 5.4, pct: 20.5 })
  })

  it('sem par de valores não há divergência, e campo de texto nunca entra', () => {
    const only = computeDivergences([{ fieldId: 'dim.massa-gaiola', kind: 'design', value: 30 }])
    expect(only).toEqual([])
    const texto = computeDivergences(
      [{ fieldId: 'chassi.fornecedor', kind: 'design', value: 'ACME' }],
      [{ fieldId: 'chassi.fornecedor', value: 'OUTRA', origin: 'modelo 3D' }],
    )
    expect(texto).toEqual([])
  })

  // AC-DF21.8 — divergência não é erro: não gera aviso nem chip de status
  it('divergir da sugestão não produz aviso de validação', () => {
    const campo = fieldById('dim.massa-gaiola')!
    const r = validateValue(campo, 30) // sugestão seria 26,4 — irrelevante para a validação
    expect(r.ok).toBe(true)
    expect(r.ok && r.warning).toBeUndefined()
  })
})

describe('diferença zero (achado ao rodar o app)', () => {
  it('valor igual ao sugerido não vira divergência — "0 (0%)" na tela é ruído', () => {
    const d = computeDivergences(
      [{ fieldId: 'dim.massa-gaiola', kind: 'design', value: 26.1 }],
      [{ fieldId: 'dim.massa-gaiola', value: 26.1, origin: 'modelo 3D · v1' }],
    )
    expect(d).toEqual([])
  })
})
