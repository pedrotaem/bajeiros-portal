/**
 * DF-34 §6 — o que as rotas públicas do regulamento devolvem. Espelha
 * `apps/api/src/modules/regulation/routes.ts`; o índice em si NÃO vem daqui (é arquivo
 * estático servido pela origem do portal, §5.2).
 */

export type ReferenciaKind = 'regulamento' | 'template' | 'pagina' | 'forum'

export interface Referencia {
  id: string
  kind: ReferenciaKind
  title: string
  url: string
  publishedOn: string | null
  edition: string | null
  sectionId: string | null
  altersRules: boolean
  supersedesId: string | null
  checkedAt: string
}

export interface VersaoRegulamento {
  id: string
  edition: string
  label: string
  corpusVersion: string
  pdfSha256: string
  pageCount: number
  publishedOn: string | null
  checkedAt: string
  supersedesId: string | null
  supersededById: string | null
  source: Referencia
  appliesTo: { competitionId: string; name: string; season: number; kind: string }[]
  /**
   * `true` = veio dos arquivos publicados, não do banco (`versaoDoArtefato`): o portal tem
   * o documento, mas ninguém declarou para quais competições ele vale. A API nunca manda
   * este campo.
   */
  semCadastro?: boolean
}

export interface PayloadRegulamento {
  season: number
  versions: VersaoRegulamento[]
}

/**
 * Emenda montada a partir dos ARQUIVOS que o portal publicou (índice + cópia), para
 * quando o banco ainda não tem a emenda cadastrada.
 *
 * Nasceu de um defeito real: o deploy levou o índice e o PDF, a curadoria ainda não tinha
 * registrado a emenda, e a página escondia um documento que o portal já estava servindo.
 * O banco continua sendo a fonte da VIGÊNCIA (para quais competições a emenda vale, qual
 * substituiu qual); o arquivo responde pelo que ele sabe — que emenda é, quantas páginas
 * tem, de onde veio e quando foi baixada. A tela diz qual dos dois está falando.
 */
export function versaoDoArtefato(
  indice: { edition: string; corpusVersion: string; pdfSha256: string; pageCount: number } | null,
  copia: CopiaLocal | null,
): VersaoRegulamento | null {
  if (!indice) return null
  return {
    id: `arquivo:${indice.edition}`,
    edition: indice.edition,
    label: rotuloDaEdicao(indice.edition),
    corpusVersion: indice.corpusVersion,
    pdfSha256: indice.pdfSha256,
    pageCount: indice.pageCount,
    publishedOn: null,
    checkedAt: copia?.downloadedAt ?? '',
    supersedesId: null,
    supersededById: null,
    semCadastro: true,
    source: {
      id: `arquivo:${indice.edition}`,
      kind: 'regulamento',
      title: rotuloDaEdicao(indice.edition),
      url: copia?.url ?? '',
      publishedOn: null,
      edition: indice.edition,
      sectionId: null,
      altersRules: false,
      supersedesId: null,
      checkedAt: copia?.downloadedAt ?? '',
    },
    appliesTo: [],
  }
}

/**
 * Qual emenda a página abre: a cadastrada, a que a pessoa escolheu no seletor (ou veio na
 * citação), ou — na falta das duas — a mais nova que o portal publicou em arquivo. É a
 * regra que faz o documento aparecer com o banco vazio.
 */
export function edicaoAberta(
  versaoApi: VersaoRegulamento | null,
  escolhida: string | null,
  edicoesPublicadas: string[],
): string | null {
  return versaoApi?.edition ?? escolhida ?? edicoesPublicadas[0] ?? null
}

/** `emenda-07` → "RATBSB Emenda 7". Sem curadoria, o nome sai do próprio identificador. */
export function rotuloDaEdicao(edition: string): string {
  const m = /^emenda-0*(\d+)$/.exec(edition)
  return m ? `RATBSB Emenda ${m[1]}` : `RATBSB ${edition.replace(/-/g, ' ')}`
}

