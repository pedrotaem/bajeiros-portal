import { Hono, type Context } from 'hono'
import { z } from 'zod'
import { cycleOf, cycleRange } from '@bajeiros/calendar/cycle'
import {
  MILESTONE_KINDS,
  REGISTRATION_KINDS,
  SOURCE_KINDS,
  type CalendarCompetition,
  type CalendarMilestone,
  type CalendarPayload,
  type RegistrationKind,
  type SourceRef,
  type TeamBond,
} from '@bajeiros/calendar/types'
import { buildIcs } from '@bajeiros/calendar/ics'
import { bondOf, isStale, marcosVisiveis } from '@bajeiros/calendar/recorte'
import { daysBetween, todayIso } from '@bajeiros/calendar/dates'
import { parseMilestoneTable } from '@bajeiros/calendar/parse-table'
import { withPublic, withUser, type DbClient } from '../../db'
import { problem } from '../../problem'
import { audit, clientIp } from '../../audit'
import { can, type TeamRole } from '../../policy'
import { myRole } from '../teams/shared'
import { loadSeason } from '../evolution/season'
import type { AuthEnv } from '../../auth/middleware'

// DF-33 — calendário de competições: marcos, prazos, informativos e links oficiais.
//
// Três superfícies, um payload:
//  - `calendarPublic` (/api/v1/public/calendar[.ics]) — SEM auth, montado antes do
//    requireAuth. Lê só tabelas com policy `USING (true)` via `withPublic` e sai com
//    Cache-Control público (1 h): o visitante não acorda a Aurora a cada abertura.
//  - `calendar` (/api/v1/community/calendar[.ics]) — com sessão; com `teamId` acrescenta
//    o recorte pessoal e os marcos da temporada da equipe (`kind: 'equipe'`).
//  - `calendarAdmin` (/api/v1/admin/calendar/*) — curadoria (DF-9). Todo salvar carimba
//    `checked_at = now()` e registra em audit_events.
//
// Restrição de marca (DF-15): a fonte é citada por URL, nunca por nome de programa.

export const calendarPublic = new Hono()
export const calendar = new Hono<AuthEnv>()
export const calendarAdmin = new Hono<AuthEnv>()

/** 1 h na borda e no navegador: a curadoria muda o dado sem deploy, mas não a cada minuto. */
const PUBLIC_CACHE = 'public, max-age=3600'

// ---------- leitura ----------

/**
 * Datas saem do banco como texto (to_char) para não depender do driver: o pg devolve
 * `Date` local para colunas `date`, a Data API devolve string — e um prazo é um DIA.
 */
const COMPETITION_COLS = `
  c.id, c.season, c.kind, c.region, c.name, c.location, c.official_url,
  to_char(c.starts_on, 'YYYY-MM-DD') AS starts_on,
  to_char(c.ends_on, 'YYYY-MM-DD') AS ends_on,
  to_char(c.registration_opens_on, 'YYYY-MM-DD') AS registration_opens_on,
  to_char(c.registration_closes_on, 'YYYY-MM-DD') AS registration_closes_on,
  c.checked_at`

const SOURCE_COLS = (alias: string) => `
  ${alias}.id AS src_id, ${alias}.competition_id AS src_competition_id, ${alias}.kind AS src_kind,
  ${alias}.number AS src_number, ${alias}.title AS src_title, ${alias}.url AS src_url,
  to_char(${alias}.published_on, 'YYYY-MM-DD') AS src_published_on,
  ${alias}.edition AS src_edition, ${alias}.checked_at AS src_checked_at`

/** Competições do ciclo: o Nacional do ano e as regionais do ano anterior (§3.2). */
const CYCLE_WHERE = `((c.kind = 'nacional' AND c.season = $1::int)
                      OR (c.kind = 'regional' AND c.season = $1::int - 1))`

function iso(v: unknown): string | null {
  if (v == null) return null
  if (v instanceof Date) return v.toISOString()
  return String(v)
}

function toSource(row: Record<string, unknown>): SourceRef {
  return {
    id: row.src_id as string,
    competitionId: (row.src_competition_id as string | null) ?? null,
    kind: row.src_kind as SourceRef['kind'],
    number: row.src_number != null ? Number(row.src_number) : null,
    title: row.src_title as string,
    url: row.src_url as string,
    publishedOn: (row.src_published_on as string | null) ?? null,
    edition: (row.src_edition as string | null) ?? null,
    checkedAt: iso(row.src_checked_at) ?? '',
  }
}

