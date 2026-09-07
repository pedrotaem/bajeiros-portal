import { SECTION_RULES } from './rule-sections'

/**
 * DF-34 — leitura do índice do regulamento. Tudo aqui é PURO sobre o JSON gerado por
 * `scripts/build-regulamento-indice.mjs`: é o que o teste percorre, não a tela.
 *
 * O índice é metadado (número, página, e título só onde ele é título de fato). Texto
 * do regulamento não existe neste repo — DF-8 e DF-34 §3.1.
 */

export interface Bloco {
  id: string
  /** Só em `depth <= 2`, e só quando o manifest trouxe um título de verdade. */
  title?: string
  pageStart: number
  pageEnd: number
  depth: number
}

export interface IndiceRegulamento {
  edition: string
  corpusVersion: string
  pdfSha256: string
  pageCount: number
  generatedAt: string
  blocks: Bloco[]
}

/** Nó da árvore do índice (C-27). `fundos` são os itens de `depth >= 3` da seção. */
export interface NoIndice {
  bloco: Bloco
  filhos: NoIndice[]
  fundos: Bloco[]
}

/** `B6.2.4.3` → `B6.2`; `B6.2` → `B6`; `B6` → `PARTE B`; raiz → null. */
export function paiDe(id: string): string | null {
  if (id === 'PREAMBULO' || id.startsWith('PARTE ')) return null
  const partes = id.split('.')
  if (partes.length === 1) return `PARTE ${id[0]}`
  return partes.slice(0, -1).join('.')
}

/** Caminho da raiz até o item, inclusive (`Parte B › B6 › B6.2 › B6.2.4 › B6.2.4.3`). */
export function ancestrais(id: string): string[] {
  const caminho: string[] = []
  let atual: string | null = id
  while (atual) {
    caminho.unshift(atual)
    atual = paiDe(atual)
  }
  return caminho
}

/**
 * Árvore de três níveis (parte › capítulo › seção), com os itens fundos pendurados na
 * seção. O manifest é uma lista linear, e a hierarquia mora no próprio id.
 *
 * Item fundo cuja seção não existe no manifest (segmentação estranha numa emenda nova)
 * NÃO some: ele sobe para o capítulo, como uma seção sem título. Perder item do índice
 * seria pior do que exibi-lo raso.
 */
export function arvore(blocks: Bloco[]): NoIndice[] {
  const nos = new Map<string, NoIndice>()
  const raizes: NoIndice[] = []
  for (const bloco of blocks) {
    if (bloco.depth > 2) continue
    const no: NoIndice = { bloco, filhos: [], fundos: [] }
    nos.set(bloco.id, no)
  }
  for (const no of nos.values()) {
    const pai = paiDe(no.bloco.id)
    const paiNo = pai ? nos.get(pai) : null
    if (paiNo) paiNo.filhos.push(no)
    else raizes.push(no)
  }
  for (const bloco of blocks) {
    if (bloco.depth <= 2) continue
    const partes = bloco.id.split('.')
    const secao = nos.get(partes.slice(0, 2).join('.')) ?? nos.get(partes[0])
    if (secao) secao.fundos.push(bloco)
  }
  return raizes
}

/** Irmãos do item (mesmo pai), na ordem do documento — os atalhos do cartão (FR-DF34.9). */
export function irmaos(blocks: Bloco[], id: string): Bloco[] {
  const alvo = blocks.find((b) => b.id === id)
  if (!alvo) return []
  const pai = paiDe(id)
  return blocks.filter((b) => b.depth === alvo.depth && paiDe(b.id) === pai)
}

/** Regras do motor B6 ligadas à seção ou a qualquer item abaixo dela (FR-DF34.8). */
export function regrasDaSecao(id: string): string[] {
  const out: string[] = []
  for (const [secao, regras] of Object.entries(SECTION_RULES)) {
    if (secao === id || secao.startsWith(`${id}.`)) out.push(...regras)
  }
  return out.sort()
}

/**
 * Campo "Ir para" (FR-DF34.3): aceita id (`B6.2.4.3`), página (`p. 42`, `42`) ou palavra
 * do título dos níveis 0–2 (`gaiola`). Devolve os blocos que casam, na ordem do documento.
 *
 * Busca por PALAVRA só olha `title` — que só existe onde é título. Não há busca no texto
 * integral porque não há texto no portal (§2, não-objetivos).
 */
export function filtrar(blocks: Bloco[], consulta: string): Bloco[] {
  const q = consulta.trim()
  if (!q) return []
  const pagina = /^p(?:ág(?:ina)?|\.)?\s*(\d{1,3})$|^(\d{1,3})$/i.exec(q)
  if (pagina) {
    const n = Number(pagina[1] ?? pagina[2])
    return blocks.filter((b) => b.pageStart <= n && n <= b.pageEnd)
  }
  const alvo = normalizar(q)
  const porId = blocks.filter((b) => normalizar(b.id).startsWith(alvo))
  if (porId.length) return porId
  return blocks.filter((b) => b.title && normalizar(b.title).includes(alvo))
}

/** Sem acento, sem caixa: "GAIOLA" e "gaiola" acham a mesma coisa. */
function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/**
 * Link de entrada `#regulamento=B6.2.4.3` (opcional `@emenda-07`), no mesmo mecanismo do
 * `#convite=` do DF-10 (FR-DF34.5). Sem router (ADR-009 dec. 4).
 */
export function lerHashRegulamento(hash: string): { sectionId: string; edition?: string } | null {
  const m = /regulamento=([A-Z][A-Z0-9. ]{0,39}?)(?:@([a-z0-9-]{1,40}))?(?:&|$)/i.exec(hash)
  if (!m) return null
  return { sectionId: decodeURIComponent(m[1]).toUpperCase(), edition: m[2] }
}

/** `#regulamento=B6.2.4.3@emenda-07` — o que "Copiar link da seção" põe na área de transferência. */
export function hashDaSecao(sectionId: string, edition: string): string {
  return `#regulamento=${encodeURIComponent(sectionId)}@${edition}`
}

/**
 * `<url-oficial>#page=N`: parâmetro padrão de abertura de PDF. Em celular a maioria dos
 * visualizadores ignora e abre na primeira página — a tela avisa (§3.3), o link não mente.
 */
export function urlDaPagina(url: string, pagina: number): string {
  return `${url.split('#')[0]}#page=${pagina}`
}

/** "páginas 34–41" / "página 42" — o rótulo aparece em três lugares, e é um só aqui. */
export function rotuloDePaginas(b: Pick<Bloco, 'pageStart' | 'pageEnd'>): string {
  return b.pageEnd > b.pageStart ? `páginas ${b.pageStart}–${b.pageEnd}` : `página ${b.pageStart}`
}
