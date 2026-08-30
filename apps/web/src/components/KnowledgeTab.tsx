import { useState } from 'react'
import { AREA_IDS, AREA_LABELS } from '@bajeiros/evolution/areas'
import type { AreaId } from '@bajeiros/evolution/types'
import { useSession } from '../session'
import { dataCurta, mensagem, useFetch } from '../lib/useFetch'
import { IconCheck, IconPlus, IconTrash } from '../icons/glyphs'
import { StatusChip } from '../icons/statusIcon'

/**
 * Tela Equipe · Conhecimento (DF-14 E5). O concorrente é o WhatsApp: registrar
 * precisa ser BARATO. Por isso o formulário de decisão tem 4 campos e o estado vazio
 * já vem com a ação a um clique (C-16), nunca uma tela em branco.
 */
type Area = AreaId | 'geral'

interface Decision {
  id: string
  seq: number
  title: string
  area: Area
  why: string
  authorId: string | null
  supersededBySeq: number | null
  createdAt: string
}

interface Guide {
  id: string
  kind: 'guia' | 'trilha' | 'checklist'
  title: string
  bodyMd: string
  ownerId: string | null
  stale: boolean
  completedByMe: boolean
  updatedAt: string
}

interface Kit {
  id: string
  memberName: string
  positionLabel: string | null
  dueDate: string | null
  status: 'aberto' | 'em_andamento' | 'concluido'
  progress: number
  attention: boolean
  checklist: { id: string; label: string; done: boolean }[]
}

interface Counters {
  decisions: number
  guides: number
  kitsOpen: number
  kitsDone: number
}

const AREAS: Area[] = [...AREA_IDS, 'geral']
const AREA_NOME: Record<Area, string> = { ...AREA_LABELS, geral: 'Geral' }