function asArray<T>(v: unknown): T[] {
  if (Array.isArray(v)) return v as T[]
  if (typeof v === 'string') {
    // pg devolve text[] como '{a,b}' quando não há parser; a Data API devolve JSON
    const s = v.trim()
    if (s.startsWith('{')) return s.slice(1, -1).split(',').filter(Boolean) as T[]
    try {
      return JSON.parse(s) as T[]
    } catch {
      return []
    }
  }
  return []
}

export async function loadCalendar(
  db: DbClient,
  season: number,
  today: string,
): Promise<CalendarPayload> {
  const seasons = (
    await db.query(
      `SELECT DISTINCT CASE WHEN kind = 'nacional' THEN season ELSE season + 1 END AS cycle
       FROM competitions ORDER BY cycle DESC`,
      [],
    )
  ).rows.map((r) => Number(r.cycle))

  const comps = (
    await db.query(
      `SELECT ${COMPETITION_COLS} FROM competitions c
       WHERE ${CYCLE_WHERE}
       ORDER BY c.starts_on NULLS LAST, c.name`,
      [season],
    )
  ).rows

  const sources = (
    await db.query(
      `SELECT ${SOURCE_COLS('s')} FROM source_documents s
       LEFT JOIN competitions c ON c.id = s.competition_id
       WHERE s.competition_id IS NULL OR ${CYCLE_WHERE}
       ORDER BY s.kind, s.number NULLS LAST, s.title`,
      [season],
    )
  ).rows.map(toSource)

  const milestones = (
    await db.query(
      `SELECT m.id, m.competition_id, m.kind, m.title, m.summary, m.applies_to, m.section_id,
              m.status, m.checked_at,
              to_char(m.starts_on, 'YYYY-MM-DD') AS starts_on,
              to_char(m.due_on, 'YYYY-MM-DD') AS due_on,
              ${SOURCE_COLS('s')}
       FROM competition_milestones m
       JOIN competitions c ON c.id = m.competition_id
       LEFT JOIN source_documents s ON s.id = m.source_id
       WHERE ${CYCLE_WHERE}
       ORDER BY m.due_on, m.title`,
      [season],
    )
  ).rows.map((row): CalendarMilestone => ({
    id: row.id as string,
    competitionId: row.competition_id as string,
    kind: row.kind as CalendarMilestone['kind'],
    title: row.title as string,
    summary: (row.summary as string | null) ?? null,
    startsOn: (row.starts_on as string | null) ?? null,
    dueOn: row.due_on as string,
    appliesTo: asArray<RegistrationKind>(row.applies_to),
    status: row.status as CalendarMilestone['status'],
    sectionId: (row.section_id as string | null) ?? null,
    checkedAt: iso(row.checked_at),
    source: row.src_id ? toSource(row) : null,
    team: null,
  }))

  // FR-DF33.11 — todo informativo publicado no ciclo aparece como marco `comunicado` na data
  // de publicação; o que cria um prazo aparece TAMBÉM como fonte do marco do prazo.
  const range = cycleRange(season)
  for (const s of sources) {
    if (s.kind !== 'informativo' || !s.publishedOn) continue
    if (s.publishedOn < range.from || s.publishedOn > range.to) continue
    milestones.push({
      id: `src:${s.id}`,
      competitionId: s.competitionId,
      kind: 'comunicado',
      title:
        s.number != null
          ? `Informativo ${String(s.number).padStart(2, '0')} · ${s.title}`
          : s.title,
      summary: null,
      startsOn: null,
      dueOn: s.publishedOn,
      appliesTo: [],
      status: 'confirmado',
      sectionId: null,
      checkedAt: s.checkedAt,
      source: s,
      team: null,
    })
  }
  milestones.sort((a, b) => a.dueOn.localeCompare(b.dueOn) || a.title.localeCompare(b.title))

  const competitions = comps.map((row): CalendarCompetition => {
    const id = row.id as string
    const hasFuture = milestones.some(
      (m) => m.competitionId === id && m.kind !== 'comunicado' && m.dueOn >= today,
    )
    const checkedAt = iso(row.checked_at)
    return {
      id,
      season: Number(row.season),
      kind: row.kind as CalendarCompetition['kind'],
      region: (row.region as string | null) ?? null,
      name: row.name as string,
      startsOn: (row.starts_on as string | null) ?? null,
      endsOn: (row.ends_on as string | null) ?? null,
      location: (row.location as string | null) ?? null,
      officialUrl: (row.official_url as string | null) ?? null,
      registrationOpensOn: (row.registration_opens_on as string | null) ?? null,
      registrationClosesOn: (row.registration_closes_on as string | null) ?? null,
      checkedAt,
      stale: isStale(checkedAt, today, hasFuture),
      links: sources.filter((s) => s.competitionId === id && s.kind !== 'informativo'),
      bond: null,
    }
  })

  return {
    season,
    seasons,
    range,
    today,
    competitions,
    milestones,
    // links gerais (regulamento, fórum) são os documentos sem competição
    links: sources.filter((s) => s.competitionId === null && s.kind !== 'informativo'),
    team: null,
  }
}

