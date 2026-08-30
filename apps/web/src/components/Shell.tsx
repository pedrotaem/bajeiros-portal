import { useEffect, useRef, useState } from 'react'
import {
  IconAccount,
  IconChevronRight,
  IconHouse,
  IconSliders,
  IconTrophy,
  IconUsers,
  IconWrench,
} from '../icons/glyphs'
import { TOOL_PAGES, useSession, type PageId } from '../session'

/**
 * Shell de aplicação (design-system C-01) — o conteúdo de produto da fase 6 do plano
 * de design É o DF-12.
 *
 * REGRA DURA (ADR-009 dec. 4 / DF-12 P-1.1): o rail troca uma COLUNA DO GRID. Ele
 * não envolve, não remonta e não toca em `.main` — desmontar o `<Viewport>` perderia
 * a câmera, porque não existe estado de câmera no store para restaurar.
 */
interface Destino {
  page: PageId
  label: string
  Icon: (p: { size: 20 }) => JSX.Element
  /** Páginas que também acendem este item (Ferramentas abre editor e assistente). */
  alsoActive?: PageId[]
}

const DESTINOS: Destino[] = [
  { page: 'inicio', label: 'Início', Icon: IconHouse },
  { page: 'equipe', label: 'Equipe', Icon: IconUsers },
  { page: 'ferramentas', label: 'Ferramentas', Icon: IconWrench, alsoActive: TOOL_PAGES },
  { page: 'comunidade', label: 'Comunidade', Icon: IconTrophy },
]

/** Obrigação de interface do spec.md §1 — agora com posição fixa em TODA página. */
export const DISCLAIMER =
  'Apoio ao projeto — não substitui a inspeção oficial (B6.4). Sem vínculo com a organização da competição.'

export function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  const page = useSession((s) => s.page)
  const setPage = useSession((s) => s.setPage)
  const isAdmin = useSession((s) => s.user?.isAdmin === true)

  const ativo = (d: Destino) => page === d.page || (d.alsoActive?.includes(page) ?? false)

  return (
    <div className="bj-shell">
      <a className="bj-skip" href="#conteudo">
        Ir para o conteúdo
      </a>

      <nav className="bj-rail" aria-label="Seções">
        <div className="bj-rail-brand">
          <span className="bj-rail-brand-name">Bajeiros</span>
          <span className="bj-rail-brand-sub">portal das equipes</span>
        </div>
        <ul className="bj-rail-list">
          {DESTINOS.map((d) => (
            <li key={d.page}>
              <button
                type="button"
                className="bj-nav-item"
                aria-current={ativo(d) ? 'page' : undefined}
                onClick={() => setPage(d.page)}
              >
                <d.Icon size={20} />
                <span className="bj-nav-label">{d.label}</span>
              </button>
            </li>
          ))}
        </ul>

        <div className="bj-rail-foot">
          {isAdmin && (
            <button
              type="button"
              className="bj-nav-item"
              aria-current={page === 'admin' ? 'page' : undefined}
              onClick={() => setPage('admin')}
            >
              <IconSliders size={20} />
              <span className="bj-nav-label">Administração</span>
            </button>
          )}
          <ContaMenu />
        </div>
      </nav>

      <header className="bj-topbar">
        <h1 className="bj-page-title">{title}</h1>
        <p className="bj-disclaimer">{DISCLAIMER}</p>
      </header>

      <main id="conteudo" className="bj-content" tabIndex={-1}>
        {children}
      </main>
    </div>
  )
}

/**
 * Bloco do usuário no rodapé do rail. "Sobre o portal" mora AQUI, não no rail: o
 * glifo `info` é um dos cinco exclusivos de status (DS §8.7/CT-3) e o teto de 24
 * formas já fechou. Os mockups do canvas ainda mostram o item antigo — a spec corrige
 * (DF-12 §3.1).
 */
function ContaMenu() {
  const user = useSession((s) => s.user)
  const setPage = useSession((s) => s.setPage)
  const setPanel = useSession((s) => s.setPanel)
  const logout = useSession((s) => s.logout)
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const fechar = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    const escape = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', fechar)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('mousedown', fechar)
      document.removeEventListener('keydown', escape)
    }
  }, [open])

  if (!user) {
    return (
      <button type="button" className="bj-nav-item" onClick={() => setPanel('login')}>
        <IconAccount size={20} />
        <span className="bj-nav-label">Entrar ou criar conta</span>
      </button>
    )
  }

  return (
    <div className="bj-conta" ref={box}>
      <button
        type="button"
        className="bj-nav-item bj-conta-btn"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
      >
        <IconAccount size={20} />
        <span className="bj-nav-label bj-conta-nome">{user.displayName}</span>
        {/* o chevron gira porque `aria-expanded` existe — antes o caractere ▾ nunca girava */}
        <IconChevronRight size={16} />
      </button>
      {open && (
        <div className="bj-conta-menu" role="menu">
          <button role="menuitem" onClick={() => (setPanel('profile'), setOpen(false))}>
            Perfil
          </button>
          <button role="menuitem" onClick={() => (setPanel('projects'), setOpen(false))}>
            Meus projetos
          </button>
          <button role="menuitem" onClick={() => (setPage('sobre'), setOpen(false))}>
            Sobre o portal
          </button>
          <button role="menuitem" onClick={() => (logout(), setOpen(false))}>
            Sair
          </button>
        </div>
      )}
    </div>
  )
}
