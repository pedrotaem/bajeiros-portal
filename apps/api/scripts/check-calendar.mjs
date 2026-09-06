#!/usr/bin/env node
// Conferência LOCAL do calendário (DF-33 §3.4): compara a tabela de prazos copiada da página
// oficial com o que está no banco e aponta divergências. Só lê. Nunca escreve. Nunca em
// produção por agendador — a fonte bloqueia cliente não-browser e muda de forma sem aviso,
// então quem cola a tabela é uma pessoa, no Chrome.
//
//   node scripts/check-calendar.mjs --file prazos.txt --season 2027 --kind nacional [--region Sul]
//
// O parser é o MESMO da administração (packages/calendar/src/parse-table.ts, importado como
// TypeScript — Node 24 apaga os tipos sozinho).

import { readFile } from 'node:fs/promises'
import pg from 'pg'
import { parseMilestoneTable } from '../../../packages/calendar/src/parse-table.ts'

const args = process.argv.slice(2)
const flag = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? (args[i + 1] ?? true) : fallback
}
const file = flag('file')
const season = Number(flag('season'))
const kind = flag('kind', 'nacional')
const region = flag('region')
if (!file || !season) {
  console.error(
    'uso: check-calendar.mjs --file prazos.txt --season 2027 --kind nacional|regional [--region X]',
  )
  process.exit(2)
}
const databaseUrl = process.env.APP_DATABASE_URL ?? process.env.DATABASE_URL
if (!databaseUrl) throw new Error('APP_DATABASE_URL (ou DATABASE_URL) é obrigatório')

const { rows, ignored } = parseMilestoneTable(await readFile(file, 'utf8'))
console.log(`Tabela colada: ${rows.length} linha(s) de marco, ${ignored.length} ignorada(s).`)

const client = new pg.Client({ connectionString: databaseUrl })
await client.connect()
try {
  const comp = await client.query(
    `SELECT id, name, to_char(starts_on, 'YYYY-MM-DD') AS starts_on FROM competitions
     WHERE season = $1 AND kind = $2 AND region IS NOT DISTINCT FROM $3`,
    [season, kind, kind === 'nacional' ? null : region],
  )
  if (!comp.rowCount) {
    console.error('Competição não encontrada no banco. Cadastre-a na administração primeiro.')
    process.exit(1)
  }
  const c = comp.rows[0]
  const banco = (
    await client.query(
      `SELECT m.title, to_char(m.due_on, 'YYYY-MM-DD') AS due_on, m.status, s.number
       FROM competition_milestones m LEFT JOIN source_documents s ON s.id = m.source_id
       WHERE m.competition_id = $1 ORDER BY m.due_on`,
      [c.id],
    )
  ).rows

  const norm = (s) =>
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
  const porTitulo = new Map(banco.map((b) => [norm(b.title), b]))
  let divergencias = 0
  console.log(`\n${c.name} — ${banco.length} marco(s) no banco\n`)
  for (const r of rows) {
    const dueOn = r.dueOn ?? (/competi/i.test(r.dateHint ?? '') ? c.starts_on : null)
    const b = porTitulo.get(norm(r.title))
    if (!b) {
      divergencias++
      console.log(
        `  + FALTA no banco: "${r.title}" — ${dueOn ?? r.dateHint ?? 'sem data'}` +
          (r.sourceNumber != null ? ` (Informativo ${r.sourceNumber})` : ''),
      )
      continue
    }
    const problemas = []
    if (dueOn && b.due_on !== dueOn) problemas.push(`data ${b.due_on} → fonte diz ${dueOn}`)
    if (r.sourceNumber != null && b.number != null && Number(b.number) !== r.sourceNumber)
      problemas.push(`informativo ${b.number} → fonte diz ${r.sourceNumber}`)
    if (b.status === 'cancelado') problemas.push('cancelado no banco, mas segue na fonte')
    if (problemas.length) {
      divergencias++
      console.log(`  ~ "${b.title}": ${problemas.join('; ')}`)
    } else {
      console.log(`  = "${b.title}" confere (${b.due_on})`)
    }
    porTitulo.delete(norm(r.title))
  }
  for (const b of porTitulo.values()) {
    if (b.status === 'cancelado') continue
    divergencias++
    console.log(`  - SÓ no banco: "${b.title}" (${b.due_on}) — sumiu da fonte?`)
  }
  console.log(
    divergencias
      ? `\n${divergencias} divergência(s). Nada foi alterado — corrija na administração.`
      : '\nSem divergências.',
  )
  process.exit(divergencias ? 1 : 0)
} finally {
  await client.end()
}
