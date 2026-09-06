import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { Cage, Side } from '@bajeiros/core/model/types'
import { suspensionBodies, type Body } from '@bajeiros/core/model/suspension'
import { viewport3d } from '../tokens'

const S = 0.001 // mm → m na cena
const noRaycast = () => null
const UP = new THREE.Vector3(0, 1, 0)

/**
 * Corpos da suspensão (DF-30) — visualização apenas, como Geraldão e manequim: raycast nulo,
 * nunca capturam clique, não entram em regra nem em massa.
 *
 * Braços, bandejas, manga, cubo e amortecedor são tubos SÓLIDOS com o material do chassi, na
 * cor `--bj-3d-suspension` — um passo acima do tubo secundário, para a suspensão ler como
 * estrutura sem passar por membro da gaiola. A roda tem volume de verdade: pneu revolucionado
 * com ombro arredondado, garras off-road em duas fileiras alternadas e letra branca na lateral
 * externa; aro em prato e cubo. A geometria de todos sai de `suspensionBodies` (mm); o pneu usa
 * o cilindro-envelope (`kind: 'tire'`) como centro, largura e raio.
 */
export function Suspension({ cage }: { cage: Cage }) {
  const bodies = useMemo(() => suspensionBodies(cage), [cage])
  const cfg = cage.suspension
  if (!cfg) return null
  return (
    <group>
      {bodies
        .filter((b) => b.kind !== 'tire' && b.kind !== 'rim')
        .map((b, i) => (
          <Tube key={`${b.axle}-${b.side}-${b.kind}-${i}`} body={b} />
        ))}
      {bodies
        .filter((b) => b.kind === 'tire')
        .map((b) => (
          <Wheel
            key={`${b.axle}-${b.side}`}
            tire={b}
            rimR={cfg[b.axle].tire.rim / 2}
            side={b.side}
          />
        ))}
    </group>
  )
}

/** Mesmo acabamento dos membros da gaiola (Viewport): metálico fosco. */
function TubeMaterial({ color }: { color: string }) {
  return <meshStandardMaterial color={color} metalness={0.4} roughness={0.55} />
}

function frame(a: THREE.Vector3, b: THREE.Vector3) {
  const dir = b.clone().sub(a)
  return {
    position: a.clone().add(b).multiplyScalar(0.5),
    quaternion: new THREE.Quaternion().setFromUnitVectors(UP, dir.clone().normalize()),
    length: Math.max(0.001, dir.length()),
  }
}

/**
 * Tubo sólido de `a` a `b`. O amortecedor é desenhado como corpo grosso (55 % a partir da
 * ancoragem) + haste fina, para ler como amortecedor e não como mais um braço.
 */
function Tube({ body }: { body: Body }) {
  const parts = useMemo(() => {
    const av = new THREE.Vector3(body.a.x * S, body.a.y * S, body.a.z * S)
    const bv = new THREE.Vector3(body.b.x * S, body.b.y * S, body.b.z * S)
    if (body.kind !== 'shock') return [{ ...frame(av, bv), r: body.r * S }]
    const cut = av.clone().lerp(bv, 0.55)
    return [
      { ...frame(av, cut), r: body.r * S },
      { ...frame(cut, bv), r: body.r * 0.45 * S },
    ]
  }, [body])
  return (
    <>
      {parts.map((p, i) => (
        <mesh key={i} raycast={noRaycast} position={p.position} quaternion={p.quaternion}>
          <cylinderGeometry args={[p.r, p.r, p.length, 14]} />
          <TubeMaterial color={viewport3d.suspension} />
        </mesh>
      ))}
    </>
  )
}

// ---------------------------------------------------------------------------------------
// Roda. Geometria construída no referencial do torno (eixo Y), em metros, com a face EXTERNA
// (letra branca, prato do aro) em −Y. O grupo gira Y → ∓X conforme o lado, de modo que −Y
// local aponte para fora do carro nos dois lados.

interface WheelGeo {
  tire: THREE.LatheGeometry
  rim: THREE.LatheGeometry
  lugs: THREE.Matrix4[]
  lugSize: [number, number, number]
  letters: THREE.Matrix4[]
  letterSize: [number, number, number]
  ringR: number
  ringY: number
  hubY: number
}

