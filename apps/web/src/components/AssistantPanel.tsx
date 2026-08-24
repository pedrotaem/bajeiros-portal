import { useEffect, useRef, useState, type FormEvent } from 'react'
import { create } from 'zustand'
import { useSession } from '../session'

// DF-8 — Assistente de Regras: chat sobre o regulamento completo via AI Gateway.
// Conversa vive em memória (zustand de módulo — fechar o painel preserva; recarregar
// a página zera, mesmo padrão do token). Citações vêm inline no texto "(seção, p. N)".

export interface ChatMsg {
  role: 'user' | 'assistant'
  content: string
}

interface AssistantStatus {
  anonymous: boolean
  noticeAccepted: boolean
  noticeVersion: string
  dailyLimit: number
  usedToday: number
}

// Anônimo: aceite do aviso vive só no browser (servidor não rastreia anônimos)
const ANON_NOTICE_KEY = 'bajeiros:assistant-notice-v1'

interface AssistantState {
  messages: ChatMsg[]
  streaming: boolean
  prefill: string | null
  context: { ruleId: string; status?: string } | null
  setPrefill: (q: string, ctx?: { ruleId: string; status?: string }) => void
  clear: () => void
}

export const useAssistant = create<AssistantState>((set) => ({
  messages: [],
  streaming: false,
  prefill: null,
  context: null,
  setPrefill: (q, ctx) => set({ prefill: q, context: ctx ?? null }),
  clear: () => set({ messages: [], streaming: false }),
}))

/** Abre a página do assistente com pergunta pré-preenchida (uso: checklist). */
export function askAssistant(question: string, ctx?: { ruleId: string; status?: string }) {
  useAssistant.getState().setPrefill(question, ctx)
  useSession.getState().setPage('assistant') // anônimo pode (2 perguntas/dia)
}

const WINDOW = 12 // janela de mensagens enviada por chamada

// Mini-renderer: só o markdown que o modelo insiste em usar (títulos, negrito,
// listas). Sem HTML do modelo — tudo vira texto React (sem dangerouslySetInnerHTML).
function renderBold(text: string, keyBase: string) {
  const parts = text.split(/\*\*([^*]+)\*\*/g)
  return parts.map((p, i) => (i % 2 === 1 ? <b key={`${keyBase}-${i}`}>{p}</b> : p))
}

