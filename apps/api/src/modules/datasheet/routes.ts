import { Hono } from 'hono'
import { z } from 'zod'
import type { Cage } from '@bajeiros/core/model/types'
import {
  DATASHEET_VERSION,
  FIELDS,
  SECTIONS,
  fieldById,
  isSectionId,
  maxLengthOf,
} from '@bajeiros/datasheet/catalog'
import { suggestFrom } from '@bajeiros/datasheet/suggest'
import { validateValue } from '@bajeiros/datasheet/validate'
import { computeDivergences, computeProgress } from '@bajeiros/datasheet/progress'
import { exportCsv, exportMarkdown } from '@bajeiros/datasheet/export'
import type {
  Field,
  FieldValue,
  SectionId,
  StoredValue,
  ValueKind,
} from '@bajeiros/datasheet/types'
import { withUser, type DbClient } from '../../db'
import { problem } from '../../problem'
import { audit, clientIp } from '../../audit'
import { can } from '../../policy'
import { myRole } from '../teams/shared'
import { publishDatasheetSummary, seasonTeamOf } from '../evolution/engine'
import type { AuthEnv } from '../../auth/middleware'

// DF-21 — ficha do protótipo. Montado em /api/v1/projects, ao lado do módulo de
// projetos (o Hono casa as duas árvores), pelo mesmo motivo do DF-13 em /teams: a
// ficha não incha o módulo do validador.
//
// O princípio §3.2 aparece aqui em três lugares concretos, e nenhum deles é decorativo:
//  - a sugestão é computada na leitura e NUNCA escrita (só a rota de escrita grava, com
//    autor e `source`);
//  - `hasCage: false` é caminho normal — a ficha responde 100% preenchível sem gaiola;
//  - resultado de validação não aparece em lugar nenhum desta resposta: é da aba Validação.

export const datasheet = new Hono<AuthEnv>()

/** Teto de lote da escrita parcial: um formulário inteiro cabe folgado. */
const MAX_BATCH = 200
const MAX_HISTORY = 200

// ---------- leitura de apoio ----------

