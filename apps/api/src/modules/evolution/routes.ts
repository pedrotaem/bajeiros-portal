import { Hono } from 'hono'
import { z } from 'zod'
import { AREA_IDS, AREA_LABELS, levelName } from '@bajeiros/evolution/areas'
import { CATALOG_VERSION, criterionById } from '@bajeiros/evolution/catalog'
import { destinationFor } from '@bajeiros/evolution/destinations'
import { MAX_RANK, RANK_GRACE_DAYS, medianRankOf } from '@bajeiros/evolution/ranks'
import type { EvolutionResult, RankNumber } from '@bajeiros/evolution/types'
import { withUser, type DbClient } from '../../db'
import { problem } from '../../problem'
import { audit, clientIp } from '../../audit'
import { can } from '../../policy'
import { lockTeam, myRole } from '../teams/shared'
import type { AuthEnv } from '../../auth/middleware'
import {
  catalogMode,
  recomputeTeam,
  recomputeTeamFull,
  recordEvidence,
  syncSeasonProjectStep,
  type TeamEvolution,
} from './engine'
import {
  OPTIN_NOTICE_VERSION,
  RANK_LADDER,
  bestRank,
  loadOptIn,
  loadRankHistory,
  markRankSeen,
  serializeRank,
  setOptIn,
  unseenPromotion,
} from './rank'

// DF-13/DF-19/DF-20 — API da evolução, e DF-18 — API das patentes. Montada em
// /api/v1/teams (rotas por equipe) e /api/v1/evolution (benchmark, que não é de uma
// equipe só).
//
// DF-18 RF-2.5 / AC-DF18.2: **sem opt-in, nenhuma resposta carrega nível ou
// patente.** O painel de ativação é o que a tela recebe no lugar — com o que será
// lido, nas palavras da spec (RF-2.3).

export const evolution = new Hono<AuthEnv>()
export const evolutionRoot = new Hono<AuthEnv>()

/** Piso de coorte: abaixo disso a linha de benchmark não aparece (RF-7.2 / P-5.2). */
export const COHORT_FLOOR = 8

const MAX_MANUAL_STEPS = 100
const MAX_MILESTONES = 12

// ---------- leitura ----------

/**
 * RF-2.3 — o painel pré-ativação lista, com as palavras da tela, O QUE SERÁ LIDO.
 * Nada de conteúdo de decisão sai da equipe: o motor conta, não lê. Mudar esta lista
 * é mudar `OPTIN_NOTICE_VERSION`, senão ninguém saberia quem aceitou o quê.
 */
const OPTIN_NOTICE = {
  version: OPTIN_NOTICE_VERSION,
  title: 'O que a avaliação de maturidade lê',
  reads: [
    'a última versão salva do protótipo da temporada (contagens do validador, nunca a geometria)',
    'o organograma e a capitania — quantos cargos existem e quantos têm ocupante',
    'os contadores do diário e dos guias: quantos, de quem, quando foram atualizados',
    'os resultados públicos de competição, se e quando houver vínculo com o registro do Brasil',
  ],
  neverReads: [
    'o texto das suas decisões e dos seus guias',
    'a geometria do seu projeto',
    'qualquer coisa que apareça para outra equipe sem você ligar a vitrine',
  ],
  retroactive:
    'Ativar recomputa na hora o que a equipe já produziu — ninguém encara um painel zerado.',
  reversible:
    'Desativar é simétrico: patente e níveis somem da tela e param de recomputar, e nada é apagado.',
}

evolution.get('/:id/evolution', async (c) => {
  const { sub } = c.get('auth')
  const teamId = c.req.param('id')
  const result = await withUser(sub, async (db) => {
    const role = await myRole(db, teamId, sub)
    if (!role) return 'notfound' as const
    const optIn = await loadOptIn(db, teamId)
    if (!optIn.enabled) return { optIn, canOptIn: can(role, 'evolution.optin') } as const
    const season = await loadSeason(db, teamId)
    await syncSeasonProjectStep(db, teamId, !!season?.seasonProjectId)
    // O GET recomputa: os critérios com janela temporal (CON-3.2/4.1/4.2) expiram
    // sem evidência nova, e o recálculo diário pode não ter rodado ainda (RF-2.3).
    // Só escreve quando algo mudou de verdade.
    const full = await recomputeTeamFull(db, teamId, { actorUserId: sub })
    const rank = await rankBlock(db, teamId, sub, full)
    return { full, season, rank, canOptIn: can(role, 'evolution.optin') } as const
  })
  if (result === 'notfound') return problem(c, 404, 'Equipe não encontrada')
  if ('optIn' in result) return c.json(offPayload(result.canOptIn))
  return c.json({
    optIn: true,
    ...toEvolution(result.full.result),
    rank: result.rank,
    season: result.season,
    canOptIn: result.canOptIn,
    bootstrap: !result.season?.seasonProjectId,
  })
})

/**
 * AC-DF18.2 — equipe sem opt-in não tem patente NEM níveis em resposta nenhuma. O
 * que volta é o convite, e ele diz exatamente o que a avaliação vai ler.
 */
function offPayload(canOptIn: boolean) {
  return {
    optIn: false,
    canOptIn,
    notice: OPTIN_NOTICE,
    catalogVersion: CATALOG_VERSION,
    mode: catalogMode(),
    average: null,
    areas: [],
    rank: null,
    season: null,
    bootstrap: false,
  }
}

