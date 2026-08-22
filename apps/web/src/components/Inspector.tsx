import { useEffect, useState } from 'react'
import { useStore } from '../store'
import {
  TYPE_LABELS,
  anchorLabel,
  isNamedNode,
  isNamedIn,
  type Anchor,
  type MemberType,
  type TubeSection,
} from '@bajeiros/core/model/types'
import { STEELS, materialOf } from '@bajeiros/core/model/materials'
import { estimateMass, removalMassDelta, weldPerJointG } from '@bajeiros/core/model/mass'
import { chainOf, continuityAt } from '@bajeiros/core/model/continuity'
import { copeSvg, detectJoints, totalWeldLength } from '@bajeiros/core/model/joints'
import {
  JOINT_RANGES,
  PROFILES,
  defaultManikin,
  manikinReadings,
  profileById,
  solveManikin,
  type JointId,
} from '@bajeiros/core/model/manikin'
import { dist, distPointToSegment, sub, norm, dot } from '@bajeiros/core/rules/geometry'

function NumField({
  label,
  value,
  onChange,
  step = 5,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  step?: number
}) {
  return (
    <label className="num-field">
      <span>{label}</span>
      <input
        type="number"
        value={Math.round(value * 100) / 100}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  )
}

const ALL_TYPES = Object.keys(TYPE_LABELS) as MemberType[]

type Group = 'sel' | 'build' | 'tubes' | 'analysis' | 'pilot' | 'file'

const GROUPS: { id: Group; label: string; title: string }[] = [
  { id: 'sel', label: 'Seleção', title: 'Nó / membro / ancoragem selecionados no 3D' },
  { id: 'build', label: 'Construir', title: 'Assistente, adicionar membros e nós' },
  { id: 'tubes', label: 'Tubos', title: 'Materiais, seções e referências do assento' },
  { id: 'analysis', label: 'Análise', title: 'Massa (DF-2) e juntas/solda (DF-7)' },
  { id: 'pilot', label: 'Piloto', title: 'Manequim (DF-4) e direção (DF-5)' },
  { id: 'file', label: 'Arquivo', title: 'Exportar, importar, restaurar' },
]

function ManikinBlock() {
  const cage = useStore((s) => s.cage)
  const setManikin = useStore((s) => s.setManikin)
  const setManikinAngle = useStore((s) => s.setManikinAngle)
  const cfg = { ...defaultManikin(), ...cage.manikin }
  const pMax = profileById(cfg.profileMax)
  const lmMax = solveManikin(cfg, pMax, cage.seatBottomY, cage.geraldao.z)
  const rMax = manikinReadings(lmMax)
  return (
    <div className="section">
      <div className="section-title">Piloto — manequim ergonômico (DF-4)</div>
      <label className="num-field">
        <span>percentil menor</span>
        <select value={cfg.profileMin} onChange={(e) => setManikin({ profileMin: e.target.value })}>
          {PROFILES.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label} — {(p.statureMm / 10).toFixed(0)} cm · {p.massKg} kg
            </option>
          ))}
        </select>
      </label>
      <label className="num-field">
        <span>percentil maior</span>
        <select value={cfg.profileMax} onChange={(e) => setManikin({ profileMax: e.target.value })}>
          {PROFILES.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label} — {(p.statureMm / 10).toFixed(0)} cm · {p.massKg} kg
            </option>
          ))}
        </select>
      </label>
      {(Object.keys(JOINT_RANGES) as JointId[]).map((j) => {
        const range = JOINT_RANGES[j]
        const val = cfg.angles[j]
        const out = val < range.min || val > range.max
        return (
          <label
            key={j}
            className="num-field"
            title={`${range.label} ${range.min}–${range.max}°: ${range.why}`}
          >
            <span style={out ? { color: '#e6a817' } : undefined}>
              {range.label} ({val}°{out ? ' ⚠ fora da faixa recomendada' : ''})
            </span>
            <input
              type="range"
              min={range.min - 20}
              max={range.max + 20}
              step={1}
              value={val}
              onChange={(e) => setManikinAngle(j, Number(e.target.value))}
            />
          </label>
        )
      })}
      <NumField
        label="espessura do assento (mm)"
        value={cfg.seatPadMm}
        step={5}
        onChange={(v) => setManikin({ seatPadMm: v })}
      />
      <NumField
        label="raio do capacete (mm)"
        value={cfg.helmetRadiusMm}
        step={5}
        onChange={(v) => setManikin({ helmetRadiusMm: v })}
      />
      <div className="member-info">
        {pMax.label}: H-point→calcanhar {rMax.hipToHeelMm.toFixed(0)} mm · topo do capacete y ={' '}
        {rMax.helmetTopY.toFixed(0)} mm · punho (y, z) = ({rMax.wrist.y.toFixed(0)},{' '}
        {rMax.wrist.z.toFixed(0)}) mm
      </div>
      <div className="muted" style={{ fontSize: 11 }}>
        Segmentos proporcionais à estatura (Drillis &amp; Contini, 1966); faixas articulares são
        recomendação ergonômica, não norma. Ligue "Piloto" na barra do viewport para ver.
      </div>
    </div>
  )
}

