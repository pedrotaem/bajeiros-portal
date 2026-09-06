import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber'
import { OrbitControls, Grid, Html } from '@react-three/drei'
import * as THREE from 'three'
import { useStore } from '../store'
import { viewport3d } from '../tokens'
import type { RuleResult } from '@bajeiros/core/rules/b6'
import type { Axle, Cage, Side } from '@bajeiros/core/model/types'
import {
  isLocked,
  isNamedIn,
  anchorLabel,
  wheelLockId,
  PRIMARY_TYPES,
} from '@bajeiros/core/model/types'
import { AXLES, SIDES, wheelCenter } from '@bajeiros/core/model/suspension'
import { dist } from '@bajeiros/core/rules/geometry'
import { Geraldao } from './Geraldao'
import { Suspension } from './Suspension'
import { chainOf } from '@bajeiros/core/model/continuity'
import { Manikin } from './Manikin'
import { Planes } from './Planes'
import type { CagePlane } from '@bajeiros/core/model/planes'
import { defaultManikin, profileById, solveManikin } from '@bajeiros/core/model/manikin'

const S = 0.001 // mm → m na cena
const DRAG_THRESHOLD = 0.005 // 5 mm em cena: distingue clique de arrasto

const COLORS = {
  primary: '#b8c4d0', // membros primários (B6.2.2.2) — aço claro
  secondary: '#5c6b7a', // membros secundários (B6.2.2.3) — aço escuro
  warn: '#e6a817',
  fail: '#e5484d',
  highlight: '#3b82f6',
  selected: '#a855f7',
  chain: '#c9a7f5', // demais segmentos do tubo físico contínuo selecionado (DF-6)
  redundant: '#2dd4bf',
}

interface Props {
  results: RuleResult[]
  removalMap: Record<string, string[]>
  planes: CagePlane[]
}

interface DragState {
  kind: 'node' | 'anchor' | 'steer' | 'wheel'
  id: string
  plane: THREE.Plane
  start: THREE.Vector3
  active: boolean
}

/**
 * Marca de "travado no espaço" (DF-23): gaiola de arame em volta do elemento.
 * É distinção por FORMA, não por cor — o canal de cor da cena já carrega status
 * (infração, atenção, redundância) e identidade (primário/secundário).
 */
function LockMark() {
  return (
    <mesh raycast={() => null}>
      <boxGeometry args={[0.058, 0.058, 0.058]} />
      <meshBasicMaterial color={viewport3d['node-named']} wireframe transparent opacity={0.85} />
    </mesh>
  )
}

const VIEW_DIR: Record<string, THREE.Vector3> = {
  // lado esquerdo do piloto: com +Z para a frente, a câmera em −X põe o nariz à direita
  lateral: new THREE.Vector3(-1, 0, 0),
  frontal: new THREE.Vector3(0, 0, 1),
  // o ε em −Z evita o degenerado (direção paralela ao `up`) e deixa a frente para cima
  superior: new THREE.Vector3(0, 1, -0.001),
  iso: new THREE.Vector3(1, 0.75, 1),
}

/** Alvo inicial da órbita — constante de módulo para o R3F não reaplicar a cada render. */
const INITIAL_TARGET: [number, number, number] = [0, 0.7, 0.3]

/** Caixa que envolve tudo o que a cena desenha a partir da gaiola. */
function cageBounds(cage: Cage, withWheels: boolean): THREE.Box3 {
  const box = new THREE.Box3()
  const add = (p: { x: number; y: number; z: number }) =>
    box.expandByPoint(new THREE.Vector3(p.x * S, p.y * S, p.z * S))
  for (const n of Object.values(cage.nodes)) add(n)
  add(cage.geraldao)
  for (const a of cage.anchors ?? []) add(a.pos)
  for (const p of cage.steering?.points ?? []) add(p.pos)
  // DF-30: com os corpos ligados, o pneu é o que mais sai da gaiola — entra inteiro
  if (withWheels && cage.suspension) {
    for (const axle of AXLES) {
      const r = cage.suspension[axle].tire.od / 2
      for (const side of SIDES) {
        const c = wheelCenter(cage.suspension, axle, side)
        add({ x: c.x, y: c.y - r, z: c.z - r })
        add({ x: c.x, y: c.y + r, z: c.z + r })
      }
    }
  }
  if (box.isEmpty()) box.set(new THREE.Vector3(-0.5, 0, -0.5), new THREE.Vector3(0.5, 1, 0.5))
  return box
}

