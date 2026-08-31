import {
  RANKS,
  RANK_COHORT_FLOOR,
  RANK_GRACE_DAYS,
  computeRank,
  graceExpired,
  medianRankOf,
  rankDef,
} from '@bajeiros/evolution/ranks'
import { MASS_FLOOR } from '@bajeiros/evolution/counter'
import type {
  CommunityInput,
  CompetitionInput,
  EvolutionResult,
  RankNumber,
  RankResult,
} from '@bajeiros/evolution/types'
import type { DbClient } from '../../db'
import { recordEvidence } from './evidence'

// DF-18 — camada de aplicação das patentes. O CÁLCULO mora em
// `@bajeiros/evolution/ranks`; aqui só entram SQL, carência e histórico.
//
// A patente é DERIVADA (RF-1.3): `team_rank_state` existe porque a QUEDA espera 30
// dias (§3.5) e sem carimbo não há como saber quando a trava rompeu. Nenhuma outra
// razão justificaria materializar um número que o motor recalcula de graça.

/** RF-2.1 — versão do texto do painel de ativação; muda quando o que se lê muda. */
export const OPTIN_NOTICE_VERSION = '1.0.0'

export interface OptInState {
  enabled: boolean
  noticeVersion: string | null
  enabledAt: string | null
  enabledBy: string | null
  disabledAt: string | null
}

const OFF: OptInState = {
  enabled: false,
  noticeVersion: null,
  enabledAt: null,
  enabledBy: null,
  disabledAt: null,
}

export async function loadOptIn(db: DbClient, teamId: string): Promise<OptInState> {
  const r = await db.query(
    'SELECT enabled, notice_version, enabled_at, enabled_by, disabled_at FROM evolution_optin WHERE team_id = $1',
    [teamId],
  )
  const row = r.rows[0]
  if (!row) return OFF
  return {
    enabled: row.enabled === true,
    noticeVersion: (row.notice_version as string | null) ?? null,
    enabledAt: iso(row.enabled_at),
    enabledBy: (row.enabled_by as string | null) ?? null,
    disabledAt: iso(row.disabled_at),
  }
}

/**
 * RF-2.5 — desativar NÃO apaga: a linha vira `enabled = false` e declarações,
 * evidências e histórico ficam dormentes, voltando intactos na reativação.
 */
export async function setOptIn(
  db: DbClient,
  teamId: string,
  actorUserId: string,
  enabled: boolean,
): Promise<void> {
  await db.query(
    `INSERT INTO evolution_optin (team_id, enabled, notice_version, enabled_by, enabled_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (team_id) DO UPDATE
       SET enabled        = EXCLUDED.enabled,
           notice_version = EXCLUDED.notice_version,
           enabled_by     = CASE WHEN $2 THEN EXCLUDED.enabled_by ELSE evolution_optin.enabled_by END,
           enabled_at     = CASE WHEN $2 THEN now() ELSE evolution_optin.enabled_at END,
           disabled_by    = CASE WHEN $2 THEN NULL ELSE $4::uuid END,
           disabled_at    = CASE WHEN $2 THEN NULL ELSE now() END`,
    [teamId, enabled, OPTIN_NOTICE_VERSION, actorUserId],
  )
}

// ---------- acervo de competição (E3) ----------

const NO_COMPETITION: CompetitionInput = {
  linked: false,
  seasons: [],
  currentSeason: null,
  enduroPoints: null,
  enduroPresent: false,
  pointsTotal: null,
  median: null,
  medianSource: null,
  medianTeams: 0,
  position: null,
  fieldSize: null,
}