/**
 * Recorte da equipe (§3.5): vínculos nas competições, marcos da temporada como `equipe`
 * (privados — só nesta rota, nunca na pública) e a data que a fonte diz hoje quando a
 * cópia divergiu (FR-DF33.29).
 */
async function withTeam(
  db: DbClient,
  payload: CalendarPayload,
  teamId: string,
  role: TeamRole,
): Promise<CalendarPayload> {
  const season = await loadSeason(db, teamId)
  const team = {
    teamId,
    label: season?.label ?? String(payload.season),
    registrationKind: season?.registrationKind ?? null,
    competitionIds: season?.competitionIds ?? [],
    interestCompetitionIds: season?.interestCompetitionIds ?? [],
    updatedAt: season?.updatedAt ?? null,
    canManage: can(role, 'evolution.season'),
    canSteps: can(role, 'step.manage'),
  }
  const byId = new Map(payload.milestones.map((m) => [m.id, m]))
  const teamMilestones: CalendarMilestone[] = (season?.milestones ?? []).map((m, index) => {
    const original = m.sourceMilestoneId ? byId.get(m.sourceMilestoneId) : undefined
    return {
      id: `team:${index}`,
      competitionId: null,
      kind: 'equipe',
      title: m.title,
      summary: null,
      startsOn: null,
      dueOn: m.date,
      appliesTo: [],
      status: 'confirmado',
      sectionId: null,
      checkedAt: season?.updatedAt ?? null,
      source: null,
      team: {
        index,
        kind: m.kind ?? null,
        sourceMilestoneId: m.sourceMilestoneId ?? null,
        sourceDueOn: original && original.dueOn !== m.date ? original.dueOn : null,
      },
    }
  })
  return {
    ...payload,
    competitions: payload.competitions.map((c) => ({ ...c, bond: bondOf(team, c.id) as TeamBond })),
    milestones: [...payload.milestones, ...teamMilestones].sort(
      (a, b) => a.dueOn.localeCompare(b.dueOn) || a.title.localeCompare(b.title),
    ),
    team,
  }
}

function seasonParam(raw: string | undefined, today: string): number | null {
  if (!raw) return cycleOf(today)
  const n = Number(raw)
  return Number.isInteger(n) && n >= 2000 && n <= 2100 ? n : null
}

function icsResponse(c: Context, body: string, name: string, cache?: string) {
  return c.body(body, 200, {
    'Content-Type': 'text/calendar; charset=utf-8',
    'Content-Disposition': `attachment; filename="${name}"`,
    ...(cache ? { 'Cache-Control': cache } : {}),
  })
}

calendarPublic.get('/calendar', async (c) => {
  const today = todayIso()
  const season = seasonParam(c.req.query('season'), today)
  if (season === null) return problem(c, 400, 'Temporada inválida', 'Use o ano do Nacional.')
  const payload = await withPublic((db) => loadCalendar(db, season, today))
  c.header('Cache-Control', PUBLIC_CACHE)
  return c.json(payload)
})

calendarPublic.get('/calendar.ics', async (c) => {
  const today = todayIso()
  const season = seasonParam(c.req.query('season'), today)
  if (season === null) return problem(c, 400, 'Temporada inválida', 'Use o ano do Nacional.')
  const payload = await withPublic((db) => loadCalendar(db, season, today))
  return icsResponse(
    c,
    buildIcs({
      milestones: payload.milestones,
      competitions: payload.competitions,
      name: `Calendário Baja · Temporada ${season}`,
    }),
    `calendario-baja-${season}.ics`,
    PUBLIC_CACHE,
  )
})

async function loadForTeam(
  c: { req: { query: (k: string) => string | undefined } },
  sub: string,
): Promise<CalendarPayload | 'bad-season' | 'notfound'> {
  const today = todayIso()
  const season = seasonParam(c.req.query('season'), today)
  if (season === null) return 'bad-season'
  const teamId = c.req.query('teamId')
  return await withUser(sub, async (db) => {
    const payload = await loadCalendar(db, season, today)
    if (!teamId) return payload
    const role = await myRole(db, teamId, sub)
    if (!role) return 'notfound' as const
    return await withTeam(db, payload, teamId, role)
  })
}

