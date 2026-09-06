import { useState } from 'react'
import type { CalendarPayload, RegistrationKind, TeamBond } from '@bajeiros/calendar/types'
import { cycleOf } from '@bajeiros/calendar/cycle'
import { dataCurta, todayIso } from '@bajeiros/calendar/dates'
import { REGISTRATION_LABEL } from '@bajeiros/calendar/labels'
import { REGISTRATION_KINDS } from '@bajeiros/calendar/types'
import { useSession } from '../session'
import { mensagem, useFetch } from '../lib/useFetch'
import { IconArrow, IconCheck } from '../icons/glyphs'

/** Teto de marcos da temporada — o mesmo da API (DF-33 §10.8: era 12). */
const MAX_MARCOS = 24

/**
 * Aba Equipe · Projetos (DF-12 §3.3). Existe porque o "projeto da temporada" é a
 * peça que liga o validador à evolução: sem ele designado, TODO critério automático
 * fica insatisfeito e a equipe não entende por quê (DF-13 P-4.1).
 */
interface ProjectRow {
  id: string
  name: string
  ownerTeamId: string | null
  lastSeq?: number
}

interface Marco {
  title: string
  date: string
  kind?: 'marco' | 'entrega'
  sourceMilestoneId?: string
}

interface SeasonView {
  label: string
  seasonProjectId: string | null
  milestones: Marco[]
  competitionIds: string[]
  interestCompetitionIds: string[]
  registrationKind: RegistrationKind | null
  next: { title: string; date: string; daysLeft: number } | null
  nextCompetition: { id: string; name: string; startsOn: string; daysLeft: number } | null
}

