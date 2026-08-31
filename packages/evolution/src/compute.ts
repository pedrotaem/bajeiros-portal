import { AREA_IDS } from './areas'
import { CATALOG, CATALOG_MODE, CATALOG_VERSION, visibleCriteria } from './catalog'
import { AUTO_CHECKS, measure } from './checks'
import { activityFloorOf, counterStatusFor, isReaffirmable } from './counter'
import { facts } from './facts'
import type {
  ActivityFloor,
  AreaId,
  AreaLevel,
  AreaResult,
  CatalogMode,
  ComputeInput,
  CriterionState,
  Declaration,
  EvolutionResult,
  Evidence,
  Level,
} from './types'

/**
 * Cálculo de nível por área.
 *
 * ORDEM DO CÁLCULO (DF-20 RF-1.4), e ela é o desenho:
 *   declarações → contraprovas → estados → níveis → patente.
 * A patente (DF-18) não conhece contraprova: ela lê níveis JÁ aferidos.
 *
 * O que decide um critério mudou no DF-19: no v1.0.0 o `type` decidia (auto →
 * evidência, declarado → capitania). Na v2.0.0 quem decide é `CATALOG_MODE`:
 *  - `'declarado'`: a declaração satisfaz, e a medida aparece ao lado sem veredito
 *    (RF-1.3). A divergência é gravada e é o conjunto que calibra o DF-20;
 *  - `'aferido'`:   a declaração vale até uma contraprova disparar (DF-20 §2).
 */

/** Resultado de um critério automático: satisfeito + o porquê legível. */
export type { Check } from './checks'

function levelOf(criteria: CriterionState[]): AreaLevel {
  let level: AreaLevel = 0
  for (let n = 1 as Level; n <= 5; n = (n + 1) as Level) {
    const atOrBelow = criteria.filter((cr) => cr.level <= n)
    if (atOrBelow.length === 0) break
    if (!atOrBelow.every((cr) => cr.satisfied)) break
    level = n
  }
  return level
}

export function computeLevels(input: ComputeInput): EvolutionResult {
  const f = facts(input)
  const mode: CatalogMode = input.mode ?? CATALOG_MODE
  const season = input.seasonLabel ?? null
  const byId = new Map<string, Declaration>(input.declarations.map((d) => [d.criterionId, d]))

  // §2.3 — o piso é contraprova DE EQUIPE e é avaliado ANTES das individuais.
  // Quando dispara, nenhuma outra é avaliada: um aviso, não vinte (RF-1.3).
  const floor: ActivityFloor | null = mode === 'aferido' ? activityFloorOf(f) : null

  const expiring: string[] = []

  const areas: AreaResult[] = AREA_IDS.map((area: AreaId) => {
    const criteria: CriterionState[] = visibleCriteria(area).map((cr) => {
      const declaration = byId.get(cr.id)
      const declared = !!declaration
      const measured = measure(cr.id, f)

      // RF-4.4 — sazonal declarado numa temporada que já virou não conta mais. Sem
      // rótulo na declaração (dado anterior à regra) o critério NÃO expira: expirar
      // retroativamente seria punir a equipe por uma mudança de catálogo.
      const stamp = declaration?.seasonLabel ?? null
      const expired = !!cr.seasonal && declared && !!season && !!stamp && stamp !== season
      if (cr.seasonal && declared && !expired) expiring.push(cr.id)

      const counter =
        mode === 'aferido' && declared && !expired && !floor
          ? counterStatusFor(cr.id, f, { hasLink: declaration?.hasLink === true })
          : { result: null, notComparable: null }

      const reaffirmed =
        !!declaration?.reaffirmedAt &&
        (!season || !declaration.reaffirmedSeason || declaration.reaffirmedSeason === season)

      const state = stateOf({ declared, expired, counter: counter.result, reaffirmed, floor })
      const satisfied = state === 'vigente' || state === 'reafirmada'

      return {
        id: cr.id,
        area: cr.area,
        level: cr.level,
        type: cr.type,
        label: cr.label,
        source: cr.source,
        satisfied,
        reason: reasonOf({
          declared,
          expired,
          counter: counter.result,
          reaffirmed,
          floor,
          season,
        }),
        state,
        measured,
        // RF-1.3 — divergência é a equipe dizer "sim" onde o portal mede "não".
        // Na v1 ela NÃO muda o nível: é o conjunto que calibra a aferição.
        divergent: declared && !!measured && !measured.satisfied,
        counterCheck: counter.result,
        notComparable: counter.notComparable,
        reaffirmable: isReaffirmable(counter.result),
        expired,
        seasonal: cr.seasonal === true,
        linkHint: cr.linkHint,
      }
    })

    const level = levelOf(criteria)
    // Só o PRÓXIMO nível gera passo — a fila é caminho, não lista de cobrança (P-3.2).
    const nextLevel = Math.min(level + 1, 5)
    const pending = criteria.filter((cr) => cr.level <= nextLevel && !cr.satisfied)

    return { area, level, pending, criteria }
  })

  const levels = Object.fromEntries(areas.map((a) => [a.area, a.level])) as Record<
    AreaId,
    AreaLevel
  >
  const sum = areas.reduce((acc, a) => acc + a.level, 0)
  const average = Math.round((sum / areas.length) * 10) / 10
  const areaFloor = areas.reduce<AreaLevel>(
    (min, a) => (a.level < min ? a.level : min),
    5 as AreaLevel,
  )

  return {
    catalogVersion: CATALOG_VERSION,
    mode,
    areas,
    average,
    floor: areaFloor,
    levels,
    activityFloor: floor,
    expiring,
  }
}

interface StateArgs {
  declared: boolean
  expired: boolean
  counter: { kind: string } | null
  reaffirmed: boolean
  floor: ActivityFloor | null
}

function stateOf(a: StateArgs): CriterionState['state'] {
  if (!a.declared) return 'revogada'
  if (a.expired) return 'revogada'
  if (a.floor) return 'em-contraprova'
  if (!a.counter) return 'vigente'
  // RF-3.2 — contradição direta não admite reafirmação: o caminho é consertar o dado.
  if (a.counter.kind === 'indication' && a.reaffirmed) return 'reafirmada'
  return 'em-contraprova'
}

function reasonOf(a: StateArgs & { season: string | null }): string {
  if (!a.declared) return 'ainda não declarado'
  if (a.expired) return `vencido com a virada da temporada${a.season ? ` ${a.season}` : ''}`
  if (a.floor) return 'suspenso pelo piso de atividade da equipe'
  if (!a.counter) return 'declarado pela capitania'
  if (a.counter.kind === 'indication' && a.reaffirmed) return 'reafirmado com justificativa'
  return 'em contraprova'
}

/** Conveniência para os testes e para os produtores. */
export function evidence(
  kind: Evidence['kind'],
  payload: Record<string, unknown>,
  createdAt: Date,
): Evidence {
  return { kind, payload, createdAt }
}

export { AUTO_CHECKS, CATALOG, CATALOG_MODE, CATALOG_VERSION }
