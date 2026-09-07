import { useEffect, useRef, useState } from 'react'
import type { CalendarMilestone, CalendarPayload } from '@bajeiros/calendar/types'
import { countdown, dataCurta } from '@bajeiros/calendar/dates'
import { buildIcs } from '@bajeiros/calendar/ics'
import {
  AVISO_FONTE,
  chipDeCategoria,
  KIND_LABEL,
  nomeDaFonte,
  SOURCE_LABEL,
} from '@bajeiros/calendar/labels'
import { useSession } from '../session'
import { mensagem } from '../lib/useFetch'
import { baixarTexto } from '../lib/calendario'
import { IconArrow, IconDownload, IconX } from '../icons/glyphs'
import { askAssistant } from './AssistantPanel'

/**
 * Painel de detalhe do marco (FR-DF33.15/16) e do marco da equipe (FR-DF33.30). É onde a
 * pessoa está prestes a agir — e onde o aviso da fonte paga: o rodapé o repete.
 */
/** Item de `team_season.milestones` como o PUT /season recebe. */
interface SeasonMilestoneBody {
  title: string
  date: string
  kind?: 'marco' | 'entrega'
  sourceMilestoneId?: string
}

interface Props {
  marco: CalendarMilestone
  payload: CalendarPayload
  teamId: string | null
  onClose: () => void
  onSelect: (id: string) => void
  onChanged: () => void
}