function toEvolution(evo: EvolutionResult) {
  return {
    catalogVersion: evo.catalogVersion,
    mode: evo.mode,
    average: evo.average,
    floor: evo.floor,
    // RF-4.4 — "6 critérios vencem com a temporada 2027": a tela avisa ANTES
    expiring: evo.expiring,
    // DF-20 RF-4.3 — quando dispara, substitui a tela inteira por um aviso só
    activityFloor: evo.activityFloor,
    areas: evo.areas.map((a) => ({
      area: a.area,
      label: AREA_LABELS[a.area],
      level: a.level,
      levelName: levelName(a.level),
      criteria: a.criteria.map(toCriterion),
      pending: a.pending.map((cr) => cr.id),
    })),
  }
}

function toCriterion(cr: EvolutionResult['areas'][number]['criteria'][number]) {
  const def = criterionById(cr.id)
  return {
    id: cr.id,
    level: cr.level,
    type: cr.type,
    label: cr.label,
    source: cr.source,
    satisfied: cr.satisfied,
    reason: cr.reason,
    state: cr.state,
    // DF-19 §3 — os quatro textos são canônicos no pacote; a tela não reescreve
    question: def?.question ?? cr.label,
    fulfilled: def?.fulfilled ?? '',
    notValid: def?.notValid ?? '',
    where: def?.where ?? '',
    audit: def?.audit ?? { wave: null, note: '' },
    seasonal: cr.seasonal,
    expired: cr.expired,
    // RF-1.3 — a medida do portal aparece ao lado da resposta, sem veredito
    measured: cr.measured,
    divergent: cr.divergent,
    // DF-20 — só existem em modo `aferido`
    counterCheck: cr.counterCheck,
    notComparable: cr.notComparable,
    reaffirmable: cr.reaffirmable,
    linkHint: cr.linkHint ?? null,
    destination: destinationFor(cr.id),
  }
}

/**
 * DF-18 §7 — o bloco da faixa da patente: emblema vigente, próxima com o que falta,
 * carência em curso, maior patente alcançada e a mediana da coorte EM EMBLEMA.
 */
async function rankBlock(db: DbClient, teamId: string, sub: string, full: TeamEvolution) {
  const outcome = full.rank
  if (!outcome) return null
  const n = outcome.rank
  const bench = (await db.query('SELECT * FROM evolution_benchmark(90)', [])).rows
  const benchmark = toBenchmark(bench)
  const best = await bestRank(db, teamId)
  const visibility = (
    await db.query('SELECT rank_public, rank_history_public FROM teams WHERE id = $1', [teamId])
  ).rows[0]

  return {
    rank: n === null ? null : serializeRank(n),
    max: MAX_RANK,
    reason: outcome.computed.reason,
    average: outcome.computed.average,
    floor: outcome.computed.floor,
    seasonLabel: full.season.label,
    seasonProjectId: full.season.projectId,
    next: outcome.computed.next
      ? {
          ...serializeRank(outcome.computed.next.n),
          block: outcome.computed.next.block,
          maturity: outcome.computed.next.maturity,
          competition: outcome.computed.next.competition,
        }
      : null,
    // §3.5 — a queda é amortecida: a tela diz até quando dá para consertar
    grace:
      outcome.brokenSince && outcome.brokenTarget
        ? {
            since: outcome.brokenSince,
            target: serializeRank(outcome.brokenTarget),
            endsAt: outcome.graceEndsAt,
            days: RANK_GRACE_DAYS,
          }
        : null,
    best: best === null ? null : serializeRank(best),
    // §7 — "a mediana da sua coorte é The Peacemaker" (só maturidade; ver o motor)
    cohort:
      benchmark.visible && benchmark.average !== null
        ? { ...serializeRank(medianRankOf(benchmark.average)), teams: benchmark.teams }
        : null,
    promotion: await unseenPromotion(db, teamId, sub, n),
    visibility: {
      rankPublic: visibility?.rank_public === true,
      rankHistoryPublic: visibility?.rank_history_public === true,
    },
    ladder: RANK_LADDER,
  }
}

// ---------- declarações (RF-3.x) ----------

const declareBody = z.object({
  note: z.string().trim().max(500).optional(),
  linkKind: z.enum(['decision', 'guide', 'project', 'url']).optional(),
  linkRef: z.string().trim().max(500).optional(),
})