function Rich({ text }: { text: string }) {
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

export function AssistantPanel({ Head }: { Head: (p: { title: string }) => JSX.Element }) {
  const { token, api, setPanel } = useSession()
  const { messages, streaming, prefill, context } = useAssistant()
  const [status, setStatus] = useState<AssistantStatus | null>(null)
  const [input, setInput] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    api<AssistantStatus>('/api/v1/assistant/status')
      .then((s) =>
        setStatus(
          // aceite anônimo lembrado no browser
          s.anonymous && localStorage.getItem(ANON_NOTICE_KEY) ? { ...s, noticeAccepted: true } : s,
        ),
      )
      .catch(() => setErr('Não foi possível carregar o assistente — API local rodando?'))
  }, [api, token])

  useEffect(() => {
    if (prefill) {
      setInput(prefill)
      useAssistant.setState({ prefill: null })
    }
  }, [prefill])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages])

  const accept = async () => {
    setErr(null)
    try {
      if (token) await api('/api/v1/assistant/notice', { method: 'POST' })
      else localStorage.setItem(ANON_NOTICE_KEY, new Date().toISOString())
      setStatus((s) => (s ? { ...s, noticeAccepted: true } : s))
    } catch {
      setErr('Falha ao registrar o aceite. Tente de novo.')
    }
  }

  const stop = () => {
    abortRef.current?.abort()
    abortRef.current = null
    useAssistant.setState({ streaming: false })
  }

  const send = async (e?: FormEvent) => {
    e?.preventDefault()
    const question = input.trim()
    if (!question || streaming) return
    setErr(null)
    setInput('')
    const history = [
      ...useAssistant.getState().messages,
      { role: 'user' as const, content: question },
    ]
    useAssistant.setState({
      messages: [...history, { role: 'assistant', content: '' }],
      streaming: true,
    })
    const ctrl = new AbortController()
    abortRef.current = ctrl

    const patchLast = (fn: (prev: string) => string) =>
      useAssistant.setState((s) => {
        const msgs = s.messages.slice()
        const last = msgs[msgs.length - 1]
        msgs[msgs.length - 1] = { ...last, content: fn(last.content) }
        return { messages: msgs }
      })

    try {
      const res = await fetch('/api/v1/assistant/chat', {
        method: 'POST',
        signal: ctrl.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          messages: history.slice(-WINDOW),
          context: context ?? undefined,
        }),
      })
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.detail ?? body?.title ?? `Erro ${res.status}`)
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        let sep
        while ((sep = buf.indexOf('\n\n')) >= 0) {
          const raw = buf.slice(0, sep)
          buf = buf.slice(sep + 2)
          let event = 'message'
          let data = ''
          for (const line of raw.split('\n')) {
            if (line.startsWith('event:')) event = line.slice(6).trim()
            else if (line.startsWith('data:')) data += line.slice(5).trim()
          }
          if (!data) continue
          try {
            const d = JSON.parse(data)
            if (event === 'delta') patchLast((prev) => prev + (d.text ?? ''))
            else if (event === 'error') setErr(d.detail ?? d.title ?? 'Falha na resposta.')
            else if (event === 'done')
              setStatus((s) => (s ? { ...s, usedToday: s.usedToday + 1 } : s))
          } catch {
            /* fragmento não-JSON — ignora */
          }
        }
      }
    } catch (e2) {
      if ((e2 as Error).name !== 'AbortError') setErr((e2 as Error).message)
    } finally {
      abortRef.current = null
      useAssistant.setState((s) => ({
        streaming: false,
        // resposta vazia (erro antes do 1º delta) não fica pendurada na conversa
        messages: s.messages.filter(
          (m, i) => !(i === s.messages.length - 1 && m.role === 'assistant' && !m.content),
        ),
      }))
      useAssistant.setState({ context: null })
    }
  }

  if (err && !status) {
    return (
      <div className="assistant-panel">
        <Head title="Assistente de Regras" />
        <p className="modal-err">{err}</p>
      </div>
    )
  }
  if (!status) {
    return (
      <div className="assistant-panel">
        <Head title="Assistente de Regras" />
        <p className="assistant-hint">Carregando…</p>
      </div>
    )
  }

  if (!status.noticeAccepted) {
    return (
      <div className="assistant-panel">
        <Head title="Assistente de Regras" />
        <div className="assistant-notice">
          <p>
            O assistente responde dúvidas sobre o <b>regulamento completo</b> (RATBSB), com a
            referência de seção e página para você conferir no PDF oficial.
          </p>
          <p>Antes de usar, saiba que:</p>
          <ul>
            <li>
              Suas perguntas são processadas por um provedor de IA <b>fora do Brasil</b>{' '}
              (transferência internacional com salvaguardas contratuais — LGPD art. 33).
            </li>
            {status.anonymous ? (
              <li>
                Sem conta você tem <b>{status.dailyLimit} perguntas por dia</b> e nada é armazenado.
                Com conta (gratuita), perguntas e respostas são <b>armazenadas</b> (90 dias) e
                visíveis ao administrador do portal, para operação e melhoria do serviço.
              </li>
            ) : (
              <li>
                Perguntas e respostas são <b>armazenadas</b> (90 dias) e visíveis ao administrador
                do portal, para operação e melhoria do serviço.
              </li>
            )}
            <li>
              <b>Não digite dados pessoais</b> (nomes, e-mails, documentos) nas perguntas.
            </li>
            <li>
              O assistente pode errar: ele <b>não substitui</b> o regulamento oficial nem a inspeção
              técnica. Confira sempre a citação no PDF.
            </li>
          </ul>
          {err && <p className="modal-err">{err}</p>}
          <button className="account-btn primary" onClick={accept}>
            Entendi, começar a usar
          </button>
        </div>
      </div>
    )
  }

  const quotaLeft = status.dailyLimit - status.usedToday

  return (
    <div className="assistant-panel">
      <Head title="Assistente de Regras" />
      <div className="assistant-thread" ref={scrollRef}>
        {messages.length === 0 && (
          <p className="assistant-hint">
            Pergunte qualquer coisa do regulamento — freios, elétrica, extintor, documentação… Não
            só B6. Respostas citam seção e página do PDF oficial.
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`assistant-msg ${m.role}`}>
            {m.content ? (
              m.role === 'assistant' ? (
                <Rich text={m.content} />
              ) : (
                m.content
              )
            ) : (
              <span className="assistant-typing">…</span>
            )}
          </div>
        ))}
      </div>
      {err && <p className="modal-err">{err}</p>}
      <form className="assistant-input" onSubmit={send}>
        <textarea
          value={input}
          placeholder={
            quotaLeft > 0
              ? 'Sua pergunta… (Enter envia, Shift+Enter quebra linha)'
              : status.anonymous
                ? 'Limite sem conta atingido — entre para continuar'
                : 'Limite diário atingido'
          }
          disabled={quotaLeft <= 0}
          rows={2}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send()
            }
          }}
        />
        {streaming ? (
          <button type="button" className="account-btn" onClick={stop}>
            Parar
          </button>
        ) : status.anonymous && quotaLeft <= 0 ? (
          <button type="button" className="account-btn primary" onClick={() => setPanel('login')}>
            Entrar
          </button>
        ) : (
          <button className="account-btn primary" disabled={!input.trim() || quotaLeft <= 0}>
            Enviar
          </button>
        )}
      </form>
      <div className="assistant-foot">
        <span>
          O assistente pode errar — confira no PDF oficial. Não substitui a inspeção (B6.4).
        </span>
        <span className="admin-dim">
          {status.anonymous
            ? quotaLeft > 0
              ? `${quotaLeft}/${status.dailyLimit} perguntas sem conta — entre p/ ter 20/dia`
              : 'limite sem conta atingido — crie uma conta gratuita (20/dia)'
            : quotaLeft > 0
              ? `${quotaLeft}/${status.dailyLimit} mensagens hoje`
              : 'limite renova à meia-noite (UTC)'}
        </span>
      </div>
    </div>
  )
}
