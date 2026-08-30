#!/usr/bin/env node
// Guarda de hex (fase 0, passo 0.3). Varre apps/web/src atrás de cor literal fora
// dos arquivos de token e falha listando arquivo:linha.
//
// A LISTA DE EXCEÇÕES é o placar do redesign: começa com os arquivos ainda não
// migrados e cada fase remove as suas linhas. **Lista vazia = redesenho terminado.**
// O contador só pode CAIR — `--baseline` reescreve os números depois de uma migração,
// e o diff do PR mostra a queda.

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const scanDir = path.join(root, 'apps', 'web', 'src')
const baselineFile = path.join(root, 'scripts', 'token-baseline.json')

/**
 * Únicos arquivos que podem conter hex:
 *  - os dois de token, que são a fonte de verdade;
 *  - `tokens.test.ts`, que TESTA esta guarda e precisa das quatro formas válidas
 *    como fixture. Isenção explícita, não brecha: é o arquivo que prova que a regex
 *    não é frouxa.
 */
const ALLOWED = ['tokens.ts', 'tokens.css', 'tokens.test.ts']

const HEX = /#[0-9a-fA-F]{3,8}\b/g
// formas VÁLIDAS de cor hex, contando o `#`: #RGB, #RGBA, #RRGGBB, #RRGGBBAA.
// 6 e 8 caracteres não são cor (`#abcde`, `#abcdefg`) e passariam como falso positivo.
const HEX_LENGTHS = new Set([4, 5, 7, 9])

/**
 * Comentário NÃO é isenção: design-system §1.3 diz "nenhum hex fora de tokens.css",
 * e abrir exceção para comentário seria exatamente a regex frouxa que o plano avisa
 * para não escrever (risco da fase 0).
 */
export function findHexes(text) {
  const out = []
  text.split('\n').forEach((line, i) => {
    for (const m of line.matchAll(HEX)) {
      if (!HEX_LENGTHS.has(m[0].length)) continue
      out.push({ line: i + 1, hex: m[0] })
    }
  })
  return out
}

function walk(dir) {
  const files = []
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) files.push(...walk(full))
    else if (/\.(css|tsx?|mts)$/.test(entry)) files.push(full)
  }
  return files
}

export function scan() {
  const baseline = JSON.parse(readFileSync(baselineFile, 'utf8'))
  const found = {}
  const violations = []
  for (const file of walk(scanDir)) {
    if (ALLOWED.includes(path.basename(file))) continue
    const rel = path.relative(root, file).replace(/\\/g, '/')
    const hits = findHexes(readFileSync(file, 'utf8'))
    if (!hits.length) continue
    found[rel] = hits.length
    const allowed = baseline.exceptions[rel] ?? 0
    if (hits.length > allowed) {
      violations.push(
        `${rel}: ${hits.length} hex (permitido ${allowed}) — ` +
          hits
            .slice(0, 6)
            .map((h) => `L${h.line} ${h.hex}`)
            .join(', '),
      )
    }
  }
  const total = Object.values(found).reduce((a, b) => a + b, 0)
  return { baseline, found, violations, total }
}

// só roda como CLI; importado pelo teste da própria guarda, não executa nada
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { baseline, found, violations, total } = scan()

  if (process.argv.includes('--baseline')) {
    writeFileSync(
      baselineFile,
      JSON.stringify({ total, exceptions: found }, null, 2) + '\n',
      'utf8',
    )
    console.log(`✓ baseline reescrita: ${total} hex em ${Object.keys(found).length} arquivo(s)`)
    process.exit(0)
  }
  if (violations.length) {
    console.error('✖ hex fora de tokens.ts/tokens.css acima do permitido:')
    for (const v of violations) console.error(`  - ${v}`)
    console.error('\nUse um token de apps/web/src/tokens.ts. Se a migração REMOVEU hex,')
    console.error('rode `node scripts/check-tokens.mjs --baseline` para baixar a catraca.')
    process.exit(1)
  }
  if (total > baseline.total) {
    console.error(`✖ catraca de hex subiu: ${total} > ${baseline.total}. Ela só pode cair.`)
    process.exit(1)
  }
  const restam = Object.keys(found).length
  console.log(
    restam === 0
      ? '✓ zero hex fora dos tokens — redesenho concluído'
      : `✓ ${total} hex restantes em ${restam} arquivo(s) (teto ${baseline.total})`,
  )
}
