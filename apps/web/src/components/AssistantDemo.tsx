import { useEffect, useMemo, useRef, useState } from 'react'
import { IconArrow } from '../icons/glyphs'
import { useSession } from '../session'
import { movimentoReduzido, quadrosDaDemo, ROTEIRO } from '../assistant-demo'
import { Bolha } from './AssistantMsg'

/**
 * DF-28 — o que quem não tem conta vê no lugar do assistente.
 *
 * Não é um painel bloqueado: painel desabilitado mostra o que a pessoa NÃO pode, e o
 * campo de texto morto convida a tentar digitar. Aqui a conversa se encena sozinha,
 * uma vez, com os mesmos balões e os mesmos chips de citação do chat real — e o
 * convite fica embaixo, no lugar onde a pessoa acabou de ver o valor.
 *
 * A encenação não faz NENHUMA chamada de API (FR-DF28.14): não se pergunta à rota
 * "posso?" para receber um 401 previsível.
 */
export function AssistantDemo() {
  const setPanel = useSession((s) => s.setPanel)
  const [rodada, setRodada] = useState(0)
  // lido uma vez: trocar a preferência no meio da encenação não é caso a tratar
  const imediato = useMemo(() => movimentoReduzido(), [])

  return (
    <div className="assistant-panel">
      <div className="bj-demo-rotulo">
        <span className="bj-demo-selo">Demonstração</span>
        <span>
          Conversa encenada, com as respostas do regulamento vigente. O assistente de verdade
          responde à sua pergunta.
        </span>
      </div>

      {/* `key` remonta a encenação: é o "Repetir" sem efeito que zera índice */}
      <Encenacao key={rodada} imediato={imediato} />

      <div className="bj-demo-convite">
        <div>
          <strong>O assistente do regulamento é para quem tem conta.</strong>
          <p>
            No plano gratuito são 20 perguntas por dia sobre o regulamento inteiro, não só a seção
            B6, e toda resposta vem com a seção e a página citadas.
          </p>
        </div>
        <div className="bj-demo-acoes">
          {!imediato && (
            <button type="button" className="bj-btn" onClick={() => setRodada((r) => r + 1)}>
              Repetir
            </button>
          )}
          <button type="button" className="bj-btn bj-btn-primary" onClick={() => setPanel('login')}>
            Entrar ou criar conta <IconArrow size={16} />
          </button>
        </div>
      </div>

      <div className="assistant-foot">
        <span>
          O assistente pode errar, então confira no PDF oficial. Ele não substitui a inspeção
          (B6.4).
        </span>
      </div>
    </div>
  )
}

function Encenacao({ imediato }: { imediato: boolean }) {
  const quadros = useMemo(() => quadrosDaDemo(ROTEIRO, { imediato }), [imediato])
  const [i, setI] = useState(0)
  const fioRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (i >= quadros.length - 1) return
    const t = window.setTimeout(() => setI((x) => x + 1), quadros[i].ms)
    return () => window.clearTimeout(t)
  }, [i, quadros])

  useEffect(() => {
    fioRef.current?.scrollTo({ top: fioRef.current.scrollHeight })
  }, [i])

  const quadro = quadros[i]
  const terminou = i >= quadros.length - 1

  return (
    <>
      {/* `aria-live="off"`: quem usa leitor de tela não deve ouvir a conversa chegando
          em pedaços — o conteúdo completo é o que interessa (FR-DF28.24) */}
      <div className="assistant-thread" ref={fioRef} aria-live="off">
        {quadro.mensagens.map((m, k) => (
          <Bolha key={k} msg={m} />
        ))}
        {quadro.pensando && <Bolha msg={{ role: 'assistant', content: '' }} />}
      </div>
      {/* A caixa é figurante: existe para MOSTRAR a pergunta sendo digitada, e some
          quando a encenação acaba. Deixá-la parada, com o "Sua pergunta…" convidando
          a escrever num campo que não recebe nada, é o painel bloqueado que esta tela
          existe para não ser (§2 da spec). */}
      {!terminou && (
        <div className="assistant-input">
          <textarea
            value={quadro.entrada}
            readOnly
            tabIndex={-1}
            aria-hidden="true"
            rows={2}
            placeholder="Sua pergunta…"
          />
        </div>
      )}
    </>
  )
}
