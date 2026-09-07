#!/usr/bin/env node
// Carga da emenda vigente do regulamento (DF-34 §10.6). Roda MANUALMENTE por emenda —
// uma vez por ano, depois de rodar a ingestão no gateway e gerar o índice do portal.
//
//   node scripts/seed-regulation.mjs                                   # dry-run (plano)
//   node scripts/seed-regulation.mjs --apply --admin <user_uuid>       # local (DB_MODE=pg)
//
// Em staging/produção o banco é Aurora atrás da RDS Data API — mesmo driver e mesmas
// variáveis do `seed-calendar.mjs`, que precisa ter rodado ANTES: o PDF oficial é um
// `source_documents` (a URL é a chave), e é ele que esta carga referencia.
//
// Idempotente pela chave natural `edition`. A escrita passa pela RLS (policies *_admin),
// por isso o --admin. Todo parâmetro leva cast explícito: a Data API não converte texto.
//
// O que NÃO se inventa aqui: `pdfSha256` é o hash do arquivo que a pessoa baixou e
// conferiu (o mesmo do manifest do gateway) — sem o arquivo em mãos, não se cadastra a
// emenda. É essa conferência que dá sentido ao "conferido em" da tela.

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
// Node 24 apaga os tipos sozinho: o script usa o driver do repo, sem build
import { withUser, closeDb } from '../src/db/index.ts'

const args = process.argv.slice(2)
const flag = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? (args[i + 1] ?? true) : fallback
}
const apply = args.includes('--apply')
const here = path.dirname(fileURLToPath(import.meta.url))
const file = flag('file', path.join(here, 'regulation-seed.json'))
const adminId = flag('admin')

const dataApi = process.env.DB_MODE === 'data-api'
if (apply && !dataApi && !(process.env.APP_DATABASE_URL ?? process.env.DATABASE_URL)) {
  throw new Error('APP_DATABASE_URL (ou DATABASE_URL) é obrigatório com DB_MODE=pg')
}
if (apply && dataApi && !(process.env.DB_CLUSTER_ARN && process.env.DB_SECRET_ARN)) {
  throw new Error('DB_MODE=data-api exige DB_CLUSTER_ARN e DB_SECRET_ARN')
}
if (apply && !adminId)
  throw new Error('--admin <user_uuid> é obrigatório: a escrita passa pela RLS')

const seed = JSON.parse(await readFile(file, 'utf8'))
const erros = []
if (!/^\d{4}-\d{2}-\d{2}$/.test(seed.conferidoEm)) erros.push('conferidoEm precisa ser AAAA-MM-DD')
if (!Number.isInteger(seed.ciclo)) erros.push('ciclo precisa ser o ano do Nacional')
for (const v of seed.versoes ?? []) {
  if (!/^[a-z0-9-]{1,40}$/.test(v.edition ?? '')) erros.push(`${v.edition}: edição inválida`)
  if (!/^[0-9a-f]{64}$/.test(v.pdfSha256 ?? '')) erros.push(`${v.edition}: pdfSha256 não é sha256`)
  if (!/@[^#]+#/.test(v.corpusVersion ?? '')) erros.push(`${v.edition}: corpusVersion do gateway`)
  if (!Number.isInteger(v.pageCount)) erros.push(`${v.edition}: pageCount`)
  if (!v.sourceUrl) erros.push(`${v.edition}: sourceUrl (documento-fonte do DF-33)`)
}
if (erros.length) {
  console.error('✖ plano inválido:')
  for (const e of erros) console.error(`  - ${e}`)
  process.exit(1)
}

console.log(`Emendas (ciclo ${seed.ciclo}, conferido em ${seed.conferidoEm}):`)
for (const v of seed.versoes) {
  console.log(
    `  - ${v.edition}  ${v.label.padEnd(30)} ${v.pageCount} p. · ${v.corpusVersion}` +
      (v.aplicaAoCiclo ? `  [vale para todo o ciclo ${seed.ciclo}]` : ''),
  )
}

if (!apply) {
  console.log('\nDry-run. Nada foi gravado. Use --apply --admin <user_uuid> para aplicar.')
  process.exit(0)
}

const stats = { versoes: 0, aplicabilidades: 0 }
try {
  await withUser(adminId, async (client) => {
    const checkedAt = `${seed.conferidoEm}T12:00:00Z`
    const porEdicao = new Map()

    for (const v of seed.versoes) {
      const src = await client.query('SELECT id FROM source_documents WHERE url = $1', [
        v.sourceUrl,
      ])
      if (!src.rowCount) {
        throw new Error(
          `documento-fonte ausente (${v.sourceUrl}) — rode scripts/seed-calendar.mjs antes`,
        )
      }
      const r = await client.query(
        `INSERT INTO regulation_versions
           (edition, label, corpus_version, pdf_sha256, page_count, source_id, supersedes_id,
            published_on, checked_at, updated_by)
         VALUES ($1, $2, $3, $4, $5::int, $6, $7, $8::date, $9::timestamptz, $10)
         ON CONFLICT (edition) DO UPDATE
           SET label = EXCLUDED.label,
               corpus_version = EXCLUDED.corpus_version,
               pdf_sha256 = EXCLUDED.pdf_sha256,
               page_count = EXCLUDED.page_count,
               source_id = EXCLUDED.source_id,
               supersedes_id = COALESCE(EXCLUDED.supersedes_id, regulation_versions.supersedes_id),
               published_on = EXCLUDED.published_on,
               checked_at = EXCLUDED.checked_at,
               updated_by = EXCLUDED.updated_by
         RETURNING id`,
        [
          v.edition,
          v.label,
          v.corpusVersion,
          v.pdfSha256,
          v.pageCount,
          src.rows[0].id,
          v.supersedesEdition ? (porEdicao.get(v.supersedesEdition) ?? null) : null,
          v.publishedOn ?? null,
          checkedAt,
          adminId,
        ],
      )
      const id = r.rows[0].id
      porEdicao.set(v.edition, id)
      stats.versoes++

      if (!v.aplicaAoCiclo) continue
      // O ciclo é o do DF-33: o Nacional do ano e as regionais do ano anterior.
      const comps = await client.query(
        `SELECT id FROM competitions
         WHERE (kind = 'nacional' AND season = $1::int)
            OR (kind = 'regional' AND season = $1::int - 1)`,
        [seed.ciclo],
      )
      await client.query('DELETE FROM regulation_applicability WHERE version_id = $1', [id])
      for (const c of comps.rows) {
        await client.query(
          `INSERT INTO regulation_applicability (version_id, competition_id)
           VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [id, c.id],
        )
        stats.aplicabilidades++
      }
    }

    await client.query(
      `INSERT INTO audit_events (actor_user_id, action, resource_type, resource_id, metadata)
       VALUES ($1, 'regulation.seed', 'regulation', $2::text, $3::jsonb)`,
      [adminId, String(seed.ciclo), JSON.stringify({ ...stats, conferidoEm: seed.conferidoEm })],
    )
  })
  console.log(
    `\nAplicado: ${stats.versoes} emenda(s), ${stats.aplicabilidades} competição(ões) vinculada(s).`,
  )
} finally {
  await closeDb()
}
