import {
  RDSDataClient,
  BeginTransactionCommand,
  CommitTransactionCommand,
  RollbackTransactionCommand,
  ExecuteStatementCommand,
  type SqlParameter,
  type Field,
  type ColumnMetadata,
} from '@aws-sdk/client-rds-data'
import { env } from '../env'
import type { DbClient, DbQueryResult } from './types'

// Driver RDS Data API (ADR-007): mesma semântica do driver pg — transação por
// request com set_config('app.user_id') — mas via HTTPS, sem pool/VPC.
// Diferenças absorvidas AQUI para os call sites não mudarem:
//  - placeholders $N → :pN (Data API só aceita parâmetros nomeados);
//  - tipos: uuid/json/timestamp precisam de typeHint; volta mapeada por
//    columnMetadata (timestamptz→Date, jsonb→objeto) p/ manter contratos;
//  - queries do MESMO withUser são serializadas (Data API não aceita duas
//    statements concorrentes na mesma transação — Promise.all nos call sites
//    continua funcionando, só roda em série);
//  - retry com backoff no resume do Aurora 0 ACU (DatabaseResumingException).

let client: RDSDataClient | undefined
let resumeRetryDelaysMs = [1000, 2000, 3000, 4000, 5000]

// Testes injetam um client mock e delays curtos; undefined volta ao real.
export function configureDataApi(opts: {
  client?: RDSDataClient
  resumeRetryDelaysMs?: number[]
}): void {
  client = opts.client
  if (opts.resumeRetryDelaysMs) resumeRetryDelaysMs = opts.resumeRetryDelaysMs
}

function getClient(): RDSDataClient {
  client ??= new RDSDataClient({})
  return client
}

function baseInput() {
  return {
    resourceArn: env('DB_CLUSTER_ARN'),
    secretArn: env('DB_SECRET_ARN'),
    database: env('DB_NAME'),
  }
}

// ---------- rewrite $N → :pN ----------

// Tokenizer mínimo: pula strings '…' (escape ''), identificadores "…",
// comentários -- e /* */ (aninhados) e dollar-quoting $tag$…$tag$, para não
// reescrever um "$1" literal dentro deles.
export function rewritePlaceholders(sqlText: string): { sql: string; used: number[] } {
  let out = ''
  const used = new Set<number>()
  let i = 0
  const n = sqlText.length
  while (i < n) {
    const ch = sqlText[i]
    if (ch === "'") {
      let j = i + 1
      while (j < n) {
        if (sqlText[j] === "'") {
          if (sqlText[j + 1] === "'") j += 2
          else break
        } else j++
      }
      out += sqlText.slice(i, j + 1)
      i = j + 1
    } else if (ch === '"') {
      let j = i + 1
      while (j < n && sqlText[j] !== '"') j++
      out += sqlText.slice(i, j + 1)
      i = j + 1
    } else if (ch === '-' && sqlText[i + 1] === '-') {
      let j = i + 2
      while (j < n && sqlText[j] !== '\n') j++
      out += sqlText.slice(i, j)
      i = j
    } else if (ch === '/' && sqlText[i + 1] === '*') {
      let depth = 1
      let j = i + 2
      while (j < n && depth > 0) {
        if (sqlText[j] === '/' && sqlText[j + 1] === '*') {
          depth++
          j += 2
        } else if (sqlText[j] === '*' && sqlText[j + 1] === '/') {
          depth--
          j += 2
        } else j++
      }
      out += sqlText.slice(i, j)
      i = j
    } else if (ch === '$') {
      const digits = /^\$(\d+)/.exec(sqlText.slice(i))
      if (digits) {
        const num = Number(digits[1])
        used.add(num)
        out += `:p${num}`
        i += digits[0].length
        continue
      }
      const tag = /^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/.exec(sqlText.slice(i))
      if (tag) {
        const close = sqlText.indexOf(tag[0], i + tag[0].length)
        const end = close === -1 ? n : close + tag[0].length
        out += sqlText.slice(i, end)
        i = end
      } else {
        out += ch
        i++
      }
    } else {
      out += ch
      i++
    }
  }
  return { sql: out, used: [...used].sort((a, b) => a - b) }
}

// ---------- parâmetros JS → SqlParameter ----------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function toTimestamp(d: Date): string {
  // Data API espera 'YYYY-MM-DD HH:MM:SS.FFF' em UTC (sem 'T'/'Z')
  return d.toISOString().replace('T', ' ').replace('Z', '')
}

export function toSqlParameter(name: string, value: unknown): SqlParameter {
  if (value === null || value === undefined) return { name, value: { isNull: true } }
  if (value instanceof Date)
    return { name, typeHint: 'TIMESTAMP', value: { stringValue: toTimestamp(value) } }
  if (typeof value === 'boolean') return { name, value: { booleanValue: value } }
  if (typeof value === 'number') {
    return Number.isSafeInteger(value)
      ? { name, value: { longValue: value } }
      : { name, value: { doubleValue: value } }
  }
  if (typeof value === 'string') {
    // uuid precisa do hint (sem ele o PG recebe varchar e "uuid = varchar" falha).
    // Coluna text que recebe uuid usa ::text explícito no SQL (audit.resource_id).
    if (UUID_RE.test(value)) return { name, typeHint: 'UUID', value: { stringValue: value } }
    return { name, value: { stringValue: value } }
  }
  // objeto/array → jsonb (cage_json, metadata). Arrays SQL não são usados no app.
  return { name, typeHint: 'JSON', value: { stringValue: JSON.stringify(value) } }
}

