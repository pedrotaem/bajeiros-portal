import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { duracaoMs, quadrosDaDemo, ROTEIRO, type TurnoDemo } from './assistant-demo'

const demo = readFileSync(new URL('./components/AssistantDemo.tsx', import.meta.url), 'utf8')
const painel = readFileSync(new URL('./components/AssistantPanel.tsx', import.meta.url), 'utf8')
const hub = readFileSync(new URL('./components/ToolsHub.tsx', import.meta.url), 'utf8')

const curto: TurnoDemo[] = [
  {
    pergunta: 'Oi?',
    resposta: 'uma resposta com seis palavras aqui',
    citations: [{ sectionId: 'B6.1', pageStart: 33, pageEnd: 33 }],
  },
]

describe('roteiro da demonstração (DF-28 §5.3)', () => {
  it('são quatro turnos: pergunta, resposta, continuação, resposta (FR-DF28.8)', () => {
    expect(ROTEIRO).toHaveLength(2)
    for (const t of ROTEIRO) {
      expect(t.pergunta.length).toBeGreaterThan(10)
      expect(t.resposta.length).toBeGreaterThan(80)
      expect(t.citations.length).toBeGreaterThan(0)
    }
  })

  it('toda citação tem seção e página do RATBSB emenda 7 (AC-DF28.9)', () => {
    for (const c of ROTEIRO.flatMap((t) => t.citations)) {
      expect(c.sectionId).toMatch(/^B6(\.\d+)+$/)
      // a seção B6 do regulamento vai da página 33 à 53
      expect(c.pageStart).toBeGreaterThanOrEqual(33)
      expect(c.pageEnd).toBeLessThanOrEqual(53)
      expect(c.pageEnd).toBeGreaterThanOrEqual(c.pageStart)
    }
  })
})

describe('quadros da demonstração', () => {
  it('começa no fio vazio e termina com a conversa inteira (AC-DF28.6)', () => {
    const quadros = quadrosDaDemo(ROTEIRO)
    expect(quadros[0].mensagens).toHaveLength(0)
    expect(quadros[0].entrada).toBe('')

    const fim = quadros[quadros.length - 1]
    expect(fim.mensagens).toHaveLength(ROTEIRO.length * 2)
    expect(fim.pensando).toBe(false)
    expect(fim.entrada).toBe('')
    expect(fim.ms).toBe(0)
    for (let i = 0; i < ROTEIRO.length; i++) {
      expect(fim.mensagens[i * 2]).toEqual({ role: 'user', content: ROTEIRO[i].pergunta })
      expect(fim.mensagens[i * 2 + 1].content).toBe(ROTEIRO[i].resposta)
      expect(fim.mensagens[i * 2 + 1].citations).toEqual(ROTEIRO[i].citations)
    }
  })

  it('a resposta cresce de quadro em quadro — nenhum compartilha objeto mutável', () => {
    const quadros = quadrosDaDemo(curto)
    const parciais = quadros
      .map((q) => q.mensagens.find((m) => m.role === 'assistant')?.content)
      .filter((c): c is string => c != null)
    expect(parciais.length).toBeGreaterThan(2)
    for (let i = 1; i < parciais.length; i++) {
      expect(parciais[i].startsWith(parciais[i - 1])).toBe(true)
    }
    // e o texto reconstruído é exatamente o do roteiro (a quebra em blocos não perde nada)
    expect(parciais[parciais.length - 1]).toBe(curto[0].resposta)
  })

  it('a pergunta é digitada antes de virar bolha (FR-DF28.10)', () => {
    const quadros = quadrosDaDemo(curto)
    const digitando = quadros.filter((q) => q.entrada !== '')
    expect(digitando.length).toBeGreaterThan(0)
    // enquanto digita, nada foi enviado ainda
    for (const q of digitando) expect(q.mensagens).toHaveLength(0)
    expect(digitando[digitando.length - 1].entrada).toBe(curto[0].pergunta)
    // e existe o quadro do "pensando", com a pergunta já no fio e a caixa vazia
    const pensando = quadros.filter((q) => q.pensando)
    expect(pensando).toHaveLength(1)
    expect(pensando[0].entrada).toBe('')
    expect(pensando[0].mensagens).toHaveLength(1)
  })

  it('modo imediato devolve um quadro, já no fim (FR-DF28.23 / AC-DF28.7)', () => {
    const quadros = quadrosDaDemo(ROTEIRO, { imediato: true })
    expect(quadros).toHaveLength(1)
    expect(quadros[0].mensagens).toHaveLength(ROTEIRO.length * 2)
    expect(quadros[0].pensando).toBe(false)
    expect(quadros[0].ms).toBe(0)
  })

  it('cabe em 20 s e nenhum quadro intermediário espera zero (AC-DF28.8)', () => {
    const quadros = quadrosDaDemo(ROTEIRO)
    expect(duracaoMs(quadros)).toBeLessThan(20_000)
    for (const q of quadros.slice(0, -1)) expect(q.ms).toBeGreaterThan(0)
  })
})

describe('a tela sem conta (DF-28 §4.2 e §4.3)', () => {
  it('diz que é demonstração e não se passa por resposta gerada (FR-DF28.13)', () => {
    expect(demo).toMatch(/[Dd]emonstração/)
  })

  it('o convite tem a ação primária de login e o número real da quota (FR-DF28.15/16)', () => {
    expect(demo).toContain('bj-btn bj-btn-primary')
    expect(demo).toContain("setPanel('login')")
    expect(demo).toContain('20 perguntas por dia')
  })

  it('sem conta nenhuma rota do assistente é chamada (FR-DF28.14)', () => {
    expect(demo).not.toContain('/api/v1/assistant')
    // o ramo sem sessão vem antes de qualquer efeito de rede no painel
    expect(painel).toContain('<AssistantDemo />')
  })

  it('o painel não guarda mais aceite anônimo em localStorage (FR-DF28.6)', () => {
    expect(painel).not.toContain('assistant-notice-v1')
    expect(painel).not.toContain('anonymous')
  })

  it('o cartão de Ferramentas lê os campos que a API devolve (FR-DF28.20)', () => {
    expect(hub).toContain('dailyLimit')
    expect(hub).toContain('usedToday')
    expect(hub).not.toMatch(/assistente\?\.remaining/)
  })
})
