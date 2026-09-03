import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { useStore, type CameraView } from './store'
import { evaluate, removalImpact } from '@bajeiros/core/rules/b6'
import { estimateMass } from '@bajeiros/core/model/mass'
import { detectPlanes } from '@bajeiros/core/model/planes'
import { viewport3d } from './tokens'
import { Viewport } from './components/Viewport'
import { RulePanel } from './components/RulePanel'
import { Inspector } from './components/Inspector'
import { Wizard } from './components/Wizard'
import { SessionPanels } from './components/SessionPanels'
import { AssistantPanel } from './components/AssistantPanel'
import { AdminPanel } from './components/AdminPanel'
import { TeamPage } from './components/TeamPage'
import { HomePage } from './components/HomePage'
import { CommunityPage } from './components/CommunityPage'
import { ToolsHub } from './components/ToolsHub'
import { PrecisaDeConta, PublicHome } from './components/PublicHome'
import { ProjectPage } from './components/ProjectPage'
import { About } from './components/About'
import { Shell } from './components/Shell'
import { FeedbackPanel } from './components/FeedbackPanel'
import { ComingSoon } from './components/ComingSoon'
import { mostrarCortina } from './cortina'
import { appConfigAtual, useSession, track, TITULO_PAGINA as TITULOS } from './session'
import './shell.css'

