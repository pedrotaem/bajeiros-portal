import { describe, expect, it } from 'vitest'
import { fieldById } from './catalog'
import { validateFieldId, validateValue } from './validate'

const massaGaiola = fieldById('dim.massa-gaiola')!
const disco = fieldById('freio.disco-dianteiro')!

describe('validação de borda da ficha (DF-21 E4)', () => {
  // AC-DF21.7
  it('valor fora da faixa TÍPICA é salvo e devolve aviso', () => {
    const r = validateValue(massaGaiola, 18)
    expect(r.ok).toBe(true)
    expect(r.ok && r.warning).toMatch(/[Ii]ncomum/)
    expect(r.ok && r.warning).toMatch(/unidade/)
  })

  it('valor fora da faixa ABSOLUTA é recusado, com mensagem de unidade', () => {
    const r = validateValue(massaGaiola, 2)
    expect(r.ok).toBe(false)
    expect(!r.ok && r.error).toMatch(/unidade/i)
    expect(validateValue(disco, 3000).ok).toBe(false) // disco de 3 m
  })

  it('valor dentro do típico passa sem aviso nenhum', () => {
    const r = validateValue(massaGaiola, 32)
    expect(r).toEqual({ ok: true, value: 32 })
  })

  it('número aceita vírgula decimal, como a pessoa digita', () => {
    expect(validateValue(massaGaiola, '31,8')).toEqual({ ok: true, value: 31.8 })
    expect(validateValue(massaGaiola, 'trinta').ok).toBe(false)
  })

  it('enum só aceita opção do catálogo', () => {
    expect(validateFieldId('id.tracao', 'traseira').ok).toBe(true)
    expect(validateFieldId('id.tracao', 'esteira').ok).toBe(false)
  })

  it('link exige endereço, e texto respeita o teto', () => {
    expect(validateFieldId('chassi.certificado', 'ftp://x').ok).toBe(false)
    expect(validateFieldId('chassi.certificado', 'https://ex.org/nf.pdf').ok).toBe(true)
    expect(validateFieldId('chassi.observacoes', 'x'.repeat(1001)).ok).toBe(false)
    expect(validateFieldId('chassi.observacoes', 'x'.repeat(1000)).ok).toBe(true)
  })

  it('data exige AAAA-MM-DD', () => {
    expect(validateFieldId('ele.cinto-validade', '2027-05-01').ok).toBe(true)
    expect(validateFieldId('ele.cinto-validade', '01/05/2027').ok).toBe(false)
  })

  it('booleano não aceita string', () => {
    expect(validateFieldId('freio.travamento', true).ok).toBe(true)
    expect(validateFieldId('freio.travamento', 'sim').ok).toBe(false)
  })

  it('campo fora do catálogo dá erro nomeado', () => {
    const r = validateFieldId('dim.inventado', 1)
    expect(!r.ok && r.error).toMatch(/não existe no catálogo/)
  })

  it('medido só existe onde há coluna de medido', () => {
    expect(validateValue(massaGaiola, 31.8, 'measured').ok).toBe(true)
    expect(validateFieldId('chassi.fornecedor', 'ACME', 'measured').ok).toBe(false)
  })
})
