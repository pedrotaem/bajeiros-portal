import type { DbClient } from './types'

// Data API limita a resposta a 1 MB — listas potencialmente grandes (snapshots
// com cage_json) são paginadas DENTRO da mesma transação (visão consistente).
// Funciona igual no driver pg. O sql recebido deve ter ORDER BY estável e não
// pode já conter LIMIT/OFFSET.
export async function fetchAllPaged(
  db: DbClient,
  sql: string,
  params: unknown[],
  pageSize = 20,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = []
  const limitIdx = params.length + 1
  for (let offset = 0; ; offset += pageSize) {
    const page = await db.query(`${sql} LIMIT $${limitIdx} OFFSET $${limitIdx + 1}`, [
      ...params,
      pageSize,
      offset,
    ])
    rows.push(...page.rows)
    if (page.rows.length < pageSize) return rows
  }
}
