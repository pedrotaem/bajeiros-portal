import * as THREE from 'three'
import type { Cage } from '@bajeiros/core/model/types'
import {
  defaultManikin,
  manikinReadings,
  profileById,
  solveManikin,
  type LandmarkId,
} from '@bajeiros/core/model/manikin'
import type { Vec3 } from '@bajeiros/core/model/types'

const S = 0.001

/**
 * Manequim ergonômico (DF-4) — visualização apenas (mesma regra do Geraldão):
 * raycast nulo, translúcido, nunca interfere na seleção nem nas regras.
 * Modo faixa: dois manequins (percentil mínimo ocre, máximo verde-acinzentado).
 */
export function Manikin({ cage }: { cage: Cage }) {
  const cfg = { ...defaultManikin(), ...cage.manikin }
  const variants = [
    { profile: profileById(cfg.profileMin), color: '#c2a36b' },
    { profile: profileById(cfg.profileMax), color: '#7ea88b' },
  ]
  return (
    <group>
      {variants.map(({ profile, color }) => (
        <ManikinFigure
          key={profile.id}
          cage={cage}
          cfg={cfg}
          profileId={profile.id}
          color={color}
        />
      ))}
    </group>
  )
}

const BONES: Array<[LandmarkId, LandmarkId]> = [
  ['hip', 'knee'],
  ['knee', 'ankle'],
  ['ankle', 'toe'],
  ['hip', 'shoulder'],
  ['shoulder', 'elbow'],
  ['elbow', 'wrist'],
]

function ManikinFigure({
  cage,
  cfg,
  profileId,
  color,
}: {
  cage: Cage
  cfg: ReturnType<typeof defaultManikin>
  profileId: string
  color: string
}) {
  const noRaycast = () => null
  const profile = profileById(profileId)
  const lm = solveManikin(cfg, profile, cage.seatBottomY, cage.geraldao.z)
  const r = manikinReadings(lm)
  void r
  const v = (p: Vec3) => new THREE.Vector3(p.x * S, p.y * S, p.z * S)
  const mat = <meshStandardMaterial color={color} transparent opacity={0.4} depthWrite={false} />
  const helmetCenter = {
    x: 0,
    y:
      lm.helmetTop.y -
      cfg.helmetRadiusMm *
        ((lm.helmetTop.y - lm.shoulder.y) /
          Math.hypot(lm.helmetTop.y - lm.shoulder.y, lm.helmetTop.z - lm.shoulder.z)),
    z:
      lm.helmetTop.z -
      cfg.helmetRadiusMm *
        ((lm.helmetTop.z - lm.shoulder.z) /
          Math.hypot(lm.helmetTop.y - lm.shoulder.y, lm.helmetTop.z - lm.shoulder.z)),
  }
  return (
    <group>
      {BONES.map(([a, b]) => {
        const av = v(lm[a])
        const bv = v(lm[b])
        const mid = av.clone().add(bv).multiplyScalar(0.5)
        const d = bv.clone().sub(av)
        const quat = new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          d.clone().normalize(),
        )
        return (
          <mesh key={`${a}-${b}`} raycast={noRaycast} position={mid} quaternion={quat}>
            <capsuleGeometry args={[0.035, Math.max(0.01, d.length() - 0.07), 4, 10]} />
            {mat}
          </mesh>
        )
      })}
      {/* cabeça + capacete */}
      <mesh raycast={noRaycast} position={v(helmetCenter)}>
        <sphereGeometry args={[cfg.helmetRadiusMm * S, 20, 20]} />
        {mat}
      </mesh>
    </group>
  )
}
