import { Hono } from 'hono'
import { z } from 'zod'
import { withUser } from '../../db'
import { problem } from '../../problem'
import { audit, clientIp } from '../../audit'
import type { AuthEnv } from '../../auth/middleware'

// DF-26 — sugestões: melhoria, implementação ou problema pedidos de dentro de uma
// página. Montado em /api/v1/feedback (depois do requireAuth global — a v1 exige
// conta, e o motivo é o CICLO, não a moderação: sem conta não há para quem devolver
// o desfecho, §5.2).
//
// A escrita da triagem NÃO passa por aqui em SQL direto: `feedback_triage()` é
// SECURITY DEFINER e exige app_is_admin() (§6.2). A rota só traduz e audita.

export const feedback = new Hono<AuthEnv>()

/** Teto por pessoa (RF-DF26.28). Erro claro sobre QUAL dos dois estourou. */
const MAX_POR_DIA = 10
const MAX_TOTAL = 200

/**
 * Páginas conhecidas — o mesmo conjunto do `PageId` de `apps/web/src/session.ts`.
 * Duplicado de propósito: a API não importa do web, e página desconhecida é
 * recusada na borda em vez de virar linha suja no banco (RF-DF26.10). Destino novo
 * no shell entra aqui junto.
 */
export const PAGINAS = [
  'inicio',
  'equipe',
  'ferramentas',
  'comunidade',
  'editor',
  'assistant',
  'admin',
  'sobre',
  'projeto',
] as const

export const TIPOS = ['melhoria', 'implementacao', 'problema'] as const
export const STATUS = [
  'novo',
  'em_analise',
  'planejado',
  'entregue',
  'recusado',
  'duplicado',
] as const

/** Motivo obrigatório nestes dois — recusar em silêncio ensina que o canal é decorativo. */
const EXIGEM_MOTIVO = ['recusado', 'duplicado'] as const

/**
 * O contexto é ENUMERADO, e é isso que o separa de telemetria (§5.3): só tamanho da
 * janela e estado do menu. `strict()` recusa chave a mais em vez de gravá-la — sem
 * isso o campo viraria saco de qualquer coisa que o front resolvesse mandar.
 */
const contextSchema = z
  .object({
    viewport: z.tuple([z.number().int().min(0).max(20000), z.number().int().min(0).max(20000)]),
    rail: z.enum(['aberto', 'compacto']),
  })
  .strict()

const envioSchema = z.object({
  kind: z.enum(TIPOS),
  page: z.enum(PAGINAS),
  view: z.string().trim().max(40).nullable().optional(),
  title: z.string().trim().min(1).max(120),
  // piso de 20: "não funciona" não é pedido, e recusar na hora custa menos que uma
  // ida e volta que este canal não tem (RF-DF26.13)
  body: z.string().trim().min(20).max(2000),
  context: contextSchema,
})

