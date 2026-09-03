import { useEffect, useState } from 'react'
import { AREA_LABELS } from '@bajeiros/evolution/areas'
import type { AreaId } from '@bajeiros/evolution/types'
import { useSession } from '../session'
import { IconArrow } from '../icons/glyphs'
import { MarkAssistant, MarkCage } from '../icons/marks'
import { StatusChip } from '../icons/statusIcon'

/**
 * Hub de Ferramentas (DF-12 E3). Ferramenta é MEIO, não fim: cada card declara o que
 * a ferramenta alimenta na evolução da equipe e mostra estado real — nunca um número
 * inventado.
 *
 * "Continuar" e "Abrir" trocam a página, sem tocar em nada do comportamento interno
 * do editor ou do assistente (RF-3.2).
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
}

/**
 * O que `GET /assistant/status` devolve. Os nomes importam: até o DF-28 este cartão
 * lia `remaining`/`limit`, que a API nunca mandou — e por isso a quota NUNCA apareceu
 * aqui, sempre caindo no texto de indisponível.
 */
interface AssistantStatus {
  dailyLimit: number
  usedToday: number
}

/** Mapa estático: o que cada ferramenta alimenta (§RF-3.1). Curadoria em código. */
const ALIMENTA: Record<string, AreaId[]> = {
  validador: ['estrutura', 'dinamica', 'fabricacao'],
  assistente: ['documentacao'],
}

/** "No radar" — futuras, com chip tracejado e sem CTA ativo (RF-3.3). */
const NO_RADAR = [
  { nome: 'Ficha da gaiola (Anexo B)', frase: 'Gera a ficha a partir do projeto já validado.' },
  { nome: 'Importação de CAD', frase: 'Traz a geometria de fora em vez de remodelar.' },
  { nome: 'Planejador de testes', frase: 'Protocolo de shakedown com registro do resultado.' },
  { nome: 'Biblioteca técnica', frase: 'Acervo de memórias de cálculo por subsistema.' },
]

export function ToolsHub({ teamId }: { teamId: string | null }) {
  const api = useSession((s) => s.api)
  const user = useSession((s) => s.user)
  const setPage = useSession((s) => s.setPage)
  const setCurrentProject = useSession((s) => s.setCurrentProject)
  const [estado, setEstado] = useState<'loading' | 'ok' | 'error'>('loading')
  const [projects, setProjects] = useState<ProjectRow[]>([])
  const [season, setSeason] = useState<SeasonView | null>(null)
  const [assistente, setAssistente] = useState<AssistantStatus | null>(null)

  useEffect(() => {
    let vivo = true
    setEstado('loading')
    const carregar = async () => {
      const [ps, s, a] = await Promise.all([
        api<ProjectRow[]>('/api/v1/projects').catch(() => [] as ProjectRow[]),
        teamId
          ? api<SeasonView | null>(`/api/v1/teams/${teamId}/season`).catch(() => null)
          : Promise.resolve(null),
        // DF-28: sem conta o assistente é demonstração — não se pede quota que a
        // rota vai recusar
        user
          ? api<AssistantStatus>('/api/v1/assistant/status').catch(() => null)
          : Promise.resolve(null),
      ])
      if (!vivo) return
      setProjects(ps)
      setSeason(s)
      setAssistente(a)
      setEstado('ok')
    }
    carregar().catch(() => vivo && setEstado('error'))
    return () => {
      vivo = false
    }
  }, [api, teamId, user])

  const daTemporada = projects.find((p) => p.id === season?.seasonProjectId) ?? null

  const abrirEditor = (p: ProjectRow | null) => {
    if (p) setCurrentProject({ id: p.id, name: p.name, seq: p.lastSeq ?? 0 })
    setPage('editor')
  }

  return (
    <div className="bj-page bj-hub">
      <p className="bj-lead">
        Ferramentas são meios. O que fica é a evolução da equipe — por isso cada uma diz o que
        alimenta.
      </p>

      {estado === 'error' && (
        <p className="bj-erro" role="alert">
          Não deu para ler o estado das ferramentas.{' '}
          <button type="button" className="bj-link" onClick={() => setEstado('loading')}>
            Tentar de novo
          </button>
        </p>
      )}

      <div className="bj-cards">
        <article className="bj-card">
          <header>
            <MarkCage size={20} />
            <h2>Validador de gaiola</h2>
          </header>
          <p>Modela a gaiola e confere as regras B6 enquanto você desenha.</p>
          <p className="bj-alimenta">
            Alimenta · {ALIMENTA.validador.map((a) => AREA_LABELS[a]).join(' · ')}
          </p>
          <div className="bj-card-estado">
            {estado === 'loading' ? (
              <span className="bj-skeleton" aria-hidden="true" />
            ) : daTemporada ? (
              <>
                <strong>{daTemporada.name}</strong>
                <span>
                  projeto da temporada {season?.label ? `· ${season.label}` : ''} · versão{' '}
                  {daTemporada.lastSeq ?? 0}
                </span>
              </>
            ) : (
              <span>
                Nenhum projeto designado como o da temporada — sem ele o validador não alimenta a
                evolução.
              </span>
            )}
          </div>
          <div className="bj-card-acoes">
            <button
              type="button"
              className="bj-btn bj-btn-primary"
              onClick={() => abrirEditor(daTemporada)}
            >
              {daTemporada ? `Continuar a v${daTemporada.lastSeq ?? 0}` : 'Abrir o validador'}
              <IconArrow size={16} />
            </button>
          </div>
        </article>

        <article className="bj-card">
          <header>
            <MarkAssistant size={20} />
            <h2>Assistente do regulamento</h2>
          </header>
          <p>Pergunta em português e recebe a resposta com a citação da seção.</p>
          <p className="bj-alimenta">
            Alimenta · {ALIMENTA.assistente.map((a) => AREA_LABELS[a]).join(' · ')}
          </p>
          <div className="bj-card-estado">
            {!user ? (
              <span>Precisa de conta — veja a demonstração antes de decidir.</span>
            ) : estado === 'loading' ? (
              <span className="bj-skeleton" aria-hidden="true" />
            ) : assistente ? (
              <span>
                {Math.max(0, assistente.dailyLimit - assistente.usedToday)} de{' '}
                {assistente.dailyLimit} perguntas hoje
              </span>
            ) : (
              <span>Quota do dia indisponível agora.</span>
            )}
          </div>
          <div className="bj-card-acoes">
            <button type="button" className="bj-btn" onClick={() => setPage('assistant')}>
              {user ? 'Abrir o assistente' : 'Ver a demonstração'}
              <IconArrow size={16} />
            </button>
          </div>
        </article>
      </div>

      <h2 className="bj-secao">No radar</h2>
      <div className="bj-cards">
        {NO_RADAR.map((f) => (
          <article className="bj-card bj-card-futuro" key={f.nome}>
            <header>
              <h3>{f.nome}</h3>
              <span className="bj-chip bj-chip-futuro">FUTURO</span>
            </header>
            <p>{f.frase}</p>
          </article>
        ))}
      </div>

      <footer className="bj-hub-foot">
        <StatusChip role="info" />
        <p>
          A fila de ferramentas segue a evolução das equipes: entra primeiro o que destrava um nível
          para mais gente. Ainda não há canal aberto para sugestões — ele chega com o fórum.
        </p>
      </footer>
    </div>
  )
}
