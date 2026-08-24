import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { RDSDataClient } from '@aws-sdk/client-rds-data'
import {
  configureDataApi,
  rewritePlaceholders,
  toSqlParameter,
  mapRecords,
  withUser,
} from '../db/data-api'

// ---------- mock do SDK ----------

interface SentCommand {
  kind: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: any
}

function makeMock(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  respond: (kind: string, input: any, calls: SentCommand[]) => Promise<any> | any,
) {
  const calls: SentCommand[] = []
  const client = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    send(cmd: any) {
      const kind = cmd.constructor.name
      calls.push({ kind, input: cmd.input })
      return Promise.resolve(respond(kind, cmd.input, calls))
    },
    destroy() {},
  }
  return { calls, client: client as unknown as RDSDataClient }
}

const okResponses = (kind: string) => {
  if (kind === 'BeginTransactionCommand') return { transactionId: 'tx-1' }
  return { records: [], columnMetadata: [] }
}

beforeEach(() => configureDataApi({ resumeRetryDelaysMs: [1, 1, 1] }))
afterEach(() => configureDataApi({ client: undefined }))

// ---------- rewrite $N → :pN ----------

describe('rewritePlaceholders', () => {
  it('reescreve params e preserva casts', () => {
    const r = rewritePlaceholders('SELECT * FROM users WHERE id = $1::uuid AND email = $2')
    expect(r.sql).toBe('SELECT * FROM users WHERE id = :p1::uuid AND email = :p2')
    expect(r.used).toEqual([1, 2])
  })

  it('não toca "$1" dentro de string literal (nem escape \'\')', () => {
    const r = rewritePlaceholders(`SELECT 'preço $1 isn''t $2' AS x, $3`)
    expect(r.sql).toBe(`SELECT 'preço $1 isn''t $2' AS x, :p3`)
    expect(r.used).toEqual([3])
  })

  it('não toca comentários nem identificadores entre aspas', () => {
    const r = rewritePlaceholders('SELECT "col$1" FROM t -- filtro $2\nWHERE a = $3 /* $4 */')
    expect(r.sql).toBe('SELECT "col$1" FROM t -- filtro $2\nWHERE a = :p3 /* $4 */')
    expect(r.used).toEqual([3])
  })

  it('não toca dollar-quoting', () => {
    const r = rewritePlaceholders('SELECT $fn$ corpo com $1 $fn$, $2')
    expect(r.sql).toBe('SELECT $fn$ corpo com $1 $fn$, :p2')
  })

  it('make_interval com argumento nomeado', () => {
    const r = rewritePlaceholders('SELECT now() + make_interval(days => $4)')
    expect(r.sql).toBe('SELECT now() + make_interval(days => :p4)')
    expect(r.used).toEqual([4])
  })
})

// ---------- typeHints ----------

describe('toSqlParameter', () => {
  it('null e undefined viram isNull', () => {
    expect(toSqlParameter('p1', null)).toEqual({ name: 'p1', value: { isNull: true } })
    expect(toSqlParameter('p1', undefined)).toEqual({ name: 'p1', value: { isNull: true } })
  })

  it('Date vira TIMESTAMP UTC sem T/Z', () => {
    const p = toSqlParameter('p1', new Date('2026-08-24T12:34:56.789Z'))
    expect(p).toEqual({
      name: 'p1',
      typeHint: 'TIMESTAMP',
      value: { stringValue: '2026-08-24 12:34:56.789' },
    })
  })

  it('uuid string ganha hint UUID; string comum não', () => {
    const uuid = '4fe4353a-9e72-4a31-bd8c-0a1b2c3d4e5f'
    expect(toSqlParameter('p1', uuid)).toEqual({
      name: 'p1',
      typeHint: 'UUID',
      value: { stringValue: uuid },
    })
    expect(toSqlParameter('p1', 'texto qualquer')).toEqual({
      name: 'p1',
      value: { stringValue: 'texto qualquer' },
    })
  })

  it('números: int → longValue, float → doubleValue; boolean → booleanValue', () => {
    expect(toSqlParameter('p1', 42)).toEqual({ name: 'p1', value: { longValue: 42 } })
    expect(toSqlParameter('p1', 1.5)).toEqual({ name: 'p1', value: { doubleValue: 1.5 } })
    expect(toSqlParameter('p1', true)).toEqual({ name: 'p1', value: { booleanValue: true } })
  })

  it('objeto/array viram JSON stringificado com hint', () => {
    expect(toSqlParameter('p1', { a: 1 })).toEqual({
      name: 'p1',
      typeHint: 'JSON',
      value: { stringValue: '{"a":1}' },
    })
    expect(toSqlParameter('p1', [1, 2])).toEqual({
      name: 'p1',
      typeHint: 'JSON',
      value: { stringValue: '[1,2]' },
    })
  })
})

