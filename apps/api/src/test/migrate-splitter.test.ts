import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
// runner é .mjs puro — importa só as funções de parsing (sem SDK)
import {
  extractUpSection,
  RESUME_BUDGET_MS_DEFAULT,
  resumeDelay,
  splitSqlStatements,
  withResumeRetry,
} from '../../scripts/migrate-data-api.mjs'

describe('extractUpSection', () => {
  it('corta entre Up e Down', () => {
    const sql = '-- Up Migration\nCREATE TABLE a (id int);\n-- Down Migration\nDROP TABLE a;'
    expect(extractUpSection(sql)).not.toContain('DROP TABLE')
    expect(extractUpSection(sql)).toContain('CREATE TABLE a')
  })

  it('sem marcador Up → erro', () => {
    expect(() => extractUpSection('CREATE TABLE a (id int);')).toThrow('Up Migration')
  })
})

describe('splitSqlStatements', () => {
  it('divide por ; de nível superior e descarta comentários', () => {
    const stmts = splitSqlStatements(
      '-- comentário; com ponto e vírgula\nCREATE TABLE a (id int); INSERT INTO a VALUES (1);',
    )
    expect(stmts).toEqual(['CREATE TABLE a (id int)', 'INSERT INTO a VALUES (1)'])
  })

  it('não divide dentro de dollar-quoting (função com ; interno)', () => {
    const stmts = splitSqlStatements(
      `CREATE FUNCTION f() RETURNS trigger LANGUAGE plpgsql AS
       $$ BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
       SELECT 1;`,
    )
    expect(stmts).toHaveLength(2)
    expect(stmts[0]).toContain('RETURN NEW; END $$')
  })

  it('não divide dentro de $tag$ nomeado nem de strings', () => {
    const stmts = splitSqlStatements(
      `DO $body$ BEGIN PERFORM 1; END $body$; INSERT INTO t VALUES ('a;b');`,
    )
    expect(stmts).toHaveLength(2)
    expect(stmts[1]).toBe(`INSERT INTO t VALUES ('a;b')`)
  })

  it('última statement sem ; final também entra', () => {
    expect(splitSqlStatements('SELECT 1')).toEqual(['SELECT 1'])
  })
})

describe('migrações reais do repositório', () => {
  it('todas as *.sql têm seção Up que divide em statements não-vazias e balanceadas', async () => {
    const dir = path.join(process.cwd(), 'migrations')
    const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort()
    expect(files.length).toBeGreaterThanOrEqual(3)
    for (const file of files) {
      const sql = await readFile(path.join(dir, file), 'utf8')
      const stmts = splitSqlStatements(extractUpSection(sql))
      expect(stmts.length, file).toBeGreaterThan(0)
      for (const s of stmts) {
        expect(s.trim(), `${file}: statement vazia`).not.toBe('')
        // dollar-quoting balanceado (split errado deixaria $$ aberto)
        const dollarPairs = (s.match(/\$[A-Za-z_]*\$/g) ?? []).length
        expect(dollarPairs % 2, `${file}: dollar-quote desbalanceado em:\n${s}`).toBe(0)
      }
      // nenhuma statement de Down vazou
      expect(stmts.join('\n')).not.toMatch(/DROP TABLE users/i)
    }
  })
})

// Resume do Aurora a 0 ACU. O deploy do DF-25 falhou aqui: a escada antiga somava
// 20 s e o cluster levou mais de 35 s para acordar. O relógio e o sono são
// injetados, então o teste mede o ORÇAMENTO sem esperar de verdade.
describe('withResumeRetry (resume do Aurora)', () => {
  const resuming = () =>
    Object.assign(new Error('The Aurora DB instance is resuming after being auto-paused.'), {
      name: 'DatabaseResumingException',
    })

  /** Relógio falso que só anda quando o código dorme — é o sono que passa o tempo. */
  function relogio() {
    let t = 0
    return {
      now: () => t,
      sleep: async (ms: number) => {
        t += ms
        dormiu.push(ms)
      },
      dormiu: [] as number[],
    }
  }
  let dormiu: number[] = []

  it('volta a chamar até o cluster acordar, e devolve o resultado', async () => {
    const c = relogio()
    dormiu = c.dormiu
    let n = 0
    const out = await withResumeRetry(
      async () => {
        if (++n < 4) throw resuming()
        return 'ok'
      },
      { now: c.now, sleep: c.sleep, log: () => {}, warn: () => {} },
    )
    expect(out).toBe('ok')
    expect(n).toBe(4)
    expect(c.dormiu).toEqual([2000, 3000, 5000])
  })

  it('aguenta os 35 s que derrubaram o deploy do DF-25', async () => {
    const c = relogio()
    dormiu = c.dormiu
    let n = 0
    const out = await withResumeRetry(
      async () => {
        // acorda em 40 s de relógio — mais que os 20 s da escada antiga
        if (c.now() < 40_000) {
          n++
          throw resuming()
        }
        return 'ok'
      },
      { now: c.now, sleep: c.sleep, log: () => {}, warn: () => {} },
    )
    expect(out).toBe('ok')
    expect(n).toBeGreaterThan(5)
    expect(c.now()).toBeGreaterThanOrEqual(40_000)
  })

  it('desiste quando o orçamento acaba — e não estoura o teto', async () => {
    const c = relogio()
    dormiu = c.dormiu
    await expect(
      withResumeRetry(async () => Promise.reject(resuming()), {
        budgetMs: 30_000,
        now: c.now,
        sleep: c.sleep,
        log: () => {},
        warn: () => {},
      }),
    ).rejects.toThrow(/resuming/i)
    expect(c.now()).toBeLessThanOrEqual(30_000)
  })

  it('erro que NÃO é resume estoura na hora, sem esperar nada', async () => {
    const c = relogio()
    dormiu = c.dormiu
    await expect(
      withResumeRetry(async () => Promise.reject(new Error('syntax error at or near "SELCT"')), {
        now: c.now,
        sleep: c.sleep,
        log: () => {},
        warn: () => {},
      }),
    ).rejects.toThrow('syntax error')
    expect(c.dormiu).toEqual([])
  })

  it('o orçamento default cobre com folga o resume típico de 15 s', () => {
    expect(RESUME_BUDGET_MS_DEFAULT).toBeGreaterThanOrEqual(120_000)
    // a rampa chega ao patamar de 10 s em vez de ficar sondando de 2 em 2 s
    expect([0, 1, 2, 5, 9].map(resumeDelay)).toEqual([2000, 3000, 5000, 10_000, 10_000])
  })
})
