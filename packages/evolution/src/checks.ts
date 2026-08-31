import type { Facts } from './facts'

/**
 * O que o portal MEDE, por critério.
 *
 * Mudou de papel no DF-19: no v1.0.0 estes checks DECIDIAM o critério `auto`; na
 * v2.0.0 eles são a MEDIDA que aparece ao lado da resposta da equipe (RF-1.3) e a
 * base das contraprovas do DF-20. Quem decide o nível é a declaração — enquanto
 * `CATALOG_MODE` for `'declarado'`, sempre; em `'aferido'`, até uma contraprova
 * disparar.
 *
 * O teste de exaustividade (catalog.test.ts) falha se um critério `auto` entrar no
 * catálogo sem check — ou se sobrar check órfão.
 */
export interface Check {
  satisfied: boolean
  reason: string
}

const NO_PROJECT: Check = {
  satisfied: false,
  reason: 'nenhuma versão salva do projeto da temporada',
}

export const AUTO_CHECKS: Record<string, (f: Facts) => Check> = {
  'EST-1.1': (f) =>
    f.hasValidation
      ? { satisfied: true, reason: 'projeto da temporada com versão salva' }
      : f.datasheetFilled > 0
        ? { satisfied: true, reason: `ficha do protótipo com ${f.datasheetFilled} campos` }
        : { satisfied: false, reason: 'sem versão salva e sem ficha preenchida' },
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

/** A medida do critério, quando o portal mede. `null` = só a equipe sabe. */
export function measure(criterionId: string, f: Facts): Check | null {
  return AUTO_CHECKS[criterionId]?.(f) ?? null
}