function buildParameters(values: unknown[], used: number[]): SqlParameter[] {
  return used.map((numIdx) => {
    if (numIdx > values.length)
      throw new Error(`SQL usa $${numIdx} mas só ${values.length} parâmetro(s) foram passados`)
    return toSqlParameter(`p${numIdx}`, values[numIdx - 1])
  })
}

// ---------- resultado → { rows, rowCount } ----------

function fieldValue(field: Field): unknown {
  if (field.isNull) return null
  if (field.stringValue !== undefined) return field.stringValue
  if (field.longValue !== undefined) return field.longValue
  if (field.doubleValue !== undefined) return field.doubleValue
  if (field.booleanValue !== undefined) return field.booleanValue
  if (field.arrayValue !== undefined) return field.arrayValue
  if (field.blobValue !== undefined) return field.blobValue
  return null
}

function convertByType(value: unknown, typeName: string | undefined): unknown {
  if (value === null) return null
  const t = (typeName ?? '').toLowerCase()
  if ((t === 'timestamptz' || t === 'timestamp') && typeof value === 'string') {
    // Data API devolve 'YYYY-MM-DD HH:MM:SS[.FFF]' em UTC → Date (paridade com pg)
    return new Date(value.replace(' ', 'T') + 'Z')
  }
  if ((t === 'json' || t === 'jsonb') && typeof value === 'string') return JSON.parse(value)
  return value
}

export function mapRecords(
  columns: ColumnMetadata[] | undefined,
  records: Field[][] | undefined,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any[] {
  if (!records) return []
  const cols = columns ?? []
  return records.map((rec) => {
    const row: Record<string, unknown> = {}
    rec.forEach((field, i) => {
      const col = cols[i]
      const name = col?.label ?? col?.name ?? `col${i}`
      row[name] = convertByType(fieldValue(field), col?.typeName)
    })
    return row
  })
}

// ---------- retry no resume (Aurora 0 ACU acorda em ~15s) ----------

function isResuming(err: unknown): boolean {
  const e = err as { name?: string; message?: string }
  return (
    e?.name === 'DatabaseResumingException' || /resum/i.test(e?.message ?? '') // BadRequestException com "…is resuming…"
  )
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function withResumeRetry<T>(fn: () => Promise<T>): Promise<T> {
  let attempt = 0
  for (;;) {
    try {
      return await fn()
    } catch (err) {
      if (!isResuming(err) || attempt >= resumeRetryDelaysMs.length) throw err
      await sleep(resumeRetryDelaysMs[attempt])
      attempt++
    }
  }
}

// ---------- cliente transacional serializado ----------

class DataApiTxClient implements DbClient {
  private tail: Promise<unknown> = Promise.resolve()
  private aborted: unknown

  constructor(private readonly transactionId: string) {}

  query(text: string, values: unknown[] = []): Promise<DbQueryResult> {
    // fila: uma statement por vez na transação (Promise.all vira série)
    const run = this.tail.then(async () => {
      if (this.aborted !== undefined) {
        // lib ES2020 não tem ErrorOptions.cause — anexado à mão
        const skipped = new Error('query pulada: transação abortada por erro anterior')
        ;(skipped as Error & { cause?: unknown }).cause = this.aborted
        throw skipped
      }
      try {
        return await this.exec(text, values)
      } catch (err) {
        this.aborted ??= err
        throw err
      }
    })
    this.tail = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  // aguarda a fila esvaziar sem propagar erro (o erro original já foi lançado ao caller)
  idle(): Promise<unknown> {
    return this.tail
  }

  private async exec(text: string, values: unknown[]): Promise<DbQueryResult> {
    const { sql, used } = rewritePlaceholders(text)
    const result = await getClient().send(
      new ExecuteStatementCommand({
        ...baseInput(),
        transactionId: this.transactionId,
        sql,
        parameters: buildParameters(values, used),
        includeResultMetadata: true,
      }),
    )
    const rows = mapRecords(result.columnMetadata, result.records)
    return {
      rows,
      rowCount: result.records ? rows.length : (result.numberOfRecordsUpdated ?? 0),
    }
  }
}

// ---------- API pública (mesma assinatura do driver pg) ----------

export async function withUser<T>(
  userId: string,
  fn: (client: DbClient) => Promise<T>,
): Promise<T> {
  const { transactionId } = await withResumeRetry(() =>
    getClient().send(new BeginTransactionCommand(baseInput())),
  )
  if (!transactionId) throw new Error('BeginTransaction não devolveu transactionId')
  const tx = new DataApiTxClient(transactionId)
  try {
    // set_config espera text; o hint UUID exige o cast explícito
    await tx.query("SELECT set_config('app.user_id', $1::text, true)", [userId])
    const result = await fn(tx)
    await tx.idle()
    await getClient().send(new CommitTransactionCommand({ ...baseInput(), transactionId }))
    return result
  } catch (err) {
    await tx.idle()
    try {
      await getClient().send(new RollbackTransactionCommand({ ...baseInput(), transactionId }))
    } catch (rollbackErr) {
      // rollback falho não pode mascarar o erro original
      console.error(
        JSON.stringify({
          level: 'error',
          msg: 'rollback Data API falhou',
          err: (rollbackErr as Error).message,
        }),
      )
    }
    throw err
  }
}

export async function closeDb() {
  client?.destroy()
  client = undefined
}
