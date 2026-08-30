import { useState } from 'react'
import { formatAverage, levelLabel, MAX_LEVEL } from '@bajeiros/evolution/areas'
import type { AreaId, AreaLevel, CriterionType, LinkKind } from '@bajeiros/evolution/types'
import { useSession } from '../session'
import { mensagem, useFetch } from '../lib/useFetch'
import { IconArrow, IconCheck, IconPlus } from '../icons/glyphs'
import { StatusIcon } from '../icons/statusIcon'

/**
 * Tela Equipe · Evolução (DF-13 E6). É o coração do produto: onde a equipe vê onde
 * está fraca, por quê, e o que fazer agora.
 *
 * Regras que a tela aplica e que valem mais que o layout:
 *  - nível SEMPRE em texto ("nível 3 de 5") além da barra — nunca só cor (CT-3);
 *  - queda de nível é honesta e explicada, não escondida;
 *  - a fila mostra 7; "ver todos" abre o resto. Fila infinita vira cobrança (P-3.2).
 */
interface CriterionView {
  id: string
  level: number
  type: CriterionType
  label: string
  source: string
  satisfied: boolean
  reason: string
  linkHint: LinkKind | null
  destination: { page: string; tab?: string }
}

interface AreaView {
  area: AreaId
  label: string
  level: AreaLevel
  levelName: string
  criteria: CriterionView[]
  pending: string[]
}

interface EvolutionView {
  catalogVersion: string
  average: number
  areas: AreaView[]
  season: {
    label: string
    seasonProjectId: string | null
    milestones: { title: string; date: string }[]
    next: { title: string; date: string; daysLeft: number } | null
  } | null
  bootstrap: boolean
}

interface StepView {
  id: string
  title: string
  area: AreaId | null
  origin: 'criterion' | 'manual' | 'meta'
  criterionId: string | null
  ownerUserId: string | null
  status: string
  destination: { page: string; tab?: string } | null
}

interface BenchmarkView {
  visible: boolean
  floor: number
  teams: number
  areas: Record<string, number>
  average: number | null
}

const VISIVEIS_NA_FILA = 7

/** Etapas da faixa de temporada (RF-5.2). "Agora" sai da data, não de um cadastro. */
const ETAPAS = ['Regulamento', 'Projeto', 'Relatórios', 'Fabricação e testes', 'Competição']

