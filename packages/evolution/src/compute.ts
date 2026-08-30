import { AREA_IDS } from './areas'
import { CATALOG, CATALOG_VERSION, visibleCriteria } from './catalog'
import { latest, num, obj, ofKind, str, strList } from './evidence'
import type {
  AreaId,
  AreaLevel,
  AreaResult,
  ComputeInput,
  Criterion,
  CriterionState,
  EvolutionResult,
  Evidence,
  Level,
} from './types'

const SIX_MONTHS_MS = 182 * 24 * 60 * 60 * 1000

/** Resultado de um critério automático: satisfeito + o porquê legível. */
interface Check {
  satisfied: boolean
  reason: string
}

const NO_PROJECT: Check = {
  satisfied: false,
  reason: 'nenhuma versão salva do projeto da temporada',
}

/**
 * Fatos derivados do fluxo de evidências, calculados UMA vez por equipe.
 * Tudo que depende do relógio recebe `now` — o motor não chama Date.now() em lugar nenhum.
 */
function facts(input: ComputeInput) {
  const { evidences, now } = input
  const validation = latest(evidences, 'validation.summary')
  const org = latest(evidences, 'org.summary')
  const knowledge = latest(evidences, 'knowledge.summary')
  const season = latest(evidences, 'season.configured')

  const vp = validation?.payload ?? {}
  const counts = obj(vp, 'counts')
  const failedRuleIds = strList(vp, 'failedRuleIds')

  const op = org?.payload ?? {}
  const kp = knowledge?.payload ?? {}
  const kinds = obj(kp, 'guidesByKind')

  // CON-3.2 — áreas distintas com decisão nos últimos 6 meses (janela temporal).
  const cutoff = now.getTime() - SIX_MONTHS_MS
  const recentAreas = new Set(
    ofKind(evidences, 'decision.created')
      .filter((e) => e.createdAt.getTime() >= cutoff)
      .map((e) => str(e.payload, 'area'))
      .filter((a): a is string => !!a && a !== 'geral'),
  )

  // CON-4.1 — kits: abertos = abertos menos concluídos; vencido = data no passado.
  const completedKits = new Set(
    ofKind(evidences, 'kit.completed')
      .map((e) => str(e.payload, 'kitId'))
      .filter((id): id is string => !!id),
  )
  const overdueKits = ofKind(evidences, 'kit.opened').filter((e) => {
    const kitId = str(e.payload, 'kitId')
    if (kitId && completedKits.has(kitId)) return false
    const due = str(e.payload, 'dueDate')
    return !!due && Date.parse(due) < now.getTime()
  })

  const trailUserIds = new Set(
    ofKind(evidences, 'trail.completed')
      .map((e) => str(e.payload, 'userId'))
      .filter((id): id is string => !!id),
  )

  const oldestGuide = str(kp, 'oldestGuideUpdatedAt')

  return {
    hasValidation: !!validation,
    validationFail: num(counts, 'fail') ?? 0,
    validationPresence: num(vp, 'presence') ?? 0,
    failedRuleIds,
    hasTemplate: ofKind(evidences, 'template.generated').length > 0,
    hasOrg: !!org,
    orgOwners: num(op, 'owners') ?? 0,
    orgAdmins: num(op, 'admins') ?? 0,
    orgPositions: num(op, 'positions') ?? 0,
    orgLeads: num(op, 'leads') ?? 0,
    orgLeadsFilled: num(op, 'leadsFilled') ?? 0,
    lastApprovedUserId: str(op, 'lastApprovedUserId'),
    decisions: num(kp, 'decisions') ?? 0,
    guides: num(kp, 'guides') ?? 0,
    trilhas: num(kinds, 'trilha') ?? 0,
    guidesWithoutOwner: num(kp, 'guidesWithoutOwner') ?? 0,
    oldestGuideStale: oldestGuide ? Date.parse(oldestGuide) < cutoff : false,
    guideTags: strList(kp, 'guideTags').map((t) => t.toLowerCase()),
    recentDecisionAreas: recentAreas.size,
    completedKits: completedKits.size,
    overdueKits: overdueKits.length,
    trailUserIds,
    seasonMilestones: num(season?.payload ?? {}, 'milestones') ?? 0,
  }
}

type Facts = ReturnType<typeof facts>

/**
 * Um check por critério `auto`. O teste de exaustividade (compute.test.ts) falha se
 * um critério automático entrar no catálogo sem check — ou se sobrar check órfão.
 */
