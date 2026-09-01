#!/usr/bin/env node
// Gera apps/web/src/data/brasil-uf.ts — os 27 contornos estaduais do mapa da vitrine
// (DF-25 §5.3, revisto: o esquema à mão saiu, entrou fronteira real).
//
//   node scripts/build-mapa-uf.mjs
//
// NÃO roda no CI: a saída é COMMITADA e o script existe para registrar a procedência e
// permitir refazer com outra tolerância. Ele baixa a malha na hora, então precisa de
// rede — por isso não é gate de build.
//
// FONTE: Natural Earth, admin-1 (states/provinces) 1:50m — **domínio público**
// (https://www.naturalearthdata.com/about/terms-of-use/). Escolhida sobre a malha do
// IBGE por causa da licença explícita e por caber num arquivo commitável; a do IBGE é
// mais precisa e é o caminho se um dia a precisão importar mais que o tamanho.
//
// O que o script faz, em ordem:
//   1. filtra `adm0_a3 === 'BRA'` (27 feições, uma por UF);
//   2. joga fora ilhas oceânicas (Fernando de Noronha, Trindade, Rocas, São Pedro e
//      São Paulo) — elas esticariam o enquadramento em ~10% para pintar 4 pixels;
//   3. projeta em equiretangular com correção de cosseno na latitude média do país;
//   4. simplifica por Douglas-Peucker em PIXEL DE SAÍDA, não em grau: a tolerância
//      passa a significar "o que se vê", e não muda de efeito conforme a latitude;
//   5. arredonda a 1 decimal e escreve o módulo TS.

import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const FONTE =
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_1_states_provinces.geojson'

const LARGURA = 640 // viewBox de saída; a altura sai da proporção real do país
const MARGEM = 8
const TOLERANCIA = 0.7 // px de saída
const LON_MAINLAND_LESTE = -34.0 // Ponta do Seixas (PB) fica em ~-34,79

/** UF → região, agrupamento oficial do IBGE. Conferido contra o campo `regiao` da pesquisa. */
const REGIAO_DA_UF = {
  AC: 'N',
  AP: 'N',
  AM: 'N',
  PA: 'N',
  RO: 'N',
  RR: 'N',
  TO: 'N',
  AL: 'NE',
  BA: 'NE',
  CE: 'NE',
  MA: 'NE',
  PB: 'NE',
  PE: 'NE',
  PI: 'NE',
  RN: 'NE',
  SE: 'NE',
  DF: 'CO',
  GO: 'CO',
  MT: 'CO',
  MS: 'CO',
  ES: 'SE',
  MG: 'SE',
  RJ: 'SE',
  SP: 'SE',
  PR: 'S',
  RS: 'S',
  SC: 'S',
}

function areaDoAnel(pts) {
  let a = 0
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    a += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1]
  }
  return Math.abs(a / 2)
}

/** Distância perpendicular de `p` ao segmento `a`–`b`. */
function distanciaAoSegmento(p, a, b) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  if (dx === 0 && dy === 0) return Math.hypot(p[0] - a[0], p[1] - a[1])
  const t = Math.max(
    0,
    Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)),
  )
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))
}

/** Douglas-Peucker iterativo — recursivo estoura a pilha em anel de 20 mil pontos. */
function simplificar(pts, tol) {
  if (pts.length < 3) return pts
  const manter = new Uint8Array(pts.length)
  manter[0] = 1
  manter[pts.length - 1] = 1
  const pilha = [[0, pts.length - 1]]
  while (pilha.length) {
    const [ini, fim] = pilha.pop()
    let pior = 0
    let idx = -1
    for (let i = ini + 1; i < fim; i++) {
      const d = distanciaAoSegmento(pts[i], pts[ini], pts[fim])
      if (d > pior) {
        pior = d
        idx = i
      }
    }
    if (idx !== -1 && pior > tol) {
      manter[idx] = 1
      pilha.push([ini, idx], [idx, fim])
    }
  }
  return pts.filter((_, i) => manter[i])
}

const res = await fetch(FONTE)
if (!res.ok) throw new Error(`Natural Earth respondeu ${res.status}`)
const geo = await res.json()

const feicoes = geo.features.filter((f) => f.properties.adm0_a3 === 'BRA')
if (feicoes.length !== 27) throw new Error(`esperava 27 UFs, vieram ${feicoes.length}`)

// 1. recolhe os anéis externos de cada UF, já descartando ilha oceânica
const brutos = feicoes.map((f) => {
  const sigla = f.properties.postal
  const geom = f.geometry
  const poligonos = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates
  let aneis = poligonos.map((p) => p[0]) // só o anel externo; não há enclave no Brasil
  const maior = Math.max(...aneis.map(areaDoAnel))
  aneis = aneis.filter((anel) => {
    const oceanica = Math.min(...anel.map((c) => c[0])) > LON_MAINLAND_LESTE
    return !oceanica && areaDoAnel(anel) >= maior * 0.002
  })
  return { sigla, nome: f.properties.name, aneis }
})

