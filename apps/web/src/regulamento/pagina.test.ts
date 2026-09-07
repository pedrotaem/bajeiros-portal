import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, beforeEach } from 'vitest'
import { useSession } from '../session'
import { achatar, abrirAte } from '../components/RegulationTree'
import { arvore, type IndiceRegulamento } from './indice'
import {
  edicaoDoCorpus,
  referenciasDaSecao,
  rotuloVigencia,
  versaoEscolhida,
  versaoVigente,
  type PayloadRegulamento,
  type Referencia,
} from './api'

// DF-34 — comportamento da página do regulamento: qual emenda abre, o que a árvore
// mostra e o que a ponte com o assistente carrega. Sem DOM: o que a tela faz de
// decisão está em função pura ou no store.

const indice: IndiceRegulamento = JSON.parse(
  readFileSync(path.resolve(__dirname, '../../public/regulamento/indice-emenda-07.json'), 'utf8'),
)

const fonte = (id: string, over: Partial<Referencia> = {}): Referencia => ({
  id,
  kind: 'regulamento',
  title: `Documento ${id}`,
  url: `https://exemplo.test/${id}.pdf`,
  publishedOn: null,
  edition: null,
  sectionId: null,
  altersRules: false,
  supersedesId: null,
  checkedAt: '2026-09-01T00:00:00.000Z',
  ...over,
})

const payload: PayloadRegulamento = {
  season: 2027,
  versions: [
    {
      id: 'v7',
      edition: 'emenda-07',
      label: 'RATBSB Emenda 7 · Baja 2026',
      corpusVersion: 'ratbsb@emenda-07#sha256:e4a0',
      pdfSha256: 'f'.repeat(64),
      pageCount: 148,
      publishedOn: '2025-11-01',
      checkedAt: '2026-09-01T00:00:00.000Z',
      supersedesId: 'v6',
      supersededById: null,
      source: fonte('s7', { edition: 'emenda-07' }),
      appliesTo: [
        { competitionId: 'c1', name: 'Nacional 2027', season: 2027, kind: 'nacional' },
        { competitionId: 'c2', name: 'Regional Sudeste 2026', season: 2026, kind: 'regional' },
      ],
    },
    {
      id: 'v6',
      edition: 'emenda-06',
      label: 'RATBSB Emenda 6 · Baja 2025',
      corpusVersion: 'ratbsb@emenda-06#sha256:1111',
      pdfSha256: 'a'.repeat(64),
      pageCount: 140,
      publishedOn: '2024-11-01',
      checkedAt: '2026-09-01T00:00:00.000Z',
      supersedesId: null,
      supersededById: 'v7',
      source: fonte('s6', { edition: 'emenda-06' }),
      appliesTo: [],
    },
  ],
}

describe('qual emenda a página abre (§3.2)', () => {
  it('sem escolha, a vigente é a que tem competição declarada', () => {
    expect(versaoVigente(payload)?.edition).toBe('emenda-07')
    expect(versaoEscolhida(payload, null)?.edition).toBe('emenda-07')
    expect(rotuloVigencia(versaoVigente(payload))).toBe('Nacional 2027 · Regional Sudeste 2026')
  })

  it('a citação abre a emenda DAQUELA resposta, não a mais nova (AC-DF34.6)', () => {
    expect(edicaoDoCorpus('ratbsb@emenda-06#sha256:1111')).toBe('emenda-06')
    expect(versaoEscolhida(payload, 'emenda-06')?.edition).toBe('emenda-06')
    // e a tela sabe que ela foi substituída — é o que acende a faixa `warn`
    expect(versaoEscolhida(payload, 'emenda-06')?.supersededById).toBe('v7')
  })

  it('edição desconhecida cai na vigente em vez de deixar a tela vazia', () => {
    expect(versaoEscolhida(payload, 'emenda-99')?.edition).toBe('emenda-07')
    expect(edicaoDoCorpus(undefined)).toBeUndefined()
    expect(versaoVigente(null)).toBeNull()
  })
})

describe('referências da seção (FR-DF34.12)', () => {
  const refs = [
    fonte('a', { sectionId: 'B6', kind: 'template' }),
    fonte('b', { sectionId: 'B6.2.4.3', altersRules: true, kind: 'pagina' }),
    fonte('c', { sectionId: 'B11', kind: 'pagina' }),
    fonte('d', { sectionId: null, kind: 'forum' }),
  ]

  it('pega o que é da seção e o que é do capítulo que a contém', () => {
    expect(referenciasDaSecao(refs, 'B6.2.4.3').map((r) => r.id)).toEqual(['a', 'b'])
    expect(referenciasDaSecao(refs, 'B11').map((r) => r.id)).toEqual(['c'])
    expect(referenciasDaSecao(refs, null)).toEqual([])
  })
})

describe('árvore do índice na tela', () => {
  const raizes = arvore(indice.blocks)

  it('fechada, mostra só as partes', () => {
    const itens = achatar(raizes, new Set())
    expect(itens.map((i) => i.bloco.id)).toEqual(['PREAMBULO', 'PARTE A', 'PARTE B', 'PARTE C'])
    expect(itens.find((i) => i.bloco.id === 'PARTE B')?.temFilhos).toBe(true)
  })

  it('uma citação abre o caminho inteiro até a seção citada (FR-DF34.7)', () => {
    const abertos = abrirAte('B6.2.4.3', new Set())
    expect([...abertos]).toEqual(
      expect.arrayContaining(['PARTE B', 'B6', 'B6.2', 'B6.2.4', 'B6.2.4.3']),
    )
    const ids = achatar(raizes, abertos).map((i) => i.bloco.id)
    expect(ids).toContain('B6.2.4.3')
    // e não abre o que não está no caminho
    expect(ids).not.toContain('B7.1')
  })

  it('item fundo entra só com número e página — nada de texto (§3.1)', () => {
    const itens = achatar(raizes, abrirAte('B6.2.4.3', new Set()))
    for (const item of itens) {
      if (item.bloco.depth >= 3) expect(item.bloco.title).toBeUndefined()
    }
  })
})

describe('ida e volta com o assistente (AC-DF34.5)', () => {
  beforeEach(() => {
    useSession.setState({
      page: 'assistant',
      regulation: { edition: null, sectionId: null, query: '', fromAssistant: false },
    })
  })

  it('o chip leva seção, emenda e a marca de que veio da conversa', () => {
    useSession.getState().goToRegulation('B6.2.4.3', {
      edition: 'emenda-06',
      fromAssistant: true,
    })
    const s = useSession.getState()
    expect(s.page).toBe('regulamento')
    expect(s.regulation).toEqual({
      edition: 'emenda-06',
      sectionId: 'B6.2.4.3',
      query: '',
      fromAssistant: true,
    })
  })

  it('o checklist e o calendário abrem a mesma página sem falar de conversa nenhuma', () => {
    useSession.getState().goToRegulation('B6.2.5.1')
    expect(useSession.getState().regulation.fromAssistant).toBe(false)
    expect(useSession.getState().regulation.sectionId).toBe('B6.2.5.1')
  })

  it('trocar de emenda no seletor limpa a seção — a numeração muda entre emendas', () => {
    useSession.getState().goToRegulation('B6.2.4.3')
    useSession.getState().setRegulation({ edition: 'emenda-06', sectionId: null })
    expect(useSession.getState().regulation.sectionId).toBeNull()
    expect(useSession.getState().regulation.edition).toBe('emenda-06')
  })
})
