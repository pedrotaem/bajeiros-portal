import { useEffect, useRef, useState } from 'react'
import { useSession } from '../session'
import { useStore } from '../store'
import { edicaoDoCorpus } from '../regulamento/api'
import { RULE_SECTIONS } from '../regulamento/rule-sections'

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
  /**
   * Corpus que respondeu (`ratbsb@emenda-07#sha256:…`, evento `done`). É o que faz o
   * chip abrir a emenda DAQUELA resposta, e não a mais nova (DF-34 §3.2).
   */
  corpusVersion?: string
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
            <ChipDeCitacao
              key={`${c.sectionId}-${c.pageStart}`}
              cit={c}
              corpusVersion={msg.corpusVersion}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * C-20 estado `menu` (DF-34 §7.2): o chip deixou de ser enfeite e virou a porta para o
 * regulamento. Ação primária "Abrir no regulamento"; "Destacar no checklist" continua,
 * mas só quando há projeto aberto — sem checklist, destacar não leva a lugar nenhum.
 */
function ChipDeCitacao({ cit, corpusVersion }: { cit: Citation; corpusVersion?: string }) {
  const [aberto, setAberto] = useState(false)
  const caixa = useRef<HTMLSpanElement>(null)
  const goToRegulation = useSession((s) => s.goToRegulation)
  const currentProject = useSession((s) => s.currentProject)
  const setPage = useSession((s) => s.setPage)
  const setHighlightRule = useStore((s) => s.setHighlightRule)
  const edition = edicaoDoCorpus(corpusVersion)
  const paginas = cit.pageEnd > cit.pageStart ? `${cit.pageStart}–${cit.pageEnd}` : cit.pageStart

  useEffect(() => {
    if (!aberto) return
    const fechar = (e: MouseEvent) => {
      if (!caixa.current?.contains(e.target as Node)) setAberto(false)
    }
    const escape = (e: KeyboardEvent) => e.key === 'Escape' && setAberto(false)
    document.addEventListener('mousedown', fechar)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('mousedown', fechar)
      document.removeEventListener('keydown', escape)
    }
  }, [aberto])

  return (
    <span className="assistant-cite-wrap" ref={caixa}>
      <button
        type="button"
        className="assistant-cite"
        data-version={edition}
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-label={
          `Abrir regra ${cit.sectionId}, página ${paginas}` +
          (edition ? `, ${edition.replace('-', ' ')}` : '')
        }
        onClick={() => setAberto((v) => !v)}
      >
        {cit.sectionId} · p. {paginas}
      </button>
      {aberto && (
        <span className="assistant-cite-menu" role="menu">
          <button
            role="menuitem"
            onClick={() => {
              setAberto(false)
              goToRegulation(cit.sectionId, { edition, fromAssistant: true })
            }}
          >
            Abrir no regulamento · p. {cit.pageStart}
          </button>
          {currentProject && RULE_SECTIONS[cit.sectionId] && (
            <button
              role="menuitem"
              onClick={() => {
                setAberto(false)
                setHighlightRule(cit.sectionId)
                setPage('editor')
              }}
            >
              Destacar no checklist
            </button>
          )}
        </span>
      )}
    </span>
  )
}