evolution.post('/:id/evolution/declarations/:cid', async (c) => {
  const parsed = declareBody.safeParse((await c.req.json().catch(() => null)) ?? {})
  if (!parsed.success) return problem(c, 400, 'Body inválido', parsed.error.message)
  const { sub } = c.get('auth')
  const teamId = c.req.param('id')
  const criterionId = c.req.param('cid')

  // DF-19 RF-1.1 — na v2.0.0 TODO critério é respondível pela equipe, inclusive os
  // que o portal também mede: o `type` virou rótulo de tela, não porteiro.
  const criterion = criterionById(criterionId)
  if (!criterion) return problem(c, 404, 'Critério não encontrado')

  const result = await withUser(sub, async (db) => {
    if (!(await lockTeam(db, teamId))) return 'notfound' as const
    const role = await myRole(db, teamId, sub)
    if (!role) return 'notfound' as const
    if (!can(role, 'evolution.declare')) return 'forbidden' as const
    if (!(await loadOptIn(db, teamId)).enabled) return 'no-optin' as const

    // RF-4.4 — o rótulo da temporada carimba a resposta: critério sazonal vence na
    // virada e precisa ser reafirmado.
    const season = await loadSeason(db, teamId)
    await db.query(
      `INSERT INTO evolution_declarations
         (team_id, criterion_id, note, link_kind, link_ref, declared_by, season_label)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (team_id, criterion_id) DO UPDATE
         SET note = EXCLUDED.note, link_kind = EXCLUDED.link_kind,
             link_ref = EXCLUDED.link_ref, declared_by = EXCLUDED.declared_by,
             season_label = EXCLUDED.season_label,
             reaffirmed_at = NULL, reaffirmed_by = NULL,
             reaffirmed_season = NULL, reaffirm_note = NULL,
             declared_at = now()`,
      [
        teamId,
        criterionId,
        parsed.data.note ?? null,
        parsed.data.linkKind ?? null,
        parsed.data.linkRef ?? null,
        sub,
        season?.label ?? null,
      ],
    )
    await recordEvidence(db, {
      teamId,
      source: 'evolution',
      kind: 'criterion.declared',
      payload: { criterionId, area: criterion.area, label: criterion.label },
      actorUserId: sub,
    })
    await audit(db, {
      actorUserId: sub,
      action: 'evolution.declare',
      resourceType: 'team',
      resourceId: teamId,
      ip: clientIp(c.req.raw.headers),
      metadata: { criterionId },
    })
    return { evo: await recomputeTeam(db, teamId, { actorUserId: sub }) }
  })

  if (result === 'notfound') return problem(c, 404, 'Equipe não encontrada')
  if (result === 'no-optin') return optInRequired(c)
  if (result === 'forbidden')
    return problem(c, 403, 'Sem permissão', 'Apenas a capitania declara critérios.')
  return c.json(toEvolution(result.evo))
})

evolution.delete('/:id/evolution/declarations/:cid', async (c) => {
  const { sub } = c.get('auth')
  const teamId = c.req.param('id')
  const criterionId = c.req.param('cid')

  const result = await withUser(sub, async (db) => {
    if (!(await lockTeam(db, teamId))) return 'notfound' as const
    const role = await myRole(db, teamId, sub)
    if (!role) return 'notfound' as const
    if (!can(role, 'evolution.declare')) return 'forbidden' as const
    const r = await db.query(
      'DELETE FROM evolution_declarations WHERE team_id = $1 AND criterion_id = $2 RETURNING criterion_id',
      [teamId, criterionId],
    )
    if (!r.rowCount) return 'no-declaration' as const
    await audit(db, {
      actorUserId: sub,
      action: 'evolution.revoke',
      resourceType: 'team',
      resourceId: teamId,
      ip: clientIp(c.req.raw.headers),
      metadata: { criterionId },
    })
    return { evo: await recomputeTeam(db, teamId, { actorUserId: sub }) }
  })

  if (result === 'notfound') return problem(c, 404, 'Equipe não encontrada')
  if (result === 'no-declaration') return problem(c, 404, 'Declaração não encontrada')
  if (result === 'forbidden')
    return problem(c, 403, 'Sem permissão', 'Apenas a capitania revoga declarações.')
  return c.json(toEvolution(result.evo))
})

// ---------- reafirmação de indício (DF-20 E3) ----------

const reaffirmBody = z.object({ note: z.string().trim().min(3).max(500) })

/**
 * DF-20 RF-3.3 — responder a um INDÍCIO com justificativa devolve a declaração ao
 * cálculo, e a nota fica no histórico, visível ao lado do critério para sempre.
 *
 * RF-3.2 — contradição direta **não** admite reafirmação (AC-DF20.5): o caminho é
 * consertar o dado. Reafirmar ali seria pedir ao portal que ignorasse o que ele
 * mesmo mediu.
 */