calendar.get('/calendar', async (c) => {
  const { sub } = c.get('auth')
  const r = await loadForTeam(c, sub)
  if (r === 'bad-season') return problem(c, 400, 'Temporada inválida', 'Use o ano do Nacional.')
  if (r === 'notfound') return problem(c, 404, 'Equipe não encontrada')
  return c.json(r)
})

calendar.get('/calendar.ics', async (c) => {
  const { sub } = c.get('auth')
  const r = await loadForTeam(c, sub)
  if (r === 'bad-season') return problem(c, 400, 'Temporada inválida', 'Use o ano do Nacional.')
  if (r === 'notfound') return problem(c, 404, 'Equipe não encontrada')
  // com equipe, o .ics sai com o recorte pessoal (FR-DF33.20) — e com os marcos dela
  const milestones = r.team
    ? marcosVisiveis(r, { mine: true, quick: 'tudo', chips: new Set() })
    : r.milestones
  const competitions = r.team
    ? r.competitions.filter((comp) => milestones.some((m) => m.competitionId === comp.id))
    : r.competitions
  return icsResponse(
    c,
    buildIcs({
      milestones,
      competitions,
      name: r.team
        ? `Calendário Baja · ${r.team.label} · minha equipe`
        : `Calendário Baja · Temporada ${r.season}`,
    }),
    `calendario-baja-${r.season}${r.team ? '-equipe' : ''}.ics`,
  )
})

// ---------- administração (DF-9) ----------

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'data no formato AAAA-MM-DD')

const competitionBody = z.object({
  season: z.number().int().min(2000).max(2100),
  kind: z.enum(['nacional', 'regional']),
  region: z.string().trim().max(40).nullable().optional(),
  name: z.string().trim().min(1).max(80),
  startsOn: isoDate.nullable().optional(),
  endsOn: isoDate.nullable().optional(),
  location: z.string().trim().max(200).nullable().optional(),
  officialUrl: z.url().max(500).nullable().optional(),
  registrationOpensOn: isoDate.nullable().optional(),
  registrationClosesOn: isoDate.nullable().optional(),
})

calendarAdmin.get('/', async (c) => {
  const { sub } = c.get('auth')
  const today = todayIso()
  const season = seasonParam(c.req.query('season'), today)
  if (season === null) return problem(c, 400, 'Temporada inválida', 'Use o ano do Nacional.')
  const payload = await withUser(sub, (db) => loadCalendar(db, season, today))
  return c.json(payload)
})

/** DF-15 RF-1.1 — o CRUD de competição que só existia por script. Chave natural = upsert. */
calendarAdmin.post('/competitions', async (c) => {
  const parsed = competitionBody.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return problem(c, 400, 'Body inválido', parsed.error.message)
  const { sub } = c.get('auth')
  const b = parsed.data
  if (b.kind === 'nacional' && b.region)
    return problem(c, 400, 'Região inválida', 'O Nacional não tem região.')
  if (b.kind === 'regional' && !b.region)
    return problem(c, 400, 'Região obrigatória', 'Regional precisa de região.')
  const row = await withUser(sub, async (db) => {
    const r = await db.query(
      `INSERT INTO competitions
         (season, kind, region, name, starts_on, ends_on, location, official_url,
          registration_opens_on, registration_closes_on, checked_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
       ON CONFLICT (season, kind, region) DO UPDATE
         SET name = EXCLUDED.name,
             starts_on = EXCLUDED.starts_on,
             ends_on = EXCLUDED.ends_on,
             location = COALESCE(EXCLUDED.location, competitions.location),
             official_url = COALESCE(EXCLUDED.official_url, competitions.official_url),
             registration_opens_on = EXCLUDED.registration_opens_on,
             registration_closes_on = EXCLUDED.registration_closes_on,
             checked_at = now()
       RETURNING id`,
      [
        b.season,
        b.kind,
        b.kind === 'nacional' ? null : b.region,
        b.name,
        b.startsOn ?? null,
        b.endsOn ?? null,
        b.location ?? null,
        b.officialUrl ?? null,
        b.registrationOpensOn ?? null,
        b.registrationClosesOn ?? null,
      ],
    )
    await audit(db, {
      actorUserId: sub,
      action: 'calendar.competition_upsert',
      resourceType: 'competition',
      resourceId: r.rows[0].id,
      ip: clientIp(c.req.raw.headers),
      metadata: { season: b.season, kind: b.kind, region: b.region ?? null },
    })
    return r.rows[0]
  })
  return c.json({ id: row.id }, 201)
})

