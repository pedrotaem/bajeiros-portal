import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { createHmac } from 'node:crypto'
import { z } from 'zod'
import { env } from '../../env'
import { withUser } from '../../db'
import { problem } from '../../problem'
import { audit, clientIp } from '../../audit'
import { type AuthEnv } from '../../auth/middleware'
import { gatewayFetch } from './gateway-fetch'

// DF-8 — Assistente de Regras: proxy SSE p/ o Bajeiros AI Gateway.
// Portal é dono de: auth, aviso de transparência, quotas, rateKey pseudonimizado
// (C10) e registro em assistant_log. Gateway é dono de corpus, modelo e custo.
// DF-28: EXIGE CONTA. A degustação anônima (2/dia por IP) acabou — era a única rota
// que gastava LLM sem conta, e a contenção era um Map de processo. Sem sessão a web
// mostra uma demonstração encenada, que não chama rota nenhuma.
// Em dev o server Hono (Node) faz SSE pass-through; em prod esta rota sai do
// API GW p/ Lambda Function URL RESPONSE_STREAM (revisão C1) — mesma lógica.

export const assistant = new Hono<AuthEnv>()

const FREE_DAILY = 20 // entitlement free hardcoded, mesmo padrão de projetos

const NOTICE_ACTION = 'assistant.notice_accept'
export const NOTICE_VERSION = 'v1'

const chatBody = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1).max(4000),
      }),
    )
    .min(1)
    .max(20)
    .refine((ms) => ms[ms.length - 1].role === 'user', {
      message: 'última mensagem deve ser do usuário',
    }),
  context: z
    .object({
      ruleId: z.string().regex(/^[A-Z0-9.]{1,20}$/),
      status: z.enum(['pass', 'fail', 'warn', 'manual']).optional(),
    })
    .optional(),
})

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

// ---------- gate do usuário ----------

interface Gate {
  accepted: boolean
  usedToday: number
}

async function gate(sub: string): Promise<Gate> {
  return withUser(sub, async (db) => {
    const [accepted, used] = await Promise.all([
      db.query(`SELECT 1 FROM audit_events WHERE actor_user_id = $1 AND action = $2 LIMIT 1`, [
        sub,
        NOTICE_ACTION,
      ]),
      db.query(
        `SELECT count(*)::int AS n FROM assistant_log
         WHERE user_id = $1 AND occurred_at >= date_trunc('day', now())`,
        [sub],
      ),
    ])
    return { accepted: (accepted.rowCount ?? 0) > 0, usedToday: used.rows[0].n }
  })
}

// Estado p/ a UI: aviso e quota. (DF-28: sem campo `anonymous` — não há mais dois modos.)
assistant.get('/status', async (c) => {
  const g = await gate(c.get('auth').sub)
  return c.json({
    noticeAccepted: g.accepted,
    noticeVersion: NOTICE_VERSION,
    dailyLimit: FREE_DAILY,
    usedToday: g.usedToday,
  })
})

// Aceite do aviso de transparência (art. 9) — registro append-only na trilha de
// auditoria; NÃO é consentimento revogável (revisão C9: base legal = contrato).
assistant.post('/notice', async (c) => {
  const auth = c.get('auth')
  const ip = clientIp(c.req.raw.headers)
  await withUser(auth.sub, (db) =>
    audit(db, {
      actorUserId: auth.sub,
      action: NOTICE_ACTION,
      resourceType: 'assistant',
      ip,
      metadata: { noticeVersion: NOTICE_VERSION },
    }),
  )
  return c.body(null, 204)
})

function parseSseEvent(raw: string): { event: string; data: string } | null {
  let event = 'message'
  let data = ''
  for (const line of raw.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim()
    else if (line.startsWith('data:')) data += line.slice(5).trim()
  }
  return data ? { event, data } : null
}

assistant.post('/chat', async (c) => {
  const parsed = chatBody.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return problem(c, 400, 'Body inválido', parsed.error.message)
  const auth = c.get('auth')

  const g = await gate(auth.sub)
  if (!g.accepted) {
    return problem(c, 403, 'Aviso pendente', 'Aceite o aviso do assistente antes de usar.')
  }
  if (g.usedToday >= FREE_DAILY) {
    return problem(
      c,
      429,
      'Limite diário atingido',
      `Plano gratuito: ${FREE_DAILY} mensagens por dia. O limite renova à meia-noite (UTC).`,
    )
  }

  // rateKey pseudonimizado c/ sal diário (C10) — gateway nunca vê identidade real
  const rateKey = createHmac('sha256', `${env('ASSISTANT_RATE_SALT')}:${today()}`)
    .update(auth.sub)
    .digest('hex')

  let upstream: Response
  try {
    upstream = await gatewayFetch('/v1/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        messages: parsed.data.messages,
        context: parsed.data.context,
        rateKey,
      }),
    })
  } catch {
    return problem(
      c,
      502,
      'Assistente indisponível',
      'Serviço de IA fora do ar. Tente de novo em instantes.',
    )
  }
  if (!upstream.ok || !upstream.body) {
    return problem(c, 502, 'Assistente indisponível', `Serviço de IA respondeu ${upstream.status}.`)
  }

  const question = parsed.data.messages[parsed.data.messages.length - 1].content
  const started = Date.now()

  return streamSSE(c, async (stream) => {
    let answer = ''
    let status: 'ok' | 'error' = 'ok'
    let model: string | null = null
    let corpusVersion: string | null = null
    let usage: {
      inputTokens?: number
      outputTokens?: number
      cacheReadTokens?: number
    } = {}

    const reader = upstream.body!.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        await stream.write(chunk) // pass-through cru (inclui heartbeat ": ping")
        buf += chunk
        let sep
        while ((sep = buf.indexOf('\n\n')) >= 0) {
          const ev = parseSseEvent(buf.slice(0, sep))
          buf = buf.slice(sep + 2)
          if (!ev) continue
          try {
            const data = JSON.parse(ev.data)
            if (ev.event === 'delta') answer += data.text ?? ''
            else if (ev.event === 'done') {
              usage = data.usage ?? {}
              model = data.model ?? null
              corpusVersion = data.corpusVersion ?? null
            } else if (ev.event === 'error') status = 'error'
          } catch {
            // evento não-JSON (não esperado) — ignora p/ log, repasse já feito
          }
        }
      }
    } catch {
      status = 'error'
      await stream.writeSSE({
        event: 'error',
        data: JSON.stringify({
          type: 'about:blank',
          title: 'Conexão com o assistente interrompida',
          status: 502,
        }),
      })
    }

    // DF-9: registro de uso — o aviso de transparência declara o armazenamento e a
    // visibilidade para quem administra o portal.
    try {
      await withUser(auth.sub, (db) =>
        db.query(
          `INSERT INTO assistant_log
             (user_id, question, answer, status, model, corpus_version,
              input_tokens, output_tokens, cache_read_tokens, duration_ms)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            auth.sub,
            question,
            answer || null,
            status,
            model,
            corpusVersion,
            usage.inputTokens ?? null,
            usage.outputTokens ?? null,
            usage.cacheReadTokens ?? null,
            Date.now() - started,
          ],
        ),
      )
    } catch (err) {
      console.error(
        JSON.stringify({ level: 'warn', msg: 'assistant_log falhou', err: (err as Error).message }),
      )
    }
  })
})
