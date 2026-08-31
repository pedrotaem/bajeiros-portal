import type { EvidenceKind } from '@bajeiros/evolution/types'
import type { DbClient } from '../../db'

// Escrita da evidência, em módulo próprio para que `engine.ts` e `rank.ts` possam
// usá-la sem se importarem um ao outro (o ciclo de import é evitável e caro de
// depurar quando aparece só no bundle da Lambda).
//
// `evolution_evidence` é append-only por GRANT (como `audit_events` e
// `cage_snapshots`): nem a app reescreve o passado.

export interface EvidenceInput {
  teamId: string
  source: 'projects' | 'teams' | 'knowledge' | 'evolution' | 'community' | 'web' | 'datasheet'
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