/**
 * Distância que põe a caixa inteira dentro do tronco de visão. Cada canto exige
 * `dz + lateral/tan(meio-ângulo)`; o maior manda. Enquadrar pela ESFERA seria uma
 * linha a menos e desperdiçaria meia tela: a gaiola é comprida e baixa, e vista de
 * lado a esfera que a envolve tem o diâmetro da diagonal.
 */
function fitDistance(box: THREE.Box3, dir: THREE.Vector3, camera: THREE.PerspectiveCamera): number {
  const center = box.getCenter(new THREE.Vector3())
  const forward = dir.clone().negate()
  const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize()
  const up = new THREE.Vector3().crossVectors(right, forward).normalize()
  const tanV = Math.tan((camera.fov * Math.PI) / 360)
  const tanH = tanV * camera.aspect
  const min = box.min
  const max = box.max
  let dist = 0
  for (const x of [min.x, max.x]) {
    for (const y of [min.y, max.y]) {
      for (const z of [min.z, max.z]) {
        const v = new THREE.Vector3(x, y, z).sub(center)
        const dz = v.dot(dir)
        dist = Math.max(dist, dz + Math.abs(v.dot(right)) / tanH, dz + Math.abs(v.dot(up)) / tanV)
      }
    }
  }
  return Math.max(dist * 1.08, 0.3)
}

/**
 * Vistas canônicas (DF-23). O botão também ENQUADRA: a distância sai do raio da
 * esfera que envolve a gaiola, então "Lateral" numa gaiola grande e numa pequena
 * enche a tela do mesmo jeito. `up` fica sempre em +Y para o OrbitControls não
 * trocar o eixo de órbita debaixo da mão de quem arrasta em seguida.
 */
function CameraRig() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const controls = useThree((s) => s.controls) as {
    target: THREE.Vector3
    update: () => void
  } | null
  const cameraView = useStore((s) => s.cameraView)
  useEffect(() => {
    if (!cameraView || !controls) return
    const dir = VIEW_DIR[cameraView.view]?.clone().normalize()
    if (!dir) return
    // um quadro de espera: recolher uma lateral muda o tamanho do canvas, e o
    // `camera.aspect` só é atualizado no próximo frame — enquadrar antes disso
    // usaria a largura antiga e a gaiola sairia torta na tela
    const id = requestAnimationFrame(() => {
      // a gaiola é lida do store no momento do clique: reenquadrar não pode virar
      // efeito que dispara a cada edição de geometria
      const st = useStore.getState()
      const box = cageBounds(st.cage, st.showSuspension && !!st.cage.suspension)
      const center = box.getCenter(new THREE.Vector3())
      const dist = fitDistance(box, dir, camera)
      camera.up.set(0, 1, 0)
      camera.position.copy(center.clone().add(dir.multiplyScalar(dist)))
      camera.lookAt(center)
      controls.target.copy(center)
      controls.update()
    })
    return () => cancelAnimationFrame(id)
  }, [cameraView, controls, camera])
  return null
}

/**
 * Cota flutuante do tubo selecionado (DF-22 §11). Mesmo contrato do `CommitField` do
 * inspetor: Enter aplica, Esc descarta, sair do campo aplica — o valor intermediário nunca
 * vira geometria. Aplicar desloca a ponta `b` sobre o eixo do tubo (`setDistance`), com o
 * espelho e a trava valendo como no painel.
 *
 * O formulário é um componente PRÓPRIO renderizado dentro do `Html`: o drei monta o portal
 * num root React separado, e um input controlado cujo estado mora fora desse root perde
 * teclas — o root do portal "restaura" o valor antigo antes de o estado novo chegar do outro
 * root. Com o rascunho dentro do portal, o input e o estado vivem no mesmo root.
 */
