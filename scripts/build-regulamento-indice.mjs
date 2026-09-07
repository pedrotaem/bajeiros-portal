#!/usr/bin/env node
// DF-34 §5.2 — gera o ÍNDICE do regulamento para o portal a partir do manifest do
// gateway (`bajeiros-ai-gateway`, saída de `scripts/ingest.ts`).
//
//   node scripts/build-regulamento-indice.mjs --manifest ../ai-gateway/.local/corpus/ratbsb-emenda-07.manifest.json
//   node scripts/build-regulamento-indice.mjs --manifest <arquivo> --check   # não escreve; falha se diferente
//
// O índice é METADADO (número, página, e o título só onde ele é título de fato). O
// TEXTO do regulamento nunca entra no repo — restrição escrita desde o DF-8, e é ela
// que mantém a página do lado certo da linha do direito autoral (DF-34 §3.1, §8).
//
// Duas guardas, ambas fatais:
//   1. nenhum `title` em `depth >= 3` — ali o "título" do manifest é o começo do
//      parágrafo, ou seja, texto do regulamento;
//   2. em `depth <= 2`, só passa `title` que PARECE título (`ehTitulo`). A spec supunha
//      que os 210 itens rasos tivessem título real; no manifest da emenda 7, 30 deles
//      são prosa (A1.1, C4.3, B15.x…) porque a seção não tem cabeçalho no PDF. Regra
//      dura, não estética: prosa é texto do regulamento em qualquer profundidade.

import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const args = process.argv.slice(2)
const flag = (nome, padrao = null) => {
  const i = args.indexOf(`--${nome}`)
  return i >= 0 ? (args[i + 1] ?? true) : padrao
}
const check = args.includes('--check')

/**
 * Profundidade pelo id, não por contagem de linhas: `PREAMBULO` e `PARTE B` são raiz,
 * `B6` é capítulo, e daí cada ponto desce um nível (`B6.2` → 2, `B6.2.4.3` → 4).
 */
export function depthOf(id) {
  if (id === 'PREAMBULO' || id.startsWith('PARTE ')) return 0
  return 1 + (id.match(/\./g) ?? []).length
}

// Palavra que termina fragmento cortado ("… Regulamento Administrativo e"), nunca título.
const CAUDA_SOLTA = new Set(
  'e ou de da do das dos que para com em no na nos nas a o as os ao à ser pelo pela se por como sobre um uma entre não deve pode'.split(
    ' ',
  ),
)

/**
 * O `title` do manifest é título de seção, ou o começo de um parágrafo do regulamento?
 * O ingest não distingue (`splitSections` pega o resto da linha do id), então a decisão
 * é aqui — e é conservadora: na dúvida, o item entra no índice só com número e página.
 *
 * Título é curto, íntegro e nominal. Vírgula, ponto final, corte no meio de uma frase
 * ou mais de 8 palavras denunciam prosa.
 */
export function ehTitulo(title) {
  const s = String(title ?? '').trim()
  if (!s) return false
  if (/[,;:]/.test(s)) return false
  if (/[.\-–]$/.test(s)) return false
  if (/\.\s/.test(s)) return false
  const palavras = s.split(/\s+/)
  if (palavras.length > 8) return false
  const ultima = palavras[palavras.length - 1].toLowerCase().replace(/[^0-9a-záàâãéêíóôõúüç]/g, '')
  return !CAUDA_SOLTA.has(ultima)
}

