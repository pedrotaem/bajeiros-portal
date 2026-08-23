import { useState } from 'react'
import { useSession, ApiError } from '../session'
import { useStore } from '../store'

// Área de conta na topbar: login (dev), chip do projeto atual + salvar, menu do usuário.
export function AccountMenu() {
  const { user, currentProject, setPanel, setPage, page, logout, api, setCurrentProject } =
    useSession()
  const [menuOpen, setMenuOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)

  const say = (msg: string) => {
    setFlash(msg)
    setTimeout(() => setFlash(null), 4000)
  }

  const save = async () => {
    if (!currentProject) return
    setSaving(true)
    try {
      const cage = useStore.getState().cage
      const r = await api<{ seq: number; rulesFailCount: number }>(
        `/api/v1/projects/${currentProject.id}/snapshots`,
        { method: 'POST', body: JSON.stringify({ cage, expectedSeq: currentProject.seq }) },
      )
      setCurrentProject({ ...currentProject, seq: r.seq })
      say(
        r.rulesFailCount
          ? `v${r.seq} salva — ${r.rulesFailCount} infração(ões)`
          : `v${r.seq} salva — 0 infrações`,
      )
    } catch (e) {
      if (e instanceof ApiError && e.problem.status === 409) {
        say(`Conflito: já existe v${e.problem.currentSeq}. Abra "Projetos" p/ revisar.`)
      } else if (e instanceof ApiError) {
        say(e.problem.detail ?? e.problem.title)
      } else {
        say('Falha ao salvar — API local rodando?')
      }
    } finally {
      setSaving(false)
    }
  }

  if (!user) {
    return (
      <div className="account">
        {flash && <span className="account-flash">{flash}</span>}
        <button
          className={page === 'assistant' ? 'account-btn page-active' : 'account-btn'}
          onClick={() => setPage(page === 'assistant' ? 'editor' : 'assistant')}
        >
          Assistente
        </button>
        <button className="account-btn" onClick={() => setPanel('login')}>
          Entrar
        </button>
      </div>
    )
  }

  return (
    <div className="account">
      {flash && <span className="account-flash">{flash}</span>}
      {currentProject && (
        <>
          <span className="project-chip" title="Projeto aberto">
            {currentProject.name} · v{currentProject.seq}
          </span>
          <button className="account-btn primary" disabled={saving} onClick={save}>
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </>
      )}
      <button className="account-btn" onClick={() => setPanel('projects')}>
        Projetos
      </button>
      <button
        className={page === 'assistant' ? 'account-btn page-active' : 'account-btn'}
        onClick={() => setPage(page === 'assistant' ? 'editor' : 'assistant')}
      >
        Assistente
      </button>
      <button className="account-btn" onClick={() => setPanel('teams')}>
        Equipes
      </button>
      {user.isAdmin && (
        <button
          className={page === 'admin' ? 'account-btn page-active' : 'account-btn'}
          onClick={() => setPage(page === 'admin' ? 'editor' : 'admin')}
        >
          Admin
        </button>
      )}
      <div className="account-user">
        <button className="account-btn" onClick={() => setMenuOpen((v) => !v)}>
          {user.displayName} ▾
        </button>
        {menuOpen && (
          <div className="account-dropdown" onMouseLeave={() => setMenuOpen(false)}>
            <button
              onClick={() => {
                setMenuOpen(false)
                setPanel('profile')
              }}
            >
              Perfil e privacidade
            </button>
            <button
              onClick={() => {
                setMenuOpen(false)
                logout()
              }}
            >
              Sair
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
