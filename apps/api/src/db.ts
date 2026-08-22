import pg from 'pg'
import { env } from './env'

// Pool da APLICAÇÃO: role bajeiros_app (LOGIN, sem BYPASSRLS) — RLS sempre ativa.
// Migrações usam DATABASE_URL (owner) via node-pg-migrate, nunca este pool.
let pool: pg.Pool | undefined

function getPool(): pg.Pool {
  pool ??= new pg.Pool({ connectionString: env('APP_DATABASE_URL'), max: 5 })
  return pool
}

// Toda query de request roda dentro de transação com o tenant fixado por
// SET LOCAL (via set_config(..., true)) — C9 da revisão v2.
export async function withUser<T>(
  userId: string,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect()
  try {
    await client.query('BEGIN')
    await client.query("SELECT set_config('app.user_id', $1, true)", [userId])
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

export async function closeDb() {
  await pool?.end()
  pool = undefined
}
