import { describe, expect, it } from 'vitest'
import { AREA_IDS, AREA_LABELS, AREA_SHORT, LEVEL_NAMES, levelLabel } from './areas'
import { CATALOG, CATALOG_CHANGELOG, CATALOG_VERSION, visibleCriteria } from './catalog'
import { AUTO_CHECKS } from './compute'
import { CRITERION_IDS, destinationFor, stepTitle } from './destinations'

describe('catálogo v1', () => {
  it('tem os 51 critérios da spec, com IDs únicos', () => {
    expect(CATALOG).toHaveLength(51)
    expect(new Set(CRITERION_IDS).size).toBe(51)
  })

  it('cobre as 6 áreas e a versão está no changelog', () => {
    expect(new Set(CATALOG.map((c) => c.area))).toEqual(new Set(AREA_IDS))
    expect(CATALOG_CHANGELOG[CATALOG_CHANGELOG.length - 1].version).toBe(CATALOG_VERSION)
  })

  it('todo critério tem âncora na pesquisa (governança §9)', () => {
    for (const c of CATALOG) expect(c.research.length, c.id).toBeGreaterThan(10)
  })

  it('prefixo do ID combina com a área', () => {
    const prefix: Record<string, string> = {
      estrutura: 'EST',
      dinamica: 'DIN',
      documentacao: 'DOC',
      fabricacao: 'FAB',
      gestao: 'GES',
      conhecimento: 'CON',
    }
    for (const c of CATALOG) expect(c.id.startsWith(prefix[c.area]), c.id).toBe(true)
  })

  it('cada área visível tem ao menos um critério em cada nível 1–5', () => {
    for (const area of AREA_IDS) {
      const levels = new Set(visibleCriteria(area).map((c) => c.level))
      expect([...levels].sort(), area).toEqual([1, 2, 3, 4, 5])
    }
  })

  it('os 2 critérios ocultos ficam fora do denominador', () => {
    const hidden = CATALOG.filter((c) => c.type === 'oculto').map((c) => c.id)
    expect(hidden).toEqual(['EST-4.1', 'DOC-4.2'])
    for (const area of AREA_IDS) {
      expect(visibleCriteria(area).some((c) => hidden.includes(c.id))).toBe(false)
    }
  })

  it('todo critério `auto` tem check e não sobra check órfão', () => {
    const autos = CATALOG.filter((c) => c.type === 'auto').map((c) => c.id)
    expect(Object.keys(AUTO_CHECKS).sort()).toEqual([...autos].sort())
  })

  it('critério `declarado` não tem check automático', () => {
    for (const c of CATALOG.filter((c) => c.type !== 'auto')) {
      expect(AUTO_CHECKS[c.id], c.id).toBeUndefined()
    }
  })

  it('todo critério tem destino e o título de passo cabe em 140', () => {
    for (const c of CATALOG) {
      expect(destinationFor(c.id)).toBeTruthy()
      expect(stepTitle(c).length, c.id).toBeLessThanOrEqual(140)
    }
  })

  it('critério do validador aterrissa no editor; conhecimento na aba certa', () => {
    expect(destinationFor('EST-3.1')).toEqual({ page: 'editor' })
    expect(destinationFor('CON-1.1')).toEqual({ page: 'equipe', tab: 'conhecimento' })
    expect(destinationFor('GES-2.1')).toEqual({ page: 'equipe', tab: 'pessoas' })
    expect(destinationFor('DOC-1.1')).toEqual({ page: 'equipe', tab: 'evolucao' })
  })
})

describe('strings canônicas', () => {
  it('toda área tem rótulo longo e curto', () => {
    for (const a of AREA_IDS) {
      expect(AREA_LABELS[a]).toBeTruthy()
      expect(AREA_SHORT[a]).toBeTruthy()
    }
  })

  it('nível vem sempre com texto, nunca só com número', () => {
    expect(levelLabel(0)).toBe('ainda sem nível')
    expect(levelLabel(3)).toBe('nível 3 de 5')
    expect(LEVEL_NAMES[5]).toBe('Excelência')
  })
})
