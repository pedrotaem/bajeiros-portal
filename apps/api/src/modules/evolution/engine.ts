import { computeLevels } from '@bajeiros/evolution/compute'
import { CATALOG_MODE, CATALOG_VERSION, criterionById } from '@bajeiros/evolution/catalog'
import { AREA_IDS } from '@bajeiros/evolution/areas'
import { DESIGNATE_PROJECT_STEP } from '@bajeiros/evolution/destinations'
import type {
  AreaId,
  CatalogMode,
  Declaration,
  Evidence,
  EvidenceKind,
  EvolutionResult,
} from '@bajeiros/evolution/types'
import type { OrgSummary, ValidationSummary } from '@bajeiros/evolution/evidence'
import type { RuleResult } from '@bajeiros/core/rules/b6'
import type { DbClient } from '../../db'
import { env } from '../../env'
import { recordEvidence, type EvidenceInput } from './evidence'
import { loadCommunity, loadOptIn, recomputeRank, type OptInState, type RankOutcome } from './rank'

// Camada de aplicação do DF-13: grava evidência, recomputa níveis e sincroniza a
// fila de passos. O CÁLCULO mora no pacote puro `@bajeiros/evolution` — aqui só
// entram SQL e transação.
//
// RF-2.3: gravar evidência recomputa os níveis NA MESMA TRANSAÇÃO. Por isso todo
// caminho quente aqui é contado em statements: sob Data API cada um é um
// round-trip, e o salvar do editor não pode pagar por isso. Daí as listas irem
// como jsonb num único statement em vez de um laço de N queries.
//
// Arrays SQL não passam pelo driver Data API (ele manda array como JSON) — a
// travessia canônica do repo é `$n::jsonb` + jsonb_array_elements_text.

/** Kinds cujo ÚLTIMO registro é o estado (o resto é evento e conta acumulado). */
const LATEST_KINDS: EvidenceKind[] = [
  'validation.summary',
  'datasheet.summary',
  'org.summary',
  'knowledge.summary',
  'season.configured',
  'template.generated',
]

/** Eventos que o motor lê acumulados (janelas temporais e contagens de kit/trilha). */
const EVENT_KINDS: EvidenceKind[] = [
  'decision.created',
  'trail.completed',
  'kit.opened',
  'kit.completed',
]

export { recordEvidence }
export type { EvidenceInput }

/**
 * DF-19 AC-10 — o modo é do AMBIENTE, com o default do catálogo. Virar `'aferido'`
 * liga as contraprovas do DF-20 sem migração nenhuma: é o mesmo dado, outro cálculo.
 */
export function catalogMode(): CatalogMode {
  return env('EVOLUTION_MODE') === 'aferido' ? 'aferido' : CATALOG_MODE
}

async function loadEvidences(db: DbClient, teamId: string): Promise<Evidence[]> {
  // DISTINCT ON pega só a linha mais recente de cada kind de estado — o histórico
  // completo não cabe (nem é preciso) no caminho quente do salvar.
  const latest = await db.query(
    `SELECT DISTINCT ON (kind) kind, payload, created_at
     FROM evolution_evidence
     WHERE team_id = $1 AND kind IN (SELECT jsonb_array_elements_text($2::jsonb))
     ORDER BY kind, created_at DESC`,
    [teamId, JSON.stringify(LATEST_KINDS)],
  )
  const events = await db.query(
    `SELECT kind, payload, created_at FROM evolution_evidence
     WHERE team_id = $1 AND kind IN (SELECT jsonb_array_elements_text($2::jsonb))
     ORDER BY created_at`,
    [teamId, JSON.stringify(EVENT_KINDS)],
  )
  return [...latest.rows, ...events.rows].map(toEvidence)
}

export function toEvidence(row: Record<string, unknown>): Evidence {
  const payload = row.payload
  return {
    kind: row.kind as EvidenceKind,
    payload:
      typeof payload === 'string'
        ? (JSON.parse(payload) as Record<string, unknown>)
        : ((payload ?? {}) as Record<string, unknown>),
    createdAt: new Date(row.created_at as string),
  }
}

interface StoredDeclaration extends Declaration {
  divergent: boolean
}

export async function loadDeclarations(db: DbClient, teamId: string): Promise<StoredDeclaration[]> {
  const r = await db.query(
    `SELECT criterion_id, declared_at, season_label, divergent, link_ref,
            reaffirmed_at, reaffirmed_season
     FROM evolution_declarations WHERE team_id = $1`,
    [teamId],
  )
  return r.rows.map((row) => ({
    criterionId: row.criterion_id as string,
    declaredAt: new Date(row.declared_at as string),
    seasonLabel: (row.season_label as string | null) ?? null,
    divergent: row.divergent === true,
    hasLink: !!row.link_ref,
    reaffirmedAt: row.reaffirmed_at ? new Date(row.reaffirmed_at as string) : null,
    reaffirmedSeason: (row.reaffirmed_season as string | null) ?? null,
  }))
}