function ViewportToggles() {
  const showGeraldao = useStore((s) => s.showGeraldao)
  const setShowGeraldao = useStore((s) => s.setShowGeraldao)
  const showRedundant = useStore((s) => s.showRedundant)
  const setShowRedundant = useStore((s) => s.setShowRedundant)
  const showManikin = useStore((s) => s.showManikin)
  const setShowManikin = useStore((s) => s.setShowManikin)
  const showPlanes = useStore((s) => s.showPlanes)
  const setShowPlanes = useStore((s) => s.setShowPlanes)
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
        className={showPlanes ? 'toggle active' : 'toggle'}
        title="Planos formados por pontos denominados adjacentes (DF-22) — clique num plano para medir e editar ângulos"
        onClick={() => setShowPlanes(!showPlanes)}
      >
        Planos
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
 * Vistas canônicas (DF-23). São ações, não estados: depois do primeiro arrasto de
 * câmera a vista já não é mais aquela, então nenhum botão fica "ativo". Clicar de
 * novo no mesmo botão reenquadra.
 */
const VISTAS: { id: CameraView; label: string; title: string }[] = [
  { id: 'lateral', label: 'Lateral', title: 'Vista lateral (nariz à direita) — enquadra a gaiola' },
  { id: 'frontal', label: 'Frontal', title: 'Vista frontal (de frente para o nariz)' },
  { id: 'superior', label: 'Topo', title: 'Vista superior (frente para cima)' },
  { id: 'iso', label: 'Iso', title: 'Vista isométrica' },
]

function ViewButtons() {
  const setCameraView = useStore((s) => s.setCameraView)
  return (
    <>
      <span className="sep" />
      {VISTAS.map((v) => (
        <button key={v.id} className="toggle" title={v.title} onClick={() => setCameraView(v.id)}>
          {v.label}
        </button>
      ))}
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

/**
 * DF-27 — a cortina troca o portal inteiro, e por isso vive num componente ACIMA do
 * `Portal`: um `return` antecipado lá dentro mudaria a ordem dos hooks entre um render
 * e o seguinte (a sessão do administrador chega depois do boot). Aqui a troca é
 * montagem/desmontagem, que é exatamente o que se quer — o portal não existe enquanto
 * a cortina está no ar (FR-DF27.5).
 */
export default function App() {
  const user = useSession((s) => s.user)
  if (mostrarCortina(appConfigAtual(), user)) return <ComingSoon />
  return <Portal />
}

function Portal() {
  const cage = useStore((s) => s.cage)
  const selectedMember = useStore((s) => s.selectedMember)
  const selectedNode = useStore((s) => s.selectedNode)
  const selectedPlane = useStore((s) => s.selectedPlane)
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
  // DF-22: a detecção varre cantos e faz um ajuste de plano por candidato — cabe
  // no mesmo `useDeferredValue` da análise de remoção, e por isso não pesa no arrasto
  const planeTolMm = useStore((s) => s.planeTolMm)
  const planes = useMemo(() => detectPlanes(deferredCage, planeTolMm), [deferredCage, planeTolMm])
  const [leftOpen, setLeftOpen] = useState(true)
  const [rightOpen, setRightOpen] = useState(true)
  const wizardActive = useStore((s) => s.wizardActive)

  const sessionUser = useSession((s) => s.user)
  const page = useSession((s) => s.page)
  const setPage = useSession((s) => s.setPage)
  const activeTeamId = useSession((s) => s.activeTeamId)
  const currentProject = useSession((s) => s.currentProject)
  const goToProject = useSession((s) => s.goToProject)

  // DF-9: pageview (só p/ logado; anônimo não é rastreado)
  useEffect(() => {
    if (sessionUser) track(`page:${page}`)
  }, [sessionUser, page])

  // A administração é a única que some de vez sem sessão — ela nem aparece no rail.
  useEffect(() => {
    if (!sessionUser && page === 'admin') setPage('inicio')
  }, [sessionUser, page, setPage])

  useEffect(() => {
    if (selectedMember || selectedNode || selectedPlane) setRightOpen(true)
  }, [selectedMember, selectedNode, selectedPlane])

  useEffect(() => {
    if (wizardActive) setRightOpen(true)
  }, [wizardActive])

  const auto = results.filter((r) => r.status !== 'manual')
  const passed = auto.filter((r) => r.status === 'pass').length
  const allFails = auto.filter((r) => r.status === 'fail')
  const pendingFails = wizardActive ? allFails.filter((r) => r.presence).length : 0
  const failed = allFails.length - pendingFails

  return (
    // um <h1> por página (DF-12 RF-1.3): na página de projeto ele é o nome do carro
    <Shell title={page === 'projeto' && currentProject ? currentProject.name : TITULOS[page]}>
      <SessionPanels />
      {/* DF-26: painel próprio, não aba de SessionPanels — ele abre por cima de
          QUALQUER página e não pode desmontar o editor (ADR-009 dec. 4) */}
      <FeedbackPanel />
      {sessionUser && <AvisoDeMudanca />}

      {/* Sem conta NINGUÉM é redirecionado em silêncio: o Início tem versão pública e
          os destinos que dependem de equipe explicam o que falta (C-16). Mandar de
          volta para Ferramentas sem dizer nada era o defeito relatado. */}
      {page === 'inicio' && (sessionUser ? <HomePage /> : <PublicHome />)}
      {page === 'equipe' &&
        (sessionUser ? <TeamPage /> : <PrecisaDeConta destino="O espaço da equipe" />)}
      {page === 'ferramentas' && <ToolsHub teamId={activeTeamId} />}
      {page === 'comunidade' &&
        (sessionUser ? (
          <CommunityPage teamId={activeTeamId} />
        ) : (
          <PrecisaDeConta destino="A Comunidade" />
        ))}
      {page === 'sobre' && <About />}
      {page === 'projeto' &&
        (sessionUser ? <ProjectPage /> : <PrecisaDeConta destino="A ficha do protótipo" />)}
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
            {/* DF-21 §3.5 — atalho para a ficha SEM desmontar o <Viewport>: a ida e
                volta preserva a câmera porque o editor só é escondido, nunca removido */}
            {currentProject && (
              <button
                type="button"
                className="bj-btn bj-btn-sm"
                onClick={() => goToProject(currentProject, 'ficha')}
              >
                Ficha do protótipo
              </button>
            )}
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
          <Viewport results={results} removalMap={removalMap} planes={planes} />
          <div className="viewport-toolbar">
            <ViewportToggles />
            <ViewButtons />
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
            {wizardActive ? <Wizard /> : <Inspector removalMap={removalMap} planes={planes} />}
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