function buildWheel(R: number, w: number, rr: number): WheelGeo {
  const hw = w / 2
  const lug = 0.012 // altura da garra
  const Rt = Math.max(rr + 0.02, R - lug) // raio da carcaça, sob as garras
  const sh = hw * 0.78 // meia-largura da banda de rodagem
  const v = (r: number, y: number) => new THREE.Vector2(r, y)

  // carcaça: talão no aro → flanco abaulado → ombro arredondado → banda plana
  const tire = new THREE.LatheGeometry(
    [
      v(rr, -hw * 0.82),
      v(rr + (Rt - rr) * 0.25, -hw * 0.97),
      v(rr + (Rt - rr) * 0.7, -hw),
      v(Rt - 0.008, -hw * 0.92),
      v(Rt, -sh),
      v(Rt, sh),
      v(Rt - 0.008, hw * 0.92),
      v(rr + (Rt - rr) * 0.7, hw),
      v(rr + (Rt - rr) * 0.25, hw * 0.97),
      v(rr, hw * 0.82),
    ],
    56,
  )

  // aro: barril entre os talões + prato do lado externo até o cubo
  const rim = new THREE.LatheGeometry(
    [
      v(0.045, -hw * 0.42),
      v(rr * 0.62, -hw * 0.3),
      v(rr - 0.006, -hw * 0.62),
      v(rr - 0.006, -hw * 0.83),
      v(rr + 0.001, -hw * 0.83),
      v(rr + 0.001, hw * 0.83),
      v(rr - 0.006, hw * 0.83),
      v(rr - 0.006, hw * 0.62),
    ],
    48,
  )

  // garras: duas fileiras alternadas que se sobrepõem no meio da banda — o ziguezague dos
  // pneus de trilha. Passo ~45 mm na circunferência.
  const n = Math.max(16, Math.round((2 * Math.PI * Rt) / 0.045))
  const lugSize: [number, number, number] = [0.026, w * 0.5, lug + 0.004]
  const lugs: THREE.Matrix4[] = []
  const q = new THREE.Quaternion()
  for (let i = 0; i < n; i++) {
    const th = (i / n) * Math.PI * 2
    const r = Rt + lug / 2 - 0.002
    const y = (i % 2 === 0 ? -1 : 1) * w * 0.2
    q.setFromAxisAngle(UP, -th)
    lugs.push(
      new THREE.Matrix4().compose(
        new THREE.Vector3(r * Math.cos(th), y, r * Math.sin(th)),
        q,
        new THREE.Vector3(1, 1, 1),
      ),
    )
  }

  // letra branca: dois arcos de "letras" na lateral externa, mais um filete
  const rl = rr + (Rt - rr) * 0.55
  const ly = -hw * 0.975 - 0.0015
  const letterSize: [number, number, number] = [0.013, 0.003, 0.011]
  const letters: THREE.Matrix4[] = []
  for (const arc of [0, Math.PI]) {
    for (let i = 0; i < 7; i++) {
      const th = arc + (i - 3) * 0.14
      q.setFromAxisAngle(UP, -th)
      letters.push(
        new THREE.Matrix4().compose(
          new THREE.Vector3(rl * Math.cos(th), ly, rl * Math.sin(th)),
          q,
          new THREE.Vector3(1, 1, 1),
        ),
      )
    }
  }

  return {
    tire,
    rim,
    lugs,
    lugSize,
    letters,
    letterSize,
    ringR: rl + 0.018,
    ringY: ly,
    hubY: -hw * 0.42,
  }
}

function Instances({
  matrices,
  size,
  color,
  roughness,
  metalness,
}: {
  matrices: THREE.Matrix4[]
  size: [number, number, number]
  color: string
  roughness: number
  metalness: number
}) {
  const ref = useRef<THREE.InstancedMesh>(null)
  useLayoutEffect(() => {
    const m = ref.current
    if (!m) return
    matrices.forEach((mat, i) => m.setMatrixAt(i, mat))
    m.instanceMatrix.needsUpdate = true
    m.computeBoundingSphere()
  }, [matrices])
  return (
    // a contagem é fixa na construção: mudar o pneu troca a chave lá em cima e remonta
    <instancedMesh ref={ref} args={[undefined, undefined, matrices.length]} raycast={noRaycast}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} />
    </instancedMesh>
  )
}

function Wheel({ tire, rimR, side }: { tire: Body; rimR: number; side: Side }) {
  const cx = ((tire.a.x + tire.b.x) / 2) * S
  const cy = ((tire.a.y + tire.b.y) / 2) * S
  const cz = ((tire.a.z + tire.b.z) / 2) * S
  const w = Math.hypot(tire.b.x - tire.a.x, tire.b.y - tire.a.y, tire.b.z - tire.a.z) * S
  const R = tire.r * S
  const rr = Math.min(rimR * S, R - 0.03)
  const geo = useMemo(() => buildWheel(R, w, rr), [R, w, rr])
  // Y local → −X (lado L) ou +X (lado R): a face −Y fica sempre para fora do carro
  const rz = side === 'L' ? -Math.PI / 2 : Math.PI / 2
  const key = `${geo.lugs.length}-${w.toFixed(3)}-${R.toFixed(3)}`
  return (
    <group position={[cx, cy, cz]} rotation={[0, 0, rz]}>
      <mesh raycast={noRaycast} geometry={geo.tire}>
        <meshStandardMaterial color={viewport3d.rubber} roughness={0.92} metalness={0.05} />
      </mesh>
      <Instances
        key={`lugs-${key}`}
        matrices={geo.lugs}
        size={geo.lugSize}
        color={viewport3d.rubber}
        roughness={0.95}
        metalness={0}
      />
      <Instances
        key={`letters-${key}`}
        matrices={geo.letters}
        size={geo.letterSize}
        color={viewport3d['label-fg']}
        roughness={0.8}
        metalness={0}
      />
      <mesh raycast={noRaycast} position={[0, geo.ringY, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[geo.ringR, 0.0012, 6, 72]} />
        <meshStandardMaterial color={viewport3d['label-fg']} roughness={0.8} />
      </mesh>
      <mesh raycast={noRaycast} geometry={geo.rim}>
        <meshStandardMaterial
          color={viewport3d.member}
          metalness={0.65}
          roughness={0.35}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh raycast={noRaycast} position={[0, geo.hubY, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 0.03, 20]} />
        <TubeMaterial color={viewport3d.suspension} />
      </mesh>
    </group>
  )
}
