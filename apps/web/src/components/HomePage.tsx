import { useEffect } from 'react'
import { formatAverage, levelLabel } from '@bajeiros/evolution/areas'
import type { AreaId, AreaLevel } from '@bajeiros/evolution/types'
import { useSession } from '../session'
import { quando, useFetch } from '../lib/useFetch'
import { IconArrow } from '../icons/glyphs'
import { STATUS_LABEL, StatusChip } from '../icons/statusIcon'

/**
 * Início (DF-16) — a página que responde "o que precisa de mim?".
 *
 * O Início NÃO tem conteúdo próprio: toda linha nasce em outro DF. Ele agrega e
 * prioriza — três passos, não trinta (P-1.2), e nunca "Carregando…" eterno (C-12).
 */
interface Home {
  user: { displayName: string | null }
  team: { id: string; name: string; role: string } | null
  teams: { id: string; name: string }[]
  state: 'normal' | 'bootstrap' | 'sem-equipe'
  season?: { label: string; next: { title: string; daysLeft: number } | null } | null
  evolution?: {
    average: number
    areas: { area: AreaId; short: string; level: AreaLevel; levelName: string }[]
  }
  steps?: {
    id: string
    title: string
    destination: { page: string; tab?: string }
  }[]
  openSteps?: number
  activity?: {
    id: string
    kind: string
    payload: Record<string, unknown>
    snapshotSeq: number | null
    createdAt: string
  }[]
  knowledge?: { decisions: number; guides: number }
  lastResult?: {
    competition: string
    position: number | null
    pointsTotal: number | null
  } | null
  continueEditor?: { projectId: string; projectName: string; seq: number } | null
  continueAssistant?: { question: string; at: string } | null
}

