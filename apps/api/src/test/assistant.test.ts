import { createServer, type Server } from 'node:http'
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import pg from 'pg'
import { app } from '../app'
import { authed, makeUser, type TestUser } from './helpers'

// DF-8 — proxy do assistente: gate do aviso, quota, SSE pass-through, assistant_log.
// Gateway real fica fora dos testes: mock SSE local em porta efêmera.

let mock: Server
let user: TestUser

function sse(events: { event: string; data: unknown }[]): string {
  return events.map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`).join('')
}

beforeAll(async () => {
  mock = createServer((req, res) => {
    if (req.url === '/v1/chat') {
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      res.end(
        sse([
          {
            event: 'citation',
            data: { sectionId: 'B6.3.3.1', pageStart: 49, pageEnd: 49, quote: 'trecho…' },
          },
          { event: 'delta', data: { text: 'O diâmetro mínimo ' } },
          { event: 'delta', data: { text: 'é 25,4 mm (B6.3.3.1, p. 49).' } },
          {
            event: 'done',
            data: {
              corpusVersion: 'ratbsb@emenda-07#test',
              model: 'claude-haiku-4-5',
              usage: { inputTokens: 81000, outputTokens: 42, cacheReadTokens: 500 },
              costUsd: 0.01,
            },
          },
        ]),
      )
      return
    }
    res.writeHead(404).end()
  })
  await new Promise<void>((r) => mock.listen(0, '127.0.0.1', r))
  const addr = mock.address()
  if (addr && typeof addr === 'object') process.env.GATEWAY_URL = `http://127.0.0.1:${addr.port}`

  user = await makeUser('Chat')
  await app.request('/api/v1/me', authed(user, { method: 'POST' }))
})

afterAll(async () => {
  await new Promise((r) => mock.close(r))
})

const chatBody = { messages: [{ role: 'user', content: 'Qual o diâmetro mínimo?' }] }

describe('assistente (DF-8)', () => {
  it('sem aceite do aviso → 403', async () => {
    const r = await app.request(
      '/api/v1/assistant/chat',
      authed(user, { method: 'POST', body: JSON.stringify(chatBody) }),
    )
    expect(r.status).toBe(403)
  })

  it('status reflete aviso e quota; aceite registra na trilha de auditoria', async () => {
    let s = await (await app.request('/api/v1/assistant/status', authed(user))).json()
    expect(s.noticeAccepted).toBe(false)

    const ack = await app.request('/api/v1/assistant/notice', authed(user, { method: 'POST' }))
    expect(ack.status).toBe(204)

    s = await (await app.request('/api/v1/assistant/status', authed(user))).json()
    expect(s.noticeAccepted).toBe(true)
    expect(s.usedToday).toBe(0)

    const exp = await (await app.request('/api/v1/me/export', authed(user))).json()
    expect(
      exp.auditEvents.some((e: { action: string }) => e.action === 'assistant.notice_accept'),
    ).toBe(true)
  })

  it('chat repassa SSE do gateway e grava assistant_log (AC-DF8.3/AC-DF9.5)', async () => {
    const r = await app.request(
      '/api/v1/assistant/chat',
      authed(user, { method: 'POST', body: JSON.stringify(chatBody) }),
    )
    expect(r.status).toBe(200)
    expect(r.headers.get('content-type')).toContain('text/event-stream')
    const text = await r.text()
    expect(text).toContain('event: delta')
    expect(text).toContain('B6.3.3.1')
    expect(text).toContain('event: done')
    // G3: evento citation estruturado repassa cru p/ a UI
    expect(text).toContain('event: citation')
    expect(text).toContain('"sectionId":"B6.3.3.1"')

    // aguarda o insert pós-stream
    await new Promise((r2) => setTimeout(r2, 300))
    const exp = await (await app.request('/api/v1/me/export', authed(user))).json()
    const log = exp.assistantLog.at(-1)
    expect(log.question).toContain('diâmetro')
    expect(log.answer).toContain('25,4 mm')
    expect(log.status).toBe('ok')
    expect(log.model).toBe('claude-haiku-4-5')
    expect(log.input_tokens).toBe(81000)
  })

  it('quota diária estourada → 429 problem+json (AC-DF8.2)', async () => {
    const owner = new pg.Client({ connectionString: process.env.DATABASE_URL })
    await owner.connect()
    await owner.query(
      `INSERT INTO assistant_log (user_id, question, status)
       SELECT $1, 'bulk', 'ok' FROM generate_series(1, 25)`,
      [user.sub],
    )
    await owner.end()
    const r = await app.request(
      '/api/v1/assistant/chat',
      authed(user, { method: 'POST', body: JSON.stringify(chatBody) }),
    )
    expect(r.status).toBe(429)
    expect(r.headers.get('content-type')).toContain('application/problem+json')
  })

  it('sem conta: chat → 401 e o gateway não é chamado (DF-28 AC-DF28.1)', async () => {
    const owner = new pg.Client({ connectionString: process.env.DATABASE_URL })
    await owner.connect()
    const before = (await owner.query('SELECT count(*)::int AS n FROM assistant_log')).rows[0].n

    const r = await app.request('/api/v1/assistant/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.77' },
      body: JSON.stringify(chatBody),
    })
    expect(r.status).toBe(401)
    expect(r.headers.get('content-type')).toContain('application/problem+json')

    // nada foi gasto e nada foi gravado
    await new Promise((r2) => setTimeout(r2, 300))
    const after = (await owner.query('SELECT count(*)::int AS n FROM assistant_log')).rows[0].n
    await owner.end()
    expect(after).toBe(before)
  })

  it('sem conta: status → 401; com conta, sem campo `anonymous` (AC-DF28.2)', async () => {
    const anon = await app.request('/api/v1/assistant/status')
    expect(anon.status).toBe(401)

    const s = await (await app.request('/api/v1/assistant/status', authed(user))).json()
    expect(s).not.toHaveProperty('anonymous')
    expect(s.dailyLimit).toBe(20)
  })

  it('token inválido → 401 (não vira anônimo silencioso)', async () => {
    const r = await app.request('/api/v1/assistant/status', {
      headers: { Authorization: 'Bearer lixo' },
    })
    expect(r.status).toBe(401)
  })

  it('gateway fora do ar → 502 problem+json (AC-DF8.6)', async () => {
    const fresh = await makeUser('SemGateway')
    await app.request('/api/v1/me', authed(fresh, { method: 'POST' }))
    await app.request('/api/v1/assistant/notice', authed(fresh, { method: 'POST' }))
    const saved = process.env.GATEWAY_URL
    process.env.GATEWAY_URL = 'http://127.0.0.1:9'
    try {
      const r = await app.request(
        '/api/v1/assistant/chat',
        authed(fresh, { method: 'POST', body: JSON.stringify(chatBody) }),
      )
      expect(r.status).toBe(502)
      expect(r.headers.get('content-type')).toContain('application/problem+json')
    } finally {
      process.env.GATEWAY_URL = saved
    }
  })
})
