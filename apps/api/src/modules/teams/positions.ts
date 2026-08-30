import type { Hono } from 'hono'
import { z } from 'zod'
import { withUser, type DbClient } from '../../db'
import { problem } from '../../problem'
import { audit, clientIp } from '../../audit'
import { can } from '../../policy'
import { lockTeam, myRole } from './shared'
import { publishOrgSummary } from '../evolution/engine'
import type { AuthEnv } from '../../auth/middleware'

// DF-10 — organograma: árvore de funções customizável por equipe, com descrição
// de responsabilidades (prática nº 1 das equipes de elite: estrutura explícita).
// Os nós de capitania ('captain'/'cocaptain') espelham o papel de acesso: não se
// criam, não se movem e não se excluem por aqui — só se renomeiam.

export const MAX_POSITIONS = 40
export const MAX_DEPTH = 5

export type PositionKind = 'captain' | 'cocaptain' | 'lead' | 'custom'

export interface PositionNode {
  id: string
  parentId: string | null
  kind: PositionKind
  name: string
  description: string | null
  sortOrder: number
}

const CAPTAINCY: PositionKind[] = ['captain', 'cocaptain']

// ---------- helpers puros de árvore (exportados p/ teste) ----------

function parentMap(nodes: PositionNode[]): Map<string, string | null> {
  return new Map(nodes.map((n) => [n.id, n.parentId]))
}

// 1 = raiz. parentId órfão conta como raiz (igual ao desenho do organograma) e
// ciclo pré-existente devolve Infinity em vez de travar.
export function depthOf(nodes: PositionNode[], id: string): number {
  const parents = parentMap(nodes)
  const seen = new Set<string>()
  let depth = 1
  let cur = parents.get(id) ?? null
  while (cur && parents.has(cur)) {
    if (seen.has(cur)) return Infinity
    seen.add(cur)
    depth++
    cur = parents.get(cur) ?? null
  }
  return depth
}

export function descendants(nodes: PositionNode[], id: string): Set<string> {
  const byParent = new Map<string, PositionNode[]>()
  for (const n of nodes) {
    if (!n.parentId) continue
    const list = byParent.get(n.parentId) ?? []
    list.push(n)
    byParent.set(n.parentId, list)
  }
  const out = new Set<string>()
  const stack = [id]
  while (stack.length) {
    for (const child of byParent.get(stack.pop() as string) ?? []) {
      if (out.has(child.id)) continue
      out.add(child.id)
      stack.push(child.id)
    }
  }
  return out
}

// 1 = folha. Altura da subárvore, p/ conferir profundidade após um move.
export function subtreeHeight(nodes: PositionNode[], id: string): number {
  const sub = descendants(nodes, id)
  const base = depthOf(nodes, id)
  let max = 1
  for (const n of nodes) {
    if (!sub.has(n.id)) continue
    max = Math.max(max, depthOf(nodes, n.id) - base + 1)
  }
  return max
}

// ---------- acesso ----------

export async function loadPositions(db: DbClient, teamId: string): Promise<PositionNode[]> {
  const r = await db.query(
    `SELECT id, parent_id, kind, name, description, sort_order
     FROM team_positions WHERE team_id = $1 ORDER BY sort_order, created_at`,
    [teamId],
  )
  return r.rows.map(toNode)
}

function toNode(row: Record<string, unknown>): PositionNode {
  return {
    id: row.id as string,
    parentId: (row.parent_id as string | null) ?? null,
    kind: row.kind as PositionKind,
    name: row.name as string,
    description: (row.description as string | null) ?? null,
    sortOrder: Number(row.sort_order ?? 0),
  }
}

const createBody = z.object({
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(280).nullable().optional(),
  parentId: z.string().uuid(),
  kind: z.enum(['lead', 'custom']).optional(),
})

const patchBody = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  description: z.string().trim().max(280).nullable().optional(),
  parentId: z.string().uuid().optional(),
  sortOrder: z.number().int().min(0).max(999).optional(),
})

