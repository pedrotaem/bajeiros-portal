import { Hono } from 'hono'
import { z } from 'zod'
import { cycleOf } from '@bajeiros/calendar/cycle'
import { todayIso } from '@bajeiros/calendar/dates'
import type { SourceKind } from '@bajeiros/calendar/types'
import { withPublic, withUser, type DbClient } from '../../db'
import { problem } from '../../problem'
import { audit, clientIp } from '../../audit'
import type { AuthEnv } from '../../auth/middleware'

// DF-34 — Regulamento: qual emenda vale para qual competição, e as referências oficiais
// do ciclo. Duas superfícies:
//  - `regulationPublic` (/api/v1/public/regulation/*) — SEM auth, montado antes do
//    requireAuth, como o calendário do DF-33 (ADR-012). A página abre sem conta
//    (FR-DF34.2) e o índice em si nem passa por aqui: é arquivo estático (§5.2).
//  - `regulationAdmin` (/api/v1/admin/regulation/*) — cadastro de emenda e de para quais
//    competições ela vale (DF-9). Uma vez por ano, com o hash do PDF conferido.
//
// O TEXTO do regulamento não trafega em rota nenhuma: o portal aponta para o PDF oficial
// da organização (§3.1, §8).

export const regulationPublic = new Hono()
export const regulationAdmin = new Hono<AuthEnv>()

/** 1 h, como o calendário: a curadoria muda sem deploy, mas não a cada minuto. */
const PUBLIC_CACHE = 'public, max-age=3600'

export interface RegulationSource {
  id: string
  kind: SourceKind
  title: string
  url: string
  publishedOn: string | null
  edition: string | null
  sectionId: string | null
  altersRules: boolean
  checkedAt: string
  /** Documento que este substitui (a emenda anterior, o template do ano passado). */
  supersedesId: string | null
}

export interface RegulationVersion {
  id: string
  edition: string
  label: string
  corpusVersion: string
  pdfSha256: string
  pageCount: number
  publishedOn: string | null
  checkedAt: string
  supersedesId: string | null
  /** Preenchido pela emenda que substitui esta — o chip SUBSTITUÍDA (FR-DF34.15). */
  supersededById: string | null
  source: RegulationSource
  appliesTo: { competitionId: string; name: string; season: number; kind: string }[]
}

export interface RegulationPayload {
  /** Ciclo corrente na data de hoje — é ele que define a emenda vigente. */
  season: number
  versions: RegulationVersion[]
}

function iso(v: unknown): string {
  if (v == null) return ''
  if (v instanceof Date) return v.toISOString()
  return String(v)
}

const SOURCE_COLS = `
  s.id AS src_id, s.kind AS src_kind, s.title AS src_title, s.url AS src_url,
  to_char(s.published_on, 'YYYY-MM-DD') AS src_published_on,
  s.edition AS src_edition, s.section_id AS src_section_id,
  s.alters_rules AS src_alters_rules, s.supersedes_id AS src_supersedes_id,
  s.checked_at AS src_checked_at`

function toSource(row: Record<string, unknown>): RegulationSource {
  return {
    id: row.src_id as string,
    kind: row.src_kind as SourceKind,
    title: row.src_title as string,
    url: row.src_url as string,
    publishedOn: (row.src_published_on as string | null) ?? null,
    edition: (row.src_edition as string | null) ?? null,
    sectionId: (row.src_section_id as string | null) ?? null,
    altersRules: row.src_alters_rules === true || row.src_alters_rules === 'true',
    supersedesId: (row.src_supersedes_id as string | null) ?? null,
    checkedAt: iso(row.src_checked_at),
  }
}

/**
 * Todas as emendas cadastradas, cada uma com o PDF oficial e as competições para as
 * quais vale. A lista é curta (uma por ano) — não há paginação nem recorte por ciclo:
 * a emenda anterior PRECISA continuar acessível (§3.2), e é o front que rotula qual é
 * a vigente para o ciclo que a pessoa está olhando.
 */
