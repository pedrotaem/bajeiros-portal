import { useEffect, useRef, useState } from 'react'
import {
  IconAccount,
  IconChevronRight,
  IconChevronsRight,
  IconHouse,
  IconSliders,
  IconTrophy,
  IconUsers,
  IconWrench,
} from '../icons/glyphs'
import { MarkAssistant, MarkCage } from '../icons/marks'
import { TOOL_PAGES, useSession, type CommunityTab, type PageId, type TeamTab } from '../session'

/**
 * Shell de aplicação (design-system C-01) — o conteúdo de produto da fase 6 do plano
 * de design É o DF-12.
 *
 * REGRA DURA (ADR-009 dec. 4 / DF-12 P-1.1): o rail troca uma COLUNA DO GRID. Ele
 * não envolve, não remonta e não toca em `.main` — desmontar o `<Viewport>` perderia
 * a câmera, porque não existe estado de câmera no store para restaurar. Vale igual
 * para o rail compacto (DF-24): recolher muda `grid-template-columns`, nada mais.
 */

/**
 * Sub-item do rail (C-02 variante `sub`). `kind` diz o que a navegação troca:
 * `page` é destino próprio, `teamTab`/`communityTab` são abas da página do pai.
 * Tabela declarativa de propósito — é o que o teste percorre.
 */
export type SubKind = 'page' | 'teamTab' | 'communityTab'

export interface SubItem {
  kind: SubKind
  id: string
  label: string
  /** Marca de produto (DF-24). Só ferramenta tem; aba de página não ganha uma. */
  Mark?: (p: { size: 16 }) => JSX.Element
}

export interface Destino {
  page: PageId
  label: string
  Icon: (p: { size: 20 }) => JSX.Element
  /** Páginas que também acendem este item (Ferramentas abre editor e assistente). */
  alsoActive?: PageId[]
  /** Recursos/páginas que abrem embaixo quando o destino está ativo (DF-24). */
  subs?: SubItem[]
  /** Sub-itens que não fazem sentido sem sessão ficam fora para quem não tem conta. */
  subsExigemConta?: boolean
}

export const DESTINOS: Destino[] = [
  { page: 'inicio', label: 'Início', Icon: IconHouse },
  {
    page: 'equipe',
    label: 'Equipe',
    Icon: IconUsers,
    subsExigemConta: true,
    subs: [
      { kind: 'teamTab', id: 'evolucao', label: 'Evolução' },
      { kind: 'teamTab', id: 'pessoas', label: 'Pessoas' },
      { kind: 'teamTab', id: 'conhecimento', label: 'Conhecimento' },
      { kind: 'teamTab', id: 'projetos', label: 'Projetos' },
    ],
  },
  {
    page: 'ferramentas',
    label: 'Ferramentas',
    Icon: IconWrench,
    alsoActive: TOOL_PAGES,
    subs: [
      { kind: 'page', id: 'editor', label: 'Validador de gaiola', Mark: MarkCage },
      { kind: 'page', id: 'assistant', label: 'Assistente do regulamento', Mark: MarkAssistant },
    ],
  },
  {
    page: 'comunidade',
    label: 'Comunidade',
    Icon: IconTrophy,
    subsExigemConta: true,
    subs: [
      { kind: 'communityTab', id: 'resultados', label: 'Resultados' },
      { kind: 'communityTab', id: 'equipes', label: 'Equipes do Brasil' },
    ],
  },
]

/** Obrigação de interface do spec.md §1 — agora com posição fixa em TODA página. */
export const DISCLAIMER =
  'Apoio ao projeto — não substitui a inspeção oficial (B6.4). Sem vínculo com a organização da competição.'

/** O destino está aceso? (a página dele ou uma das que também o acendem) */
export function destinoAtivo(d: Destino, page: PageId): boolean {
  return page === d.page || (d.alsoActive?.includes(page) ?? false)
}