const AUTO_CHECKS: Record<string, (f: Facts) => Check> = {
  'EST-1.1': (f) =>
    f.hasValidation
      ? { satisfied: true, reason: 'projeto da temporada com versão salva' }
      : NO_PROJECT,
  'EST-2.1': (f) =>
    !f.hasValidation
      ? NO_PROJECT
      : f.validationPresence === 0
        ? { satisfied: true, reason: 'sem pendências de presença na última versão' }
        : { satisfied: false, reason: `${f.validationPresence} pendências de presença` },
  'EST-3.1': (f) =>
    !f.hasValidation
      ? NO_PROJECT
      : f.validationFail === 0
        ? { satisfied: true, reason: 'zero infrações automáticas na última versão' }
        : { satisfied: false, reason: `${f.validationFail} infrações na última versão` },
  'DIN-2.1': (f) =>
    !f.hasValidation
      ? NO_PROJECT
      : !f.failedRuleIds.includes('SUSP.1')
        ? { satisfied: true, reason: 'ancoragens de suspensão apoiadas' }
        : { satisfied: false, reason: 'SUSP.1 com infração na última versão' },
  'DIN-2.2': (f) =>
    !f.hasValidation
      ? NO_PROJECT
      : !f.failedRuleIds.includes('STEER.1')
        ? { satisfied: true, reason: 'ancoragem da direção apoiada (ou não declarada)' }
        : { satisfied: false, reason: 'STEER.1 com infração na última versão' },
  'FAB-2.1': (f) =>
    f.hasTemplate
      ? { satisfied: true, reason: 'gabaritos gerados para o projeto da temporada' }
      : { satisfied: false, reason: 'nenhum gabarito gerado ainda' },
  'FAB-3.1': (f) =>
    f.guideTags.includes('solda')
      ? { satisfied: true, reason: 'guia com etiqueta "solda" publicado' }
      : { satisfied: false, reason: 'nenhum guia com etiqueta "solda"' },
  'GES-1.1': (f) =>
    !f.hasOrg
      ? { satisfied: false, reason: 'organograma ainda não criado' }
      : f.orgPositions > 0 && f.orgOwners === 1 && f.orgAdmins <= 2
        ? { satisfied: true, reason: 'capitania regular e organograma criado' }
        : {
            satisfied: false,
            reason:
              f.orgPositions === 0
                ? 'organograma ainda não criado'
                : `capitania irregular (${f.orgOwners} capitão/capitã, ${f.orgAdmins} co)`,
          },
  'GES-2.1': (f) =>
    !f.hasOrg || f.orgLeads === 0
      ? { satisfied: false, reason: 'nenhum cargo de liderança no organograma' }
      : f.orgLeadsFilled >= f.orgLeads
        ? { satisfied: true, reason: 'todos os cargos de liderança ocupados' }
        : {
            satisfied: false,
            reason: `${f.orgLeads - f.orgLeadsFilled} cargos de liderança sem ocupante`,
          },
  'GES-3.1': (f) =>
    f.seasonMilestones > 0
      ? { satisfied: true, reason: `temporada com ${f.seasonMilestones} marcos` }
      : { satisfied: false, reason: 'temporada sem marcos datados' },
  'CON-1.1': (f) =>
    f.decisions >= 1
      ? { satisfied: true, reason: `${f.decisions} decisões registradas` }
      : { satisfied: false, reason: 'nenhuma decisão registrada' },
  'CON-2.1': (f) =>
    f.decisions >= 10 && f.guides >= 2
      ? { satisfied: true, reason: `${f.decisions} decisões e ${f.guides} guias` }
      : { satisfied: false, reason: `${f.decisions}/10 decisões e ${f.guides}/2 guias` },
  'CON-2.2': (f) =>
    f.trilhas >= 1
      ? { satisfied: true, reason: 'trilha de integração publicada' }
      : { satisfied: false, reason: 'nenhuma trilha de integração publicada' },
  'CON-3.1': (f) =>
    !f.lastApprovedUserId
      ? { satisfied: false, reason: 'nenhum novato aprovado ainda' }
      : f.trailUserIds.has(f.lastApprovedUserId)
        ? { satisfied: true, reason: 'último novato aprovado concluiu a trilha' }
        : { satisfied: false, reason: 'o último novato aprovado não concluiu a trilha' },
  'CON-3.2': (f) =>
    f.recentDecisionAreas >= 3
      ? { satisfied: true, reason: `${f.recentDecisionAreas} áreas com decisão em 6 meses` }
      : { satisfied: false, reason: `${f.recentDecisionAreas}/3 áreas com decisão em 6 meses` },
  'CON-4.1': (f) =>
    f.completedKits === 0
      ? { satisfied: false, reason: 'nenhum kit de passagem concluído' }
      : f.overdueKits === 0
        ? { satisfied: true, reason: 'kits em dia' }
        : { satisfied: false, reason: `${f.overdueKits} kits abertos com saída vencida` },
  'CON-4.2': (f) =>
    f.guides === 0
      ? { satisfied: false, reason: 'nenhum guia publicado' }
      : f.guidesWithoutOwner > 0
        ? { satisfied: false, reason: `${f.guidesWithoutOwner} guias sem dono` }
        : f.oldestGuideStale
          ? { satisfied: false, reason: 'há guia sem atualização há mais de 6 meses' }
          : { satisfied: true, reason: 'todos os guias com dono e atualizados' },
}

export { AUTO_CHECKS }

function declaredCheck(criterion: Criterion, declared: Set<string>): Check {
  return declared.has(criterion.id)
    ? { satisfied: true, reason: 'declarado pela capitania' }
    : { satisfied: false, reason: 'ainda não declarado' }
}

/**
 * Nível da área = maior N tal que TODOS os critérios visíveis de nível ≤ N estão
 * satisfeitos (cumulativo, DF-13 §3.2). Área sem o nível 1 fechado fica em 0.
 */
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
  const declared = new Set(input.declarations.map((d) => d.criterionId))

  const areas: AreaResult[] = AREA_IDS.map((area: AreaId) => {
    const criteria: CriterionState[] = visibleCriteria(area).map((cr) => {
      const check =
        cr.type === 'auto'
          ? (AUTO_CHECKS[cr.id]?.(f) ?? { satisfied: false, reason: 'sem verificação definida' })
          : declaredCheck(cr, declared)
      return {
        id: cr.id,
        area: cr.area,
        level: cr.level,
        type: cr.type,
        label: cr.label,
        source: cr.source,
        satisfied: check.satisfied,
        reason: check.reason,
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

  return { catalogVersion: CATALOG_VERSION, areas, average, levels }
}

/** Conveniência para os testes e para os produtores. */
export function evidence(
  kind: Evidence['kind'],
  payload: Record<string, unknown>,
  createdAt: Date,
): Evidence {
  return { kind, payload, createdAt }
}

export { CATALOG, CATALOG_VERSION }
