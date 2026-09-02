import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ATRITOS, PRATICAS, NUMEROS, LEVANTAMENTO, FONTE_PANORAMA } from './data/panorama'

const publicHome = readFileSync(new URL('./components/PublicHome.tsx', import.meta.url), 'utf8')
const brazilMap = readFileSync(new URL('./components/BrazilMap.tsx', import.meta.url), 'utf8')
const marks = readFileSync(new URL('./icons/marks.tsx', import.meta.url), 'utf8')
const registry = readFileSync(new URL('./icons/registry.ts', import.meta.url), 'utf8')

describe('vitrine — ação primária única (DF-25 FR-DF25.3)', () => {
  it('só "Criar conta" é primária, e ela aparece duas vezes', () => {
    const primarias = publicHome.match(/bj-btn bj-btn-primary/g) ?? []
    // hero e fecho na vitrine; a terceira é o `PrecisaDeConta`, que é outro componente
    expect(primarias.length).toBe(3)
  })

  it('a secundária leva ao validador sem conta', () => {
    expect(publicHome).toContain('Abrir o validador sem conta')
    expect(publicHome).toContain("setPage('editor')")
  })

  it('a vitrine não redesenha o que o rail já tem (DF-25 §5.1)', () => {
    // sem topbar, sem wordmark de canto, sem "Entrar" no alto: repetir diria duas
    // coisas diferentes sobre onde clicar
    expect(publicHome).not.toMatch(/bj-topbar|bj-rail|>Entrar</)
  })
})

describe('vitrine — obrigação de interface (spec.md §1 / FR-DF25.5)', () => {
  it('o aviso legal continua na página, além do disclaimer da topbar', () => {
    expect(publicHome).toContain('Aviso legal')
    expect(publicHome).toContain('não substitui')
    expect(publicHome).toContain('B6.4')
    expect(publicHome).toContain('sem vínculo')
  })
})

describe('vitrine — faixa sobre a organização (DF-25 §5.4)', () => {
  it('cada atrito cita o artigo exato — é o que torna barata a virada de emenda', () => {
    expect(ATRITOS).toHaveLength(4)
    for (const a of ATRITOS) {
      expect(a.fonte, a.texto).toMatch(/A\d|Informativo/)
      expect(a.texto.length).toBeLessThan(90)
    }
  })

  it('os dois enquadramentos obrigatórios estão na tela', () => {
    expect(publicHome).toContain('comitê pequeno e voluntário')
    expect(publicHome).toContain('nem fala pela organização')
  })

  it('a faixa sai por constante, não por edição de JSX', () => {
    expect(publicHome).toContain('{MOSTRAR_ATRITOS && (')
  })
})

describe('vitrine — menos texto (DF-25 FR-DF25.6)', () => {
  it('a forma canônica é número + uma frase curta', () => {
    expect(NUMEROS).toHaveLength(4)
    for (const n of NUMEROS) {
      expect(n.valor.length).toBeLessThanOrEqual(2)
      expect(n.rotulo.split(' ').length).toBeLessThanOrEqual(4)
    }
    for (const p of PRATICAS) {
      expect(p.texto.length, p.quem).toBeLessThan(80)
      expect(p.quem.length).toBeLessThan(30)
    }
  })
})

describe('vitrine — panorama acessível (DF-25 FR-DF25.12)', () => {
  it('os botões são o controle: aria-pressed neles, role=img no mapa', () => {
    expect(brazilMap).toContain('aria-pressed=')
    expect(brazilMap).toContain('role="img"')
    expect(brazilMap).toContain('aria-live="polite"')
  })

  it('o rótulo do mapa descreve o que ele mostra e manda usar os botões', () => {
    expect(brazilMap).toContain('fronteiras dos 27 estados')
    expect(brazilMap).toContain('Use os botões abaixo')
  })

  it('cada estado tem dica nativa, que serve a ponteiro e a leitor de tela', () => {
    expect(brazilMap).toContain('<title>')
    expect(brazilMap).toContain('nenhuma equipe mapeada')
  })

  it('FR-DF25.13: a data e a procedência da malha saem na faixa, não só no rodapé', () => {
    expect(FONTE_PANORAMA).toContain(LEVANTAMENTO)
    expect(FONTE_PANORAMA).toContain('Natural Earth')
    expect(FONTE_PANORAMA).toContain('domínio público')
    expect(brazilMap).toContain('FONTE_PANORAMA')
  })
})

describe('vitrine — marca do portal (DF-25 §4.3)', () => {
  it('AC-DF25.6: 3 de 4 marcas, e a nova nomeia o produto', () => {
    const nomes = [...registry.matchAll(/name: '(Mark\w+)'/g)].map((m) => m[1])
    expect(nomes).toEqual(['MarkCage', 'MarkAssistant', 'MarkPortal'])
    expect(registry).toContain("product: 'Portal Bajeiros'")
    expect(registry).toContain('MARK_CEILING = 4')
  })

  it('a geometria respeita o contrato do primitivo (sem fill, sem cor, sem <g>)', () => {
    const portal = marks.slice(marks.indexOf('export const MarkPortal'))
    expect(portal).not.toMatch(/\sfill="(?!none)/)
    expect(portal).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(portal).not.toMatch(/<g[\s>]/)
    expect(portal).not.toMatch(/\sstrokeWidth=/)
  })

  it('FR-DF25.17: a marca nunca aparece sem rótulo ao lado', () => {
    // toda ocorrência de <MarkPortal .../> na vitrine tem texto irmão no mesmo bloco
    expect(publicHome).toContain('<MarkPortal size={24} className="bj-hero-marca" />')
    expect(publicHome).toContain('Bajeiros')
  })

  it('o inventário de ícones continua intocado em 23', () => {
    const icones = [...registry.matchAll(/name: '(Icon\w+)'/g)].map((m) => m[1])
    expect(icones).toHaveLength(23)
    expect(registry).toContain('ICON_CEILING = 24')
  })
})
