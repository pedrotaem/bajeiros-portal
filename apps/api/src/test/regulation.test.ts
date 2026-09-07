import { describe, expect, it, beforeAll } from 'vitest'
import pg from 'pg'
import { cycleOf } from '@bajeiros/calendar/cycle'
import { addDays, todayIso } from '@bajeiros/calendar/dates'
import { app } from '../app'
import { authed, makeUser, type TestUser } from './helpers'

// DF-34 — regulamento: qual emenda vale para qual competição, referências oficiais do
// ciclo e o cadastro anual. Sem conta em tudo que é leitura (FR-DF34.2).

const json = (body: unknown) => JSON.stringify(body)
const HOJE = todayIso()
const CICLO = cycleOf(HOJE)
const SHA7 = 'bd03020a576822b4c8a5f2795d40e63eb01f06b18373fc2e3a2e2c65132eca09'
const SHA6 = 'a'.repeat(64)

async function owner<T>(fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL })
  await c.connect()
  try {
    return await fn(c)
  } finally {
    await c.end()
  }
}

describe('regulamento (DF-34)', () => {
  let admin: TestUser
  let qualquer: TestUser
  let nacId: string
  let pdf7Id: string
  let pdf6Id: string
  let versao7: string
  let versao6: string

  beforeAll(async () => {
    admin = await makeUser('CuradoraReg')
    qualquer = await makeUser('SemPoder')
    for (const u of [admin, qualquer])
      await app.request('/api/v1/me', authed(u, { method: 'POST' }))
    await owner((c) => c.query('UPDATE users SET is_admin = true WHERE id = $1', [admin.sub]))

    const nac = await (
      await app.request(
        '/api/v1/admin/calendar/competitions',
        authed(admin, {
          method: 'POST',
          body: json({
            season: CICLO,
            kind: 'nacional',
            name: `Nacional Regulamento ${CICLO}`,
            startsOn: addDays(HOJE, 120),
            endsOn: addDays(HOJE, 124),
          }),
        }),
      )
    ).json()
    nacId = nac.id

    const fonte = async (body: Record<string, unknown>) =>
      (
        await (
          await app.request(
            '/api/v1/admin/calendar/sources',
            authed(admin, { method: 'POST', body: json(body) }),
          )
        ).json()
      ).id as string

    pdf6Id = await fonte({
      kind: 'regulamento',
      title: 'RATBSB Emenda 6',
      url: 'https://exemplo.test/ratbsb-emenda-06.pdf',
      edition: 'emenda-06',
      publishedOn: '2024-11-01',
    })
    pdf7Id = await fonte({
      kind: 'regulamento',
      title: 'RATBSB Emenda 7',
      url: 'https://exemplo.test/ratbsb-emenda-07.pdf',
      edition: 'emenda-07',
      publishedOn: '2025-11-01',
    })
    await fonte({
      kind: 'template',
      title: 'Template de Relatório de Desafio Técnico Ver27',
      url: 'https://exemplo.test/template-desafio-ver27.docx',
      edition: 'Ver27',
    })
    await fonte({
      kind: 'forum',
      title: 'Fórum Baja SAE BRASIL',
      url: 'https://exemplo.test/forum/',
    })
    // informativo NÃO entra nas referências do regulamento: ele é marco do calendário
    await fonte({
      kind: 'informativo',
      number: 1,
      title: 'Informativo 01',
      url: 'https://exemplo.test/informativo-01.pdf',
      competitionId: nacId,
      publishedOn: HOJE,
    })
  })

  it('cadastra a emenda vigente com as competições para as quais vale', async () => {
    const r6 = await app.request(
      '/api/v1/admin/regulation/versions',
      authed(admin, {
        method: 'POST',
        body: json({
          edition: 'emenda-06',
          label: 'RATBSB Emenda 6 · Baja 2025',
          corpusVersion: 'ratbsb@emenda-06#sha256:1111',
          pdfSha256: SHA6,
          pageCount: 140,
          sourceId: pdf6Id,
          publishedOn: '2024-11-01',
        }),
      }),
    )
    expect(r6.status).toBe(201)
    versao6 = (await r6.json()).id

    const r7 = await app.request(
      '/api/v1/admin/regulation/versions',
      authed(admin, {
        method: 'POST',
        body: json({
          edition: 'emenda-07',
          label: 'RATBSB Emenda 7 · Baja 2026',
          corpusVersion: 'ratbsb@emenda-07#sha256:e4a0b50bb2eb',
          pdfSha256: SHA7,
          pageCount: 148,
          sourceId: pdf7Id,
          supersedesId: versao6,
          publishedOn: '2025-11-01',
          appliesTo: [nacId],
        }),
      }),
    )
    expect(r7.status).toBe(201)
    versao7 = (await r7.json()).id
  })

  it('a leitura é pública, com cache e sem sessão (FR-DF34.2)', async () => {
    const res = await app.request('/api/v1/public/regulation/versions')
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toContain('max-age=3600')
    const body = await res.json()
    expect(body.season).toBe(CICLO)
    const sete = body.versions.find((v: { edition: string }) => v.edition === 'emenda-07')
    expect(sete.corpusVersion).toBe('ratbsb@emenda-07#sha256:e4a0b50bb2eb')
    expect(sete.pdfSha256).toBe(SHA7)
    expect(sete.pageCount).toBe(148)
    expect(sete.source.url).toBe('https://exemplo.test/ratbsb-emenda-07.pdf')
    expect(sete.appliesTo.map((a: { competitionId: string }) => a.competitionId)).toEqual([nacId])
    expect(sete.supersedesId).toBe(versao6)
  })

  it('a emenda anterior continua acessível e sabe quem a substituiu (FR-DF34.15)', async () => {
    const body = await (await app.request('/api/v1/public/regulation/versions')).json()
    const seis = body.versions.find((v: { edition: string }) => v.edition === 'emenda-06')
    expect(seis).toBeTruthy()
    expect(seis.supersededById).toBe(versao7)
    expect(seis.appliesTo).toEqual([])
  })

  it('referências do ciclo: regulamento, template e fórum — informativo não (FR-DF34.14)', async () => {
    const res = await app.request(`/api/v1/public/regulation/references?season=${CICLO}`)
    expect(res.status).toBe(200)
    const { references } = await res.json()
    const kinds = new Set(references.map((r: { kind: string }) => r.kind))
    expect(kinds.has('regulamento')).toBe(true)
    expect(kinds.has('template')).toBe(true)
    expect(kinds.has('forum')).toBe(true)
    expect(kinds.has('informativo')).toBe(false)
    for (const r of references) expect(r.url).toMatch(/^https:\/\//)
  })

  it('curadoria pode marcar a referência que altera regra e a seção que ela toca', async () => {
    await owner((c) =>
      c.query(
        `UPDATE source_documents SET alters_rules = true, section_id = 'B6.2.4.3'
         WHERE url = 'https://exemplo.test/template-desafio-ver27.docx'`,
      ),
    )
    const { references } = await (
      await app.request(`/api/v1/public/regulation/references?season=${CICLO}`)
    ).json()
    const tpl = references.find((r: { kind: string }) => r.kind === 'template')
    expect(tpl.altersRules).toBe(true)
    expect(tpl.sectionId).toBe('B6.2.4.3')
  })

  it('atualizar a emenda troca a lista de competições inteira', async () => {
    const res = await app.request(
      `/api/v1/admin/regulation/versions/${versao7}`,
      authed(admin, { method: 'PATCH', body: json({ appliesTo: [] }) }),
    )
    expect(res.status).toBe(200)
    const body = await (await app.request('/api/v1/public/regulation/versions')).json()
    expect(body.versions.find((v: { id: string }) => v.id === versao7).appliesTo).toEqual([])

    await app.request(
      `/api/v1/admin/regulation/versions/${versao7}`,
      authed(admin, { method: 'PATCH', body: json({ appliesTo: [nacId] }) }),
    )
  })

  it('quem não é admin não cadastra emenda', async () => {
    const res = await app.request(
      '/api/v1/admin/regulation/versions',
      authed(qualquer, {
        method: 'POST',
        body: json({
          edition: 'emenda-99',
          label: 'Pirata',
          corpusVersion: 'x',
          pdfSha256: SHA6,
          pageCount: 1,
          sourceId: pdf7Id,
        }),
      }),
    )
    expect(res.status).toBe(403)
  })

  it('recusa hash de PDF que não é sha256 e edição maiúscula', async () => {
    for (const body of [{ pdfSha256: 'nada' }, { edition: 'Emenda-07' }]) {
      const res = await app.request(
        '/api/v1/admin/regulation/versions',
        authed(admin, {
          method: 'POST',
          body: json({
            edition: 'emenda-08',
            label: 'RATBSB Emenda 8',
            corpusVersion: 'ratbsb@emenda-08#sha256:2222',
            pdfSha256: SHA6,
            pageCount: 150,
            sourceId: pdf7Id,
            ...body,
          }),
        }),
      )
      expect(res.status).toBe(400)
    }
  })

  it('emenda sem documento-fonte é 404, não 500', async () => {
    const res = await app.request(
      '/api/v1/admin/regulation/versions',
      authed(admin, {
        method: 'POST',
        body: json({
          edition: 'emenda-10',
          label: 'RATBSB Emenda 10',
          corpusVersion: 'ratbsb@emenda-10#sha256:3333',
          pdfSha256: SHA6,
          pageCount: 150,
          sourceId: '00000000-0000-4000-8000-000000000000',
        }),
      }),
    )
    expect(res.status).toBe(404)
  })
})