function SteeringBlock() {
  const cage = useStore((s) => s.cage)
  const addSteering = useStore((s) => s.addSteering)
  const removeSteering = useStore((s) => s.removeSteering)
  const setSteeringMode = useStore((s) => s.setSteeringMode)
  const setSteeringZone = useStore((s) => s.setSteeringZone)
  const moveSteeringPoint = useStore((s) => s.moveSteeringPoint)
  const selectedSteering = useStore((s) => s.selectedSteering)
  const selectSteering = useStore((s) => s.selectSteering)
  const st = cage.steering
  const support = (pos: { x: number; y: number; z: number }) => {
    let best = Infinity
    for (const m of cage.members) {
      const pa = cage.nodes[m.a]
      const pb = cage.nodes[m.b]
      if (pa && pb) best = Math.min(best, distPointToSegment(pos, pa, pb))
    }
    return best
  }
  const cfg = { ...defaultManikin(), ...cage.manikin }
  const wrist = solveManikin(
    cfg,
    profileById(cfg.profileMax),
    cage.seatBottomY,
    cage.geraldao.z,
  ).wrist
  const zoneR = st?.zoneRadiusMm ?? 50
  return (
    <div className="section">
      <div className="section-title">Direção — ancoragem do volante (DF-5)</div>
      {!st ? (
        <div className="add-row">
          <button onClick={() => addSteering('central')}>+ ancoragem central</button>
          <button onClick={() => addSteering('mesa')}>+ mesa (L/R)</button>
        </div>
      ) : (
        <>
          <label className="num-field">
            <span>modo</span>
            <select
              value={st.mode}
              onChange={(e) => setSteeringMode(e.target.value as 'central' | 'mesa')}
            >
              <option value="central">central (1 ponto)</option>
              <option value="mesa">mesa (2 pontos L/R)</option>
            </select>
          </label>
          {st.points.map((pt) => {
            const d = support(pt.pos)
            const distWrist = Math.hypot(pt.pos.x - wrist.x, pt.pos.y - wrist.y, pt.pos.z - wrist.z)
            const sel = pt.id === selectedSteering
            return (
              <div
                key={pt.id}
                style={
                  sel ? { outline: '1px solid #22d3ee', borderRadius: 4, padding: 2 } : undefined
                }
              >
                <button className="mini" onClick={() => selectSteering(pt.id)}>
                  {pt.id}
                </button>
                {d <= 25 ? (
                  <span className="member-info"> ✓ apoiada ({d.toFixed(1)} mm do tubo)</span>
                ) : (
                  <span className="removal-bad">
                    {' '}
                    ✕ sem suporte ({d.toFixed(0)} mm) — ajuste a gaiola ou adicione tubo
                  </span>
                )}
                {distWrist > zoneR && (
                  <div className="muted" style={{ fontSize: 11, color: '#e6a817' }}>
                    ⚠ {distWrist.toFixed(0)} mm do punho do manequim (zona recomendada: {zoneR} mm)
                    — informativo
                  </div>
                )}
                <NumField
                  label="X"
                  value={pt.pos.x}
                  onChange={(x) => moveSteeringPoint(pt.id, { ...pt.pos, x })}
                />
                <NumField
                  label="Y"
                  value={pt.pos.y}
                  onChange={(y) => moveSteeringPoint(pt.id, { ...pt.pos, y })}
                />
                <NumField
                  label="Z"
                  value={pt.pos.z}
                  onChange={(z) => moveSteeringPoint(pt.id, { ...pt.pos, z })}
                />
              </div>
            )
          })}
          <NumField
            label="raio da zona do punho (mm)"
            value={zoneR}
            step={5}
            onChange={setSteeringZone}
          />
          <button className="danger full" onClick={removeSteering}>
            Remover ancoragem do volante
          </button>
        </>
      )}
    </div>
  )
}