export function MilestonePanel({ marco, payload, teamId, onClose, onSelect, onChanged }: Props) {
  const api = useSession((s) => s.api)
  const user = useSession((s) => s.user)
  const setPanel = useSession((s) => s.setPanel)
  const goToTeam = useSession((s) => s.goToTeam)
  const goToRegulation = useSession((s) => s.goToRegulation) // DF-34 FR-DF34.20
  const [estado, setEstado] = useState<{ passo?: 'feito'; copia?: 'feita'; erro?: string }>({})
  const titulo = useRef<HTMLHeadingElement>(null)
  const { today, team } = payload
  const comp = marco.competitionId
    ? (payload.competitions.find((c) => c.id === marco.competitionId) ?? null)
    : null
  const daEquipe = marco.kind === 'equipe'
  const contagem = countdown(marco.dueOn, today)

  // o estado das ações reinicia por `key={marco.id}` no pai — aqui só o foco
  useEffect(() => {
    titulo.current?.focus()
  }, [marco.id])

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [onClose])

  const jaCopiado = payload.milestones.find(
    (m) => m.kind === 'equipe' && m.team?.sourceMilestoneId === marco.id,
  )

  const salvarTemporada = async (milestones: SeasonMilestoneBody[]) => {
    if (!team || !teamId) return
    await api(`/api/v1/teams/${teamId}/season`, {
      method: 'PUT',
      body: JSON.stringify({ label: team.label, milestones }),
    })
    onChanged()
  }

  /** Os marcos da equipe como estão hoje, na ordem do índice — para editar um e salvar todos. */
  const marcosDaEquipe = () =>
    payload.milestones
      .filter((m) => m.kind === 'equipe' && m.team)
      .sort((a, b) => a.team!.index - b.team!.index)
      .map((m) => ({
        title: m.title,
        date: m.dueOn,
        ...(m.team!.kind ? { kind: m.team!.kind } : {}),
        ...(m.team!.sourceMilestoneId ? { sourceMilestoneId: m.team!.sourceMilestoneId } : {}),
      }))

  const adicionarATemporada = async () => {
    try {
      await salvarTemporada([
        ...marcosDaEquipe(),
        { title: marco.title, date: marco.dueOn, kind: 'marco', sourceMilestoneId: marco.id },
      ])
      setEstado({ copia: 'feita' })
    } catch (e) {
      setEstado({ erro: mensagem(e) })
    }
  }

  const atualizarPelaFonte = async () => {
    const lista = marcosDaEquipe()
    const i = marco.team!.index
    if (!lista[i] || !marco.team?.sourceDueOn) return
    lista[i] = { ...lista[i], date: marco.team.sourceDueOn }
    try {
      await salvarTemporada(lista)
    } catch (e) {
      setEstado({ erro: mensagem(e) })
    }
  }

  const remover = async () => {
    const lista = marcosDaEquipe().filter((_, i) => i !== marco.team!.index)
    try {
      await salvarTemporada(lista)
      onClose()
    } catch (e) {
      setEstado({ erro: mensagem(e) })
    }
  }

  const transformarEmPasso = async () => {
    if (!teamId) return
    try {
      await api(`/api/v1/teams/${teamId}/evolution/steps`, {
        method: 'POST',
        body: JSON.stringify({
          title: marco.title.slice(0, 140),
          origin: 'calendario',
          linkRef: `milestone:${marco.id}`,
          dueOn: marco.dueOn,
        }),
      })
      setEstado({ passo: 'feito' })
    } catch (e) {
      setEstado({ erro: mensagem(e) })
    }
  }

  const baixarUm = () => {
    // FR-DF33.21 — .ics de UM marco, gerado no cliente, sem chamada à API
    baixarTexto(
      buildIcs({ milestones: [marco], competitions: comp ? [comp] : [], name: marco.title }),
      `${marco.title.toLowerCase().replace(/[^a-z0-9]+/gi, '-')}.ics`,
    )
  }

  return (
    <aside className="bj-cal-painel" role="dialog" aria-labelledby="cal-painel-titulo">
      <div className="bj-cal-painel-topo">
        <span className="bj-chip bj-chip-neutro">
          {daEquipe
            ? marco.team?.kind === 'entrega'
              ? 'ENTREGA'
              : 'MARCO DA EQUIPE'
            : KIND_LABEL[marco.kind].toUpperCase()}
        </span>
        <button type="button" className="bj-btn bj-btn-sm" aria-label="Fechar" onClick={onClose}>
          <IconX size={16} />
        </button>
      </div>
      <h3 id="cal-painel-titulo" ref={titulo} tabIndex={-1}>
        {marco.title}
      </h3>
      <p className="bj-cal-painel-data">
        {marco.startsOn ? `${dataCurta(marco.startsOn)} a ` : 'até '}
        <b>{dataCurta(marco.dueOn)}</b> · {contagem.text}
      </p>
      <dl className="bj-cal-painel-campos">
        {comp && (
          <>
            <dt>Competição</dt>
            <dd>{comp.name}</dd>
          </>
        )}
        {daEquipe && team && (
          <>
            <dt>Temporada</dt>
            <dd>{team.label}</dd>
          </>
        )}
        {marco.appliesTo.length > 0 && (
          <>
            <dt>Vale para</dt>
            <dd>
              <span className="bj-chip bj-chip-neutro">{chipDeCategoria(marco.appliesTo)}</span>
            </dd>
          </>
        )}
        {marco.status === 'previsto' && (
          <>
            <dt>Situação</dt>
            <dd>previsto — a organização ainda não confirmou a data</dd>
          </>
        )}
        {daEquipe && team?.updatedAt && (
          <>
            <dt>Configurado</dt>
            <dd>em {dataCurta(team.updatedAt.slice(0, 10))}, pela capitania</dd>
          </>
        )}
        {daEquipe && marco.team?.sourceMilestoneId && (
          <>
            <dt>Origem</dt>
            <dd>
              <button
                type="button"
                className="bj-link"
                onClick={() => onSelect(marco.team!.sourceMilestoneId!)}
              >
                marco oficial do calendário
              </button>
            </dd>
          </>
        )}
      </dl>

      {marco.summary && <p className="bj-cal-painel-resumo">{marco.summary}</p>}

      {/* FR-DF33.29 — a cópia não muda sozinha; o painel avisa e oferece */}
      {daEquipe && marco.team?.sourceDueOn && (
        <p className="bj-nota-credencial">
          A fonte agora diz {dataCurta(marco.team.sourceDueOn)}.{' '}
          {team?.canManage && (
            <button type="button" className="bj-link" onClick={atualizarPelaFonte}>
              Atualizar?
            </button>
          )}
        </p>
      )}

      {!daEquipe && (
        <section className="bj-cal-painel-fonte">
          <h4>Fonte</h4>
          {marco.source ? (
            <p>
              {SOURCE_LABEL[marco.source.kind]}: <b>{nomeDaFonte(marco.source)}</b>
              {marco.source.kind === 'informativo' &&
              marco.source.title !== nomeDaFonte(marco.source)
                ? ` — ${marco.source.title}`
                : ''}
              {marco.checkedAt && (
                <span className="bj-legenda">
                  {' '}
                  · conferido em {dataCurta(marco.checkedAt.slice(0, 10))}
                </span>
              )}
            </p>
          ) : (
            <p className="bj-legenda">
              Sem documento-fonte registrado para este marco. Confira a página oficial da
              competição.
            </p>
          )}
        </section>
      )}

      <div className="bj-cal-painel-acoes">
        {!daEquipe && (marco.source?.url ?? comp?.officialUrl) && (
          <a
            className="bj-btn bj-btn-primary"
            href={marco.source?.url ?? comp?.officialUrl ?? '#'}
            target="_blank"
            rel="noreferrer"
          >
            Abrir a fonte oficial <IconArrow size={16} />
          </a>
        )}
        <button type="button" className="bj-btn" onClick={baixarUm}>
          <IconDownload size={16} /> Adicionar ao calendário (.ics)
        </button>
        {!user && (
          <p className="bj-legenda">
            <button type="button" className="bj-link" onClick={() => setPanel('login')}>
              Entre ou crie conta
            </button>{' '}
            para transformar em passo da sua equipe.
          </p>
        )}
        {team?.canSteps &&
          (estado.passo === 'feito' ? (
            <span className="bj-chip bj-chip-pass">VIROU PASSO</span>
          ) : (
            <button type="button" className="bj-btn" onClick={transformarEmPasso}>
              Transformar em passo
            </button>
          ))}
        {!daEquipe &&
          team?.canManage &&
          (jaCopiado || estado.copia === 'feita' ? (
            <span className="bj-chip bj-chip-neutro">NA SUA TEMPORADA</span>
          ) : (
            <button type="button" className="bj-btn" onClick={adicionarATemporada}>
              Adicionar à minha temporada
            </button>
          ))}
        {!daEquipe && marco.sectionId && (
          <button type="button" className="bj-btn" onClick={() => goToRegulation(marco.sectionId!)}>
            Ler a regra
          </button>
        )}
        {!daEquipe && marco.sectionId && (
          <button
            type="button"
            className="bj-btn"
            onClick={() =>
              askAssistant(
                `O que a seção ${marco.sectionId} do regulamento exige sobre "${marco.title}"?`,
                { ruleId: marco.sectionId! },
              )
            }
          >
            Perguntar ao assistente
          </button>
        )}
        {daEquipe && (
          <>
            <button type="button" className="bj-btn" onClick={() => goToTeam('projetos')}>
              Editar na aba Projetos
            </button>
            {team?.canManage && (
              <button type="button" className="bj-btn" onClick={remover}>
                Remover
              </button>
            )}
          </>
        )}
      </div>
      {estado.erro && (
        <p className="bj-erro" role="alert">
          {estado.erro}
        </p>
      )}

      <footer className="bj-cal-painel-aviso">
        {daEquipe &&
          'Marco interno da equipe, configurado no portal — não é prazo da organização. '}
        {AVISO_FONTE}
      </footer>
    </aside>
  )
}