const competitionPatch = competitionBody.partial().omit({ season: true, kind: true, region: true })

calendarAdmin.patch('/competitions/:id', async (c) => {
  const parsed = competitionPatch.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return problem(c, 400, 'Body inválido', parsed.error.message)
  const { sub } = c.get('auth')
  const id = c.req.param('id')
  const b = parsed.data
  const ok = await withUser(sub, async (db) => {
    const r = await db.query(
      `UPDATE competitions SET
         name = COALESCE($2, name),
         starts_on = CASE WHEN $3::boolean THEN $4::date ELSE starts_on END,
         ends_on = CASE WHEN $5::boolean THEN $6::date ELSE ends_on END,
         location = CASE WHEN $7::boolean THEN $8 ELSE location END,
         official_url = CASE WHEN $9::boolean THEN $10 ELSE official_url END,
         registration_opens_on = CASE WHEN $11::boolean THEN $12::date ELSE registration_opens_on END,
         registration_closes_on = CASE WHEN $13::boolean THEN $14::date ELSE registration_closes_on END,
         checked_at = now()
       WHERE id = $1 RETURNING id`,
      [
        id,
        b.name ?? null,
        b.startsOn !== undefined,
        b.startsOn ?? null,
        b.endsOn !== undefined,
        b.endsOn ?? null,
        b.location !== undefined,
        b.location ?? null,
        b.officialUrl !== undefined,
        b.officialUrl ?? null,
        b.registrationOpensOn !== undefined,
        b.registrationOpensOn ?? null,
        b.registrationClosesOn !== undefined,
        b.registrationClosesOn ?? null,
      ],
    )
    if (!r.rowCount) return false
    await audit(db, {
      actorUserId: sub,
      action: 'calendar.competition_upsert',
      resourceType: 'competition',
      resourceId: id,
      ip: clientIp(c.req.raw.headers),
      metadata: { patch: Object.keys(b) },
    })
    return true
  })
  if (!ok) return problem(c, 404, 'Competição não encontrada')
  return c.body(null, 204)
})

const sourceBody = z.object({
  competitionId: z.string().uuid().nullable().optional(),
  kind: z.enum(SOURCE_KINDS as unknown as [string, ...string[]]),
  number: z.number().int().min(0).max(999).nullable().optional(),
  title: z.string().trim().min(1).max(200),
  url: z.url().max(500),
  publishedOn: isoDate.nullable().optional(),
  edition: z.string().trim().max(40).nullable().optional(),
  supersedesId: z.string().uuid().nullable().optional(),
})

/** FR-DF33.24 — documento-fonte é único por URL: repetir a URL atualiza a linha. */
calendarAdmin.post('/sources', async (c) => {
  const parsed = sourceBody.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return problem(c, 400, 'Body inválido', parsed.error.message)
  const { sub } = c.get('auth')
  const b = parsed.data
  const result = await withUser(sub, async (db) => {
    if (b.competitionId) {
      const comp = await db.query('SELECT 1 FROM competitions WHERE id = $1', [b.competitionId])
      if (!comp.rowCount) return 'no-competition' as const
    }
    const r = await db.query(
      `INSERT INTO source_documents
         (competition_id, kind, number, title, url, published_on, edition, supersedes_id,
          checked_at, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now(), $9)
       ON CONFLICT (url) DO UPDATE
         SET competition_id = EXCLUDED.competition_id,
             kind = EXCLUDED.kind,
             number = EXCLUDED.number,
             title = EXCLUDED.title,
             published_on = EXCLUDED.published_on,
             edition = EXCLUDED.edition,
             supersedes_id = EXCLUDED.supersedes_id,
             checked_at = now()
       RETURNING id`,
      [
        b.competitionId ?? null,
        b.kind,
        b.number ?? null,
        b.title,
        b.url,
        b.publishedOn ?? null,
        b.edition ?? null,
        b.supersedesId ?? null,
        sub,
      ],
    )
    await audit(db, {
      actorUserId: sub,
      action: 'calendar.source_upsert',
      resourceType: 'source_document',
      resourceId: r.rows[0].id,
      ip: clientIp(c.req.raw.headers),
      metadata: { kind: b.kind, number: b.number ?? null, competitionId: b.competitionId ?? null },
    })
    return r.rows[0]
  })
  if (result === 'no-competition') return problem(c, 404, 'Competição não encontrada')
  return c.json({ id: result.id }, 201)
})