/** Rótulo e protótipo da temporada — as duas coisas que o cálculo precisa saber. */
export async function seasonContext(
  db: DbClient,
  teamId: string,
): Promise<{ label: string | null; projectId: string | null }> {
  const r = await db.query('SELECT label, season_project_id FROM team_season WHERE team_id = $1', [
    teamId,
  ])
  const row = r.rows[0]
  return {
    label: (row?.label as string | null) ?? null,
    projectId: (row?.season_project_id as string | null) ?? null,
  }
}

export interface RecomputeOptions {
  now?: Date
  actorUserId?: string | null
  syncQueue?: boolean
}

export interface TeamEvolution {
  result: EvolutionResult
  optIn: OptInState
  season: { label: string | null; projectId: string | null }
  rank: RankOutcome | null
}

/**
 * Recomputa os níveis da equipe, grava `level.changed` por área que mudou, resolve a
 * patente (com a carência do DF-18 §3.5) e sincroniza a fila. Idempotente: rodar de
 * novo sem evidência nova não grava nada — nem evento, nem passo duplicado (P-3.1).
 *
 * DF-18 RF-2.5 — **sem opt-in nada é persistido**: o cálculo roda (é ele que a
 * ativação retroativa devolve na hora, RF-2.4), mas níveis, eventos, fila e patente
 * não são escritos e não aparecem em resposta nenhuma de API (AC-DF18.2). A evidência
 * continua sendo produzida por todos os produtores — é o que faz a ativação devolver
 * resultado em vez de um painel zerado.
 */
export async function recomputeTeamFull(
  db: DbClient,
  teamId: string,
  opts: RecomputeOptions = {},
): Promise<TeamEvolution> {
  const now = opts.now ?? new Date()
  const mode = catalogMode()
  const optIn = await loadOptIn(db, teamId)
  const season = await seasonContext(db, teamId)
  const evidences = await loadEvidences(db, teamId)
  const declarations = await loadDeclarations(db, teamId)
  const community = mode === 'aferido' ? await loadCommunity(db, season.projectId) : undefined
  const result = computeLevels({
    evidences,
    declarations,
    now,
    mode,
    seasonLabel: season.label,
    community,
  })

  if (!optIn.enabled) return { result, optIn, season, rank: null }

  await persistDivergences(db, teamId, result, declarations)

  const stored = await db.query(
    'SELECT area, level, catalog_version FROM evolution_levels WHERE team_id = $1',
    [teamId],
  )
  const before = new Map(
    stored.rows.map((r) => [
      r.area as string,
      { level: Number(r.level), version: r.catalog_version as string },
    ]),
  )

  for (const area of result.areas) {
    const prev = before.get(area.area)
    // Nada mudou: nenhum write. O salvar do editor não paga por 6 UPDATEs à toa.
    if (prev && prev.level === area.level && prev.version === result.catalogVersion) continue

    await db.query(
      `INSERT INTO evolution_levels (team_id, area, level, catalog_version, computed_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (team_id, area)
       DO UPDATE SET level = EXCLUDED.level,
                     catalog_version = EXCLUDED.catalog_version,
                     computed_at = now()`,
      [teamId, area.area, area.level, result.catalogVersion],
    )

    // Nível igual ao anterior: só a versão do catálogo mudou, não é notícia.
    // `prev` ausente com nível 0 é a PRIMEIRA computação da equipe — narrar isso
    // como "voltou para o nível 0" enche a atividade de queda que nunca aconteceu.
    const de = prev?.level ?? 0
    if (de === area.level) continue
    // Queda é sinal, não erro: o evento diz O QUE derrubou (DF-13 §3.5, P-1.3).
    //
    // `fromCatalog` separa os dois motivos de uma queda, que a equipe lê de formas
    // MUITO diferentes: "perdemos evidência" × "o catálogo mudou a régua". Sem essa
    // distinção, publicar o v2.0.0 enche a atividade de seis quedas que a equipe não
    // causou e não entende — exatamente o delta que o DF-19 §7 manda explicar.
    await recordEvidence(db, {
      teamId,
      source: 'evolution',
      kind: 'level.changed',
      payload: {
        area: area.area,
        from: de,
        to: area.level,
        catalogVersion: result.catalogVersion,
        fromCatalog: prev ? prev.version !== result.catalogVersion : false,
        previousCatalogVersion: prev?.version ?? null,
        because: area.pending.slice(0, 3).map((p) => ({ id: p.id, reason: p.reason })),
      },
      actorUserId: opts.actorUserId ?? null,
    })
  }

  if (mode === 'aferido') await narrateCounters(db, teamId, result, opts.actorUserId ?? null)
  if (opts.syncQueue !== false) await syncSteps(db, teamId, result)

  // A patente lê níveis JÁ calculados (DF-20 RF-1.4) e resolve a carência aqui —
  // o recálculo diário do DF-13 RF-2.3 passa a cobrir o DF-18 RF-4.5 de graça.
  const rank = await recomputeRank(db, teamId, result, {
    now,
    actorUserId: opts.actorUserId ?? null,
    seasonLabel: season.label,
    seasonProjectId: season.projectId,
  })
  return { result, optIn, season, rank }
}

