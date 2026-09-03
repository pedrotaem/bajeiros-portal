/**
 * DF-28 — a demonstração do assistente para quem não tem conta.
 *
 * A degustação anônima (2 perguntas/dia por IP) acabou: era a única rota do portal que
 * gastava LLM sem conta, com contenção que era um `Map` de processo. No lugar dela,
 * esta encenação de uma conversa real — com os MESMOS componentes do chat, para que a
 * demonstração não descole do produto.
 *
 * Este arquivo é a parte PURA: o roteiro e o gerador de quadros. Quem anda no índice e
 * desenha é o `AssistantDemo`. Mesmo formato do `contextoDaPagina()` (DF-26) e do
 * `mostrarCortina()` (DF-27) — a regra vive fora do React e é testada sem DOM.
 *
 * O CONTEÚDO É VERDADEIRO E É PARÁFRASE (§5.3 da spec): as duas respostas saíram das
 * seções B6.3.3.1 e B6.3.3.2.x do RATBSB emenda 7, conferidas no corpus extraído do
 * PDF — inclusive as páginas dos chips, que não foram estimadas. Nada aqui reproduz o
 * texto do regulamento, e a tela diz que é demonstração.
 */

import type { ChatMsg, Citation } from './components/AssistantMsg'

export interface TurnoDemo {
  pergunta: string
  resposta: string
  citations: Citation[]
}

/**
 * Dois turnos, e o segundo é CONTINUAÇÃO do primeiro (FR-DF28.8): é isso que mostra
 * que o assistente mantém o fio. O par não é decorativo — "seção mínima dos tubos
 * primários" é a dúvida mais comum de gaiola, e "como comprovo na inspeção" é o tipo
 * de pergunta que só quem lê o regulamento inteiro responde. O validador, que só lê
 * geometria, não responde nenhuma das duas.
 */
export const ROTEIRO: TurnoDemo[] = [
  {
    pergunta: 'Qual a seção mínima dos tubos primários da gaiola?',
    resposta: [
      'São dois caminhos, e basta atender a um deles.',
      '',
      '**(A) Tubo padrão**: aço circular com 25,4 mm de diâmetro externo, parede de 3,05 mm e pelo menos 0,18% de carbono na composição.',
      '',
      '**(B) Perfil equivalente**: outro perfil de aço, desde que a rigidez à flexão e a resistência à flexão superem as do tubo de (A). A parede não pode ser menor que 1,57 mm e o carbono continua em 0,18%, seja qual for o material ou a seção.',
      '',
      'No caminho (B), os dois valores são calculados na linha neutra que der o resultado mais baixo. Não vale escolher o eixo mais favorável.',
    ].join('\n'),
    citations: [{ sectionId: 'B6.3.3.1', pageStart: 49, pageEnd: 49 }],
  },
  {
    pergunta: 'E como eu comprovo o caminho (B) na inspeção?',
    resposta: [
      'Com cálculo digitado, entregue na Inspeção de Conformidade Técnica e Segurança, em unidades do S.I. e com três algarismos significativos para as dimensões nominais dos tubos, as mesmas da nota fiscal.',
      '',
      'Vão junto:',
      '- a análise anexada à Ficha de Especificação da Gaiola (Anexo B), com o que a B6.3.5 exige;',
      '- ensaio ou certificado que quantifique o teor de carbono;',
      '- laudo do limite de escoamento, se você contar com valor acima do padrão.',
      '',
      'A rigidez à flexão é proporcional a **E·I**, com E = 205 GPa para qualquer aço; a resistência à flexão é **Sy·I/c**. Para aços SAE 1018, o valor de escoamento a usar no cálculo é 370 MPa.',
    ].join('\n'),
    citations: [
      { sectionId: 'B6.3.3.2.1', pageStart: 49, pageEnd: 49 },
      { sectionId: 'B6.3.3.2.2', pageStart: 49, pageEnd: 49 },
      { sectionId: 'B6.3.3.2.7', pageStart: 50, pageEnd: 50 },
    ],
  },
]

export interface QuadroDemo {
  /** O fio como ele aparece na tela neste quadro. */
  mensagens: ChatMsg[]
  /** O que já foi digitado na caixa de texto. */
  entrada: string
  /** Bolha do assistente ainda no `…` — o mesmo indicador do chat real. */
  pensando: boolean
  /** Espera até o próximo quadro, em ms. `0` no último. */
  ms: number
}

