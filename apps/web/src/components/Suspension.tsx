import { useMemo } from 'react'
import * as THREE from 'three'
import type { Cage } from '@bajeiros/core/model/types'
import { suspensionBodies, type Body } from '@bajeiros/core/model/suspension'
import { viewport3d } from '../tokens'

const S = 0.001 // mm → m na cena

/**
 * Corpos genéricos da suspensão (DF-30) — visualização apenas, como Geraldão e manequim:
 * raycast nulo, nunca capturam clique, não entram em regra nem em massa. Tudo é cilindro
 * (`suspensionBodies` devolve `{a, b, r}` em mm), na cor compartilhada com as ancoragens —
 * a distinção é por forma e volume (design-system §9.3), e a camada translúcida ganha
 * arame opaco na mesma cor para não sumir contra o fundo (§9.5).
 */
export function Suspension({ cage }: { cage: Cage }) {
  const bodies = useMemo(() => suspensionBodies(cage), [cage])
  return (
    <group>
      {bodies.map((b, i) => (
        <BodyMesh key={`${b.axle}-${b.side}-${b.kind}-${i}`} body={b} />
      ))}
    </group>
  )
}

const noRaycast = () => null
const UP = new THREE.Vector3(0, 1, 0)

function BodyMesh({ body }: { body: Body }) {
  const { position, quaternion, length } = useMemo(() => {
    const av = new THREE.Vector3(body.a.x * S, body.a.y * S, body.a.z * S)
    const bv = new THREE.Vector3(body.b.x * S, body.b.y * S, body.b.z * S)
    const dir = bv.clone().sub(av)
    return {
      position: av.clone().add(bv).multiplyScalar(0.5),
      quaternion: new THREE.Quaternion().setFromUnitVectors(UP, dir.clone().normalize()),
      length: Math.max(0.001, dir.length()),
    }
  }, [body])
  const r = body.r * S
  // pneu e aro são volumes grandes: mais faces e menos opacidade; peças pequenas, o inverso
  const big = body.kind === 'tire' || body.kind === 'rim'
  const segments = big ? 28 : 12
  const color = viewport3d['anchor-ok']
  return (
    <group position={position} quaternion={quaternion}>
      <mesh raycast={noRaycast}>
        <cylinderGeometry args={[r, r, length, segments]} />
        <meshStandardMaterial
          color={color}
          transparent
          opacity={big ? 0.22 : 0.4}
          depthWrite={false}
          metalness={0.2}
          roughness={0.7}
        />
      </mesh>
      <mesh raycast={noRaycast}>
        <cylinderGeometry args={[r, r, length, big ? segments : 6, 1, true]} />
        <meshBasicMaterial color={color} wireframe transparent opacity={big ? 0.5 : 0.7} />
      </mesh>
    </group>
  )
}
