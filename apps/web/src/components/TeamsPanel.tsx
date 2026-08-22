import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useSession, ApiError } from '../session'

// Painel de equipes (fase 14): criar, membros/papéis, convites por link copiável,
// trazer projeto pessoal p/ a equipe. RBAC de verdade é do backend — aqui só
// escondemos ações que o papel não permite.

interface TeamRow {
  id: string
  name: string
  university: string | null
  myRole: 'owner' | 'admin' | 'member'
  memberCount: number
}

interface TeamDetail extends TeamRow {
  members: { userId: string; displayName: string; email: string; role: string; joinedAt: string }[]
  pendingInvites: { id: string; email: string; expiresAt: string }[]
}

interface ProjectRow {
  id: string
  name: string
  ownerUserId: string | null
  ownerTeamId: string | null
}

const ROLE_LABELS: Record<string, string> = {
  owner: 'dono(a)',
  admin: 'admin',
  member: 'membro',
}

const RANK: Record<string, number> = { owner: 3, admin: 2, member: 1 }

function useErr(): [string | null, (e: unknown) => void, () => void] {
  const [err, setErr] = useState<string | null>(null)
  return [
    err,
    (e) =>
      setErr(
        e instanceof ApiError
          ? (e.problem.detail ?? e.problem.title)
          : 'Erro de rede — API local rodando?',
      ),
    () => setErr(null),
  ]
}

