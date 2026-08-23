import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { useStore } from './store'
import { evaluate, removalImpact } from '@bajeiros/core/rules/b6'
import { estimateMass } from '@bajeiros/core/model/mass'
import { Viewport } from './components/Viewport'
import { RulePanel } from './components/RulePanel'
import { Inspector } from './components/Inspector'
import { Wizard } from './components/Wizard'
import { AccountMenu } from './components/AccountMenu'
import { SessionPanels } from './components/SessionPanels'
import { Landing, LANDING_SEEN_KEY } from './components/Landing'
import { useSession } from './session'

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
        title="Gabarito de habitáculo do regulamento (B6.2.4.3) — visualização apenas"
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
  // Landing na 1ª visita (estudo UX, R1); link de convite pula direto p/ o login
  const [showLanding, setShowLanding] = useState(() => {
    try {
      return !localStorage.getItem(LANDING_SEEN_KEY) && !useSession.getState().inviteToken
    } catch {
      return true
    }
  })

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

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-name">Bajeiros</span>
          <span className="brand-sub">Validador de Gaiola · B6 · RATBSB emenda 7 · protótipo</span>
        </div>
        <div className="disclaimer">
          Ferramenta educacional — não substitui a inspeção oficial (B6.4). Sem vínculo com a SAE.{' '}
          <button className="disclaimer-link" onClick={() => setShowLanding(true)}>
            Sobre o portal
          </button>
        </div>
        <AccountMenu />
      </header>
      {showLanding && <Landing onClose={() => setShowLanding(false)} />}
      <SessionPanels />
      <div className="main">
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
            <span className="vertical-label">Checklist B6</span>
          </button>
        )}
        <div className="viewport-wrap">
          <Viewport results={results} removalMap={removalMap} />
          <div className="viewport-toolbar">
            <ViewportToggles />
          </div>
          <div className="legend">
            <span>
              <i style={{ background: '#b8c4d0' }} /> primário
            </span>
            <span>
              <i style={{ background: '#5c6b7a' }} /> secundário
            </span>
            <span>
              <i style={{ background: '#e5484d' }} /> infração
            </span>
            <span>
              <i style={{ background: '#e6a817' }} /> atenção
            </span>
            <span>
              <i style={{ background: '#fb923c' }} /> ancoragem
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
    </div>
  )
}