calendarAdmin.patch('/sources/:id', async (c) => {
  const parsed = sourceBody.partial().safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return problem(c, 400, 'Body inválido', parsed.error.message)
  const { sub } = c.get('auth')
  const id = c.req.param('id')
  const b = parsed.data
  const ok = await withUser(sub, async (db) => {
    const r = await db.query(
      `UPDATE source_documents SET
         competition_id = CASE WHEN $2::boolean THEN $3::uuid ELSE competition_id END,
         kind = COALESCE($4, kind),
         number = CASE WHEN $5::boolean THEN $6::int ELSE number END,
         title = COALESCE($7, title),
         url = COALESCE($8, url),
         published_on = CASE WHEN $9::boolean THEN $10::date ELSE published_on END,
         edition = CASE WHEN $11::boolean THEN $12 ELSE edition END,
         checked_at = now()
       WHERE id = $1 RETURNING id`,
      [
        id,
        b.competitionId !== undefined,
        b.competitionId ?? null,
        b.kind ?? null,
        b.number !== undefined,
        b.number ?? null,
        b.title ?? null,
        b.url ?? null,
        b.publishedOn !== undefined,
        b.publishedOn ?? null,
        b.edition !== undefined,
        b.edition ?? null,
      ],
    )
    if (!r.rowCount) return false
    await audit(db, {
      actorUserId: sub,
      action: 'calendar.source_upsert',
      resourceType: 'source_document',
      resourceId: id,
      ip: clientIp(c.req.raw.headers),
      metadata: { patch: Object.keys(b) },
    })
    return true
  })
  if (!ok) return problem(c, 404, 'Documento não encontrado')
  return c.body(null, 204)
})

calendarAdmin.delete('/sources/:id', async (c) => {
  const { sub } = c.get('auth')
  const id = c.req.param('id')
  const ok = await withUser(sub, async (db) => {
    const r = await db.query('DELETE FROM source_documents WHERE id = $1 RETURNING id', [id])
    if (!r.rowCount) return false
    await audit(db, {
      actorUserId: sub,
      action: 'calendar.source_delete',
      resourceType: 'source_document',
      resourceId: id,
      ip: clientIp(c.req.raw.headers),
    })
    return true
  })
  if (!ok) return problem(c, 404, 'Documento não encontrado')
  return c.body(null, 204)
})

const milestoneBody = z
  .object({
    competitionId: z.string().uuid(),
    kind: z.enum(MILESTONE_KINDS as unknown as [string, ...string[]]),
    title: z.string().trim().min(1).max(140),
    summary: z.string().trim().max(280).nullable().optional(),
    startsOn: isoDate.nullable().optional(),
    dueOn: isoDate,
    appliesTo: z
      .array(z.enum(REGISTRATION_KINDS as unknown as [string, ...string[]]))
      .max(4)
      .optional(),
    sourceId: z.string().uuid().nullable().optional(),
    sectionId: z.string().trim().max(40).nullable().optional(),
    status: z.enum(['previsto', 'confirmado', 'cancelado']).optional(),
  })
  .refine((b) => !b.startsOn || b.startsOn <= b.dueOn, {
    message: 'a janela começa antes de terminar',
  })