function LengthField({ cage, memberId }: { cage: Cage; memberId: string }) {
  const setDistance = useStore((s) => s.setDistance)
  const m = cage.members.find((x) => x.id === memberId)
  const a = m ? cage.nodes[m.a] : undefined
  const b = m ? cage.nodes[m.b] : undefined
  if (!m || !a || !b) return null
  const mid: [number, number, number] = [
    ((a.x + b.x) / 2) * S,
    ((a.y + b.y) / 2) * S + 0.03,
    ((a.z + b.z) / 2) * S,
  ]
  return (
    <Html position={mid} center zIndexRange={[45, 0]} style={{ pointerEvents: 'auto' }}>
      <LengthForm
        from={m.a}
        to={m.b}
        length={dist(a, b)}
        locked={isLocked(cage, m.b)}
        onCommit={(v) => setDistance(m.a, m.b, v, 'b')}
      />
    </Html>
  )
}

function LengthForm({
  from,
  to,
  length,
  locked,
  onCommit,
}: {
  from: string
  to: string
  length: number
  locked: boolean
  onCommit: (mm: number) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const cancel = useRef(false)
  const commit = () => {
    if (cancel.current) {
      cancel.current = false
      setDraft(null)
      return
    }
    if (draft === null) return
    const v = Number(draft.replace(',', '.'))
    setDraft(null)
    if (Number.isFinite(v) && v > 0) onCommit(v)
  }
  return (
    <form
      className="length-field"
      onPointerDown={(e) => e.stopPropagation()}
      onSubmit={(e) => {
        e.preventDefault()
        ;(e.currentTarget.querySelector('input') as HTMLInputElement | null)?.blur()
      }}
    >
      <span className="length-field-label">
        {from}→{to}
      </span>
      {/* texto com teclado decimal, não `number`: `select()` no foco só é garantido em texto,
          e o campo aceita vírgula — o `commit` já troca por ponto */}
      <input
        type="text"
        inputMode="decimal"
        autoFocus
        disabled={locked}
        title={
          locked
            ? `${to} travado: destrave para cotar por aqui`
            : 'comprimento do tubo (mm) · Enter aplica · Esc descarta'
        }
        value={draft ?? Math.round(length * 100) / 100}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            cancel.current = true
            e.currentTarget.blur()
          }
        }}
      />
      <span className="length-field-unit">mm</span>
      {locked && <span className="length-field-lock">🔒 {to}</span>}
    </form>
  )
}

