#!/usr/bin/env node
// Carga inicial do calendário de competições (DF-33 §11.8). Roda MANUALMENTE por temporada.
//
//   node scripts/seed-calendar.mjs                                    # dry-run (plano)
//   node scripts/seed-calendar.mjs --apply --admin <user_uuid>          # local (DB_MODE=pg)
//
// Em staging/produção o banco é Aurora atrás da RDS Data API — não há Postgres a que se
// conectar. O script usa o MESMO driver da API (`src/db`), que escolhe por `DB_MODE`:
//
//   DB_MODE=data-api AWS_REGION=sa-east-1 DB_CLUSTER_ARN=... DB_SECRET_ARN=... \
//     node scripts/seed-calendar.mjs --apply --admin <user_uuid>
//
// Idempotente pelas chaves naturais das tabelas: competição (season, kind, region), documento
// (url), marco (competition_id, kind, title, due_on). Rodar duas vezes atualiza, não duplica.
// A escrita passa pela RLS como o resto do portal (policies *_admin) — por isso o --admin.
//
// Todo parâmetro de data leva cast explícito (`$N::date`, `$N::timestamptz`): o driver pg
// converte texto sozinho, a Data API não.
//
// O JSON é LEVANTAMENTO, não dado do portal (spec §12): `conferidoEm` é a data em que alguém
// olhou a fonte, e é ela que vira `checked_at`. Reconfira antes de aplicar.

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
const file = flag('file', path.join(here, 'calendar-seed.json'))
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
const ISO = /^\d{4}-\d{2}-\d{2}$/
if (!ISO.test(seed.conferidoEm)) throw new Error('conferidoEm precisa ser AAAA-MM-DD')

// ---------- validação do plano (antes de qualquer conexão) ----------
const porChave = new Map(seed.competicoes.map((c) => [c.chave, c]))
const erros = []
for (const c of seed.competicoes) {
  if (c.kind === 'nacional' && c.region) erros.push(`${c.chave}: nacional não tem região`)
  if (c.kind === 'regional' && !c.region) erros.push(`${c.chave}: regional precisa de região`)
  for (const k of ['startsOn', 'endsOn', 'registrationOpensOn', 'registrationClosesOn'])
    if (c[k] && !ISO.test(c[k])) erros.push(`${c.chave}.${k}: data inválida`)
}
const urls = new Set()
for (const d of seed.documentos) {
  if (d.competicao && !porChave.has(d.competicao))
    erros.push(`documento ${d.url}: competição desconhecida`)
  if (urls.has(d.url)) erros.push(`documento repetido: ${d.url}`)
  urls.add(d.url)
}
for (const m of seed.marcos) {
  if (!porChave.has(m.competicao)) erros.push(`marco "${m.title}": competição desconhecida`)
  if (!ISO.test(m.dueOn)) erros.push(`marco "${m.title}": dueOn inválido`)
  if (m.startsOn && m.startsOn > m.dueOn) erros.push(`marco "${m.title}": janela invertida`)
  if (m.fonteUrl && !urls.has(m.fonteUrl))
    erros.push(`marco "${m.title}": fonteUrl não está em documentos`)
  if (m.summary && m.summary.length > 280) erros.push(`marco "${m.title}": summary > 280`)
}
if (erros.length) {
  console.error('Plano inválido:')
  for (const e of erros) console.error(`  - ${e}`)
  process.exit(1)
}

console.log(`Plano de carga — ciclo ${seed.ciclo}, conferido em ${seed.conferidoEm}`)
console.log(`  competições: ${seed.competicoes.length}`)
for (const c of seed.competicoes)
  console.log(
    `  - ${c.name.padEnd(26)} ${c.startsOn ?? '?'} → ${c.endsOn ?? '?'}  ${c.location ?? ''}`,
  )
console.log(`  documentos-fonte: ${seed.documentos.length}`)
const pendentes = seed.documentos.filter((d) => d._conferir)
if (pendentes.length) {
  console.log(
    `  ⚠ ${pendentes.length} documento(s) com "_conferir" — confirme URL e data antes de aplicar:`,
  )
  for (const d of pendentes) console.log(`    · ${d.title} — ${d._conferir}`)
}
console.log(`  marcos: ${seed.marcos.length}`)
for (const m of seed.marcos)
  console.log(
    `  - ${m.dueOn}  ${m.title.padEnd(34)} ${porChave.get(m.competicao).name}` +
      (m.appliesTo?.length ? `  [${m.appliesTo.join(', ')}]` : ''),
  )

if (!apply) {
  console.log('\nDry-run. Nada foi gravado. Use --apply --admin <user_uuid> para aplicar.')
  process.exit(0)
}

