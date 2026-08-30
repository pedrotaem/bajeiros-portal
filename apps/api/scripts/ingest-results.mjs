#!/usr/bin/env node
// Ingestão do acervo de resultados (DF-15 RF-1.3). Roda MANUALMENTE por temporada.
//
//   node scripts/ingest-results.mjs --dir "../../Pesquisa de Mercado"          # dry-run
//   node scripts/ingest-results.mjs --dir "..." --apply --admin <user_uuid>
//
// Idempotente por chave natural (AC-DF15.1): rodar duas vezes não duplica nada.
// O dry-run imprime o diff que vai no PR — o revisor confere o número antes de o
// portal publicar (P-1.6: credibilidade é o ativo central).
//
// A regra (o que é PII, como o nome é montado sem marca) mora em ingest-lib.mjs,
// que é puro e testado. Aqui só há leitura de arquivo e SQL.

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import pg from 'pg'
import { buildPlan } from './ingest-lib.mjs'

const args = process.argv.slice(2)
const flag = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? (args[i + 1] ?? true) : fallback
}
const apply = args.includes('--apply')
const dir = flag('dir', '../../Pesquisa de Mercado')
const adminId = flag('admin')

const databaseUrl = process.env.APP_DATABASE_URL ?? process.env.DATABASE_URL
if (apply && !databaseUrl) throw new Error('APP_DATABASE_URL (ou DATABASE_URL) é obrigatório')
if (apply && !adminId)
  throw new Error('--admin <user_uuid> é obrigatório: a escrita passa pela RLS')

const readJson = async (file) => JSON.parse(await readFile(path.join(dir, file), 'utf8'))
const plan = buildPlan(
  await readJson('resultados-competicoes.json'),
  await readJson('equipes-brasil.json'),
)

console.log('Plano de ingestão')
console.log(`  competições: ${plan.counts.competitions}`)
console.log(`  equipes canônicas: ${plan.counts.teams}`)
console.log(`  resultados: ${plan.counts.results}`)
for (const c of plan.competitions) {
  const nota = c.ambiguous.length ? `  (${c.ambiguous.length} nome(s) repetido(s))` : ''
  console.log(`  - ${c.name.padEnd(28)} ${String(c.results.length).padStart(3)} resultados${nota}`)
}
if (plan.counts.ambiguous) {
  console.log('\nDesempate por número do carro (nome repetido na mesma competição):')
  for (const c of plan.competitions)
    for (const a of c.ambiguous) console.log(`  ${c.name}: "${a.key}" × ${a.count}`)
}

if (!apply) {
  console.log('\nDry-run. Nada foi gravado. Use --apply --admin <user_uuid> para aplicar.')
  process.exit(0)
}

const client = new pg.Client({ connectionString: databaseUrl })
await client.connect()
const stats = { competitions: 0, teams: 0, results: 0 }
try {
  await client.query('BEGIN')
  // a escrita passa pela RLS como o resto do portal: policies *_admin
  await client.query('SELECT set_config($1, $2, true)', ['app.user_id', adminId])

  const teamIds = new Map()
  for (const t of plan.teams) {
    const r = await client.query(
      `INSERT INTO community_teams (display_name, university, city, uf, region, links)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)
       ON CONFLICT (display_name, university) DO UPDATE
         SET city = COALESCE(EXCLUDED.city, community_teams.city),
             uf = COALESCE(EXCLUDED.uf, community_teams.uf),
             region = COALESCE(EXCLUDED.region, community_teams.region),
             links = CASE WHEN EXCLUDED.links = '[]'::jsonb
                          THEN community_teams.links ELSE EXCLUDED.links END
       RETURNING id`,
      [t.displayName, t.university, t.city, t.uf, t.region, JSON.stringify(t.links)],
    )
    teamIds.set(t.key, r.rows[0].id)
    stats.teams++
  }

  for (const c of plan.competitions) {
    const r = await client.query(
      `INSERT INTO competitions (season, kind, region, name, location, source_url)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (season, kind, region) DO UPDATE
         SET name = EXCLUDED.name,
             location = COALESCE(EXCLUDED.location, competitions.location),
             source_url = COALESCE(EXCLUDED.source_url, competitions.source_url)
       RETURNING id`,
      [c.season, c.kind, c.region, c.name, c.location, c.sourceUrl],
    )
    const competitionId = r.rows[0].id
    stats.competitions++
    for (const res of c.results) {
      await client.query(
        `INSERT INTO competition_results
           (competition_id, community_team_id, position, points_total, points, source_url)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6)
         ON CONFLICT (competition_id, community_team_id) DO UPDATE
           SET position = EXCLUDED.position,
               points_total = EXCLUDED.points_total,
               points = EXCLUDED.points,
               source_url = EXCLUDED.source_url,
               ingested_at = now()`,
        [
          competitionId,
          teamIds.get(res.teamKey),
          res.position,
          res.pointsTotal,
          JSON.stringify(res.points),
          res.sourceUrl,
        ],
      )
      stats.results++
    }
  }
  await client.query('COMMIT')
  console.log(
    `\nAplicado: ${stats.competitions} competições, ${stats.teams} equipes, ${stats.results} resultados.`,
  )
} catch (err) {
  await client.query('ROLLBACK')
  throw err
} finally {
  await client.end()
}
