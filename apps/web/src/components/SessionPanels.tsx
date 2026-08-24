import { useEffect, useState, type FormEvent } from 'react'
import { useSession, ApiError, type UserInfo } from '../session'
import { useStore } from '../store'
import type { Cage } from '@bajeiros/core/model/types'

// Modais de sessão: login (dev), perfil/privacidade (LGPD), projetos/versões.
export function SessionPanels() {
  const panel = useSession((s) => s.panel)
  if (!panel) return null
  return (
    <div className="modal-overlay" onClick={() => useSession.getState().setPanel(null)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {panel === 'login' && <LoginPanel />}
        {panel === 'profile' && <ProfilePanel />}
        {panel === 'projects' && <ProjectsPanel />}
      </div>
    </div>
  )
}

function useErr(): [string | null, (e: unknown) => void, () => void] {
  const [err, setErr] = useState<string | null>(null)
  return [
    err,
    (e) =>
      setErr(
        e instanceof ApiError
          ? (e.problem.detail ?? e.problem.title)
          : 'Erro de rede — API local rodando? (npm run db:start + npm run dev -w @bajeiros/api)',
      ),
    () => setErr(null),
  ]
}

function Head({ title }: { title: string }) {
  const setPanel = useSession((s) => s.setPanel)
  return (
    <div className="modal-head">
      <span>{title}</span>
      <button className="collapse-btn" onClick={() => setPanel(null)}>
        ✕
      </button>
    </div>
  )
}

// ---------- Login (dev issuer) ----------

function LoginPanel() {
  const login = useSession((s) => s.login)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, fail, clear] = useErr()

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    clear()
    setBusy(true)
    try {
      await login(email.trim(), name.trim())
    } catch (e2) {
      fail(e2)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Head title="Entrar" />
      <form className="modal-body" onSubmit={submit}>
        <p className="modal-note">
          Ambiente de desenvolvimento: informe e-mail e nome — a conta é criada/reaberta na hora
          (sem senha). Login real (Cognito) entra na fase 12.
        </p>
        <label className="field">
          E-mail
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="voce@universidade.br"
          />
        </label>
        <label className="field">
          Nome
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Como te chamamos"
          />
        </label>
        {err && <p className="modal-err">{err}</p>}
        <button className="account-btn primary" disabled={busy} type="submit">
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
        <p className="modal-note">
          Ao entrar você concorda com o uso dos dados necessários à prestação do serviço (LGPD art.
          7º, V). Comunicações opcionais são controladas em Perfil e privacidade.
        </p>
      </form>
    </>
  )
}

// ---------- Perfil + privacidade ----------

interface Consent {
  purpose: string
  granted: boolean
  occurred_at: string
}

const PURPOSE_LABELS: Record<string, string> = {
  marketing_email: 'Receber novidades por e-mail',
  analytics: 'Permitir métricas de uso anônimas',
}

function ProfilePanel() {
  const { user, api, setUser, logout } = useSession()
  const [displayName, setDisplayName] = useState(user?.displayName ?? '')
  const [university, setUniversity] = useState(user?.university ?? '')
  const [consents, setConsents] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState(false)
  const [err, fail, clear] = useErr()
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    api<Consent[]>('/api/v1/me/consents')
      .then((list) => {
        const latest: Record<string, boolean> = {}
        for (const c of [...list].reverse()) latest[c.purpose] = c.granted
        setConsents(latest)
      })
      .catch(() => {})
  }, [api])

  const saveProfile = async () => {
    clear()
    setBusy(true)
    try {
      const u = await api<UserInfo>('/api/v1/me', {
        method: 'PATCH',
        body: JSON.stringify({ displayName, university: university || null }),
      })
      setUser(u)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e) {
      fail(e)
    } finally {
      setBusy(false)
    }
  }

  const toggleConsent = async (purpose: string) => {
    const granted = !consents[purpose]
    setConsents((c) => ({ ...c, [purpose]: granted }))
    try {
      await api('/api/v1/me/consents', {
        method: 'POST',
        body: JSON.stringify({ purpose, granted, termVersion: 'v1' }),
      })
    } catch (e) {
      setConsents((c) => ({ ...c, [purpose]: !granted }))
      fail(e)
    }
  }

  const exportData = async () => {
    clear()
    try {
      const data = await api('/api/v1/me/export')
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = 'bajeiros-meus-dados.json'
      a.click()
      URL.revokeObjectURL(a.href)
    } catch (e) {
      fail(e)
    }
  }

  const deleteAccount = async () => {
    if (
      !window.confirm('Excluir sua conta? Seus dados serão removidos definitivamente em 30 dias.')
    )
      return
    try {
      await api('/api/v1/me', { method: 'DELETE' })
      logout()
    } catch (e) {
      fail(e)
    }
  }

  return (
    <>
      <Head title="Perfil e privacidade" />
      <div className="modal-body">
        <label className="field">
          Nome
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </label>
        <label className="field">
          Universidade (opcional)
          <input value={university} onChange={(e) => setUniversity(e.target.value)} />
        </label>
        <button className="account-btn primary" disabled={busy} onClick={saveProfile}>
          {saved ? 'Salvo ✓' : 'Salvar perfil'}
        </button>

        <div className="modal-section">Comunicações e dados (opcional)</div>
        {Object.entries(PURPOSE_LABELS).map(([purpose, label]) => (
          <label key={purpose} className="check-field">
            <input
              type="checkbox"
              checked={consents[purpose] ?? false}
              onChange={() => toggleConsent(purpose)}
            />
            {label}
          </label>
        ))}

        <div className="modal-section">Seus direitos (LGPD)</div>
        <div className="modal-row">
          <button className="account-btn" onClick={exportData}>
            Baixar meus dados
          </button>
          <button className="account-btn danger" onClick={deleteAccount}>
            Excluir conta
          </button>
        </div>
        {err && <p className="modal-err">{err}</p>}
      </div>
    </>
  )
}

