import { describe, expect, it, beforeAll } from 'vitest'
import pg from 'pg'
import { templateCage } from '@bajeiros/core/model/template'
import { FIELDS, fieldById } from '@bajeiros/datasheet/catalog'
import type { Field } from '@bajeiros/datasheet/types'
import { app } from '../app'
import { authed, makeUser, type TestUser } from './helpers'

// DF-21 (EV-11.2) — ficha do protótipo pela API.
//
// O que estes testes protegem, antes de qualquer detalhe: o validador 3D é MEIO, não
// porta de entrada (§3.2). Projeto sem gaiola nenhuma preenche a ficha inteira, chega
// a 100%, exporta e nunca vê coluna de sugestão.

const json = (body: unknown) => JSON.stringify(body)

interface ValueRow {
  fieldId: string
  kind: 'design' | 'measured'
  value: number | string | boolean
  updatedBy: string | null
  updatedAt: string | null
}

interface Progress {
  filled: number
  total: number
  pct: number
  waivedSections: number
  sections: { sectionId: string; filled: number; total: number; pct: number; waived: boolean }[]
}

interface Sheet {
  projectId: string
  projectName: string
  catalogVersion: string
  hasCage: boolean
  cageSeq: number | null
  sections: { id: string; label: string; waived: boolean; waiverReason: string | null }[]
  fields: { id: string; label: string; type: string; dual: boolean; suggestable: boolean }[]
  values: ValueRow[]
  suggestions: { fieldId: string; value: number | string; origin: string }[]
  divergences: {
    fieldId: string
    suggestedVsDesign?: { abs: number; pct: number | null }
    designVsMeasured?: { abs: number; pct: number | null }
    suggestedVsMeasured?: { abs: number; pct: number | null }
  }[]
  warnings: { fieldId: string; kind: string; message: string }[]
  progress: Progress
}

interface Revision {
  fieldId: string
  kind: string
  oldValue: number | string | boolean | null
  newValue: number | string | boolean | null
  source: 'manual' | 'suggestion'
  changedBy: string | null
  changedAt: string
}

/** Um valor válido qualquer para o tipo — serve para preencher a ficha inteira à mão. */
function amostra(f: Field): number | string | boolean {
  switch (f.type) {
    case 'number':
      return f.typical?.min ?? f.absolute?.min ?? 1
    case 'enum':
      return f.options![0].id
    case 'boolean':
      return true
    case 'date':
      return '2026-03-01'
    case 'link':
      return 'https://exemplo.org/a.pdf'
    default:
      return 'texto'
  }
}

