import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { useStore } from './store'
import { evaluate, removalImpact } from '@bajeiros/core/rules/b6'
import { estimateMass } from '@bajeiros/core/model/mass'
import { viewport3d } from './tokens'
import { Viewport } from './components/Viewport'
import { RulePanel } from './components/RulePanel'
import { Inspector } from './components/Inspector'
import { Wizard } from './components/Wizard'
import { SessionPanels } from './components/SessionPanels'
import { Landing } from './components/Landing'
import { AssistantPanel } from './components/AssistantPanel'
import { AdminPanel } from './components/AdminPanel'
import { TeamPage } from './components/TeamPage'
import { HomePage } from './components/HomePage'
import { CommunityPage } from './components/CommunityPage'
import { ToolsHub } from './components/ToolsHub'
import { About } from './components/About'
import { Shell } from './components/Shell'
import { useSession, track, type PageId } from './session'
import './shell.css'

/** Título da topbar por destino (DF-12 RF-1.3: um `<h1>` por página). */
const TITULOS: Record<PageId, string> = {
  inicio: 'Início',
  equipe: 'Equipe',
  ferramentas: 'Ferramentas',
  comunidade: 'Comunidade',
  editor: 'Validador de gaiola',
  assistant: 'Assistente do regulamento',
  admin: 'Administração',
  sobre: 'Sobre o portal',
}

/** Páginas que exigem sessão — sem ela, o destino é o Início. */
const PRECISA_LOGIN: PageId[] = ['inicio', 'equipe', 'comunidade', 'admin']

function ViewportToggles() {
  const showGeraldao = useStore((s) => s.showGeraldao)
  const setShowGeraldao = useStore((s) => s.setShowGeraldao)
  const showRedundant = useStore((s) => s.showRedundant)
  const setShowRedundant = useStore((s) => s.setShowRedundant)
  const showManikin = useStore((s) => s.showManikin)
  const setShowManikin = useStore((s) => s.setShowManikin)
  return (
    <>
      <button
        className={showGeraldao ? 'toggle active' : 'toggle'}
        title="Gabarito de habitáculo (Geraldão) do regulamento (B6.2.4.3) — visualização apenas"
        onClick={() => setShowGeraldao(!showGeraldao)}
      >
        Geraldão
      </button>
      <button
        className={showManikin ? 'toggle active' : 'toggle'}
        title="Manequim ergonômico do piloto (faixa de percentis) — visualização apenas"
        onClick={() => setShowManikin(!showManikin)}
      >
        Piloto
      </button>
      <button
        className={showRedundant ? 'toggle active' : 'toggle'}
        title="Destacar membros cuja remoção não infringe regras"
        onClick={() => setShowRedundant(!showRedundant)}
      >
        Redundância
      </button>
    </>
  )
}

/**
 * Aviso único de transição (DF-12 P-1.3): quem já usava o portal procura o Editor no
 * lugar antigo. Uma linha, uma vez, e nunca mais.
 */
const AVISO_KEY = 'bajeiros:aviso-rail'

function AvisoDeMudanca() {
  const [visivel, setVisivel] = useState(() => {
    try {
      return localStorage.getItem(AVISO_KEY) !== 'visto'
    } catch {
      return false
    }
  })
  if (!visivel) return null
  const fechar = () => {
    try {
      localStorage.setItem(AVISO_KEY, 'visto')
    } catch {
      /* storage bloqueado: o aviso reaparece, o que é preferível a quebrar */
    }
    setVisivel(false)
  }
  return (
    <div className="bj-aviso-transicao" role="status">
      <span>O Editor agora vive em Ferramentas. A Equipe ganhou Evolução e Conhecimento.</span>
      <button type="button" className="bj-btn bj-btn-sm" onClick={fechar}>
        Entendi
      </button>
    </div>
  )
}

