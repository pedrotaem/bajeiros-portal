import { latest, num, obj, ofKind, str, strList } from './evidence'
import type { ComputeInput } from './types'

/**
 * Fatos derivados do fluxo de evidências, calculados UMA vez por equipe.
 *
 * Mora em módulo próprio porque agora tem dois consumidores: o cálculo de nível
 * (`compute.ts`) e as contraprovas do DF-20 (`counter.ts`). Tudo que depende do
 * relógio recebe `now` — o motor não chama Date.now() em lugar nenhum.
 */

export const SIX_MONTHS_MS = 182 * 24 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

/** Nomes de liderança que respondem por dinâmica e trem de força (DIN-1.1). */
const DYNAMICS_ROLE = /suspens|dire[cç]|trem de for[cç]a|powertrain|dinamic|din[âa]mic/i

export function facts(input: ComputeInput) {
  const { evidences, now } = input
  const validation = latest(evidences, 'validation.summary')
  const datasheet = latest(evidences, 'datasheet.summary')
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

  // DF-20 §2.3 — "rastro de operação no portal". A evidência mais nova de QUALQUER
  // produtor; `level.changed` e afins nunca chegam aqui (o carregador só traz os
  // kinds de estado e de evento), então o recálculo não reseta o relógio sozinho.
  const lastEvidenceAt = evidences.reduce<number | null>(
    (acc, e) => (acc === null || e.createdAt.getTime() > acc ? e.createdAt.getTime() : acc),
    null,
  )
  const daysSinceEvidence =
    lastEvidenceAt === null ? null : Math.floor((now.getTime() - lastEvidenceAt) / DAY_MS)

  const unfilledLeads = strList(op, 'unfilledLeads')

  return {
    hasValidation: !!validation,
    validationFail: num(counts, 'fail') ?? 0,
    validationPresence: num(vp, 'presence') ?? 0,
    validationMassKg: num(vp, 'massKg'),
    failedRuleIds,
    /** DF-21: a ficha é o segundo caminho do EST-1.1 — os dois valem igual. */
    hasDatasheet: !!datasheet,
    datasheetFilled: num(datasheet?.payload ?? {}, 'filled') ?? 0,
    hasTemplate: ofKind(evidences, 'template.generated').length > 0,
    hasOrg: !!org,
    orgOwners: num(op, 'owners') ?? 0,
    orgAdmins: num(op, 'admins') ?? 0,
    orgPositions: num(op, 'positions') ?? 0,
    orgLeads: num(op, 'leads') ?? 0,
    orgLeadsFilled: num(op, 'leadsFilled') ?? 0,
    unfilledLeads,
    dynamicsLeadVacant: unfilledLeads.some((n) => DYNAMICS_ROLE.test(n)),
    lastApprovedUserId: str(op, 'lastApprovedUserId'),
    hasKnowledge: !!knowledge,
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
    hasSeason: !!season,
    seasonMilestones: num(season?.payload ?? {}, 'milestones') ?? 0,
    daysSinceEvidence,
    community: input.community ?? null,
  }
}

export type Facts = ReturnType<typeof facts>
