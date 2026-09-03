import { useEffect, useState, type FormEvent } from 'react'
import {
  ApiError,
  contextoDaPagina,
  resumoDoContexto,
  TITULO_PAGINA,
  useSession,
  type EnvioContexto,
  type PageId,
} from '../session'

/**
 * DF-26 — sugestões. Painel próprio (não aba do `SessionPanels`) porque ele abre
 * por cima de QUALQUER página, inclusive o editor, e nada pode desmontar o
 * `<Viewport>` (ADR-009 dec. 4).
 *
 * Duas partes: enviar e as minhas. Abre em "as minhas" quando há desfecho novo —
 * a resposta é a metade da feature, não o extra (§5.5).
 */

export const TIPOS = [
  ['melhoria', 'Melhorar o que já existe'],
  ['implementacao', 'Implementar o que ainda não existe'],
  ['problema', 'Relatar algo errado'],
] as const

type Tipo = (typeof TIPOS)[number][0]

/**
 * Vocabulário PRÓPRIO. Não reusa os cinco papéis de status da regra (CT-3): ali
 * "aprovado" fala de conformidade da gaiola, e o mesmo signo não pode dizer duas
 * coisas em duas telas (§5.6).
 */
export const STATUS_LABEL: Record<string, string> = {
  novo: 'Recebida',
  em_analise: 'Em análise',
  planejado: 'Planejada',
  entregue: 'Entregue',
  recusado: 'Não vai ser feita',
  duplicado: 'Já tinha sido pedida',
}

const FECHADOS = ['entregue', 'recusado', 'duplicado']

export interface SugestaoItem {
  id: string
  kind: string
  page: string
  view: string | null
  title: string
  body: string
  status: string
  resolution: string | null
  duplicateTitle?: string | null
  statusChangedAt: string | null
  unread: boolean
  createdAt: string
}