evolution.post('/:id/evolution/declarations/:cid/reaffirm', async (c) => {
  const parsed = reaffirmBody.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) {
    return problem(
      c,
      400,
      'Justificativa obrigatória',
      'Reafirmar um indício exige a nota que explica o número medido — é ela que a próxima geração lê no lugar de repetir a dúvida.',
    )
  }
  const { sub } = c.get('auth')
  const teamId = c.req.param('id')
  const criterionId = c.req.param('cid')
  if (!criterionById(criterionId)) return problem(c, 404, 'Critério não encontrado')

  const result = await withUser(sub, async (db) => {
    if (!(await lockTeam(db, teamId))) return 'notfound' as const
    const role = await myRole(db, teamId, sub)
    if (!role) return 'notfound' as const
    if (!can(role, 'evolution.declare')) return 'forbidden' as const
    if (!(await loadOptIn(db, teamId)).enabled) return 'no-optin' as const

    const full = await recomputeTeamFull(db, teamId, { actorUserId: sub })
    const criterion = full.result.areas
      .flatMap((a) => a.criteria)
      .find((cr) => cr.id === criterionId)
    if (!criterion || criterion.state === 'revogada') return 'no-declaration' as const
    if (!criterion.counterCheck) return 'nothing-to-answer' as const
    if (!criterion.reaffirmable) return 'not-reaffirmable' as const

    const season = await loadSeason(db, teamId)
    await db.query(
      `UPDATE evolution_declarations
       SET reaffirmed_at = now(), reaffirmed_by = $3,
           reaffirmed_season = $4, reaffirm_note = $5
       WHERE team_id = $1 AND criterion_id = $2`,
      [teamId, criterionId, sub, season?.label ?? null, parsed.data.note],
    )
    await audit(db, {
      actorUserId: sub,
      action: 'evolution.reaffirm',
      resourceType: 'team',
      resourceId: teamId,
      ip: clientIp(c.req.raw.headers),
      metadata: { criterionId, kind: criterion.counterCheck.kind },
    })
    return { evo: await recomputeTeam(db, teamId, { actorUserId: sub }) }
  })

  if (result === 'notfound') return problem(c, 404, 'Equipe não encontrada')
  if (result === 'no-optin') return optInRequired(c)
  if (result === 'no-declaration') return problem(c, 404, 'Declaração não encontrada')
  if (result === 'forbidden')
    return problem(c, 403, 'Sem permissão', 'Apenas a capitania responde a uma contraprova.')
  if (result === 'nothing-to-answer')
    return problem(c, 409, 'Nada a responder', 'Este critério não está em contraprova.')
  if (result === 'not-reaffirmable') {
    return problem(
      c,
      400,
      'Contradição não se reafirma',
      'O portal mediu o mesmo fato que o critério afirma. O caminho é consertar o dado — salvar a versão conforme, criar o organograma —, não justificar.',
    )
  }
  return c.json(toEvolution(result.evo))
})

// ---------- opt-in da avaliação (DF-18 E2) ----------

function optInRequired(c: Parameters<typeof problem>[0]) {
  return problem(
    c,
    409,
    'Avaliação não ativada',
    'A capitania precisa ativar a avaliação de maturidade antes de responder critérios.',
  )
}

const optInBody = z.object({ noticeVersion: z.string().trim().max(20).optional() })

/**
 * RF-2.4 — a ativação é RETROATIVA e responde na mesma requisição: o motor lê o que a
 * equipe já produziu e devolve nível e patente na hora. Ninguém encara um painel
 * zerado pedindo formulário. Isso é requisito, não otimização.
 */
evolution.post('/:id/evolution/optin', async (c) => {
  const parsed = optInBody.safeParse((await c.req.json().catch(() => null)) ?? {})
  if (!parsed.success) return problem(c, 400, 'Body inválido', parsed.error.message)
  const { sub } = c.get('auth')
  const teamId = c.req.param('id')

  const result = await withUser(sub, async (db) => {
    if (!(await lockTeam(db, teamId))) return 'notfound' as const
    const role = await myRole(db, teamId, sub)
    if (!role) return 'notfound' as const
    if (!can(role, 'evolution.optin')) return 'forbidden' as const

    const antes = await loadOptIn(db, teamId)
    await setOptIn(db, teamId, sub, true)
    const season = await loadSeason(db, teamId)
    await syncSeasonProjectStep(db, teamId, !!season?.seasonProjectId)
    const full = await recomputeTeamFull(db, teamId, { actorUserId: sub })
    // reativação: o histórico não zerou, e a patente volta ao mesmo lugar (RF-2.5)
    await audit(db, {
      actorUserId: sub,
      action: 'evolution.optin',
      resourceType: 'team',
      resourceId: teamId,
      ip: clientIp(c.req.raw.headers),
      metadata: { noticeVersion: OPTIN_NOTICE_VERSION, reactivation: antes.enabledAt !== null },
    })
    return {
      full,
      season,
      rank: await rankBlock(db, teamId, sub, full),
      canOptIn: true,
    } as const
  })

  if (result === 'notfound') return problem(c, 404, 'Equipe não encontrada')
  if (result === 'forbidden') {
    return problem(
      c,
      403,
      'Sem permissão',
      'Apenas a capitania ativa a avaliação de maturidade — peça a quem capitaneia.',
    )
  }
  return c.json({
    optIn: true,
    ...toEvolution(result.full.result),
    rank: result.rank,
    season: result.season,
    canOptIn: true,
    bootstrap: !result.season?.seasonProjectId,
  })
})

/** RF-2.5 — desativar é simétrico e reversível: nada é apagado, tudo fica dormente. */
evolution.delete('/:id/evolution/optin', async (c) => {
  const { sub } = c.get('auth')
  const teamId = c.req.param('id')

  const result = await withUser(sub, async (db) => {
    if (!(await lockTeam(db, teamId))) return 'notfound' as const
    const role = await myRole(db, teamId, sub)
    if (!role) return 'notfound' as const
    if (!can(role, 'evolution.optin')) return 'forbidden' as const
    await setOptIn(db, teamId, sub, false)
    await audit(db, {
      actorUserId: sub,
      action: 'evolution.optout',
      resourceType: 'team',
      resourceId: teamId,
      ip: clientIp(c.req.raw.headers),
      metadata: {},
    })
    return 'ok' as const
  })

  if (result === 'notfound') return problem(c, 404, 'Equipe não encontrada')
  if (result === 'forbidden')
    return problem(c, 403, 'Sem permissão', 'Apenas a capitania desativa a avaliação.')
  return c.json(offPayload(true))
})

// ---------- patente (DF-18 E4/E5/E6) ----------

