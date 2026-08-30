import { Hono } from 'hono'
import { AREA_LABELS, AREA_SHORT, levelName } from '@bajeiros/evolution/areas'
import { destinationFor } from '@bajeiros/evolution/destinations'
import { withUser, type DbClient } from '../../db'
import { problem } from '../../problem'
import { recomputeTeam, syncSeasonProjectStep } from '../evolution/engine'
import { loadActivity, loadSeason } from '../evolution/routes'
import type { AuthEnv } from '../../auth/middleware'

// DF-16 — Início: a página do dia da equipe.
//
// UM endpoint agregador (RF-1.1) porque o Aurora a 0 ACU acorda em ~15 s: cinco
// fetches em cascata multiplicariam o pior caso. Tudo aqui compõe dado que nasce
// em OUTRO DF — o Início não tem conteúdo próprio, só prioriza.

export const home = new Hono<AuthEnv>()

/** 3 passos, não trinta: o Início convida, não cobra (P-1.2). */
const STEPS = 3
const ACTIVITY = 8

home.get('/home', async (c) => {
  const { sub } = c.get('auth')
  const wanted = c.req.query('teamId')

  const payload = await withUser(sub, async (db) => {
    const user = (
      await db.query('SELECT id, display_name, is_admin FROM users WHERE id = $1', [sub])
    ).rows[0]
    if (!user) return 'no-user' as const

    const teams = (
      await db.query(
        `SELECT t.id, t.name, t.university, m.role, m.status
         FROM team_members m JOIN teams t ON t.id = m.team_id
         WHERE m.user_id = $1 ORDER BY m.joined_at`,
        [sub],
      )
    ).rows
    const active = teams.find((t) => t.id === wanted) ?? teams[0]

    // RF-2.1 — sem equipe o Início não é beco sem saída: convida e mostra os meios
    if (!active) {
      return {
        user: toUser(user),
        team: null,
        teams: [],
        state: 'sem-equipe' as const,
        ...(await personalModules(db, sub)),
      }
    }

    const teamId = active.id as string
    const season = await loadSeason(db, teamId)
    await syncSeasonProjectStep(db, teamId, !!season?.seasonProjectId)
    const evo = await recomputeTeam(db, teamId, { actorUserId: sub })

    const steps = (
      await db.query(
        `SELECT id, title, area, origin, criterion_id, link_ref, owner_user_id, status
         FROM evolution_steps
         WHERE team_id = $1 AND status = 'open'
         ORDER BY position, created_at LIMIT 20`,
        [teamId],
      )
    ).rows.map(toStep)

    // RF-2.3 — única personalização por pessoa da v1: o trainee com trilha aberta
    // vê "concluir a trilha" primeiro. Mais que isso vira feed opaco (§8.3).
    const trail = (
      await db.query(
        `SELECT g.id, g.title FROM team_guides g
         WHERE g.team_id = $1 AND g.kind = 'trilha' AND g.deleted_at IS NULL
           AND NOT EXISTS (SELECT 1 FROM guide_completions gc
                           WHERE gc.guide_id = g.id AND gc.user_id = $2)
         LIMIT 1`,
        [teamId, sub],
      )
    ).rows[0]
    const isTrainee = active.status === 'trainee'
    const priority =
      isTrainee && trail
        ? [
            {
              id: `trilha:${trail.id}`,
              title: 'Concluir a trilha de integração',
              area: 'conhecimento',
              origin: 'trilha',
              criterionId: null,
              linkRef: trail.id as string,
              ownerUserId: sub,
              destination: { page: 'equipe', tab: 'conhecimento' },
            },
          ]
        : []

    const activity = await loadActivity(db, teamId, ACTIVITY)
    const counts = (
      await db.query(
        `SELECT
           (SELECT count(*)::int FROM team_decisions
            WHERE team_id = $1 AND deleted_at IS NULL) AS decisions,
           (SELECT count(*)::int FROM team_guides
            WHERE team_id = $1 AND deleted_at IS NULL) AS guides`,
        [teamId],
      )
    ).rows[0]

    const lastResult = (
      await db.query(
        `SELECT r.position, r.points_total, c.name, c.season
         FROM community_teams ct
         JOIN competition_results r ON r.community_team_id = ct.id
         JOIN competitions c ON c.id = r.competition_id
         WHERE ct.claimed_by_team_id = $1
         ORDER BY c.season DESC LIMIT 1`,
        [teamId],
      )
    ).rows[0]

    // RF-2.2 — equipe recém-criada vê o caminho mínimo, não seis barras vazias.
    // O sinal NÃO é "média zero": a equipe nasce com organograma padrão, então
    // Gestão já fecha o nível 1 e a média nunca é zero. O que caracteriza o
    // bootstrap é não ter projeto da temporada nem uma linha no diário.
    const bootstrap = !season?.seasonProjectId && Number(counts.decisions) === 0

    return {
      user: toUser(user),
      team: { id: teamId, name: active.name, university: active.university, role: active.role },
      teams: teams.map((t) => ({ id: t.id, name: t.name })),
      state: bootstrap ? ('bootstrap' as const) : ('normal' as const),
      season: season
        ? { label: season.label, next: season.next, seasonProjectId: season.seasonProjectId }
        : null,
      evolution: {
        average: evo.average,
        catalogVersion: evo.catalogVersion,
        areas: evo.areas.map((a) => ({
          area: a.area,
          label: AREA_LABELS[a.area],
          short: AREA_SHORT[a.area],
          level: a.level,
          levelName: levelName(a.level),
        })),
      },
      steps: [...priority, ...steps].slice(0, STEPS),
      openSteps: priority.length + steps.length,
      activity,
      knowledge: { decisions: Number(counts.decisions), guides: Number(counts.guides) },
      lastResult: lastResult
        ? {
            competition: lastResult.name,
            season: Number(lastResult.season),
            position: lastResult.position != null ? Number(lastResult.position) : null,
            pointsTotal: lastResult.points_total != null ? Number(lastResult.points_total) : null,
          }
        : null,
      ...(await personalModules(db, sub)),
    }
  })

  if (payload === 'no-user') return problem(c, 404, 'Usuário não encontrado')
  return c.json(payload)
})

