import { Fragment, useCallback, useEffect, useState } from 'react'
import { useSession, ApiError } from '../session'

// DF-9 — painel administrativo (users.is_admin). O backend é a autoridade:
// aqui só renderizamos; não-admin recebe 403 e mensagem.

type Tab = 'overview' | 'users' | 'teams' | 'activity' | 'assistant'

interface Overview {
  usersActive: number
  usersDeleted: number
  teams: number
  projects: number
  accesses24h: number
  assistant24h: number
  assistantTokens30d: number
}

interface AdminUser {
  id: string
  email: string
  displayName: string
  university: string | null
  createdAt: string
  deletedAt: string | null
  isAdmin: boolean
  lastLoginAt: string | null
  projectCount: number
  teams: { teamId: string; name: string; role: string }[]
}

interface AdminTeam {
  id: string
  name: string
  university: string | null
  createdAt: string
  projectCount: number
  members: { userId: string; displayName: string; email: string; role: string; joinedAt: string }[]
}

interface AccessRow {
  id: string
  userId: string
  email: string
  method: string
  route: string
  path: string
  status: number | null
  durationMs: number | null
  occurredAt: string
}

interface AssistantRow {
  id: string
  userId: string
  email: string
  question: string
  answer: string | null
  status: string
  model: string | null
  corpusVersion: string | null
  inputTokens: number | null
  outputTokens: number | null
  cacheReadTokens: number | null
  durationMs: number | null
  occurredAt: string
}

const PAGE = 50