/** Compatibilidade com os produtores, que só querem os níveis de volta. */
export async function recomputeTeam(
  db: DbClient,
  teamId: string,
  opts: RecomputeOptions = {},
): Promise<EvolutionResult> {
  return (await recomputeTeamFull(db, teamId, opts)).result
}

/**
 * DF-20 RF-2.2 — disparo e cessação de contraprova viram evidência, e é ela que
 * alimenta a narração de uma linha na atividade (RF-4.4).
 *
 * O estado "em contraprova" NÃO é coluna (RF-2.1): ele depende da evidência do
 * momento. Para saber se é NOVIDADE, a comparação é com o próprio log — a última
 * `counter.raised`/`counter.cleared` de cada critério. Uma query, e só em modo
 * `aferido`: em modo declarado esta função nem é chamada.
 */
async function narrateCounters(
  db: DbClient,
  teamId: string,
  result: EvolutionResult,
  actorUserId: string | null,
): Promise<void> {
  const last = await db.query(
    `SELECT DISTINCT ON (payload ->> 'criterionId')
            payload ->> 'criterionId' AS criterion_id, kind
     FROM evolution_evidence
     WHERE team_id = $1 AND kind IN ('counter.raised', 'counter.cleared')
     ORDER BY payload ->> 'criterionId', created_at DESC`,
    [teamId],
  )
  const raised = new Set(
    last.rows.filter((r) => r.kind === 'counter.raised').map((r) => r.criterion_id as string),
  )

  for (const c of result.areas.flatMap((a) => a.criteria)) {
    const firing = !!c.counterCheck
    if (firing === raised.has(c.id)) continue
    await recordEvidence(db, {
      teamId,
      source: 'evolution',
      kind: firing ? 'counter.raised' : 'counter.cleared',
      payload: {
        criterionId: c.id,
        area: c.area,
        label: c.label,
        kind: c.counterCheck?.kind ?? null,
        message: c.counterCheck?.message ?? null,
        measured: c.counterCheck?.measured ?? null,
      },
      actorUserId,
    })
  }
}

/**
 * DF-19 RF-1.3 — grava a divergência entre a resposta da equipe e a medida do
 * portal. Um único statement, e só quando o conjunto MUDA: é dado de calibração do
 * DF-20, não pode custar um UPDATE por critério no caminho quente do salvar.
 */
async function persistDivergences(
  db: DbClient,
  teamId: string,
  result: EvolutionResult,
  stored: StoredDeclaration[],
): Promise<void> {
  const before = new Map(stored.map((d) => [d.criterionId, d.divergent]))
  const changed = result.areas
    .flatMap((a) => a.criteria)
    .filter((c) => before.has(c.id) && before.get(c.id) !== c.divergent)
    .map((c) => ({ criterion_id: c.id, divergent: c.divergent }))
  if (!changed.length) return
  await db.query(
    `UPDATE evolution_declarations d SET divergent = s.divergent
     FROM jsonb_to_recordset($2::jsonb) AS s(criterion_id text, divergent boolean)
     WHERE d.team_id = $1 AND d.criterion_id = s.criterion_id`,
    [teamId, JSON.stringify(changed)],
  )
}

/**
 * Fila = critérios pendentes do PRÓXIMO nível (RF-4.1). Passo de critério é
 * derivado, não digitado: nasce, conclui-se sozinho quando o critério é satisfeito
 * e reabre quando o nível cai. O que tem dono NUNCA some sem aviso — some só o
 * passo órfão que saiu do horizonte.
 */
