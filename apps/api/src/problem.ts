import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

// Erros no formato RFC 9457 (application/problem+json)
export function problem(
  c: Context,
  status: ContentfulStatusCode,
  title: string,
  detail?: string,
  extra?: Record<string, unknown>,
) {
  const body = { type: 'about:blank', title, status, ...(detail && { detail }), ...extra }
  return c.body(JSON.stringify(body), status, { 'Content-Type': 'application/problem+json' })
}
