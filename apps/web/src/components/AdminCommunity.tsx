import { useState } from 'react'
import { useSession } from '../session'
import { mensagem, useFetch } from '../lib/useFetch'
import { IconPlus, IconTrash } from '../icons/glyphs'
import { UFS } from '../data/brasil-uf'
import { REGIOES, UFS_DA_REGIAO, type RegiaoId } from '../data/panorama'

/**
 * Administração › Comunidade (DF-15 RF-2.1/RF-2.2/RF-2.3).
 *
 * Duas coisas que faltavam para o "É a minha equipe" da aba pública significar algo:
 *  - a FILA de vínculos, que é quem aprova — sem ela o pedido entrava no banco e
 *    morria lá, e para a equipe o botão simplesmente não fazia nada;
 *  - a CURADORIA do registro, porque o acervo veio de levantamento e de ingestão de
 *    resultados: nome grafado de três jeitos, UF faltando, duplicata. Sem edição, a
 *    única correção possível era rodar o script de novo, que não conserta a fonte.
 *
 * Excluir é o caminho estreito de propósito: linha com resultado é âncora do acervo
 * e a API recusa (409). Duplicata sem resultado é o caso real.
 */

interface AdminClaim {
  id: string
  teamId: string
  communityTeamId: string
  communityTeamName: string | null
  communityTeamUniversity: string | null
  communityTeamUf: string | null
  communityTeamTaken: boolean
  teamName: string | null
  teamUniversity: string | null
  evidence: string | null
  status: 'aberta' | 'aprovada' | 'recusada'
  createdAt: string
  resolvedAt: string | null
  requestedBy: string | null
  requestedByEmail: string | null
}

interface AdminCommunityTeam {
  id: string
  displayName: string
  university: string | null
  city: string | null
  uf: string | null
  region: string | null
  regionId: RegiaoId | null
  links: string[]
  claimed: boolean
  claimedByTeamId: string | null
  claimedTeamName: string | null
  results: number
}

const PAGE = 50

type Secao = 'claims' | 'registro'

function quando(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR', { dateStyle: 'short' })
}

