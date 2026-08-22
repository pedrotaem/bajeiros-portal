import * as THREE from 'three'
import type { Vec3 } from '../model/types'

const S = 0.001 // mm → m
const COLOR = '#7da2c4' // cinza-azulado translúcido — não compete com status

/**
 * Gabarito "Geraldão" (DF-3) — visualização apenas; nunca captura cliques.
 * Malha própria (paráfrase do gabarito normativo), derivada das medidas que o
 * regulamento manda verificar com ele:
 *  - círculo R102 tangente ao assento e ao encosto (define o ponto mais traseiro do assento)
 *  - largura mínima do RRH 737 mm medida a 686 mm acima desse ponto (B6.2.4.3)
 *  - pontos C: ≥ 1041 mm acima e ≥ 305 mm à frente do mesmo ponto (B6.2.7.4/7.5)
 * Modelo geométrico: assento horizontal em y = geraldao.y; encosto vertical em
 * z = geraldao.z − 102; centro do círculo em (0, y+102, z).
 */
export function Geraldao({ geraldao }: { geraldao: Vec3 }) {
  const noRaycast = () => null
  const mat = (
    <meshStandardMaterial
      color={COLOR}
      transparent
      opacity={0.35}
      depthWrite={false}
      side={THREE.DoubleSide}
    />
  )
  const g = { x: 0, y: geraldao.y * S, z: geraldao.z * S }
  return (
    <group>
      {/* círculo R102 tangente assento/encosto */}
      <mesh raycast={noRaycast} position={[g.x, g.y + 0.102, g.z]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.102, 0.102, 0.02, 40]} />
        {mat}
      </mesh>
      {/* assento (referência tangente horizontal) */}
      <mesh raycast={noRaycast} position={[g.x, g.y - 0.004, g.z + 0.2]}>
        <boxGeometry args={[0.45, 0.008, 0.4]} />
        {mat}
      </mesh>
      {/* encosto (referência tangente vertical, 102 mm atrás do ponto) */}
      <mesh raycast={noRaycast} position={[g.x, g.y + 0.3, g.z - 0.102 - 0.004]}>
        <boxGeometry args={[0.45, 0.6, 0.008]} />
        {mat}
      </mesh>
      {/* mastro de medição: do ponto do Geraldão até 1041 mm */}
      <mesh raycast={noRaycast} position={[g.x, g.y + 1.041 / 2, g.z]}>
        <cylinderGeometry args={[0.006, 0.006, 1.041, 8]} />
        {mat}
      </mesh>
      {/* travessa a 686 mm — largura mínima do RRH 737 mm (B6.2.4.3) */}
      <mesh raycast={noRaycast} position={[g.x, g.y + 0.686, g.z]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.006, 0.006, 0.737, 8]} />
        {mat}
      </mesh>
      {/* topo a 1041 mm com braço de 305 mm à frente — limites dos pontos C (B6.2.7.4/7.5) */}
      <mesh
        raycast={noRaycast}
        position={[g.x, g.y + 1.041, g.z + 0.305 / 2]}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <cylinderGeometry args={[0.006, 0.006, 0.305, 8]} />
        {mat}
      </mesh>
    </group>
  )
}
