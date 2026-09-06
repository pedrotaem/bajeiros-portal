import { useMemo, useState } from 'react'
import type { CalendarPayload, TeamBond } from '@bajeiros/calendar/types'
import { cycleOf, seasonLabel } from '@bajeiros/calendar/cycle'
import { countdown, dataCurta, todayIso } from '@bajeiros/calendar/dates'
import { AVISO_FONTE, chipDaCompeticao } from '@bajeiros/calendar/labels'
import {
  competicoesVisiveis,
  defaultMine,
  marcosVisiveis,
  proximos,
  type RecorteOptions,
} from '@bajeiros/calendar/recorte'
import { useSession } from '../session'
import { mensagem, useFetch } from '../lib/useFetch'
import { baixarArquivo, useMinWidth } from '../lib/calendario'
import { IconArrow, IconDownload, IconInfoCircle } from '../icons/glyphs'
import { CalendarTimeline } from './CalendarTimeline'
import { CalendarList } from './CalendarList'
import { MilestonePanel } from './MilestonePanel'

/**
 * Comunidade › Calendário (DF-33) — a temporada inteira num olhar (linha do tempo) e o que
 * vence, em ordem (lista). Abre SEM conta (FR-DF33.2): o que exige sessão é o recorte
 * pessoal, o .ics com filtro da equipe e "transformar em passo".
 *
 * O dado vem de uma rota só: pública (cacheada 1 h) para o visitante, `/community` com
 * `teamId` para quem é da equipe — mesma forma, mais os marcos `equipe` e os vínculos.
 */

/** Página oficial da agenda dos programas estudantis — a fonte é citada por URL (DF-15). */
const AGENDA_OFICIAL = 'https://saebrasil.org.br/programas-estudantis/'