function saudacao(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

export function HomePage() {
  const activeTeamId = useSession((s) => s.activeTeamId)
  const setActiveTeam = useSession((s) => s.setActiveTeam)
  const setPage = useSession((s) => s.setPage)
  const goToTeam = useSession((s) => s.goToTeam)
  const setCurrentProject = useSession((s) => s.setCurrentProject)
  const home = useFetch<Home>(`/api/v1/me/home${activeTeamId ? `?teamId=${activeTeamId}` : ''}`, [
    activeTeamId,
  ])

  // Guarda a equipe que o Início RESOLVEU sozinho — e só isso. Sincronizar de volta
  // sempre que os ids diferem faria o efeito rodar antes de o refetch terminar e
  // desfazer a escolha do seletor no mesmo tick: trocar de equipe viraria no-op.
  useEffect(() => {
    const id = home.data?.team?.id
    if (id && !activeTeamId) setActiveTeam(id)
  }, [home.data?.team?.id, activeTeamId, setActiveTeam])

  const ir = (destino: { page: string; tab?: string }) => {
    if (destino.page === 'editor') return setPage('editor')
    if (destino.page === 'equipe') return goToTeam(destino.tab as never)
    setPage(destino.page as never)
  }

  if (home.estado === 'loading') {
    return (
      <div className="bj-page" aria-busy="true">
        <span className="bj-skeleton" style={{ height: 40, maxWidth: 360 }} />
        <span className="bj-skeleton" style={{ height: 180 }} />
      </div>
    )
  }

  if (home.estado === 'error' || !home.data) {
    return (
      <div className="bj-page">
        <p className="bj-erro" role="alert">
          {home.erro ?? 'Não deu para carregar o Início.'}{' '}
          <button type="button" className="bj-link" onClick={home.recarregar}>
            Tentar de novo
          </button>
        </p>
      </div>
    )
  }

  const d = home.data
  const nome = d.user.displayName?.split(' ')[0] ?? ''

  return (
    <div className="bj-page bj-inicio">
      <header className="bj-inicio-saudacao">
        <h2>
          {saudacao()}
          {nome ? `, ${nome}` : ''}
        </h2>
        <p>
          {d.team ? d.team.name : 'Você ainda não participa de uma equipe'}
          {d.season?.label ? ` · temporada ${d.season.label}` : ''}
          {d.season?.next
            ? ` · faltam ${d.season.next.daysLeft} dias para ${d.season.next.title}`
            : ''}
        </p>
        {d.teams.length > 1 && (
          <select
            className="bj-eq-seletor"
            value={d.team?.id ?? ''}
            onChange={(e) => setActiveTeam(e.target.value)}
            aria-label="Equipe ativa"
          >
            {d.teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        )}
      </header>

      {d.state === 'sem-equipe' && (
        <section className="bj-vazio">
          <h3>Comece por uma equipe</h3>
          <p>
            O portal gira em torno da evolução das equipes. Crie a sua ou entre por um convite — e o
            Início passa a mostrar o que precisa de você hoje.
          </p>
          <div className="bj-card-acoes">
            <button type="button" className="bj-btn bj-btn-primary" onClick={() => goToTeam()}>
              Criar ou entrar em uma equipe
            </button>
            <button type="button" className="bj-btn" onClick={() => setPage('ferramentas')}>
              Ver as ferramentas
            </button>
          </div>
        </section>
      )}

      {d.team && (
        <div className="bj-inicio-corpo">
          <div className="bj-inicio-principal">
            <section>
              <h3>Próximos passos</h3>
              {d.state === 'bootstrap' && (
                <p className="bj-lead">
                  Equipe nova: o caminho mínimo é designar o projeto da temporada, registrar a
                  primeira decisão e configurar os marcos.
                </p>
              )}
              {(d.steps ?? []).length === 0 ? (
                <p className="bj-vazio">Nada pendente agora. Bom sinal.</p>
              ) : (
                <ol className="bj-passos">
                  {(d.steps ?? []).map((s) => (
                    <li key={s.id}>
                      <button type="button" className="bj-passo" onClick={() => ir(s.destination)}>
                        <span className="bj-passo-titulo">{s.title}</span>
                        <IconArrow size={16} />
                      </button>
                    </li>
                  ))}
                </ol>
              )}
              {(d.openSteps ?? 0) > (d.steps ?? []).length && (
                <button type="button" className="bj-link" onClick={() => goToTeam('evolucao')}>
                  Ver a fila completa ({d.openSteps})
                </button>
              )}
            </section>

            <section>
              <h3>Atividade da equipe</h3>
              {(d.activity ?? []).length === 0 ? (
                <p className="bj-vazio">Ainda sem atividade registrada.</p>
              ) : (
                <ul className="bj-atividade">
                  {(d.activity ?? []).map((e) => (
                    <li key={e.id}>
                      <Narrativa kind={e.kind} payload={e.payload} seq={e.snapshotSeq} />
                      <span className="bj-atividade-quando">{quando(e.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <aside className="bj-inicio-lateral">
            {d.evolution && (
              <section className="bj-card">
                <header>
                  <h3>Evolução</h3>
                </header>
                <div className="bj-evo-media">
                  <strong>{formatAverage(d.evolution.average)}</strong>
                  <span>de 5</span>
                </div>
                <ul className="bj-evo-mini">
                  {d.evolution.areas.map((a) => (
                    <li key={a.area}>
                      <span>{a.short}</span>
                      <span className="bj-barra" aria-hidden="true">
                        {Array.from({ length: 5 }, (_, i) => (
                          <span key={i} className={i < a.level ? 'bj-barra-cheio' : undefined} />
                        ))}
                      </span>
                      <span className="bj-evo-mini-nivel">{levelLabel(a.level)}</span>
                    </li>
                  ))}
                </ul>
                <button type="button" className="bj-link" onClick={() => goToTeam('evolucao')}>
                  Ver evolução completa ›
                </button>
              </section>
            )}

            {(d.continueEditor || d.continueAssistant) && (
              <section className="bj-card">
                <header>
                  <h3>Continuar de onde parou</h3>
                </header>
                {d.continueEditor && (
                  <button
                    type="button"
                    className="bj-btn"
                    onClick={() => {
                      setCurrentProject({
                        id: d.continueEditor!.projectId,
                        name: d.continueEditor!.projectName,
                        seq: d.continueEditor!.seq,
                      })
                      setPage('editor')
                    }}
                  >
                    {d.continueEditor.projectName} · v{d.continueEditor.seq}
                    <IconArrow size={16} />
                  </button>
                )}
                {d.continueAssistant && (
                  <button type="button" className="bj-btn" onClick={() => setPage('assistant')}>
                    Retomar: “{d.continueAssistant.question}”
                    <IconArrow size={16} />
                  </button>
                )}
              </section>
            )}

            {d.lastResult && (
              <section className="bj-card">
                <header>
                  <h3>Temporada</h3>
                </header>
                <p>
                  {d.lastResult.competition}
                  {d.lastResult.position ? ` · ${d.lastResult.position}º lugar` : ''}
                </p>
                <button type="button" className="bj-link" onClick={() => setPage('comunidade')}>
                  Ver na comunidade ›
                </button>
              </section>
            )}
          </aside>
        </div>
      )}
    </div>
  )
}

/**
 * Narrativa da atividade (RF-1.3): as contagens usam as strings canônicas de status,
 * com o TEXTO como portador — a cor é reforço.
 */
function Narrativa({
  kind,
  payload,
  seq,
}: {
  kind: string
  payload: Record<string, unknown>
  seq: number | null
}) {
  const n = (k: string) => Number((payload[k] as number | undefined) ?? 0)
  switch (kind) {
    case 'validation.summary': {
      const counts = (payload.counts ?? {}) as Record<string, number>
      return (
        <span>
          Projeto da temporada salvo{seq ? ` (v${seq})` : ''} —{' '}
          <b>
            {counts.pass ?? 0} {STATUS_LABEL.pass}
          </b>{' '}
          ·{' '}
          <b>
            {counts.fail ?? 0} {STATUS_LABEL.fail}
          </b>{' '}
          ·{' '}
          <b>
            {counts.manual ?? 0} {STATUS_LABEL.manual}
          </b>
        </span>
      )
    }
    case 'level.changed': {
      const de = n('from')
      const para = n('to')
      const motivos = (payload.because ?? []) as { reason: string }[]
      const subiu = para > de
      return (
        <span>
          {subiu ? <StatusChip role="pass" /> : <StatusChip role="warn" />}{' '}
          <b>{String(payload.area)}</b> {subiu ? 'subiu' : 'voltou'} para o nível {para}
          {!subiu && motivos[0] ? ` — ${motivos[0].reason}` : ''}
        </span>
      )
    }
    case 'decision.created':
      return (
        <span>
          Decisão nº {n('seq')} registrada: <b>{String(payload.title ?? '')}</b>
        </span>
      )
    case 'guide.published':
      return (
        <span>
          Guia publicado: <b>{String(payload.title ?? '')}</b>
        </span>
      )
    case 'trail.completed':
      return <span>Alguém concluiu a trilha de integração</span>
    case 'kit.opened':
      return <span>Kit de passagem aberto para {String(payload.memberName ?? 'um membro')}</span>
    case 'kit.completed':
      return <span>Kit de passagem concluído</span>
    case 'season.configured':
      return (
        <span>
          Temporada {String(payload.label ?? '')} configurada com {n('milestones')} marcos
        </span>
      )
    case 'criterion.declared':
      return (
        <span>
          Critério declarado: <b>{String(payload.label ?? payload.criterionId ?? '')}</b>
        </span>
      )
    case 'template.generated':
      return <span>Gabarito de corte gerado</span>
    case 'competition.result':
      return (
        <span>
          Resultado de {String(payload.competition ?? 'competição')}: {n('position')}º de{' '}
          {n('total')}
        </span>
      )
    default:
      return <span>{kind}</span>
  }
}