/**
 * "Continuar de onde parou" — do USUÁRIO, não da equipe (RF-1.4). Ausente é módulo
 * omitido, nunca card vazio.
 */
async function personalModules(db: DbClient, sub: string) {
  const snapshot = (
    await db.query(
      `SELECT s.project_id, s.seq, s.created_at, p.name
       FROM cage_snapshots s JOIN projects p ON p.id = s.project_id
       WHERE s.saved_by_user_id = $1
       ORDER BY s.created_at DESC LIMIT 1`,
      [sub],
    )
  ).rows[0]
  const conversation = (
    await db.query(
      `SELECT id, question, occurred_at FROM assistant_log
       WHERE user_id = $1 AND status = 'ok'
       ORDER BY occurred_at DESC LIMIT 1`,
      [sub],
    )
  ).rows[0]
  return {
    continueEditor: snapshot
      ? {
          projectId: snapshot.project_id,
          projectName: snapshot.name,
          seq: Number(snapshot.seq),
          at: snapshot.created_at,
        }
      : null,
    continueAssistant: conversation
      ? {
          id: conversation.id,
          question: String(conversation.question).slice(0, 120),
          at: conversation.occurred_at,
        }
      : null,
  }
}

function toUser(row: Record<string, unknown>) {
  return { id: row.id, displayName: row.display_name ?? null, isAdmin: row.is_admin === true }
}

function toStep(row: Record<string, unknown>) {
  const criterionId = (row.criterion_id as string | null) ?? null
  return {
    id: row.id,
    title: row.title,
    area: row.area ?? null,
    origin: row.origin,
    criterionId,
    linkRef: row.link_ref ?? null,
    ownerUserId: row.owner_user_id ?? null,
    // o CTA precisa cair onde a coisa se resolve, senão a fila vira lamento
    destination: criterionId ? destinationFor(criterionId) : { page: 'equipe', tab: 'evolucao' },
  }
}