export function TeamsPanel({ Head }: { Head: (p: { title: string }) => JSX.Element }) {
  const { api, user, inviteNotice, clearInviteNotice } = useSession()
  const [teams, setTeams] = useState<TeamRow[] | null>(null)
  const [open, setOpen] = useState<TeamDetail | null>(null)
  const [newName, setNewName] = useState('')
  const [err, fail, clear] = useErr()

  const reload = useCallback(() => {
    api<TeamRow[]>('/api/v1/teams').then(setTeams).catch(fail)
  }, [api]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(reload, [reload])

  const openTeam = async (id: string) => {
    clear()
    try {
      setOpen(await api<TeamDetail>(`/api/v1/teams/${id}`))
    } catch (e) {
      fail(e)
    }
  }

  const createTeam = async (e: FormEvent) => {
    e.preventDefault()
    clear()
    try {
      const t = await api<TeamRow>('/api/v1/teams', {
        method: 'POST',
        body: JSON.stringify({ name: newName }),
      })
      setNewName('')
      reload()
      openTeam(t.id)
    } catch (e2) {
      fail(e2)
    }
  }

  if (open) {
    return (
      <TeamDetailView
        Head={Head}
        team={open}
        meId={user?.id ?? ''}
        onBack={() => {
          setOpen(null)
          reload()
        }}
        refresh={() => openTeam(open.id)}
      />
    )
  }

  return (
    <>
      <Head title="Equipes" />
      <div className="modal-body">
        {inviteNotice && (
          <p className="modal-note" onClick={clearInviteNotice}>
            {inviteNotice}
          </p>
        )}
        <p className="modal-note">
          Uma equipe compartilha projetos entre os membros. Convide colegas por link — o convite
          vale só p/ o e-mail convidado e expira em 7 dias.
        </p>
        <form className="modal-row" onSubmit={createTeam}>
          <input
            required
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nome da equipe (ex.: MBF Racing)"
          />
          <button className="account-btn primary" type="submit">
            Criar
          </button>
        </form>
        {teams === null && <p className="modal-note">Carregando…</p>}
        {teams?.length === 0 && <p className="modal-note">Você ainda não participa de equipes.</p>}
        <ul className="project-list">
          {teams?.map((t) => (
            <li key={t.id}>
              <span>
                <b>{t.name}</b>
                <small>
                  {' '}
                  · {ROLE_LABELS[t.myRole] ?? t.myRole} · {t.memberCount} membro(s)
                </small>
              </span>
              <button className="account-btn" onClick={() => openTeam(t.id)}>
                Abrir
              </button>
            </li>
          ))}
        </ul>
        {err && <p className="modal-err">{err}</p>}
      </div>
    </>
  )
}

function TeamDetailView({
  Head,
  team,
  meId,
  onBack,
  refresh,
}: {
  Head: (p: { title: string }) => JSX.Element
  team: TeamDetail
  meId: string
  onBack: () => void
  refresh: () => void
}) {
  const { api } = useSession()
  const [inviteEmail, setInviteEmail] = useState('')
  const [lastLink, setLastLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [personal, setPersonal] = useState<ProjectRow[]>([])
  const [transferId, setTransferId] = useState('')
  const [err, fail, clear] = useErr()

  const canInvite = team.myRole !== 'member'
  const canRoles = team.myRole === 'owner'

  useEffect(() => {
    api<ProjectRow[]>('/api/v1/projects')
      .then((list) => setPersonal(list.filter((p) => p.ownerUserId === meId)))
      .catch(() => {})
  }, [api, meId])

  const sendInvite = async (e: FormEvent) => {
    e.preventDefault()
    clear()
    setCopied(false)
    try {
      const r = await api<{ token: string }>(`/api/v1/teams/${team.id}/invites`, {
        method: 'POST',
        body: JSON.stringify({ email: inviteEmail.trim() }),
      })
      const link = `${window.location.origin}${window.location.pathname}#convite=${r.token}`
      setLastLink(link)
      setInviteEmail('')
      try {
        await navigator.clipboard.writeText(link)
        setCopied(true)
      } catch {
        /* clipboard pode ser negado — o link fica visível p/ copiar na mão */
      }
      refresh()
    } catch (e2) {
      fail(e2)
    }
  }

  const revoke = async (inviteId: string) => {
    clear()
    try {
      await api(`/api/v1/teams/${team.id}/invites/${inviteId}`, { method: 'DELETE' })
      refresh()
    } catch (e) {
      fail(e)
    }
  }

  const removeMember = async (userId: string, name: string) => {
    const self = userId === meId
    if (!window.confirm(self ? 'Sair desta equipe?' : `Remover ${name} da equipe?`)) return
    clear()
    try {
      await api(`/api/v1/teams/${team.id}/members/${userId}`, { method: 'DELETE' })
      if (self) onBack()
      else refresh()
    } catch (e) {
      fail(e)
    }
  }

  const changeRole = async (userId: string, role: string) => {
    clear()
    try {
      await api(`/api/v1/teams/${team.id}/members/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      })
      refresh()
    } catch (e) {
      fail(e)
    }
  }

  const transfer = async (e: FormEvent) => {
    e.preventDefault()
    if (!transferId) return
    clear()
    try {
      await api(`/api/v1/projects/${transferId}/transfer`, {
        method: 'POST',
        body: JSON.stringify({ teamId: team.id }),
      })
      setTransferId('')
      setPersonal((list) => list.filter((p) => p.id !== transferId))
    } catch (e2) {
      fail(e2)
    }
  }

  return (
    <>
      <Head title={`Equipe — ${team.name}`} />
      <div className="modal-body">
        <button className="account-btn" onClick={onBack}>
          ← Voltar
        </button>

        <div className="modal-section">Membros</div>
        <ul className="project-list">
          {team.members.map((m) => {
            const self = m.userId === meId
            const removable = self || RANK[team.myRole] > RANK[m.role]
            return (
              <li key={m.userId}>
                <span>
                  <b>{m.displayName}</b>
                  <small> · {m.email}</small>
                </span>
                <span className="modal-row">
                  {canRoles ? (
                    <select value={m.role} onChange={(e) => changeRole(m.userId, e.target.value)}>
                      <option value="owner">dono(a)</option>
                      <option value="admin">admin</option>
                      <option value="member">membro</option>
                    </select>
                  ) : (
                    <small>{ROLE_LABELS[m.role] ?? m.role}</small>
                  )}
                  {removable && (
                    <button
                      className="account-btn danger"
                      onClick={() => removeMember(m.userId, m.displayName)}
                    >
                      {self ? 'Sair' : 'Remover'}
                    </button>
                  )}
                </span>
              </li>
            )
          })}
        </ul>

        {canInvite && (
          <>
            <div className="modal-section">Convidar</div>
            <form className="modal-row" onSubmit={sendInvite}>
              <input
                type="email"
                required
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="e-mail do(a) colega"
              />
              <button className="account-btn primary" type="submit">
                Gerar link
              </button>
            </form>
            {lastLink && (
              <p className="modal-note">
                {copied ? 'Link copiado! ' : ''}Envie este link (vale 7 dias, só p/ o e-mail
                convidado): <code>{lastLink}</code>
              </p>
            )}
            {team.pendingInvites.length > 0 && (
              <ul className="project-list">
                {team.pendingInvites.map((i) => (
                  <li key={i.id}>
                    <span>
                      {i.email}
                      <small> · expira {new Date(i.expiresAt).toLocaleDateString('pt-BR')}</small>
                    </span>
                    <button className="account-btn danger" onClick={() => revoke(i.id)}>
                      Revogar
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {personal.length > 0 && (
          <>
            <div className="modal-section">Trazer projeto p/ a equipe</div>
            <form className="modal-row" onSubmit={transfer}>
              <select value={transferId} onChange={(e) => setTransferId(e.target.value)}>
                <option value="">Escolha um projeto pessoal…</option>
                {personal.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <button className="account-btn" type="submit" disabled={!transferId}>
                Transferir
              </button>
            </form>
            <p className="modal-note">
              Depois de transferir, o projeto passa a ser da equipe — todos os membros veem e salvam
              versões.
            </p>
          </>
        )}
        {err && <p className="modal-err">{err}</p>}
      </div>
    </>
  )
}
