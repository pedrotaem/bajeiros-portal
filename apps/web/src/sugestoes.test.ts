import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { contextoDaPagina, resumoDoContexto, TITULO_PAGINA, type PageId } from './session'

const shell = readFileSync(new URL('./components/Shell.tsx', import.meta.url), 'utf8')
const painel = readFileSync(new URL('./components/FeedbackPanel.tsx', import.meta.url), 'utf8')

// DF-26 — o que este arquivo guarda é a fronteira entre CONTEXTO e TELEMETRIA
// (§5.3) e a regra de que existe UMA entrada, não uma por página (§5.1).

const JANELA = { innerWidth: 1440, innerHeight: 900 }

function estado(over: Partial<Parameters<typeof contextoDaPagina>[0]> = {}) {
  return {
    page: 'inicio' as PageId,
    teamTab: 'evolucao' as const,
    communityTab: 'resultados' as const,
    projectTab: 'ficha' as const,
    railCompact: false,
    ...over,
  }
}

describe('contexto da página (DF-26 §4.2)', () => {
  it('a página sai do estado, não de quem escreve', () => {
    expect(contextoDaPagina(estado({ page: 'editor' }), JANELA).page).toBe('editor')
  })

  it('a aba acompanha a página que tem aba, e é nula nas que não têm', () => {
    expect(contextoDaPagina(estado({ page: 'equipe', teamTab: 'conhecimento' }), JANELA).view).toBe(
      'conhecimento',
    )
    expect(
      contextoDaPagina(estado({ page: 'comunidade', communityTab: 'equipes' }), JANELA).view,
    ).toBe('equipes')
    expect(contextoDaPagina(estado({ page: 'projeto', projectTab: 'versoes' }), JANELA).view).toBe(
      'versoes',
    )
    expect(contextoDaPagina(estado({ page: 'editor' }), JANELA).view).toBeNull()
  })

  it('o contexto técnico tem DUAS chaves e nada mais (AC-DF26.2)', () => {
    const { context } = contextoDaPagina(estado(), JANELA)
    expect(Object.keys(context).sort()).toEqual(['rail', 'viewport'])
    expect(context.viewport).toEqual([1440, 900])
    expect(context.rail).toBe('aberto')
  })

  it('não captura user-agent, tela, console nem URL — nem por acidente (§5.3)', () => {
    const serializado = JSON.stringify(contextoDaPagina(estado(), JANELA))
    for (const proibido of ['userAgent', 'navigator', 'screenshot', 'console', 'href', 'cookie']) {
      expect(serializado).not.toContain(proibido)
    }
    // e o componente também não vai buscar nada disso por fora
    expect(painel).not.toMatch(/navigator\.|document\.cookie|location\.href|toDataURL/)
  })

  it('o rail recolhido entra porque defeito de largura é a classe que mais escapa', () => {
    expect(contextoDaPagina(estado({ railCompact: true }), JANELA).context.rail).toBe('compacto')
  })

  it('a janela é arredondada — fração de pixel não é informação', () => {
    const c = contextoDaPagina(estado(), { innerWidth: 1439.6, innerHeight: 899.2 })
    expect(c.context.viewport).toEqual([1440, 899])
  })
})

describe('o que vai junto é mostrado antes do envio (RF-DF26.9)', () => {
  it('a linha nomeia página, aba, janela e menu — em português', () => {
    const linha = resumoDoContexto(
      contextoDaPagina(estado({ page: 'equipe', teamTab: 'conhecimento' }), JANELA),
    )
    expect(linha).toBe('Equipe · Conhecimento · janela 1440×900 · menu aberto')
  })

  it('sem aba a linha não inventa uma', () => {
    expect(resumoDoContexto(contextoDaPagina(estado({ page: 'editor' }), JANELA))).toBe(
      'Validador de gaiola · janela 1440×900 · menu aberto',
    )
  })

  it('o painel mostra a linha, e não só a manda', () => {
    expect(painel).toContain('resumoDoContexto')
    expect(painel).toContain('Vai junto')
  })
})

describe('uma entrada só, na topbar (DF-26 §5.1)', () => {
  it('o botão mora no shell — nenhuma página desenha o seu', () => {
    expect(shell).toContain('bj-sug-abrir')
    expect(shell).toContain('Sugerir melhoria')
  })

  it('é texto, sem glifo: o padrão do sistema é sem ícone e a vaga segue livre', () => {
    const trecho = shell.slice(shell.indexOf('function BotaoSugerir'))
    expect(trecho.slice(0, 900)).not.toMatch(/<Icon[A-Z]|<Mark[A-Z]/)
  })

  it('sem conta o botão não some: abre o login com o motivo escrito (AC-DF26.12)', () => {
    expect(shell).toContain('SUGERIR_EXIGE_CONTA')
    expect(shell).toMatch(/setPanel\('login'\)/)
    expect(painel).not.toContain('anonimo')
  })

  it('o motivo é explicação, não erro, e aparece nos DOIS modos de auth', () => {
    // achado ao rodar o app: `authNotice` só era renderizado no ramo cognito, e
    // lá com a classe de erro — o motivo sumia em dev e acusava a pessoa em prod
    expect(shell).toContain('loginReason: SUGERIR_EXIGE_CONTA')
    expect(shell).not.toContain('authNotice: SUGERIR_EXIGE_CONTA')
    const painéis = readFileSync(new URL('./components/SessionPanels.tsx', import.meta.url), 'utf8')
    expect(painéis.match(/loginReason && <p className="bj-modal-aviso">/g)).toHaveLength(2)
  })

  it('o painel abre por cima, sem trocar de página (ADR-009 dec. 4)', () => {
    // trocar de página desmontaria o editor e perderia a câmera
    expect(painel).not.toMatch(/setPage\(/)
  })
})

describe('vocabulário próprio de status (DF-26 §5.6)', () => {
  it('não reusa nenhum dos cinco papéis reservados da regra', () => {
    for (const papel of [
      'bj-chip-pass',
      'bj-chip-fail',
      'bj-chip-warn',
      'bj-chip-manual',
      'bj-chip-info',
    ]) {
      expect(painel).not.toContain(papel)
    }
  })

  it('os seis status têm nome em português, e o "não" é dito por extenso', () => {
    expect(painel).toContain("recusado: 'Não vai ser feita'")
    expect(painel).toContain("duplicado: 'Já tinha sido pedida'")
  })
})

describe('o conjunto de páginas é o mesmo dos dois lados (RF-DF26.10)', () => {
  it('toda página do shell tem título — a API valida contra esta mesma lista', () => {
    const paginas: PageId[] = [
      'inicio',
      'equipe',
      'ferramentas',
      'comunidade',
      'editor',
      'assistant',
      'admin',
      'sobre',
      'projeto',
    ]
    expect(Object.keys(TITULO_PAGINA).sort()).toEqual([...paginas].sort())
    for (const p of paginas) expect(TITULO_PAGINA[p]).toBeTruthy()
  })
})
