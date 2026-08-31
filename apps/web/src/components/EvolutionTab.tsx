import { useRef, useState } from 'react'
import { formatAverage, levelLabel, MAX_LEVEL } from '@bajeiros/evolution/areas'
import type { AreaId, AreaLevel, CriterionType, LinkKind } from '@bajeiros/evolution/types'
import { useSession } from '../session'
import { mensagem, useFetch } from '../lib/useFetch'
import { IconArrow, IconCheck, IconPlus } from '../icons/glyphs'
import { StatusIcon } from '../icons/statusIcon'
import { ART_CREDIT, NextRankPanel, PromotionNotice, RankBand, type RankView } from './RankBand'

/**
 * Tela Equipe · Evolução (DF-13 E6 + DF-18 §7 + DF-19 + DF-20 E4). É o coração do
 * produto: onde a equipe vê onde está fraca, por quê, e o que fazer agora.
 *
 * Regras que a tela aplica e que valem mais que o layout:
 *  - **nada existe antes da capitania ativar** (DF-18 §3.2). Medir sem pedir
 *    transforma ferramenta em auditoria, que é o risco nº 1 do ADR-010;
 *  - nível SEMPRE em texto ("nível 3 de 5") além da barra — nunca só cor (CT-3);
 *  - queda de nível é honesta e explicada, não escondida;
 *  - a fila mostra 7; "ver todos" abre o resto. Fila infinita vira cobrança (P-3.2);
 *  - **a medida do portal aparece ao lado da resposta, sem veredito** (DF-19 RF-1.3);
 *  - contraprova mostra o VALOR MEDIDO e oferece consertar ANTES de justificar
 *    (DF-20 RF-4.2).
 */
interface Measured {
  satisfied: boolean
  reason: string
}

interface CounterCheck {
  kind: 'contradiction' | 'indication'
  message: string
  measured: string
}