export async function loadRegulation(db: DbClient, today: string): Promise<RegulationPayload> {
  const versions = (
    await db.query(
      `SELECT v.id, v.edition, v.label, v.corpus_version, v.pdf_sha256, v.page_count,
              to_char(v.published_on, 'YYYY-MM-DD') AS published_on,
              v.checked_at, v.supersedes_id,
              (SELECT n.id FROM regulation_versions n WHERE n.supersedes_id = v.id
                 ORDER BY n.published_on DESC NULLS LAST LIMIT 1) AS superseded_by_id,
              ${SOURCE_COLS}
       FROM regulation_versions v
       JOIN source_documents s ON s.id = v.source_id
       ORDER BY v.published_on DESC NULLS LAST, v.edition DESC`,
      [],
    )
  ).rows

  const aplic = (
    await db.query(
      `SELECT a.version_id, a.competition_id, c.name, c.season, c.kind
       FROM regulation_applicability a
       JOIN competitions c ON c.id = a.competition_id
       ORDER BY c.season DESC, c.name`,
      [],
    )
  ).rows

  return {
    season: cycleOf(today),
    versions: versions.map((v) => ({
      id: v.id as string,
      edition: v.edition as string,
      label: v.label as string,
      corpusVersion: v.corpus_version as string,
      pdfSha256: v.pdf_sha256 as string,
      pageCount: Number(v.page_count),
      publishedOn: (v.published_on as string | null) ?? null,
      checkedAt: iso(v.checked_at),
      supersedesId: (v.supersedes_id as string | null) ?? null,
      supersededById: (v.superseded_by_id as string | null) ?? null,
      source: toSource(v),
      appliesTo: aplic
        .filter((a) => a.version_id === v.id)
        .map((a) => ({
          competitionId: a.competition_id as string,
          name: a.name as string,
          season: Number(a.season),
          kind: a.kind as string,
        })),
    })),
  }
}

/**
 * Referências oficiais do ciclo (FR-DF34.14): regulamento, templates de relatório,
 * páginas e o fórum de dúvidas. Vem de `source_documents` (DF-33) — nenhuma lista
 * estática em código, porque cada uma dessas URLs já mudou de lugar sem aviso.
 */
export async function loadReferences(
  db: DbClient,
  season: number,
): Promise<{ season: number; references: RegulationSource[] }> {
  const rows = (
    await db.query(
      `SELECT ${SOURCE_COLS} FROM source_documents s
       LEFT JOIN competitions c ON c.id = s.competition_id
       WHERE s.kind IN ('regulamento', 'template', 'pagina', 'forum')
         AND (s.competition_id IS NULL
              OR (c.kind = 'nacional' AND c.season = $1::int)
              OR (c.kind = 'regional' AND c.season = $1::int - 1))
       ORDER BY s.kind, s.published_on DESC NULLS LAST, s.title`,
      [season],
    )
  ).rows.map(toSource)
  return { season, references: rows }
}

function seasonParam(raw: string | undefined, today: string): number | null {
  if (!raw) return cycleOf(today)
  const n = Number(raw)
  return Number.isInteger(n) && n >= 2000 && n <= 2100 ? n : null
}

regulationPublic.get('/regulation/versions', async (c) => {
  const payload = await withPublic((db) => loadRegulation(db, todayIso()))
  c.header('Cache-Control', PUBLIC_CACHE)
  return c.json(payload)
})

regulationPublic.get('/regulation/references', async (c) => {
  const season = seasonParam(c.req.query('season'), todayIso())
  if (season === null) return problem(c, 400, 'Temporada inválida', 'Use o ano do Nacional.')
  const payload = await withPublic((db) => loadReferences(db, season))
  c.header('Cache-Control', PUBLIC_CACHE)
  return c.json(payload)
})

// ---------- administração (DF-9) ----------

const versionBody = z.object({
  edition: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]{1,40}$/, 'edição em minúsculas, ex.: emenda-07'),
  label: z.string().trim().min(1).max(120),
  corpusVersion: z.string().trim().min(1).max(120),
  pdfSha256: z.string().regex(/^[0-9a-f]{64}$/, 'sha256 em hex minúsculo'),
  pageCount: z.number().int().min(1).max(2000),
  sourceId: z.uuid(),
  supersedesId: z.uuid().nullable().optional(),
  publishedOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  /** Competições para as quais a emenda vale — substitui a lista inteira (§4.3). */
  appliesTo: z.array(z.uuid()).max(40).optional(),
})

regulationAdmin.get('/', async (c) => {
  const { sub } = c.get('auth')
  const payload = await withUser(sub, (db) => loadRegulation(db, todayIso()))
  return c.json(payload)
})