calendarAdmin.post('/milestones', async (c) => {
  const parsed = milestoneBody.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return problem(c, 400, 'Body inválido', parsed.error.message)
  const { sub } = c.get('auth')
  const b = parsed.data
  const result = await withUser(sub, async (db) => {
    const comp = await db.query('SELECT 1 FROM competitions WHERE id = $1', [b.competitionId])
    if (!comp.rowCount) return 'no-competition' as const
    if (b.sourceId) {
      const src = await db.query('SELECT 1 FROM source_documents WHERE id = $1', [b.sourceId])
      if (!src.rowCount) return 'no-source' as const
    }
    const r = await db.query(
      `INSERT INTO competition_milestones
         (competition_id, kind, title, summary, starts_on, due_on, applies_to, source_id,
          section_id, status, checked_at, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7::text[], $8, $9, $10, now(), $11)
       ON CONFLICT (competition_id, kind, title, due_on) DO UPDATE
         SET summary = EXCLUDED.summary,
             starts_on = EXCLUDED.starts_on,
             applies_to = EXCLUDED.applies_to,
             source_id = EXCLUDED.source_id,
             section_id = EXCLUDED.section_id,
             status = EXCLUDED.status,
             checked_at = now(),
             updated_by = EXCLUDED.updated_by
       RETURNING id`,
      [
        b.competitionId,
        b.kind,
        b.title,
        b.summary ?? null,
        b.startsOn ?? null,
        b.dueOn,
        `{${(b.appliesTo ?? []).join(',')}}`,
        b.sourceId ?? null,
        b.sectionId ?? null,
        b.status ?? 'previsto',
        sub,
      ],
    )
    await audit(db, {
      actorUserId: sub,
      action: 'calendar.milestone_upsert',
      resourceType: 'competition_milestone',
      resourceId: r.rows[0].id,
      ip: clientIp(c.req.raw.headers),
      metadata: { competitionId: b.competitionId, kind: b.kind, dueOn: b.dueOn },
    })
    return r.rows[0]
  })
  if (result === 'no-competition') return problem(c, 404, 'Competição não encontrada')
  if (result === 'no-source') return problem(c, 404, 'Documento-fonte não encontrado')
  return c.json({ id: result.id }, 201)
})

const milestonePatch = z.object({
  kind: z.enum(MILESTONE_KINDS as unknown as [string, ...string[]]).optional(),
  title: z.string().trim().min(1).max(140).optional(),
  summary: z.string().trim().max(280).nullable().optional(),
  startsOn: isoDate.nullable().optional(),
  dueOn: isoDate.optional(),
  appliesTo: z
    .array(z.enum(REGISTRATION_KINDS as unknown as [string, ...string[]]))
    .max(4)
    .optional(),
  sourceId: z.string().uuid().nullable().optional(),
  sectionId: z.string().trim().max(40).nullable().optional(),
  status: z.enum(['previsto', 'confirmado', 'cancelado']).optional(),
})

/**
 * Data que a organização mudou depois de publicar (§10.5): é novo `checked_at` + `status`;
 * o histórico fica em audit_events e a tela mostra só o vigente.
 */
calendarAdmin.patch('/milestones/:id', async (c) => {
  const parsed = milestonePatch.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return problem(c, 400, 'Body inválido', parsed.error.message)
  const { sub } = c.get('auth')
  const id = c.req.param('id')
  const b = parsed.data
  const result = await withUser(sub, async (db) => {
    const before = await db.query(
      `SELECT to_char(due_on, 'YYYY-MM-DD') AS due_on, status FROM competition_milestones WHERE id = $1`,
      [id],
    )
    if (!before.rowCount) return 'notfound' as const
    const r = await db.query(
      `UPDATE competition_milestones SET
         kind = COALESCE($2, kind),
         title = COALESCE($3, title),
         summary = CASE WHEN $4::boolean THEN $5 ELSE summary END,
         starts_on = CASE WHEN $6::boolean THEN $7::date ELSE starts_on END,
         due_on = COALESCE($8::date, due_on),
         applies_to = CASE WHEN $9::boolean THEN $10::text[] ELSE applies_to END,
         source_id = CASE WHEN $11::boolean THEN $12::uuid ELSE source_id END,
         section_id = CASE WHEN $13::boolean THEN $14 ELSE section_id END,
         status = COALESCE($15, status),
         checked_at = now(),
         updated_by = $16
       WHERE id = $1 RETURNING id`,
      [
        id,
        b.kind ?? null,
        b.title ?? null,
        b.summary !== undefined,
        b.summary ?? null,
        b.startsOn !== undefined,
        b.startsOn ?? null,
        b.dueOn ?? null,
        b.appliesTo !== undefined,
        `{${(b.appliesTo ?? []).join(',')}}`,
        b.sourceId !== undefined,
        b.sourceId ?? null,
        b.sectionId !== undefined,
        b.sectionId ?? null,
        b.status ?? null,
        sub,
      ],
    )
    if (!r.rowCount) return 'notfound' as const
    await audit(db, {
      actorUserId: sub,
      action: 'calendar.milestone_upsert',
      resourceType: 'competition_milestone',
      resourceId: id,
      ip: clientIp(c.req.raw.headers),
      metadata: {
        patch: Object.keys(b),
        from: { dueOn: before.rows[0].due_on, status: before.rows[0].status },
        to: { dueOn: b.dueOn ?? before.rows[0].due_on, status: b.status ?? before.rows[0].status },
      },
    })
    return 'ok' as const
  })
  if (result === 'notfound') return problem(c, 404, 'Marco não encontrado')
  return c.body(null, 204)
})