// ---------- mapeamento de volta ----------

describe('mapRecords', () => {
  it('converte por typeName: timestamptz→Date, jsonb→objeto, nativos intactos', () => {
    const rows = mapRecords(
      [
        { name: 'created_at', typeName: 'timestamptz' },
        { name: 'cage_json', typeName: 'jsonb' },
        { name: 'n', typeName: 'int4' },
        { name: 'ok', typeName: 'bool' },
        { name: 'email', typeName: 'text' },
      ],
      [
        [
          { stringValue: '2026-08-24 12:00:00.5' },
          { stringValue: '{"tubos":[1,2]}' },
          { longValue: 7 },
          { booleanValue: false },
          { isNull: true },
        ],
      ],
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].created_at).toBeInstanceOf(Date)
    expect((rows[0].created_at as Date).toISOString()).toBe('2026-08-24T12:00:00.500Z')
    expect(rows[0].cage_json).toEqual({ tubos: [1, 2] })
    expect(rows[0].n).toBe(7)
    expect(rows[0].ok).toBe(false)
    expect(rows[0].email).toBeNull()
  })

  it('usa label quando presente (aliases de SELECT)', () => {
    const rows = mapRecords([{ name: 'count', label: 'n', typeName: 'int4' }], [[{ longValue: 3 }]])
    expect(rows[0]).toEqual({ n: 3 })
  })
})

// ---------- withUser: transação, serialização, rollback, retry ----------

const SUB = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'