export function CalendarTab({ teamId }: { teamId: string | null }) {
  const user = useSession((s) => s.user)
  const api = useSession((s) => s.api)
  const cal = useSession((s) => s.calendar)
  const setCal = useSession((s) => s.setCalendar)
  const goToTeam = useSession((s) => s.goToTeam)
  const setPanel = useSession((s) => s.setPanel)

  const today = todayIso()
  const season = cal.season ?? cycleOf(today)
  const url = user
    ? `/api/v1/community/calendar?season=${season}${teamId ? `&teamId=${teamId}` : ''}`
    : `/api/v1/public/calendar?season=${season}`
  const dados = useFetch<CalendarPayload>(url, [season, teamId, !!user])
  const largo = useMinWidth(1024)
  const [erroAcao, setErroAcao] = useState<string | null>(null)

  const p = dados.data
  const team = p?.team ?? null
  const mine = cal.mine ?? defaultMine(team)
  const opts: RecorteOptions = useMemo(
    () => ({ mine: !!team && mine, quick: cal.quick, chips: new Set(cal.chips) }),
    [team, mine, cal.quick, cal.chips],
  )
  const marcos = useMemo(() => (p ? marcosVisiveis(p, opts) : []), [p, opts])
  const comps = useMemo(() => (p ? competicoesVisiveis(p, opts) : []), [p, opts])
  // FR-DF33.8 — abaixo de 1024px a linha do tempo não é desenhada
  const view = largo ? cal.view : 'lista'
  const selecionado = p?.milestones.find((m) => m.id === cal.selected) ?? null

  const chips = useMemo(() => {
    const vistos = new Set<string>()
    for (const c of p?.competitions ?? []) vistos.add(chipDaCompeticao(c))
    return [...vistos].sort((a, b) =>
      a === 'Nacional' ? -1 : b === 'Nacional' ? 1 : a.localeCompare(b),
    )
  }, [p])
  const temporadas = useMemo(() => {
    const s = new Set(p?.seasons ?? [])
    s.add(cycleOf(today))
    s.add(season)
    return [...s].sort((a, b) => b - a)
  }, [p, season, today])

  /** FR-DF33.12 — o cabeçalho da raia faz a MESMA gravação da aba Projetos (PUT /season). */
  const salvarVinculo = async (competitionId: string, bond: TeamBond | null) => {
    if (!team || !teamId) return
    setErroAcao(null)
    const inscritas = new Set(team.competitionIds)
    const interesse = new Set(team.interestCompetitionIds)
    inscritas.delete(competitionId)
    interesse.delete(competitionId)
    if (bond === 'inscrita') inscritas.add(competitionId)
    if (bond === 'interesse') interesse.add(competitionId)
    try {
      await api(`/api/v1/teams/${teamId}/season`, {
        method: 'PUT',
        body: JSON.stringify({
          label: team.label,
          competitionIds: [...inscritas],
          interestCompetitionIds: [...interesse],
        }),
      })
      dados.recarregar()
    } catch (e) {
      setErroAcao(mensagem(e))
    }
  }

  const baixarTudo = async () => {
    setErroAcao(null)
    const icsUrl = user
      ? `/api/v1/community/calendar.ics?season=${season}${team ? `&teamId=${team.teamId}` : ''}`
      : `/api/v1/public/calendar.ics?season=${season}`
    try {
      await baixarArquivo(icsUrl, `calendario-baja-${season}${team ? '-equipe' : ''}.ics`)
    } catch (e) {
      setErroAcao(mensagem(e))
    }
  }

  return (
    <div className="bj-cal">
      <div className="bj-cal-cabecalho">
        <label className="bj-cal-campo">
          <span className="bj-sr-only">Temporada</span>
          <select
            className="bj-eq-seletor"
            value={season}
            onChange={(e) => setCal({ season: Number(e.target.value), selected: null })}
          >
            {temporadas.map((s) => (
              <option key={s} value={s}>
                {seasonLabel(s)}
              </option>
            ))}
          </select>
        </label>

        <div className="bj-cal-chips" role="group" aria-label="Competições">
          {chips.map((chip) => {
            const on = cal.chips.includes(chip)
            return (
              <button
                key={chip}
                type="button"
                className={on ? 'bj-chip-btn bj-chip-btn-on' : 'bj-chip-btn'}
                aria-pressed={on}
                onClick={() =>
                  setCal({
                    chips: on ? cal.chips.filter((c) => c !== chip) : [...cal.chips, chip],
                  })
                }
              >
                {chip}
              </button>
            )
          })}
        </div>

        {largo && (
          <div className="bj-cal-vistas" role="group" aria-label="Vista">
            {(
              [
                ['linha', 'Linha do tempo'],
                ['lista', 'Lista'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={cal.view === id ? 'bj-chip-btn bj-chip-btn-on' : 'bj-chip-btn'}
                aria-pressed={cal.view === id}
                onClick={() => setCal({ view: id })}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        <div className="bj-cal-pessoal">
          {team ? (
            <>
              <button
                type="button"
                className={mine ? 'bj-chip-btn bj-chip-btn-on' : 'bj-chip-btn'}
                aria-pressed={mine}
                onClick={() => setCal({ mine: !mine })}
              >
                Só o que afeta minha equipe
              </button>
              {/* FR-DF33.13 — nunca uma lista vazia em silêncio */}
              {!defaultMine(team) && (
                <span className="bj-cal-dica">
                  Sua equipe ainda não marcou competição.{' '}
                  <button type="button" className="bj-link" onClick={() => goToTeam('projetos')}>
                    Configurar temporada
                  </button>
                </span>
              )}
            </>
          ) : user ? (
            <span className="bj-cal-dica">Entre numa equipe para ver só o que afeta você.</span>
          ) : (
            <span className="bj-cal-dica">
              <button type="button" className="bj-link" onClick={() => setPanel('login')}>
                Entrar ou criar conta
              </button>{' '}
              para ver só o que afeta sua equipe e exportar com filtro.
            </span>
          )}
          <button type="button" className="bj-btn bj-btn-sm" onClick={baixarTudo}>
            <IconDownload size={16} /> Baixar .ics
          </button>
        </div>
      </div>

      {/* FR-DF33.17 — faixa fixa, visível sem rolar, não fecha (C-09 `fonte`) */}
      <div className="bj-fonte-aviso" role="note">
        <IconInfoCircle size={16} />
        <p>{AVISO_FONTE}</p>
      </div>

      {erroAcao && (
        <p className="bj-erro" role="alert">
          {erroAcao}
        </p>
      )}

      {dados.estado === 'loading' && (
        <div aria-busy="true" className="bj-cal-corpo">
          <span className="bj-skeleton" style={{ height: 56 }} />
          <span className="bj-skeleton" style={{ height: 220 }} />
        </div>
      )}
      {dados.estado === 'error' && (
        <p className="bj-erro" role="alert">
          {dados.erro}{' '}
          <button type="button" className="bj-link" onClick={dados.recarregar}>
            Tentar de novo
          </button>
        </p>
      )}

      {p && p.competitions.length === 0 && (
        // FR-DF33.19 — estado vazio com saída (C-16)
        <div className="bj-vazio">
          <h3>A temporada {season} ainda não foi publicada pela organização</h3>
          <p>Quando a agenda sair, a curadoria do portal traz as datas com a fonte de cada uma.</p>
          <a className="bj-btn" href={AGENDA_OFICIAL} target="_blank" rel="noreferrer">
            Página oficial da agenda <IconArrow size={16} />
          </a>
        </div>
      )}

      {p && p.competitions.length > 0 && (
        <div className={selecionado ? 'bj-cal-corpo bj-cal-corpo--painel' : 'bj-cal-corpo'}>
          <div className="bj-cal-principal">
            {view === 'linha' ? (
              <>
                <CalendarTimeline
                  payload={p}
                  competitions={comps}
                  milestones={marcos}
                  selectedId={cal.selected}
                  onSelect={(id) => setCal({ selected: id })}
                  onBond={team?.canManage ? salvarVinculo : undefined}
                />
                <Proximos
                  marcos={proximos(marcos, today)}
                  today={today}
                  onSelect={(id) => setCal({ selected: id })}
                />
              </>
            ) : (
              <CalendarList
                payload={p}
                competitions={comps}
                milestones={marcos}
                quick={cal.quick}
                onQuick={(quick) => setCal({ quick })}
                selectedId={cal.selected}
                onSelect={(id) => setCal({ selected: id })}
                onBond={team?.canManage ? salvarVinculo : undefined}
              />
            )}
          </div>
          {selecionado && (
            <MilestonePanel
              key={selecionado.id}
              marco={selecionado}
              payload={p}
              teamId={teamId}
              onClose={() => setCal({ selected: null })}
              onSelect={(id) => setCal({ selected: id })}
              onChanged={dados.recarregar}
            />
          )}
        </div>
      )}
    </div>
  )
}

/** FR-DF33.7 — "Próximos 30 dias": a leitura de quem só quer saber o que vence. */
function Proximos({
  marcos,
  today,
  onSelect,
}: {
  marcos: CalendarPayload['milestones']
  today: string
  onSelect: (id: string) => void
}) {
  return (
    <section className="bj-cal-proximos" aria-labelledby="cal-proximos">
      <h3 id="cal-proximos" className="bj-secao">
        Próximos 30 dias
      </h3>
      {marcos.length === 0 ? (
        <p className="bj-legenda">Nada vence nos próximos 30 dias.</p>
      ) : (
        <ul className="bj-passos">
          {marcos.map((m) => (
            <li key={m.id}>
              <button type="button" className="bj-passo" onClick={() => onSelect(m.id)}>
                <span className="bj-passo-titulo">
                  <span className="bj-cal-data">{dataCurta(m.dueOn)}</span> {m.title}
                </span>
                <span className="bj-chip bj-chip-neutro">
                  {countdown(m.dueOn, today).text.toUpperCase()}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
