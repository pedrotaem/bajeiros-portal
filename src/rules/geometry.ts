import type { Vec3 } from '../model/types'

export function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }
}

export function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }
}

export function scale(a: Vec3, s: number): Vec3 {
  return { x: a.x * s, y: a.y * s, z: a.z * s }
}

export function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  }
}

export function len(a: Vec3): number {
  return Math.sqrt(dot(a, a))
}

export function dist(a: Vec3, b: Vec3): number {
  return len(sub(a, b))
}

export function norm(a: Vec3): Vec3 {
  const l = len(a)
  return l === 0 ? { x: 0, y: 0, z: 0 } : scale(a, 1 / l)
}

/** Ângulo entre dois vetores em graus, sempre no intervalo [0, 90] (direção de tubo não tem sentido). */
export function angleDeg(a: Vec3, b: Vec3): number {
  const c = Math.abs(dot(norm(a), norm(b)))
  return (Math.acos(Math.min(1, c)) * 180) / Math.PI
}

/** Normal de um polígono 3D pelo método de Newell. */
export function newellNormal(pts: Vec3[]): Vec3 {
  const n = { x: 0, y: 0, z: 0 }
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    const q = pts[(i + 1) % pts.length]
    n.x += (p.y - q.y) * (p.z + q.z)
    n.y += (p.z - q.z) * (p.x + q.x)
    n.z += (p.x - q.x) * (p.y + q.y)
  }
  return norm(n)
}

export function centroid(pts: Vec3[]): Vec3 {
  const c = { x: 0, y: 0, z: 0 }
  for (const p of pts) {
    c.x += p.x
    c.y += p.y
    c.z += p.z
  }
  return scale(c, 1 / pts.length)
}

export function distToPlane(p: Vec3, planePoint: Vec3, planeNormal: Vec3): number {
  return Math.abs(dot(sub(p, planePoint), norm(planeNormal)))
}

/** Interpola ponto no segmento a-b na altura y (retorna null se y fora do intervalo). */
export function pointAtY(a: Vec3, b: Vec3, y: number): Vec3 | null {
  const lo = Math.min(a.y, b.y)
  const hi = Math.max(a.y, b.y)
  if (y < lo || y > hi || hi === lo) return null
  const t = (y - a.y) / (b.y - a.y)
  return add(a, scale(sub(b, a), t))
}

/** Interpola |x| no caminho (polilinha) na coordenada z; null se fora. */
export function absXAtZ(path: Vec3[], z: number): number | null {
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i]
    const b = path[i + 1]
    const lo = Math.min(a.z, b.z)
    const hi = Math.max(a.z, b.z)
    if (z >= lo && z <= hi && hi !== lo) {
      const t = (z - a.z) / (b.z - a.z)
      return Math.abs(a.x + (b.x - a.x) * t)
    }
  }
  return null
}

export function distPointToSegment(p: Vec3, a: Vec3, b: Vec3): number {
  const ab = sub(b, a)
  const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / dot(ab, ab)))
  return dist(p, add(a, scale(ab, t)))
}

/** Menor distância entre os segmentos p1-q1 e p2-q2 (DF-7: detecção de cruzamentos). */
export function distSegToSeg(p1: Vec3, q1: Vec3, p2: Vec3, q2: Vec3): number {
  const d1 = sub(q1, p1)
  const d2 = sub(q2, p2)
  const r = sub(p1, p2)
  const a = dot(d1, d1)
  const e = dot(d2, d2)
  const f = dot(d2, r)
  let s: number
  let t: number
  if (a <= 1e-12 && e <= 1e-12) return dist(p1, p2)
  if (a <= 1e-12) {
    s = 0
    t = Math.max(0, Math.min(1, f / e))
  } else {
    const c = dot(d1, r)
    if (e <= 1e-12) {
      t = 0
      s = Math.max(0, Math.min(1, -c / a))
    } else {
      const b = dot(d1, d2)
      const denom = a * e - b * b
      s = denom > 1e-12 ? Math.max(0, Math.min(1, (b * f - c * e) / denom)) : 0
      t = (b * s + f) / e
      if (t < 0) {
        t = 0
        s = Math.max(0, Math.min(1, -c / a))
      } else if (t > 1) {
        t = 1
        s = Math.max(0, Math.min(1, (b - c) / a))
      }
    }
  }
  return dist(add(p1, scale(d1, s)), add(p2, scale(d2, t)))
}
