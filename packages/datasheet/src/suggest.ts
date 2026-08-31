import type { Cage, Member, MemberType, TubeSection } from '@bajeiros/core/model/types'
import { PRIMARY_TYPES } from '@bajeiros/core/model/types'
import { estimateMass } from '@bajeiros/core/model/mass'
import { materialOf } from '@bajeiros/core/model/materials'
import { defaultManikin, profileById, solveManikin } from '@bajeiros/core/model/manikin'
import { dist, distPointToSegment } from '@bajeiros/core/rules/geometry'
import { FIELDS } from './catalog'
import type { Suggestion } from './types'

// Sugestões da ficha (DF-21 §3.2) — o portal mostra o que calculou, com a origem, e
// quem decide é quem está editando.
//
// Três invariantes que este módulo tem de manter, porque são o princípio da spec:
//  1. Sem gaiola salva, devolve vazio SEM erro (RF-1.3): ausência de modelo é o caso
//     normal, não exceção.
//  2. Nada aqui escreve. O resultado é oferta; aceitar é uma escrita normal da API,
//     com autor e `source: 'suggestion'` na revisão (RF-2.7).
//  3. Nenhuma sugestão é veredito. Conformidade e pendências da gaiola são estado da
//     versão e vivem na aba Validação — não viram campo (§3.2).
//
// Desvio consciente da assinatura de RF-1.3 (`suggestFrom(cage, rulesResult)`): os seis
// palpites saem de geometria e massa, não de resultado de regra. Receber `RuleResult[]`
// só para ignorá-lo convidaria, na primeira manutenção, a derivar campo de veredito —
// que é exatamente o que a spec proíbe. O contexto opcional carrega a versão do
// snapshot, que é o que a tela precisa mostrar ("modelo 3D · v14").

export interface SuggestContext {
  /** `seq` do snapshot de onde a gaiola veio; entra no texto de origem. */
  seq?: number
}

/** Membros que formam o habitáculo, para a folga de capacete (referência B6.1.3). */
const HABITACLE_TYPES: readonly MemberType[] = [
  'RRH',
  'RHO',
  'FBM_UP',
  'FBM_LOW',
  'SIM',
  'LDB',
  'SHC',
  'CLC',
  'DLC',
  'ALC',
  'BLC',
]

function round(n: number, digits: number): number {
  const f = 10 ** digits
  return Math.round(n * f) / f
}

function origin(ctx: SuggestContext): string {
  return ctx.seq != null ? `modelo 3D · v${ctx.seq}` : 'modelo 3D'
}

/** Decimal com vírgula: o palpite vai para um campo de texto que a pessoa lê e edita. */
function ptBr(n: number): string {
  return String(n).replace('.', ',')
}

function sectionLabel(s: TubeSection): string {
  const m = materialOf(s)
  return `${m.label} · Ø ${ptBr(round(s.od, 2))} × ${ptBr(round(s.wall, 2))} mm`
}

function memberLength(cage: Cage, m: Member): number {
  const a = cage.nodes[m.a]
  const b = cage.nodes[m.b]
  return a && b ? dist(a, b) : 0
}

/** Comprimento somado de todos os membros com os dois nós existentes. */
export function tubeLengthMm(cage: Cage): number {
  return cage.members.reduce((sum, m) => sum + memberLength(cage, m), 0)
}

/** Peças de tubo: um membro modelado = um corte. A oficina corrige onde há curva. */
export function tubeCount(cage: Cage): number {
  return cage.members.filter((m) => cage.nodes[m.a] && cage.nodes[m.b]).length
}

/**
 * Folga do capacete: menor distância do topo do capacete do manequim até os membros
 * do habitáculo. Palpite de projeto — a medida que vale é a do carro pronto com o
 * piloto dentro, e é por isso que o campo é `dual`.
 * Devolve `null` quando não há manequim resolvível ou membro de habitáculo modelado.
 */
export function helmetClearanceMm(cage: Cage): number | null {
  const cfg = cage.manikin ?? defaultManikin()
  const profile = profileById(cfg.profileMax)
  let helmetTop
  try {
    helmetTop = solveManikin(cfg, profile, cage.seatBottomY, cage.geraldao.z).helmetTop
  } catch {
    return null
  }
  if (!Number.isFinite(helmetTop.y) || !Number.isFinite(helmetTop.z)) return null

  let min = Infinity
  for (const m of cage.members) {
    if (!HABITACLE_TYPES.includes(m.type)) continue
    const a = cage.nodes[m.a]
    const b = cage.nodes[m.b]
    if (!a || !b) continue
    min = Math.min(min, distPointToSegment(helmetTop, a, b))
  }
  return Number.isFinite(min) ? min : null
}

/**
 * Palpites para os campos marcados `suggest` no catálogo.
 * Gaiola ausente ou ilegível ⇒ lista vazia, sem erro (RF-1.3 / AC-DF21.1).
 */
export function suggestFrom(cage: Cage | null | undefined, ctx: SuggestContext = {}): Suggestion[] {
  if (!cage || !Array.isArray(cage.members) || !cage.nodes) return []

  const from = origin(ctx)
  const out: Suggestion[] = []
  const push = (fieldId: string, value: number | string | null) => {
    if (value == null || (typeof value === 'number' && !Number.isFinite(value))) return
    out.push({ fieldId, value, origin: from })
  }

  try {
    push('dim.massa-gaiola', round(estimateMass(cage).totalKg, 2))
  } catch {
    // massa é palpite, não gate: modelo parcial simplesmente não sugere
  }

  push('dim.comprimento-tubo', round(tubeLengthMm(cage), 0))

  const cortes = tubeCount(cage)
  if (cortes > 0) push('dim.tubos-cortados', cortes)

  const temPrimario = cage.members.some((m) => PRIMARY_TYPES.includes(m.type))
  const temSecundario = cage.members.some((m) => !PRIMARY_TYPES.includes(m.type))
  if (cage.primarySection && temPrimario) {
    push('chassi.secao-primaria', sectionLabel(cage.primarySection))
  }
  if (cage.secondarySection && temSecundario) {
    push('chassi.secao-secundaria', sectionLabel(cage.secondarySection))
  }

  const folga = helmetClearanceMm(cage)
  if (folga != null) push('erg.folga-capacete', round(folga, 0))

  return out
}

/** Campos do catálogo que o portal sabe sugerir — usado pela tela e pelos testes. */
export const SUGGESTED_FIELDS: readonly string[] = FIELDS.filter((f) => f.suggest).map((f) => f.id)