/** Chave natural = `edition`: rodar duas vezes atualiza, não duplica (como o DF-33). */
regulationAdmin.post('/versions', async (c) => {
  const parsed = versionBody.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return problem(c, 400, 'Body inválido', parsed.error.message)
  const { sub } = c.get('auth')
  const b = parsed.data
  const result = await withUser(sub, async (db) => {
    const src = await db.query('SELECT 1 FROM source_documents WHERE id = $1', [b.sourceId])
    if (!src.rowCount) return 'no-source' as const
    const r = await db.query(
      `INSERT INTO regulation_versions
         (edition, label, corpus_version, pdf_sha256, page_count, source_id, supersedes_id,
          published_on, checked_at, updated_by)
       VALUES ($1, $2, $3, $4, $5::int, $6, $7, $8::date, now(), $9)
       ON CONFLICT (edition) DO UPDATE
         SET label = EXCLUDED.label,
             corpus_version = EXCLUDED.corpus_version,
             pdf_sha256 = EXCLUDED.pdf_sha256,
             page_count = EXCLUDED.page_count,
             source_id = EXCLUDED.source_id,
             supersedes_id = EXCLUDED.supersedes_id,
             published_on = EXCLUDED.published_on,
             checked_at = now(),
             updated_by = EXCLUDED.updated_by
       RETURNING id`,
      [
        b.edition,
        b.label,
        b.corpusVersion,
        b.pdfSha256,
        b.pageCount,
        b.sourceId,
        b.supersedesId ?? null,
        b.publishedOn ?? null,
        sub,
      ],
    )
    const id = r.rows[0].id as string
    if (b.appliesTo) await setApplicability(db, id, b.appliesTo)
    await audit(db, {
      actorUserId: sub,
      action: 'regulation.version_upsert',
      resourceType: 'regulation_version',
      resourceId: id,
      ip: clientIp(c.req.raw.headers),
      metadata: { edition: b.edition, appliesTo: b.appliesTo?.length ?? null },
    })
    return { id }
  })
  if (result === 'no-source') return problem(c, 404, 'Documento-fonte não encontrado')
  return c.json(result, 201)
})

regulationAdmin.patch('/versions/:id', async (c) => {
  const parsed = versionBody.partial().safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return problem(c, 400, 'Body inválido', parsed.error.message)
  const { sub } = c.get('auth')
  const id = c.req.param('id')
  const b = parsed.data
  const ok = await withUser(sub, async (db) => {
    const r = await db.query(
      `UPDATE regulation_versions SET
         label = COALESCE($2, label),
         corpus_version = COALESCE($3, corpus_version),
         pdf_sha256 = COALESCE($4, pdf_sha256),
         page_count = COALESCE($5::int, page_count),
         source_id = COALESCE($6::uuid, source_id),
         supersedes_id = CASE WHEN $7::boolean THEN $8::uuid ELSE supersedes_id END,
         published_on = CASE WHEN $9::boolean THEN $10::date ELSE published_on END,
         checked_at = now(),
         updated_by = $11
       WHERE id = $1 RETURNING id`,
      [
        id,
        b.label ?? null,
        b.corpusVersion ?? null,
        b.pdfSha256 ?? null,
        b.pageCount ?? null,
        b.sourceId ?? null,
        b.supersedesId !== undefined,
        b.supersedesId ?? null,
        b.publishedOn !== undefined,
        b.publishedOn ?? null,
        sub,
      ],
    )
    if (!r.rowCount) return false
    if (b.appliesTo) await setApplicability(db, id, b.appliesTo)
    await audit(db, {
      actorUserId: sub,
      action: 'regulation.version_update',
      resourceType: 'regulation_version',
      resourceId: id,
      ip: clientIp(c.req.raw.headers),
      metadata: { appliesTo: b.appliesTo?.length ?? null },
    })
    return true
  })
  if (!ok) return problem(c, 404, 'Emenda não encontrada')
  return c.json({ id })
})

/** A lista de competições da emenda é declarativa: o que veio no body É a lista. */
async function setApplicability(db: DbClient, versionId: string, competitionIds: string[]) {
  await db.query('DELETE FROM regulation_applicability WHERE version_id = $1', [versionId])
  for (const competitionId of competitionIds) {
    await db.query(
      `INSERT INTO regulation_applicability (version_id, competition_id)
       VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [versionId, competitionId],
    )
  }
}