interface Row {
  id: string
  kind: string
  page: string
  view: string | null
  title: string
  body: string
  context: unknown
  status: string
  resolution: string | null
  duplicate_of: string | null
  status_changed_at: string | null
  seen_at: string | null
  created_at: string
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

export function toItem(r: Row) {
  return {
    id: r.id,
    kind: r.kind,
    page: r.page,
    view: r.view,
    title: r.title,
    body: r.body,
    context: asJson<Record<string, unknown>>(r.context, {}),
    status: r.status,
    resolution: r.resolution,
    duplicateOf: r.duplicate_of,
    statusChangedAt: r.status_changed_at,
    // desfecho novo = triado depois da última leitura (RF-DF26.24)
    unread: !!r.status_changed_at && !r.seen_at,
    createdAt: r.created_at,
  }
}

// ---------- enviar ----------

feedback.post('/', async (c) => {
  const parsed = envioSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return problem(c, 400, 'Body inválido', parsed.error.message)
  const { sub } = c.get('auth')
  const ip = clientIp(c.req.raw.headers)
  const d = parsed.data

  const result = await withUser(sub, async (db) => {
    // as 24 h correm do envio, não da data civil: fila que zera à meia-noite
    // convida a esperar a meia-noite (RF-DF26.29)
    const n = (
      await db.query(
        `SELECT count(*)::int AS total,
                count(*) FILTER (WHERE created_at > now() - interval '24 hours')::int AS dia
           FROM feedback_items WHERE author_id = $1`,
        [sub],
      )
    ).rows[0]
    if (Number(n.total) >= MAX_TOTAL) return 'limite-total' as const
    if (Number(n.dia) >= MAX_POR_DIA) return 'limite-dia' as const

    const row = (
      await db.query(
        `INSERT INTO feedback_items (author_id, kind, page, view, title, body, context)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
         RETURNING *`,
        [sub, d.kind, d.page, d.view ?? null, d.title, d.body, JSON.stringify(d.context)],
      )
    ).rows[0] as Row
    await audit(db, {
      actorUserId: sub,
      action: 'feedback.created',
      resourceType: 'feedback',
      resourceId: row.id,
      ip,
      // nunca o texto: a trilha diz que houve, não o que se escreveu
      metadata: { kind: d.kind, page: d.page },
    })
    return row
  })

  if (result === 'limite-total')
    return problem(
      c,
      429,
      'Teto de sugestões atingido',
      `Você já enviou ${MAX_TOTAL} sugestões. Este é o teto por pessoa.`,
    )
  if (result === 'limite-dia')
    return problem(
      c,
      429,
      'Teto do dia atingido',
      `São ${MAX_POR_DIA} sugestões por dia. A próxima vaga abre 24 h depois do primeiro envio de hoje.`,
    )
  return c.json(toItem(result), 201)
})

// ---------- as minhas ----------

feedback.get('/mine', async (c) => {
  const { sub } = c.get('auth')
  const rows = await withUser(sub, async (db) => {
    // sem paginação: o teto por pessoa cabe numa lista (RF-DF26.15)
    const r = await db.query(
      `SELECT f.*, o.title AS duplicate_title
         FROM feedback_items f
         LEFT JOIN feedback_items o ON o.id = f.duplicate_of
        WHERE f.author_id = $1
        ORDER BY f.created_at DESC
        LIMIT $2`,
      [sub, MAX_TOTAL],
    )
    return r.rows as (Row & { duplicate_title: string | null })[]
  })
  return c.json({
    items: rows.map((r) => ({ ...toItem(r), duplicateTitle: r.duplicate_title })),
    naoLidas: rows.filter((r) => !!r.status_changed_at && !r.seen_at).length,
  })
})

/** Marca o desfecho como lido. É a ÚNICA coluna que o autor pode escrever (§6.2). */
feedback.post('/:id/seen', async (c) => {
  const { sub } = c.get('auth')
  const id = c.req.param('id')
  const ok = await withUser(sub, async (db) => {
    const r = await db.query(
      'UPDATE feedback_items SET seen_at = now() WHERE id = $1 AND author_id = $2',
      [id, sub],
    )
    return (r.rowCount ?? 0) > 0
  })
  if (!ok) return problem(c, 404, 'Sugestão não encontrada')
  return c.body(null, 204)
})

// ---------- triagem (montada dentro de /api/v1/admin, atrás do requireAdmin) ----------

export const feedbackAdmin = new Hono<AuthEnv>()

const triagemSchema = z
  .object({
    status: z.enum(STATUS),
    resolution: z.string().trim().min(1).max(1000).nullable().optional(),
    duplicateOf: z.string().uuid().nullable().optional(),
  })
  .refine(
    (v) => !EXIGEM_MOTIVO.includes(v.status as (typeof EXIGEM_MOTIVO)[number]) || !!v.resolution,
    {
      message: 'recusar ou marcar como duplicado exige um motivo de uma linha',
    },
  )
  .refine((v) => v.status !== 'duplicado' || !!v.duplicateOf, {
    message: 'duplicado precisa apontar para a sugestão original',
  })

feedbackAdmin.get('/', async (c) => {
  const { sub } = c.get('auth')
  const ip = clientIp(c.req.raw.headers)
  const status = c.req.query('status')
  const kind = c.req.query('kind')
  const page = c.req.query('page')

  const data = await withUser(sub, async (db) => {
    const items = (
      await db.query(
        `SELECT f.*, u.display_name AS author_name
           FROM feedback_items f
           LEFT JOIN users u ON u.id = f.author_id
          WHERE ($1::text IS NULL OR f.status = $1)
            AND ($2::text IS NULL OR f.kind = $2)
            AND ($3::text IS NULL OR f.page = $3)
          ORDER BY f.created_at DESC
          LIMIT 200`,
        [status ?? null, kind ?? null, page ?? null],
      )
    ).rows as (Row & { author_name: string | null })[]

    // Indício de ONDE dói, nunca contagem de votos — a tela nomeia isso (RF-DF26.21)
    const porPagina = (
      await db.query(
        `SELECT page, count(*)::int AS abertos FROM feedback_items
          WHERE status IN ('novo', 'em_analise') GROUP BY page ORDER BY abertos DESC`,
      )
    ).rows as { page: string; abertos: number }[]

    // o mais antigo ainda em `novo` é o número que denuncia o abandono cedo (§9.3)
    const maisAntigo = (
      await db.query(`SELECT min(created_at) AS desde FROM feedback_items WHERE status = 'novo'`)
    ).rows[0] as { desde: string | null }

    await audit(db, {
      actorUserId: sub,
      action: 'admin.view',
      resourceType: 'admin',
      resourceId: 'feedback',
      ip,
      metadata: { status: status ?? null, kind: kind ?? null, page: page ?? null },
    })
    return { items, porPagina, maisAntigo }
  })

  return c.json({
    items: data.items.map((r) => ({ ...toItem(r), authorName: r.author_name })),
    porPagina: data.porPagina.map((p) => ({ page: p.page, abertos: Number(p.abertos) })),
    novoMaisAntigo: data.maisAntigo.desde,
  })
})

feedbackAdmin.post('/:id/triage', async (c) => {
  const parsed = triagemSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return problem(c, 400, 'Body inválido', parsed.error.message)
  const { sub } = c.get('auth')
  const ip = clientIp(c.req.raw.headers)
  const id = c.req.param('id')
  const { status, resolution, duplicateOf } = parsed.data

  if (duplicateOf && duplicateOf === id)
    return problem(c, 400, 'Body inválido', 'uma sugestão não pode ser duplicata dela mesma')

  const outcome = await withUser(sub, async (db) => {
    if (duplicateOf) {
      const alvo = await db.query('SELECT 1 FROM feedback_items WHERE id = $1', [duplicateOf])
      if (!alvo.rowCount) return 'alvo-inexistente' as const
    }
    // única porta de escrita da triagem — a função exige app_is_admin() (§6.2)
    const r = await db.query('SELECT r_previous, r_author FROM feedback_triage($1, $2, $3, $4)', [
      id,
      status,
      resolution ?? null,
      duplicateOf ?? null,
    ])
    const row = r.rows[0] as { r_previous: string; r_author: string | null } | undefined
    if (!row) return 'notfound' as const

    await audit(db, {
      actorUserId: sub,
      action: 'feedback.triaged',
      resourceType: 'feedback',
      resourceId: id,
      ip,
      metadata: { de: row.r_previous, para: status },
    })
    return 'ok' as const
  })

  if (outcome === 'alvo-inexistente')
    return problem(c, 400, 'Body inválido', 'a sugestão original informada não existe')
  if (outcome === 'notfound') return problem(c, 404, 'Sugestão não encontrada')

  const item = await withUser(sub, async (db) => {
    const r = await db.query('SELECT * FROM feedback_items WHERE id = $1', [id])
    return r.rows[0] as Row
  })
  return c.json(toItem(item))
})