export function KnowledgeTab({ teamId, canManage }: { teamId: string; canManage: boolean }) {
  const api = useSession((s) => s.api)
  const meId = useSession((s) => s.user?.id ?? '')
  const [filtroArea, setFiltroArea] = useState<Area | ''>('')
  const [busca, setBusca] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  const query = new URLSearchParams()
  if (filtroArea) query.set('area', filtroArea)
  const decisoes = useFetch<Decision[]>(`/api/v1/teams/${teamId}/decisions?${query.toString()}`, [
    filtroArea,
  ])
  const guias = useFetch<Guide[]>(`/api/v1/teams/${teamId}/guides`)
  const kits = useFetch<Kit[]>(`/api/v1/teams/${teamId}/kits`)
  const contadores = useFetch<Counters>(`/api/v1/teams/${teamId}/knowledge`)
  const pesquisa = useFetch<{ decisions: Decision[]; guides: Guide[] }>(
    busca.trim().length >= 2
      ? `/api/v1/teams/${teamId}/knowledge/search?q=${encodeURIComponent(busca.trim())}`
      : null,
    [busca],
  )

  const recarregarTudo = () => {
    decisoes.recarregar()
    guias.recarregar()
    kits.recarregar()
    contadores.recarregar()
  }

  const excluirDecisao = async (id: string) => {
    setErro(null)
    try {
      await api(`/api/v1/teams/${teamId}/decisions/${id}`, { method: 'DELETE' })
      recarregarTudo()
    } catch (e) {
      setErro(mensagem(e))
    }
  }

  const revisar = async (id: string) => {
    setErro(null)
    try {
      await api(`/api/v1/teams/${teamId}/guides/${id}/still-valid`, { method: 'POST' })
      recarregarTudo()
    } catch (e) {
      setErro(mensagem(e))
    }
  }

  const concluirTrilha = async (id: string) => {
    setErro(null)
    try {
      await api(`/api/v1/teams/${teamId}/guides/${id}/complete`, { method: 'POST' })
      recarregarTudo()
    } catch (e) {
      setErro(mensagem(e))
    }
  }

  const c = contadores.data
  const lista = pesquisa.data ? pesquisa.data.decisions : (decisoes.data ?? [])

  return (
    <div className="bj-conhecimento">
      {erro && (
        <p className="bj-erro" role="alert">
          {erro}
        </p>
      )}

      <div className="bj-conhecimento-barra">
        <input
          className="bj-eq-seletor bj-busca"
          type="search"
          placeholder="Buscar em decisões e guias"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        {/* contadores honestos: nunca métrica inventada (RF-5.2) */}
        <span className="bj-contadores">
          {c
            ? `${c.decisions} ${c.decisions === 1 ? 'decisão' : 'decisões'} · ${c.guides} ${
                c.guides === 1 ? 'guia' : 'guias'
              } · ${c.kitsOpen === 0 && c.kitsDone === 0 ? 'nenhum kit iniciado' : `${c.kitsOpen} kit(s) aberto(s)`}`
            : '—'}
        </span>
      </div>

      <div className="bj-conhecimento-corpo">
        <section className="bj-diario">
          <header className="bj-secao-head">
            <h3>Diário de decisões</h3>
            <select
              className="bj-eq-seletor"
              value={filtroArea}
              onChange={(e) => setFiltroArea(e.target.value as Area | '')}
              aria-label="Filtrar por área"
            >
              <option value="">Todas as áreas</option>
              {AREAS.map((a) => (
                <option key={a} value={a}>
                  {AREA_NOME[a]}
                </option>
              ))}
            </select>
          </header>

          <NovaDecisao teamId={teamId} onCriada={recarregarTudo} />

          {decisoes.estado === 'loading' && (
            <span className="bj-skeleton" style={{ height: 120 }} />
          )}
          {decisoes.estado === 'ok' && lista.length === 0 && (
            <div className="bj-vazio">
              <h4>O diário está vazio</h4>
              <p>
                Uma decisão é um fato datado: <i>escolhemos X e não Y, porque Z</i>. É o que a
                próxima geração vai procurar quando ninguém que participou estiver mais aqui.
              </p>
            </div>
          )}
          <ul className="bj-decisoes">
            {lista.map((d) => (
              <li key={d.id} className="bj-decisao">
                <div className="bj-decisao-topo">
                  <span className="bj-decisao-seq">nº {d.seq}</span>
                  <strong>{d.title}</strong>
                  <span className="bj-chip bj-chip-neutro">{AREA_NOME[d.area] ?? d.area}</span>
                  {d.supersededBySeq && (
                    <span className="bj-chip bj-chip-info">
                      substituída pela nº {d.supersededBySeq}
                    </span>
                  )}
                </div>
                {d.why && <p className="bj-decisao-why">{d.why}</p>}
                <div className="bj-decisao-pe">
                  <span>{dataCurta(d.createdAt)}</span>
                  {d.authorId === null && <span>ex-membro</span>}
                  {canManage && (
                    <button
                      type="button"
                      className="bj-link"
                      onClick={() => excluirDecisao(d.id)}
                      aria-label={`Excluir decisão nº ${d.seq}`}
                    >
                      <IconTrash size={16} /> Excluir
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>

        <aside className="bj-lateral">
          <section>
            <h3>Guias da equipe</h3>
            <NovoGuia teamId={teamId} onCriado={recarregarTudo} />
            {guias.estado === 'loading' && <span className="bj-skeleton" style={{ height: 80 }} />}
            <ul className="bj-guias">
              {(pesquisa.data ? pesquisa.data.guides : (guias.data ?? [])).map((g) => (
                <li key={g.id} className="bj-guia">
                  <div className="bj-guia-topo">
                    <strong>{g.title}</strong>
                    {g.kind !== 'guia' && (
                      <span className="bj-chip bj-chip-neutro">{g.kind.toUpperCase()}</span>
                    )}
                    {/* envelhecimento: 6 meses sem atualização derruba CON-4.2 */}
                    {g.stale && <StatusChip role="warn" />}
                    {!g.ownerId && <span className="bj-chip bj-chip-warn">SEM DONO</span>}
                  </div>
                  <div className="bj-guia-pe">
                    <span>atualizado em {dataCurta(g.updatedAt)}</span>
                    {(g.ownerId === meId || canManage) && (
                      <button type="button" className="bj-link" onClick={() => revisar(g.id)}>
                        Revisei, está válido
                      </button>
                    )}
                    {g.kind === 'trilha' && !g.completedByMe && (
                      <button
                        type="button"
                        className="bj-btn bj-btn-sm"
                        onClick={() => concluirTrilha(g.id)}
                      >
                        <IconCheck size={16} /> Concluí a trilha
                      </button>
                    )}
                    {g.kind === 'trilha' && g.completedByMe && (
                      <span className="bj-chip bj-chip-pass">TRILHA CONCLUÍDA</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h3>Kits de passagem</h3>
            <p className="bj-nota-credencial">
              Nunca guarde senha ou credencial em um kit. Registre onde a chave está, não a chave.
            </p>
            <NovoKit teamId={teamId} canManage={canManage} onCriado={recarregarTudo} />
            {kits.estado === 'ok' && (kits.data ?? []).length === 0 && (
              <p className="bj-vazio">
                Nenhum kit iniciado. Abra um quando alguém anunciar a saída — a data do kit É o
                registro dessa saída.
              </p>
            )}
            <ul className="bj-kits">
              {(kits.data ?? []).map((k) => (
                <li key={k.id} className="bj-kit">
                  <div className="bj-kit-topo">
                    <strong>{k.memberName}</strong>
                    {k.positionLabel && (
                      <span className="bj-chip bj-chip-neutro">{k.positionLabel}</span>
                    )}
                    {k.attention && <StatusChip role="warn" />}
                    {k.status === 'concluido' && <StatusChip role="pass" />}
                  </div>
                  <div className="bj-kit-pe">
                    <span>{k.progress}% do checklist</span>
                    {k.dueDate && <span>saída em {dataCurta(k.dueDate)}</span>}
                    <KitChecklist teamId={teamId} kit={k} onMudou={recarregarTudo} />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  )
}

function NovaDecisao({ teamId, onCriada }: { teamId: string; onCriada: () => void }) {
  const api = useSession((s) => s.api)
  const [aberto, setAberto] = useState(false)
  const [title, setTitle] = useState('')
  const [area, setArea] = useState<Area>('geral')
  const [why, setWhy] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  const salvar = async () => {
    setErro(null)
    try {
      await api(`/api/v1/teams/${teamId}/decisions`, {
        method: 'POST',
        body: JSON.stringify({ title: title.trim(), area, why: why.trim() }),
      })
      setTitle('')
      setWhy('')
      setAberto(false)
      onCriada()
    } catch (e) {
      setErro(mensagem(e))
    }
  }

  if (!aberto) {
    return (
      <button type="button" className="bj-btn bj-btn-primary" onClick={() => setAberto(true)}>
        <IconPlus size={16} /> Registrar decisão
      </button>
    )
  }

  return (
    <form
      className="bj-form"
      onSubmit={(e) => {
        e.preventDefault()
        void salvar()
      }}
    >
      <input
        className="bj-eq-seletor"
        placeholder="O que foi decidido"
        maxLength={120}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        required
      />
      <select
        className="bj-eq-seletor"
        value={area}
        onChange={(e) => setArea(e.target.value as Area)}
        aria-label="Área da decisão"
      >
        {AREAS.map((a) => (
          <option key={a} value={a}>
            {AREA_NOME[a]}
          </option>
        ))}
      </select>
      <textarea
        className="bj-eq-seletor bj-textarea"
        placeholder="Por quê? A alternativa descartada e a razão."
        maxLength={2000}
        value={why}
        onChange={(e) => setWhy(e.target.value)}
        required
      />
      {erro && <p className="bj-erro">{erro}</p>}
      <div className="bj-card-acoes">
        <button
          type="submit"
          className="bj-btn bj-btn-primary"
          disabled={!title.trim() || !why.trim()}
        >
          Registrar
        </button>
        <button type="button" className="bj-btn" onClick={() => setAberto(false)}>
          Cancelar
        </button>
      </div>
    </form>
  )
}

function NovoGuia({ teamId, onCriado }: { teamId: string; onCriado: () => void }) {
  const api = useSession((s) => s.api)
  const [aberto, setAberto] = useState(false)
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState<'guia' | 'trilha' | 'checklist'>('guia')
  const [bodyMd, setBodyMd] = useState('')
  const [tags, setTags] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  const salvar = async () => {
    setErro(null)
    try {
      await api(`/api/v1/teams/${teamId}/guides`, {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          kind,
          bodyMd,
          tags: tags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
        }),
      })
      setTitle('')
      setBodyMd('')
      setTags('')
      setAberto(false)
      onCriado()
    } catch (e) {
      setErro(mensagem(e))
    }
  }

  if (!aberto) {
    return (
      <button type="button" className="bj-btn bj-btn-sm" onClick={() => setAberto(true)}>
        <IconPlus size={16} /> Novo guia
      </button>
    )
  }

  return (
    <form
      className="bj-form"
      onSubmit={(e) => {
        e.preventDefault()
        void salvar()
      }}
    >
      <input
        className="bj-eq-seletor"
        placeholder="Como fazemos X"
        maxLength={120}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        required
      />
      <select
        className="bj-eq-seletor"
        value={kind}
        onChange={(e) => setKind(e.target.value as typeof kind)}
        aria-label="Tipo do documento"
      >
        <option value="guia">Guia</option>
        <option value="trilha">Trilha de integração (uma por equipe)</option>
        <option value="checklist">Checklist</option>
      </select>
      <textarea
        className="bj-eq-seletor bj-textarea"
        placeholder="Passo a passo, em markdown simples"
        maxLength={20000}
        value={bodyMd}
        onChange={(e) => setBodyMd(e.target.value)}
      />
      <input
        className="bj-eq-seletor"
        placeholder="Etiquetas separadas por vírgula (ex.: solda, freio)"
        value={tags}
        onChange={(e) => setTags(e.target.value)}
      />
      {erro && <p className="bj-erro">{erro}</p>}
      <div className="bj-card-acoes">
        <button type="submit" className="bj-btn bj-btn-primary" disabled={!title.trim()}>
          Publicar
        </button>
        <button type="button" className="bj-btn" onClick={() => setAberto(false)}>
          Cancelar
        </button>
      </div>
    </form>
  )
}

function NovoKit({
  teamId,
  canManage,
  onCriado,
}: {
  teamId: string
  canManage: boolean
  onCriado: () => void
}) {
  const api = useSession((s) => s.api)
  const meId = useSession((s) => s.user?.id ?? '')
  const meNome = useSession((s) => s.user?.displayName ?? '')
  const [aberto, setAberto] = useState(false)
  const [memberName, setMemberName] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  const salvar = async () => {
    setErro(null)
    try {
      await api(`/api/v1/teams/${teamId}/kits`, {
        method: 'POST',
        body: JSON.stringify({
          memberName: memberName.trim() || meNome,
          memberId: canManage ? null : meId,
          dueDate: dueDate || null,
        }),
      })
      setMemberName('')
      setDueDate('')
      setAberto(false)
      onCriado()
    } catch (e) {
      setErro(mensagem(e))
    }
  }

  if (!aberto) {
    return (
      <button type="button" className="bj-btn bj-btn-sm" onClick={() => setAberto(true)}>
        <IconPlus size={16} /> Abrir kit de passagem
      </button>
    )
  }

  return (
    <form
      className="bj-form"
      onSubmit={(e) => {
        e.preventDefault()
        void salvar()
      }}
    >
      <input
        className="bj-eq-seletor"
        placeholder="Quem sai"
        maxLength={120}
        value={memberName}
        onChange={(e) => setMemberName(e.target.value)}
      />
      <input
        className="bj-eq-seletor"
        type="date"
        value={dueDate}
        onChange={(e) => setDueDate(e.target.value)}
        aria-label="Data prevista de saída"
      />
      {erro && <p className="bj-erro">{erro}</p>}
      <div className="bj-card-acoes">
        <button type="submit" className="bj-btn bj-btn-primary">
          Abrir
        </button>
        <button type="button" className="bj-btn" onClick={() => setAberto(false)}>
          Cancelar
        </button>
      </div>
    </form>
  )
}

function KitChecklist({ teamId, kit, onMudou }: { teamId: string; kit: Kit; onMudou: () => void }) {
  const api = useSession((s) => s.api)
  const [aberto, setAberto] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const marcar = async (itemId: string, done: boolean) => {
    setErro(null)
    const checklist = kit.checklist.map((i) => (i.id === itemId ? { ...i, done } : i))
    try {
      await api(`/api/v1/teams/${teamId}/kits/${kit.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ checklist }),
      })
      onMudou()
    } catch (e) {
      setErro(mensagem(e))
    }
  }

  const concluir = async () => {
    setErro(null)
    try {
      await api(`/api/v1/teams/${teamId}/kits/${kit.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'concluido' }),
      })
      onMudou()
    } catch (e) {
      setErro(mensagem(e))
    }
  }

  if (kit.status === 'concluido') return null

  return (
    <>
      <button type="button" className="bj-link" onClick={() => setAberto((v) => !v)}>
        {aberto ? 'Fechar checklist' : 'Abrir checklist'}
      </button>
      {aberto && (
        <ul className="bj-kit-itens">
          {kit.checklist.map((i) => (
            <li key={i.id}>
              <label>
                <input
                  type="checkbox"
                  checked={i.done}
                  onChange={(e) => marcar(i.id, e.target.checked)}
                />
                {i.label}
              </label>
            </li>
          ))}
          <li>
            <button
              type="button"
              className="bj-btn bj-btn-sm bj-btn-primary"
              onClick={concluir}
              disabled={!kit.checklist.every((i) => i.done)}
            >
              Concluir a passagem
            </button>
          </li>
          {erro && <li className="bj-erro">{erro}</li>}
        </ul>
      )}
    </>
  )
}