function ContinuityBlock({ node }: { node: string }) {
  const cage = useStore((s) => s.cage)
  const setContinuity = useStore((s) => s.setContinuity)
  const clearContinuity = useStore((s) => s.clearContinuity)
  const incident = cage.members.filter((m) => m.a === node || m.b === node)
  const passages = continuityAt(cage, node)
  const [selA, setSelA] = useState('')
  const [selB, setSelB] = useState('')
  if (incident.length < 2) return null
  const label = (id: string) => {
    const m = incident.find((x) => x.id === id)
    return m ? `${m.type} (${m.a}→${m.b})` : id
  }
  const used = (id: string) => passages.some((p) => p.pair.includes(id))
  const free = incident.filter((m) => !used(m.id))
  const blocked =
    (selA && used(selA)) || (selB && used(selB))
      ? 'membro já pertence a uma passagem contínua neste nó — desfaça-a primeiro'
      : null
  return (
    <div className="continuity">
      <div className="section-title small">Continuidade (DF-6)</div>
      {passages.map((p) => (
        <div key={p.pair.join('+')} className="member-info">
          ✓ passagem contínua: {label(p.pair[0])} + {label(p.pair[1])}{' '}
          <button className="mini" onClick={() => clearContinuity(node, p.pair)}>
            desfazer
          </button>
        </div>
      ))}
      {!passages.length && (
        <div className="member-info">emenda/junta soldada (nenhuma passagem declarada)</div>
      )}
      {free.length >= 2 && (
        <>
          <div className="add-row">
            <select value={selA} onChange={(e) => setSelA(e.target.value)}>
              <option value="">1º membro…</option>
              {incident.map((m) => (
                <option key={m.id} value={m.id}>
                  {label(m.id)}
                </option>
              ))}
            </select>
            <select value={selB} onChange={(e) => setSelB(e.target.value)}>
              <option value="">2º membro…</option>
              {incident
                .filter((m) => m.id !== selA)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {label(m.id)}
                  </option>
                ))}
            </select>
          </div>
          {blocked && (
            <div className="muted" style={{ fontSize: 11 }}>
              {blocked}
            </div>
          )}
          <button
            className="full"
            disabled={!selA || !selB || !!blocked}
            onClick={() => {
              setContinuity(node, [selA, selB])
              setSelA('')
              setSelB('')
            }}
          >
            marcar como tubo contínuo
          </button>
        </>
      )}
    </div>
  )
}

