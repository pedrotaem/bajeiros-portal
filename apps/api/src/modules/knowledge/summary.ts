import type { KnowledgeSummary } from '@bajeiros/evolution/evidence'
import { recomputeTeam, recordEvidence } from '../evolution/engine'
import type { DbClient } from '../../db'

// Produtor de evidência do DF-14 para o DF-13 (área `conhecimento`).
//
// Por que um RESUMO e não só os eventos: contar `decision.created` contaria também
// o que foi excluído, e CON-4.2 ("nenhum guia órfão") é uma propriedade do estado
// VIVO, não do histórico. Os eventos continuam sendo gravados — eles alimentam a
// atividade e a janela de 6 meses de CON-3.2, que o resumo não sabe responder.

export async function knowledgeSummary(db: DbClient, teamId: string): Promise<KnowledgeSummary> {
  const d = await db.query(
    'SELECT count(*)::int AS n FROM team_decisions WHERE team_id = $1 AND deleted_at IS NULL',
    [teamId],
  )
  const g = await db.query(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE kind = 'guia')::int      AS guia,
            count(*) FILTER (WHERE kind = 'trilha')::int    AS trilha,
            count(*) FILTER (WHERE kind = 'checklist')::int AS checklist,
            count(*) FILTER (WHERE owner_id IS NULL)::int   AS sem_dono,
            min(updated_at) AS oldest
     FROM team_guides WHERE team_id = $1 AND deleted_at IS NULL`,
    [teamId],
  )
  // etiquetas em query própria: o LATERAL sobre jsonb multiplica linhas e estragaria
  // as contagens acima
  const t = await db.query(
    `SELECT DISTINCT lower(tag) AS tag
     FROM team_guides g, jsonb_array_elements_text(g.tags) AS tag
     WHERE g.team_id = $1 AND g.deleted_at IS NULL`,
    [teamId],
  )
  const oldest = g.rows[0]?.oldest
  return {
    decisions: Number(d.rows[0]?.n ?? 0),
    guides: Number(g.rows[0]?.total ?? 0),
    guidesByKind: {
      guia: Number(g.rows[0]?.guia ?? 0),
      trilha: Number(g.rows[0]?.trilha ?? 0),
      checklist: Number(g.rows[0]?.checklist ?? 0),
    },
    guidesWithoutOwner: Number(g.rows[0]?.sem_dono ?? 0),
    oldestGuideUpdatedAt: oldest ? new Date(oldest as string).toISOString() : null,
    guideTags: t.rows.map((r) => r.tag as string),
  }
}

/**
 * Publica o resumo e recomputa os níveis. Chamada por TODA mutação de conhecimento,
 * na mesma transação (DF-14 §6) — registrar precisa ser barato, mas não pode ser
 * invisível para a evolução.
 */
export async function publishKnowledgeSummary(
  db: DbClient,
  teamId: string,
  actorUserId: string | null,
): Promise<void> {
  const summary = await knowledgeSummary(db, teamId)
  await recordEvidence(db, {
    teamId,
    source: 'knowledge',
    kind: 'knowledge.summary',
    payload: summary as unknown as Record<string, unknown>,
    actorUserId,
  })
  await recomputeTeam(db, teamId, { actorUserId })
}