interface CriterionView {
  id: string
  level: number
  type: CriterionType
  label: string
  source: string
  satisfied: boolean
  reason: string
  state: 'vigente' | 'em-contraprova' | 'reafirmada' | 'revogada'
  question: string
  fulfilled: string
  notValid: string
  where: string
  audit: { wave: string | null; note: string }
  seasonal: boolean
  expired: boolean
  measured: Measured | null
  divergent: boolean
  counterCheck: CounterCheck | null
  notComparable: string | null
  reaffirmable: boolean
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

interface Notice {
  version: string
  title: string
  reads: string[]
  neverReads: string[]
  retroactive: string
  reversible: string
}

interface EvolutionView {
  optIn: boolean
  canOptIn: boolean
  notice?: Notice
  catalogVersion: string
  mode: 'declarado' | 'aferido'
  average: number | null
  floor?: AreaLevel
  expiring?: string[]
  activityFloor?: { message: string; measured: string } | null
  areas: AreaView[]
  rank: RankView | null
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

export function EvolutionTab({
  teamId,
  teamName,
  canManage,
}: {
  teamId: string
  teamName?: string
  canManage: boolean
}) {
  const api = useSession((s) => s.api)
  const setPage = useSession((s) => s.setPage)
  const setTeamTab = useSession((s) => s.setTeamTab)
  const evo = useFetch<EvolutionView>(`/api/v1/teams/${teamId}/evolution`, [teamId])
  const fila = useFetch<StepView[]>(`/api/v1/teams/${teamId}/evolution/steps?status=open`, [teamId])
  const bench = useFetch<BenchmarkView>(`/api/v1/teams/${teamId}/evolution/benchmark`, [teamId])
  const [foco, setFoco] = useState<AreaId | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [todosOsPassos, setTodosOsPassos] = useState(false)
  const [promocaoVista, setPromocaoVista] = useState(false)
  const filaRef = useRef<HTMLElement | null>(null)

  const recarregar = () => {
    evo.recarregar()
    fila.recarregar()
  }

  const chamar = async (path: string, init: RequestInit) => {
    setErro(null)
    try {
      await api(`/api/v1/teams/${teamId}${path}`, init)
      recarregar()
    } catch (e) {
      setErro(mensagem(e))
    }
  }

  const declarar = (criterionId: string, nota: string, link: string) =>
    chamar(`/evolution/declarations/${criterionId}`, {
      method: 'POST',
      body: JSON.stringify({
        ...(nota ? { note: nota } : {}),
        ...(link ? { linkKind: 'url', linkRef: link } : {}),
      }),
    })

  const revogar = (criterionId: string) =>
    chamar(`/evolution/declarations/${criterionId}`, { method: 'DELETE' })

  const reafirmar = (criterionId: string, nota: string) =>
    chamar(`/evolution/declarations/${criterionId}/reaffirm`, {
      method: 'POST',
      body: JSON.stringify({ note: nota }),
    })

  const ativar = () => chamar('/evolution/optin', { method: 'POST', body: '{}' })
  const desativar = () => chamar('/evolution/optin', { method: 'DELETE' })

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

  // DF-18 §3.2 — antes da ativação, a aba inteira é o painel que explica o que a
  // avaliação faz e o que ela lê. Nada de barra cinza nem de emblema apagado.
  if (!dados.optIn) {
    return (
      <div className="bj-evolucao">
        {erro && (
          <p className="bj-erro" role="alert">
            {erro}
          </p>
        )}
        <PainelAtivacao notice={dados.notice} canOptIn={dados.canOptIn} onAtivar={ativar} />
      </div>
    )
  }

  const passos = fila.data ?? []
  const emFoco = dados.areas.find((a) => a.area === foco) ?? dados.areas[0]
  const rank = dados.rank
  const mostrarPromocao = !!rank?.promotion && !promocaoVista

  // DF-20 RF-4.3 — o piso de atividade substitui a tela inteira por UM aviso e o
  // caminho mínimo. Nunca seis barras acusatórias.
  if (dados.activityFloor) {
    return (
      <div className="bj-evolucao">
        <section className="bj-vazio">
          <h3>Sem lastro para avaliar</h3>
          <p>{dados.activityFloor.message}</p>
          <p className="bj-criterio-meta">{dados.activityFloor.measured}</p>
          <ol className="bj-lista">
            <li>Monte o organograma em Equipe · Pessoas</li>
            <li>Designe o protótipo da temporada</li>
            <li>Registre a primeira decisão no diário</li>
          </ol>
          <button
            type="button"
            className="bj-btn bj-btn-primary"
            onClick={() => setTeamTab('pessoas')}
          >
            Montar o organograma
          </button>
        </section>
      </div>
    )
  }

  return (
    <div className="bj-evolucao">
      {erro && (
        <p className="bj-erro" role="alert">
          {erro}
        </p>
      )}

      {/* RF-5.1 — o aviso de promoção, uma vez por membro. Queda nunca abre isto. */}
      {mostrarPromocao && rank && (
        <PromotionNotice
          rank={rank}
          teamName={teamName ?? 'A equipe'}
          onClose={() => {
            setPromocaoVista(true)
            evo.recarregar()
          }}
        />
      )}

      {rank && (
        <RankBand
          rank={rank}
          teamName={teamName ?? 'A equipe'}
          projectName={dados.season?.seasonProjectId ? 'Protótipo da temporada' : null}
          onSeeNext={() => filaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        />
      )}

      {/* C-09 — faixa de escore. O número é âncora, mas nunca vem sozinho. */}
      <section className="bj-escore" aria-live="polite">
        <div className="bj-escore-num">
          <strong>{formatAverage(dados.average ?? 0)}</strong>
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
          {/* RF-4.4 — a tela avisa ANTES da virada, não depois da queda */}
          {!!dados.expiring?.length && dados.season && (
            <p className="bj-escore-bench">
              {dados.expiring.length} critérios vencem com a temporada {dados.season.label} e
              precisarão ser reafirmados.
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
                    onReafirmar={reafirmar}
                    onIr={() => irPara(c.destination)}
                  />
                ))}
            </ul>
          </section>

          {rank && (
            <NextRankPanel
              rank={rank}
              pendingIds={dados.areas.flatMap((a) => a.pending)}
              onEnqueue={() =>
                filaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }
            />
          )}

          <section ref={filaRef}>
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
        Catálogo de critérios v{dados.catalogVersion} ·{' '}
        {dados.mode === 'declarado'
          ? 'a equipe responde, o portal registra e mostra o que também mede'
          : 'declaração aferida: a resposta vale até o dado dizer o contrário'}
        . Como calculamos: o nível de uma área é o maior N em que <b>todos</b> os critérios de nível
        ≤ N estão satisfeitos.
      </p>
      {canManage && (
        <p className="bj-rodape-catalogo">
          <button type="button" className="bj-link" onClick={desativar}>
            Desativar a avaliação de maturidade
          </button>{' '}
          — patente e níveis somem da tela e param de recomputar. Nada é apagado, e reativar devolve
          tudo.
        </p>
      )}
    </div>
  )
}

/**
 * DF-18 RF-2.3/2.6 — o painel pré-ativação lista, com as palavras da tela, o que
 * será lido. Quem não tem a permissão vê o MESMO painel com o botão desabilitado e a
 * linha "peça à capitania" — nunca um convite que a pessoa não pode aceitar.
 */
function PainelAtivacao({
  notice,
  canOptIn,
  onAtivar,
}: {
  notice?: Notice
  canOptIn: boolean
  onAtivar: () => void
}) {
  if (!notice) return null
  return (
    <section className="bj-ativacao">
      <h3>{notice.title}</h3>
      <p>
        A avaliação de maturidade lê o que a equipe já produziu e devolve uma leitura por área, mais
        a patente do protótipo da temporada. Ela só existe se vocês pedirem.
      </p>
      <p className="bj-ativacao-secao">O que ela lê</p>
      <ul className="bj-lista">
        {notice.reads.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
      <p className="bj-ativacao-secao">O que ela nunca lê</p>
      <ul className="bj-lista">
        {notice.neverReads.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
      <p>{notice.retroactive}</p>
      <p>{notice.reversible}</p>
      <button
        type="button"
        className="bj-btn bj-btn-primary"
        onClick={onAtivar}
        disabled={!canOptIn}
      >
        Ativar a avaliação de maturidade
      </button>
      {!canOptIn && (
        <p className="bj-ativacao-sem-permissao">
          Peça à capitania para ativar — só quem capitaneia decide medir a equipe.
        </p>
      )}
      <p className="bj-credito-arte">{ART_CREDIT}</p>
    </section>
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
  onReafirmar,
  onIr,
}: {
  criterio: CriterionView
  canManage: boolean
  onDeclarar: (id: string, nota: string, link: string) => void
  onRevogar: (id: string) => void
  onReafirmar: (id: string, nota: string) => void
  onIr: () => void
}) {
  const [abrindo, setAbrindo] = useState(false)
  const [respondendo, setRespondendo] = useState(false)
  const [detalhe, setDetalhe] = useState(false)
  const [nota, setNota] = useState('')
  const [link, setLink] = useState('')
  const suspenso = criterio.state === 'em-contraprova'

  return (
    <li className={suspenso ? 'bj-criterio bj-criterio-suspenso' : 'bj-criterio'}>
      <span className="bj-criterio-icone">
        <StatusIcon role={criterio.satisfied ? 'pass' : suspenso ? 'fail' : 'warn'} size={16} />
      </span>
      <div className="bj-criterio-corpo">
        {/* DF-19 §3 — o enunciado é o que a capitania responde; o rótulo curto some */}
        <span className="bj-criterio-label">{criterio.question}</span>

        <span className="bj-criterio-meta">
          {criterio.type === 'auto' ? 'o portal também mede' : 'só a equipe sabe'} ·{' '}
          {criterio.reason}
          {criterio.seasonal && ' · vence com a temporada'}
        </span>

        {/* RF-1.3 — a medida aparece ao lado da resposta, e discordar é permitido */}
        {criterio.measured && (
          <span className={criterio.divergent ? 'bj-medida bj-medida-divergente' : 'bj-medida'}>
            medido: {criterio.measured.reason}
            {criterio.divergent && ' — a sua resposta diverge do que o portal mede'}
          </span>
        )}

        {/* §2.0 — ausência de dado não é contraprova; a tela diz isso em vez de acusar */}
        {criterio.notComparable && !suspenso && (
          <span className="bj-criterio-meta">{criterio.notComparable}</span>
        )}

        {/* DF-20 RF-4.1/4.2 — a caixa da contraprova, com o valor medido à vista */}
        {criterio.counterCheck && (
          <div className="bj-contraprova">
            {/* CT-3 — o chip nunca é só cor: vem com ícone e com a palavra */}
            <span
              className={
                criterio.counterCheck.kind === 'contradiction'
                  ? 'bj-chip bj-chip-fail'
                  : 'bj-chip bj-chip-warn'
              }
            >
              <StatusIcon
                role={criterio.counterCheck.kind === 'contradiction' ? 'fail' : 'warn'}
                size={16}
              />
              {criterio.counterCheck.kind === 'contradiction' ? 'EM CONTRAPROVA' : 'PERGUNTA'}
            </span>
            <p>{criterio.counterCheck.message}</p>
            <p className="bj-criterio-meta">medido: {criterio.counterCheck.measured}</p>
            <div className="bj-criterio-form">
              {/* consertar vem SEMPRE antes de justificar (RF-4.2) */}
              <button type="button" className="bj-btn bj-btn-sm" onClick={onIr}>
                Abrir onde se conserta
              </button>
              {criterio.reaffirmable && canManage && (
                <button type="button" className="bj-link" onClick={() => setRespondendo((v) => !v)}>
                  Responder
                </button>
              )}
            </div>
            {respondendo && (
              <div className="bj-criterio-form">
                <input
                  className="bj-eq-seletor"
                  placeholder="Por que a declaração continua valendo?"
                  maxLength={500}
                  value={nota}
                  onChange={(e) => setNota(e.target.value)}
                />
                <button
                  type="button"
                  className="bj-btn bj-btn-sm bj-btn-primary"
                  disabled={nota.trim().length < 3}
                  onClick={() => (onReafirmar(criterio.id, nota.trim()), setRespondendo(false))}
                >
                  Reafirmar
                </button>
              </div>
            )}
          </div>
        )}

        {criterio.state === 'reafirmada' && (
          <span className="bj-chip bj-chip-neutro">REAFIRMADA</span>
        )}

        <button type="button" className="bj-link" onClick={() => setDetalhe((v) => !v)}>
          {detalhe ? 'Fechar' : 'Saiba mais'}
        </button>
        {detalhe && (
          <div className="bj-criterio-detalhe">
            <p>
              <b>Cumprido quando:</b> {criterio.fulfilled}
            </p>
            <p>
              <b>Não vale:</b> {criterio.notValid}
            </p>
            <p>
              <b>Onde registrar:</b> {criterio.where}
            </p>
            <p className="bj-criterio-meta">
              {criterio.audit.wave
                ? `Aferição ${criterio.audit.wave}: ${criterio.audit.note}`
                : criterio.audit.note}
            </p>
          </div>
        )}

        {canManage && !criterio.satisfied && criterio.state !== 'em-contraprova' && (
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
                <input
                  className="bj-eq-seletor"
                  placeholder="Link (opcional)"
                  maxLength={500}
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                />
                <button
                  type="button"
                  className="bj-btn bj-btn-sm bj-btn-primary"
                  onClick={() => (
                    onDeclarar(criterio.id, nota.trim(), link.trim()),
                    setAbrindo(false)
                  )}
                >
                  <IconCheck size={16} /> Sim, cumprimos
                </button>
              </div>
            ) : (
              <button type="button" className="bj-link" onClick={() => setAbrindo(true)}>
                Responder
              </button>
            )}
          </>
        )}
        {canManage && criterio.state !== 'revogada' && (
          <button type="button" className="bj-link" onClick={() => onRevogar(criterio.id)}>
            Revogar resposta
          </button>
        )}
        {criterio.type === 'auto' && !criterio.measured?.satisfied && (
          <button type="button" className="bj-link" onClick={onIr}>
            Resolver no portal
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
        A equipe ainda não tem projeto da temporada designado — sem ele não há protótipo avaliado, e
        a patente fica esperando. Comece por aqui:
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