function Scene({ results, removalMap, planes }: Props) {
  const cage = useStore((s) => s.cage)
  const selectedNode = useStore((s) => s.selectedNode)
  const selectedMember = useStore((s) => s.selectedMember)
  const selectedAnchor = useStore((s) => s.selectedAnchor)
  const pickNode = useStore((s) => s.pickNode)
  const selectNode = useStore((s) => s.selectNode)
  const selectMember = useStore((s) => s.selectMember)
  const selectAnchor = useStore((s) => s.selectAnchor)
  const moveNode = useStore((s) => s.moveNode)
  const moveAnchor = useStore((s) => s.moveAnchor)
  const moveSteeringPoint = useStore((s) => s.moveSteeringPoint)
  const selectedSteering = useStore((s) => s.selectedSteering)
  const selectSteering = useStore((s) => s.selectSteering)
  const highlightRule = useStore((s) => s.highlightRule)
  const showRedundant = useStore((s) => s.showRedundant)
  const showGeraldao = useStore((s) => s.showGeraldao)
  const showManikin = useStore((s) => s.showManikin)
  const showPlanes = useStore((s) => s.showPlanes)
  const selectedPlane = useStore((s) => s.selectedPlane)
  const selectPlane = useStore((s) => s.selectPlane)
  const pending = useStore((s) => s.pending)
  const showLabels = useStore((s) => s.showLabels)
  const showSuspension = useStore((s) => s.showSuspension)
  const showAnchors = useStore((s) => s.showAnchors)
  const selectedWheel = useStore((s) => s.selectedWheel)
  const selectWheel = useStore((s) => s.selectWheel)
  const moveWheelCenter = useStore((s) => s.moveWheelCenter)

  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as { enabled: boolean } | null
  const drag = useRef<DragState | null>(null)

  const memberStatus = useMemo(() => {
    const map: Record<string, 'pass' | 'warn' | 'fail'> = {}
    for (const m of cage.members) map[m.id] = 'pass'
    for (const r of results) {
      if (r.status === 'pass' || r.status === 'manual') continue
      for (const id of r.members) {
        if (r.status === 'fail') map[id] = 'fail'
        else if (map[id] !== 'fail') map[id] = 'warn'
      }
    }
    return map
  }, [cage.members, results])

  const highlighted = useMemo(() => {
    if (!highlightRule) return new Set<string>()
    const r = results.find((x) => x.id === highlightRule)
    return new Set(r?.members ?? [])
  }, [highlightRule, results])

  // DF-6: cadeia física do membro selecionado (destacada em roxo claro)
  const selectedChain = useMemo(() => {
    if (!selectedMember) return new Set<string>()
    return new Set(chainOf(cage, selectedMember).map((m) => m.id))
  }, [cage, selectedMember])

  function startDrag(
    kind: DragState['kind'],
    id: string,
    pos: THREE.Vector3,
    e: ThreeEvent<PointerEvent>,
  ) {
    const normal = new THREE.Vector3()
    camera.getWorldDirection(normal)
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, pos)
    drag.current = { kind, id, plane, start: pos.clone(), active: false }
    if (controls) controls.enabled = false
    ;(e.target as Element).setPointerCapture(e.pointerId)
  }

  function onDragMove(kind: DragState['kind'], id: string, e: ThreeEvent<PointerEvent>) {
    const d = drag.current
    if (!d || d.kind !== kind || d.id !== id) return
    const v = new THREE.Vector3()
    if (!e.ray.intersectPlane(d.plane, v)) return
    if (!d.active) {
      if (v.distanceTo(d.start) < DRAG_THRESHOLD) return
      d.active = true
    }
    const pos = { x: Math.round(v.x / S), y: Math.round(v.y / S), z: Math.round(v.z / S) }
    if (kind === 'node') moveNode(id, pos)
    else if (kind === 'anchor') moveAnchor(id, pos)
    else if (kind === 'wheel') {
      const [axle, side] = id.split('|') as [Axle, Side]
      moveWheelCenter(axle, side, pos)
    } else moveSteeringPoint(id, pos)
  }

  function endDrag(e: ThreeEvent<PointerEvent>) {
    if (!drag.current) return
    drag.current = null
    if (controls) controls.enabled = true
    ;(e.target as Element).releasePointerCapture(e.pointerId)
  }

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 8, 3]} intensity={1.2} />
      <Grid args={[8, 8]} cellColor="#2a3138" sectionColor="#3a434c" position={[0, 0, 0]} />

      {cage.members.map((m) => {
        const a = cage.nodes[m.a]
        const b = cage.nodes[m.b]
        if (!a || !b) return null
        const av = new THREE.Vector3(a.x * S, a.y * S, a.z * S)
        const bv = new THREE.Vector3(b.x * S, b.y * S, b.z * S)
        const mid = av.clone().add(bv).multiplyScalar(0.5)
        const dir = bv.clone().sub(av)
        const length = dir.length()
        const quat = new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          dir.clone().normalize(),
        )
        const status = memberStatus[m.id]
        let color: string =
          status === 'pass'
            ? PRIMARY_TYPES.includes(m.type)
              ? COLORS.primary
              : COLORS.secondary
            : COLORS[status]
        if (showRedundant && status === 'pass' && removalMap[m.id]?.length === 0) {
          color = COLORS.redundant
        }
        if (highlighted.has(m.id)) color = COLORS.highlight
        if (selectedChain.has(m.id)) color = COLORS.chain
        if (m.id === selectedMember) color = COLORS.selected
        return (
          <mesh
            key={m.id}
            position={mid}
            quaternion={quat}
            onClick={(e) => {
              e.stopPropagation()
              if (!pending) selectMember(m.id)
            }}
          >
            <cylinderGeometry args={[0.0127, 0.0127, length, 10]} />
            <meshStandardMaterial color={color} metalness={0.4} roughness={0.5} />
          </mesh>
        )
      })}

      {Object.entries(cage.nodes).map(([id, n]) => {
        const named = isNamedIn(cage, id)
        const sel = id === selectedNode || pending?.first === id
        const locked = isLocked(cage, id)
        const pos = new THREE.Vector3(n.x * S, n.y * S, n.z * S)
        return (
          <group key={id} position={pos}>
            <mesh
              onPointerDown={(e) => {
                e.stopPropagation()
                if (pending) {
                  pickNode(id)
                  return
                }
                selectNode(id)
                // travado seleciona, mas não arrasta — e nem suspende a órbita
                if (!locked) startDrag('node', id, pos, e)
              }}
              onPointerMove={(e) => onDragMove('node', id, e)}
              onPointerUp={endDrag}
            >
              <sphereGeometry args={[sel ? 0.028 : 0.02, 16, 16]} />
              <meshStandardMaterial
                color={sel ? '#3b82f6' : pending ? '#f3a712' : named ? '#d8dee5' : '#6b7683'}
              />
            </mesh>
            {locked && <LockMark />}
            {(showLabels || sel) && (
              <Html distanceFactor={4} zIndexRange={[40, 0]} style={{ pointerEvents: 'none' }}>
                <div className={named ? 'node-label' : 'node-label free'}>{id}</div>
              </Html>
            )}
          </group>
        )
      })}

      {/* DF-22 §11: cota flutuante do tubo selecionado — some em "adicionar membro" */}
      {selectedMember && !pending && (
        <LengthField key={selectedMember} cage={cage} memberId={selectedMember} />
      )}

      <mesh position={[cage.geraldao.x * S, cage.geraldao.y * S, cage.geraldao.z * S]}>
        <sphereGeometry args={[0.025, 16, 16]} />
        <meshStandardMaterial color="#22c55e" emissive="#14532d" />
      </mesh>

      {showGeraldao && <Geraldao geraldao={cage.geraldao} />}
      {showManikin && <Manikin cage={cage} />}
      {/* durante "adicionar membro" os planos saem de cena: o clique ali é para nó */}
      {showPlanes && !pending && (
        <Planes cage={cage} planes={planes} selected={selectedPlane} onSelect={selectPlane} />
      )}

      {/* Corpos genéricos da suspensão (DF-30) — nunca capturam clique */}
      {showSuspension && cage.suspension && <Suspension cage={cage} />}

      {/* Ancoragens da suspensão */}
      {showAnchors &&
        (cage.anchors ?? []).map((a) => {
          const sel = a.id === selectedAnchor
          const locked = isLocked(cage, a.id)
          const pos = new THREE.Vector3(a.pos.x * S, a.pos.y * S, a.pos.z * S)
          return (
            <group key={a.id} position={pos}>
              <mesh
                onPointerDown={(e) => {
                  e.stopPropagation()
                  if (pending) return
                  selectAnchor(a.id)
                  if (!locked) startDrag('anchor', a.id, pos, e)
                }}
                onPointerMove={(e) => onDragMove('anchor', a.id, e)}
                onPointerUp={endDrag}
              >
                <sphereGeometry args={[0.04, 8, 8]} />
                <meshBasicMaterial transparent opacity={0} depthWrite={false} />
              </mesh>
              <mesh>
                <octahedronGeometry args={[sel ? 0.026 : 0.018]} />
                <meshStandardMaterial
                  color={sel ? '#3b82f6' : a.role === 'amort' ? '#fb7185' : '#fb923c'}
                />
              </mesh>
              {locked && <LockMark />}
              {sel && (
                <Html distanceFactor={4} zIndexRange={[40, 0]} style={{ pointerEvents: 'none' }}>
                  <div className="node-label anchor">{anchorLabel(a)}</div>
                </Html>
              )}
            </group>
          )
        })}

      {/* Centros de roda (DF-30): cubo na cor de ancoragem — mesma cor, outra forma (§9.3) */}
      {showAnchors &&
        cage.suspension &&
        AXLES.flatMap((axle) =>
          SIDES.map((side) => {
            const c = wheelCenter(cage.suspension!, axle, side)
            const sel = selectedWheel?.axle === axle && selectedWheel.side === side
            const locked = isLocked(cage, wheelLockId(axle))
            const pos = new THREE.Vector3(c.x * S, c.y * S, c.z * S)
            const id = `${axle}|${side}`
            return (
              <group key={id} position={pos}>
                <mesh
                  onPointerDown={(e) => {
                    e.stopPropagation()
                    if (pending) return
                    selectWheel({ axle, side })
                    if (!locked) startDrag('wheel', id, pos, e)
                  }}
                  onPointerMove={(e) => onDragMove('wheel', id, e)}
                  onPointerUp={endDrag}
                >
                  <sphereGeometry args={[0.045, 8, 8]} />
                  <meshBasicMaterial transparent opacity={0} depthWrite={false} />
                </mesh>
                <mesh>
                  <boxGeometry args={sel ? [0.036, 0.036, 0.036] : [0.026, 0.026, 0.026]} />
                  <meshStandardMaterial
                    color={sel ? viewport3d.selected : viewport3d['anchor-ok']}
                  />
                </mesh>
                {locked && <LockMark />}
                {sel && (
                  <Html distanceFactor={4} zIndexRange={[40, 0]} style={{ pointerEvents: 'none' }}>
                    <div className="node-label anchor">
                      roda {axle} {side} · centro
                    </div>
                  </Html>
                )}
              </group>
            )
          }),
        )}

      {/* Ancoragem do volante (DF-5) — octaedro ciano com alvo ampliado */}
      {(cage.steering?.points ?? []).map((pt) => {
        const sel = pt.id === selectedSteering
        const locked = isLocked(cage, pt.id)
        const pos = new THREE.Vector3(pt.pos.x * S, pt.pos.y * S, pt.pos.z * S)
        return (
          <group key={pt.id} position={pos}>
            <mesh
              onPointerDown={(e) => {
                e.stopPropagation()
                if (pending) return
                selectSteering(pt.id)
                if (!locked) startDrag('steer', pt.id, pos, e)
              }}
              onPointerMove={(e) => onDragMove('steer', pt.id, e)}
              onPointerUp={endDrag}
            >
              <sphereGeometry args={[0.04, 8, 8]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
            <mesh>
              <octahedronGeometry args={[sel ? 0.026 : 0.018]} />
              <meshStandardMaterial color={sel ? '#3b82f6' : '#22d3ee'} />
            </mesh>
            {locked && <LockMark />}
            {sel && (
              <Html distanceFactor={4} zIndexRange={[40, 0]} style={{ pointerEvents: 'none' }}>
                <div className="node-label anchor">volante · {pt.id}</div>
              </Html>
            )}
          </group>
        )
      })}

      {/* Zona recomendada do punho (DF-5 × DF-4) */}
      {showManikin &&
        cage.steering &&
        (() => {
          const cfg = { ...defaultManikin(), ...cage.manikin }
          const wrist = solveManikin(
            cfg,
            profileById(cfg.profileMax),
            cage.seatBottomY,
            cage.geraldao.z,
          ).wrist
          const r = (cage.steering.zoneRadiusMm ?? 50) * S
          return (
            <mesh raycast={() => null} position={[wrist.x * S, wrist.y * S, wrist.z * S]}>
              <sphereGeometry args={[r, 20, 20]} />
              <meshStandardMaterial color="#22d3ee" transparent opacity={0.18} depthWrite={false} />
            </mesh>
          )
        })()}

      <OrbitControls target={INITIAL_TARGET} makeDefault />
      <CameraRig />
    </>
  )
}

export function Viewport(props: Props) {
  const selectNode = useStore((s) => s.selectNode)
  const selectMember = useStore((s) => s.selectMember)
  const selectAnchor = useStore((s) => s.selectAnchor)
  const selectSteering = useStore((s) => s.selectSteering)
  const selectPlane = useStore((s) => s.selectPlane)
  const selectWheel = useStore((s) => s.selectWheel)
  return (
    <Canvas
      camera={{ position: [2.6, 1.8, 2.8], fov: 45 }}
      style={{ background: '#14181d' }}
      onPointerMissed={() => {
        selectNode(null)
        selectMember(null)
        selectAnchor(null)
        selectSteering(null)
        selectPlane(null)
        selectWheel(null)
      }}
    >
      <Scene {...props} />
    </Canvas>
  )
}
