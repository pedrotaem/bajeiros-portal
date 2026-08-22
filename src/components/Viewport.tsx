import { useMemo, useRef } from 'react'
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber'
import { OrbitControls, Grid, Html } from '@react-three/drei'
import * as THREE from 'three'
import { useStore } from '../store'
import type { RuleResult } from '../rules/b6'
import { isNamedIn, anchorLabel, PRIMARY_TYPES } from '../model/types'
import { Geraldao } from './Geraldao'
import { chainOf } from '../model/continuity'
import { Manikin } from './Manikin'
import { defaultManikin, profileById, solveManikin } from '../model/manikin'

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
}

interface DragState {
  kind: 'node' | 'anchor' | 'steer'
  id: string
  plane: THREE.Plane
  start: THREE.Vector3
  active: boolean
}

function Scene({ results, removalMap }: Props) {
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
  const pending = useStore((s) => s.pending)

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
    else moveSteeringPoint(id, pos)
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
                startDrag('node', id, pos, e)
              }}
              onPointerMove={(e) => onDragMove('node', id, e)}
              onPointerUp={endDrag}
            >
              <sphereGeometry args={[sel ? 0.028 : 0.02, 16, 16]} />
              <meshStandardMaterial
                color={sel ? '#3b82f6' : pending ? '#f3a712' : named ? '#d8dee5' : '#6b7683'}
              />
            </mesh>
            <Html distanceFactor={4} style={{ pointerEvents: 'none' }}>
              <div className={named ? 'node-label' : 'node-label free'}>{id}</div>
            </Html>
          </group>
        )
      })}

      <mesh position={[cage.geraldao.x * S, cage.geraldao.y * S, cage.geraldao.z * S]}>
        <sphereGeometry args={[0.025, 16, 16]} />
        <meshStandardMaterial color="#22c55e" emissive="#14532d" />
      </mesh>

      {showGeraldao && <Geraldao geraldao={cage.geraldao} />}
      {showManikin && <Manikin cage={cage} />}

      {/* Ancoragens da suspensão */}
      {(cage.anchors ?? []).map((a) => {
        const sel = a.id === selectedAnchor
        const pos = new THREE.Vector3(a.pos.x * S, a.pos.y * S, a.pos.z * S)
        return (
          <group key={a.id} position={pos}>
            <mesh
              onPointerDown={(e) => {
                e.stopPropagation()
                if (pending) return
                selectAnchor(a.id)
                startDrag('anchor', a.id, pos, e)
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
            {sel && (
              <Html distanceFactor={4} style={{ pointerEvents: 'none' }}>
                <div className="node-label anchor">{anchorLabel(a)}</div>
              </Html>
            )}
          </group>
        )
      })}

      {/* Ancoragem do volante (DF-5) — octaedro ciano com alvo ampliado */}
      {(cage.steering?.points ?? []).map((pt) => {
        const sel = pt.id === selectedSteering
        const pos = new THREE.Vector3(pt.pos.x * S, pt.pos.y * S, pt.pos.z * S)
        return (
          <group key={pt.id} position={pos}>
            <mesh
              onPointerDown={(e) => {
                e.stopPropagation()
                if (pending) return
                selectSteering(pt.id)
                startDrag('steer', pt.id, pos, e)
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
            {sel && (
              <Html distanceFactor={4} style={{ pointerEvents: 'none' }}>
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

      <OrbitControls target={[0, 0.7, 0.3]} makeDefault />
    </>
  )
}

export function Viewport(props: Props) {
  const selectNode = useStore((s) => s.selectNode)
  const selectMember = useStore((s) => s.selectMember)
  const selectAnchor = useStore((s) => s.selectAnchor)
  const selectSteering = useStore((s) => s.selectSteering)
  return (
    <Canvas
      camera={{ position: [2.6, 1.8, 2.8], fov: 45 }}
      style={{ background: '#14181d' }}
      onPointerMissed={() => {
        selectNode(null)
        selectMember(null)
        selectAnchor(null)
        selectSteering(null)
      }}
    >
      <Scene {...props} />
    </Canvas>
  )
}