// ---------- aplicação ----------
// `withUser` abre a transação, fixa `app.user_id` (a RLS enxerga o admin) e faz
// COMMIT no retorno normal / ROLLBACK na exceção — nos dois drivers.
const stats = { competitions: 0, sources: 0, milestones: 0 }
try {
  await withUser(adminId, async (client) => {
    const checkedAt = `${seed.conferidoEm}T12:00:00Z`

    const compId = new Map()
    for (const c of seed.competicoes) {
      const r = await client.query(
        `INSERT INTO competitions
           (season, kind, region, name, starts_on, ends_on, location, official_url,
            registration_opens_on, registration_closes_on, checked_at)
         VALUES ($1, $2, $3, $4, $5::date, $6::date, $7, $8, $9::date, $10::date, $11::timestamptz)
         ON CONFLICT (season, kind, region) DO UPDATE
           SET name = EXCLUDED.name,
               starts_on = EXCLUDED.starts_on,
               ends_on = EXCLUDED.ends_on,
               location = COALESCE(EXCLUDED.location, competitions.location),
               official_url = COALESCE(EXCLUDED.official_url, competitions.official_url),
               registration_opens_on = EXCLUDED.registration_opens_on,
               registration_closes_on = EXCLUDED.registration_closes_on,
               checked_at = EXCLUDED.checked_at
         RETURNING id`,
        [
          c.season,
          c.kind,
          c.kind === 'nacional' ? null : c.region,
          c.name,
          c.startsOn ?? null,
          c.endsOn ?? null,
          c.location ?? null,
          c.officialUrl ?? null,
          c.registrationOpensOn ?? null,
          c.registrationClosesOn ?? null,
          checkedAt,
        ],
      )
      compId.set(c.chave, r.rows[0].id)
      stats.competitions++
    }

    const srcId = new Map()
    for (const d of seed.documentos) {
      const r = await client.query(
        `INSERT INTO source_documents
           (competition_id, kind, number, title, url, published_on, edition, checked_at, created_by)
         VALUES ($1, $2, $3, $4, $5, $6::date, $7, $8::timestamptz, $9)
         ON CONFLICT (url) DO UPDATE
           SET competition_id = EXCLUDED.competition_id,
               kind = EXCLUDED.kind,
               number = EXCLUDED.number,
               title = EXCLUDED.title,
               published_on = EXCLUDED.published_on,
               edition = EXCLUDED.edition,
               checked_at = EXCLUDED.checked_at
         RETURNING id`,
        [
          d.competicao ? compId.get(d.competicao) : null,
          d.kind,
          d.number ?? null,
          d.title,
          d.url,
          d.publishedOn ?? null,
          d.edition ?? null,
          checkedAt,
          adminId,
        ],
      )
      srcId.set(d.url, r.rows[0].id)
      stats.sources++
    }

    for (const m of seed.marcos) {
      await client.query(
        `INSERT INTO competition_milestones
           (competition_id, kind, title, summary, starts_on, due_on, applies_to, source_id,
            section_id, status, checked_at, updated_by)
         VALUES ($1, $2, $3, $4, $5::date, $6::date, $7::text[], $8, $9, $10, $11::timestamptz, $12)
         ON CONFLICT (competition_id, kind, title, due_on) DO UPDATE
           SET summary = EXCLUDED.summary,
               starts_on = EXCLUDED.starts_on,
               applies_to = EXCLUDED.applies_to,
               source_id = EXCLUDED.source_id,
               section_id = EXCLUDED.section_id,
               status = EXCLUDED.status,
               checked_at = EXCLUDED.checked_at,
               updated_by = EXCLUDED.updated_by`,
        [
          compId.get(m.competicao),
          m.kind,
          m.title,
          m.summary ?? null,
          m.startsOn ?? null,
          m.dueOn,
          `{${(m.appliesTo ?? []).join(',')}}`,
          m.fonteUrl ? srcId.get(m.fonteUrl) : null,
          m.sectionId ?? null,
          m.status ?? 'previsto',
          checkedAt,
          adminId,
        ],
      )
      stats.milestones++
    }

    await client.query(
      `INSERT INTO audit_events (actor_user_id, action, resource_type, resource_id, metadata)
       VALUES ($1, 'calendar.seed', 'calendar', $2::text, $3::jsonb)`,
      [adminId, String(seed.ciclo), JSON.stringify({ ...stats, conferidoEm: seed.conferidoEm })],
    )
  })
  console.log(
    `\nAplicado: ${stats.competitions} competições, ${stats.sources} documentos, ${stats.milestones} marcos.`,
  )
} finally {
  await closeDb()
}
