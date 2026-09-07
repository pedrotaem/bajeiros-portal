#!/usr/bin/env node
// DF-34 §5.3 / ADR-014 — baixa o PDF oficial do regulamento e o coloca no portal, com a
// PROCEDÊNCIA ao lado: de onde veio, quando foi baixado (data e hora) e o sha256 do
// arquivo que ficou aqui.
//
//   node scripts/baixar-regulamento.mjs --url <url-oficial> --edition emenda-07
//   node scripts/baixar-regulamento.mjs --url <url> --edition emenda-07 --expect-sha <sha256>
//
// Escreve dois arquivos em `apps/web/public/regulamento/`:
//   <edition>.pdf        — cópia inalterada, servida pela origem do portal
//   copia-<edition>.json — url de origem, `downloadedAt` (ISO, com hora), sha256, bytes,
//                          e o `Last-Modified`/`ETag` que o servidor da organização
//                          declarou. É essa linha que a tela mostra ("cópia de …").
//
// `--expect-sha` é a trava de troca silenciosa: numa reconferência, hash diferente
// significa que a organização publicou outro arquivo sob a mesma URL — isso é notícia
// (emenda ou errata), não rotina, e o script para para alguém olhar.
//
// A cópia NÃO é modificada: sem marca d'água, sem recorte, sem re-tipografia. O que o
// portal serve é byte a byte o que a organização publicou, e o link para o original
// continua em toda tela (ADR-014).

import { writeFileSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const args = process.argv.slice(2)
const flag = (nome, padrao = null) => {
  const i = args.indexOf(`--${nome}`)
  return i >= 0 ? (args[i + 1] ?? true) : padrao
}

const url = flag('url')
const edition = flag('edition')
const expectSha = flag('expect-sha')
if (!url || !edition) {
  console.error('uso: --url <url-oficial> --edition <emenda-07> [--expect-sha <sha256>]')
  process.exit(1)
}
if (!/^[a-z0-9-]{1,40}$/.test(edition)) {
  console.error(`edição inválida: ${edition} (minúsculas, ex.: emenda-07)`)
  process.exit(1)
}

const res = await fetch(url, {
  // o site da organização recusa cliente sem cara de navegador (403); o servidor de
  // arquivos responde normalmente, mas o cabeçalho fica para não depender disso
  headers: {
    'User-Agent': 'Mozilla/5.0 (compatible; bajeiros-portal/1.0; +https://bajeiros.com.br)',
  },
})
if (!res.ok) {
  console.error(`falha ao baixar (${res.status} ${res.statusText}): ${url}`)
  process.exit(1)
}
const tipo = res.headers.get('content-type') ?? ''
if (!tipo.includes('pdf')) {
  console.error(`o servidor não devolveu um PDF (content-type: ${tipo || 'ausente'})`)
  process.exit(1)
}

const bytes = Buffer.from(await res.arrayBuffer())
if (bytes.subarray(0, 5).toString('latin1') !== '%PDF-') {
  console.error('o arquivo baixado não começa com %PDF- — não é um PDF')
  process.exit(1)
}
const sha256 = createHash('sha256').update(bytes).digest('hex')
if (expectSha && expectSha !== sha256) {
  console.error(
    `sha256 diferente do esperado.\n  esperado: ${expectSha}\n  baixado:  ${sha256}\n` +
      'A organização publicou outro arquivo nessa URL. Confira o que mudou antes de trocar a cópia.',
  )
  process.exit(1)
}

const destino = path.join(root, 'apps', 'web', 'public', 'regulamento')
mkdirSync(destino, { recursive: true })
writeFileSync(path.join(destino, `${edition}.pdf`), bytes)

const procedencia = {
  edition,
  url,
  downloadedAt: new Date().toISOString(),
  sha256,
  bytes: bytes.length,
  lastModified: res.headers.get('last-modified'),
  etag: res.headers.get('etag'),
}
writeFileSync(
  path.join(destino, `copia-${edition}.json`),
  `${JSON.stringify(procedencia, null, 2)}\n`,
)

console.log(
  `apps/web/public/regulamento/${edition}.pdf: ${(bytes.length / 1024 / 1024).toFixed(2)} MB\n` +
    `  sha256 ${sha256}\n  baixado em ${procedencia.downloadedAt}\n` +
    `  publicado em ${procedencia.lastModified ?? '—'} (Last-Modified da fonte)`,
)
