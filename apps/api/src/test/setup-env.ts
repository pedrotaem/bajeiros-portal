// Roda antes de cada arquivo de teste: injeta as URLs do Postgres embutido.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterAll } from 'vitest'
import { closeDb } from '../db'

Object.assign(
  process.env,
  JSON.parse(readFileSync(path.join(process.cwd(), '.dev', 'test-env.json'), 'utf8')),
)

afterAll(async () => {
  await closeDb()
})