async function syncSteps(db: DbClient, teamId: string, result: EvolutionResult): Promise<void> {
  const pending = result.areas.flatMap((area) =>
    area.pending.map((cr) => ({
      title: cr.label,
      area: cr.area as AreaId,
      criterion_id: cr.id,
      position: cr.level * 10 + AREA_IDS.indexOf(area.area),
    })),
  )
  const satisfied = result.areas.flatMap((a) =>
    a.criteria.filter((c) => c.satisfied).map((c) => c.id),
  )

  if (pending.length) {
    await db.query(
      `INSERT INTO evolution_steps (team_id, title, area, origin, criterion_id, position)
       SELECT $1, s.title, s.area, 'criterion', s.criterion_id, s.position
       FROM jsonb_to_recordset($2::jsonb)
            AS s(title text, area text, criterion_id text, position integer)
       ON CONFLICT (team_id, criterion_id) DO UPDATE
         SET title   = EXCLUDED.title,
             status  = CASE WHEN evolution_steps.status = 'dismissed'
                            THEN 'dismissed' ELSE 'open' END,
             done_at = NULL,
             done_by = NULL`,
      [teamId, JSON.stringify(pending)],
    )
  }

  if (satisfied.length) {
    await db.query(
      `UPDATE evolution_steps SET status = 'done', done_at = now()
       WHERE team_id = $1 AND origin = 'criterion' AND status = 'open'
         AND criterion_id IN (SELECT jsonb_array_elements_text($2::jsonb))`,
      [teamId, JSON.stringify(satisfied)],
    )
  }

  // Critério que saiu do horizonte (nível caiu, catálogo mudou) e ninguém pegou.
  const keep = [
    ...pending.map((p) => p.criterion_id),
    ...satisfied,
    DESIGNATE_PROJECT_STEP.criterionId,
  ]
  await db.query(
    `DELETE FROM evolution_steps
     WHERE team_id = $1 AND origin = 'criterion' AND status = 'open'
       AND owner_user_id IS NULL
       AND criterion_id NOT IN (SELECT jsonb_array_elements_text($2::jsonb))`,
    [teamId, JSON.stringify(keep)],
  )
}

/**
 * Passo especial de bootstrap (P-4.1): sem projeto da temporada designado, todos os
 * critérios do validador ficam insatisfeitos e a equipe não entende por quê.
 */
export async function syncSeasonProjectStep(
  db: DbClient,
  teamId: string,
  hasSeasonProject: boolean,
): Promise<void> {
  if (hasSeasonProject) {
    await db.query(
      `UPDATE evolution_steps SET status = 'done', done_at = now()
       WHERE team_id = $1 AND criterion_id = $2 AND status = 'open'`,
      [teamId, DESIGNATE_PROJECT_STEP.criterionId],
    )
    return
  }
  await db.query(
    `INSERT INTO evolution_steps (team_id, title, origin, criterion_id, position)
     VALUES ($1, $2, 'criterion', $3, 0)
     ON CONFLICT (team_id, criterion_id) DO UPDATE
       SET status = CASE WHEN evolution_steps.status = 'dismissed'
                         THEN 'dismissed' ELSE 'open' END,
           done_at = NULL, done_by = NULL`,
    [teamId, DESIGNATE_PROJECT_STEP.title, DESIGNATE_PROJECT_STEP.criterionId],
  )
}

// ---------- produtores de evidência ----------

/** Resumo server-side do snapshot: sai do `evaluate()`, nunca do cliente (P-2.1). */
export function validationSummary(
  projectId: string,
  snapshotSeq: number,
  rules: RuleResult[],
  massKg: number | null,
): ValidationSummary {
  const counts = { pass: 0, fail: 0, warn: 0, manual: 0 }
  const failedRuleIds: string[] = []
  const manualRuleIds: string[] = []
  let presence = 0
  for (const r of rules) {
    counts[r.status]++
    if (r.status === 'fail') {
      failedRuleIds.push(r.id)
      if (r.presence) presence++
    }
    if (r.status === 'manual') manualRuleIds.push(r.id)
  }
  return { projectId, snapshotSeq, counts, presence, massKg, failedRuleIds, manualRuleIds }
}

/**
 * Equipe dona do projeto QUANDO ele é o projeto da temporada dela (§3.4). Snapshot
 * de projeto pessoal, ou de projeto da equipe que não é o designado, não vira
 * evidência (AC-DF13.3).
 */