// Ritmo. Digitação em pares de caracteres (metade dos quadros, mesma leitura) e
// resposta em blocos de palavras, que é como o streaming SSE de verdade chega.
const LETRAS_POR_QUADRO = 2
const MS_DIGITANDO = 38
const MS_ANTES_DE_ENVIAR = 320
const MS_PENSANDO = 640
const PALAVRAS_POR_BLOCO = 3
const MS_BLOCO = 72
const MS_ENTRE_TURNOS = 1500

/** Quebra em blocos de palavras preservando as quebras de linha do texto. */
function blocos(texto: string): string[] {
  const pedacos = texto.split(/(\s+)/).filter((p) => p !== '')
  const saida: string[] = []
  let atual = ''
  let palavras = 0
  for (const p of pedacos) {
    atual += p
    if (/\s/.test(p)) continue
    if (++palavras >= PALAVRAS_POR_BLOCO) {
      saida.push(atual)
      atual = ''
      palavras = 0
    }
  }
  if (atual) saida.push(atual)
  return saida
}

/**
 * Todos os quadros da encenação, do fio vazio à conversa completa.
 *
 * `imediato` é o caminho de `prefers-reduced-motion: reduce` (FR-DF28.23): devolve UM
 * quadro, já no estado final. Isso é decisão de JS, não de `@media` — o CSS global do
 * design system encurta duração, mas não desliga um temporizador.
 */
export function quadrosDaDemo(
  roteiro: TurnoDemo[],
  opts: { imediato?: boolean } = {},
): QuadroDemo[] {
  const completo: ChatMsg[] = roteiro.flatMap((t) => [
    { role: 'user' as const, content: t.pergunta },
    { role: 'assistant' as const, content: t.resposta, citations: t.citations },
  ])

  if (opts.imediato) {
    return [{ mensagens: completo, entrada: '', pensando: false, ms: 0 }]
  }

  const quadros: QuadroDemo[] = []
  const fio: ChatMsg[] = []
  const push = (q: Omit<QuadroDemo, 'mensagens'> & { mensagens?: ChatMsg[] }) =>
    quadros.push({ ...q, mensagens: q.mensagens ?? [...fio] })

  push({ entrada: '', pensando: false, ms: MS_PENSANDO })

  for (const turno of roteiro) {
    // 1. a pergunta é digitada na caixa de texto
    for (let i = LETRAS_POR_QUADRO; i < turno.pergunta.length; i += LETRAS_POR_QUADRO) {
      push({ entrada: turno.pergunta.slice(0, i), pensando: false, ms: MS_DIGITANDO })
    }
    push({ entrada: turno.pergunta, pensando: false, ms: MS_ANTES_DE_ENVIAR })

    // 2. enviada: vira bolha, a caixa esvazia, o assistente pensa
    fio.push({ role: 'user', content: turno.pergunta })
    push({ entrada: '', pensando: true, ms: MS_PENSANDO })

    // 3. a resposta entra em blocos, como o streaming faz. Cada quadro leva a SUA
    // cópia da bolha parcial: quadro que compartilha objeto mutável mostra o texto
    // final desde o primeiro bloco.
    let parcial = ''
    for (const bloco of blocos(turno.resposta)) {
      parcial += bloco
      push({
        mensagens: [...fio, { role: 'assistant', content: parcial }],
        entrada: '',
        pensando: false,
        ms: MS_BLOCO,
      })
    }

    // 4. as citações aparecem ao fim, como no produto
    fio.push({ role: 'assistant', content: turno.resposta, citations: turno.citations })
    push({ entrada: '', pensando: false, ms: MS_ENTRE_TURNOS })
  }

  quadros[quadros.length - 1] = { ...quadros[quadros.length - 1], ms: 0 }
  return quadros
}

/** Duração total da encenação. Existe para o teste poder afirmar um teto. */
export function duracaoMs(quadros: QuadroDemo[]): number {
  return quadros.reduce((soma, q) => soma + q.ms, 0)
}

/**
 * `prefers-reduced-motion` lido uma vez, com guarda: `matchMedia` não existe em todo
 * ambiente de teste, e a falta dele não pode derrubar a página.
 */
export function movimentoReduzido(): boolean {
  try {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  } catch {
    return false
  }
}
