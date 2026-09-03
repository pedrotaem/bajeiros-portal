/**
 * Peças de apresentação do chat do assistente, compartilhadas pelo chat real
 * (`AssistantPanel`) e pela demonstração sem conta (`AssistantDemo`, DF-28).
 *
 * Elas moram aqui porque a demonstração TEM que ser desenhada pelos mesmos
 * componentes do produto (DF-28 FR-DF28.9): uma cópia paralela do balão e do chip
 * envelheceria em silêncio, e a demonstração passaria a mostrar um assistente que
 * não existe mais.
 */

export interface Citation {
  sectionId: string
  pageStart: number
  pageEnd: number
}

export interface ChatMsg {
  role: 'user' | 'assistant'
  content: string
  citations?: Citation[]
}

// Mini-renderer: só o markdown que o modelo insiste em usar (títulos, negrito,
// listas). Sem HTML do modelo — tudo vira texto React (sem dangerouslySetInnerHTML).
function renderBold(text: string, keyBase: string) {
  const parts = text.split(/\*\*([^*]+)\*\*/g)
  return parts.map((p, i) => (i % 2 === 1 ? <b key={`${keyBase}-${i}`}>{p}</b> : p))
}

export function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split('\n').map((line, i) => {
        const h = /^#{1,4}\s+(.*)$/.exec(line)
        if (h) {
          return (
            <div key={i} className="assistant-h">
              {renderBold(h[1], `h${i}`)}
            </div>
          )
        }
        const li = /^\s*[-•]\s+(.*)$/.exec(line)
        if (li) {
          return (
            <div key={i} className="assistant-li">
              {renderBold(li[1], `l${i}`)}
            </div>
          )
        }
        return (
          <div key={i} className={line.trim() ? undefined : 'assistant-gap'}>
            {renderBold(line, `p${i}`)}
          </div>
        )
      })}
    </>
  )
}

/** Um balão do fio. Conteúdo vazio = a resposta ainda está chegando. */
export function Bolha({ msg }: { msg: ChatMsg }) {
  return (
    <div className={`assistant-msg ${msg.role}`}>
      {msg.content ? (
        msg.role === 'assistant' ? (
          <Rich text={msg.content} />
        ) : (
          msg.content
        )
      ) : (
        <span className="assistant-typing">…</span>
      )}
      {msg.citations && msg.citations.length > 0 && (
        <div className="assistant-cites">
          {msg.citations.map((c) => (
            <span key={`${c.sectionId}-${c.pageStart}`} className="assistant-cite">
              {c.sectionId} · p.{' '}
              {c.pageEnd > c.pageStart ? `${c.pageStart}–${c.pageEnd}` : c.pageStart}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