export async function seasonTeamOf(db: DbClient, projectId: string): Promise<string | null> {
  const r = await db.query(
    `SELECT s.team_id FROM team_season s
     JOIN projects p ON p.id = s.season_project_id
     WHERE s.season_project_id = $1 AND p.owner_team_id = s.team_id`,
    [projectId],
  )
  return (r.rows[0]?.team_id as string | undefined) ?? null
}

/** Estado do organograma e da capitania (produtor `teams`, DF-10). */
export async function orgSummary(db: DbClient, teamId: string): Promise<OrgSummary> {
  const m = await db.query(
    `SELECT count(*)::int AS members,
            count(*) FILTER (WHERE role = 'owner')::int     AS owners,
            count(*) FILTER (WHERE role = 'admin')::int     AS admins,
            count(*) FILTER (WHERE status = 'trainee')::int AS trainees
     FROM team_members WHERE team_id = $1`,
    [teamId],
  )
  // `unfilled_leads` sai do MESMO passe: o DF-20 precisa saber qual cargo está vago
  // (DIN-1.1 fala de dinâmica e trem de força), não só quantos.
  const p = await db.query(
    `SELECT count(*)::int AS positions,
            count(*) FILTER (WHERE kind = 'lead')::int AS leads,
            count(*) FILTER (WHERE kind = 'lead' AND occupied)::int AS leads_filled,
            coalesce(
              jsonb_agg(name) FILTER (WHERE kind = 'lead' AND NOT occupied),
              '[]'::jsonb
            ) AS unfilled_leads
     FROM (
       SELECT p.kind, p.name,
              EXISTS (SELECT 1 FROM team_members m WHERE m.position_id = p.id) AS occupied
       FROM team_positions p WHERE p.team_id = $1
     ) q`,
    [teamId],
  )
  // "Último novato": o membro mais recente que NÃO é quem fundou a equipe.
  const last = await db.query(
    `SELECT user_id FROM team_members
     WHERE team_id = $1
       AND joined_at > (SELECT min(joined_at) FROM team_members WHERE team_id = $1)
     ORDER BY joined_at DESC LIMIT 1`,
    [teamId],
  )
  return {
    members: Number(m.rows[0]?.members ?? 0),
    owners: Number(m.rows[0]?.owners ?? 0),
    admins: Number(m.rows[0]?.admins ?? 0),
    trainees: Number(m.rows[0]?.trainees ?? 0),
    positions: Number(p.rows[0]?.positions ?? 0),
    leads: Number(p.rows[0]?.leads ?? 0),
    leadsFilled: Number(p.rows[0]?.leads_filled ?? 0),
    unfilledLeads: asStringList(p.rows[0]?.unfilled_leads),
    lastApprovedUserId: (last.rows[0]?.user_id as string | undefined) ?? null,
  }
}

/** `jsonb_agg` chega como array no pg e como string no Data API. */
function asStringList(value: unknown): string[] {
  const raw = typeof value === 'string' ? safeParse(value) : value
  return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === 'string') : []
}

function safeParse(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

/**
 * Produtor `datasheet` (DF-21 → DF-19 §5.1): a ficha é o SEGUNDO caminho do EST-1.1,
 * e os dois valem igual. Sem este resumo, o portal mediria só quem usa o editor 3D —
 * exatamente o que a RF-4.8 proíbe.
 */
export async function publishDatasheetSummary(
  db: DbClient,
  teamId: string,
  projectId: string,
  actorUserId: string | null,
): Promise<void> {
  const r = await db.query(
    `SELECT count(*)::int AS filled, count(DISTINCT split_part(field_id, '.', 1))::int AS sections
     FROM project_fields WHERE project_id = $1`,
    [projectId],
  )
  await recordEvidence(db, {
    teamId,
    source: 'datasheet',
    kind: 'datasheet.summary',
    payload: {
      projectId,
      filled: Number(r.rows[0]?.filled ?? 0),
      sections: Number(r.rows[0]?.sections ?? 0),
    },
    projectId,
    actorUserId,
  })
  await recomputeTeam(db, teamId, { actorUserId })
}

/**
 * Chamada por TODA mutação de organograma/membros do DF-10. A evolução é efeito
 * colateral da gestão de equipe — nunca o motivo de uma rota de equipe falhar.
 */
export async function publishOrgSummary(
  db: DbClient,
  teamId: string,
  actorUserId: string | null,
): Promise<void> {
  const summary = await orgSummary(db, teamId)
  await recordEvidence(db, {
    teamId,
    source: 'teams',
    kind: 'org.summary',
    payload: summary as unknown as Record<string, unknown>,
    actorUserId,
  })
  await recomputeTeam(db, teamId, { actorUserId })
}

export { CATALOG_VERSION, criterionById }
