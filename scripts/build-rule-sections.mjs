#!/usr/bin/env node
// DF-34 §5.4 — mapa `ruleId → sectionId` (e o inverso) a partir de `specs/rules.md`,
// o catálogo normativo do motor B6.
//
//   node scripts/build-rule-sections.mjs            # escreve apps/web/src/regulamento/rule-sections.ts
//   node scripts/build-rule-sections.mjs --check    # não escreve; falha se o arquivo estiver velho
//
// É o que liga o checklist ao regulamento ("Ler no regulamento", FR-DF34.19) e o que
// dá o contador de regras do índice (FR-DF34.8) — MEDIDO do catálogo, não digitado.
//
// Regra de normalização: o id da regra É a seção, com duas exceções que o catálogo
// já usa e que o motor emite assim:
//   `B6.2.4.7a` / `B6.2.4.7b`  → um por travessa; a seção é `B6.2.4.7`
//   `B6.2.9.2/3`               → UM id (regra única sobre duas alíneas); a seção é `B6.2.9.2`
// Regras de modelagem do portal (`SUSP.*`, `STEER.1`, `MAT.1`, `JOINT.X`) NÃO têm
// seção — o próprio rules.md diz que não são do regulamento, e inventar uma seção
// para elas mandaria a pessoa ler um item que não fala daquilo.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

/** Id de item do regulamento: letra da parte + número, com ou sem alíneas. */
const ID_REGULAMENTO = /^[A-C]\d+(?:\.\d+)*[a-z]?$/

/** `B6.2.4.7a` → `B6.2.4.7`; `B6.2.9.2/3` → `B6.2.9.2`; `B6.3.1` → `B6.3.1`. */
export function sectionOf(ruleId) {
  return ruleId.split('/')[0].replace(/([0-9])[a-z]$/, '$1')
}

/**
 * Lê a primeira coluna de toda tabela markdown do catálogo. Uma célula pode trazer
 * DUAS regras (`B6.2.13.2 / B6.2.13.3`, com espaços) ou UMA com alíneas (`B6.2.9.2/3`).
 */
export function parseRules(markdown) {
  const mapa = new Map()
  for (const linha of markdown.split('\n')) {
    if (!linha.startsWith('|')) continue
    const celula = linha.split('|')[1]?.trim()
    if (!celula || celula.startsWith('-') || celula === 'ID') continue
    for (const bruto of celula.split(' / ')) {
      const id = bruto.replace(/\*\*/g, '').trim()
      if (!ID_REGULAMENTO.test(id.split('/')[0])) continue // regra de modelagem do portal
      mapa.set(id, sectionOf(id))
    }
  }
  return mapa
}

/** Gera o módulo TypeScript. Ordem estável (ordenada) para o diff não bater à toa. */
export function render(mapa) {
  const ids = [...mapa.keys()].sort()
  const porSecao = new Map()
  for (const id of ids) {
    const secao = mapa.get(id)
    porSecao.set(secao, [...(porSecao.get(secao) ?? []), id])
  }
  // Aspas simples e sem ponto e vírgula: o arquivo é gerado, mas passa pelo
  // `format:check` do CI como qualquer outro (.prettierrc do repo).
  const aspas = (s) => `'${s}'`
  const linhasRegras = ids.map((id) => `  ${aspas(id)}: ${aspas(mapa.get(id))},`)
  const linhasSecoes = [...porSecao.keys()]
    .sort()
    .map((s) => `  ${aspas(s)}: [${porSecao.get(s).map(aspas).join(', ')}],`)
  return `// GERADO por scripts/build-rule-sections.mjs a partir de specs/rules.md — não editar à mão.
// DF-34 §5.4: o checklist do validador e o índice do regulamento falam da MESMA seção.
// Regra de modelagem do portal (SUSP.*, STEER.1, MAT.1, JOINT.X) não entra: não é item
// do regulamento, e o rules.md é quem diz isso.

/** Regra do motor B6 → seção do regulamento que ela confere. */
export const RULE_SECTIONS: Record<string, string> = {
${linhasRegras.join('\n')}
}

/** O inverso: seção → regras que o validador confere nela (contador do índice). */
export const SECTION_RULES: Record<string, string[]> = {
${linhasSecoes.join('\n')}
}
`
}

// Só como CLI: o teste importa `parseRules`/`render` e refaz a geração em memória.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const markdown = readFileSync(path.join(root, 'specs', 'rules.md'), 'utf8')
  const mapa = parseRules(markdown)
  const destino = path.join(root, 'apps', 'web', 'src', 'regulamento', 'rule-sections.ts')
  const texto = render(mapa)

  if (process.argv.includes('--check')) {
    let atual = null
    try {
      atual = readFileSync(destino, 'utf8')
    } catch {
      /* ainda não existe */
    }
    if (atual !== texto) {
      console.error(`rule-sections.ts fora de data — rode: node scripts/build-rule-sections.mjs`)
      process.exit(1)
    }
    console.log(`rule-sections.ts em dia (${mapa.size} regras)`)
  } else {
    mkdirSync(path.dirname(destino), { recursive: true })
    writeFileSync(destino, texto)
    console.log(
      `${path.relative(root, destino)}: ${mapa.size} regras em ${new Set(mapa.values()).size} seções`,
    )
  }
}