export default function App() {
  const cage = useStore((s) => s.cage)
  const selectedMember = useStore((s) => s.selectedMember)
  const selectedNode = useStore((s) => s.selectedNode)
  const results = useMemo(() => evaluate(cage), [cage])
  const mass = useMemo(() => estimateMass(cage), [cage])
  // análise de remoção é ~40 avaliações; deferida para não pesar durante arrasto no 3D
  const deferredCage = useDeferredValue(cage)
  const removalMap = useMemo(() => {
    const map: Record<string, string[]> = {}
    const base = evaluate(deferredCage)
    for (const m of deferredCage.members) map[m.id] = removalImpact(deferredCage, m.id, base)
    return map
  }, [deferredCage])
  const [leftOpen, setLeftOpen] = useState(true)
  const [rightOpen, setRightOpen] = useState(true)
  const wizardActive = useStore((s) => s.wizardActive)

  const showLanding = useSession((s) => s.landing)
  const setShowLanding = useSession((s) => s.setLanding)
  const sessionUser = useSession((s) => s.user)
  const page = useSession((s) => s.page)
  const setPage = useSession((s) => s.setPage)
  const activeTeamId = useSession((s) => s.activeTeamId)

  // DF-9: pageview (só p/ logado; anônimo não é rastreado)
  useEffect(() => {
    if (sessionUser) track(showLanding ? 'landing' : `page:${page}`)
  }, [showLanding, sessionUser, page])

  // Deslogado só alcança as ferramentas (o assistente aceita anônimo, 2/dia).
  useEffect(() => {
    if (!sessionUser && PRECISA_LOGIN.includes(page)) setPage('ferramentas')
  }, [sessionUser, page, setPage])

  useEffect(() => {
    if (selectedMember || selectedNode) setRightOpen(true)
  }, [selectedMember, selectedNode])

  useEffect(() => {
    if (wizardActive) setRightOpen(true)
  }, [wizardActive])

  const auto = results.filter((r) => r.status !== 'manual')
  const passed = auto.filter((r) => r.status === 'pass').length
  const allFails = auto.filter((r) => r.status === 'fail')
  const pendingFails = wizardActive ? allFails.filter((r) => r.presence).length : 0
  const failed = allFails.length - pendingFails

  // Landing é a home PÚBLICA: deslogado a vê como página (DF-12 §3.2).
  if (showLanding && !sessionUser) {
    return (
      <>
        <Landing onClose={() => setShowLanding(false)} />
        <SessionPanels />
      </>
    )
  }

  return (
    <Shell title={TITULOS[page]}>
      <SessionPanels />
      {sessionUser && <AvisoDeMudanca />}

      {page === 'inicio' && <HomePage />}
      {page === 'equipe' && <TeamPage />}
      {page === 'ferramentas' && <ToolsHub teamId={activeTeamId} />}
      {page === 'comunidade' && <CommunityPage teamId={activeTeamId} />}
      {page === 'sobre' && <About />}
      {page === 'assistant' && (
        <div className="page-body">
          <div className="page-inner page-narrow">
            <AssistantPanel />
          </div>
        </div>
      )}
      {page === 'admin' && (
        <div className="page-body">
          <div className="page-inner">
            <AdminPanel />
          </div>
        </div>
      )}

      {/* O editor NUNCA desmonta (ADR-009 dec. 4): esconder é `display: none`, e é o
          que preserva câmera e cena WebGL ao ir a Equipe e voltar (AC-DF12.3). */}
      <div className="main" style={page !== 'editor' ? { display: 'none' } : undefined}>
        {leftOpen ? (
          <aside className="sidebar left">
            <div className="panel-head">
              <span>Checklist B6</span>
              <button
                className="collapse-btn"
                title="Recolher checklist"
                onClick={() => setLeftOpen(false)}
              >
                «
              </button>
            </div>
            <div className={`score-strip ${failed ? 'bad' : 'good'}`}>
              {failed
                ? `⚠ ${failed} regra(s) infringida(s) · ${passed}/${auto.length} OK`
                : `✓ Nenhuma infração · ${passed}/${auto.length} verificações OK`}
              {pendingFails > 0 && ` · ${pendingFails} pendente(s) dos próximos passos`}
            </div>
            <div className="mass-strip" title="Estimativa geométrica — não substitui pesagem">
              <b>Massa estimada: {mass.totalKg.toFixed(1).replace('.', ',')} kg</b>
              <span className="mass-detail">
                primário {mass.primaryKg.toFixed(1).replace('.', ',')} kg · secundário{' '}
                {mass.secondaryKg.toFixed(1).replace('.', ',')} kg · solda{' '}
                {(mass.weldKg * 1000).toFixed(0)} g ({mass.jointCount} juntas)
              </span>
            </div>
            <RulePanel results={results} />
          </aside>
        ) : (
          <button
            className="sidebar-collapsed left"
            title="Expandir checklist"
            onClick={() => setLeftOpen(true)}
          >
            <span className={`status-dot ${failed ? 'bad' : 'good'}`} />
            <span className="vertical-label">
              Checklist B6 {failed ? `· ${failed} infrações` : '· sem infração'}
            </span>
          </button>
        )}
        <div className="viewport-wrap">
          <Viewport results={results} removalMap={removalMap} />
          <div className="viewport-toolbar">
            <ViewportToggles />
          </div>
          <div className="legend">
            <span>
              <i style={{ background: viewport3d.member }} /> primário
            </span>
            <span>
              <i style={{ background: viewport3d['member-secondary'] }} /> secundário
            </span>
            <span>
              <i style={{ background: viewport3d.fail }} /> infração
            </span>
            <span>
              <i style={{ background: viewport3d.selected }} /> atenção
            </span>
            <span>
              <i style={{ background: viewport3d['anchor-ok'] }} /> ancoragem
            </span>
          </div>
        </div>
        {rightOpen ? (
          <aside className="sidebar right">
            <div className="panel-head">
              <span>{wizardActive ? 'Nova gaiola' : 'Editar'}</span>
              <button
                className="collapse-btn"
                title="Recolher editor"
                onClick={() => setRightOpen(false)}
              >
                »
              </button>
            </div>
            {wizardActive ? <Wizard /> : <Inspector removalMap={removalMap} />}
          </aside>
        ) : (
          <button
            className="sidebar-collapsed right"
            title="Expandir editor"
            onClick={() => setRightOpen(true)}
          >
            <span className="vertical-label">{wizardActive ? 'Nova gaiola' : 'Editar'}</span>
          </button>
        )}
      </div>
    </Shell>
  )
}