evolution.get('/:id/rank', async (c) => {
  const { sub } = c.get('auth')
  const teamId = c.req.param('id')
  const result = await withUser(sub, async (db) => {
    if (!(await myRole(db, teamId, sub))) return 'notfound' as const
    if (!(await loadOptIn(db, teamId)).enabled) return 'off' as const
    const full = await recomputeTeamFull(db, teamId, { actorUserId: sub })
    return await rankBlock(db, teamId, sub, full)
  })
  if (result === 'notfound') return problem(c, 404, 'Equipe não encontrada')
  if (result === 'off') return c.json({ optIn: false, rank: null })
  return c.json({ optIn: true, ...result })
})

/** RF-4.4 — o histórico é a marca que sobrevive à formatura da turma. */
evolution.get('/:id/rank/history', async (c) => {
  const { sub } = c.get('auth')
  const teamId = c.req.param('id')
  const rows = await withUser(sub, async (db) => {
    if (!(await myRole(db, teamId, sub))) return null
    return { history: await loadRankHistory(db, teamId), best: await bestRank(db, teamId) }
  })
  if (!rows) return problem(c, 404, 'Equipe não encontrada')
  return c.json({
    history: rows.history,
    best: rows.best === null ? null : serializeRank(rows.best),
  })
})

const visibilityBody = z.object({
  rankPublic: z.boolean().optional(),
  rankHistoryPublic: z.boolean().optional(),
})

/**
 * RF-6.1/6.4 — as duas chaves da vitrine nascem `false` e desligar é imediato, sem
 * notificar ninguém. O que a vitrine expõe é SÓ emblema, número e temporada (RF-6.2);
 * níveis, critérios e fila nunca são publicáveis, e não existe listagem ordenada de
 * equipes por patente (RF-6.3).
 */
evolution.patch('/:id/rank/visibility', async (c) => {
  const parsed = visibilityBody.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return problem(c, 400, 'Body inválido', parsed.error.message)
  const { sub } = c.get('auth')
  const teamId = c.req.param('id')

  const result = await withUser(sub, async (db) => {
    if (!(await lockTeam(db, teamId))) return 'notfound' as const
    const role = await myRole(db, teamId, sub)
    if (!role) return 'notfound' as const
    if (!can(role, 'evolution.optin')) return 'forbidden' as const
    const r = await db.query(
      `UPDATE teams
       SET rank_public = COALESCE($2, rank_public),
           rank_history_public = COALESCE($3, rank_history_public)
       WHERE id = $1 RETURNING rank_public, rank_history_public`,
      [teamId, parsed.data.rankPublic ?? null, parsed.data.rankHistoryPublic ?? null],
    )
    await audit(db, {
      actorUserId: sub,
      action: 'rank.visibility',
      resourceType: 'team',
      resourceId: teamId,
      ip: clientIp(c.req.raw.headers),
      metadata: { ...parsed.data },
    })
    return r.rows[0]
  })

  if (result === 'notfound') return problem(c, 404, 'Equipe não encontrada')
  if (result === 'forbidden')
    return problem(c, 403, 'Sem permissão', 'Apenas a capitania mexe na vitrine da equipe.')
  return c.json({
    rankPublic: result.rank_public === true,
    rankHistoryPublic: result.rank_history_public === true,
  })
})

const seenBody = z.object({ rank: z.number().int().min(1).max(MAX_RANK) })

/** RF-5.1 — silenciar o aviso é POR MEMBRO: não afeta os outros (AC-DF18.10). */
evolution.post('/:id/rank/seen', async (c) => {
  const parsed = seenBody.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return problem(c, 400, 'Body inválido', parsed.error.message)
  const { sub } = c.get('auth')
  const teamId = c.req.param('id')
  const ok = await withUser(sub, async (db) => {
    if (!(await myRole(db, teamId, sub))) return false
    await markRankSeen(db, teamId, sub, parsed.data.rank as RankNumber)
    return true
  })
  if (!ok) return problem(c, 404, 'Equipe não encontrada')
  return c.body(null, 204)
})

// ---------- fila de próximos passos (RF-4.x) ----------

evolution.get('/:id/evolution/steps', async (c) => {
  const { sub } = c.get('auth')
  const teamId = c.req.param('id')
  const status = c.req.query('status') ?? 'open'
  if (!['open', 'done', 'dismissed', 'all'].includes(status))
    return problem(c, 400, 'Filtro inválido', 'status: open | done | dismissed | all')

  const rows = await withUser(sub, async (db) => {
    if (!(await myRole(db, teamId, sub))) return null
    const r = await db.query(
      `SELECT * FROM evolution_steps
       WHERE team_id = $1 AND ($2 = 'all' OR status = $2)
       ORDER BY position, created_at
       LIMIT 200`,
      [teamId, status],
    )
    return r.rows
  })
  if (!rows) return problem(c, 404, 'Equipe não encontrada')
  return c.json(rows.map(toStep))
})

const createStepBody = z.object({
  title: z.string().trim().min(1).max(140),
  area: z.enum(AREA_IDS as unknown as [string, ...string[]]).optional(),
  origin: z.enum(['manual', 'meta']).optional(),
  linkRef: z.string().trim().max(500).optional(),
})

