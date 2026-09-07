import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { validarIndice } from '../../../../scripts/build-regulamento-indice.mjs'
import { parseRules, render, sectionOf } from '../../../../scripts/build-rule-sections.mjs'
import { evaluate } from '@bajeiros/core/rules/b6'
import { templateCage } from '@bajeiros/core/model/template'
import { RULE_SECTIONS, SECTION_RULES } from './rule-sections'
import {
  ancestrais,
  arvore,
  filtrar,
  hashDaSecao,
  irmaos,
  lerHashRegulamento,
  paiDe,
  regrasDaSecao,
  rotuloDePaginas,
  urlDaPagina,
  type IndiceRegulamento,
} from './indice'

const raiz = path.resolve(__dirname, '../../../..')
const indice: IndiceRegulamento = JSON.parse(
  readFileSync(path.join(raiz, 'apps/web/public/regulamento/indice-emenda-07.json'), 'utf8'),
)
const blocos = indice.blocks
const porId = new Map(blocos.map((b) => [b.id, b]))

describe('índice publicado (DF-34 §5.2)', () => {
  it('não carrega texto do regulamento: nenhum título em depth >= 3', () => {
    expect(() => validarIndice(indice)).not.toThrow()
    expect(blocos.filter((b) => b.depth >= 3 && b.title)).toEqual([])
  })

  it('a guarda FALHA se um título fundo aparecer (AC-DF34.3)', () => {
    const adulterado = {
      ...indice,
      blocks: [...blocos.slice(0, 3), { ...porId.get('B6.2.4.3')!, title: 'A largura medida a' }],
    }
    expect(() => validarIndice(adulterado)).toThrow(/B6\.2\.4\.3/)
  })

  it('a guarda FALHA se um título raso for prosa cortada', () => {
    const adulterado = {
      ...indice,
      blocks: [{ ...porId.get('B6.2')!, title: 'A estrutura da gaiola deve ser construída com,' }],
    }
    expect(() => validarIndice(adulterado)).toThrow(/B6\.2/)
  })

  it('cobre o documento inteiro: preâmbulo, três partes e as 148 páginas', () => {
    expect(indice.pageCount).toBe(148)
    expect(blocos.filter((b) => b.depth === 0).map((b) => b.id)).toEqual([
      'PREAMBULO',
      'PARTE A',
      'PARTE B',
      'PARTE C',
    ])
    expect(new Set(blocos.map((b) => b.id)).size).toBe(blocos.length)
    for (const b of blocos) expect(b.pageEnd).toBeGreaterThanOrEqual(b.pageStart)
  })

  it('carrega a versão do corpus do gateway — é ela que a citação do assistente casa', () => {
    expect(indice.edition).toBe('emenda-07')
    expect(indice.corpusVersion).toMatch(/^ratbsb@emenda-07#sha256:/)
    expect(indice.pdfSha256).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('árvore do índice (FR-DF34.6)', () => {
  const raizes = arvore(blocos)

  it('parte › capítulo › seção, com os itens fundos pendurados na seção', () => {
    const parteB = raizes.find((n) => n.bloco.id === 'PARTE B')!
    expect(parteB.bloco.title).toBe('REGULAMENTO TÉCNICO')
    const b6 = parteB.filhos.find((n) => n.bloco.id === 'B6')!
    expect(b6.bloco.title).toBe('GAIOLA DE PROTEÇÃO')
    const b62 = b6.filhos.find((n) => n.bloco.id === 'B6.2')!
    expect(b62.bloco.title).toBe('Estrutura da gaiola de proteção')
    expect(b62.fundos.map((b) => b.id)).toContain('B6.2.4.3')
    expect(b62.fundos.every((b) => !b.title)).toBe(true)
  })

  it('nenhum bloco se perde: todo item fundo cai em alguma seção', () => {
    const dentro = raizes.flatMap(function conta(n): number[] {
      return [n.fundos.length, ...n.filhos.flatMap(conta)]
    })
    const rasos = blocos.filter((b) => b.depth <= 2).length
    expect(dentro.reduce((a, b) => a + b, 0) + rasos).toBe(blocos.length)
  })

  it('caminho e irmãos são o que o painel e o cartão mostram', () => {
    expect(paiDe('B6.2.4.3')).toBe('B6.2.4')
    expect(paiDe('B6')).toBe('PARTE B')
    expect(paiDe('PARTE B')).toBeNull()
    expect(ancestrais('B6.2.4.3')).toEqual(['PARTE B', 'B6', 'B6.2', 'B6.2.4', 'B6.2.4.3'])
    expect(irmaos(blocos, 'B6.2').map((b) => b.id)).toEqual(['B6.1', 'B6.2', 'B6.3', 'B6.4'])
  })
})

describe('"Ir para" (FR-DF34.3)', () => {
  it('aceita id, página e palavra do título', () => {
    expect(filtrar(blocos, 'B6.2.4.3').map((b) => b.id)).toEqual(['B6.2.4.3'])
    expect(filtrar(blocos, 'p. 42').every((b) => b.pageStart <= 42 && 42 <= b.pageEnd)).toBe(true)
    expect(filtrar(blocos, 'p. 42').length).toBeGreaterThan(0)
    expect(filtrar(blocos, 'gaiola').map((b) => b.id)).toContain('B6')
    expect(filtrar(blocos, 'GAIOLA').map((b) => b.id)).toContain('B6')
  })

  it('id parcial abre o ramo; consulta vazia não filtra nada', () => {
    expect(filtrar(blocos, 'B6.2.4').map((b) => b.id)).toContain('B6.2.4.3')
    expect(filtrar(blocos, '')).toEqual([])
  })

  it('varre o índice inteiro sem custo perceptível (AC-DF34.4)', () => {
    const t0 = performance.now()
    for (const q of ['B6.2.4.3', 'p. 42', 'gaiola', 'freio']) filtrar(blocos, q)
    expect(performance.now() - t0).toBeLessThan(100)
  })
})

describe('link da seção e do PDF', () => {
  it('hash de entrada com e sem edição (FR-DF34.5)', () => {
    expect(lerHashRegulamento('#regulamento=B6.2.4.3')).toEqual({
      sectionId: 'B6.2.4.3',
      edition: undefined,
    })
    expect(lerHashRegulamento('#regulamento=B6.2.4.3@emenda-06')).toEqual({
      sectionId: 'B6.2.4.3',
      edition: 'emenda-06',
    })
    expect(lerHashRegulamento('#convite=abc')).toBeNull()
    const copiado = hashDaSecao('B6.2.4.3', 'emenda-07')
    expect(lerHashRegulamento(copiado)).toEqual({
      sectionId: 'B6.2.4.3',
      edition: 'emenda-07',
    })
  })

  it('abre o PDF oficial na página da seção (AC-DF34.2)', () => {
    expect(urlDaPagina('https://exemplo.org/ratbsb.pdf', 34)).toBe(
      'https://exemplo.org/ratbsb.pdf#page=34',
    )
    expect(urlDaPagina('https://exemplo.org/ratbsb.pdf#page=1', 34)).toBe(
      'https://exemplo.org/ratbsb.pdf#page=34',
    )
    expect(rotuloDePaginas({ pageStart: 34, pageEnd: 41 })).toBe('páginas 34–41')
    expect(rotuloDePaginas({ pageStart: 42, pageEnd: 42 })).toBe('página 42')
  })
})

describe('mapa regra ↔ seção (DF-34 §5.4, AC-DF34.10)', () => {
  const rules = readFileSync(path.join(raiz, 'specs/rules.md'), 'utf8')

  it('rule-sections.ts está em paridade com specs/rules.md', () => {
    const gerado = render(parseRules(rules))
    const emDisco = readFileSync(path.join(__dirname, 'rule-sections.ts'), 'utf8')
    expect(emDisco).toBe(gerado)
  })

  it('toda regra do catálogo aponta para uma seção que existe no índice', () => {
    for (const [regra, secao] of Object.entries(RULE_SECTIONS)) {
      expect(porId.has(secao), `${regra} → ${secao} não existe no índice`).toBe(true)
    }
  })

  it('regra do motor que o catálogo lista tem seção; regra de modelagem do portal não', () => {
    const emitidas = evaluate(templateCage).map((r) => r.id)
    const doRegulamento = emitidas.filter((id) => /^[A-C]\d/.test(id))
    for (const id of doRegulamento) {
      expect(RULE_SECTIONS[id], `${id} sem seção — rules.md e o motor divergiram`).toBeTruthy()
    }
    for (const doPortal of emitidas.filter((x) => !/^[A-C]\d/.test(x))) {
      expect(RULE_SECTIONS[doPortal]).toBeUndefined()
    }
  })

  it('alíneas caem na seção do item (B6.2.4.7a e B6.2.9.2/3)', () => {
    expect(sectionOf('B6.2.4.7a')).toBe('B6.2.4.7')
    expect(sectionOf('B6.2.9.2/3')).toBe('B6.2.9.2')
    expect(SECTION_RULES['B6.2.4.7']).toEqual(['B6.2.4.7a', 'B6.2.4.7b'])
  })

  it('contador do índice soma as regras da seção e das filhas (FR-DF34.8)', () => {
    expect(regrasDaSecao('B6.2.4')).toContain('B6.2.4.3')
    expect(regrasDaSecao('B6.2').length).toBeGreaterThan(regrasDaSecao('B6.2.4').length)
    expect(regrasDaSecao('B2')).toEqual([])
  })
})
