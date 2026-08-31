import { describe, expect, it } from 'vitest'
import { AREA_IDS, AREA_LABELS, AREA_SHORT, LEVEL_NAMES, levelLabel } from './areas'
import {
  CATALOG,
  CATALOG_CHANGELOG,
  CATALOG_MODE,
  CATALOG_VERSION,
  SEASONAL_IDS,
  visibleCriteria,
} from './catalog'
import { AUTO_CHECKS } from './checks'
import { COUNTER_CHECKS } from './counter'
import { CRITERION_IDS, destinationFor, stepTitle } from './destinations'

describe('catálogo v2.0.0 (DF-19)', () => {
  it('tem os 51 critérios da spec, com IDs únicos', () => {
    expect(CATALOG).toHaveLength(51)
    expect(new Set(CRITERION_IDS).size).toBe(51)
  })

  it('cobre as 6 áreas e a versão está no changelog', () => {
    expect(new Set(CATALOG.map((c) => c.area))).toEqual(new Set(AREA_IDS))
    expect(CATALOG_CHANGELOG[CATALOG_CHANGELOG.length - 1].version).toBe(CATALOG_VERSION)
    expect(CATALOG_VERSION).toBe('2.0.0')
  })

  it('a v1 da avaliação é autodeclarativa', () => {
    expect(CATALOG_MODE).toBe('declarado')
  })

  it('AC-DF19.8 — todo critério tem âncora na pesquisa (governança §7)', () => {
    for (const c of CATALOG) expect(c.research.length, c.id).toBeGreaterThan(10)
  })

  it('AC-DF19.9 — enunciado, régua e contra-exemplo são canônicos no pacote', () => {
    for (const c of CATALOG) {
      expect(c.question.length, c.id).toBeGreaterThan(20)
      expect(c.question.endsWith('?'), c.id).toBe(true)
      expect(c.fulfilled.length, c.id).toBeGreaterThan(30)
      expect(c.notValid.length, c.id).toBeGreaterThan(15)
      expect(c.where.length, c.id).toBeGreaterThan(5)
      expect(c.audit.note.length, c.id).toBeGreaterThan(10)
    }
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

  it('cada área tem ao menos um critério em cada nível 1–5', () => {
    for (const area of AREA_IDS) {
      const levels = new Set(visibleCriteria(area).map((c) => c.level))
      expect([...levels].sort(), area).toEqual([1, 2, 3, 4, 5])
    }
  })

  it('AC-DF19.2 — não existe critério oculto: o denominador é 51 em todas as áreas somadas', () => {
    const soma = AREA_IDS.reduce((acc, a) => acc + visibleCriteria(a).length, 0)
    expect(soma).toBe(51)
    // os dois ex-`oculto` do v1.0.0 entraram como declarados (RF-1.4)
    for (const id of ['EST-4.1', 'DOC-4.2']) {
      const c = CATALOG.find((x) => x.id === id)!
      expect(c.type, id).toBe('declarado')
      expect(c.audit.wave, id).toBe('V3')
    }
  })

  it('a distribuição por área bate com a tabela do §6', () => {
    const esperado: Record<string, number> = {
      estrutura: 10,
      dinamica: 9,
      documentacao: 7,
      fabricacao: 7,
      gestao: 9,
      conhecimento: 9,
    }
    for (const area of AREA_IDS) expect(visibleCriteria(area).length, area).toBe(esperado[area])
  })

  it('§6 — 19 critérios com aferição na onda V1', () => {
    const v1 = CATALOG.filter((c) => c.audit.wave === 'V1')
    expect(v1).toHaveLength(19)
    // e todos eles têm contraprova escrita no DF-20
    for (const c of v1) expect(COUNTER_CHECKS[c.id], c.id).toBeTruthy()
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

  it('RF-4.4 — os sazonais são os que a spec marca com validade de temporada', () => {
    expect([...SEASONAL_IDS].sort()).toEqual(
      [
        'CON-5.1',
        'DOC-1.1',
        'DOC-2.1',
        'DOC-3.1',
        'DOC-4.1',
        'DOC-4.2',
        'EST-5.2',
        'FAB-4.1',
        'GES-3.2',
        'GES-4.2',
        'GES-5.2',
      ].sort(),
    )
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

  it('RF-4.8 — nenhum enunciado exige ferramenta específica do portal', () => {
    // o texto pergunta pela PRÁTICA; a ferramenta só aparece como "caminho fácil"
    for (const c of CATALOG) {
      expect(c.question.toLowerCase(), c.id).not.toMatch(/validador|editor 3d|use o portal/)
    }
    const caminhoFacil = CATALOG.filter((c) => /caminho fácil/i.test(c.fulfilled))
    expect(caminhoFacil.map((c) => c.id).sort()).toEqual(
      ['DIN-2.1', 'DIN-2.2', 'EST-2.1', 'EST-3.1', 'FAB-2.1'].sort(),
    )
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
