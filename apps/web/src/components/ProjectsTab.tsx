import { useState } from 'react'
import { useSession } from '../session'
import { mensagem, useFetch } from '../lib/useFetch'
import { IconArrow, IconCheck } from '../icons/glyphs'

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

interface SeasonView {
  label: string
  seasonProjectId: string | null
  milestones: { title: string; date: string }[]
  next: { title: string; date: string; daysLeft: number } | null
}

export function ProjectsTab({ teamId, canManage }: { teamId: string; canManage: boolean }) {
  const api = useSession((s) => s.api)
  const setPage = useSession((s) => s.setPage)
  const setCurrentProject = useSession((s) => s.setCurrentProject)
  const projetos = useFetch<ProjectRow[]>('/api/v1/projects')
  const season = useFetch<SeasonView | null>(`/api/v1/teams/${teamId}/season`)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const daEquipe = (projetos.data ?? []).filter((p) => p.ownerTeamId === teamId)

  const designar = async (projectId: string | null) => {
    setErro(null)
    setSalvando(true)
    try {
      await api(`/api/v1/teams/${teamId}/season`, {
        method: 'PUT',
        body: JSON.stringify({
          label: season.data?.label ?? String(new Date().getFullYear() + 1),
          seasonProjectId: projectId,
          milestones: season.data?.milestones ?? [],
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
            Um projeto pessoal vira projeto da equipe pelo painel "Meus projetos" — a partir daí
            todo mundo acessa, e o que for designado como projeto da temporada passa a alimentar a
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
  const [editando, setEditando] = useState(false)
  const [label, setLabel] = useState(season?.label ?? '')
  const [marcos, setMarcos] = useState(season?.milestones ?? [])
  const [erro, setErro] = useState<string | null>(null)

  const salvar = async () => {
    setErro(null)
    try {
      await api(`/api/v1/teams/${teamId}/season`, {
        method: 'PUT',
        body: JSON.stringify({
          label: label.trim(),
          seasonProjectId: season?.seasonProjectId ?? null,
          milestones: marcos.filter((m) => m.title.trim() && m.date),
        }),
      })
      setEditando(false)
      onSalvo()
    } catch (e) {
      setErro(mensagem(e))
    }
  }

  if (!editando) {
    return (
      <section className="bj-card">
        <header>
          <h3>Temporada {season?.label ?? '— não configurada'}</h3>
        </header>
        {season?.next ? (
          <p>
            Próximo marco: <b>{season.next.title}</b> — faltam {season.next.daysLeft} dias.
          </p>
        ) : (
          <p>
            Sem marcos datados. Configurar a temporada é o critério GES-3.1 e é o que dá a contagem
            regressiva no Início.
          </p>
        )}
        {canManage && (
          <div className="bj-card-acoes">
            <button
              type="button"
              className="bj-btn"
              onClick={() => {
                setLabel(season?.label ?? String(new Date().getFullYear() + 1))
                setMarcos(season?.milestones ?? [])
                setEditando(true)
              }}
            >
              Configurar temporada
            </button>
          </div>
        )}
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
      <h4>Marcos (até 12)</h4>
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
          <button
            type="button"
            className="bj-link"
            onClick={() => setMarcos(marcos.filter((_, j) => j !== i))}
          >
            remover
          </button>
        </div>
      ))}
      {marcos.length < 12 && (
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