evolution.post('/:id/evolution/steps', async (c) => {
  const parsed = createStepBody.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return problem(c, 400, 'Body inválido', parsed.error.message)
  const { sub } = c.get('auth')
  const teamId = c.req.param('id')
  const origin = parsed.data.origin ?? 'manual'

  const result = await withUser(sub, async (db) => {
    const role = await myRole(db, teamId, sub)
    if (!role) return 'notfound' as const
    // meta vem do benchmark (DF-15 RF-3.3) e é ato de capitania, não de qualquer membro
    if (origin === 'meta' && !can(role, 'step.manage')) return 'forbidden' as const
    const n = await db.query(
      `SELECT count(*)::int AS n FROM evolution_steps
       WHERE team_id = $1 AND origin <> 'criterion' AND status = 'open'`,
      [teamId],
    )
    if (Number(n.rows[0].n) >= MAX_MANUAL_STEPS) return 'limit' as const
    const r = await db.query(
      `INSERT INTO evolution_steps (team_id, title, area, origin, link_ref, created_by, position)
       VALUES ($1, $2, $3, $4, $5, $6, 0) RETURNING *`,
      [
        teamId,
        parsed.data.title,
        parsed.data.area ?? null,
        origin,
        parsed.data.linkRef ?? null,
        sub,
      ],
    )
    await audit(db, {
      actorUserId: sub,
      action: 'evolution.step.create',
      resourceType: 'team',
      resourceId: teamId,
      ip: clientIp(c.req.raw.headers),
      metadata: { origin },
    })
    return r.rows[0]
  })

  if (result === 'notfound') return problem(c, 404, 'Equipe não encontrada')
  if (result === 'forbidden')
    return problem(c, 403, 'Sem permissão', 'Metas da temporada são definidas pela capitania.')
  if (result === 'limit')
    return problem(c, 409, 'Fila cheia', `Máximo de ${MAX_MANUAL_STEPS} passos abertos.`)
  return c.json(toStep(result), 201)
})

const patchStepBody = z.object({
  ownerUserId: z.string().uuid().nullable().optional(),
  position: z.number().int().min(0).max(999).optional(),
  status: z.enum(['open', 'done', 'dismissed']).optional(),
})

evolution.patch('/:id/evolution/steps/:sid', async (c) => {
  const parsed = patchStepBody.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return problem(c, 400, 'Body inválido', parsed.error.message)
  const { sub } = c.get('auth')
  const teamId = c.req.param('id')
  const stepId = c.req.param('sid')
  const body = parsed.data

  const result = await withUser(sub, async (db) => {
    if (!(await lockTeam(db, teamId))) return 'notfound' as const
    const role = await myRole(db, teamId, sub)
    if (!role) return 'notfound' as const
    const cur = await db.query(
      'SELECT owner_user_id, criterion_id FROM evolution_steps WHERE id = $1 AND team_id = $2',
      [stepId, teamId],
    )
    if (!cur.rowCount) return 'no-step' as const

    const manages = can(role, 'step.manage')
    const isOwner = cur.rows[0].owner_user_id === sub
    // dono/ordem/descarte é capitania; concluir é de quem carrega o passo (RF-4.3)
    if ((body.ownerUserId !== undefined || body.position !== undefined) && !manages)
      return 'forbidden' as const
    if (body.status !== undefined && !manages && !(isOwner && body.status === 'done'))
      return 'forbidden' as const

    if (body.ownerUserId) {
      const m = await db.query('SELECT 1 FROM team_members WHERE team_id = $1 AND user_id = $2', [
        teamId,
        body.ownerUserId,
      ])
      if (!m.rowCount) return 'bad-owner' as const
    }

    const r = await db.query(
      `UPDATE evolution_steps SET
         owner_user_id = CASE WHEN $3::boolean THEN $4 ELSE owner_user_id END,
         position      = COALESCE($5, position),
         status        = COALESCE($6, status),
         done_at       = CASE WHEN $6 = 'done' THEN now()
                              WHEN $6 IS NOT NULL THEN NULL ELSE done_at END,
         done_by       = CASE WHEN $6 = 'done' THEN $7::uuid
                              WHEN $6 IS NOT NULL THEN NULL ELSE done_by END
       WHERE id = $1 AND team_id = $2 RETURNING *`,
      [
        stepId,
        teamId,
        body.ownerUserId !== undefined,
        body.ownerUserId ?? null,
        body.position ?? null,
        body.status ?? null,
        sub,
      ],
    )
    await audit(db, {
      actorUserId: sub,
      action: 'evolution.step.update',
      resourceType: 'team',
      resourceId: teamId,
      ip: clientIp(c.req.raw.headers),
      metadata: { stepId, ...body },
    })
    return r.rows[0]
  })

  if (result === 'notfound') return problem(c, 404, 'Equipe não encontrada')
  if (result === 'no-step') return problem(c, 404, 'Passo não encontrado')
  if (result === 'bad-owner') return problem(c, 400, 'Dono inválido', 'A pessoa não é da equipe.')
  if (result === 'forbidden')
    return problem(c, 403, 'Sem permissão', 'Apenas a capitania organiza a fila.')
  return c.json(toStep(result))
})

function toStep(row: Record<string, unknown>) {
  const criterionId = (row.criterion_id as string | null) ?? null
  return {
    id: row.id,
    title: row.title,
    area: row.area ?? null,
    origin: row.origin,
    criterionId,
    linkRef: row.link_ref ?? null,
    ownerUserId: row.owner_user_id ?? null,
    position: Number(row.position ?? 0),
    status: row.status,
    destination: criterionId ? destinationFor(criterionId) : null,
    createdAt: row.created_at,
    doneAt: row.done_at ?? null,
  }
}

