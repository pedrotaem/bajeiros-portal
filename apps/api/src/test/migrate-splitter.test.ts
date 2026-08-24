import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
// runner é .mjs puro — importa só as funções de parsing (sem SDK)
import { extractUpSection, splitSqlStatements } from '../../scripts/migrate-data-api.mjs'

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
