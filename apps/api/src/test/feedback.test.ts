import { describe, expect, it, beforeAll } from 'vitest'
import pg from 'pg'
import { app } from '../app'
import { authed, makeUser, type TestUser } from './helpers'

// DF-26 — sugestões. O que este arquivo guarda, em ordem de importância:
// isolamento entre pessoas (AC-DF26.5, gate), as três camadas de escrita do §6.2
// (RLS, grant de coluna e a função SECURITY DEFINER) e o motivo obrigatório na
// recusa (AC-DF26.7), que é o que separa este canal de uma caixa de correio.

async function promote(sub: string) {
  const owner = new pg.Client({ connectionString: process.env.DATABASE_URL })
  await owner.connect()
  await owner.query('UPDATE users SET is_admin = true WHERE id = $1', [sub])
  await owner.end()
}

const CONTEXTO = { viewport: [1440, 900], rail: 'aberto' }

function envio(over: Record<string, unknown> = {}) {
  return JSON.stringify({
    kind: 'melhoria',
    page: 'editor',
    view: null,
    title: 'A cota some quando o painel fecha',
    body: 'Ao fechar o painel direito a cota do membro selecionado some da tela e só volta se eu reabrir.',
    context: CONTEXTO,
    ...over,
  })
}

describe('sugestões (DF-26)', () => {
  let ana: TestUser
  let beto: TestUser
  let admin: TestUser

  beforeAll(async () => {
    ana = await makeUser('Ana')
    beto = await makeUser('Beto')
    admin = await makeUser('Dona')
    for (const u of [ana, beto, admin])
      await app.request('/api/v1/me', authed(u, { method: 'POST' }))
    await promote(admin.sub)
  })

  it('guarda a página e a aba de onde saiu (AC-DF26.1)', async () => {
    const r = await app.request(
      '/api/v1/feedback',
      authed(ana, { method: 'POST', body: envio({ page: 'equipe', view: 'conhecimento' }) }),
    )
    expect(r.status).toBe(201)
    const item = await r.json()
    expect(item.page).toBe('equipe')
    expect(item.view).toBe('conhecimento')
    expect(item.status).toBe('novo')
    expect(item.unread).toBe(false)
  })

  it('recusa página que o shell não tem (AC-DF26.1)', async () => {
    const r = await app.request(
      '/api/v1/feedback',
      authed(ana, { method: 'POST', body: envio({ page: 'faturamento' }) }),
    )
    expect(r.status).toBe(400)
    expect(r.headers.get('content-type')).toContain('application/problem+json')
  })

  it('o contexto é enumerado: chave a mais é recusada, não gravada (AC-DF26.2)', async () => {
    const r = await app.request(
      '/api/v1/feedback',
      authed(ana, {
        method: 'POST',
        body: envio({
          context: {
            ...CONTEXTO,
            userAgent: 'Mozilla/5.0',
            screenshot: 'data:image/png;base64,AA',
          },
        }),
      }),
    )
    expect(r.status).toBe(400)
  })

  it('descrição curta demais não é pedido (AC-DF26.3)', async () => {
    const r = await app.request(
      '/api/v1/feedback',
      authed(ana, { method: 'POST', body: envio({ body: 'não funciona' }) }),
    )
    expect(r.status).toBe(400)
  })

  it('uma pessoa não vê a sugestão da outra (AC-DF26.5 — gate de isolamento)', async () => {
    await app.request('/api/v1/feedback', authed(beto, { method: 'POST', body: envio() }))
    const r = await app.request('/api/v1/feedback/mine', authed(ana))
    const { items } = await r.json()
    expect(items.length).toBeGreaterThan(0)
    expect(items.every((i: { title: string }) => i.title)).toBe(true)
    const doBeto = await app.request('/api/v1/feedback/mine', authed(beto))
    const idsBeto = (await doBeto.json()).items.map((i: { id: string }) => i.id)
    const idsAna = items.map((i: { id: string }) => i.id)
    expect(idsAna.filter((id: string) => idsBeto.includes(id))).toHaveLength(0)
  })

  it('não-admin recebe 403 na triagem (AC-DF26.6)', async () => {
    const mine = await (await app.request('/api/v1/feedback/mine', authed(ana))).json()
    const id = mine.items[0].id
    const r = await app.request(
      `/api/v1/admin/feedback/${id}/triage`,
      authed(ana, { method: 'POST', body: JSON.stringify({ status: 'entregue' }) }),
    )
    expect(r.status).toBe(403)
  })

  it('a função do banco recusa a triagem mesmo chamada direto por não-admin (AC-DF26.6)', async () => {
    const owner = new pg.Client({ connectionString: process.env.DATABASE_URL })
    await owner.connect()
    try {
      await owner.query('SET ROLE bajeiros_app')
      await owner.query("SELECT set_config('app.user_id', $1, false)", [ana.sub])
      await expect(
        owner.query("SELECT * FROM feedback_triage($1, 'entregue', NULL, NULL)", [
          '00000000-0000-0000-0000-000000000000',
        ]),
      ).rejects.toThrow(/administrador/)
    } finally {
      await owner.end()
    }
  })

  it('recusar sem motivo é 400; com motivo entra (AC-DF26.7)', async () => {
    const mine = await (await app.request('/api/v1/feedback/mine', authed(ana))).json()
    const id = mine.items[0].id

    const sem = await app.request(
      `/api/v1/admin/feedback/${id}/triage`,
      authed(admin, { method: 'POST', body: JSON.stringify({ status: 'recusado' }) }),
    )
    expect(sem.status).toBe(400)

    const com = await app.request(
      `/api/v1/admin/feedback/${id}/triage`,
      authed(admin, {
        method: 'POST',
        body: JSON.stringify({ status: 'recusado', resolution: 'A cota tem dono no DF-22.' }),
      }),
    )
    expect(com.status).toBe(200)
    const item = await com.json()
    expect(item.status).toBe('recusado')
    expect(item.statusChangedAt).toBeTruthy()
    expect(item.unread).toBe(true)
  })

  it('duplicado exige alvo, e o alvo não pode ser ele mesmo (AC-DF26.7)', async () => {
    const mine = await (await app.request('/api/v1/feedback/mine', authed(ana))).json()
    const id = mine.items[0].id

    const semAlvo = await app.request(
      `/api/v1/admin/feedback/${id}/triage`,
      authed(admin, {
        method: 'POST',
        body: JSON.stringify({ status: 'duplicado', resolution: 'Mesma coisa do outro.' }),
      }),
    )
    expect(semAlvo.status).toBe(400)

    const aSiMesmo = await app.request(
      `/api/v1/admin/feedback/${id}/triage`,
      authed(admin, {
        method: 'POST',
        body: JSON.stringify({
          status: 'duplicado',
          resolution: 'Mesma coisa do outro.',
          duplicateOf: id,
        }),
      }),
    )
    expect(aSiMesmo.status).toBe(400)
  })

  it('a triagem deixa trilha com o status anterior e o novo (AC-DF26.8)', async () => {
    const r = await app.request('/api/v1/me/export', authed(admin))
    const { auditEvents } = await r.json()
    const ev = auditEvents.filter((e: { action: string }) => e.action === 'feedback.triaged')
    expect(ev.length).toBeGreaterThan(0)
    const meta = typeof ev[0].metadata === 'string' ? JSON.parse(ev[0].metadata) : ev[0].metadata
    expect(meta.de).toBeTruthy()
    expect(meta.para).toBeTruthy()
  })

  it('o autor marca como lido e NÃO consegue reescrever o próprio texto (AC-DF26.9)', async () => {
    const mine = await (await app.request('/api/v1/feedback/mine', authed(ana))).json()
    const alvo = mine.items.find((i: { unread: boolean }) => i.unread)
    expect(alvo).toBeTruthy()

    const seen = await app.request(
      `/api/v1/feedback/${alvo.id}/seen`,
      authed(ana, { method: 'POST' }),
    )
    expect(seen.status).toBe(204)
    const depois = await (await app.request('/api/v1/feedback/mine', authed(ana))).json()
    expect(depois.items.find((i: { id: string }) => i.id === alvo.id).unread).toBe(false)

    // camada 2 do §6.2: o grant de coluna é quem impede, não a rota
    const cli = new pg.Client({ connectionString: process.env.DATABASE_URL })
    await cli.connect()
    try {
      await cli.query('SET ROLE bajeiros_app')
      await cli.query("SELECT set_config('app.user_id', $1, false)", [ana.sub])
      await expect(
        cli.query('UPDATE feedback_items SET body = $1 WHERE id = $2', ['outra coisa', alvo.id]),
      ).rejects.toThrow()
      await expect(
        cli.query("UPDATE feedback_items SET status = 'entregue' WHERE id = $1", [alvo.id]),
      ).rejects.toThrow()
    } finally {
      await cli.end()
    }
  })

  it('a exportação do titular traz as sugestões dele (AC-DF26.10)', async () => {
    const r = await app.request('/api/v1/me/export', authed(ana))
    const data = await r.json()
    expect(Array.isArray(data.feedback)).toBe(true)
    expect(data.feedback.length).toBeGreaterThan(0)
    expect(data.feedback[0].body).toBeTruthy()
  })

  it('o Início só traz o número quando há desfecho não lido (AC-DF26.11)', async () => {
    const semNovidade = await (await app.request('/api/v1/me/home', authed(ana))).json()
    expect(semNovidade.feedback).toBeNull()

    const mine = await (await app.request('/api/v1/feedback/mine', authed(ana))).json()
    await app.request(
      `/api/v1/admin/feedback/${mine.items[0].id}/triage`,
      authed(admin, { method: 'POST', body: JSON.stringify({ status: 'planejado' }) }),
    )
    const comNovidade = await (await app.request('/api/v1/me/home', authed(ana))).json()
    expect(comNovidade.feedback.respondidas).toBeGreaterThan(0)
  })

  it('a fila do admin conta abertos por página e o mais antigo em novo (AC-DF26.8/§9.3)', async () => {
    const r = await app.request('/api/v1/admin/feedback', authed(admin))
    expect(r.status).toBe(200)
    const fila = await r.json()
    expect(fila.items.length).toBeGreaterThan(0)
    expect(fila.items[0].authorName).toBeTruthy()
    expect(Array.isArray(fila.porPagina)).toBe(true)
    expect(fila.porPagina.every((p: { abertos: number }) => Number.isInteger(p.abertos))).toBe(true)
  })

  it('o teto do dia é por 24 h e diz qual teto estourou (AC-DF26.4)', async () => {
    const carlos = await makeUser('Carlos')
    await app.request('/api/v1/me', authed(carlos, { method: 'POST' }))
    for (let i = 0; i < 10; i++) {
      const r = await app.request(
        '/api/v1/feedback',
        authed(carlos, { method: 'POST', body: envio({ title: `Pedido ${i}` }) }),
      )
      expect(r.status).toBe(201)
    }
    const onze = await app.request(
      '/api/v1/feedback',
      authed(carlos, { method: 'POST', body: envio({ title: 'Pedido 11' }) }),
    )
    expect(onze.status).toBe(429)
    const p = await onze.json()
    expect(p.title).toContain('dia')
  })
})