export function EvolutionTab({ teamId, canManage }: { teamId: string; canManage: boolean }) {
  const api = useSession((s) => s.api)
  const setPage = useSession((s) => s.setPage)
  const setTeamTab = useSession((s) => s.setTeamTab)
  const evo = useFetch<EvolutionView>(`/api/v1/teams/${teamId}/evolution`)
  const fila = useFetch<StepView[]>(`/api/v1/teams/${teamId}/evolution/steps?status=open`)
  const bench = useFetch<BenchmarkView>(`/api/v1/teams/${teamId}/evolution/benchmark`)
  const [foco, setFoco] = useState<AreaId | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [todosOsPassos, setTodosOsPassos] = useState(false)

  const recarregar = () => {
    evo.recarregar()
    fila.recarregar()
  }

  const declarar = async (criterionId: string, nota: string) => {
    setErro(null)
    try {
      await api(`/api/v1/teams/${teamId}/evolution/declarations/${criterionId}`, {
        method: 'POST',
        body: JSON.stringify(nota ? { note: nota } : {}),
      })
      recarregar()
    } catch (e) {
      setErro(mensagem(e))
    }
  }

  const revogar = async (criterionId: string) => {
    setErro(null)
    try {
      await api(`/api/v1/teams/${teamId}/evolution/declarations/${criterionId}`, {
        method: 'DELETE',
      })
      recarregar()
    } catch (e) {
      setErro(mensagem(e))
    }
  }

  const irPara = (destino: { page: string; tab?: string } | null) => {
    if (!destino) return
    if (destino.page === 'editor') return setPage('editor')
    if (destino.tab) setTeamTab(destino.tab as never)
  }

  if (evo.estado === 'loading') return <Esqueleto />
  if (evo.estado === 'error' || !evo.data) {
    return (
      <p className="bj-erro" role="alert">
        {evo.erro ?? 'Não deu para ler a evolução da equipe.'}{' '}
        <button type="button" className="bj-link" onClick={evo.recarregar}>
          Tentar de novo
        </button>
      </p>
    )
  }

  const dados = evo.data
  const passos = fila.data ?? []
  const emFoco = dados.areas.find((a) => a.area === foco) ?? dados.areas[0]

  return (
    <div className="bj-evolucao">
      {erro && (
        <p className="bj-erro" role="alert">
          {erro}
        </p>
      )}

      {/* C-09 — faixa de escore. O número é âncora, mas nunca vem sozinho. */}
      <section className="bj-escore" aria-live="polite">
        <div className="bj-escore-num">
          <strong>{formatAverage(dados.average)}</strong>
          <span>de {MAX_LEVEL}</span>
        </div>
        <div className="bj-escore-txt">
          <p>
            Maturidade média das 6 áreas. Cada área sobe quando <b>todos</b> os critérios do nível
            estão satisfeitos — e desce quando um deixa de estar.
          </p>
          {bench.data?.visible && bench.data.average != null && (
            <p className="bj-escore-bench">
              Mediana da coorte: <b>{formatAverage(bench.data.average)}</b> ({bench.data.teams}{' '}
              equipes com evolução ativa)
            </p>
          )}
        </div>
        {dados.season && <FaixaTemporada season={dados.season} />}
      </section>

      {dados.bootstrap && <Bootstrap onProjetos={() => setTeamTab('projetos')} />}

      <div className="bj-evolucao-corpo">
        <section className="bj-areas" aria-label="Maturidade por área">
          {dados.areas.map((a) => (
            <button
              type="button"
              key={a.area}
              className="bj-area"
              aria-current={a.area === emFoco.area ? 'true' : undefined}
              onClick={() => setFoco(a.area)}
            >
              <div className="bj-area-topo">
                <span className="bj-area-nome">{a.label}</span>
                <span className="bj-area-nivel">
                  {levelLabel(a.level)} · {a.levelName}
                </span>
              </div>
              <Barra level={a.level} />
              <span className="bj-area-proximo">
                {a.pending.length === 0
                  ? 'Área completa — nada pendente.'
                  : `Próximo: ${a.criteria.find((c) => c.id === a.pending[0])?.label ?? ''}`}
              </span>
            </button>
          ))}
        </section>

        <aside className="bj-lateral">
          <section>
            <h3>Critérios · {emFoco.label}</h3>
            <ul className="bj-criterios">
              {emFoco.criteria
                .filter((c) => c.level <= Math.min(emFoco.level + 1, MAX_LEVEL))
                .map((c) => (
                  <Criterio
                    key={c.id}
                    criterio={c}
                    canManage={canManage}
                    onDeclarar={declarar}
                    onRevogar={revogar}
                    onIr={() => irPara(c.destination)}
                  />
                ))}
            </ul>
          </section>

          <section>
            <h3>Próximos passos</h3>
            {fila.estado === 'loading' && <span className="bj-skeleton" aria-hidden="true" />}
            {passos.length === 0 && fila.estado === 'ok' && (
              <p className="bj-vazio">Nenhum passo aberto. A fila nasce dos critérios pendentes.</p>
            )}
            <ol className="bj-passos">
              {(todosOsPassos ? passos : passos.slice(0, VISIVEIS_NA_FILA)).map((p) => (
                <li key={p.id}>
                  <button type="button" className="bj-passo" onClick={() => irPara(p.destination)}>
                    <span className="bj-passo-titulo">{p.title}</span>
                    <IconArrow size={16} />
                  </button>
                  {p.origin !== 'criterion' && (
                    <span className="bj-chip bj-chip-neutro">
                      {p.origin === 'meta' ? 'META' : 'MANUAL'}
                    </span>
                  )}
                </li>
              ))}
            </ol>
            {passos.length > VISIVEIS_NA_FILA && (
              <button type="button" className="bj-link" onClick={() => setTodosOsPassos((v) => !v)}>
                {todosOsPassos ? 'Ver só os 7 primeiros' : `Ver todos (${passos.length})`}
              </button>
            )}
            <NovoPasso teamId={teamId} onCriado={fila.recarregar} />
          </section>
        </aside>
      </div>

      <p className="bj-rodape-catalogo">
        Catálogo de critérios v{dados.catalogVersion}. Como calculamos: o nível de uma área é o
        maior N em que <b>todos</b> os critérios de nível ≤ N estão satisfeitos. Critério de
        ferramenta que ainda não existe fica fora da conta.
      </p>
    </div>
  )
}

function Barra({ level }: { level: AreaLevel }) {
  return (
    <div className="bj-barra" aria-hidden="true">
      {Array.from({ length: MAX_LEVEL }, (_, i) => (
        <span key={i} className={i < level ? 'bj-barra-cheio' : undefined} />
      ))}
    </div>
  )
}

