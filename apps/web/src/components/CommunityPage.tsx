import { useState } from 'react'
import { useSession } from '../session'
import { mensagem, useFetch } from '../lib/useFetch'
import { IconArrow } from '../icons/glyphs'
import { StatusChip } from '../icons/statusIcon'

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
  region: string | null
  claimed: boolean
}

export function CommunityPage({ teamId }: { teamId: string | null }) {
  const aba = useSession((s) => s.communityTab)
  const setAba = useSession((s) => s.setCommunityTab)

  return (
    <div className="bj-page">
      <div className="bj-abas" role="tablist" aria-label="Seções da comunidade">
        {(
          [
            ['resultados', 'Resultados'],
            ['equipes', 'Equipes do Brasil'],
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

      {aba === 'resultados' ? <Resultados teamId={teamId} /> : <EquipesDoBrasil teamId={teamId} />}
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

function EquipesDoBrasil({ teamId }: { teamId: string | null }) {
  const [busca, setBusca] = useState('')
  const equipes = useFetch<CommunityTeam[]>(
    `/api/v1/community/teams?q=${encodeURIComponent(busca)}`,
    [busca],
  )

  return (
    <>
      <input
        className="bj-eq-seletor bj-busca"
        type="search"
        placeholder="Buscar equipe ou instituição"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
      />
      {equipes.estado === 'loading' && <span className="bj-skeleton" style={{ height: 200 }} />}
      {equipes.estado === 'ok' && (equipes.data ?? []).length === 0 && (
        <p className="bj-vazio">Nenhuma equipe encontrada no registro.</p>
      )}
      <ul className="bj-cards">
        {(equipes.data ?? []).map((t) => (
          <li key={t.id} className="bj-card">
            <header>
              <h3>{t.displayName}</h3>
            </header>
            <p>{t.university ?? 'instituição não informada'}</p>
            <p className="bj-card-estado">
              {[t.uf, t.region].filter(Boolean).join(' · ') || 'região não informada'}
            </p>
            <div className="bj-card-acoes">
              {t.claimed ? (
                <span className="bj-chip bj-chip-neutro">VINCULADA A UMA EQUIPE DO PORTAL</span>
              ) : (
                teamId && <Vincular teamId={teamId} communityTeamId={t.id} />
              )}
            </div>
          </li>
        ))}
      </ul>
    </>
  )
}

function Vincular({ teamId, communityTeamId }: { teamId: string; communityTeamId: string }) {
  const api = useSession((s) => s.api)
  const [estado, setEstado] = useState<'ocioso' | 'pedido' | 'erro'>('ocioso')
  const [erro, setErro] = useState<string | null>(null)

  if (estado === 'pedido') return <span className="bj-chip bj-chip-info">VÍNCULO EM ANÁLISE</span>

  return (
    <>
      <button
        type="button"
        className="bj-btn bj-btn-sm"
        onClick={async () => {
          try {
            await api('/api/v1/community/claims', {
              method: 'POST',
              body: JSON.stringify({ teamId, communityTeamId }),
            })
            setEstado('pedido')
          } catch (e) {
            setErro(mensagem(e))
            setEstado('erro')
          }
        }}
      >
        É a minha equipe <IconArrow size={16} />
      </button>
      {estado === 'erro' && <span className="bj-erro">{erro}</span>}
    </>
  )
}
