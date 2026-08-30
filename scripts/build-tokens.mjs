#!/usr/bin/env node
// Gera apps/web/src/tokens.css a partir de apps/web/src/tokens.ts (fase 0, passo 0.2).
// O CSS é COMMITADO; `apps/web/src/tokens.test.ts` falha se o arquivo no repo divergir
// do módulo TS. As duas fontes (regra CSS e material do three.js) nunca saem de
// sincronia sem que o CI grite.
//
//   npm run tokens:build              gera
//   npm run tokens:build -- --check   só verifica (CI); sai 1 se divergir

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
export const SOURCE = path.join(root, 'apps', 'web', 'src', 'tokens.ts')
export const TARGET = path.join(root, 'apps', 'web', 'src', 'tokens.css')

/**
 * Carrega o módulo TS sem compilador: `tokens.ts` só contém objetos literais com
 * `as const` e `export type` (regra escrita no próprio arquivo), então remover essas
 * duas construções deixa JS válido. Evita puxar tsx/esbuild para um script de 60 linhas.
 */
export async function loadTokens() {
  const ts = readFileSync(SOURCE, 'utf8')
  const js = ts.replace(/\bas const\b/g, '').replace(/^export type .*$/gm, '')
  return await import('data:text/javascript;base64,' + Buffer.from(js, 'utf8').toString('base64'))
}

function block(selector, entries, prefix = '', indent = '') {
  const lines = Object.entries(entries).map(([k, v]) => `${indent}  --bj-${prefix}${k}: ${v};`)
  return `${indent}${selector} {\n${lines.join('\n')}\n${indent}}`
}

export function buildCss(t) {
  return [
    '/* GERADO por scripts/build-tokens.mjs a partir de apps/web/src/tokens.ts.',
    ' * NÃO EDITE À MÃO: `npm run tokens:build` reescreve, e o teste de paridade',
    ' * (apps/web/src/tokens.test.ts) falha se este arquivo divergir do módulo TS. */',
    '',
    block(':root', { 'color-scheme': 'dark', ...t.dark, ...t.shared }),
    '',
    '/* cena 3D — sem variante clara (design-system §9.1) */',
    block(':root', t.viewport3d, '3d-'),
    '',
    block(":root[data-theme='light']", { 'color-scheme': 'light', ...t.light }),
    '',
    '@media (prefers-color-scheme: light) {',
    block(":root:not([data-theme='dark'])", { 'color-scheme': 'light', ...t.light }, '', '  '),
    '}',
    '',
    block("[data-density='compact']", t.density.compact),
    '',
    block("[data-density='comfortable']", t.density.comfortable),
    '',
    block("[data-scale='presentation']", t.presentation),
    '',
  ].join('\n')
}

// só roda como CLI; importado pelo teste de paridade, não executa nada
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const css = buildCss(await loadTokens())
  if (process.argv.includes('--check')) {
    if (readFileSync(TARGET, 'utf8') !== css) {
      console.error('✖ tokens.css fora de sincronia com tokens.ts. Rode: npm run tokens:build')
      process.exit(1)
    }
    console.log('✓ tokens.css em sincronia com tokens.ts')
  } else {
    writeFileSync(TARGET, css, 'utf8')
    const n = css.split('\n').filter((l) => l.trim().startsWith('--bj-')).length
    console.log(`✓ tokens.css gerado (${n} declarações)`)
  }
}
