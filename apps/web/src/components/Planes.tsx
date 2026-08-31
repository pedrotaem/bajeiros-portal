import { useMemo } from 'react'
import * as THREE from 'three'
import { Html } from '@react-three/drei'
import type { CagePlane } from '@bajeiros/core/model/planes'
import type { Cage } from '@bajeiros/core/model/types'
import { viewport3d } from '../tokens'

const S = 0.001 // mm → m na cena

/**
 * Planos dos pontos denominados (DF-22): preenchimento translúcido + contorno.
 *
 * O preenchimento é clicável, e isso é seguro por construção: a superfície passa
 * pelo EIXO dos tubos e pelo CENTRO dos nós, então a esfera do nó (r = 20 mm) e o
 * cilindro do tubo (r = 12,7 mm) estão sempre mais perto da câmera que o plano —
 * o raio do ponteiro encontra o elemento antes da superfície e clicar num nó
 * continua selecionando o nó.
 */
export function Planes({
  cage,
  planes,
  selected,
  onSelect,
}: {
  cage: Cage
  planes: CagePlane[]
  selected: string | null
  onSelect: (id: string) => void
}) {
  return (
    <group>
      {planes.map((p) => (
        <PlaneMesh
          key={p.id}
          cage={cage}
          plane={p}
          selected={p.id === selected}
          onSelect={onSelect}
        />
      ))}
    </group>
  )
}

function PlaneMesh({
  cage,
  plane,
  selected,
  onSelect,
}: {
  cage: Cage
  plane: CagePlane
  selected: boolean
  onSelect: (id: string) => void
}) {
  // leque de triângulos a partir do centro: exato para o contorno convexo que
  // `planeOf` devolve (ordenação angular)
  const { fill, loop } = useMemo(() => {
    const pts = plane.points.map((id) => cage.nodes[id]).filter(Boolean)
    const f: number[] = []
    const l: number[] = []
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]
      const b = pts[(i + 1) % pts.length]
      f.push(plane.center.x * S, plane.center.y * S, plane.center.z * S)
      f.push(a.x * S, a.y * S, a.z * S)
      f.push(b.x * S, b.y * S, b.z * S)
      l.push(a.x * S, a.y * S, a.z * S)
    }
    return { fill: new Float32Array(f), loop: new Float32Array(l) }
  }, [cage, plane])

  const color = selected ? viewport3d.selected : viewport3d.datum
  return (
    <group>
      <mesh
        onClick={(e) => {
          e.stopPropagation()
          onSelect(plane.id)
        }}
      >
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[fill, 3]} />
        </bufferGeometry>
        <meshBasicMaterial
          color={color}
          transparent
          opacity={selected ? 0.24 : 0.08}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <lineLoop raycast={() => null}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[loop, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color={color} transparent opacity={selected ? 1 : 0.45} />
      </lineLoop>
      {selected && (
        <Html
          position={[plane.center.x * S, plane.center.y * S, plane.center.z * S]}
          distanceFactor={4}
          zIndexRange={[40, 0]}
          style={{ pointerEvents: 'none' }}
        >
          <div className="node-label plane">{plane.points.join(' · ')}</div>
        </Html>
      )}
    </group>
  )
}
