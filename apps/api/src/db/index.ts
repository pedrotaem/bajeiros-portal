import { env } from '../env'
import * as pgDriver from './pg'
import * as dataApiDriver from './data-api'
import type { DbClient } from './types'

export type { DbClient, DbQueryResult } from './types'
export { fetchAllPaged } from './paginate'

// DB_MODE decide o driver em runtime (não no load — testes trocam env):
// 'pg' (default, dev/test/local) | 'data-api' (Lambda, fase 11).
function driver() {
  return env('DB_MODE') === 'data-api' ? dataApiDriver : pgDriver
}

export function withUser<T>(userId: string, fn: (client: DbClient) => Promise<T>): Promise<T> {
  return driver().withUser(userId, fn)
}

export async function closeDb() {
  await driver().closeDb()
}

/**
 * DF-33 — leitura PÚBLICA: transação sem `app.user_id` (a string vazia vira NULL em
 * `app_user_id()`). Só as tabelas com policy `USING (true)` respondem; qualquer outra
 * devolve zero linhas, o que é exatamente a garantia que se quer numa rota sem auth.
 * Não existe `withPublic` de escrita, e não deve existir.
 */
export function withPublic<T>(fn: (client: DbClient) => Promise<T>): Promise<T> {
  return driver().withUser('', fn)
}