function quando(ts: string | null): string {
  if (!ts) return '—'
  return new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

/**
 * Onde a sugestão foi feita, com o nome que a pessoa vê na tela. Achado ao rodar:
 * a lista mostrava o identificador cru (`inicio`), que é vocabulário do código.
 */
export function ondeFoi(i: { page: string; view: string | null }): string {
  const pagina = TITULO_PAGINA[i.page as PageId] ?? i.page
  return i.view ? `${pagina} · ${i.view}` : pagina
}

export function FeedbackPanel() {
  const panel = useSession((s) => s.panel)
  const setPanel = useSession((s) => s.setPanel)
  const [aba, setAba] = useState<'enviar' | 'minhas'>('enviar')
  const [itens, setItens] = useState<SugestaoItem[] | null>(null)
  const api = useSession((s) => s.api)

  const naoLidas = itens?.filter((i) => i.unread).length ?? 0

  useEffect(() => {
    if (panel !== 'feedback') return
    api<{ items: SugestaoItem[] }>('/api/v1/feedback/mine')
      .then((r) => {
        setItens(r.items)
        // desfecho novo? a resposta vem primeiro (RF-DF26.5)
        if (r.items.some((i) => i.unread)) setAba('minhas')
      })
      .catch(() => setItens([]))
  }, [panel, api])

  if (panel !== 'feedback') return null

  return (
    <div className="modal-overlay" onClick={() => setPanel(null)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span>Sugerir melhoria</span>
          <button className="collapse-btn" onClick={() => setPanel(null)} aria-label="Fechar">
            ✕
          </button>
        </div>
        {/* classes próprias: `.toggle` só tem regra dentro de `.viewport-toolbar`
            e `.team-tabs` (styles.css L1477), então num modal ele sai sem estilo */}
        <div className="bj-sug-abas" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={aba === 'enviar'}
            className={aba === 'enviar' ? 'bj-sug-aba bj-sug-aba-on' : 'bj-sug-aba'}
            onClick={() => setAba('enviar')}
          >
            Enviar
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={aba === 'minhas'}
            className={aba === 'minhas' ? 'bj-sug-aba bj-sug-aba-on' : 'bj-sug-aba'}
            onClick={() => setAba('minhas')}
          >
            As minhas{naoLidas > 0 ? ` (${naoLidas} com resposta)` : ''}
          </button>
        </div>
        {aba === 'enviar' ? (
          <Formulario
            aoEnviar={(item) => {
              setItens((atual) => [item, ...(atual ?? [])])
              setAba('minhas')
            }}
          />
        ) : (
          <Minhas itens={itens} aoLer={(id) => marcarLido(id, setItens)} />
        )}
      </div>
    </div>
  )
}

function marcarLido(
  id: string,
  setItens: (f: (a: SugestaoItem[] | null) => SugestaoItem[]) => void,
) {
  void useSession
    .getState()
    .api(`/api/v1/feedback/${id}/seen`, { method: 'POST' })
    .catch(() => {})
  setItens((atual) => (atual ?? []).map((i) => (i.id === id ? { ...i, unread: false } : i)))
}

function Formulario({ aoEnviar }: { aoEnviar: (i: SugestaoItem) => void }) {
  const api = useSession((s) => s.api)
  const [kind, setKind] = useState<Tipo>('melhoria')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  // capturado no momento de abrir, não a cada tecla — a janela não muda enquanto
  // se digita, e recalcular faria a linha da tela piscar
  const [ctx] = useState<EnvioContexto>(() =>
    contextoDaPagina(useSession.getState(), {
      innerWidth: typeof window === 'undefined' ? 0 : window.innerWidth,
      innerHeight: typeof window === 'undefined' ? 0 : window.innerHeight,
    }),
  )

  const faltam = Math.max(0, 20 - body.trim().length)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    setEnviando(true)
    try {
      const item = await api<SugestaoItem>('/api/v1/feedback', {
        method: 'POST',
        body: JSON.stringify({ kind, title: title.trim(), body: body.trim(), ...ctx }),
      })
      aoEnviar(item)
    } catch (err) {
      setErro(
        err instanceof ApiError
          ? (err.problem.detail ?? err.problem.title)
          : 'Erro de rede. Tente de novo.',
      )
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form className="bj-sug-form" onSubmit={enviar}>
      {/* achado ao rodar: com tudo num só bloco rolável, "Enviar" ficava cortado
          na borda do modal. A ação primária não rola junto com o formulário. */}
      <div className="bj-sug-campos">
        <fieldset className="bj-sug-tipos">
          <legend>O que é</legend>
          {TIPOS.map(([id, label]) => (
            <label key={id} className={kind === id ? 'bj-sug-tipo bj-sug-tipo-on' : 'bj-sug-tipo'}>
              <input
                type="radio"
                name="tipo"
                value={id}
                checked={kind === id}
                onChange={() => setKind(id)}
              />
              {label}
            </label>
          ))}
        </fieldset>

        <label className="bj-sug-campo">
          <span>Em uma linha</span>
          <input
            value={title}
            maxLength={120}
            required
            placeholder="A cota some quando o painel fecha"
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>

        <label className="bj-sug-campo">
          <span>O que aconteceu, ou o que falta</span>
          <textarea
            value={body}
            rows={5}
            maxLength={2000}
            required
            placeholder="Descreva o que você esperava e o que viu. Quanto mais específico, mais fácil de resolver."
            onChange={(e) => setBody(e.target.value)}
          />
          <small className="bj-sug-conta">
            {faltam > 0 ? `faltam ${faltam} caracteres` : `${body.trim().length}/2000`}
          </small>
        </label>

        {/* RF-DF26.9 — o que vai junto aparece ANTES do envio. Contexto que a pessoa
          não vê é telemetria, mesmo quando é inofensivo. */}
        <p className="bj-sug-ctx">
          <strong>Vai junto:</strong> {resumoDoContexto(ctx)}
        </p>
        <p className="bj-sug-aviso">
          Não escreva dado pessoal, seu ou de terceiros: quem administra o portal lê o texto.
        </p>
      </div>

      {erro && <p className="modal-err">{erro}</p>}
      <div className="bj-sug-acoes">
        <button
          type="submit"
          className="primary"
          disabled={enviando || faltam > 0 || !title.trim()}
        >
          {enviando ? 'Enviando…' : 'Enviar'}
        </button>
      </div>
    </form>
  )
}

function Minhas({ itens, aoLer }: { itens: SugestaoItem[] | null; aoLer: (id: string) => void }) {
  if (itens === null) return <p className="bj-vazio">Carregando…</p>
  if (itens.length === 0)
    return (
      <p className="bj-vazio">
        Você ainda não mandou nada. O que for enviado aparece aqui com o desfecho, inclusive quando
        a resposta for não.
      </p>
    )

  return (
    <ul className="bj-sug-lista">
      {itens.map((i) => (
        <li key={i.id} className={i.unread ? 'bj-sug-item bj-sug-item-novo' : 'bj-sug-item'}>
          <div className="bj-sug-item-topo">
            <span className="bj-sug-titulo">{i.title}</span>
            <span
              className={
                FECHADOS.includes(i.status) ? 'bj-sug-status bj-sug-status-fim' : 'bj-sug-status'
              }
            >
              {STATUS_LABEL[i.status] ?? i.status}
            </span>
          </div>
          <p className="bj-sug-meta">
            {quando(i.createdAt)} · {ondeFoi(i)}
          </p>
          {i.resolution && (
            <p className="bj-sug-resposta">
              {i.resolution}
              {i.duplicateTitle ? ` (já pedida em "${i.duplicateTitle}")` : ''}
            </p>
          )}
          {i.unread && (
            <button className="disclaimer-link" onClick={() => aoLer(i.id)}>
              marcar como lida
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}