export function ProjectsTab({ teamId, canManage }: { teamId: string; canManage: boolean }) {
  const api = useSession((s) => s.api)
  const setPage = useSession((s) => s.setPage)
  const setCurrentProject = useSession((s) => s.setCurrentProject)
  const goToProject = useSession((s) => s.goToProject)
  const projetos = useFetch<ProjectRow[]>('/api/v1/projects')
  const season = useFetch<SeasonView | null>(`/api/v1/teams/${teamId}/season`)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const daEquipe = (projetos.data ?? []).filter((p) => p.ownerTeamId === teamId)

  const designar = async (projectId: string | null) => {
    setErro(null)
    setSalvando(true)
    try {
      // só o projeto: o resto da temporada (marcos, competições) é preservado pela API
      await api(`/api/v1/teams/${teamId}/season`, {
        method: 'PUT',
        body: JSON.stringify({
          label: season.data?.label ?? String(cycleOf(todayIso())),
          seasonProjectId: projectId,
        }),
      })
      season.recarregar()
    } catch (e) {
      setErro(mensagem(e))
    } finally {
      setSalvando(false)
    }
  }

  const abrir = (p: ProjectRow) => {
    setCurrentProject({ id: p.id, name: p.name, seq: p.lastSeq ?? 0 })
    setPage('editor')
  }

  return (
    <div className="bj-projetos">
      {erro && (
        <p className="bj-erro" role="alert">
          {erro}
        </p>
      )}

      <Temporada
        teamId={teamId}
        season={season.data}
        canManage={canManage}
        onSalvo={season.recarregar}
      />

      <h3>Projetos da equipe</h3>
      {projetos.estado === 'loading' && <span className="bj-skeleton" style={{ height: 80 }} />}
      {projetos.estado === 'ok' && daEquipe.length === 0 && (
        <div className="bj-vazio">
          <h4>Nenhum projeto na equipe ainda</h4>
          <p>
            Um projeto pessoal vira projeto da equipe pelo painel "Meus projetos". A partir daí todo
            mundo acessa, e o que for designado como projeto da temporada passa a alimentar a
            evolução.
          </p>
        </div>
      )}
      <ul className="bj-cards">
        {daEquipe.map((p) => {
          const atual = season.data?.seasonProjectId === p.id
          return (
            <li key={p.id} className="bj-card">
              <header>
                <h4>{p.name}</h4>
                {atual && <span className="bj-chip bj-chip-pass">PROJETO DA TEMPORADA</span>}
              </header>
              <p className="bj-card-estado">
                {p.lastSeq ? `última versão salva: v${p.lastSeq}` : 'ainda sem versão salva'}
              </p>
              <div className="bj-card-acoes">
                {/* a ficha vem ANTES do validador de propósito (DF-21 §3.2): é a porta
                    que não exige gaiola modelada */}
                <button
                  type="button"
                  className="bj-btn"
                  onClick={() =>
                    goToProject({ id: p.id, name: p.name, seq: p.lastSeq ?? 0 }, 'ficha')
                  }
                >
                  Abrir a ficha <IconArrow size={16} />
                </button>
                <button type="button" className="bj-btn" onClick={() => abrir(p)}>
                  Abrir no validador <IconArrow size={16} />
                </button>
                {canManage && !atual && (
                  <button
                    type="button"
                    className="bj-btn bj-btn-primary"
                    disabled={salvando}
                    onClick={() => designar(p.id)}
                  >
                    <IconCheck size={16} /> Designar para a temporada
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function Temporada({
  teamId,
  season,
  canManage,
  onSalvo,
}: {
  teamId: string
  season: SeasonView | null
  canManage: boolean
  onSalvo: () => void
}) {
  const api = useSession((s) => s.api)
  const goToCalendar = useSession((s) => s.goToCalendar)
  const [editando, setEditando] = useState(false)
  const [label, setLabel] = useState(season?.label ?? '')
  const [marcos, setMarcos] = useState<Marco[]>(season?.milestones ?? [])
  const [inscritas, setInscritas] = useState<string[]>(season?.competitionIds ?? [])
  const [interesse, setInteresse] = useState<string[]>(season?.interestCompetitionIds ?? [])
  const [categoria, setCategoria] = useState<RegistrationKind | ''>(season?.registrationKind ?? '')
  const [erro, setErro] = useState<string | null>(null)
  // DF-33 FR-DF33.12 — as competições do ciclo vêm do calendário público (mesmo dado da aba)
  const ciclo = cycleOf(todayIso())
  const calendario = useFetch<CalendarPayload>(`/api/v1/public/calendar?season=${ciclo}`)
  const competicoes = calendario.data?.competitions ?? []
  const nomeDe = (id: string) => competicoes.find((c) => c.id === id)?.name ?? 'competição'

  const salvar = async () => {
    setErro(null)
    try {
      await api(`/api/v1/teams/${teamId}/season`, {
        method: 'PUT',
        body: JSON.stringify({
          label: label.trim(),
          seasonProjectId: season?.seasonProjectId ?? null,
          milestones: marcos.filter((m) => m.title.trim() && m.date),
          competitionIds: inscritas,
          interestCompetitionIds: interesse,
          registrationKind: categoria || null,
        }),
      })
      setEditando(false)
      onSalvo()
    } catch (e) {
      setErro(mensagem(e))
    }
  }

  const vinculoDe = (id: string): TeamBond | null =>
    inscritas.includes(id) ? 'inscrita' : interesse.includes(id) ? 'interesse' : null
  const setVinculo = (id: string, bond: TeamBond | null) => {
    setInscritas((v) =>
      bond === 'inscrita' ? [...new Set([...v, id])] : v.filter((x) => x !== id),
    )
    setInteresse((v) =>
      bond === 'interesse' ? [...new Set([...v, id])] : v.filter((x) => x !== id),
    )
  }

  if (!editando) {
    return (
      <section className="bj-card">
        <header>
          <h3>Temporada {season?.label ?? 'não configurada'}</h3>
          {season?.registrationKind && (
            <span className="bj-chip bj-chip-neutro">
              {REGISTRATION_LABEL[season.registrationKind].toUpperCase()}
            </span>
          )}
        </header>
        {season?.next ? (
          <p>
            Próximo marco: <b>{season.next.title}</b>, faltam {season.next.daysLeft} dias.
          </p>
        ) : (
          <p>
            Sem marcos datados. Configurar a temporada é o critério GES-3.1 e é o que dá a contagem
            regressiva no Início.
          </p>
        )}
        {season &&
        (season.competitionIds.length > 0 || season.interestCompetitionIds.length > 0) ? (
          <p className="bj-card-estado">
            {season.competitionIds.length > 0 &&
              `Inscrita: ${season.competitionIds.map(nomeDe).join(', ')}`}
            {season.competitionIds.length > 0 && season.interestCompetitionIds.length > 0 && ' · '}
            {season.interestCompetitionIds.length > 0 &&
              `Acompanha: ${season.interestCompetitionIds.map(nomeDe).join(', ')}`}
            {season.nextCompetition &&
              ` · próxima: ${season.nextCompetition.name} em ${dataCurta(season.nextCompetition.startsOn)}`}
          </p>
        ) : (
          <p className="bj-card-estado">
            Nenhuma competição marcada — o calendário mostra tudo, sem recorte.
          </p>
        )}
        <div className="bj-card-acoes">
          {canManage && (
            <button
              type="button"
              className="bj-btn"
              onClick={() => {
                setLabel(season?.label ?? String(ciclo))
                setMarcos(season?.milestones ?? [])
                setInscritas(season?.competitionIds ?? [])
                setInteresse(season?.interestCompetitionIds ?? [])
                setCategoria(season?.registrationKind ?? '')
                setEditando(true)
              }}
            >
              Configurar temporada
            </button>
          )}
          <button type="button" className="bj-btn" onClick={() => goToCalendar()}>
            Ver o calendário <IconArrow size={16} />
          </button>
        </div>
      </section>
    )
  }

  return (
    <form
      className="bj-card bj-form"
      onSubmit={(e) => {
        e.preventDefault()
        void salvar()
      }}
    >
      <label>
        Rótulo da temporada
        <input
          className="bj-eq-seletor"
          maxLength={20}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          required
        />
      </label>
      {/* DF-33 FR-DF33.12 — inscrita · interesse · categoria, por competição do ciclo */}
      <h4>Competições da temporada {ciclo}</h4>
      {calendario.estado === 'loading' && <span className="bj-skeleton" style={{ height: 40 }} />}
      {calendario.estado === 'ok' && competicoes.length === 0 && (
        <p className="bj-legenda">A organização ainda não publicou a agenda deste ciclo.</p>
      )}
      {competicoes.map((c) => {
        const v = vinculoDe(c.id)
        return (
          <div className="bj-marco" key={c.id} role="group" aria-label={c.name}>
            <span className="bj-marco-nome">{c.name}</span>
            <button
              type="button"
              className="bj-btn bj-btn-sm"
              aria-pressed={v === 'inscrita'}
              onClick={() => setVinculo(c.id, v === 'inscrita' ? null : 'inscrita')}
            >
              Estamos inscritos
            </button>
            <button
              type="button"
              className="bj-btn bj-btn-sm"
              aria-pressed={v === 'interesse'}
              onClick={() => setVinculo(c.id, v === 'interesse' ? null : 'interesse')}
            >
              Acompanhar
            </button>
          </div>
        )
      })}
      <label>
        Categoria de inscrição
        <select
          className="bj-eq-seletor"
          value={categoria}
          onChange={(e) => setCategoria(e.target.value as RegistrationKind | '')}
        >
          <option value="">não informada (mostra todos os lotes)</option>
          {REGISTRATION_KINDS.map((k) => (
            <option key={k} value={k}>
              {REGISTRATION_LABEL[k]}
            </option>
          ))}
        </select>
      </label>

      <h4>Marcos (até {MAX_MARCOS})</h4>
      {marcos.map((m, i) => (
        <div className="bj-marco" key={i}>
          <input
            className="bj-eq-seletor"
            placeholder="O que acontece"
            maxLength={120}
            value={m.title}
            onChange={(e) =>
              setMarcos(marcos.map((x, j) => (i === j ? { ...x, title: e.target.value } : x)))
            }
          />
          <input
            className="bj-eq-seletor"
            type="date"
            value={m.date}
            onChange={(e) =>
              setMarcos(marcos.map((x, j) => (i === j ? { ...x, date: e.target.value } : x)))
            }
          />
          <select
            className="bj-eq-seletor"
            aria-label="Tipo do marco"
            value={m.kind ?? 'marco'}
            onChange={(e) =>
              setMarcos(
                marcos.map((x, j) =>
                  i === j ? { ...x, kind: e.target.value as 'marco' | 'entrega' } : x,
                ),
              )
            }
          >
            <option value="marco">marco</option>
            <option value="entrega">entrega</option>
          </select>
          {m.sourceMilestoneId && (
            <span
              className="bj-chip bj-chip-neutro"
              title="Copiado de um marco oficial do calendário"
            >
              DO CALENDÁRIO
            </span>
          )}
          <button
            type="button"
            className="bj-link"
            onClick={() => setMarcos(marcos.filter((_, j) => j !== i))}
          >
            remover
          </button>
        </div>
      ))}
      {marcos.length < MAX_MARCOS && (
        <button
          type="button"
          className="bj-btn bj-btn-sm"
          onClick={() => setMarcos([...marcos, { title: '', date: '' }])}
        >
          Adicionar marco
        </button>
      )}
      {erro && <p className="bj-erro">{erro}</p>}
      <div className="bj-card-acoes">
        <button type="submit" className="bj-btn bj-btn-primary">
          Salvar temporada
        </button>
        <button type="button" className="bj-btn" onClick={() => setEditando(false)}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