/** O sub-item está aceso? Depende do tipo: página própria ou aba do pai. */
export function subAtivo(
  s: SubItem,
  st: { page: PageId; teamTab: TeamTab; communityTab: CommunityTab },
): boolean {
  if (s.kind === 'page') return st.page === s.id
  if (s.kind === 'teamTab') return st.page === 'equipe' && st.teamTab === s.id
  return st.page === 'comunidade' && st.communityTab === s.id
}

export function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  const page = useSession((s) => s.page)
  const setPage = useSession((s) => s.setPage)
  const teamTab = useSession((s) => s.teamTab)
  const communityTab = useSession((s) => s.communityTab)
  const goToTeam = useSession((s) => s.goToTeam)
  const setCommunityTab = useSession((s) => s.setCommunityTab)
  const user = useSession((s) => s.user)
  const isAdmin = useSession((s) => s.user?.isAdmin === true)
  const compacto = useSession((s) => s.railCompact)
  const setRailCompact = useSession((s) => s.setRailCompact)

  const ativo = (d: Destino) => destinoAtivo(d, page)
  const irParaSub = (s: SubItem) => {
    if (s.kind === 'page') setPage(s.id as PageId)
    else if (s.kind === 'teamTab') goToTeam(s.id as TeamTab)
    else {
      setCommunityTab(s.id as CommunityTab)
      setPage('comunidade')
    }
  }
  /**
   * Os sub-itens abrem por SELEÇÃO, não por um segundo clique: entrar na página é o
   * que revela os recursos dela. No rail compacto eles somem — ali o glifo é o único
   * identificador (C-02), e não existe glifo para "aba de página" nem se inventa um
   * (design-system §8.4).
   */
  const subsVisiveis = (d: Destino) =>
    !compacto && ativo(d) && (!d.subsExigemConta || !!user) ? (d.subs ?? []) : []

  return (
    <div className={compacto ? 'bj-shell bj-shell-compacto' : 'bj-shell'}>
      <a className="bj-skip" href="#conteudo">
        Ir para o conteúdo
      </a>

      <nav className="bj-rail" aria-label="Seções">
        <div className="bj-rail-brand">
          <span className="bj-rail-brand-texto">
            <span className="bj-rail-brand-name">Bajeiros</span>
            <span className="bj-rail-brand-sub">portal das equipes</span>
          </span>
          <button
            type="button"
            className="bj-rail-toggle"
            aria-expanded={!compacto}
            aria-controls="bj-rail-lista"
            data-dica={compacto ? 'Expandir menu' : 'Recolher menu'}
            onClick={() => setRailCompact(!compacto)}
          >
            <IconChevronsRight size={16} />
            <span className="bj-sr-only">{compacto ? 'Expandir menu' : 'Recolher menu'}</span>
          </button>
        </div>
        <ul className="bj-rail-list" id="bj-rail-lista">
          {DESTINOS.map((d) => (
            <li key={d.page}>
              <button
                type="button"
                className="bj-nav-item"
                aria-current={ativo(d) ? 'page' : undefined}
                data-dica={d.label}
                onClick={() => setPage(d.page)}
              >
                <d.Icon size={20} />
                <span className="bj-nav-label">{d.label}</span>
              </button>
              {subsVisiveis(d).length > 0 && (
                <ul className="bj-rail-sublist">
                  {subsVisiveis(d).map((s) => (
                    <li key={`${s.kind}:${s.id}`}>
                      <button
                        type="button"
                        className="bj-nav-item bj-nav-sub"
                        aria-current={
                          subAtivo(s, { page, teamTab, communityTab }) ? 'page' : undefined
                        }
                        onClick={() => irParaSub(s)}
                      >
                        <span className="bj-nav-mark">{s.Mark ? <s.Mark size={16} /> : null}</span>
                        <span className="bj-nav-label">{s.label}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>

        <div className="bj-rail-foot">
          {isAdmin && (
            <button
              type="button"
              className="bj-nav-item"
              aria-current={page === 'admin' ? 'page' : undefined}
              data-dica="Administração"
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
      <button
        type="button"
        className="bj-nav-item"
        data-dica="Entrar ou criar conta"
        onClick={() => setPanel('login')}
      >
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
        data-dica={user.displayName}
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