calendarAdmin.delete('/milestones/:id', async (c) => {
  const { sub } = c.get('auth')
  const id = c.req.param('id')
  const ok = await withUser(sub, async (db) => {
    const r = await db.query('DELETE FROM competition_milestones WHERE id = $1 RETURNING id', [id])
    if (!r.rowCount) return false
    await audit(db, {
      actorUserId: sub,
      action: 'calendar.milestone_delete',
      resourceType: 'competition_milestone',
      resourceId: id,
      ip: clientIp(c.req.raw.headers),
    })
    return true
  })
  if (!ok) return problem(c, 404, 'Marco não encontrado')
  return c.body(null, 204)
})

const parseBody = z.object({
  text: z.string().min(1).max(20_000),
  competitionId: z.string().uuid().optional(),
})

/**
 * FR-DF33.23 — colar a tabela oficial devolve marcos em RASCUNHO. Nada é persistido aqui:
 * a pessoa confere e salva um a um (ou em lote) pelo POST /milestones. Com `competitionId`,
 * "até a competição" vira a data de início do evento e "Informativo NN" vira o id do
 * documento já cadastrado, quando existe.
 */
calendarAdmin.post('/parse-table', async (c) => {
  const parsed = parseBody.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return problem(c, 400, 'Body inválido', parsed.error.message)
  const { sub } = c.get('auth')
  const { text, competitionId } = parsed.data
  const table = parseMilestoneTable(text)

  const resolved = await withUser(sub, async (db) => {
    let startsOn: string | null = null
    const byNumber = new Map<number, string>()
    if (competitionId) {
      const comp = await db.query(
        `SELECT to_char(starts_on, 'YYYY-MM-DD') AS starts_on FROM competitions WHERE id = $1`,
        [competitionId],
      )
      if (!comp.rowCount) return 'no-competition' as const
      startsOn = (comp.rows[0].starts_on as string | null) ?? null
      const docs = await db.query(
        `SELECT id, number FROM source_documents
         WHERE competition_id = $1 AND kind = 'informativo' AND number IS NOT NULL`,
        [competitionId],
      )
      for (const d of docs.rows) byNumber.set(Number(d.number), d.id as string)
    }
    return table.rows.map((row) => {
      const untilEvent = row.dueOn === null && /competi[cç][aã]o/i.test(row.dateHint ?? '')
      return {
        ...row,
        dueOn: row.dueOn ?? (untilEvent ? startsOn : null),
        dateResolved: row.dueOn === null && untilEvent && !!startsOn,
        sourceId: row.sourceNumber != null ? (byNumber.get(row.sourceNumber) ?? null) : null,
      }
    })
  })
  if (resolved === 'no-competition') return problem(c, 404, 'Competição não encontrada')
  return c.json({ rows: resolved, ignored: table.ignored })
})

// ---------- consumidores de "próximo prazo" (DF-16 / DF-13) ----------

export interface NextDeadline {
  id: string
  title: string
  dueOn: string
  daysLeft: number
  kind: CalendarMilestone['kind']
  competition: string | null
}

/**
 * O próximo prazo que afeta a equipe: marcos oficiais das competições marcadas (com o
 * recorte de categoria) e os marcos da própria temporada, juntos (FR-DF33.28 / AC-DF33.11).
 * `null` sem competição marcada e sem marco da equipe — o Início não ganha bloco vazio.
 */
export async function nextDeadlineFor(
  db: DbClient,
  teamId: string,
  role: TeamRole,
  today = todayIso(),
): Promise<NextDeadline | null> {
  const base = await loadCalendar(db, cycleOf(today), today)
  const full = await withTeam(db, base, teamId, role)
  if (!full.team) return null
  // com o recorte ligado, marco oficial só entra se a competição estiver marcada;
  // o marco da equipe entra sempre. Informativo não é prazo.
  const visible = marcosVisiveis(full, { mine: true, quick: 'tudo', chips: new Set() }).filter(
    (m) => m.kind !== 'comunicado',
  )
  const next = visible.filter((m) => daysBetween(today, m.dueOn) >= 0)[0]
  if (!next) return null
  const comp = next.competitionId
    ? full.competitions.find((c) => c.id === next.competitionId)
    : undefined
  return {
    id: next.id,
    title: next.title,
    dueOn: next.dueOn,
    daysLeft: daysBetween(today, next.dueOn),
    kind: next.kind,
    competition: comp?.name ?? null,
  }
}