function SectionBlock({
  title,
  which,
  section,
  setSection,
}: {
  title: string
  which: 'primary' | 'secondary'
  section: TubeSection
  setSection: (which: 'primary' | 'secondary', field: 'od' | 'wall', value: number) => void
}) {
  const setMaterial = useStore((s) => s.setMaterial)
  const setCustomMaterial = useStore((s) => s.setCustomMaterial)
  const mat = materialOf(section)
  const isCustom = section.materialId === 'custom'
  return (
    <div className="section">
      <div className="section-title">{title}</div>
      <label className="num-field">
        <span>material</span>
        <select value={section.materialId} onChange={(e) => setMaterial(which, e.target.value)}>
          {STEELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
          <option value="custom">Customizado…</option>
        </select>
      </label>
      <div className="muted" style={{ fontSize: 11, margin: '2px 0 4px' }}>
        E {mat.youngGPa} GPa · Sy {mat.yieldMPa} MPa · ρ {mat.densityKgM3} kg/m³ · C {mat.carbon}%
      </div>
      {isCustom && (
        <>
          <NumField
            label="%C"
            value={mat.carbon}
            step={0.01}
            onChange={(v) => setCustomMaterial(which, { carbon: v })}
          />
          <NumField
            label="E (GPa)"
            value={mat.youngGPa}
            step={1}
            onChange={(v) => setCustomMaterial(which, { youngGPa: v })}
          />
          <NumField
            label="Sy (MPa)"
            value={mat.yieldMPa}
            step={5}
            onChange={(v) => setCustomMaterial(which, { yieldMPa: v })}
          />
          <NumField
            label="ρ (kg/m³)"
            value={mat.densityKgM3}
            step={10}
            onChange={(v) => setCustomMaterial(which, { densityKgM3: v })}
          />
        </>
      )}
      <NumField
        label="Ø ext (mm)"
        value={section.od}
        step={0.1}
        onChange={(v) => setSection(which, 'od', v)}
      />
      <NumField
        label="parede (mm)"
        value={section.wall}
        step={0.01}
        onChange={(v) => setSection(which, 'wall', v)}
      />
    </div>
  )
}

export function Inspector({ removalMap }: { removalMap: Record<string, string[]> }) {
  const cage = useStore((s) => s.cage)
  const selectedNode = useStore((s) => s.selectedNode)
  const selectedMember = useStore((s) => s.selectedMember)
  const selectedAnchor = useStore((s) => s.selectedAnchor)
  const moveNode = useStore((s) => s.moveNode)
  const moveAnchor = useStore((s) => s.moveAnchor)
  const deleteNode = useStore((s) => s.deleteNode)
  const deleteMember = useStore((s) => s.deleteMember)
  const setMemberType = useStore((s) => s.setMemberType)
  const splitMember = useStore((s) => s.splitMember)
  const toggleNamed = useStore((s) => s.toggleNamed)
  const mirror = useStore((s) => s.mirror)
  const setMirror = useStore((s) => s.setMirror)
  const showRedundant = useStore((s) => s.showRedundant)
  const setShowRedundant = useStore((s) => s.setShowRedundant)
  const pending = useStore((s) => s.pending)
  const startAddMember = useStore((s) => s.startAddMember)
  const cancelPending = useStore((s) => s.cancelPending)
  const addFreeNode = useStore((s) => s.addFreeNode)
  const setGeraldao = useStore((s) => s.setGeraldao)
  const setSeatBottomY = useStore((s) => s.setSeatBottomY)
  const setSection = useStore((s) => s.setSection)
  const reset = useStore((s) => s.reset)
  const loadCage = useStore((s) => s.loadCage)

  const [newType, setNewType] = useState<MemberType>('FAB_UP')
  const setWeightParams = useStore((s) => s.setWeightParams)
  const selectedSteering = useStore((s) => s.selectedSteering)
  const massReport = estimateMass(cage)
  const joints = detectJoints(cage)

  const [group, setGroup] = useState<Group>('build')
  const [anchorsOpen, setAnchorsOpen] = useState(false)
  useEffect(() => {
    if (selectedAnchor) setAnchorsOpen(true)
  }, [selectedAnchor])
  useEffect(() => {
    if (!pending && (selectedNode || selectedMember || selectedAnchor)) setGroup('sel')
  }, [pending, selectedNode, selectedMember, selectedAnchor])
  useEffect(() => {
    if (selectedSteering) setGroup('pilot')
  }, [selectedSteering])

  const node = selectedNode ? cage.nodes[selectedNode] : null
  const member = selectedMember ? cage.members.find((m) => m.id === selectedMember) : null
  const anchor = selectedAnchor ? (cage.anchors ?? []).find((a) => a.id === selectedAnchor) : null

  // distância da ancoragem ao tubo mais próximo (suporte físico)
  const anchorSupport = (a: Anchor) => {
    let best = Infinity
    for (const m of cage.members) {
      const pa = cage.nodes[m.a]
      const pb = cage.nodes[m.b]
      if (pa && pb) best = Math.min(best, distPointToSegment(a.pos, pa, pb))
    }
    return best
  }
  const nodeInUse = selectedNode
    ? cage.members.some((m) => m.a === selectedNode || m.b === selectedNode)
    : false

  // ângulo de dobra no nó selecionado (se for passagem de exatamente 2 tubos)
  let bendAngle: number | null = null
  if (selectedNode && node) {
    const inc = cage.members.filter((m) => m.a === selectedNode || m.b === selectedNode)
    if (inc.length === 2) {
      const dir = (m: (typeof inc)[0]) => {
        const otherId = m.a === selectedNode ? m.b : m.a
        return sub(cage.nodes[otherId], node)
      }
      const c = dot(norm(dir(inc[0])), norm(dir(inc[1])))
      bendAngle = 180 - (Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI
    }
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(cage, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'gaiola-bajeiros.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  function importJson(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    file.text().then((t) => {
      try {
        loadCage(JSON.parse(t))
      } catch {
        alert('JSON inválido')
      }
    })
    e.target.value = ''
  }

  const hasSelection = !!(member || node || anchor)

  return (
    <div className="inspector">
      <nav className="subtabs">
        {GROUPS.map((g) => (
          <button
            key={g.id}
            className={group === g.id ? 'active' : ''}
            title={g.title}
            onClick={() => setGroup(g.id)}
          >
            {g.label}
            {g.id === 'sel' && hasSelection && <i className="sel-dot" />}
          </button>
        ))}
      </nav>

      {group === 'build' && (
        <>
          {/* ---- nova gaiola ---- */}
          <div className="section">
            <button
              className="full primary"
              onClick={() => useStore.getState().setWizardActive(true)}
            >
              ✦ Nova gaiola do zero (assistente em 6 passos)
            </button>
          </div>

          {/* ---- adicionar membro / nó ---- */}
          <div className="section">
            <div className="section-title">Adicionar</div>
            {pending ? (
              <div className="pending-box">
                <div>
                  Adicionando <b>{TYPE_LABELS[pending.type]}</b>:{' '}
                  {pending.first
                    ? `1º nó = ${pending.first}. Clique no 2º nó.`
                    : 'clique no 1º nó no 3D.'}
                </div>
                <button onClick={cancelPending}>Cancelar</button>
              </div>
            ) : (
              <>
                <select
                  className="type-select"
                  value={newType}
                  onChange={(e) => setNewType(e.target.value as MemberType)}
                >
                  {ALL_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
                <div className="add-row">
                  <button onClick={() => startAddMember(newType)}>+ Membro (clique 2 nós)</button>
                  <button onClick={addFreeNode}>+ Nó livre</button>
                </div>
              </>
            )}
            <label className="check-field">
              <input
                type="checkbox"
                checked={showRedundant}
                onChange={(e) => setShowRedundant(e.target.checked)}
              />
              destacar membros cuja remoção não infringe regras
            </label>
          </div>
        </>
      )}

      {group === 'sel' && (
        <>
          {/* ---- membro selecionado ---- */}
          {member && (
            <div className="section">
              <div className="section-title">
                Membro {member.a} → {member.b}
              </div>
              <label className="num-field">
                <span>tipo</span>
                <select
                  className="type-select small"
                  value={member.type}
                  onChange={(e) => setMemberType(member.id, e.target.value as MemberType)}
                >
                  {ALL_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
              </label>
              <div className="member-info">
                comprimento: {dist(cage.nodes[member.a], cage.nodes[member.b]).toFixed(0)} mm
                {' · '}massa: {(massReport.perMember[member.id] ?? 0).toFixed(0)} g
              </div>
              {(() => {
                const chain = chainOf(cage, member.id)
                if (chain.length < 2) return null
                const len = chain.reduce((acc, mm) => {
                  const pa = cage.nodes[mm.a]
                  const pb = cage.nodes[mm.b]
                  return acc + (pa && pb ? dist(pa, pb) : 0)
                }, 0)
                return (
                  <div className="member-info">
                    parte de tubo físico contínuo: {chain.length} segmentos, {len.toFixed(0)} mm
                  </div>
                )
              })()}
              {removalMap[member.id]?.length === 0 ? (
                <div className="removal-ok">
                  ✓ Remoção total deste membro não infringe nenhuma regra automática — candidato a
                  redução de massa: economiza{' '}
                  {removalMassDelta(cage, member.id, massReport).toFixed(0)} g (tubo + juntas).
                  Juízes ainda podem exigir reforços (B6.4.1.2).
                </div>
              ) : (
                <div className="removal-bad">
                  ✕ Remover este membro infringiria: {removalMap[member.id]?.join(', ')}{' '}
                  (economizaria {removalMassDelta(cage, member.id, massReport).toFixed(0)} g)
                </div>
              )}
              {joints
                .filter((j) => j.node && j.coped.includes(member.id))
                .map((j) => (
                  <div key={`${member.id}@${j.node}`} className="member-info">
                    boca de lobo em {j.node} contra {j.target} (θ = {j.angleDeg.toFixed(0)}°){' '}
                    <button
                      className="mini"
                      onClick={() => {
                        const svg = copeSvg(cage, member.id, j.node!)
                        if (!svg) return
                        const blob = new Blob([svg], { type: 'image/svg+xml' })
                        const url = URL.createObjectURL(blob)
                        const a = document.createElement('a')
                        a.href = url
                        a.download = `gabarito-${member.id}-${j.node}.svg`
                        a.click()
                        URL.revokeObjectURL(url)
                      }}
                    >
                      gabarito SVG 1:1
                    </button>
                  </div>
                ))}
              <button className="full" onClick={() => splitMember(member.id)}>
                + Nó no tubo (curva / ponto denominado)
              </button>
              <button className="danger full" onClick={() => deleteMember(member.id)}>
                Excluir membro
              </button>
            </div>
          )}

          {/* ---- nó selecionado ---- */}
          {node && selectedNode && (
            <div className="section">
              <div className="section-title">Nó {selectedNode}</div>
              <NumField
                label="X (lateral)"
                value={node.x}
                onChange={(x) => moveNode(selectedNode, { ...node, x })}
              />
              <NumField
                label="Y (altura)"
                value={node.y}
                onChange={(y) => moveNode(selectedNode, { ...node, y })}
              />
              <NumField
                label="Z (frente)"
                value={node.z}
                onChange={(z) => moveNode(selectedNode, { ...node, z })}
              />
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={mirror}
                  onChange={(e) => setMirror(e.target.checked)}
                />
                espelhar lado L/R
              </label>
              {isNamedNode(selectedNode) ? (
                <div className="member-info">ponto denominado do regulamento ({selectedNode})</div>
              ) : (
                <label className="check-field">
                  <input
                    type="checkbox"
                    checked={isNamedIn(cage, selectedNode)}
                    onChange={() => toggleNamed(selectedNode)}
                  />
                  marcar como ponto denominado
                </label>
              )}
              {bendAngle !== null && (
                <div className="member-info">
                  dobra neste nó: {bendAngle.toFixed(1).replace('.', ',')}°
                  {bendAngle >= 3 &&
                    !isNamedIn(cage, selectedNode) &&
                    bendAngle > 30 &&
                    ' — acima de 30° fora de ponto denominado'}
                </div>
              )}
              <ContinuityBlock node={selectedNode} />
              <button
                className="danger full"
                disabled={nodeInUse}
                title={nodeInUse ? 'Exclua primeiro os membros ligados a este nó' : ''}
                onClick={() => deleteNode(selectedNode)}
              >
                {nodeInUse ? 'Nó em uso por membros' : 'Excluir nó'}
              </button>
            </div>
          )}

          {/* ---- ancoragem selecionada ---- */}
          {anchor && (
            <div className="section">
              <div className="section-title">Ancoragem</div>
              <div className="member-info">{anchorLabel(anchor)}</div>
              <NumField
                label="X (lateral)"
                value={anchor.pos.x}
                onChange={(x) => moveAnchor(anchor.id, { ...anchor.pos, x })}
              />
              <NumField
                label="Y (altura)"
                value={anchor.pos.y}
                onChange={(y) => moveAnchor(anchor.id, { ...anchor.pos, y })}
              />
              <NumField
                label="Z (frente)"
                value={anchor.pos.z}
                onChange={(z) => moveAnchor(anchor.id, { ...anchor.pos, z })}
              />
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={mirror}
                  onChange={(e) => setMirror(e.target.checked)}
                />
                espelhar lado L/R
              </label>
              {(() => {
                const d = anchorSupport(anchor)
                return d <= 25 ? (
                  <div className="removal-ok">
                    ✓ Apoiada — tubo mais próximo a {d.toFixed(0)} mm do eixo.
                  </div>
                ) : (
                  <div className="removal-bad">
                    ✕ Sem suporte — tubo mais próximo a {d.toFixed(0)} mm. Ajuste a gaiola ou
                    adicione tubo/reforço passando por aqui.
                  </div>
                )
              })()}
            </div>
          )}

          {/* ---- lista de ancoragens (colapsável) ---- */}
          <div className="section">
            <button
              className="section-toggle"
              title="Mostrar/ocultar as 20 ancoragens da suspensão"
              onClick={() => setAnchorsOpen(!anchorsOpen)}
            >
              <span className="section-title" style={{ marginBottom: 0 }}>
                Ancoragens da suspensão
                {(() => {
                  const bad = (cage.anchors ?? []).filter((a) => anchorSupport(a) > 25).length
                  return bad > 0 ? <span className="anchor-bad"> · {bad} sem suporte</span> : null
                })()}
              </span>
              <span className="chevron">{anchorsOpen ? '▾' : '▸'}</span>
            </button>
            {anchorsOpen && (
              <div className="anchor-list" style={{ marginTop: 8 }}>
                {(cage.anchors ?? []).map((a) => {
                  const d = anchorSupport(a)
                  return (
                    <button
                      key={a.id}
                      className={`anchor-row ${a.id === selectedAnchor ? 'active' : ''}`}
                      onClick={() => useStore.getState().selectAnchor(a.id)}
                    >
                      <span>{anchorLabel(a)}</span>
                      <span className={d <= 25 ? 'anchor-ok' : 'anchor-bad'}>
                        {d <= 25 ? '✓' : `${d.toFixed(0)} mm`}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {!member && !node && !anchor && (
            <div className="section muted">
              Clique em um nó, tubo ou ancoragem (losango laranja) no 3D para editar.
            </div>
          )}
        </>
      )}

      {group === 'tubes' && (
        <>
          <div className="section">
            <div className="section-title">Referências do assento</div>
            <NumField
              label="Geraldão Y"
              value={cage.geraldao.y}
              onChange={(y) => setGeraldao({ ...cage.geraldao, y })}
            />
            <NumField
              label="Geraldão Z"
              value={cage.geraldao.z}
              onChange={(z) => setGeraldao({ ...cage.geraldao, z })}
            />
            <NumField
              label="Base do assento Y"
              value={cage.seatBottomY}
              onChange={setSeatBottomY}
            />
          </div>

          <SectionBlock
            title="Tubo primário (B6.3.3)"
            which="primary"
            section={cage.primarySection}
            setSection={setSection}
          />
          <SectionBlock
            title="Tubo secundário (B6.3.4)"
            which="secondary"
            section={cage.secondarySection}
            setSection={setSection}
          />
          <div className="section muted" style={{ fontSize: 11, lineHeight: 1.5 }}>
            Seções default conforme relatório da Equipe FEI Baja 2 (2014): primário ABNT 4130 Ø31,75
            × 1,65 mm · secundário 4130 Ø25,4 × 0,9 mm. Escolha do 4130 corroborada pela literatura
            (Brandão et al., 2020; Shailesh, 2022; Barbosa et al., 2016 — UNESP-FEG). Geometria
            inspirada em fotos públicas dos protótipos FEI 2022–2026 (não é réplica). Referências em{' '}
            <i>revisao-bibliografica-gaiolas-baja.md</i>.
          </div>
        </>
      )}

      {group === 'analysis' && (
        <>
          <div className="section">
            <div className="section-title">Estimativa de massa (DF-2)</div>
            <NumField
              label="g por junta soldada"
              value={weldPerJointG(cage)}
              step={5}
              onChange={(v) => setWeightParams({ weldPerJointG: v })}
            />
            <NumField
              label="g por mm de cordão (0 = usar g/junta)"
              value={cage.weightParams?.weldPerMmG ?? 0}
              step={0.05}
              onChange={(v) => setWeightParams({ weldPerMmG: v > 0 ? v : undefined })}
            />
            <div className="muted" style={{ fontSize: 11 }}>
              Estimativa geométrica — não substitui pesagem. Gussets/luvas não modelados.
            </div>
          </div>

          <div className="section">
            <div className="section-title">Juntas &amp; solda (DF-7)</div>
            <div className="member-info">
              {joints.filter((j) => j.kind !== 'crossing').length} juntas ·{' '}
              {(['tee', 'wye', 'kn', 'butt'] as const)
                .map(
                  (k) =>
                    `${joints.filter((j) => j.kind === k).length} ${k === 'tee' ? 'T' : k === 'wye' ? 'Y' : k === 'kn' ? 'K/N' : 'topo'}`,
                )
                .join(' · ')}
            </div>
            <div className="member-info">
              cordão de solda total: {totalWeldLength(cage, joints).toFixed(0)} mm
            </div>
            {joints.some((j) => j.kind !== 'crossing' && j.angleDeg < 30) && (
              <div className="removal-bad">
                ⚠ junta(s) com θ &lt; 30° — boca de lobo e cordão crescem com 1/sin θ
              </div>
            )}
            {joints.some((j) => j.kind === 'crossing') && (
              <div className="removal-bad">
                ⚠ {joints.filter((j) => j.kind === 'crossing').length} cruzamento(s) sem nó — ver
                regra JOINT.X
              </div>
            )}
          </div>
        </>
      )}

      {group === 'pilot' && (
        <>
          <ManikinBlock />

          <SteeringBlock />
        </>
      )}

      {group === 'file' && (
        <div className="section actions">
          <button onClick={exportJson}>Exportar JSON</button>
          <label className="file-btn">
            Importar JSON
            <input type="file" accept=".json" onChange={importJson} hidden />
          </label>
          <button className="danger" onClick={reset}>
            Restaurar template
          </button>
        </div>
      )}
    </div>
  )
}
