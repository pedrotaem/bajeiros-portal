import { computeLevels } from '@bajeiros/evolution/compute'
import { CATALOG_VERSION, criterionById } from '@bajeiros/evolution/catalog'
import { AREA_IDS } from '@bajeiros/evolution/areas'
import { DESIGNATE_PROJECT_STEP } from '@bajeiros/evolution/destinations'
import type {
  AreaId,
  Declaration,
  Evidence,
  EvidenceKind,
  EvolutionResult,
} from '@bajeiros/evolution/types'
import type { OrgSummary, ValidationSummary } from '@bajeiros/evolution/evidence'
import type { RuleResult } from '@bajeiros/core/rules/b6'
import type { DbClient } from '../../db'

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

export interface EvidenceInput {
  teamId: string
  source: 'projects' | 'teams' | 'knowledge' | 'evolution' | 'community' | 'web'
  kind: EvidenceKind
  payload: Record<string, unknown>
  projectId?: string | null
  snapshotSeq?: number | null
  refKind?: string | null
  refId?: string | null
  actorUserId?: string | null
}

export async function recordEvidence(db: DbClient, ev: EvidenceInput): Promise<void> {
  await db.query(
    `INSERT INTO evolution_evidence
       (team_id, source, kind, payload, project_id, snapshot_seq, ref_kind, ref_id, actor_user_id)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9)`,
    [
      ev.teamId,
      ev.source,
      ev.kind,
      JSON.stringify(ev.payload),
      ev.projectId ?? null,
      ev.snapshotSeq ?? null,
      ev.refKind ?? null,
      ev.refId ?? null,
      ev.actorUserId ?? null,
    ],
  )
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

export async function loadDeclarations(db: DbClient, teamId: string): Promise<Declaration[]> {
  const r = await db.query(
    'SELECT criterion_id, declared_at FROM evolution_declarations WHERE team_id = $1',
    [teamId],
  )
  return r.rows.map((row) => ({
    criterionId: row.criterion_id as string,
    declaredAt: new Date(row.declared_at as string),
  }))
}

export interface RecomputeOptions {
  now?: Date
  actorUserId?: string | null
  syncQueue?: boolean
}

/**
 * Recomputa os níveis da equipe, grava `level.changed` por área que mudou e
 * sincroniza a fila. Idempotente: rodar de novo sem evidência nova não grava nada
 * — nem evento, nem passo duplicado (P-3.1).
 */
export async function recomputeTeam(
  db: DbClient,
  teamId: string,
  opts: RecomputeOptions = {},
): Promise<EvolutionResult> {
  const now = opts.now ?? new Date()
  const evidences = await loadEvidences(db, teamId)
  const declarations = await loadDeclarations(db, teamId)
  const result = computeLevels({ evidences, declarations, now })

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
    await recordEvidence(db, {
      teamId,
      source: 'evolution',
      kind: 'level.changed',
      payload: {
        area: area.area,
        from: de,
        to: area.level,
        catalogVersion: result.catalogVersion,
        because: area.pending.slice(0, 3).map((p) => ({ id: p.id, reason: p.reason })),
      },
      actorUserId: opts.actorUserId ?? null,
    })
  }

  if (opts.syncQueue !== false) await syncSteps(db, teamId, result)
  return result
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
  const p = await db.query(
    `SELECT count(*)::int AS positions,
            count(*) FILTER (WHERE kind = 'lead')::int AS leads,
            count(*) FILTER (WHERE kind = 'lead' AND occupied)::int AS leads_filled
     FROM (
       SELECT p.kind,
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
    lastApprovedUserId: (last.rows[0]?.user_id as string | undefined) ?? null,
  }
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