describe('DF-21 — ficha do protótipo (API)', () => {
  let ana: TestUser // dona do projeto pessoal
  let cap: TestUser // capitã da equipe
  let membro: TestUser
  let fora: TestUser
  let pessoal: string // projeto pessoal da Ana, SEM gaiola nenhuma
  let daEquipe: string // projeto da equipe, com gaiola salva
  let teamId: string

  const sheet = async (by: TestUser, project: string): Promise<Sheet> =>
    await (await app.request(`/api/v1/projects/${project}/datasheet`, authed(by))).json()

  const put = (by: TestUser, project: string, values: unknown[]) =>
    app.request(
      `/api/v1/projects/${project}/datasheet`,
      authed(by, { method: 'PUT', body: json({ values }) }),
    )

  async function joinTeam(who: TestUser, approver: TestUser) {
    const inv = await app.request(
      `/api/v1/teams/${teamId}/invites`,
      authed(approver, { method: 'POST', body: json({ email: who.email }) }),
    )
    const { token } = await inv.json()
    await app.request(
      '/api/v1/invites/accept',
      authed(who, { method: 'POST', body: json({ token }) }),
    )
    const fila = await (
      await app.request(`/api/v1/teams/${teamId}/join-requests`, authed(approver))
    ).json()
    const req = fila.find((r: { userId: string }) => r.userId === who.sub)!
    await app.request(
      `/api/v1/teams/${teamId}/join-requests/${req.id}/approve`,
      authed(approver, { method: 'POST', body: json({}) }),
    )
  }

  beforeAll(async () => {
    ;[ana, cap, membro, fora] = await Promise.all([
      makeUser('AnaFicha'),
      makeUser('CapFicha'),
      makeUser('MembroFicha'),
      makeUser('ForaFicha'),
    ])
    for (const u of [ana, cap, membro, fora]) {
      await app.request('/api/v1/me', authed(u, { method: 'POST' }))
    }

    pessoal = (
      await (
        await app.request(
          '/api/v1/projects',
          authed(ana, { method: 'POST', body: json({ name: 'Protótipo de bancada' }) }),
        )
      ).json()
    ).id

    teamId = (
      await (
        await app.request(
          '/api/v1/teams',
          authed(cap, { method: 'POST', body: json({ name: 'Equipe Ficha' }) }),
        )
      ).json()
    ).id
    await joinTeam(membro, cap)

    const p = await (
      await app.request(
        '/api/v1/projects',
        authed(cap, { method: 'POST', body: json({ name: 'Canindé 2026' }) }),
      )
    ).json()
    daEquipe = p.id
    await app.request(
      `/api/v1/projects/${daEquipe}/transfer`,
      authed(cap, { method: 'POST', body: json({ teamId }) }),
    )
    await app.request(
      `/api/v1/projects/${daEquipe}/snapshots`,
      authed(cap, { method: 'POST', body: json({ cage: templateCage, expectedSeq: 0 }) }),
    )
  })

  // ---------- o princípio §3.2 ----------

  it('projeto sem gaiola nenhuma: ficha completa, sem sugestão e sem coluna vazia', async () => {
    const s = await sheet(ana, pessoal)
    expect(s.hasCage).toBe(false)
    expect(s.cageSeq).toBeNull()
    expect(s.suggestions).toEqual([])
    expect(s.fields).toHaveLength(FIELDS.length)
    expect(s.progress.total).toBe(FIELDS.length)
    expect(s.progress.pct).toBe(0)
    expect(s.catalogVersion).toMatch(/^\d+\.\d+\.\d+$/)
  })

  // AC-DF21.3 — o critério mais importante da spec inteira
  it('AC-DF21.3 — projeto sem versão de gaiola atinge 100% preenchendo tudo à mão', async () => {
    const r = await put(
      ana,
      pessoal,
      FIELDS.map((f) => ({ fieldId: f.id, value: amostra(f) })),
    )
    expect(r.status).toBe(200)
    const { progress } = (await r.json()) as { progress: Progress }
    expect(progress.filled).toBe(FIELDS.length)
    expect(progress.pct).toBe(100)

    const s = await sheet(ana, pessoal)
    expect(s.progress.pct).toBe(100)
    expect(s.hasCage).toBe(false)
  })

  // AC-DF21.6
  it('AC-DF21.6 — escrita parcial persiste, gera revisão e não exige nenhum outro campo', async () => {
    const r = await put(cap, daEquipe, [{ fieldId: 'dim.entre-eixos', value: 1520 }])
    expect(r.status).toBe(200)
    const s = await sheet(cap, daEquipe)
    const v = s.values.find((x) => x.fieldId === 'dim.entre-eixos')!
    expect(v.value).toBe(1520)
    expect(v.kind).toBe('design')
    expect(v.updatedBy).toBe(cap.sub)
    expect(s.progress.filled).toBe(1)

    const hist: Revision[] = await (
      await app.request(
        `/api/v1/projects/${daEquipe}/datasheet/history?field=dim.entre-eixos`,
        authed(cap),
      )
    ).json()
    expect(hist).toHaveLength(1)
    expect(hist[0]).toMatchObject({ oldValue: null, newValue: 1520, source: 'manual' })
  })

  it('RF-2.5 — qualquer membro da equipe edita (é trabalho de engenharia, não de capitania)', async () => {
    const r = await put(membro, daEquipe, [{ fieldId: 'susp.amortecedor', value: 'Fox Float 3' }])
    expect(r.status).toBe(200)
    const s = await sheet(cap, daEquipe)
    expect(s.values.find((v) => v.fieldId === 'susp.amortecedor')!.updatedBy).toBe(membro.sub)
  })

  // ---------- sugestões ----------

  it('com gaiola salva, sugere os campos do catálogo — e nenhum vira valor guardado', async () => {
    const s = await sheet(cap, daEquipe)
    expect(s.hasCage).toBe(true)
    expect(s.cageSeq).toBe(1)
    expect(s.suggestions.length).toBeGreaterThan(0)
    for (const sug of s.suggestions) {
      expect(fieldById(sug.fieldId)?.suggest).toBeTruthy()
      expect(sug.origin).toBe('modelo 3D · v1')
      // sugestão NÃO é valor: não aparece em `values` nem conta no progresso
      expect(s.values.some((v) => v.fieldId === sug.fieldId)).toBe(false)
    }
  })

  // AC-DF21.4
  it('AC-DF21.4 — aceitar sugestão grava em `design`, com origem e autor de quem clicou', async () => {
    const antes = await sheet(cap, daEquipe)
    const sug = antes.suggestions.find((s) => s.fieldId === 'dim.massa-gaiola')!
    const r = await put(membro, daEquipe, [
      { fieldId: 'dim.massa-gaiola', value: sug.value, source: 'suggestion' },
    ])
    expect(r.status).toBe(200)

    const s = await sheet(cap, daEquipe)
    const v = s.values.find((x) => x.fieldId === 'dim.massa-gaiola')!
    expect(v.kind).toBe('design')
    expect(v.value).toBe(sug.value)
    expect(v.updatedBy).toBe(membro.sub)

    const hist: Revision[] = await (
      await app.request(
        `/api/v1/projects/${daEquipe}/datasheet/history?field=dim.massa-gaiola`,
        authed(cap),
      )
    ).json()
    expect(hist[0]).toMatchObject({ source: 'suggestion', changedBy: membro.sub })
  })

  // AC-DF21.5 — o defeito que a primeira versão da spec teria criado
  it('AC-DF21.5 — versão nova da gaiola muda a sugestão e NÃO altera valor guardado', async () => {
    const antes = await sheet(cap, daEquipe)
    const massaGuardada = antes.values.find((v) => v.fieldId === 'dim.massa-gaiola')!.value
    const sugAntes = antes.suggestions.find((s) => s.fieldId === 'dim.massa-gaiola')!.value

    const maisPesada = {
      ...templateCage,
      primarySection: {
        ...templateCage.primarySection,
        wall: templateCage.primarySection.wall + 1,
      },
    }
    const save = await app.request(
      `/api/v1/projects/${daEquipe}/snapshots`,
      authed(cap, { method: 'POST', body: json({ cage: maisPesada, expectedSeq: 1 }) }),
    )
    expect(save.status).toBe(201)

    const depois = await sheet(cap, daEquipe)
    expect(depois.suggestions.find((s) => s.fieldId === 'dim.massa-gaiola')!.value).not.toBe(
      sugAntes,
    )
    expect(depois.cageSeq).toBe(2)
    expect(depois.values.find((v) => v.fieldId === 'dim.massa-gaiola')!.value).toBe(massaGuardada)
  })

  // ---------- faixas ----------

  // AC-DF21.7
  it('AC-DF21.7 — fora da faixa típica salva com aviso; fora da absoluta é recusado', async () => {
    const aviso = await put(cap, daEquipe, [{ fieldId: 'dim.massa-seco', value: 95 }])
    expect(aviso.status).toBe(200)
    const body = (await aviso.json()) as { warnings: { fieldId: string; message: string }[] }
    expect(body.warnings[0].fieldId).toBe('dim.massa-seco')
    expect(body.warnings[0].message).toMatch(/unidade/)

    const s = await sheet(cap, daEquipe)
    expect(s.values.find((v) => v.fieldId === 'dim.massa-seco')!.value).toBe(95)
    // o aviso sobrevive ao recarregar — senão o chip sumiria e o erro de unidade com ele
    expect(s.warnings.some((w) => w.fieldId === 'dim.massa-seco')).toBe(true)

    const recusa = await put(cap, daEquipe, [{ fieldId: 'dim.massa-gaiola', value: 2 }])
    expect(recusa.status).toBe(400)
    expect((await recusa.json()).detail).toMatch(/unidade/i)
  })

  it('lote inválido não salva metade do formulário', async () => {
    const r = await put(cap, daEquipe, [
      { fieldId: 'dir.relacao', value: 6 },
      { fieldId: 'freio.disco-dianteiro', value: 3000 }, // disco de 3 m
    ])
    expect(r.status).toBe(400)
    const s = await sheet(cap, daEquipe)
    expect(s.values.some((v) => v.fieldId === 'dir.relacao')).toBe(false)
  })

  // ---------- três colunas ----------

  // AC-DF21.10
  it('AC-DF21.10 — campo `dual` devolve as diferenças na leitura, sem guardá-las', async () => {
    await put(cap, daEquipe, [
      { fieldId: 'dim.massa-gaiola', value: 30 },
      { fieldId: 'dim.massa-gaiola', kind: 'measured', value: 31.8 },
    ])
    const s = await sheet(cap, daEquipe)
    const d = s.divergences.find((x) => x.fieldId === 'dim.massa-gaiola')!
    expect(d.designVsMeasured).toEqual({ abs: 1.8, pct: 6 })
    expect(d.suggestedVsDesign).toBeDefined()
    // guardado são só duas colunas: projetado e medido
    const guardadas = s.values.filter((v) => v.fieldId === 'dim.massa-gaiola')
    expect(guardadas.map((v) => v.kind).sort()).toEqual(['design', 'measured'])
  })

  // AC-DF21.8
  it('AC-DF21.8 — divergir da sugestão não gera aviso nem chip', async () => {
    const s = await sheet(cap, daEquipe)
    const sug = s.suggestions.find((x) => x.fieldId === 'dim.massa-gaiola')!.value as number
    expect(s.values.find((v) => v.fieldId === 'dim.massa-gaiola')!.value).not.toBe(sug)
    expect(s.warnings.some((w) => w.fieldId === 'dim.massa-gaiola')).toBe(false)
  })

  it('campo sem coluna de medido recusa escrita em `measured`', async () => {
    const r = await put(cap, daEquipe, [
      { fieldId: 'chassi.fornecedor', kind: 'measured', value: 'ACME' },
    ])
    expect(r.status).toBe(400)
  })

  it('apagar um valor é escrita normal e entra no histórico', async () => {
    await put(cap, daEquipe, [{ fieldId: 'dir.voltas', value: 1.5 }])
    const r = await put(cap, daEquipe, [{ fieldId: 'dir.voltas', value: null }])
    expect(r.status).toBe(200)
    const s = await sheet(cap, daEquipe)
    expect(s.values.some((v) => v.fieldId === 'dir.voltas')).toBe(false)
    const hist: Revision[] = await (
      await app.request(
        `/api/v1/projects/${daEquipe}/datasheet/history?field=dir.voltas`,
        authed(cap),
      )
    ).json()
    expect(hist[0]).toMatchObject({ oldValue: 1.5, newValue: null })
  })

  // ---------- dispensas ----------

  // AC-DF21.9
  it('AC-DF21.9 — seção dispensada sai do denominador e a contagem aparece', async () => {
    const antes = await sheet(cap, daEquipe)
    const r = await app.request(
      `/api/v1/projects/${daEquipe}/datasheet/waivers/ergonomia`,
      authed(cap, {
        method: 'PUT',
        body: json({ reason: 'sem aquisição de dados nesta temporada' }),
      }),
    )
    expect(r.status).toBe(200)
    const s: Sheet = await r.json()
    expect(s.progress.waivedSections).toBe(1)
    expect(s.progress.total).toBeLessThan(antes.progress.total)
    const secao = s.sections.find((x) => x.id === 'ergonomia')!
    // marcada e visível, nunca escondida (RF-5.1)
    expect(secao.waived).toBe(true)
    expect(secao.waiverReason).toMatch(/aquisição/)

    const volta = await app.request(
      `/api/v1/projects/${daEquipe}/datasheet/waivers/ergonomia`,
      authed(cap, { method: 'DELETE' }),
    )
    expect(((await volta.json()) as Sheet).progress.waivedSections).toBe(0)
  })

  it('dispensa exige motivo e é da capitania (P-3.2)', async () => {
    const semMotivo = await app.request(
      `/api/v1/projects/${daEquipe}/datasheet/waivers/direcao`,
      authed(cap, { method: 'PUT', body: json({ reason: '' }) }),
    )
    expect(semMotivo.status).toBe(400)

    const membroTenta = await app.request(
      `/api/v1/projects/${daEquipe}/datasheet/waivers/direcao`,
      authed(membro, { method: 'PUT', body: json({ reason: 'não temos direção' }) }),
    )
    expect(membroTenta.status).toBe(403)

    const secaoInventada = await app.request(
      `/api/v1/projects/${daEquipe}/datasheet/waivers/aerodinamica`,
      authed(cap, { method: 'PUT', body: json({ reason: 'não temos' }) }),
    )
    expect(secaoInventada.status).toBe(404)
  })

  it('no projeto pessoal, quem dispensa é o dono', async () => {
    const r = await app.request(
      `/api/v1/projects/${pessoal}/datasheet/waivers/eletrica`,
      authed(ana, { method: 'PUT', body: json({ reason: 'bancada sem parte elétrica' }) }),
    )
    expect(r.status).toBe(200)
    await app.request(
      `/api/v1/projects/${pessoal}/datasheet/waivers/eletrica`,
      authed(ana, { method: 'DELETE' }),
    )
  })

  // ---------- histórico ----------

  // AC-DF21.11
  it('AC-DF21.11 — histórico traz anterior, novo, origem, autor e data, em ordem', async () => {
    await put(cap, daEquipe, [{ fieldId: 'tf.pneu', value: '22×7-10' }])
    await put(membro, daEquipe, [{ fieldId: 'tf.pneu', value: '23×7-10' }])
    const hist: Revision[] = await (
      await app.request(`/api/v1/projects/${daEquipe}/datasheet/history?field=tf.pneu`, authed(cap))
    ).json()
    expect(hist).toHaveLength(2)
    expect(hist[0]).toMatchObject({
      oldValue: '22×7-10',
      newValue: '23×7-10',
      changedBy: membro.sub,
      source: 'manual',
    })
    expect(hist[1].oldValue).toBeNull()
    expect(Date.parse(hist[0].changedAt)).toBeGreaterThanOrEqual(Date.parse(hist[1].changedAt))
  })

  // ---------- isolamento ----------

  // AC-DF21.12
  it('AC-DF21.12 — membro de outra equipe não lê nem escreve a ficha', async () => {
    const leitura = await app.request(`/api/v1/projects/${daEquipe}/datasheet`, authed(fora))
    expect(leitura.status).toBe(404)
    const escrita = await put(fora, daEquipe, [{ fieldId: 'dim.entre-eixos', value: 1400 }])
    expect(escrita.status).toBe(404)
    const hist = await app.request(`/api/v1/projects/${daEquipe}/datasheet/history`, authed(fora))
    expect(hist.status).toBe(404)
    const waiver = await app.request(
      `/api/v1/projects/${daEquipe}/datasheet/waivers/direcao`,
      authed(fora, { method: 'PUT', body: json({ reason: 'invasão' }) }),
    )
    expect(waiver.status).toBe(404)
    // e o valor da equipe continua onde estava
    const s = await sheet(cap, daEquipe)
    expect(s.values.find((v) => v.fieldId === 'dim.entre-eixos')!.value).toBe(1520)
  })

  // ---------- concorrência ----------

  // AC-DF21.13
  it('AC-DF21.13 — campos distintos não conflitam; o mesmo campo devolve 409 com o vigente', async () => {
    await put(cap, daEquipe, [{ fieldId: 'dir.ackermann', value: 100 }])
    const s = await sheet(cap, daEquipe)
    const carimbo = s.values.find((v) => v.fieldId === 'dir.ackermann')!.updatedAt

    const [a, b] = await Promise.all([
      put(cap, daEquipe, [{ fieldId: 'dir.ackermann', value: 90, expectedUpdatedAt: carimbo }]),
      put(membro, daEquipe, [{ fieldId: 'freio.relacao-pedal', value: 5 }]),
    ])
    expect(a.status).toBe(200)
    expect(b.status).toBe(200)

    // segunda escrita com o carimbo velho: 409 com o valor vigente na resposta
    const tarde = await put(membro, daEquipe, [
      { fieldId: 'dir.ackermann', value: 70, expectedUpdatedAt: carimbo },
    ])
    expect(tarde.status).toBe(409)
    const p = await tarde.json()
    expect(p.fieldId).toBe('dir.ackermann')
    expect(p.current.value).toBe(90)
  })

  it('escrever esperando campo vazio falha se alguém já preencheu', async () => {
    const r = await put(membro, daEquipe, [
      { fieldId: 'dir.ackermann', value: 55, expectedUpdatedAt: null },
    ])
    expect(r.status).toBe(409)
  })

  // ---------- saídas ----------

  // AC-DF21.14
  it('AC-DF21.14 — exportação Markdown e CSV trazem seções, unidades e as colunas', async () => {
    const md = await app.request(`/api/v1/projects/${daEquipe}/datasheet/export`, authed(cap))
    expect(md.headers.get('content-type')).toMatch(/text\/markdown/)
    const texto = await md.text()
    expect(texto).toContain('# Ficha do protótipo: Canindé 2026')
    expect(texto).toContain('## Dimensões e massa')
    expect(texto).toContain('| Campo | Unidade | Sugerido | Projetado | Medido |')

    const csv = await app.request(
      `/api/v1/projects/${daEquipe}/datasheet/export?fmt=csv`,
      authed(cap),
    )
    expect(csv.headers.get('content-type')).toMatch(/text\/csv/)
    expect((await csv.text()).split('\n')[0]).toContain('secao,campo,unidade')

    // sem gaiola, o arquivo não inventa coluna de sugerido
    const semGaiola = await (
      await app.request(`/api/v1/projects/${pessoal}/datasheet/export`, authed(ana))
    ).text()
    expect(semGaiola).not.toContain('Sugerido')
  })

  // ---------- convivência com o que já existia ----------

  // AC-DF21.16
  it('AC-DF21.16 — projeto sem ficha nenhuma continua funcionando', async () => {
    const novo = await (
      await app.request(
        '/api/v1/projects',
        authed(membro, { method: 'POST', body: json({ name: 'Sem ficha' }) }),
      )
    ).json()
    expect((await app.request(`/api/v1/projects/${novo.id}`, authed(membro))).status).toBe(200)
    expect(
      (await app.request(`/api/v1/projects/${novo.id}/snapshots`, authed(membro))).status,
    ).toBe(200)
    const s = await sheet(membro, novo.id)
    expect(s.values).toEqual([])
    expect(s.progress.pct).toBe(0)
  })

  it('campo fora do catálogo é recusado com nome, não silenciado', async () => {
    const r = await put(cap, daEquipe, [{ fieldId: 'dim.inventado', value: 1 }])
    expect(r.status).toBe(400)
    expect((await r.json()).detail).toMatch(/catálogo/)
  })

  // AC-DF21.15 — o purge da exclusão de conta ainda é job futuro (identity §12.3 faz
  // soft delete); o que garante o critério é o ON DELETE SET NULL da migração 0009.
  // Aqui a linha do usuário é removida com a role owner, simulando o purge.
  it('AC-DF21.15 — remover a conta anonimiza a autoria e preserva os valores', async () => {
    const efemero = await makeUser('EfemeroFicha')
    await app.request('/api/v1/me', authed(efemero, { method: 'POST' }))
    const proj = await (
      await app.request(
        '/api/v1/projects',
        authed(efemero, { method: 'POST', body: json({ name: 'Ficha órfã' }) }),
      )
    ).json()
    await put(efemero, proj.id, [{ fieldId: 'tf.motor', value: 'Briggs 10HP' }])

    const owner = new pg.Client({ connectionString: process.env.DATABASE_URL })
    await owner.connect()
    try {
      await owner.query(
        'UPDATE projects SET owner_user_id = NULL, owner_team_id = $1 WHERE id = $2',
        [teamId, proj.id],
      )
      // o purge precisa limpar antes as tabelas que referenciam `users` sem SET NULL
      // (trilha de acesso e auditoria têm retenção própria) — as da ficha não estão
      // aqui de propósito: são elas que precisam sobreviver
      for (const [tabela, coluna] of [
        ['audit_events', 'actor_user_id'],
        ['access_log', 'user_id'],
        ['assistant_log', 'user_id'],
        ['consents', 'user_id'],
        ['team_members', 'user_id'],
        ['team_join_requests', 'user_id'],
      ]) {
        await owner.query(`DELETE FROM ${tabela} WHERE ${coluna} = $1`, [efemero.sub])
      }
      await owner.query('DELETE FROM users WHERE id = $1', [efemero.sub])
      const v = await owner.query(
        'SELECT value, updated_by FROM project_fields WHERE project_id = $1 AND field_id = $2',
        [proj.id, 'tf.motor'],
      )
      expect(v.rows[0].value).toBe('Briggs 10HP')
      expect(v.rows[0].updated_by).toBeNull()
      const rev = await owner.query(
        'SELECT changed_by, new_value FROM project_field_revisions WHERE project_id = $1',
        [proj.id],
      )
      expect(rev.rows[0].changed_by).toBeNull()
      expect(rev.rows[0].new_value).toBe('Briggs 10HP')
    } finally {
      await owner.end()
    }
  })
})
