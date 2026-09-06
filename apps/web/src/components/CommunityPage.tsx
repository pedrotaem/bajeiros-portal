import { useState } from 'react'
import { useSession } from '../session'
import { mensagem, useFetch } from '../lib/useFetch'
import { IconArrow } from '../icons/glyphs'
import { StatusChip } from '../icons/statusIcon'
import { UFS } from '../data/brasil-uf'
import { REGIOES, UFS_DA_REGIAO, type RegiaoId } from '../data/panorama'
import { CalendarTab } from './CalendarTab'
import { PrecisaDeConta } from './PublicHome'

/**
 * Comunidade (DF-15) — o acervo de resultados públicos e o registro das equipes.
 *
 * Duas regras acima do layout:
 *  - RESTRIÇÃO DE MARCA: nenhuma tela usa a identidade da organização. As competições
 *    são "Nacional 2026" / "Regional Sudeste 2025" e a fonte é citada como resultados
 *    públicos, com o link por linha.
 *  - A coorte aparece SÓ para a própria equipe. Perfil de terceiro nunca é rotulado —
 *    o objetivo é benchmark, não constrangimento (§3.1, P-1.4).
 */
interface Competition {
  id: string
  season: number
  kind: 'nacional' | 'regional'
  region: string | null
  name: string
  sourceUrl: string | null
  results?: number
}

interface ResultRow {
  communityTeamId: string
  displayName: string
  university: string | null
  uf: string | null
  position: number | null
  pointsTotal: number | null
  points: Record<string, number>
  sourceUrl: string | null
  isMine: boolean
}

interface Benchmark {
  visible: boolean
  reason?: string
  floor: number
  teams?: number
  cohort: string | null
  cohortLabel?: string
  events: Record<string, number>
}

interface CommunityTeam {
  id: string
  displayName: string
  university: string | null
  uf: string | null
  /** Nome da região, DERIVADO da UF pela API — não a coluna crua do acervo. */
  region: string | null
  regionId: RegiaoId | null
  claimed: boolean
  claimedByTeamId: string | null
}

interface Claim {
  id: string
  teamId: string
  communityTeamId: string
  communityTeamName: string | null
  evidence: string | null
  status: 'aberta' | 'aprovada' | 'recusada'
  createdAt: string
  resolvedAt: string | null
}