// ---------- temporada (RF-5.x) ----------

const milestone = z.object({
  title: z.string().trim().min(1).max(120),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'data no formato AAAA-MM-DD'),
})

const seasonBody = z.object({
  label: z.string().trim().min(1).max(20),
  seasonProjectId: z.string().uuid().nullable().optional(),
  milestones: z.array(milestone).max(MAX_MILESTONES).optional(),
  competitionIds: z.array(z.string().uuid()).max(MAX_MILESTONES).optional(),
})

export interface SeasonView {
  label: string
  seasonProjectId: string | null
  milestones: { title: string; date: string }[]
  competitionIds: string[]
  next: { title: string; date: string; daysLeft: number } | null
  updatedAt: string | null
}

export async function loadSeason(db: DbClient, teamId: string): Promise<SeasonView | null> {
  const r = await db.query('SELECT * FROM team_season WHERE team_id = $1', [teamId])
  if (!r.rowCount) return null
  return toSeason(r.rows[0])
}

function toSeason(row: Record<string, unknown>): SeasonView {
  const milestones = asJson<{ title: string; date: string }[]>(row.milestones, [])
  return {
    label: row.label as string,
    seasonProjectId: (row.season_project_id as string | null) ?? null,
    milestones,
    competitionIds: asJson<string[]>(row.competition_ids, []),
    next: nextMilestone(milestones, new Date()),
    updatedAt: (row.updated_at as string | null) ?? null,
  }
}

function asJson<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T
    } catch {
      return fallback
    }
  }
  return value as T
}