/** minúsculas, sem acento — mesma régua da ingestão do DF-15 (RF-3.3). */
function norm(v: unknown): string {
  return String(v ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/gi, '')
    .toLowerCase()
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

/**
 * RF-3.1 — lê `competition_results` da equipe VINCULADA. Sem vínculo aprovado a
 * trava 2 é falsa da patente 4 para cima e o teto é 5; o motivo devolvido é
 * `sem-vinculo`, que a UI converte no passo "vincular a equipe ao registro do
 * Brasil". Efeito colateral desejado: passar de 5 exige o claim que o DF-15 não
 * tinha como estimular.
 */
export async function loadCompetition(db: DbClient, teamId: string): Promise<CompetitionInput> {
  const link = await db.query('SELECT id FROM community_teams WHERE claimed_by_team_id = $1', [
    teamId,
  ])
  const communityTeamId = link.rows[0]?.id as string | undefined
  if (!communityTeamId) return NO_COMPETITION

  const results = await db.query(
    `SELECT c.id AS competition_id, c.season, r.position, r.points_total, r.points
     FROM competition_results r JOIN competitions c ON c.id = r.competition_id
     WHERE r.community_team_id = $1
     ORDER BY c.season DESC, c.ends_on DESC NULLS LAST`,
    [communityTeamId],
  )
  if (!results.rowCount) return { ...NO_COMPETITION, linked: true }

  const rows = results.rows
  const seasons = [...new Set(rows.map((r) => Number(r.season)))]
  const latest = rows[0]
  const competitionId = latest.competition_id as string

  // RF-3.3 — o rol de provas varia por edição: a chave é resolvida por
  // NORMALIZAÇÃO de nome, e a ausência da prova na edição vira `prova-ausente` em
  // vez de um falso negativo silencioso.
  const provas = await db.query(
    `SELECT DISTINCT k FROM competition_results r, LATERAL jsonb_object_keys(r.points) k
     WHERE r.competition_id = $1`,
    [competitionId],
  )
  const enduroPresent = provas.rows.some((p) => norm(p.k) === 'enduro')
  const points = asJson<Record<string, unknown>>(latest.points, {})
  const enduroKey = Object.keys(points).find((k) => norm(k) === 'enduro')
  const enduroRaw = enduroKey ? points[enduroKey] : null
  const enduroPoints = typeof enduroRaw === 'number' ? enduroRaw : null

  // RF-3.4 — mediana da COORTE com piso de 8; abaixo disso, mediana geral da
  // competição, e a régua usada volta na resposta para a tela poder declará-la.
  const stats = await db.query(
    `WITH res AS (
       SELECT r.community_team_id, r.points_total
       FROM competition_results r WHERE r.competition_id = $1
     ),
     minha AS (
       SELECT c_cohort FROM community_cohorts() WHERE c_community_team_id = $2
     ),
     coorte AS (
       SELECT res.points_total FROM res
       JOIN community_cohorts() co ON co.c_community_team_id = res.community_team_id
       WHERE co.c_cohort = (SELECT c_cohort FROM minha) AND res.points_total IS NOT NULL
     )
     SELECT (SELECT count(*)::int FROM res) AS field_size,
            (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY points_total)
             FROM res WHERE points_total IS NOT NULL) AS geral_median,
            (SELECT count(*)::int FROM coorte) AS cohort_teams,
            (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY points_total)
             FROM coorte) AS cohort_median`,
    [competitionId, communityTeamId],
  )
  const s = stats.rows[0] ?? {}
  const cohortTeams = Number(s.cohort_teams ?? 0)
  const cohortMedian = s.cohort_median != null ? Number(s.cohort_median) : null
  const geralMedian = s.geral_median != null ? Number(s.geral_median) : null
  const useCohort = cohortTeams >= RANK_COHORT_FLOOR && cohortMedian !== null

  return {
    linked: true,
    seasons,
    currentSeason: Math.max(...seasons),
    enduroPoints,
    enduroPresent,
    pointsTotal: latest.points_total != null ? Number(latest.points_total) : null,
    median: useCohort ? cohortMedian : geralMedian,
    medianSource: useCohort ? 'coorte' : geralMedian !== null ? 'geral' : null,
    medianTeams: useCohort ? cohortTeams : Number(s.field_size ?? 0),
    position: latest.position != null ? Number(latest.position) : null,
    fieldSize: s.field_size != null ? Number(s.field_size) : null,
  }
}

/**
 * DF-20 §2.2 — base de comparação de massa, por CLASSE do protótipo (ocupantes +
 * tração, os campos que o DF-21 §5.1 marca como comparáveis). Só é carregada em modo
 * `aferido`: no caminho quente do salvar, em modo declarado, seriam dois
 * round-trips a troco de nada.
 */
export async function loadCommunity(
  db: DbClient,
  projectId: string | null,
): Promise<CommunityInput> {
  const vazio: CommunityInput = { massMedianKg: null, massProjects: 0, classLabel: null }
  if (!projectId) return vazio
  const f = await db.query(
    `SELECT
       max(value #>> '{}') FILTER (WHERE field_id = 'id.ocupantes') AS ocupantes,
       max(value #>> '{}') FILTER (WHERE field_id = 'id.tracao')    AS tracao
     FROM project_fields
     WHERE project_id = $1 AND kind = 'design'
       AND field_id IN ('id.ocupantes', 'id.tracao')`,
    [projectId],
  )
  const ocupantes = (f.rows[0]?.ocupantes as string | null) ?? null
  const tracao = (f.rows[0]?.tracao as string | null) ?? null
  // P-1.4 — sem classe declarada não há comparação honesta, e a contraprova não existe
  if (!ocupantes || !tracao) return vazio

  const classLabel = `${ocupantes}/${tracao}`
  const m = await db.query('SELECT * FROM evolution_mass_median($1)', [classLabel])
  const projects = Number(m.rows[0]?.m_projects ?? 0)
  return {
    classLabel,
    massProjects: projects,
    massMedianKg:
      projects >= MASS_FLOOR && m.rows[0]?.m_median != null ? Number(m.rows[0].m_median) : null,
  }
}

// ---------- estado, carência e histórico (E4) ----------

interface RankStateRow {
  rank: RankNumber | null
  seasonLabel: string | null
  brokenSince: Date | null
  brokenTarget: RankNumber | null
  catalogVersion: string | null
}

async function loadState(db: DbClient, teamId: string): Promise<RankStateRow | null> {
  const r = await db.query(
    `SELECT rank, season_label, broken_since, broken_target, catalog_version
     FROM team_rank_state WHERE team_id = $1`,
    [teamId],
  )
  const row = r.rows[0]
  if (!row) return null
  return {
    rank: row.rank != null ? (Number(row.rank) as RankNumber) : null,
    seasonLabel: (row.season_label as string | null) ?? null,
    brokenSince: row.broken_since ? new Date(row.broken_since as string) : null,
    brokenTarget: row.broken_target != null ? (Number(row.broken_target) as RankNumber) : null,
    catalogVersion: (row.catalog_version as string | null) ?? null,
  }
}

export interface RankRecomputeOptions {
  now?: Date
  actorUserId?: string | null
  seasonLabel?: string | null
  seasonProjectId?: string | null
  competition?: CompetitionInput
}

export interface RankOutcome {
  /** A patente vigente DEPOIS de aplicar a carência — é a que a tela mostra. */
  rank: RankNumber | null
  computed: RankResult
  brokenSince: string | null
  brokenTarget: RankNumber | null
  /** Quando a queda vira efetiva, se a trava seguir rompida (§3.5). */
  graceEndsAt: string | null
  promotedTo: RankNumber | null
}

/**
 * §3.5 — assimetria deliberada, e é onde esta feature se afasta do DF-13:
 *
 *  - **sobe na hora**: a evidência entra, o nível recomputa, a patente sobe junto;
 *  - **cai com 30 dias de carência**: o nível da área continua caindo imediatamente e
 *    honestamente (ADR-010 dec. 3 não muda), mas o EMBLEMA guarda `broken_since` e só
 *    desce se a trava ainda estiver rompida 30 dias depois. Consertou antes, nunca
 *    desceu — e é o que impede o incentivo perverso de "não salve a versão com
 *    problema" de dobrar;
 *  - **a maior patente alcançada nunca cai**: fica no histórico, com a temporada e a
 *    capitania da época.
 *
 * RF-4.5: o recálculo diário do DF-13 passa a resolver a carência aqui. Nenhum
 * agendador novo — esta função roda em todo recompute.
 */
export async function recomputeRank(
  db: DbClient,
  teamId: string,
  evo: EvolutionResult,
  opts: RankRecomputeOptions = {},
): Promise<RankOutcome> {
  const now = opts.now ?? new Date()
  const seasonLabel = opts.seasonLabel ?? null
  const seasonProjectId = opts.seasonProjectId ?? null
  const competition = opts.competition ?? (await loadCompetition(db, teamId))

  const computed = computeRank({
    optIn: true,
    seasonProjectId,
    levels: evo.levels,
    competition,
  })

  const prev = await loadState(db, teamId)
  const vigente = prev?.rank ?? null
  const alvo = computed.rank

  let rank = vigente
  let brokenSince: Date | null = prev?.brokenSince ?? null
  let brokenTarget: RankNumber | null = prev?.brokenTarget ?? null
  let promotedTo: RankNumber | null = null
  let historyReason: 'promocao' | 'queda' | 'catalogo' | 'reativacao' | null = null

  if (alvo === null) {
    // sem protótipo da temporada não há unidade avaliada (§3.1): nada sobe nem cai
    rank = vigente
  } else if (vigente === null) {
    rank = alvo
    historyReason = 'promocao'
    promotedTo = alvo
    brokenSince = null
    brokenTarget = null
  } else if (alvo < vigente) {
    // patente MENOR = melhor. Sobe na hora.
    rank = alvo
    historyReason = 'promocao'
    promotedTo = alvo
    brokenSince = null
    brokenTarget = null
  } else if (alvo > vigente) {
    if (!brokenSince) {
      brokenSince = now
      brokenTarget = alvo
    } else {
      brokenTarget = alvo
    }
    if (graceExpired(brokenSince, now)) {
      rank = alvo
      historyReason = 'queda'
      brokenSince = null
      brokenTarget = null
    }
  } else {
    // RF-4.2 — voltou a atingir a patente vigente: limpa a carência, sem evento,
    // sem ruído. A equipe consertou antes do prazo e nunca desceu.
    brokenSince = null
    brokenTarget = null
  }

  await db.query(
    `INSERT INTO team_rank_state
       (team_id, rank, season_label, broken_since, broken_target, catalog_version, computed_at)
     VALUES ($1, $2, $3, $4, $5, $6, now())
     ON CONFLICT (team_id) DO UPDATE
       SET rank = EXCLUDED.rank, season_label = EXCLUDED.season_label,
           broken_since = EXCLUDED.broken_since, broken_target = EXCLUDED.broken_target,
           catalog_version = EXCLUDED.catalog_version, computed_at = now()`,
    [teamId, rank, seasonLabel, brokenSince, brokenTarget, evo.catalogVersion],
  )

  if (historyReason && rank !== null) {
    await db.query(
      `INSERT INTO team_rank_history
         (team_id, rank, previous_rank, season_label, project_id, reason, catalog_version)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [teamId, rank, vigente, seasonLabel, seasonProjectId, historyReason, evo.catalogVersion],
    )
    // RF-4.3 — a mudança efetiva vira evidência e entra na atividade da equipe.
    // Queda NUNCA abre o aviso de tela cheia (RF-5.4): vira linha discreta aqui.
    await recordEvidence(db, {
      teamId,
      source: 'evolution',
      kind: 'rank.changed',
      payload: {
        from: vigente,
        to: rank,
        reason: historyReason,
        name: rankDef(rank).nome,
        catalogVersion: evo.catalogVersion,
        seasonLabel,
      },
      projectId: seasonProjectId,
      actorUserId: opts.actorUserId ?? null,
    })
  }

  return {
    rank,
    computed,
    brokenSince: brokenSince ? brokenSince.toISOString() : null,
    brokenTarget,
    graceEndsAt: brokenSince
      ? new Date(brokenSince.getTime() + RANK_GRACE_DAYS * 86_400_000).toISOString()
      : null,
    promotedTo,
  }
}

// ---------- leitura para a API ----------

export async function loadRankHistory(db: DbClient, teamId: string) {
  const r = await db.query(
    `SELECT rank, previous_rank, season_label, reason, catalog_version, changed_at
     FROM team_rank_history WHERE team_id = $1 ORDER BY changed_at DESC LIMIT 100`,
    [teamId],
  )
  return r.rows.map((row) => ({
    rank: Number(row.rank),
    previousRank: row.previous_rank != null ? Number(row.previous_rank) : null,
    name: rankDef(Number(row.rank) as RankNumber).nome,
    seasonLabel: (row.season_label as string | null) ?? null,
    reason: row.reason,
    catalogVersion: row.catalog_version,
    changedAt: row.changed_at,
  }))
}

/** §3.5 — a maior patente alcançada (1 é a melhor, então é o MÍNIMO). */
export async function bestRank(db: DbClient, teamId: string): Promise<RankNumber | null> {
  const r = await db.query('SELECT min(rank) AS best FROM team_rank_history WHERE team_id = $1', [
    teamId,
  ])
  const best = r.rows[0]?.best
  return best != null ? (Number(best) as RankNumber) : null
}

/**
 * RF-5.1 — o aviso de promoção é mostrado UMA VEZ POR MEMBRO. Quem já viu não vê de
 * novo, e `POST /rank/seen` silencia só para quem chamou (AC-DF18.10).
 */
export async function unseenPromotion(
  db: DbClient,
  teamId: string,
  userId: string,
  rank: RankNumber | null,
): Promise<{ from: number | null; to: RankNumber; at: string } | null> {
  if (rank === null) return null
  const seen = await db.query(
    'SELECT rank FROM team_rank_seen WHERE team_id = $1 AND user_id = $2',
    [teamId, userId],
  )
  const lastSeen = seen.rows[0]?.rank != null ? Number(seen.rows[0].rank) : null
  // primeira visita de quem nunca viu nada: só há promoção a anunciar se a equipe
  // já subiu de patente alguma vez (senão todo mundo abriria o aviso do Motorats)
  const last = await db.query(
    `SELECT rank, previous_rank, changed_at FROM team_rank_history
     WHERE team_id = $1 AND reason = 'promocao' ORDER BY changed_at DESC LIMIT 1`,
    [teamId],
  )
  const row = last.rows[0]
  if (!row) return null
  const to = Number(row.rank) as RankNumber
  if (to !== rank) return null
  if (lastSeen !== null && lastSeen <= to) return null
  return {
    from: row.previous_rank != null ? Number(row.previous_rank) : null,
    to,
    at: String(row.changed_at),
  }
}

export async function markRankSeen(
  db: DbClient,
  teamId: string,
  userId: string,
  rank: RankNumber,
): Promise<void> {
  await db.query(
    `INSERT INTO team_rank_seen (team_id, user_id, rank, seen_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (team_id, user_id) DO UPDATE SET rank = EXCLUDED.rank, seen_at = now()`,
    [teamId, userId, rank],
  )
}

/**
 * RF-6.2 — vitrine do perfil público: SÓ emblema, número, nome e temporada. Níveis
 * por área, critérios, declarações e fila nunca são publicáveis, e não existe
 * listagem ordenada por patente (RF-6.3).
 */
export async function rankShowcase(db: DbClient, teamId: string) {
  const r = await db.query('SELECT * FROM team_rank_showcase($1)', [teamId])
  const row = r.rows[0]
  if (!row || row.r_rank == null) return null
  const n = Number(row.r_rank) as RankNumber
  const best = row.r_best != null ? (Number(row.r_best) as RankNumber) : null
  return {
    rank: n,
    name: rankDef(n).nome,
    emblem: rankDef(n).emblema,
    seasonLabel: (row.r_season as string | null) ?? null,
    best: row.r_history_public && best !== null ? { rank: best, name: rankDef(best).nome } : null,
  }
}

/** Serialização canônica do degrau — a tela IMPORTA daqui, nunca reescreve (RF-1.4). */
export function serializeRank(n: RankNumber) {
  const def = rankDef(n)
  return {
    n: def.n,
    id: def.id,
    name: def.nome,
    freeName: def.nomeLivre,
    reading: def.leitura,
    emblem: def.emblema,
  }
}

export const RANK_LADDER = RANKS.map((r) => serializeRank(r.n))

export { medianRankOf, RANK_GRACE_DAYS }

function iso(v: unknown): string | null {
  if (!v) return null
  const d = v instanceof Date ? v : new Date(String(v))
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}
