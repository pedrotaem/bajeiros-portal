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
}

export interface PayloadRegulamento {
  season: number
  versions: VersaoRegulamento[]
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