/** "faltam N dias para X" — próximo marco futuro (RF-5.3, consumido pelo Início). */
export function nextMilestone(
  milestones: { title: string; date: string }[],
  now: Date,
): { title: string; date: string; daysLeft: number } | null {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const future = milestones
    .filter((m) => Date.parse(`${m.date}T00:00:00Z`) >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
  const next = future[0]
  if (!next) return null
  const daysLeft = Math.round((Date.parse(`${next.date}T00:00:00Z`) - today) / 86_400_000)
  return { title: next.title, date: next.date, daysLeft }
}

evolution.get('/:id/season', async (c) => {
  const { sub } = c.get('auth')
  const teamId = c.req.param('id')
  const season = await withUser(sub, async (db) => {
    if (!(await myRole(db, teamId, sub))) return 'notfound' as const
    return await loadSeason(db, teamId)
  })
  if (season === 'notfound') return problem(c, 404, 'Equipe não encontrada')
  return c.json(season)
})

evolution.put('/:id/season', async (c) => {
  const parsed = seasonBody.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return problem(c, 400, 'Body inválido', parsed.error.message)
  const { sub } = c.get('auth')
  const teamId = c.req.param('id')
  const milestones = parsed.data.milestones ?? []

  const result = await withUser(sub, async (db) => {
    if (!(await lockTeam(db, teamId))) return 'notfound' as const
    const role = await myRole(db, teamId, sub)
    if (!role) return 'notfound' as const
    if (!can(role, 'evolution.season')) return 'forbidden' as const

    // validação ANTES de qualquer escrita: retorno normal faz COMMIT (lição do DF-10)
    if (parsed.data.seasonProjectId) {
      const p = await db.query('SELECT 1 FROM projects WHERE id = $1 AND owner_team_id = $2', [
        parsed.data.seasonProjectId,
        teamId,
      ])
      if (!p.rowCount) return 'bad-project' as const
    }

    await db.query(
      `INSERT INTO team_season (team_id, label, season_project_id, milestones, competition_ids)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)
       ON CONFLICT (team_id) DO UPDATE
         SET label = EXCLUDED.label,
             season_project_id = EXCLUDED.season_project_id,
             milestones = EXCLUDED.milestones,
             competition_ids = EXCLUDED.competition_ids,
             updated_at = now()`,
      [
        teamId,
        parsed.data.label,
        parsed.data.seasonProjectId ?? null,
        JSON.stringify(milestones),
        JSON.stringify(parsed.data.competitionIds ?? []),
      ],
    )
    await recordEvidence(db, {
      teamId,
      source: 'evolution',
      kind: 'season.configured',
      payload: {
        label: parsed.data.label,
        milestones: milestones.length,
        seasonProjectId: parsed.data.seasonProjectId ?? null,
      },
      projectId: parsed.data.seasonProjectId ?? null,
      actorUserId: sub,
    })
    await syncSeasonProjectStep(db, teamId, !!parsed.data.seasonProjectId)
    await audit(db, {
      actorUserId: sub,
      action: 'evolution.season.update',
      resourceType: 'team',
      resourceId: teamId,
      ip: clientIp(c.req.raw.headers),
      metadata: { label: parsed.data.label, milestones: milestones.length },
    })
    await recomputeTeam(db, teamId, { actorUserId: sub })
    return await loadSeason(db, teamId)
  })

  if (result === 'notfound') return problem(c, 404, 'Equipe não encontrada')
  if (result === 'forbidden')
    return problem(c, 403, 'Sem permissão', 'Apenas a capitania configura a temporada.')
  if (result === 'bad-project')
    return problem(c, 400, 'Projeto inválido', 'O projeto da temporada precisa ser da equipe.')
  return c.json(result)
})

// ---------- atividade (feed) ----------

/** Kinds narráveis: resumo de estado (org/knowledge) é ruído, não notícia (DF-16 §8.2). */
const NARRATABLE = [
  'validation.summary',
  'level.changed',
  // DF-18 RF-5.4: a QUEDA de patente vira linha discreta aqui, nunca tela cheia
  'rank.changed',
  // DF-20 RF-4.4: "Estrutura voltou ao nível 2 — a v14 introduziu 3 não conformidades"
  'counter.raised',
  'counter.cleared',
  'season.configured',
  'criterion.declared',
  'template.generated',
  'decision.created',
  'guide.published',
  'trail.completed',
  'kit.opened',
  'kit.completed',
  'competition.result',
]

export async function loadActivity(
  db: DbClient,
  teamId: string,
  limit: number,
  before?: string,
): Promise<Record<string, unknown>[]> {
  const r = await db.query(
    `SELECT id, source, kind, payload, project_id, snapshot_seq, actor_user_id, created_at
     FROM evolution_evidence
     WHERE team_id = $1
       AND kind IN (SELECT jsonb_array_elements_text($2::jsonb))
       AND ($3::timestamptz IS NULL OR created_at < $3::timestamptz)
     ORDER BY created_at DESC
     LIMIT $4`,
    [teamId, JSON.stringify(NARRATABLE), before ?? null, limit],
  )
  return r.rows.map((row) => ({
    id: row.id,
    source: row.source,
    kind: row.kind,
    payload: asJson<Record<string, unknown>>(row.payload, {}),
    projectId: row.project_id ?? null,
    snapshotSeq: row.snapshot_seq ?? null,
    actorUserId: row.actor_user_id ?? null,
    createdAt: row.created_at,
  }))
}

evolution.get('/:id/activity', async (c) => {
  const { sub } = c.get('auth')
  const teamId = c.req.param('id')
  const limit = Math.min(Number(c.req.query('limit') ?? 20) || 20, 50)
  const before = c.req.query('before')
  const rows = await withUser(sub, async (db) => {
    if (!(await myRole(db, teamId, sub))) return null
    return await loadActivity(db, teamId, limit, before)
  })
  if (!rows) return problem(c, 404, 'Equipe não encontrada')
  return c.json(rows)
})

// ---------- evidência declarativa do cliente ----------

const templateBody = z.object({ projectId: z.string().uuid() })

evolution.post('/:id/evolution/events/template-generated', async (c) => {
  const parsed = templateBody.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return problem(c, 400, 'Body inválido', parsed.error.message)
  const { sub } = c.get('auth')
  const teamId = c.req.param('id')

  const result = await withUser(sub, async (db) => {
    if (!(await myRole(db, teamId, sub))) return 'notfound' as const
    const season = await loadSeason(db, teamId)
    // Gabarito de outro projeto não é evidência da temporada (§3.4).
    if (season?.seasonProjectId !== parsed.data.projectId) return 'not-season' as const
    await recordEvidence(db, {
      teamId,
      source: 'web',
      kind: 'template.generated',
      payload: { projectId: parsed.data.projectId },
      projectId: parsed.data.projectId,
      actorUserId: sub,
    })
    await recomputeTeam(db, teamId, { actorUserId: sub })
    return 'ok' as const
  })

  if (result === 'notfound') return problem(c, 404, 'Equipe não encontrada')
  if (result === 'not-season')
    return problem(
      c,
      409,
      'Projeto fora da temporada',
      'Só o projeto designado como o da temporada gera evidência.',
    )
  return c.body(null, 204)
})

// ---------- benchmark (RF-7.x) ----------

evolution.get('/:id/evolution/benchmark', async (c) => {
  const { sub } = c.get('auth')
  const teamId = c.req.param('id')
  const rows = await withUser(sub, async (db) => {
    if (!(await myRole(db, teamId, sub))) return null
    return (await db.query('SELECT * FROM evolution_benchmark(90)', [])).rows
  })
  if (!rows) return problem(c, 404, 'Equipe não encontrada')
  return c.json(toBenchmark(rows))
})

evolutionRoot.get('/benchmark', async (c) => {
  const { sub } = c.get('auth')
  const rows = await withUser(
    sub,
    async (db) => (await db.query('SELECT * FROM evolution_benchmark(90)', [])).rows,
  )
  return c.json(toBenchmark(rows))
})

/**
 * Piso de 8 equipes: abaixo disso a mediana identifica gente. A resposta diz
 * `visible: false` em vez de mentir um número — a UI simplesmente não desenha a linha.
 */
export function toBenchmark(rows: Record<string, unknown>[]) {
  const teams = Math.max(0, ...rows.map((r) => Number(r.b_teams ?? 0)))
  if (teams < COHORT_FLOOR) {
    return { visible: false, floor: COHORT_FLOOR, teams, cohort: 'geral', areas: {}, average: null }
  }
  const areas: Record<string, number> = {}
  let average: number | null = null
  for (const r of rows) {
    const median = Math.round(Number(r.b_median) * 10) / 10
    if (r.b_area === '__media') average = median
    else areas[r.b_area as string] = median
  }
  return { visible: true, floor: COHORT_FLOOR, teams, cohort: 'geral', areas, average }
}

export { CATALOG_VERSION }
