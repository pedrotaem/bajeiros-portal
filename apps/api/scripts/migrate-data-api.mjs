// Runner de migração via RDS Data API (fase 11).
// node-pg-migrate NÃO fala Data API — este runner reproduz o essencial:
// lê migrations/*.sql (seção "-- Up Migration"), roda 1 transação por migração
// e mantém a tabela pgmigrations compatível com o runner local.
// Executa com o secret MASTER (DDL); o runtime usa o secret do APP
// (bajeiros_app, NOBYPASSRLS) — por isso o pós-passo realinha a senha do role,
// que a migração 0001 cria com senha fraca hardcoded.
//
// Env: DB_CLUSTER_ARN, DB_MASTER_SECRET_ARN, DB_APP_SECRET_ARN, DB_NAME (default bajeiros),
//      AWS_REGION (default sa-east-1). Uso: node migrate-data-api.mjs [--dir <migrations>]

import { readdir, readFile } from 'node:fs/promises'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// ---------- parsing (exportado p/ testes) ----------

export function extractUpSection(sql) {
  const up = sql.indexOf('-- Up Migration')
  if (up === -1) throw new Error('migração sem marcador "-- Up Migration"')
  const down = sql.indexOf('-- Down Migration', up)
  return sql.slice(up, down === -1 ? sql.length : down)
}

// Divide em statements por ';' de nível superior — ciente de strings '…' (escape ''),
// identificadores "…", comentários -- e /* */ (aninhados) e dollar-quoting $tag$…$tag$
// (funções/DO blocks têm ';' internos que NÃO separam statements).
export function splitSqlStatements(sql) {
  const statements = []
  let current = ''
  let i = 0
  const n = sql.length
  while (i < n) {
    const ch = sql[i]
    if (ch === "'") {
      let j = i + 1
      while (j < n) {
        if (sql[j] === "'") {
          if (sql[j + 1] === "'") j += 2
          else break
        } else j++
      }
      current += sql.slice(i, j + 1)
      i = j + 1
    } else if (ch === '"') {
      let j = i + 1
      while (j < n && sql[j] !== '"') j++
      current += sql.slice(i, j + 1)
      i = j + 1
    } else if (ch === '-' && sql[i + 1] === '-') {
      let j = i + 2
      while (j < n && sql[j] !== '\n') j++
      i = j // comentário de linha descartado (Data API não precisa dele)
    } else if (ch === '/' && sql[i + 1] === '*') {
      let depth = 1
      let j = i + 2
      while (j < n && depth > 0) {
        if (sql[j] === '/' && sql[j + 1] === '*') {
          depth++
          j += 2
        } else if (sql[j] === '*' && sql[j + 1] === '/') {
          depth--
          j += 2
        } else j++
      }
      i = j
    } else if (ch === '$') {
      const tag = /^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/.exec(sql.slice(i))
      if (tag) {
        const close = sql.indexOf(tag[0], i + tag[0].length)
        const end = close === -1 ? n : close + tag[0].length
        current += sql.slice(i, end)
        i = end
      } else {
        current += ch
        i++
      }
    } else if (ch === ';') {
      const stmt = current.trim()
      if (stmt) statements.push(stmt)
      current = ''
      i++
    } else {
      current += ch
      i++
    }
  }
  const last = current.trim()
  if (last) statements.push(last)
  return statements
}

// ---------- execução ----------

async function main() {
  // imports dinâmicos: os testes do splitter não puxam o SDK
  const {
    RDSDataClient,
    ExecuteStatementCommand,
    BeginTransactionCommand,
    CommitTransactionCommand,
    RollbackTransactionCommand,
  } = await import('@aws-sdk/client-rds-data')
  const { SecretsManagerClient, GetSecretValueCommand } =
    await import('@aws-sdk/client-secrets-manager')

  const region = process.env.AWS_REGION || 'sa-east-1'
  const resourceArn = required('DB_CLUSTER_ARN')
  const masterSecretArn = required('DB_MASTER_SECRET_ARN')
  const appSecretArn = required('DB_APP_SECRET_ARN')
  const database = process.env.DB_NAME || 'bajeiros'

  const dirFlag = process.argv.indexOf('--dir')
  const migrationsDir =
    dirFlag !== -1
      ? process.argv[dirFlag + 1]
      : join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations')

  const rds = new RDSDataClient({ region })
  const base = { resourceArn, secretArn: masterSecretArn, database }

  const exec = (sql, transactionId) =>
    rds.send(
      new ExecuteStatementCommand({ ...base, sql, transactionId, includeResultMetadata: true }),
    )

  // retry no resume do Aurora 0 ACU (~15s)
  async function withResumeRetry(fn) {
    const delays = [2000, 3000, 5000, 5000, 5000]
    for (let attempt = 0; ; attempt++) {
      try {
        return await fn()
      } catch (err) {
        const resuming =
          err?.name === 'DatabaseResumingException' || /resum/i.test(err?.message ?? '')
        if (!resuming || attempt >= delays.length) throw err
        console.log(`aurora acordando… retry em ${delays[attempt]}ms`)
        await new Promise((r) => setTimeout(r, delays[attempt]))
      }
    }
  }

  // tabela de controle compatível com node-pg-migrate
  await withResumeRetry(() =>
    exec(
      'CREATE TABLE IF NOT EXISTS pgmigrations (id serial PRIMARY KEY, name varchar(255) NOT NULL, run_on timestamp NOT NULL)',
    ),
  )
  const done = await exec('SELECT name FROM pgmigrations ORDER BY id')
  const applied = new Set((done.records ?? []).map((r) => r[0].stringValue))

  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort()
  for (const file of files) {
    const name = basename(file, '.sql') // node-pg-migrate guarda sem extensão
    if (applied.has(name)) {
      console.log(`= ${name} (já aplicada)`)
      continue
    }
    const sql = await readFile(join(migrationsDir, file), 'utf8')
    const statements = splitSqlStatements(extractUpSection(sql))
    console.log(`> ${name}: ${statements.length} statements`)
    const { transactionId } = await rds.send(new BeginTransactionCommand(base))
    try {
      for (const stmt of statements) await exec(stmt, transactionId)
      await exec(
        `INSERT INTO pgmigrations (name, run_on) VALUES ('${name.replaceAll("'", "''")}', now())`,
        transactionId,
      )
      await rds.send(new CommitTransactionCommand({ ...base, transactionId }))
      console.log(`✓ ${name}`)
    } catch (err) {
      try {
        await rds.send(new RollbackTransactionCommand({ ...base, transactionId }))
      } catch (rollbackErr) {
        console.error(`rollback falhou: ${rollbackErr.message}`)
      }
      throw new Error(`migração ${name} falhou: ${err.message}`, { cause: err })
    }
  }

  // pós-passo idempotente: senha real do role da aplicação (secret do app)
  const sm = new SecretsManagerClient({ region })
  const secret = await sm.send(new GetSecretValueCommand({ SecretId: appSecretArn }))
  const { username, password } = JSON.parse(secret.SecretString)
  if (username !== 'bajeiros_app')
    throw new Error(`secret do app com username inesperado: ${username}`)
  await exec(`ALTER ROLE bajeiros_app WITH PASSWORD '${password.replaceAll("'", "''")}'`)
  console.log('✓ senha do role bajeiros_app alinhada ao secret do app')
}

function required(key) {
  const v = process.env[key]
  if (!v) throw new Error(`variável ${key} obrigatória`)
  return v
}

// só executa quando chamado como script (testes importam as funções puras)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