// Registra as rotas no MESMO app de teams (params do prefixo continuam legíveis).
export function registerPositionRoutes(teams: Hono<AuthEnv>): void {
  teams.get('/:id/positions', async (c) => {
    const { sub } = c.get('auth')
    const teamId = c.req.param('id')
    const rows = await withUser(sub, async (db) => {
      if (!(await myRole(db, teamId, sub))) return null
      return loadPositions(db, teamId)
    })
    if (!rows) return problem(c, 404, 'Equipe não encontrada')
    return c.json(rows)
  })

  teams.post('/:id/positions', async (c) => {
    const parsed = createBody.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return problem(c, 400, 'Body inválido', parsed.error.message)
    const { sub } = c.get('auth')
    const teamId = c.req.param('id')

    const result = await withUser(sub, async (db) => {
      // trava a equipe: sem isso, dois PATCH concorrentes validam contra a árvore
      // de antes e conseguem fechar um ciclo (ou furar o limite de funções)
      if (!(await lockTeam(db, teamId))) return 'notfound' as const
      const role = await myRole(db, teamId, sub)
      if (!role) return 'notfound' as const
      if (!can(role, 'position.manage')) return 'forbidden' as const

      const nodes = await loadPositions(db, teamId)
      if (nodes.length >= MAX_POSITIONS) return 'limit' as const
      const parent = nodes.find((n) => n.id === parsed.data.parentId)
      if (!parent) return 'no-parent' as const
      if (depthOf(nodes, parent.id) + 1 > MAX_DEPTH) return 'deep' as const

      const siblings = nodes.filter((n) => n.parentId === parent.id)
      const order = siblings.reduce((max, s) => Math.max(max, s.sortOrder + 1), 0)
      const r = await db.query(
        `INSERT INTO team_positions (team_id, parent_id, kind, name, description, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, parent_id, kind, name, description, sort_order`,
        [
          teamId,
          parent.id,
          parsed.data.kind ?? 'custom',
          parsed.data.name,
          parsed.data.description ?? null,
          order,
        ],
      )
      await audit(db, {
        actorUserId: sub,
        action: 'team.position.create',
        resourceType: 'team_position',
        resourceId: r.rows[0].id,
        ip: clientIp(c.req.raw.headers),
        metadata: { teamId },
      })
      // DF-13 GES-1.1/2.1 leem o organograma: toda mutação republica o resumo
      await publishOrgSummary(db, teamId, sub)
      return toNode(r.rows[0])
    })

    if (result === 'notfound') return problem(c, 404, 'Equipe não encontrada')
    if (result === 'forbidden')
      return problem(c, 403, 'Sem permissão', 'Só a capitania organiza as funções da equipe.')
    if (result === 'limit')
      return problem(c, 409, 'Limite de funções', `Máximo de ${MAX_POSITIONS} funções por equipe.`)
    if (result === 'no-parent')
      return problem(
        c,
        400,
        'Função-mãe inválida',
        'Toda função precisa de uma função-mãe desta equipe (só a capitania fica na raiz).',
      )
    if (result === 'deep')
      return problem(c, 409, 'Hierarquia muito profunda', `Máximo de ${MAX_DEPTH} níveis.`)
    return c.json(result, 201)
  })

  teams.patch('/:id/positions/:positionId', async (c) => {
    const parsed = patchBody.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return problem(c, 400, 'Body inválido', parsed.error.message)
    const { sub } = c.get('auth')
    const teamId = c.req.param('id')
    const positionId = c.req.param('positionId')

    const result = await withUser(sub, async (db) => {
      // trava a equipe: sem isso, dois PATCH concorrentes validam contra a árvore
      // de antes e conseguem fechar um ciclo (ou furar o limite de funções)
      if (!(await lockTeam(db, teamId))) return 'notfound' as const
      const role = await myRole(db, teamId, sub)
      if (!role) return 'notfound' as const
      if (!can(role, 'position.manage')) return 'forbidden' as const

      const nodes = await loadPositions(db, teamId)
      const node = nodes.find((n) => n.id === positionId)
      if (!node) return 'notfound' as const

      if (parsed.data.parentId !== undefined && parsed.data.parentId !== node.parentId) {
        if (CAPTAINCY.includes(node.kind)) return 'fixed' as const
        const target = nodes.find((n) => n.id === parsed.data.parentId)
        if (!target) return 'no-parent' as const
        if (target.id === node.id || descendants(nodes, node.id).has(target.id))
          return 'cycle' as const
        if (depthOf(nodes, target.id) + subtreeHeight(nodes, node.id) > MAX_DEPTH)
          return 'deep' as const
      }

      const r = await db.query(
        `UPDATE team_positions SET
           name        = COALESCE($3, name),
           description = CASE WHEN $5 THEN $4 ELSE description END,
           parent_id   = COALESCE($6, parent_id),
           sort_order  = COALESCE($7, sort_order)
         WHERE id = $1 AND team_id = $2
         RETURNING id, parent_id, kind, name, description, sort_order`,
        [
          positionId,
          teamId,
          parsed.data.name ?? null,
          parsed.data.description ?? null,
          'description' in parsed.data,
          parsed.data.parentId ?? null,
          parsed.data.sortOrder ?? null,
        ],
      )
      if (!r.rowCount) return 'notfound' as const
      await audit(db, {
        actorUserId: sub,
        action: 'team.position.update',
        resourceType: 'team_position',
        resourceId: positionId,
        ip: clientIp(c.req.raw.headers),
        metadata: { teamId },
      })
      await publishOrgSummary(db, teamId, sub)
      return toNode(r.rows[0])
    })

    if (result === 'notfound') return problem(c, 404, 'Função não encontrada')
    if (result === 'forbidden')
      return problem(c, 403, 'Sem permissão', 'Só a capitania organiza as funções da equipe.')
    if (result === 'fixed')
      return problem(
        c,
        409,
        'Função da capitania',
        'Capitão/capitã e co-capitães ficam no topo do organograma — dá para renomear, não para mover.',
      )
    if (result === 'no-parent') return problem(c, 400, 'Função-mãe inválida')
    if (result === 'cycle')
      return problem(
        c,
        409,
        'Hierarquia inválida',
        'Uma função não pode ficar abaixo de si mesma nem de uma função que já está abaixo dela.',
      )
    if (result === 'deep')
      return problem(c, 409, 'Hierarquia muito profunda', `Máximo de ${MAX_DEPTH} níveis.`)
    return c.json(result)
  })

  // Exclui a função e sobe os filhos p/ a função-mãe. Quem ocupava fica "sem
  // função" (FK ON DELETE SET NULL) — ninguém sai da equipe por isso.
  teams.delete('/:id/positions/:positionId', async (c) => {
    const { sub } = c.get('auth')
    const teamId = c.req.param('id')
    const positionId = c.req.param('positionId')

    const result = await withUser(sub, async (db) => {
      // trava a equipe: sem isso, dois PATCH concorrentes validam contra a árvore
      // de antes e conseguem fechar um ciclo (ou furar o limite de funções)
      if (!(await lockTeam(db, teamId))) return 'notfound' as const
      const role = await myRole(db, teamId, sub)
      if (!role) return 'notfound' as const
      if (!can(role, 'position.manage')) return 'forbidden' as const

      const nodes = await loadPositions(db, teamId)
      const node = nodes.find((n) => n.id === positionId)
      if (!node) return 'notfound' as const
      if (CAPTAINCY.includes(node.kind)) return 'fixed' as const

      await db.query(
        'UPDATE team_positions SET parent_id = $2 WHERE parent_id = $1 AND team_id = $3',
        [positionId, node.parentId, teamId],
      )
      await db.query('DELETE FROM team_positions WHERE id = $1 AND team_id = $2', [
        positionId,
        teamId,
      ])
      await audit(db, {
        actorUserId: sub,
        action: 'team.position.delete',
        resourceType: 'team_position',
        resourceId: positionId,
        ip: clientIp(c.req.raw.headers),
        metadata: { teamId },
      })
      // DF-13 GES-1.1/2.1 leem o organograma: toda mutação republica o resumo
      await publishOrgSummary(db, teamId, sub)
      return 'ok' as const
    })

    if (result === 'notfound') return problem(c, 404, 'Função não encontrada')
    if (result === 'forbidden')
      return problem(c, 403, 'Sem permissão', 'Só a capitania organiza as funções da equipe.')
    if (result === 'fixed')
      return problem(
        c,
        409,
        'Função da capitania',
        'Capitão/capitã e co-capitães fazem parte da estrutura — não dá para excluir.',
      )
    return c.body(null, 204)
  })

  // Estrutura padrão de equipe de elite. Idempotente: no-op se já houver funções.
  teams.post('/:id/positions/seed', async (c) => {
    const { sub } = c.get('auth')
    const teamId = c.req.param('id')
    const result = await withUser(sub, async (db) => {
      // trava a equipe: sem isso, dois PATCH concorrentes validam contra a árvore
      // de antes e conseguem fechar um ciclo (ou furar o limite de funções)
      if (!(await lockTeam(db, teamId))) return 'notfound' as const
      const role = await myRole(db, teamId, sub)
      if (!role) return 'notfound' as const
      if (!can(role, 'position.manage')) return 'forbidden' as const
      const created = await seedPositions(db, teamId)
      if (created > 0) {
        await audit(db, {
          actorUserId: sub,
          action: 'team.position.seed',
          resourceType: 'team',
          resourceId: teamId,
          ip: clientIp(c.req.raw.headers),
          metadata: { created },
        })
        await publishOrgSummary(db, teamId, sub)
      }
      return { created, positions: await loadPositions(db, teamId) }
    })
    if (result === 'notfound') return problem(c, 404, 'Equipe não encontrada')
    if (result === 'forbidden')
      return problem(c, 403, 'Sem permissão', 'Só a capitania organiza as funções da equipe.')
    return c.json(result)
  })
}

// Cria o organograma padrão. Usado no POST /teams (equipe nova) e no botão
// "criar estrutura padrão". Quem ocupa os nós de capitania não se grava aqui:
// esses nós mostram quem tem o papel de acesso correspondente.
export async function seedPositions(db: DbClient, teamId: string): Promise<number> {
  const r = await db.query('SELECT seed_default_positions($1) AS created', [teamId])
  return Number(r.rows[0]?.created ?? 0)
}