interface ProjectRow {
  id: string
  name: string
  owner_user_id: string | null
  owner_team_id: string | null
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
 * Valor escalar vindo de coluna `jsonb`. Os DOIS drivers já entregam o valor
 * decodificado (o pg pelo parser nativo, o Data API por `columnMetadata`) — passar
 * `JSON.parse` de novo quebraria justamente o caso do texto: `'22×7-10'` não é JSON.
 * Objeto e array não são valor de campo de ficha e viram `null`.
 */
function asValue(raw: unknown): FieldValue | null {
  if (raw === null || raw === undefined) return null
  const t = typeof raw
  return t === 'number' || t === 'boolean' || t === 'string' ? (raw as FieldValue) : null
}

function isoOf(v: unknown): string | null {
  if (!v) return null
  const d = v instanceof Date ? v : new Date(String(v))
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

async function loadProject(db: DbClient, projectId: string): Promise<ProjectRow | null> {
  // a RLS já esconde projeto alheio: linha invisível = 404 uniforme
  const r = await db.query(
    'SELECT id, name, owner_user_id, owner_team_id FROM projects WHERE id = $1',
    [projectId],
  )
  return (r.rows[0] as ProjectRow) ?? null
}

/**
 * Quem pode dispensar seção (RF-5.1): capitania na equipe dona, dono no projeto
 * pessoal. Escrever campo é diferente — é trabalho de engenharia e vale para todo
 * membro (RF-2.5), o que a RLS já garante ao tornar o projeto visível.
 */
async function canWaive(db: DbClient, project: ProjectRow, sub: string): Promise<boolean> {
  if (project.owner_team_id) {
    const role = await myRole(db, project.owner_team_id, sub)
    return !!role && can(role, 'evolution.declare')
  }
  return project.owner_user_id === sub
}

async function loadValues(db: DbClient, projectId: string): Promise<StoredValue[]> {
  const r = await db.query(
    `SELECT field_id, kind, value, updated_by, updated_at FROM project_fields
     WHERE project_id = $1 ORDER BY field_id, kind`,
    [projectId],
  )
  return r.rows
    .filter((row) => fieldById(row.field_id))
    .map((row) => ({
      fieldId: row.field_id as string,
      kind: row.kind as ValueKind,
      value: asValue(row.value) ?? '',
      updatedBy: row.updated_by ?? null,
      updatedAt: isoOf(row.updated_at),
    }))
}

async function loadWaivers(db: DbClient, projectId: string) {
  const r = await db.query(
    'SELECT section_id, reason, waived_by, waived_at FROM project_section_waivers WHERE project_id = $1',
    [projectId],
  )
  return r.rows
    .filter((row) => isSectionId(row.section_id))
    .map((row) => ({
      sectionId: row.section_id as SectionId,
      reason: (row.reason as string | null) ?? null,
      waivedBy: row.waived_by ?? null,
      waivedAt: isoOf(row.waived_at),
    }))
}

/** Última versão da gaiola, quando existe. Ausência é caso normal (RF-1.3). */
async function latestCage(
  db: DbClient,
  projectId: string,
): Promise<{ cage: Cage; seq: number } | null> {
  const r = await db.query(
    'SELECT seq, cage_json FROM cage_snapshots WHERE project_id = $1 ORDER BY seq DESC LIMIT 1',
    [projectId],
  )
  if (!r.rows[0]) return null
  const cage = asJson<Cage | null>(r.rows[0].cage_json, null)
  return cage ? { cage, seq: Number(r.rows[0].seq) } : null
}

/** Avisos de faixa típica dos valores JÁ guardados — o chip sobrevive ao recarregar. */
function rangeWarnings(values: readonly StoredValue[]) {
  const out: { fieldId: string; kind: ValueKind; message: string }[] = []
  for (const v of values) {
    const field = fieldById(v.fieldId)
    if (!field) continue
    const r = validateValue(field, v.value, v.kind)
    if (r.ok && r.warning) out.push({ fieldId: v.fieldId, kind: v.kind, message: r.warning })
  }
  return out
}

function serializeField(f: Field) {
  return {
    id: f.id,
    section: f.section,
    label: f.label,
    type: f.type,
    unit: f.unit,
    help: f.help,
    options: f.options,
    absolute: f.absolute,
    typical: f.typical,
    dual: f.dual ?? false,
    /** o portal sabe sugerir este campo — e ele continua editável à mão (§3.2) */
    suggestable: !!f.suggest,
    comparable: f.comparable ?? false,
    maxLength: maxLengthOf(f),
  }
}

async function readDatasheet(db: DbClient, project: ProjectRow) {
  const [values, waivers, snap] = [
    await loadValues(db, project.id),
    await loadWaivers(db, project.id),
    await latestCage(db, project.id),
  ]
  const suggestions = suggestFrom(snap?.cage, { seq: snap?.seq })
  const waivedIds = waivers.map((w) => w.sectionId)
  const progress = computeProgress(values, waivedIds)

  return {
    projectId: project.id,
    projectName: project.name,
    catalogVersion: DATASHEET_VERSION,
    // a tela usa isto para esconder a coluna de sugestão inteira — nada de coluna
    // vazia cobrando o uso do editor (RF-3.5)
    hasCage: !!snap,
    cageSeq: snap?.seq ?? null,
    sections: SECTIONS.map((s) => {
      const w = waivers.find((x) => x.sectionId === s.id)
      const p = progress.sections.find((x) => x.sectionId === s.id)!
      return { ...s, waived: !!w, waiverReason: w?.reason ?? null, progress: p }
    }),
    fields: FIELDS.map(serializeField),
    values,
    suggestions,
    divergences: computeDivergences(values, suggestions),
    warnings: rangeWarnings(values),
    progress,
  }
}

// ---------- E3: leitura ----------

datasheet.get('/:id/datasheet', async (c) => {
  const { sub } = c.get('auth')
  const out = await withUser(sub, async (db) => {
    const project = await loadProject(db, c.req.param('id'))
    return project ? await readDatasheet(db, project) : null
  })
  if (!out) return problem(c, 404, 'Projeto não encontrado')
  return c.json(out)
})

datasheet.get('/:id/datasheet/history', async (c) => {
  const { sub } = c.get('auth')
  const field = c.req.query('field')
  const kind = c.req.query('kind')
  const limit = Math.min(Number(c.req.query('limit') ?? 50) || 50, MAX_HISTORY)

  const rows = await withUser(sub, async (db) => {
    const project = await loadProject(db, c.req.param('id'))
    if (!project) return null
    const r = await db.query(
      `SELECT field_id, kind, old_value, new_value, source, changed_by, changed_at
       FROM project_field_revisions
       WHERE project_id = $1
         AND ($2::text IS NULL OR field_id = $2)
         AND ($3::text IS NULL OR kind = $3)
       ORDER BY changed_at DESC, id DESC
       LIMIT $4`,
      [project.id, field ?? null, kind ?? null, limit],
    )
    return r.rows
  })
  if (!rows) return problem(c, 404, 'Projeto não encontrado')
  return c.json(
    rows.map((row) => ({
      fieldId: row.field_id,
      kind: row.kind,
      oldValue: asValue(row.old_value),
      newValue: asValue(row.new_value),
      source: row.source,
      changedBy: row.changed_by ?? null,
      changedAt: isoOf(row.changed_at),
    })),
  )
})

// ---------- E2: preenchimento ----------

const writeItem = z.object({
  fieldId: z.string().min(1).max(80),
  kind: z.enum(['design', 'measured']).optional(),
  // null apaga o valor; objeto/array não é valor de campo de ficha
  value: z.union([z.number(), z.string(), z.boolean(), z.null()]),
  // lock otimista POR CAMPO (RF-2.6): ausente = escrita cega; null = "estava vazio"
  expectedUpdatedAt: z.string().nullable().optional(),
  // RF-2.7: aceitar sugestão é escrita normal, só anotada na revisão
  source: z.enum(['manual', 'suggestion']).optional(),
})

const putBody = z.object({ values: z.array(writeItem).min(1).max(MAX_BATCH) })

type WriteItem = z.infer<typeof writeItem>

interface Prepared {
  item: WriteItem
  field: Field
  kind: ValueKind
  value: FieldValue | null
  warning?: string
}

datasheet.put('/:id/datasheet', async (c) => {
  const parsed = putBody.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return problem(c, 400, 'Body inválido', parsed.error.message)

  // Validação ANTES de qualquer escrita (padrão do repo): o lote é atômico, e um
  // campo torto não deixa a metade do formulário salva.
  const prepared: Prepared[] = []
  for (const item of parsed.data.values) {
    const field = fieldById(item.fieldId)
    if (!field)
      return problem(
        c,
        400,
        'Campo desconhecido',
        `"${item.fieldId}" não está no catálogo da ficha.`,
      )
    const kind: ValueKind = item.kind ?? 'design'
    if (item.value === null) {
      if (kind === 'measured' && !field.dual) {
        return problem(
          c,
          400,
          'Campo sem coluna de medido',
          `"${field.label}" não tem coluna de medido.`,
        )
      }
      prepared.push({ item, field, kind, value: null })
      continue
    }
    const r = validateValue(field, item.value, kind)
    if (!r.ok) return problem(c, 400, 'Valor inválido', r.error, { fieldId: field.id, kind })
    prepared.push({ item, field, kind, value: r.value, warning: r.warning })
  }

  const { sub } = c.get('auth')
  const projectId = c.req.param('id')

  const result = await withUser(sub, async (db) => {
    const project = await loadProject(db, projectId)
    if (!project) return 'notfound' as const

    for (const p of prepared) {
      // trava a linha do campo: duas escritas no MESMO campo serializam; campos
      // distintos não se encostam (RF-2.6 / AC-DF21.13)
      const cur = await db.query(
        `SELECT value, updated_at FROM project_fields
         WHERE project_id = $1 AND field_id = $2 AND kind = $3 FOR UPDATE`,
        [project.id, p.field.id, p.kind],
      )
      const atual = cur.rows[0]
      const expected = p.item.expectedUpdatedAt
      if (expected !== undefined) {
        const vigente = isoOf(atual?.updated_at)
        const bate =
          expected === null
            ? vigente === null
            : vigente !== null && new Date(vigente).getTime() === new Date(expected).getTime()
        if (!bate) {
          return {
            status: 'conflict' as const,
            fieldId: p.field.id,
            kind: p.kind,
            value: atual ? asValue(atual.value) : null,
            updatedAt: vigente,
          }
        }
      }

      const anterior = atual ? asValue(atual.value) : null
      if (p.value === null) {
        if (!atual) continue // apagar campo vazio é no-op silencioso
        await db.query(
          'DELETE FROM project_fields WHERE project_id = $1 AND field_id = $2 AND kind = $3',
          [project.id, p.field.id, p.kind],
        )
      } else {
        await db.query(
          `INSERT INTO project_fields (project_id, field_id, kind, value, updated_by, updated_at)
           VALUES ($1, $2, $3, $4::jsonb, $5, now())
           ON CONFLICT (project_id, field_id, kind)
           DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by,
                         updated_at = now()`,
          [project.id, p.field.id, p.kind, JSON.stringify(p.value), sub],
        )
      }
      await db.query(
        `INSERT INTO project_field_revisions
           (project_id, field_id, kind, old_value, new_value, source, changed_by)
         VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7)`,
        [
          project.id,
          p.field.id,
          p.kind,
          anterior === null ? null : JSON.stringify(anterior),
          p.value === null ? null : JSON.stringify(p.value),
          p.item.source ?? 'manual',
          sub,
        ],
      )
    }

    await audit(db, {
      actorUserId: sub,
      action: 'datasheet.update',
      resourceType: 'project',
      resourceId: project.id,
      ip: clientIp(c.req.raw.headers),
      metadata: { fields: prepared.map((p) => p.field.id).slice(0, 40), count: prepared.length },
    })

    // DF-19 §5.1 — a ficha é o SEGUNDO caminho do EST-1.1, e vale igual à gaiola
    // modelada. Sem este resumo o portal só mediria quem usa o editor 3D, que é
    // exatamente o que a RF-4.8 proíbe. Só o projeto DA TEMPORADA vira evidência (§3.4).
    const teamId = await seasonTeamOf(db, project.id)
    if (teamId) await publishDatasheetSummary(db, teamId, project.id, sub)

    const values = await loadValues(db, project.id)
    const waivers = await loadWaivers(db, project.id)
    return {
      status: 'ok' as const,
      values,
      progress: computeProgress(
        values,
        waivers.map((w) => w.sectionId),
      ),
    }
  })

  if (result === 'notfound') return problem(c, 404, 'Projeto não encontrado')
  if (result.status === 'conflict') {
    return problem(
      c,
      409,
      'Conflito de edição',
      `"${fieldById(result.fieldId)?.label ?? result.fieldId}" mudou desde que você abriu a ficha; recarregue.`,
      {
        fieldId: result.fieldId,
        kind: result.kind,
        current: { value: result.value, updatedAt: result.updatedAt },
      },
    )
  }

  return c.json({
    values: result.values,
    progress: result.progress,
    // faixa típica avisa e não bloqueia (RF-2.3/4.1); divergência de sugestão
    // NÃO entra aqui — não é erro, é o produto da ficha (RF-4.4)
    warnings: prepared
      .filter((p) => p.warning)
      .map((p) => ({ fieldId: p.field.id, kind: p.kind, message: p.warning! })),
  })
})

// ---------- E5: seções que não se aplicam ----------

const waiverBody = z.object({ reason: z.string().trim().min(3).max(280) })

datasheet.put('/:id/datasheet/waivers/:sid', async (c) => {
  const sectionId = c.req.param('sid')
  if (!isSectionId(sectionId)) return problem(c, 404, 'Seção não encontrada')
  const parsed = waiverBody.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) {
    return problem(
      c,
      400,
      'Body inválido',
      'Dispensar uma seção exige um motivo curto. É o que impede a dispensa de virar atalho para inflar o progresso.',
    )
  }
  const { sub } = c.get('auth')
  const result = await withUser(sub, async (db) => {
    const project = await loadProject(db, c.req.param('id'))
    if (!project) return 'notfound' as const
    if (!(await canWaive(db, project, sub))) return 'forbidden' as const
    await db.query(
      `INSERT INTO project_section_waivers (project_id, section_id, reason, waived_by, waived_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (project_id, section_id)
       DO UPDATE SET reason = EXCLUDED.reason, waived_by = EXCLUDED.waived_by, waived_at = now()`,
      [project.id, sectionId, parsed.data.reason, sub],
    )
    await audit(db, {
      actorUserId: sub,
      action: 'datasheet.waiver',
      resourceType: 'project',
      resourceId: project.id,
      ip: clientIp(c.req.raw.headers),
      metadata: { sectionId, state: 'waived' },
    })
    return await readDatasheet(db, project)
  })
  if (result === 'notfound') return problem(c, 404, 'Projeto não encontrado')
  if (result === 'forbidden') {
    return problem(
      c,
      403,
      'Sem permissão',
      'Marcar uma seção como não aplicável é da capitania da equipe dona do projeto.',
    )
  }
  return c.json(result)
})

datasheet.delete('/:id/datasheet/waivers/:sid', async (c) => {
  const sectionId = c.req.param('sid')
  if (!isSectionId(sectionId)) return problem(c, 404, 'Seção não encontrada')
  const { sub } = c.get('auth')
  const result = await withUser(sub, async (db) => {
    const project = await loadProject(db, c.req.param('id'))
    if (!project) return 'notfound' as const
    if (!(await canWaive(db, project, sub))) return 'forbidden' as const
    await db.query(
      'DELETE FROM project_section_waivers WHERE project_id = $1 AND section_id = $2',
      [project.id, sectionId],
    )
    await audit(db, {
      actorUserId: sub,
      action: 'datasheet.waiver',
      resourceType: 'project',
      resourceId: project.id,
      ip: clientIp(c.req.raw.headers),
      metadata: { sectionId, state: 'active' },
    })
    return await readDatasheet(db, project)
  })
  if (result === 'notfound') return problem(c, 404, 'Projeto não encontrado')
  if (result === 'forbidden') {
    return problem(c, 403, 'Sem permissão', 'Reverter a dispensa é da capitania.')
  }
  return c.json(result)
})

// ---------- E6: saídas ----------

datasheet.get('/:id/datasheet/export', async (c) => {
  const fmt = c.req.query('fmt') === 'csv' ? 'csv' : 'md'
  const { sub } = c.get('auth')
  const out = await withUser(sub, async (db) => {
    const project = await loadProject(db, c.req.param('id'))
    if (!project) return null
    const values = await loadValues(db, project.id)
    const waivers = await loadWaivers(db, project.id)
    const snap = await latestCage(db, project.id)
    return {
      name: project.name,
      body: {
        projectName: project.name,
        catalogVersion: DATASHEET_VERSION,
        values,
        suggestions: suggestFrom(snap?.cage, { seq: snap?.seq }),
        waivers,
      },
    }
  })
  if (!out) return problem(c, 404, 'Projeto não encontrado')

  const slug = out.name
    .normalize('NFD')
    .replace(/[^\w-]+/g, '-')
    .toLowerCase()
    .slice(0, 60)
  const body = fmt === 'csv' ? exportCsv(out.body) : exportMarkdown(out.body)
  return c.body(body, 200, {
    'Content-Type': fmt === 'csv' ? 'text/csv; charset=utf-8' : 'text/markdown; charset=utf-8',
    'Content-Disposition': `attachment; filename="ficha-${slug || 'prototipo'}.${fmt}"`,
  })
})