/** `ratbsb@emenda-07#sha256:e4a0…` → `emenda-07`. */
export function editionOf(corpusVersion) {
  const m = /@([^#]+)/.exec(String(corpusVersion ?? ''))
  if (!m) throw new Error(`corpusVersion sem edição: ${corpusVersion}`)
  return m[1]
}

/**
 * Manifest do gateway → índice do portal. Função PURA: é ela que o teste percorre,
 * não o arquivo em disco.
 */
export function buildIndice(manifest, { generatedAt } = {}) {
  const edition = editionOf(manifest.version)
  const blocks = []
  for (const b of manifest.blocks ?? []) {
    const depth = depthOf(b.sectionId)
    const bloco = {
      id: b.sectionId,
      pageStart: Number(b.pageStart),
      pageEnd: Number(b.pageEnd ?? b.pageStart),
      depth,
    }
    if (depth <= 2 && ehTitulo(b.title)) bloco.title = String(b.title).trim()
    blocks.push(bloco)
  }
  const indice = {
    edition,
    corpusVersion: manifest.version,
    pdfSha256: manifest.pdfSha256,
    pageCount: blocks.reduce((max, b) => Math.max(max, b.pageEnd), 0),
    generatedAt: generatedAt ?? manifest.generatedAt,
    blocks,
  }
  validarIndice(indice)
  return indice
}

/**
 * Guarda do ARTEFATO, não da geração (AC-DF34.3): vale para o JSON já commitado, que é
 * o que o portal serve. Roda no build e no teste — a ordem em que o arquivo apareceu
 * não importa, o que não pode existir é título fundo.
 */
export function validarIndice(indice) {
  const comTexto = (indice.blocks ?? []).filter((b) => b.depth >= 3 && b.title)
  if (comTexto.length) {
    throw new Error(
      `título em depth >= 3 (texto do regulamento): ${comTexto
        .slice(0, 5)
        .map((b) => b.id)
        .join(', ')}`,
    )
  }
  const prosa = (indice.blocks ?? []).filter((b) => b.title && !ehTitulo(b.title))
  if (prosa.length) {
    throw new Error(
      `título que é prosa do regulamento: ${prosa
        .slice(0, 5)
        .map((b) => b.id)
        .join(', ')}`,
    )
  }
}

/**
 * Um bloco por linha: o arquivo é gerado (nunca editado à mão), mas 1 360 blocos
 * indentados custariam o dobro do tamanho e o diff de uma emenda nova ficaria ilegível.
 * Formatado aqui e ignorado pelo prettier (`.prettierignore`), como `tokens.css`.
 */
export function serializar(indice) {
  const { blocks, ...cabecalho } = indice
  const linhas = Object.entries(cabecalho).map(
    ([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`,
  )
  return `{\n${linhas.join('\n')}\n  "blocks": [\n${blocks
    .map((b) => `    ${JSON.stringify(b)}`)
    .join(',\n')}\n  ]\n}\n`
}

// Só como CLI: o teste importa `buildIndice` e não pode disparar leitura de disco.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const manifestPath = flag(
    'manifest',
    path.join(root, '..', 'ai-gateway', '.local', 'corpus', 'ratbsb-emenda-07.manifest.json'),
  )
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const indice = buildIndice(manifest)
  const destino = path.join(
    root,
    'apps',
    'web',
    'public',
    'regulamento',
    `indice-${indice.edition}.json`,
  )
  const texto = serializar(indice)

  if (check) {
    let atual = null
    try {
      atual = readFileSync(destino, 'utf8')
    } catch {
      /* ainda não existe */
    }
    if (atual !== texto) {
      console.error(`índice fora de data: ${path.relative(root, destino)} — rode sem --check`)
      process.exit(1)
    }
    console.log(`índice em dia (${indice.blocks.length} blocos, ${indice.pageCount} páginas)`)
  } else {
    mkdirSync(path.dirname(destino), { recursive: true })
    writeFileSync(destino, texto)
    const edicoes = listarEdicoes(path.dirname(destino))
    writeFileSync(
      path.join(path.dirname(destino), 'edicoes.json'),
      `${JSON.stringify({ edicoes }, null, 2)}\n`,
    )
    const comTitulo = indice.blocks.filter((b) => b.title).length
    console.log(
      `${path.relative(root, destino)}: ${indice.blocks.length} blocos, ${comTitulo} com título, ${indice.pageCount} páginas (${indice.corpusVersion})`,
    )
    console.log(`edicoes.json: ${edicoes.join(', ')}`)
  }
}

/**
 * Que emendas o PORTAL tem em arquivo, mais nova primeiro. É o que deixa a página abrir o
 * regulamento quando o banco ainda não tem a emenda cadastrada: o índice e o PDF já foram
 * publicados no deploy, e esconder o documento por falta de uma linha em tabela é perder o
 * que o portal já entrega. A vigência continua vindo do banco — o que o arquivo não sabe é
 * para QUAIS competições a emenda vale, e a tela diz isso.
 */
export function listarEdicoes(dir) {
  return readdirSync(dir)
    .map((f) => /^indice-(.+)\.json$/.exec(f)?.[1])
    .filter((e) => !!e)
    .sort()
    .reverse()
}