// 2. projeção equiretangular com correção de cosseno na latitude média
const todas = brutos.flatMap((u) => u.aneis.flat())
const latMedia = (Math.min(...todas.map((c) => c[1])) + Math.max(...todas.map((c) => c[1]))) / 2
const k = Math.cos((latMedia * Math.PI) / 180)
const proj = ([lon, lat]) => [lon * k, -lat]

const projetadas = todas.map(proj)
const minX = Math.min(...projetadas.map((p) => p[0]))
const maxX = Math.max(...projetadas.map((p) => p[0]))
const minY = Math.min(...projetadas.map((p) => p[1]))
const maxY = Math.max(...projetadas.map((p) => p[1]))
const escala = (LARGURA - 2 * MARGEM) / (maxX - minX)
const ALTURA = Math.round((maxY - minY) * escala + 2 * MARGEM)
const paraTela = (c) => {
  const [x, y] = proj(c)
  return [(x - minX) * escala + MARGEM, (y - minY) * escala + MARGEM]
}

const n1 = (v) => Math.round(v * 10) / 10

// 3. projeta, simplifica e serializa
let pontosAntes = 0
let pontosDepois = 0
const ufs = brutos
  .map((u) => {
    const partes = []
    for (const anel of u.aneis) {
      pontosAntes += anel.length
      const tela = anel.map(paraTela)
      const simples = simplificar(tela, TOLERANCIA)
      if (simples.length < 4) continue
      pontosDepois += simples.length
      partes.push(
        'M' + simples.map(([x, y], i) => `${i ? 'L' : ''}${n1(x)} ${n1(y)}`).join(' ') + 'Z',
      )
    }
    // âncora do rótulo: centroide do maior anel, bom o bastante para 27 shapes
    const maior = u.aneis.reduce((a, b) => (areaDoAnel(a) > areaDoAnel(b) ? a : b))
    const tela = maior.map(paraTela)
    const cx = tela.reduce((s, p) => s + p[0], 0) / tela.length
    const cy = tela.reduce((s, p) => s + p[1], 0) / tela.length
    return {
      sigla: u.sigla,
      nome: u.nome,
      regiao: REGIAO_DA_UF[u.sigla],
      centro: [n1(cx), n1(cy)],
      d: partes.join(''),
    }
  })
  .sort((a, b) => a.sigla.localeCompare(b.sigla))

for (const u of ufs) {
  if (!u.regiao) throw new Error(`UF sem região no mapeamento: ${u.sigla}`)
}

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const destino = path.join(root, 'apps', 'web', 'src', 'data', 'brasil-uf.ts')

const corpo = ufs
  .map(
    (u) =>
      `  {\n    sigla: '${u.sigla}',\n    nome: '${u.nome.replace(/'/g, "\\'")}',\n` +
      `    regiao: '${u.regiao}',\n    centro: [${u.centro[0]}, ${u.centro[1]}],\n` +
      `    d: '${u.d}',\n  },`,
  )
  .join('\n')

writeFileSync(
  destino,
  `/* GERADO por scripts/build-mapa-uf.mjs — NÃO EDITE À MÃO.
 *
 * Fronteiras estaduais do Brasil, de Natural Earth admin-1 1:50m (DOMÍNIO PÚBLICO,
 * https://www.naturalearthdata.com/about/terms-of-use/), projetadas em equiretangular
 * com correção de cosseno na latitude média e simplificadas por Douglas-Peucker a
 * ${TOLERANCIA}px de saída. Ilhas oceânicas removidas (ver o script).
 *
 * Refazer com outra tolerância: \`node scripts/build-mapa-uf.mjs\`.
 */
import type { RegiaoId } from './panorama'

export interface Uf {
  sigla: string
  nome: string
  regiao: RegiaoId
  /** Centroide do maior anel, em unidades do viewBox — âncora de rótulo. */
  centro: [number, number]
  /** Contorno já projetado. Um \`M…Z\` por anel (estados com ilha costeira têm mais de um). */
  d: string
}

/** viewBox do mapa inteiro. Sai da proporção real do país, não de um número escolhido. */
export const MAPA_VIEWBOX = '0 0 ${LARGURA} ${ALTURA}'

export const UFS: readonly Uf[] = [
${corpo}
]
`,
  'utf8',
)

const bytes = Buffer.byteLength(ufs.map((u) => u.d).join(''), 'utf8')
console.log(
  `✓ ${ufs.length} UFs · viewBox 0 0 ${LARGURA} ${ALTURA} · ` +
    `${pontosAntes} → ${pontosDepois} pontos · ${(bytes / 1024).toFixed(1)} KB de path`,
)
