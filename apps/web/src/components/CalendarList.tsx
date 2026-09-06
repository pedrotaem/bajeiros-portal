import type {
  CalendarCompetition,
  CalendarMilestone,
  CalendarPayload,
  TeamBond,
} from '@bajeiros/calendar/types'
import { MONTHS_LONG } from '@bajeiros/calendar/cycle'
import { dataCurta, diaMes, stateChip, stateOf } from '@bajeiros/calendar/dates'
import {
  ariaLabelDoMarco,
  chipDaCompeticao,
  nomeDaFonte,
  SOURCE_LABEL,
} from '@bajeiros/calendar/labels'
import { porMes, separaPassados, type QuickFilter } from '@bajeiros/calendar/recorte'
import { IconArrow } from '../icons/glyphs'
import { StatusChip } from '../icons/statusIcon'

/**
 * Vista Lista (FR-DF33.9–11): marcos por mês, uma linha por marco, passados sob "Já passou"
 * colapsado. É a vista do celular (FR-DF33.8) e a de quem quer saber o que vence. Nenhuma
 * linha manda para fora: o painel explica antes de abrir a fonte (FR-DF33.10).
 */
interface Props {
  payload: CalendarPayload
  competitions: CalendarCompetition[]
  milestones: CalendarMilestone[]
  quick: QuickFilter
  onQuick: (q: QuickFilter) => void
  selectedId: string | null
  onSelect: (id: string) => void
  onBond?: (competitionId: string, bond: TeamBond | null) => void
}