function when(ts: string | null): string {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

export function AdminPanel({ Head }: { Head: (p: { title: string }) => JSX.Element }) {
  const api = useSession((s) => s.api)
  const [tab, setTab] = useState<Tab>('overview')
  const [err, setErr] = useState<string | null>(null)
  const [userFilter, setUserFilter] = useState<{ id: string; email: string } | null>(null)

  const fail = (e: unknown) =>
    setErr(
      e instanceof ApiError
        ? (e.problem.detail ?? e.problem.title)
        : 'Erro de rede — API local rodando?',
    )

  return (
    <div className="admin-panel">
      <Head title="Administração" />
      <div className="admin-tabs">
        {(
          [
            ['overview', 'Visão geral'],
            ['users', 'Usuários'],
            ['teams', 'Equipes'],
            ['activity', 'Atividade'],
            ['assistant', 'Chat IA'],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            className={tab === id ? 'toggle active' : 'toggle'}
            onClick={() => {
              setErr(null)
              setTab(id)
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {err && <p className="modal-err">{err}</p>}
      {userFilter && (tab === 'activity' || tab === 'assistant') && (
        <p className="admin-filter">
          Filtrando por {userFilter.email}{' '}
          <button className="disclaimer-link" onClick={() => setUserFilter(null)}>
            limpar
          </button>
        </p>
      )}
      {tab === 'overview' && <OverviewTab api={api} fail={fail} />}
      {tab === 'users' && (
        <UsersTab
          api={api}
          fail={fail}
          onActivity={(u) => {
            setUserFilter(u)
            setTab('activity')
          }}
          onAssistant={(u) => {
            setUserFilter(u)
            setTab('assistant')
          }}
        />
      )}
      {tab === 'teams' && <TeamsTab api={api} fail={fail} />}
      {tab === 'activity' && <ActivityTab api={api} fail={fail} userId={userFilter?.id} />}
      {tab === 'assistant' && <AssistantTab api={api} fail={fail} userId={userFilter?.id} />}
    </div>
  )
}

type Api = ReturnType<typeof useSession.getState>['api']

function usePaged<T>(api: Api, fail: (e: unknown) => void, url: string) {
  const [rows, setRows] = useState<T[] | null>(null)
  const [offset, setOffset] = useState(0)
  const [more, setMore] = useState(false)
  const load = useCallback(
    (off: number) => {
      api<T[]>(`${url}${url.includes('?') ? '&' : '?'}limit=${PAGE}&offset=${off}`)
        .then((r) => {
          setRows(r)
          setOffset(off)
          setMore(r.length === PAGE)
        })
        .catch(fail)
    },
    [api, url], // eslint-disable-line react-hooks/exhaustive-deps
  )
  useEffect(() => load(0), [load])
  return { rows, offset, more, load }
}

function Pager({
  offset,
  more,
  load,
}: {
  offset: number
  more: boolean
  load: (off: number) => void
}) {
  if (offset === 0 && !more) return null
  return (
    <div className="admin-pager">
      <button
        className="account-btn"
        disabled={offset === 0}
        onClick={() => load(Math.max(0, offset - PAGE))}
      >
        ← Anteriores
      </button>
      <button className="account-btn" disabled={!more} onClick={() => load(offset + PAGE)}>
        Próximos →
      </button>
    </div>
  )
}

function OverviewTab({ api, fail }: { api: Api; fail: (e: unknown) => void }) {
  const [data, setData] = useState<Overview | null>(null)
  useEffect(() => {
    api<Overview>('/api/v1/admin/overview').then(setData).catch(fail)
  }, [api]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!data) return <p>Carregando…</p>
  const items: [string, string | number][] = [
    ['Usuários ativos', data.usersActive],
    ['Contas excluídas', data.usersDeleted],
    ['Equipes', data.teams],
    ['Projetos', data.projects],
    ['Acessos (24 h)', data.accesses24h],
    ['Msgs de chat (24 h)', data.assistant24h],
    ['Tokens de chat (30 d)', data.assistantTokens30d.toLocaleString('pt-BR')],
  ]
  return (
    <div className="admin-cards">
      {items.map(([label, value]) => (
        <div key={label} className="admin-card">
          <b>{value}</b>
          <span>{label}</span>
        </div>
      ))}
    </div>
  )
}

function UsersTab({
  api,
  fail,
  onActivity,
  onAssistant,
}: {
  api: Api
  fail: (e: unknown) => void
  onActivity: (u: { id: string; email: string }) => void
  onAssistant: (u: { id: string; email: string }) => void
}) {
  const [q, setQ] = useState('')
  const [query, setQuery] = useState('')
  const { rows, offset, more, load } = usePaged<AdminUser>(
    api,
    fail,
    `/api/v1/admin/users?q=${encodeURIComponent(query)}`,
  )
  return (
    <>
      <form
        className="admin-search"
        onSubmit={(e) => {
          e.preventDefault()
          setQuery(q)
        }}
      >
        <input
          placeholder="Buscar por e-mail ou nome…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button className="account-btn">Buscar</button>
      </form>
      {!rows ? (
        <p>Carregando…</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Usuário</th>
                <th>Equipes</th>
                <th>Projetos</th>
                <th>Último login</th>
                <th>Criado</th>
                <th>Ver</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id} className={u.deletedAt ? 'admin-deleted' : undefined}>
                  <td>
                    <b>{u.displayName}</b>
                    {u.isAdmin && <span className="admin-chip">admin</span>}
                    {u.deletedAt && <span className="admin-chip bad">excluída</span>}
                    <br />
                    <span className="admin-dim">{u.email}</span>
                    {u.university && <span className="admin-dim"> · {u.university}</span>}
                  </td>
                  <td>
                    {u.teams.length ? u.teams.map((t) => `${t.name} (${t.role})`).join(', ') : '—'}
                  </td>
                  <td>{u.projectCount}</td>
                  <td>{when(u.lastLoginAt)}</td>
                  <td>{when(u.createdAt)}</td>
                  <td>
                    <button
                      className="disclaimer-link"
                      onClick={() => onActivity({ id: u.id, email: u.email })}
                    >
                      atividade
                    </button>{' '}
                    <button
                      className="disclaimer-link"
                      onClick={() => onAssistant({ id: u.id, email: u.email })}
                    >
                      chat
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6}>Nenhum usuário encontrado.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <Pager offset={offset} more={more} load={load} />
    </>
  )
}

function TeamsTab({ api, fail }: { api: Api; fail: (e: unknown) => void }) {
  const { rows, offset, more, load } = usePaged<AdminTeam>(api, fail, '/api/v1/admin/teams')
  if (!rows) return <p>Carregando…</p>
  return (
    <>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Equipe</th>
              <th>Membros</th>
              <th>Projetos</th>
              <th>Criada</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id}>
                <td>
                  <b>{t.name}</b>
                  {t.university && <span className="admin-dim"> · {t.university}</span>}
                </td>
                <td>
                  {t.members.map((m) => (
                    <div key={m.userId}>
                      {m.displayName}{' '}
                      <span className="admin-dim">
                        ({m.role} · {m.email})
                      </span>
                    </div>
                  ))}
                </td>
                <td>{t.projectCount}</td>
                <td>{when(t.createdAt)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4}>Nenhuma equipe.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Pager offset={offset} more={more} load={load} />
    </>
  )
}

function ActivityTab({
  api,
  fail,
  userId,
}: {
  api: Api
  fail: (e: unknown) => void
  userId?: string
}) {
  const { rows, offset, more, load } = usePaged<AccessRow>(
    api,
    fail,
    `/api/v1/admin/activity${userId ? `?userId=${userId}` : ''}`,
  )
  if (!rows) return <p>Carregando…</p>
  return (
    <>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Quando</th>
              <th>Usuário</th>
              <th>Ação</th>
              <th>Status</th>
              <th>ms</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id}>
                <td>{when(a.occurredAt)}</td>
                <td className="admin-dim">{a.email}</td>
                <td>
                  <code>
                    {a.method} {a.method === 'PAGE' ? a.route : a.path}
                  </code>
                </td>
                <td>{a.status ?? '—'}</td>
                <td>{a.durationMs ?? '—'}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5}>Sem registros ainda.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Pager offset={offset} more={more} load={load} />
    </>
  )
}

function AssistantTab({
  api,
  fail,
  userId,
}: {
  api: Api
  fail: (e: unknown) => void
  userId?: string
}) {
  const { rows, offset, more, load } = usePaged<AssistantRow>(
    api,
    fail,
    `/api/v1/admin/assistant${userId ? `?userId=${userId}` : ''}`,
  )
  const [open, setOpen] = useState<string | null>(null)
  if (!rows) return <p>Carregando…</p>
  return (
    <>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Quando</th>
              <th>Usuário</th>
              <th>Pergunta</th>
              <th>Tokens (in/out)</th>
              <th>ms</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <Fragment key={s.id}>
                <tr
                  className="admin-row-click"
                  onClick={() => setOpen(open === s.id ? null : s.id)}
                >
                  <td>{when(s.occurredAt)}</td>
                  <td className="admin-dim">{s.email}</td>
                  <td>{s.question.length > 80 ? s.question.slice(0, 80) + '…' : s.question}</td>
                  <td>
                    {s.inputTokens ?? '—'}/{s.outputTokens ?? '—'}
                    {s.cacheReadTokens ? (
                      <span className="admin-dim"> (cache {s.cacheReadTokens})</span>
                    ) : null}
                  </td>
                  <td>{s.durationMs ?? '—'}</td>
                  <td>{s.status}</td>
                </tr>
                {open === s.id && (
                  <tr>
                    <td colSpan={6} className="admin-detail">
                      <p>
                        <b>Pergunta:</b> {s.question}
                      </p>
                      <p>
                        <b>Resposta:</b> {s.answer ?? '—'}
                      </p>
                      <p className="admin-dim">
                        {s.model ?? '—'} · {s.corpusVersion ?? '—'}
                      </p>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6}>Sem uso do chat ainda (a feature de chat chega com o DF-8).</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Pager offset={offset} more={more} load={load} />
    </>
  )
}
