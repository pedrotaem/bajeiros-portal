import { describe, expect, it } from 'vitest'
import { DATASHEET_VERSION } from './catalog'
import { exportCsv, exportMarkdown, type ExportInput } from './export'

const base: ExportInput = {
  projectName: 'Canindé 2026',
  catalogVersion: DATASHEET_VERSION,
  values: [
    { fieldId: 'dim.massa-gaiola', kind: 'design', value: 30 },
    { fieldId: 'dim.massa-gaiola', kind: 'measured', value: 31.8 },
    { fieldId: 'id.tracao', kind: 'design', value: 'traseira' },
    { fieldId: 'freio.travamento', kind: 'design', value: true },
  ],
  suggestions: [{ fieldId: 'dim.massa-gaiola', value: 26.4, origin: 'modelo 3D · v14' }],
}

describe('exportação da ficha (DF-21 RF-6.1)', () => {
  // AC-DF21.14
  it('Markdown traz seções, unidades e as três colunas', () => {
    const md = exportMarkdown(base)
    expect(md).toContain('# Ficha do protótipo — Canindé 2026')
    expect(md).toContain('## Dimensões e massa')
    expect(md).toContain('| Campo | Unidade | Sugerido | Projetado | Medido |')
    expect(md).toContain('| Massa da gaiola | kg | 26,4 | 30 | 31,8 |')
    // enum e booleano saem com o rótulo humano, não com a chave
    expect(md).toContain('| Tração |  | — | traseira | — |')
    expect(md).toMatch(/Travamento simultâneo das quatro rodas \|\s*\|\s*—\s*\|\s*sim\s*\|/)
  })

  it('CSV traz as mesmas colunas, com escape', () => {
    const csv = exportCsv(base)
    expect(csv.split('\n')[0]).toBe('secao,campo,unidade,sugerido,projetado,medido')
    expect(csv).toContain('Dimensões e massa,Massa da gaiola,kg,"26,4",30,"31,8"')
  })

  it('sem gaiola salva não existe coluna de sugerido — nem no arquivo', () => {
    const md = exportMarkdown({ ...base, suggestions: [] })
    expect(md).toContain('| Campo | Unidade | Projetado | Medido |')
    expect(md).not.toContain('Sugerido')
  })

  it('sem nenhum valor medido não existe coluna de medido', () => {
    const md = exportMarkdown({
      ...base,
      values: base.values.filter((v) => v.kind !== 'measured'),
    })
    expect(md).toContain('| Campo | Unidade | Sugerido | Projetado |')
    expect(md).not.toContain('| Medido')
  })

  it('seção dispensada aparece marcada, com o motivo — nunca escondida', () => {
    const md = exportMarkdown({
      ...base,
      waivers: [{ sectionId: 'ergonomia', reason: 'sem aquisição de dados nesta temporada' }],
    })
    expect(md).toContain('## Ergonomia e testes — não se aplica')
    expect(md).toContain('Motivo: sem aquisição de dados nesta temporada')
    expect(exportCsv({ ...base, waivers: [{ sectionId: 'ergonomia' }] })).not.toContain(
      'Horas de shakedown',
    )
  })

  it('o cabeçalho declara catálogo e progresso', () => {
    expect(exportMarkdown(base)).toContain(`Catálogo v${DATASHEET_VERSION}`)
    expect(exportMarkdown(base)).toMatch(/ficha \d+% \(\d+ de \d+ campos\)/)
  })
})
