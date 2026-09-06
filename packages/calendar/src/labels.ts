import { dataExtensa } from './dates'
import type {
  CalendarCompetition,
  CalendarMilestone,
  MilestoneKind,
  RegistrationKind,
  SourceKind,
  SourceRef,
} from './types'

// Vocabulário do calendário (DS §11): rótulos em português, sem jargão da organização.

/**
 * Disclaimer obrigatório (DF-33 cabeçalho / §4.6) — texto FIXO, pedido do dono do produto.
 * Aparece na faixa da aba, no `PrecisaDeConta` e no rodapé do painel do marco.
 */
export const AVISO_FONTE =
  'O Portal é um facilitador de acesso à informação e não substitui a leitura integral do material direto da fonte. O usuário deve sempre verificar o documento oficial vigente referente à competição que lhe afeta e tomar qualquer decisão baseada no documento oficial.'

export const KIND_LABEL: Record<MilestoneKind, string> = {
  inscricao: 'Inscrição',
  pagamento: 'Pagamento',
  pessoas: 'Pessoas',
  documento: 'Documento',
  logistica: 'Logística',
  evento: 'Evento',
  comunicado: 'Comunicado',
  equipe: 'Equipe',
}

export const REGISTRATION_LABEL: Record<RegistrationKind, string> = {
  novata: 'novata',
  light: 'light',
  integral: 'integral',
  promocional: 'promocional',
}

export const SOURCE_LABEL: Record<SourceKind, string> = {
  informativo: 'Informativo',
  pagina: 'Página oficial',
  regulamento: 'Regulamento',
  template: 'Template',
  forum: 'Fórum',
  canal: 'Canal oficial',
  outro: 'Documento',
}

/** "Informativo 09" · "Página de inscrições" · "Regulamento (emenda-07)" */
export function nomeDaFonte(s: SourceRef): string {
  if (s.kind === 'informativo' && s.number != null)
    return `Informativo ${String(s.number).padStart(2, '0')}`
  if (s.edition) return `${s.title} (${s.edition})`
  return s.title
}

/**
 * Forma do marco na linha do tempo (FR-DF33.5, redundância não-cromática): prazo = losango,
 * janela = barra, evento = faixa, comunicado = círculo vazado, marco da equipe = quadrado
 * vazado. A cor só reforça.
 */
export type MilestoneShape = 'losango' | 'barra' | 'faixa' | 'circulo' | 'quadrado'

export function shapeOf(m: Pick<CalendarMilestone, 'kind' | 'startsOn'>): MilestoneShape {
  if (m.kind === 'equipe') return 'quadrado'
  if (m.kind === 'comunicado') return 'circulo'
  if (m.kind === 'evento') return 'faixa'
  if (m.startsOn) return 'barra'
  return 'losango'
}

export const SHAPE_LABEL: Record<MilestoneShape, string> = {
  losango: 'prazo',
  barra: 'janela',
  faixa: 'evento',
  circulo: 'comunicado',
  quadrado: 'marco da equipe',
}

/** Chip curto da competição nos filtros e nas linhas: "Nacional" · "Nordeste" · "Sul". */
export function chipDaCompeticao(c: Pick<CalendarCompetition, 'kind' | 'region'>): string {
  return c.kind === 'nacional' ? 'Nacional' : (c.region ?? 'Regional')
}

/** "Inscrição de integrantes, até 25 de janeiro de 2027, Nacional 2027, fonte Informativo 09" */
export function ariaLabelDoMarco(
  m: CalendarMilestone,
  competitionName: string | null,
  seasonLabel?: string,
): string {
  const partes = [m.title]
  partes.push(
    m.startsOn
      ? `de ${dataExtensa(m.startsOn)} a ${dataExtensa(m.dueOn)}`
      : `até ${dataExtensa(m.dueOn)}`,
  )
  if (m.kind === 'equipe') partes.push(seasonLabel ? `temporada ${seasonLabel}` : 'marco da equipe')
  else if (competitionName) partes.push(competitionName)
  if (m.source) partes.push(`fonte ${nomeDaFonte(m.source)}`)
  return partes.join(', ')
}

/** "INTEGRAL · 2º LOTE" nasce do título; aqui só a categoria em maiúsculas. */
export function chipDeCategoria(appliesTo: RegistrationKind[]): string | null {
  if (!appliesTo.length) return null
  return appliesTo.map((k) => REGISTRATION_LABEL[k].toUpperCase()).join(' · ')
}