export function CommunityPage({ teamId }: { teamId: string | null }) {
  const aba = useSession((s) => s.communityTab)
  const setAba = useSession((s) => s.setCommunityTab)
  const user = useSession((s) => s.user)

  return (
    <div className="bj-page">
      <div className="bj-abas" role="tablist" aria-label="Seções da comunidade">
        {(
          [
            ['resultados', 'Resultados'],
            ['equipes', 'Equipes do Brasil'],
            // DF-33 FR-DF33.1 — terceira, depois de Resultados e Equipes do Brasil
            ['calendario', 'Calendário'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            role="tab"
            className="bj-aba"
            aria-selected={aba === id}
            onClick={() => setAba(id)}
          >
            {label}
          </button>
        ))}
        <button className="bj-aba" role="tab" aria-selected={false} disabled title="em breve">
          Galeria
        </button>
        <button className="bj-aba" role="tab" aria-selected={false} disabled title="em breve">
          Fórum
        </button>
      </div>

      {/* DF-33 FR-DF33.2 — o Calendário abre sem conta; Resultados e Equipes continuam
          exigindo (é o acervo, DF-15). Sem sessão a página só chega aqui pela aba pública. */}
      {aba === 'calendario' && <CalendarTab teamId={teamId} />}
      {aba === 'resultados' &&
        (user ? (
          <Resultados teamId={teamId} />
        ) : (
          <PrecisaDeConta destino="O acervo de resultados" inline />
        ))}
      {aba === 'equipes' &&
        (user ? (
          <EquipesDoBrasil teamId={teamId} />
        ) : (
          <PrecisaDeConta destino="O registro das equipes" inline />
        ))}
    </div>
  )
}

function Resultados({ teamId }: { teamId: string | null }) {
  const competicoes = useFetch<Competition[]>('/api/v1/community/competitions')
  const [selecionada, setSelecionada] = useState<string | null>(null)
  const id = selecionada ?? competicoes.data?.[0]?.id ?? null
  const tabela = useFetch<{ competition: Competition; results: ResultRow[] }>(
    id ? `/api/v1/community/competitions/${id}/results` : null,
    [id],
  )
  const bench = useFetch<Benchmark>(
    id && teamId ? `/api/v1/community/benchmark?teamId=${teamId}&competitionId=${id}` : null,
    [id, teamId],
  )

  if (competicoes.estado === 'loading')
    return <span className="bj-skeleton" style={{ height: 200 }} />
  if (competicoes.estado === 'error') {
    return (
      <p className="bj-erro" role="alert">
        {competicoes.erro}{' '}
        <button type="button" className="bj-link" onClick={competicoes.recarregar}>
          Tentar de novo
        </button>
      </p>
    )
  }
  if ((competicoes.data ?? []).length === 0) {
    return (
      <div className="bj-vazio">
        <h3>O acervo ainda não foi publicado</h3>
        <p>
          Os resultados de 2021 a 2026 entram por ingestão curada, com a fonte pública citada em
          cada linha. Nada é estimado.
        </p>
      </div>
    )
  }

  const minha = tabela.data?.results.find((r) => r.isMine) ?? null

  return (
    <>
      <div className="bj-eq-head">
        <select
          className="bj-eq-seletor"
          value={id ?? ''}
          onChange={(e) => setSelecionada(e.target.value)}
          aria-label="Competição"
        >
          {(competicoes.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.results ?? 0} equipes)
            </option>
          ))}
        </select>
        {minha && <span className="bj-chip bj-chip-neutro">SUA EQUIPE NA TABELA</span>}
      </div>

      {minha && (
        <section className="bj-card">
          <header>
            <h3>Sua equipe no contexto</h3>
            {bench.data?.visible && (
              <span className="bj-chip bj-chip-neutro">
                COORTE {String(bench.data.cohortLabel ?? '').toUpperCase()}
              </span>
            )}
          </header>
          <p>
            {minha.position ? `${minha.position}º lugar` : 'sem posição registrada'}
            {minha.pointsTotal != null ? ` · ${minha.pointsTotal.toFixed(2)} pontos` : ''}
          </p>
          {bench.data?.visible ? (
            <ul className="bj-provas">
              {Object.entries(minha.points).map(([prova, valor]) => {
                const mediana = bench.data!.events[prova]
                return (
                  <li key={prova}>
                    <span className="bj-prova-nome">{prova}</span>
                    <span className="bj-prova-num">{valor.toFixed(2)}</span>
                    {mediana != null && (
                      <span className="bj-prova-mediana">
                        mediana da coorte {mediana.toFixed(2)}
                      </span>
                    )}
                    {mediana != null && valor < mediana && teamId && (
                      <TransformarEmMeta teamId={teamId} competitionId={id!} prova={prova} />
                    )}
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="bj-nota-credencial">
              {bench.data?.reason === 'sem-vinculo'
                ? 'Vincule a equipe ao registro do acervo para ver a mediana da sua coorte.'
                : `A mediana só aparece com ${bench.data?.floor ?? 8} equipes ou mais na coorte. Abaixo disso ela identificaria gente.`}
            </p>
          )}
          <p className="bj-legenda">Legenda: sua equipe · mediana da coorte.</p>
        </section>
      )}

      {tabela.estado === 'loading' && <span className="bj-skeleton" style={{ height: 240 }} />}
      {tabela.data && (
        <div className="bj-tabela-wrap">
          <table className="bj-tabela">
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Equipe</th>
                <th scope="col">Instituição</th>
                <th scope="col" className="bj-num">
                  Pontos
                </th>
              </tr>
            </thead>
            <tbody>
              {tabela.data.results.map((r) => (
                <tr key={r.communityTeamId} className={r.isMine ? 'bj-linha-minha' : undefined}>
                  <td className="bj-num">{r.position ?? '—'}</td>
                  <td>
                    {r.displayName}{' '}
                    {r.isMine && <span className="bj-chip bj-chip-neutro">VOCÊ</span>}
                  </td>
                  <td>{r.university ?? '—'}</td>
                  <td className="bj-num">{r.pointsTotal?.toFixed(2) ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <footer className="bj-hub-foot">
        <StatusChip role="info" />
        <p>
          Compilado de resultados públicos das competições, temporada a temporada.{' '}
          {tabela.data?.competition.sourceUrl && (
            <a href={tabela.data.competition.sourceUrl} target="_blank" rel="noreferrer">
              fonte desta edição
            </a>
          )}{' '}
          Achou um erro? <SolicitarCorrecao competitionId={id} />
        </p>
      </footer>
    </>
  )
}

function TransformarEmMeta({
  teamId,
  competitionId,
  prova,
}: {
  teamId: string
  competitionId: string
  prova: string
}) {
  const api = useSession((s) => s.api)
  const [estado, setEstado] = useState<'ocioso' | 'feito' | 'erro'>('ocioso')
  const [erro, setErro] = useState<string | null>(null)

  const criar = async () => {
    try {
      await api('/api/v1/community/goals', {
        method: 'POST',
        body: JSON.stringify({ teamId, competitionId, event: prova }),
      })
      setEstado('feito')
    } catch (e) {
      setErro(mensagem(e))
      setEstado('erro')
    }
  }

  if (estado === 'feito') return <span className="bj-chip bj-chip-pass">VIROU META</span>
  return (
    <>
      <button type="button" className="bj-link" onClick={criar}>
        Transformar em meta da temporada
      </button>
      {estado === 'erro' && <span className="bj-erro">{erro}</span>}
    </>
  )
}

function SolicitarCorrecao({ competitionId }: { competitionId: string | null }) {
  const api = useSession((s) => s.api)
  const [aberto, setAberto] = useState(false)
  const [proposta, setProposta] = useState('')
  const [fonte, setFonte] = useState('')
  const [estado, setEstado] = useState<'ocioso' | 'enviado' | 'erro'>('ocioso')
  const [erro, setErro] = useState<string | null>(null)

  if (estado === 'enviado') return <span>Correção enviada. Um admin vai avaliar com a fonte.</span>
  if (!aberto)
    return (
      <button type="button" className="bj-link" onClick={() => setAberto(true)}>
        Solicite a correção
      </button>
    )

  return (
    <form
      className="bj-form"
      onSubmit={async (e) => {
        e.preventDefault()
        try {
          await api('/api/v1/community/corrections', {
            method: 'POST',
            body: JSON.stringify({
              target: { competitionId: competitionId ?? undefined, field: 'points_total' },
              proposal: proposta.trim(),
              sourceUrl: fonte.trim() || undefined,
            }),
          })
          setEstado('enviado')
        } catch (e2) {
          setErro(mensagem(e2))
          setEstado('erro')
        }
      }}
    >
      <textarea
        className="bj-eq-seletor bj-textarea"
        placeholder="O que está errado e qual é o valor correto"
        maxLength={1000}
        value={proposta}
        onChange={(e) => setProposta(e.target.value)}
        required
      />
      <input
        className="bj-eq-seletor"
        placeholder="Link da fonte pública"
        value={fonte}
        onChange={(e) => setFonte(e.target.value)}
      />
      {estado === 'erro' && <p className="bj-erro">{erro}</p>}
      <div className="bj-card-acoes">
        <button
          type="submit"
          className="bj-btn bj-btn-sm bj-btn-primary"
          disabled={!proposta.trim()}
        >
          Enviar correção
        </button>
        <button type="button" className="bj-btn bj-btn-sm" onClick={() => setAberto(false)}>
          Cancelar
        </button>
      </div>
    </form>
  )
}

/**
 * Equipes do Brasil — o registro canônico, com busca, estado e região.
 *
 * Os dois filtros são do SERVIDOR (`?uf=` / `?region=`), não da página: a lista tem
 * quase duzentas equipes e recortar depois de paginar mostraria meia região. Região
 * é DERIVADA da UF (a API resolve), então o recorte não depende de uma coluna que só
 * metade do acervo preencheu.
 */
function EquipesDoBrasil({ teamId }: { teamId: string | null }) {
  const [busca, setBusca] = useState('')
  const [uf, setUf] = useState('')
  const [regiao, setRegiao] = useState('')

  const query = new URLSearchParams()
  if (busca.trim()) query.set('q', busca.trim())
  if (uf) query.set('uf', uf)
  if (regiao) query.set('region', regiao)
  const equipes = useFetch<CommunityTeam[]>(`/api/v1/community/teams?${query}`, [busca, uf, regiao])

  // O pedido em análise vem do SERVIDOR: sem isto o botão volta ao estado inicial a
  // cada recarga e a solicitação enviada some da tela (AC-DF15.3).
  const claims = useFetch<Claim[]>(teamId ? '/api/v1/community/claims' : null, [teamId])
  const emAnalise = new Set(
    (claims.data ?? []).filter((cl) => cl.status === 'aberta').map((cl) => cl.communityTeamId),
  )
  const temPedidoAberto = emAnalise.size > 0

  const ufsVisiveis = regiao ? UFS.filter((u) => u.regiao === regiao) : UFS
  const lista = equipes.data ?? []

  return (
    <>
      <div className="bj-eq-head">
        <input
          className="bj-eq-seletor bj-busca"
          type="search"
          placeholder="Buscar equipe ou instituição"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <select
          className="bj-eq-seletor"
          aria-label="Filtrar por região"
          value={regiao}
          onChange={(e) => {
            setRegiao(e.target.value)
            // a UF escolhida pode não pertencer à nova região: um filtro não pode
            // deixar o outro apontando para o vazio
            if (e.target.value && uf && !UFS_DA_REGIAO[e.target.value as RegiaoId].includes(uf)) {
              setUf('')
            }
          }}
        >
          <option value="">Todas as regiões</option>
          {REGIOES.map((r) => (
            <option key={r.id} value={r.id}>
              {r.nome}
            </option>
          ))}
        </select>
        <select
          className="bj-eq-seletor"
          aria-label="Filtrar por estado"
          value={uf}
          onChange={(e) => setUf(e.target.value)}
        >
          <option value="">Todos os estados</option>
          {ufsVisiveis.map((u) => (
            <option key={u.sigla} value={u.sigla}>
              {u.sigla} — {u.nome}
            </option>
          ))}
        </select>
        {(busca || uf || regiao) && (
          <button
            type="button"
            className="bj-btn bj-btn-sm"
            onClick={() => {
              setBusca('')
              setUf('')
              setRegiao('')
            }}
          >
            Limpar filtros
          </button>
        )}
      </div>
      {equipes.estado === 'ok' && (
        <p className="bj-legenda" aria-live="polite">
          {lista.length === 1 ? '1 equipe' : `${lista.length} equipes`}
          {(uf || regiao || busca) && ' no recorte atual'}
        </p>
      )}
      {equipes.estado === 'loading' && <span className="bj-skeleton" style={{ height: 200 }} />}
      {equipes.estado === 'error' && (
        <p className="bj-erro" role="alert">
          {equipes.erro}{' '}
          <button type="button" className="bj-link" onClick={equipes.recarregar}>
            tentar de novo
          </button>
        </p>
      )}
      {equipes.estado === 'ok' && lista.length === 0 && (
        <p className="bj-vazio">Nenhuma equipe encontrada neste recorte do registro.</p>
      )}
      <ul className="bj-cards">
        {lista.map((t) => (
          <li key={t.id} className="bj-card">
            <header>
              <h3>{t.displayName}</h3>
            </header>
            <p>{t.university ?? 'instituição não informada'}</p>
            <p className="bj-card-estado">
              {[t.uf, t.region].filter(Boolean).join(' · ') || 'origem não informada'}
            </p>
            <div className="bj-card-acoes">
              {emAnalise.has(t.id) ? (
                <span className="bj-chip bj-chip-info">VÍNCULO EM ANÁLISE</span>
              ) : t.claimed ? (
                <span className="bj-chip bj-chip-neutro">
                  {teamId && t.claimedByTeamId === teamId
                    ? 'VINCULADA À SUA EQUIPE'
                    : 'VINCULADA A UMA EQUIPE DO PORTAL'}
                </span>
              ) : // sem equipe no portal não há o que vincular — dizer isso vale mais
              // que uma área de ação vazia, que lê como botão quebrado
              teamId ? (
                <Vincular
                  teamId={teamId}
                  communityTeamId={t.id}
                  bloqueado={temPedidoAberto}
                  onPedido={claims.recarregar}
                />
              ) : (
                <span className="bj-legenda">
                  Crie ou entre numa equipe do portal para pedir o vínculo.
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
      <p className="bj-hub-foot">
        O vínculo não é automático: a solicitação vai para a administração do portal, que confere e
        aprova. Enquanto isso a equipe continua vendo a tabela normalmente.
      </p>
    </>
  )
}

function Vincular({
  teamId,
  communityTeamId,
  bloqueado,
  onPedido,
}: {
  teamId: string
  communityTeamId: string
  bloqueado: boolean
  onPedido: () => void
}) {
  const api = useSession((s) => s.api)
  const [aberto, setAberto] = useState(false)
  const [evidencia, setEvidencia] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  // um pedido por vez (a API responde 409): dizer isso antes vale mais que o erro
  if (bloqueado)
    return <span className="bj-legenda">Sua equipe já tem um pedido de vínculo em análise.</span>

  if (!aberto)
    return (
      <button type="button" className="bj-btn bj-btn-sm" onClick={() => setAberto(true)}>
        É a minha equipe <IconArrow size={16} />
      </button>
    )

  return (
    <form
      className="bj-form"
      onSubmit={async (e) => {
        e.preventDefault()
        setEnviando(true)
        setErro(null)
        try {
          await api('/api/v1/community/claims', {
            method: 'POST',
            body: JSON.stringify({
              teamId,
              communityTeamId,
              evidence: evidencia.trim() || undefined,
            }),
          })
          setAberto(false)
          onPedido()
        } catch (err) {
          setErro(mensagem(err))
        } finally {
          setEnviando(false)
        }
      }}
    >
      <label>
        Como a administração confere que é a sua equipe? (opcional)
        <textarea
          className="bj-eq-seletor bj-textarea"
          placeholder="E-mail institucional, página da equipe, inscrição na competição…"
          maxLength={1000}
          value={evidencia}
          onChange={(e) => setEvidencia(e.target.value)}
        />
      </label>
      {erro && <p className="bj-erro">{erro}</p>}
      <div className="bj-card-acoes">
        <button type="submit" className="bj-btn bj-btn-sm bj-btn-primary" disabled={enviando}>
          {enviando ? 'Enviando…' : 'Enviar solicitação'}
        </button>
        <button type="button" className="bj-btn bj-btn-sm" onClick={() => setAberto(false)}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