function Criterio({
  criterio,
  canManage,
  onDeclarar,
  onRevogar,
  onIr,
}: {
  criterio: CriterionView
  canManage: boolean
  onDeclarar: (id: string, nota: string) => void
  onRevogar: (id: string) => void
  onIr: () => void
}) {
  const [abrindo, setAbrindo] = useState(false)
  const [nota, setNota] = useState('')

  return (
    <li className="bj-criterio">
      <span className="bj-criterio-icone">
        <StatusIcon role={criterio.satisfied ? 'pass' : 'warn'} size={16} />
      </span>
      <div className="bj-criterio-corpo">
        <span className="bj-criterio-label">{criterio.label}</span>
        <span className="bj-criterio-meta">
          {criterio.type === 'auto'
            ? `automático · ${criterio.source}`
            : 'declarado · fica no histórico'}{' '}
          — {criterio.reason}
        </span>
        {criterio.type === 'declarado' && canManage && !criterio.satisfied && (
          <>
            {abrindo ? (
              <div className="bj-criterio-form">
                <input
                  className="bj-eq-seletor"
                  placeholder="Nota (opcional): onde ficou o registro"
                  maxLength={500}
                  value={nota}
                  onChange={(e) => setNota(e.target.value)}
                />
                <button
                  type="button"
                  className="bj-btn bj-btn-sm bj-btn-primary"
                  onClick={() => (onDeclarar(criterio.id, nota.trim()), setAbrindo(false))}
                >
                  <IconCheck size={16} /> Declarar
                </button>
              </div>
            ) : (
              <button type="button" className="bj-link" onClick={() => setAbrindo(true)}>
                Declarar como feito
              </button>
            )}
          </>
        )}
        {criterio.type === 'declarado' && canManage && criterio.satisfied && (
          <button type="button" className="bj-link" onClick={() => onRevogar(criterio.id)}>
            Revogar declaração
          </button>
        )}
        {criterio.type === 'auto' && !criterio.satisfied && (
          <button type="button" className="bj-link" onClick={onIr}>
            Resolver
          </button>
        )}
      </div>
    </li>
  )
}

function NovoPasso({ teamId, onCriado }: { teamId: string; onCriado: () => void }) {
  const api = useSession((s) => s.api)
  const [titulo, setTitulo] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  const criar = async () => {
    if (!titulo.trim()) return
    setErro(null)
    try {
      await api(`/api/v1/teams/${teamId}/evolution/steps`, {
        method: 'POST',
        body: JSON.stringify({ title: titulo.trim() }),
      })
      setTitulo('')
      onCriado()
    } catch (e) {
      setErro(mensagem(e))
    }
  }

  return (
    <div className="bj-novo-passo">
      <input
        className="bj-eq-seletor"
        placeholder="Passo da equipe que não vem de critério"
        maxLength={140}
        value={titulo}
        onChange={(e) => setTitulo(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && criar()}
      />
      <button type="button" className="bj-btn bj-btn-sm" onClick={criar} disabled={!titulo.trim()}>
        <IconPlus size={16} /> Adicionar
      </button>
      {erro && <p className="bj-erro">{erro}</p>}
    </div>
  )
}

function FaixaTemporada({ season }: { season: NonNullable<EvolutionView['season']> }) {
  return (
    <div className="bj-temporada">
      <div className="bj-temporada-topo">
        <span className="bj-chip bj-chip-neutro">TEMPORADA {season.label}</span>
        {season.next && (
          <span>
            faltam <b>{season.next.daysLeft}</b> dias para {season.next.title}
          </span>
        )}
      </div>
      <ol className="bj-etapas">
        {ETAPAS.map((etapa) => (
          <li key={etapa}>{etapa}</li>
        ))}
      </ol>
    </div>
  )
}

function Bootstrap({ onProjetos }: { onProjetos: () => void }) {
  return (
    <section className="bj-vazio">
      <h3>O caminho mínimo</h3>
      <p>
        A equipe ainda não tem projeto da temporada designado — sem ele, os critérios do validador
        ficam todos parados e nada explica por quê. Comece por aqui:
      </p>
      <ol className="bj-lista">
        <li>Designe o projeto da temporada</li>
        <li>Registre a primeira decisão no diário</li>
        <li>Configure a temporada com os marcos datados</li>
      </ol>
      <button type="button" className="bj-btn bj-btn-primary" onClick={onProjetos}>
        Designar o projeto da temporada
      </button>
    </section>
  )
}

function Esqueleto() {
  return (
    <div className="bj-evolucao" aria-busy="true">
      <span className="bj-skeleton" style={{ height: 72 }} />
      <span className="bj-skeleton" style={{ height: 240 }} />
    </div>
  )
}