// ---------- Projetos ----------

interface ProjectRow {
  id: string
  name: string
  description: string | null
  lastSeq?: number
  updatedAt: string
}

interface SnapshotRow {
  id: string
  seq: number
  created_at: string
}

function ProjectsPanel() {
  const { api, setPanel, currentProject, setCurrentProject } = useSession()
  const [projects, setProjects] = useState<ProjectRow[] | null>(null)
  const [newName, setNewName] = useState('')
  const [versionsOf, setVersionsOf] = useState<ProjectRow | null>(null)
  const [versions, setVersions] = useState<SnapshotRow[]>([])
  const [err, fail, clear] = useErr()

  const reload = () => {
    api<ProjectRow[]>('/api/v1/projects').then(setProjects).catch(fail)
  }
  useEffect(reload, [api]) // eslint-disable-line react-hooks/exhaustive-deps

  const createProject = async (e: FormEvent) => {
    e.preventDefault()
    clear()
    try {
      await api('/api/v1/projects', { method: 'POST', body: JSON.stringify({ name: newName }) })
      setNewName('')
      reload()
    } catch (e2) {
      fail(e2)
    }
  }

  const openProject = async (p: ProjectRow, seq?: number) => {
    clear()
    try {
      const last = seq ?? p.lastSeq ?? 0
      if (last > 0) {
        const snap = await api<{ cage_json: Cage; seq: number }>(
          `/api/v1/projects/${p.id}/snapshots/${last}`,
        )
        useStore.getState().loadCage(snap.cage_json)
      }
      setCurrentProject({ id: p.id, name: p.name, seq: p.lastSeq ?? 0 })
      setPanel(null)
    } catch (e2) {
      fail(e2)
    }
  }

  const removeProject = async (p: ProjectRow) => {
    if (!window.confirm(`Excluir o projeto "${p.name}" e todas as versões?`)) return
    try {
      await api(`/api/v1/projects/${p.id}`, { method: 'DELETE' })
      if (currentProject?.id === p.id) setCurrentProject(null)
      reload()
    } catch (e2) {
      fail(e2)
    }
  }

  const showVersions = async (p: ProjectRow) => {
    clear()
    try {
      setVersions(await api<SnapshotRow[]>(`/api/v1/projects/${p.id}/snapshots`))
      setVersionsOf(p)
    } catch (e2) {
      fail(e2)
    }
  }

  if (versionsOf) {
    return (
      <>
        <Head title={`Versões — ${versionsOf.name}`} />
        <div className="modal-body">
          <button className="account-btn" onClick={() => setVersionsOf(null)}>
            ← Voltar
          </button>
          {versions.length === 0 && <p className="modal-note">Nenhuma versão salva ainda.</p>}
          <ul className="project-list">
            {versions.map((v) => (
              <li key={v.id}>
                <span>
                  v{v.seq} · {new Date(v.created_at).toLocaleString('pt-BR')}
                </span>
                <span className="modal-row">
                  <button className="account-btn" onClick={() => openProject(versionsOf, v.seq)}>
                    Abrir no editor
                  </button>
                </span>
              </li>
            ))}
          </ul>
          {err && <p className="modal-err">{err}</p>}
        </div>
      </>
    )
  }

  return (
    <>
      <Head title="Meus projetos" />
      <div className="modal-body">
        <p className="modal-note">
          Um projeto é um carro: guarda as versões da gaiola. Plano free: 2 projetos, 10 versões
          cada.
        </p>
        <form className="modal-row" onSubmit={createProject}>
          <input
            required
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nome do novo projeto (ex.: MBF-30 2027)"
          />
          <button className="account-btn primary" type="submit">
            Criar
          </button>
        </form>
        {projects === null && <p className="modal-note">Carregando…</p>}
        {projects?.length === 0 && <p className="modal-note">Nenhum projeto ainda.</p>}
        <ul className="project-list">
          {projects?.map((p) => (
            <li key={p.id} className={currentProject?.id === p.id ? 'current' : ''}>
              <span>
                <b>{p.name}</b>
                <small>
                  {p.lastSeq ? ` v${p.lastSeq}` : ' sem versões'} ·{' '}
                  {new Date(p.updatedAt).toLocaleDateString('pt-BR')}
                </small>
              </span>
              <span className="modal-row">
                <button className="account-btn" onClick={() => openProject(p)}>
                  Abrir
                </button>
                <button className="account-btn" onClick={() => showVersions(p)}>
                  Versões
                </button>
                <button className="account-btn danger" onClick={() => removeProject(p)}>
                  Excluir
                </button>
              </span>
            </li>
          ))}
        </ul>
        {err && <p className="modal-err">{err}</p>}
      </div>
    </>
  )
}
