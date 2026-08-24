// Postgres portátil de desenvolvimento (sem Docker): npm run db:start
// Dados persistem em apps/api/.dev/pgdata. Ctrl+C para parar.
import EmbeddedPostgres from 'embedded-postgres'
import { runner } from 'node-pg-migrate'
import { existsSync } from 'node:fs'
import path from 'node:path'

const dataDir = path.join(process.cwd(), '.dev', 'pgdata')
const port = 5433
const adminUrl = `postgres://postgres:postgres@localhost:${port}/bajeiros`

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'postgres',
  password: 'postgres',
  port,
  persistent: true,
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
})

if (!existsSync(dataDir)) await pg.initialise()
await pg.start()
try {
  await pg.createDatabase('bajeiros')
} catch {
  /* já existe */
}
await runner({
  databaseUrl: adminUrl,
  dir: 'migrations',
  direction: 'up',
  migrationsTable: 'pgmigrations',
})

console.log(`\nPostgres dev pronto:`)
console.log(`  admin: ${adminUrl}`)
console.log(`  app:   postgres://bajeiros_app:bajeiros_app@localhost:${port}/bajeiros`)
console.log(`\nCtrl+C para parar.`)

const stop = async () => {
  await pg.stop()
  process.exit(0)
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
