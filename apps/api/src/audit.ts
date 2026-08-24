import type pg from 'pg'

// Trilha append-only (contracts/audit-event.odcs.yaml). metadata: nunca PII em claro.
export async function audit(
  client: pg.PoolClient,
  event: {
    actorUserId: string | null
    action: string
    resourceType: string
    resourceId?: string
    ip?: string
    metadata?: Record<string, unknown>
  },
) {
  await client.query(
    `INSERT INTO audit_events (actor_user_id, action, resource_type, resource_id, ip_address, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      event.actorUserId,
      event.action,
      event.resourceType,
      event.resourceId ?? null,
      event.ip ?? null,
      event.metadata ?? null,
    ],
  )
}

export function clientIp(headers: Headers): string | undefined {
  return headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? undefined
}
