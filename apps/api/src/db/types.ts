// Contrato mínimo que os call sites usam — subconjunto estrutural do pg.PoolClient,
// implementável também pelo driver RDS Data API (fase 11). Manter enxuto: cada método
// novo aqui precisa de equivalente nos DOIS drivers.
export interface DbQueryResult {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rows: any[]
  rowCount: number | null
}

export interface DbClient {
  query(text: string, values?: unknown[]): Promise<DbQueryResult>
}