/**
 * A emenda que vale para o ciclo corrente: a primeira com competição declarada
 * (`regulation_applicability`). Sem nenhuma declarada, a mais recente — a lista já vem
 * ordenada por publicação. "Vigente" é curadoria, não palpite do front (§3.2).
 */
export function versaoVigente(p: PayloadRegulamento | null): VersaoRegulamento | null {
  if (!p?.versions.length) return null
  return p.versions.find((v) => v.appliesTo.length > 0) ?? p.versions[0]
}

/** A emenda que a tela deve abrir: a citada (quando veio uma), senão a vigente. */
export function versaoEscolhida(
  p: PayloadRegulamento | null,
  edition: string | null,
): VersaoRegulamento | null {
  if (!p) return null
  return (edition && p.versions.find((v) => v.edition === edition)) || versaoVigente(p)
}

/** "vigente para: Nacional 2027 · Regional Sudeste 2026" — direto de `applies_to`. */
export function rotuloVigencia(v: VersaoRegulamento | null): string | null {
  if (!v || v.appliesTo.length === 0) return null
  return v.appliesTo.map((a) => a.name).join(' · ')
}

/**
 * Referências da seção: as marcadas com ela e as do capítulo (`B6` cobre `B6.2.4.3`).
 * É o que o painel "Nesta seção" mostra sem repetir a lista inteira do ciclo.
 */
export function referenciasDaSecao(refs: Referencia[], sectionId: string | null): Referencia[] {
  if (!sectionId) return []
  return refs.filter(
    (r) =>
      r.sectionId &&
      (r.sectionId === sectionId ||
        sectionId.startsWith(`${r.sectionId}.`) ||
        r.sectionId.startsWith(`${sectionId}.`)),
  )
}

/**
 * Procedência da cópia servida pela origem do portal (ADR-014), gerada por
 * `scripts/baixar-regulamento.mjs` junto com o PDF. Não é opinião da tela: é o que o
 * download registrou — de onde veio, quando, e o hash do que ficou aqui.
 */
export interface CopiaLocal {
  edition: string
  url: string
  /** ISO com hora: é a "data e hora do download" que a página exibe. */
  downloadedAt: string
  sha256: string
  bytes: number
  lastModified: string | null
  etag: string | null
}

/**
 * A cópia só é servida se o hash bater com o da emenda cadastrada (FR-DF34.11) — o mesmo
 * hash que o manifest do gateway registrou, ou seja, o arquivo de que o assistente fala.
 * Divergiu, a tela cai para o link oficial e diz por quê: melhor mandar para a fonte do
 * que mostrar um documento que ninguém conferiu.
 */
export function copiaConfere(
  copia: CopiaLocal | null,
  versao: VersaoRegulamento | null,
): copia is CopiaLocal {
  return (
    !!copia && !!versao && copia.sha256 === versao.pdfSha256 && copia.edition === versao.edition
  )
}

/** Caminho da cópia na origem do portal, na página da seção. */
export function urlDaCopia(edition: string, pagina?: number): string {
  return `/regulamento/${edition}.pdf${pagina ? `#page=${pagina}` : ''}`
}

/** "06/09/2026 21:40" — data E hora, porque é a hora que dá rastro ao download. */
export function dataHora(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

/**
 * `ratbsb@emenda-07#sha256:e4a0…` → `emenda-07`. A resposta do assistente carrega o
 * corpusVersion, e é ele que diz QUAL emenda o chip deve abrir (§3.2) — nunca "a mais
 * nova": uma resposta de março sobre a emenda 6 continua apontando para a emenda 6.
 */
export function edicaoDoCorpus(corpusVersion: string | undefined): string | undefined {
  const m = /@([^#]+)/.exec(corpusVersion ?? '')
  return m ? m[1] : undefined
}

export const KIND_LABEL: Record<ReferenciaKind, string> = {
  regulamento: 'REGULAMENTO',
  template: 'TEMPLATE',
  pagina: 'PÁGINA OFICIAL',
  forum: 'FÓRUM',
}
