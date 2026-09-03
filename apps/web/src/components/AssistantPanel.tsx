import { useEffect, useRef, useState, type FormEvent } from 'react'
import { create } from 'zustand'
import { authHeaders, useSession } from '../session'
import { AssistantDemo } from './AssistantDemo'
import { Bolha, type ChatMsg, type Citation } from './AssistantMsg'

// DF-8 — Assistente de Regras: chat sobre o regulamento completo via AI Gateway.
// Conversa vive em memória (zustand de módulo — fechar o painel preserva; recarregar
// a página zera, mesmo padrão do token). Citações chegam ESTRUTURADAS (evento SSE
// `citation` com seção + página, G3) e viram chips sob a resposta.
// DF-28: exige conta. Sem sessão, a página mostra a demonstração encenada e não
// chama rota nenhuma — o `AssistantDemo` entra no lugar de tudo que vem abaixo.

interface AssistantStatus {
  noticeAccepted: boolean
  noticeVersion: string
  dailyLimit: number
  usedToday: number
}

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

/**
 * Abre a página do assistente com pergunta pré-preenchida (uso: checklist).
 *
 * Sem conta a pessoa cai na demonstração (DF-28 FR-DF28.21) — e a pergunta fica
 * guardada aqui, então ela aparece na caixa se a sessão começar sem sair da página.
 */
export function askAssistant(question: string, ctx?: { ruleId: string; status?: string }) {
  useAssistant.getState().setPrefill(question, ctx)
  useSession.getState().setPage('assistant')
}

const WINDOW = 12 // janela de mensagens enviada por chamada

// O título da página vive na topbar do shell (DF-12 RF-1.4) — o painel não desenha
// mais cabeçalho próprio.
export function AssistantPanel() {
  const { user, token, api } = useSession()
  const { messages, streaming, prefill, context } = useAssistant()
  const [status, setStatus] = useState<AssistantStatus | null>(null)
  const [input, setInput] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!user) return // sem conta a tela é a demonstração: nenhuma chamada (FR-DF28.14)
    api<AssistantStatus>('/api/v1/assistant/status')
      .then(setStatus)
      .catch(() => setErr('Não foi possível carregar o assistente. A API local está rodando?'))
  }, [api, token, user])

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
      await api('/api/v1/assistant/notice', { method: 'POST' })
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

    const addCitation = (cit: Citation) =>
      useAssistant.setState((s) => {
        const msgs = s.messages.slice()
        const last = msgs[msgs.length - 1]
        const cites = last.citations ?? []
        if (cites.some((c) => c.sectionId === cit.sectionId && c.pageStart === cit.pageStart)) {
          return {} // deduplica (o modelo pode citar a mesma seção mais de uma vez)
        }
        msgs[msgs.length - 1] = { ...last, citations: [...cites, cit] }
        return { messages: msgs }
      })

    try {
      const res = await fetch('/api/v1/assistant/chat', {
        method: 'POST',
        signal: ctrl.signal,
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(), // lê o token atual (pode ter sido renovado por refresh)
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
            else if (event === 'citation' && d.sectionId)
              addCitation({
                sectionId: d.sectionId,
                pageStart: d.pageStart ?? 0,
                pageEnd: d.pageEnd ?? d.pageStart ?? 0,
              })
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

  // DF-28: sem conta, a demonstração é a página inteira. O ramo fica DEPOIS dos
  // hooks — a ordem deles não pode mudar entre um render e o seguinte.
  if (!user) return <AssistantDemo />

  if (err && !status) {
    return (
      <div className="assistant-panel">
        <p className="modal-err">{err}</p>
      </div>
    )
  }
  if (!status) {
    return (
      <div className="assistant-panel">
        <p className="assistant-hint">Carregando…</p>
      </div>
    )
  }

  if (!status.noticeAccepted) {
    return (
      <div className="assistant-panel">
        <div className="assistant-notice">
          <p>
            O assistente responde dúvidas sobre o <b>regulamento completo</b> (RATBSB), com a
            referência de seção e página para você conferir no PDF oficial.
          </p>
          <p>Antes de usar, saiba que:</p>
          <ul>
            <li>
              Suas perguntas são processadas por um provedor de IA <b>fora do Brasil</b>{' '}
              (transferência internacional com salvaguardas contratuais, LGPD art. 33).
            </li>
            <li>
              Perguntas e respostas são <b>armazenadas</b> (90 dias) e visíveis ao administrador do
              portal, para operação e melhoria do serviço.
            </li>
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
      <div className="assistant-thread" ref={scrollRef}>
        {messages.length === 0 && (
          <p className="assistant-hint">
            Pergunte qualquer coisa do regulamento: freios, elétrica, extintor, documentação. Não é
            só a seção B6. As respostas citam seção e página do PDF oficial.
          </p>
        )}
        {messages.map((m, i) => (
          <Bolha key={i} msg={m} />
        ))}
      </div>
      {err && <p className="modal-err">{err}</p>}
      <form className="assistant-input" onSubmit={send}>
        <textarea
          value={input}
          placeholder={
            quotaLeft > 0
              ? 'Sua pergunta… (Enter envia, Shift+Enter quebra linha)'
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
        ) : (
          <button className="account-btn primary" disabled={!input.trim() || quotaLeft <= 0}>
            Enviar
          </button>
        )}
      </form>
      <div className="assistant-foot">
        <span>
          O assistente pode errar, então confira no PDF oficial. Ele não substitui a inspeção
          (B6.4).
        </span>
        <span className="admin-dim">
          {quotaLeft > 0
            ? `${quotaLeft}/${status.dailyLimit} mensagens hoje`
            : 'limite renova à meia-noite (UTC)'}
        </span>
      </div>
    </div>
  )
}
