// Sobe um Postgres embutido efêmero + migrações antes da suíte; derruba no fim.
import EmbeddedPostgres from 'embedded-postgres'
import { runner } from 'node-pg-migrate'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const PORT = 5434

export default async function globalSetup() {
  const dataDir = path.join(process.cwd(), '.dev', 'test-pgdata')
  rmSync(dataDir, { recursive: true, force: true })
  mkdirSync(path.dirname(dataDir), { recursive: true })

  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: 'postgres',
    password: 'postgres',
    port: PORT,
    persistent: false,
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
  })
  await pg.initialise()
  await pg.start()
  await pg.createDatabase('bajeiros')

  const adminUrl = `postgres://postgres:postgres@localhost:${PORT}/bajeiros`
  await runner({
    databaseUrl: adminUrl,
    dir: 'migrations',
    direction: 'up',
    migrationsTable: 'pgmigrations',
    log: () => {},
  })

  writeFileSync(
    path.join(process.cwd(), '.dev', 'test-env.json'),
    JSON.stringify({
      DATABASE_URL: adminUrl,
      APP_DATABASE_URL: `postgres://bajeiros_app:bajeiros_app@localhost:${PORT}/bajeiros`,
      AUTH_MODE: 'dev',
    }),
  )

  return async () => {
    await pg.stop()
  }
}