export function CalendarList({
  payload,
  competitions,
  milestones,
  quick,
  onQuick,
  selectedId,
  onSelect,
  onBond,
}: Props) {
  const { today, team } = payload
  const nome = new Map(payload.competitions.map((c) => [c.id, c.name]))
  const chip = new Map(payload.competitions.map((c) => [c.id, chipDaCompeticao(c)]))
  const { futuros, passados } = separaPassados(milestones, today)
  const filtros: [QuickFilter, string][] = team
    ? [
        ['tudo', 'Tudo'],
        ['prazos', 'Só prazos oficiais'],
        ['equipe', 'Só minha equipe'],
      ]
    : [
        ['tudo', 'Tudo'],
        ['prazos', 'Só prazos'],
      ]

  const Linha = ({ m }: { m: CalendarMilestone }) => {
    const estado = stateChip(m.dueOn, today)
    return (
      <li>
        <button
          type="button"
          className={`bj-cal-item bj-cal-item--${stateOf(m.dueOn, today)}`}
          aria-pressed={selectedId === m.id}
          aria-label={ariaLabelDoMarco(
            m,
            m.competitionId ? (nome.get(m.competitionId) ?? null) : null,
            team?.label,
          )}
          onClick={() => onSelect(m.id)}
        >
          <span className="bj-cal-data">{diaMes(m.dueOn)}</span>
          <span className="bj-cal-item-titulo">
            {m.title}
            {m.team?.kind === 'entrega' && <span className="bj-cal-item-sub"> · entrega</span>}
          </span>
          <span className="bj-cal-item-meta">
            {m.kind === 'equipe' ? (
              <span className="bj-chip bj-chip-equipe">EQUIPE</span>
            ) : (
              m.competitionId && (
                <span className="bj-chip bj-chip-neutro">
                  {chip.get(m.competitionId)?.toUpperCase()}
                </span>
              )
            )}
            <span className="bj-cal-item-fonte">
              {m.kind === 'equipe'
                ? `Temporada ${team?.label ?? ''}`
                : m.source
                  ? nomeDaFonte(m.source)
                  : 'sem fonte registrada'}
            </span>
            {estado && <span className="bj-chip bj-chip-warn">{estado}</span>}
            {m.status === 'previsto' && <span className="bj-chip bj-chip-neutro">PREVISTO</span>}
          </span>
        </button>
      </li>
    )
  }

  return (
    <div className="bj-cal-lista">
      <div className="bj-cal-lista-cab" role="group" aria-label="Filtro rápido">
        {filtros.map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={quick === id ? 'bj-chip-btn bj-chip-btn-on' : 'bj-chip-btn'}
            aria-pressed={quick === id}
            onClick={() => onQuick(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {futuros.length === 0 && passados.length === 0 && (
        <p className="bj-legenda">Nenhum marco com os filtros atuais.</p>
      )}

      {porMes(futuros).map((g) => {
        const [y, m] = g.key.split('-').map(Number)
        return (
          <section key={g.key} className="bj-cal-mes" aria-labelledby={`cal-mes-${g.key}`}>
            <h3 id={`cal-mes-${g.key}`} className="bj-cal-mes-titulo">
              {MONTHS_LONG[m - 1]} {y}
            </h3>
            <ul className="bj-cal-itens">
              {g.items.map((item) => (
                <Linha key={item.id} m={item} />
              ))}
            </ul>
          </section>
        )
      })}

      {passados.length > 0 && (
        <details className="bj-cal-passou">
          <summary>Já passou ({passados.length})</summary>
          {porMes(passados).map((g) => {
            const [y, m] = g.key.split('-').map(Number)
            return (
              <section key={g.key} className="bj-cal-mes">
                <h3 className="bj-cal-mes-titulo">
                  {MONTHS_LONG[m - 1]} {y}
                </h3>
                <ul className="bj-cal-itens">
                  {g.items.map((item) => (
                    <Linha key={item.id} m={item} />
                  ))}
                </ul>
              </section>
            )
          })}
        </details>
      )}

      {/* FR-DF33.25 — links úteis por competição; FR-DF33.18 — frescor por competição */}
      <section className="bj-cal-links" aria-labelledby="cal-links">
        <h3 id="cal-links" className="bj-secao">
          Links oficiais
        </h3>
        <ul className="bj-cards">
          {competitions.map((c) => (
            <li key={c.id} className="bj-card">
              <header>
                <h4>{c.name}</h4>
                {c.bond === 'inscrita' && <span className="bj-chip bj-chip-brand">INSCRITA</span>}
                {c.bond === 'interesse' && (
                  <span className="bj-chip bj-chip-interesse">INTERESSE</span>
                )}
                {c.stale && <StatusChip role="warn" />}
              </header>
              <p className="bj-card-estado">
                {c.startsOn
                  ? `${dataCurta(c.startsOn)}${c.endsOn && c.endsOn !== c.startsOn ? ` a ${dataCurta(c.endsOn)}` : ''}`
                  : 'datas a confirmar'}
                {c.location ? ` · ${c.location}` : ''}
              </p>
              <p className="bj-legenda">
                {c.checkedAt
                  ? `Fonte conferida em ${dataCurta(c.checkedAt.slice(0, 10))}`
                  : 'Fonte não conferida'}
                {c.stale ? ' — pode estar desatualizado — confira a fonte' : ''}
              </p>
              <ul className="bj-lista">
                {c.officialUrl && (
                  <li>
                    <a href={c.officialUrl} target="_blank" rel="noreferrer">
                      Página oficial <IconArrow size={16} />
                    </a>
                  </li>
                )}
                {c.links.map((l) => (
                  <li key={l.id}>
                    <a href={l.url} target="_blank" rel="noreferrer">
                      {l.title} <IconArrow size={16} />
                    </a>{' '}
                    <span className="bj-legenda">{SOURCE_LABEL[l.kind]}</span>
                  </li>
                ))}
              </ul>
              {onBond && (
                <div className="bj-card-acoes">
                  <button
                    type="button"
                    className="bj-btn bj-btn-sm"
                    aria-pressed={c.bond === 'inscrita'}
                    onClick={() => onBond(c.id, c.bond === 'inscrita' ? null : 'inscrita')}
                  >
                    Estamos inscritos
                  </button>
                  <button
                    type="button"
                    className="bj-btn bj-btn-sm"
                    aria-pressed={c.bond === 'interesse'}
                    onClick={() => onBond(c.id, c.bond === 'interesse' ? null : 'interesse')}
                  >
                    Acompanhar
                  </button>
                </div>
              )}
            </li>
          ))}
          {payload.links.length > 0 && (
            <li className="bj-card">
              <header>
                <h4>Todas as competições</h4>
              </header>
              <ul className="bj-lista">
                {payload.links.map((l) => (
                  <li key={l.id}>
                    <a href={l.url} target="_blank" rel="noreferrer">
                      {l.title} <IconArrow size={16} />
                    </a>{' '}
                    <span className="bj-legenda">{SOURCE_LABEL[l.kind]}</span>
                  </li>
                ))}
              </ul>
            </li>
          )}
        </ul>
      </section>
    </div>
  )
}
