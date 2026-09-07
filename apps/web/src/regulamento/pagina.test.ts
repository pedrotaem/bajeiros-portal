import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { describe, expect, it, beforeEach } from 'vitest'
import { useSession } from '../session'
import { achatar, abrirAte } from '../components/RegulationTree'
import { classeDoCorpo } from '../components/RegulationPage'
import { arvore, paiDe, vizinhas, type IndiceRegulamento } from './indice'
import {
  copiaConfere,
  dataHora,
  edicaoAberta,
  edicaoDoCorpus,
  referenciasDaSecao,
  rotuloVigencia,
  versaoEscolhida,
  rotuloDaEdicao,
  urlDaCopia,
  versaoDoArtefato,
  versaoVigente,
  type CopiaLocal,
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
      regulation: {
        edition: null,
        sectionId: null,
        query: '',
        fromAssistant: false,
        vista: 'indice',
      },
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
      // no celular, quem chega por citação cai no documento, não no índice (§13.3)
      vista: 'documento',
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

describe('cópia do PDF servida pelo portal (ADR-014)', () => {
  const copia: CopiaLocal = JSON.parse(
    readFileSync(path.resolve(__dirname, '../../public/regulamento/copia-emenda-07.json'), 'utf8'),
  )
  const pdf = readFileSync(path.resolve(__dirname, '../../public/regulamento/emenda-07.pdf'))

  it('o arquivo commitado é exatamente o que a procedência declara', () => {
    expect(createHash('sha256').update(pdf).digest('hex')).toBe(copia.sha256)
    expect(pdf.length).toBe(copia.bytes)
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-')
    expect(copia.url).toMatch(/^https:\/\/arquivos\.saebrasil\.org\.br\//)
    expect(new Date(copia.downloadedAt).getTime()).toBeGreaterThan(0)
  })

  it('é o MESMO arquivo de que o índice e o assistente falam', () => {
    expect(copia.sha256).toBe(indice.pdfSha256)
    expect(copia.edition).toBe(indice.edition)
  })

  it('hash diferente do cadastrado desliga a leitura embutida (FR-DF34.11)', () => {
    const v = { ...payload.versions[0], pdfSha256: copia.sha256 }
    expect(copiaConfere(copia, v)).toBe(true)
    expect(copiaConfere(copia, { ...v, pdfSha256: 'b'.repeat(64) })).toBe(false)
    expect(copiaConfere(copia, { ...v, edition: 'emenda-06' })).toBe(false)
    expect(copiaConfere(null, v)).toBe(false)
  })

  it('a cópia é servida pela origem do portal, na página da seção', () => {
    expect(urlDaCopia('emenda-07', 37)).toBe('/regulamento/emenda-07.pdf#page=37')
    expect(urlDaCopia('emenda-07')).toBe('/regulamento/emenda-07.pdf')
    expect(dataHora('2026-09-07T00:40:33.877Z')).toMatch(/\d{2}\/\d{2}\/\d{4}/)
    expect(dataHora('nada')).toBe('—')
  })
})

describe('emenda publicada sem cadastro no banco', () => {
  const copia: CopiaLocal = JSON.parse(
    readFileSync(path.resolve(__dirname, '../../public/regulamento/copia-emenda-07.json'), 'utf8'),
  )
  const edicoes: { edicoes: string[] } = JSON.parse(
    readFileSync(path.resolve(__dirname, '../../public/regulamento/edicoes.json'), 'utf8'),
  )

  it('o portal declara em arquivo as emendas que publicou', () => {
    expect(edicoes.edicoes).toContain(indice.edition)
  })

  it('sem linha no banco, o documento aparece com o que o arquivo sabe', () => {
    const v = versaoDoArtefato(indice, copia)!
    expect(v.edition).toBe('emenda-07')
    expect(v.label).toBe('RATBSB Emenda 7')
    expect(v.pageCount).toBe(148)
    expect(v.corpusVersion).toBe(indice.corpusVersion)
    expect(v.source.url).toBe(copia.url)
    expect(v.semCadastro).toBe(true)
    // e a leitura embutida continua valendo, conferida contra o hash do índice
    expect(copiaConfere(copia, v)).toBe(true)
  })

  it('sem vigência declarada, a tela não inventa uma', () => {
    const v = versaoDoArtefato(indice, copia)!
    expect(v.appliesTo).toEqual([])
    expect(rotuloVigencia(v)).toBeNull()
  })

  it('a emenda aberta cai no arquivo só quando não há cadastro nem escolha', () => {
    expect(edicaoAberta(payload.versions[0], null, ['emenda-07'])).toBe('emenda-07')
    expect(edicaoAberta(null, 'emenda-06', ['emenda-07'])).toBe('emenda-06')
    expect(edicaoAberta(null, null, ['emenda-07', 'emenda-06'])).toBe('emenda-07')
    expect(edicaoAberta(null, null, [])).toBeNull()
  })

  it('sem índice não há emenda de arquivo — o portal não publicou nada', () => {
    expect(versaoDoArtefato(null, copia)).toBeNull()
  })

  it('o cadastro do banco tem precedência sobre o arquivo', () => {
    expect(versaoEscolhida(payload, null)?.semCadastro).toBeUndefined()
    expect(rotuloDaEdicao('emenda-06')).toBe('RATBSB Emenda 6')
    expect(rotuloDaEdicao('errata-2027')).toBe('RATBSB errata 2027')
  })
})

describe('celular: uma vista por vez (§13.3)', () => {
  it('o corpo troca de layout, não de conteúdo', () => {
    expect(classeDoCorpo(false, 'documento', true)).toBe('bj-reg-corpo bj-reg-corpo--painel')
    expect(classeDoCorpo(false, 'documento', false)).toBe('bj-reg-corpo')
    expect(classeDoCorpo(true, 'documento', true)).toBe(
      'bj-reg-corpo bj-reg-corpo--vista bj-reg-corpo--documento',
    )
    expect(classeDoCorpo(true, 'indice', false)).toBe(
      'bj-reg-corpo bj-reg-corpo--vista bj-reg-corpo--indice',
    )
  })

  it('a barra ‹ › anda entre as seções vizinhas', () => {
    const v = vizinhas(indice.blocks, 'B6.2.4.3')
    expect(v.anterior?.id).toBe('B6.2.4.2')
    expect(v.proxima?.id).toBe('B6.2.4.4')
  })

  it('anda na ordem do documento, sem ficar preso no fim de um ramo', () => {
    const filhas = indice.blocks.filter((b) => paiDe(b.id) === 'B6.2.4')
    const ultima = filhas[filhas.length - 1]
    expect(vizinhas(indice.blocks, ultima.id).proxima?.id).toBe('B6.2.5')
    // do primeiro filho, para trás, vem o cabeçalho da seção — não a seção anterior
    expect(vizinhas(indice.blocks, 'B6.2.4.1').anterior?.id).toBe('B6.2.4')
  })

  it('nas pontas do documento não há para onde ir', () => {
    expect(vizinhas(indice.blocks, indice.blocks[0].id).anterior).toBeNull()
    expect(vizinhas(indice.blocks, indice.blocks[indice.blocks.length - 1].id).proxima).toBeNull()
    expect(vizinhas(indice.blocks, 'NAO-EXISTE')).toEqual({ anterior: null, proxima: null })
  })

  it('a citação abre o documento; sem seção, a vista é o índice', () => {
    useSession.getState().goToRegulation('B6.2.4.3', { fromAssistant: true })
    expect(useSession.getState().regulation.vista).toBe('documento')
    useSession.getState().setRegulation({ vista: 'secao' })
    expect(useSession.getState().regulation.vista).toBe('secao')
  })
})