export function AdminCommunity() {
  const [secao, setSecao] = useState<Secao>('claims')

  return (
    <div className="bj-admin-cal">
      <div className="admin-tabs">
        {(
          [
            ['claims', 'Vínculos'],
            ['registro', 'Equipes do Brasil'],
          ] as [Secao, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={secao === id ? 'toggle active' : 'toggle'}
            onClick={() => setSecao(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {secao === 'claims' ? <FilaDeVinculos /> : <RegistroDeEquipes />}
    </div>
  )
}

// ---------- fila de vínculos ----------

function FilaDeVinculos() {
  const api = useSession((s) => s.api)
  const [status, setStatus] = useState('aberta')
  const [erro, setErro] = useState<string | null>(null)
  const fila = useFetch<AdminClaim[]>(`/api/v1/admin/community/claims?status=${status}`, [status])
  const lista = fila.data ?? []

  const resolver = async (id: string, approve: boolean) => {
    setErro(null)
    try {
      await api(`/api/v1/admin/community/claims/${id}/resolve`, {
        method: 'POST',
        body: JSON.stringify({ approve }),
      })
      fila.recarregar()
    } catch (e) {
      setErro(mensagem(e))
    }
  }

  return (
    <div className="bj-admin-cal-corpo">
      <div className="bj-eq-head">
        <select
          className="bj-eq-seletor"
          aria-label="Situação da solicitação"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="aberta">Em análise</option>
          <option value="aprovada">Aprovadas</option>
          <option value="recusada">Recusadas</option>
        </select>
        <span className="bj-legenda">
          Aprovar liga a equipe do acervo à equipe do portal: ela passa a ver o benchmark e a
          aparecer como &quot;VOCÊ&quot; na tabela de resultados.
        </span>
      </div>
      {erro && (
        <p className="bj-erro" role="alert">
          {erro}
        </p>
      )}
      {fila.estado === 'loading' && <span className="bj-skeleton" style={{ height: 120 }} />}
      {fila.estado === 'error' && (
        <p className="bj-erro" role="alert">
          {fila.erro}{' '}
          <button type="button" className="bj-link" onClick={fila.recarregar}>
            tentar de novo
          </button>
        </p>
      )}
      {fila.estado === 'ok' && lista.length === 0 && (
        <p className="bj-vazio">Nenhuma solicitação nesta situação.</p>
      )}
      <ul className="bj-cards" style={{ gridTemplateColumns: '1fr' }}>
        {lista.map((cl) => (
          <li key={cl.id} className="bj-card">
            <header>
              <h3>{cl.communityTeamName ?? 'equipe do acervo'}</h3>
              {cl.status !== 'aberta' && (
                <span className="bj-chip bj-chip-neutro">{cl.status.toUpperCase()}</span>
              )}
            </header>
            <p className="bj-card-estado">
              <span>
                acervo: {cl.communityTeamUniversity ?? 'instituição não informada'}
                {cl.communityTeamUf ? ` · ${cl.communityTeamUf}` : ''}
              </span>
              <span>
                portal: {cl.teamName ?? 'equipe removida'}
                {cl.teamUniversity ? ` · ${cl.teamUniversity}` : ''}
              </span>
              <span>
                pedido por {cl.requestedBy ?? '—'}
                {cl.requestedByEmail ? ` (${cl.requestedByEmail})` : ''} em {quando(cl.createdAt)}
              </span>
            </p>
            <p>{cl.evidence ? cl.evidence : 'Sem evidência anexada ao pedido.'}</p>
            {cl.status === 'aberta' && cl.communityTeamTaken && (
              <p className="bj-erro">
                Esta equipe do acervo já está vinculada a outra equipe do portal. Desfaça o vínculo
                em Equipes do Brasil antes de aprovar.
              </p>
            )}
            {cl.status === 'aberta' && (
              <div className="bj-card-acoes">
                <button
                  type="button"
                  className="bj-btn bj-btn-sm bj-btn-primary"
                  onClick={() => resolver(cl.id, true)}
                >
                  Aprovar vínculo
                </button>
                <button
                  type="button"
                  className="bj-btn bj-btn-sm"
                  onClick={() => resolver(cl.id, false)}
                >
                  Recusar
                </button>
              </div>
            )}
            {cl.status !== 'aberta' && (
              <p className="bj-legenda">Resolvida em {quando(cl.resolvedAt)}.</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

// ---------- registro canônico ----------

function RegistroDeEquipes() {
  const api = useSession((s) => s.api)
  const [busca, setBusca] = useState('')
  const [uf, setUf] = useState('')
  const [regiao, setRegiao] = useState('')
  const [offset, setOffset] = useState(0)
  const [nova, setNova] = useState(false)
  const [editando, setEditando] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const query = new URLSearchParams({ limit: String(PAGE), offset: String(offset) })
  if (busca.trim()) query.set('q', busca.trim())
  if (uf) query.set('uf', uf)
  if (regiao) query.set('region', regiao)
  const lista = useFetch<AdminCommunityTeam[]>(`/api/v1/admin/community/teams?${query}`, [
    busca,
    uf,
    regiao,
    offset,
  ])
  const rows = lista.data ?? []
  const ufsVisiveis = regiao ? UFS.filter((u) => u.regiao === regiao) : UFS

  const recarregar = () => {
    setEditando(null)
    setNova(false)
    lista.recarregar()
  }

  const acao = async (url: string, init: RequestInit) => {
    setErro(null)
    try {
      await api(url, init)
      recarregar()
    } catch (e) {
      setErro(mensagem(e))
    }
  }

  return (
    <div className="bj-admin-cal-corpo">
      <div className="bj-eq-head">
        <input
          className="bj-eq-seletor bj-busca"
          type="search"
          placeholder="Buscar equipe ou instituição"
          value={busca}
          onChange={(e) => {
            setBusca(e.target.value)
            setOffset(0)
          }}
        />
        <select
          className="bj-eq-seletor"
          aria-label="Filtrar por região"
          value={regiao}
          onChange={(e) => {
            setRegiao(e.target.value)
            setOffset(0)
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
          onChange={(e) => {
            setUf(e.target.value)
            setOffset(0)
          }}
        >
          <option value="">Todos os estados</option>
          {UFS.filter((u) => ufsVisiveis.includes(u)).map((u) => (
            <option key={u.sigla} value={u.sigla}>
              {u.sigla} — {u.nome}
            </option>
          ))}
        </select>
        <button type="button" className="bj-btn bj-btn-sm" onClick={() => setNova((v) => !v)}>
          <IconPlus size={16} /> Nova equipe
        </button>
      </div>

      {erro && (
        <p className="bj-erro" role="alert">
          {erro}
        </p>
      )}

      {nova && (
        <EquipeForm
          onCancelar={() => setNova(false)}
          onSalvar={(body) =>
            acao('/api/v1/admin/community/teams', { method: 'POST', body: JSON.stringify(body) })
          }
        />
      )}

      {lista.estado === 'loading' && <span className="bj-skeleton" style={{ height: 200 }} />}
      {lista.estado === 'error' && (
        <p className="bj-erro" role="alert">
          {lista.erro}{' '}
          <button type="button" className="bj-link" onClick={lista.recarregar}>
            tentar de novo
          </button>
        </p>
      )}
      {lista.estado === 'ok' && rows.length === 0 && (
        <p className="bj-vazio">Nenhuma equipe neste recorte do registro.</p>
      )}

      {rows.length > 0 && (
        <div className="bj-tabela-wrap">
          <table className="bj-tabela">
            <thead>
              <tr>
                <th>Equipe</th>
                <th>Instituição</th>
                <th>Cidade/UF</th>
                <th>Região</th>
                <th>Resultados</th>
                <th>Vínculo</th>
                <th>
                  <span className="bj-sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id}>
                  <td>{t.displayName}</td>
                  <td>{t.university ?? '—'}</td>
                  <td>{[t.city, t.uf].filter(Boolean).join('/') || '—'}</td>
                  <td>{t.region ?? '—'}</td>
                  <td>{t.results}</td>
                  <td>
                    {t.claimed ? (
                      <>
                        {t.claimedTeamName ?? 'equipe do portal'}{' '}
                        <button
                          type="button"
                          className="bj-link"
                          onClick={() =>
                            acao(`/api/v1/admin/community/teams/${t.id}/unlink`, {
                              method: 'POST',
                            })
                          }
                        >
                          desfazer
                        </button>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="bj-btn bj-btn-sm"
                      onClick={() => setEditando(editando === t.id ? null : t.id)}
                    >
                      {editando === t.id ? 'Fechar' : 'Editar'}
                    </button>{' '}
                    <button
                      type="button"
                      className="bj-btn bj-btn-sm"
                      aria-label={`Excluir ${t.displayName}`}
                      // sem confirmação porque a API recusa o que importa: linha com
                      // resultado ou com vínculo volta 409 e nada é apagado
                      onClick={() =>
                        acao(`/api/v1/admin/community/teams/${t.id}`, { method: 'DELETE' })
                      }
                    >
                      <IconTrash size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editando && rows.find((t) => t.id === editando) && (
        <EquipeForm
          equipe={rows.find((t) => t.id === editando)}
          onCancelar={() => setEditando(null)}
          onSalvar={(body) =>
            acao(`/api/v1/admin/community/teams/${editando}`, {
              method: 'PATCH',
              body: JSON.stringify(body),
            })
          }
        />
      )}

      <div className="bj-card-acoes">
        <button
          type="button"
          className="bj-btn bj-btn-sm"
          disabled={offset === 0}
          onClick={() => setOffset(Math.max(offset - PAGE, 0))}
        >
          Anterior
        </button>
        <button
          type="button"
          className="bj-btn bj-btn-sm"
          disabled={rows.length < PAGE}
          onClick={() => setOffset(offset + PAGE)}
        >
          Próxima
        </button>
        <span className="bj-legenda">
          {rows.length ? `${offset + 1}–${offset + rows.length}` : '—'}
        </span>
      </div>
    </div>
  )
}

interface EquipePatch {
  displayName: string
  university: string | null
  city: string | null
  uf: string | null
  links: string[]
}

function EquipeForm({
  equipe,
  onSalvar,
  onCancelar,
}: {
  equipe?: AdminCommunityTeam
  onSalvar: (body: EquipePatch) => void | Promise<void>
  onCancelar: () => void
}) {
  const [displayName, setDisplayName] = useState(equipe?.displayName ?? '')
  const [university, setUniversity] = useState(equipe?.university ?? '')
  const [city, setCity] = useState(equipe?.city ?? '')
  const [uf, setUf] = useState(equipe?.uf ?? '')
  const [links, setLinks] = useState((equipe?.links ?? []).join('\n'))

  return (
    <form
      className="bj-card bj-form"
      onSubmit={(e) => {
        e.preventDefault()
        void onSalvar({
          displayName: displayName.trim(),
          university: university.trim() || null,
          city: city.trim() || null,
          uf: uf || null,
          links: links
            .split('\n')
            .map((l) => l.trim())
            .filter(Boolean),
        })
      }}
    >
      <header>
        <h3>{equipe ? `Editar ${equipe.displayName}` : 'Nova equipe no registro'}</h3>
      </header>
      <input
        className="bj-eq-seletor"
        placeholder="Nome da equipe"
        maxLength={200}
        required
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
      />
      <input
        className="bj-eq-seletor"
        placeholder="Instituição"
        maxLength={200}
        value={university}
        onChange={(e) => setUniversity(e.target.value)}
      />
      <div className="bj-marco">
        <input
          className="bj-eq-seletor"
          placeholder="Cidade"
          maxLength={120}
          value={city}
          onChange={(e) => setCity(e.target.value)}
        />
        <select
          className="bj-eq-seletor"
          aria-label="Estado"
          value={uf}
          onChange={(e) => setUf(e.target.value)}
        >
          <option value="">UF não informada</option>
          {UFS.map((u) => (
            <option key={u.sigla} value={u.sigla}>
              {u.sigla} — {u.nome}
            </option>
          ))}
        </select>
      </div>
      <label>
        Links públicos, um por linha
        <textarea
          className="bj-eq-seletor bj-textarea"
          placeholder="https://…"
          value={links}
          onChange={(e) => setLinks(e.target.value)}
        />
      </label>
      <p className="bj-legenda">
        A região vem do estado (agrupamento do IBGE) e é ela que o filtro da aba pública usa —
        preencher a UF é o que coloca a equipe no recorte certo.
      </p>
      <div className="bj-card-acoes">
        <button
          type="submit"
          className="bj-btn bj-btn-sm bj-btn-primary"
          disabled={!displayName.trim()}
        >
          Salvar
        </button>
        <button type="button" className="bj-btn bj-btn-sm" onClick={onCancelar}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