describe('withUser (data-api)', () => {
  it('Begin → set_config(::text, hint UUID) → query → Commit, na ordem', async () => {
    const { calls, client } = makeMock(okResponses)
    configureDataApi({ client })
    await withUser(SUB, async (db) => {
      await db.query('SELECT * FROM users WHERE id = $1', [SUB])
    })
    expect(calls.map((c) => c.kind)).toEqual([
      'BeginTransactionCommand',
      'ExecuteStatementCommand',
      'ExecuteStatementCommand',
      'CommitTransactionCommand',
    ])
    const setConfig = calls[1].input
    expect(setConfig.sql).toBe("SELECT set_config('app.user_id', :p1::text, true)")
    expect(setConfig.parameters).toEqual([
      { name: 'p1', typeHint: 'UUID', value: { stringValue: SUB } },
    ])
    expect(setConfig.transactionId).toBe('tx-1')
    expect(calls[2].input.sql).toBe('SELECT * FROM users WHERE id = :p1')
    expect(calls[3].input.transactionId).toBe('tx-1')
  })

  it('Promise.all no mesmo client roda em série (sem overlap)', async () => {
    let inFlight = 0
    let maxInFlight = 0
    const order: string[] = []
    const { client } = makeMock(async (kind, input) => {
      if (kind !== 'ExecuteStatementCommand') return okResponses(kind)
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((r) => setTimeout(r, 5))
      order.push(input.sql)
      inFlight--
      return { records: [], columnMetadata: [] }
    })
    configureDataApi({ client })
    await withUser(SUB, async (db) => {
      await Promise.all([
        db.query('SELECT 1', []),
        db.query('SELECT 2', []),
        db.query('SELECT 3', []),
      ])
    })
    expect(maxInFlight).toBe(1)
    // set_config primeiro, depois as 3 na ordem de submissão
    expect(order).toEqual([
      "SELECT set_config('app.user_id', :p1::text, true)",
      'SELECT 1',
      'SELECT 2',
      'SELECT 3',
    ])
  })

  it('erro na query → Rollback e o erro ORIGINAL propaga (mesmo com rollback falhando)', async () => {
    const original = new Error('duplicate key value violates unique constraint "users_email_key"')
    const { calls, client } = makeMock((kind, input) => {
      if (kind === 'RollbackTransactionCommand') throw new Error('rollback quebrou')
      if (kind === 'ExecuteStatementCommand' && input.sql.includes('INSERT')) throw original
      return okResponses(kind)
    })
    configureDataApi({ client })
    await expect(
      withUser(SUB, async (db) => {
        await db.query('INSERT INTO users (id) VALUES ($1)', [SUB])
      }),
    ).rejects.toBe(original)
    expect(calls.some((c) => c.kind === 'RollbackTransactionCommand')).toBe(true)
    expect(calls.some((c) => c.kind === 'CommitTransactionCommand')).toBe(false)
  })

  it('após um erro, queries enfileiradas não executam no banco', async () => {
    const executed: string[] = []
    const { client } = makeMock((kind, input) => {
      if (kind === 'ExecuteStatementCommand') {
        if (input.sql === 'SELECT boom') throw new Error('boom')
        executed.push(input.sql)
      }
      return okResponses(kind)
    })
    configureDataApi({ client })
    await expect(
      withUser(SUB, async (db) => {
        await Promise.all([db.query('SELECT boom', []), db.query('SELECT depois', [])])
      }),
    ).rejects.toThrow('boom')
    expect(executed).not.toContain('SELECT depois')
  })

  it('retry no DatabaseResumingException do Begin (Aurora 0 ACU acordando)', async () => {
    let failures = 0
    const { client } = makeMock((kind) => {
      if (kind === 'BeginTransactionCommand' && failures < 2) {
        failures++
        const err = new Error('Aurora DB instance is resuming')
        err.name = 'DatabaseResumingException'
        throw err
      }
      return okResponses(kind)
    })
    configureDataApi({ client })
    const result = await withUser(SUB, async () => 'ok')
    expect(result).toBe('ok')
    expect(failures).toBe(2)
  })

  it('rowCount: SELECT usa records.length; UPDATE sem records usa numberOfRecordsUpdated', async () => {
    const { client } = makeMock((kind, input) => {
      if (kind !== 'ExecuteStatementCommand') return okResponses(kind)
      if (input.sql.startsWith('UPDATE')) return { numberOfRecordsUpdated: 1 }
      return {
        records: [[{ stringValue: 'x' }], [{ stringValue: 'y' }]],
        columnMetadata: [{ name: 'id', typeName: 'text' }],
      }
    })
    configureDataApi({ client })
    await withUser(SUB, async (db) => {
      const sel = await db.query('SELECT id FROM t', [])
      expect(sel.rowCount).toBe(2)
      expect(sel.rows).toEqual([{ id: 'x' }, { id: 'y' }])
      const upd = await db.query('UPDATE t SET a = 1', [])
      expect(upd.rowCount).toBe(1)
      expect(upd.rows).toEqual([])
    })
  })

  it('placeholder além dos params passados → erro claro', async () => {
    const { client } = makeMock(okResponses)
    configureDataApi({ client })
    await expect(
      withUser(SUB, async (db) => {
        await db.query('SELECT $1, $2', ['só um'])
      }),
    ).rejects.toThrow('SQL usa $2')
  })
})
