import type { Cage, Member, Vec3 } from '../model/types'
import { PRIMARY_TYPES, anchorLabel, isNamedIn } from '../model/types'
import {
  PLAUSIBLE,
  REFERENCE_SECTION,
  bendingStiffness,
  bendingStrength,
  materialOf,
} from '../model/materials'
import { spliceCandidates } from '../model/continuity'
import { detectJoints } from '../model/joints'
import {
  angleDeg,
  absXAtZ,
  centroid,
  dist,
  distPointToSegment,
  distToPlane,
  newellNormal,
  norm,
  pointAtY,
  sub,
  dot,
} from './geometry'

export type Status = 'pass' | 'fail' | 'warn' | 'manual'

export interface RuleResult {
  id: string // ID do regulamento, ex. "B6.2.4.2"
  title: string
  status: Status
  measured?: string
  limit?: string
  members: string[] // ids de membros envolvidos (para destaque no 3D)
  note?: string
  // true = falha por elemento ainda ausente (útil durante construção guiada)
  presence?: boolean
}

function fmt(n: number, digits = 1): string {
  return n.toFixed(digits).replace('.', ',')
}

export function evaluate(cage: Cage): RuleResult[] {
  const results: RuleResult[] = []
  const { nodes, members, geraldao } = cage

  const byType = (t: Member['type']) => members.filter((m) => m.type === t)
  const p = (id: string): Vec3 => nodes[id]
  const has = (...ids: string[]) => ids.every((id) => nodes[id] !== undefined)
  const memberIds = (ms: Member[]) => ms.map((m) => m.id)

  const rrh = byType('RRH')
  const rrhLeft = rrh.filter((m) => (p(m.a).x + p(m.b).x) / 2 < 0)
  const rrhRight = rrh.filter((m) => (p(m.a).x + p(m.b).x) / 2 >= 0)

  // ---------------------------------------------------------------
  // Presença de membros obrigatórios (um resultado por tipo faltante,
  // para que a análise de remoção acuse a regra certa)
  {
    const required: Array<[Member['type'], string, string]> = [
      ['RRH', 'B6.2.4.1', 'Montantes do RRH presentes'],
      ['ALC', 'B6.2.4.7a', 'Travessa ALC presente'],
      ['BLC', 'B6.2.4.7b', 'Travessa BLC presente'],
      ['RHO', 'B6.2.7.1', 'Membros RHO presentes'],
      ['CLC', 'B6.2.7.3', 'Travessa CLC presente'],
      ['LFS', 'B6.2.8.1', 'Membros LFS presentes'],
      ['FLC', 'B6.2.8.2', 'Travessa FLC presente'],
      ['ILC', 'B6.2.8.4', 'Travessa ILC presente'],
      ['LFDB', 'B6.2.9.1', 'Travamento diagonal LFDB presente'],
      ['SIM', 'B6.2.12.1', 'Side Impact Members presentes'],
      ['DLC', 'B6.2.12.2', 'Travessa DLC presente'],
      ['FBM_UP', 'B6.2.13.2', 'FBM superiores presentes'],
      ['FBM_LOW', 'B6.2.13.3', 'FBM inferiores presentes'],
    ]
    // tipos que existem aos pares (um de cada lado)
    const paired: Member['type'][] = ['RRH', 'RHO', 'FBM_UP', 'FBM_LOW', 'SIM', 'LFS']
    for (const [type, id, title] of required) {
      const ms = byType(type)
      if (!ms.length) {
        results.push({
          id,
          title,
          status: 'fail',
          measured: 'ausente',
          members: [],
          presence: true,
        })
      } else if (paired.includes(type)) {
        const left = ms.some((m) => (p(m.a).x + p(m.b).x) / 2 < 0)
        const right = ms.some((m) => (p(m.a).x + p(m.b).x) / 2 >= 0)
        if (!left || !right) {
          results.push({
            id,
            title,
            status: 'fail',
            measured: `ausente no lado ${left ? 'direito' : 'esquerdo'}`,
            members: memberIds(ms),
          })
        }
      }
    }
  }

  // ---------------------------------------------------------------
  // Continuidade das cadeias RRH (A→B), LFS (A→F) e SIM (S→D) por lado
  {
    const chainGap = (ms: Member[], axis: 'y' | 'z', from: number, to: number): boolean => {
      // true se há lacuna na cobertura do intervalo [from, to]
      const spans = ms
        .map((m) => {
          const va = p(m.a)[axis]
          const vb = p(m.b)[axis]
          return [Math.min(va, vb), Math.max(va, vb)] as [number, number]
        })
        .sort((u, v) => u[0] - v[0])
      let cursor = from
      for (const [lo, hi] of spans) {
        if (lo > cursor + 1) return true
        cursor = Math.max(cursor, hi)
      }
      return cursor < to - 1
    }
    const sides: Array<[string, Member[], Member[], Member[]]> = [
      [
        'esquerdo',
        rrhLeft,
        byType('LFS').filter((m) => (p(m.a).x + p(m.b).x) / 2 < 0),
        byType('SIM').filter((m) => (p(m.a).x + p(m.b).x) / 2 < 0),
      ],
      [
        'direito',
        rrhRight,
        byType('LFS').filter((m) => (p(m.a).x + p(m.b).x) / 2 >= 0),
        byType('SIM').filter((m) => (p(m.a).x + p(m.b).x) / 2 >= 0),
      ],
    ]
    const broken: string[] = []
    const involved: string[] = []
    const lfsExists = byType('LFS').length > 0 && has('FL')
    const simExists = byType('SIM').length > 0 && has('DL')
    for (const [label, rrhSide, lfsSide, simSide] of sides) {
      if (!rrhSide.length || chainGap(rrhSide, 'y', p('AL').y, p('BL').y))
        broken.push(`RRH ${label}`)
      if (lfsExists && (!lfsSide.length || chainGap(lfsSide, 'z', p('AL').z, p('FL').z)))
        broken.push(`LFS ${label}`)
      if (simExists && (!simSide.length || chainGap(simSide, 'z', p('SL').z, p('DL').z)))
        broken.push(`SIM ${label}`)
      involved.push(...memberIds(rrhSide), ...memberIds(lfsSide), ...memberIds(simSide))
    }
    results.push({
      id: 'B6.2.4.5',
      title: 'Cadeias RRH, LFS e SIM contínuas (sem trechos faltando)',
      status: broken.length ? 'fail' : 'pass',
      measured: broken.length ? `lacuna em: ${broken.join(', ')}` : 'contínuas',
      members: involved,
    })
  }

  // ---------------------------------------------------------------
  // B6.2.2.4 — pontos denominados apoiados em tubos + vãos entre denominados
  {
    const adj = new Map<string, Member[]>()
    for (const m of members) {
      adj.set(m.a, [...(adj.get(m.a) ?? []), m])
      adj.set(m.b, [...(adj.get(m.b) ?? []), m])
    }
    const named = (id: string) => isNamedIn(cage, id)

    const loose = Object.keys(nodes).filter((id) => named(id) && !adj.get(id)?.length)
    results.push({
      id: 'B6.2.2.4',
      title: 'Pontos denominados sempre apoiados em tubos (nenhum solto)',
      status: loose.length ? 'fail' : 'pass',
      measured: loose.length ? `soltos: ${loose.join(', ')}` : 'todos apoiados',
      members: [],
    })

    // Vãos: caminha de um ponto denominado ao próximo, atravessando nós
    // intermediários não denominados (que funcionam como pontos de curva).
    const other = (m: Member, n: string) => (m.a === n ? m.b : m.a)
    const deflection = (a: Vec3, b: Vec3) => {
      const c = dot(norm(a), norm(b))
      return (Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI
    }
    interface Span {
      mems: Member[]
      len: number
      maxBend: number
    }
    const spans: Span[] = []
    const seenSpan = new Set<string>()
    for (const start of Object.keys(nodes)) {
      if (!named(start)) continue
      for (const m0 of adj.get(start) ?? []) {
        let cur = m0
        let prevNode = start
        let node = other(m0, start)
        let len = dist(p(start), p(node))
        let maxBend = 0
        const mems = [m0]
        while (!named(node) && (adj.get(node)?.length ?? 0) === 2) {
          const pair = adj.get(node)!
          const next = pair[0] === cur ? pair[1] : pair[0]
          const nextNode = other(next, node)
          maxBend = Math.max(
            maxBend,
            deflection(sub(p(node), p(prevNode)), sub(p(nextNode), p(node))),
          )
          len += dist(p(node), p(nextNode))
          mems.push(next)
          prevNode = node
          cur = next
          node = nextNode
        }
        const key = mems
          .map((m) => m.id)
          .sort()
          .join(',')
        if (seenSpan.has(key)) continue
        seenSpan.add(key)
        spans.push({ mems, len, maxBend })
      }
    }

    const straightOff: string[] = []
    let worstS = 0
    const bentOff: string[] = []
    let worstB = 0
    let worstA = 0
    for (const s of spans) {
      if (s.maxBend < 3) {
        if (s.len > 1016) {
          straightOff.push(...memberIds(s.mems))
          worstS = Math.max(worstS, s.len)
        }
      } else {
        if (s.len > 838 || s.maxBend > 30) {
          bentOff.push(...memberIds(s.mems))
          worstB = Math.max(worstB, s.len)
          worstA = Math.max(worstA, s.maxBend)
        }
      }
    }
    results.push({
      id: 'B6.2.2.5.3',
      title: 'Vãos retos ≤ 1016 mm entre pontos denominados',
      status: straightOff.length ? 'fail' : 'pass',
      measured: straightOff.length ? `máx ${fmt(worstS)} mm` : 'todos dentro do limite',
      limit: '≤ 1016 mm',
      members: straightOff.length ? straightOff : memberIds(members),
    })
    results.push({
      id: 'B6.2.2.5.4',
      title: 'Vãos com curva: ≤ 838 mm e dobra ≤ 30° fora de ponto denominado',
      status: bentOff.length ? 'fail' : 'pass',
      measured: bentOff.length
        ? `máx ${fmt(worstB)} mm · dobra máx ${fmt(worstA)}°`
        : 'todos dentro do limite',
      limit: '≤ 838 mm · ≤ 30°',
      members: bentOff,
      note: 'Curva modelada pela linha de centro (nó intermediário); raio ≥ 152 mm segue como verificação manual.',
    })
  }

  // ---------------------------------------------------------------
  // B6.2.4.2 — ângulo entre o plano do RRH e a vertical ≤ 20°
  {
    const pts = [p('AL'), p('AR'), p('BR'), p('BL')]
    const n = newellNormal(pts)
    // ângulo entre plano e vetor vertical = asin(|n·ŷ|)
    const a = (Math.asin(Math.min(1, Math.abs(n.y))) * 180) / Math.PI
    results.push({
      id: 'B6.2.4.2',
      title: 'Inclinação do RRH em relação à vertical ≤ 20°',
      status: a <= 20 ? 'pass' : 'fail',
      measured: `${fmt(a)}°`,
      limit: '≤ 20°',
      members: memberIds(rrh),
    })
  }

  // ---------------------------------------------------------------
  // B6.2.4.3 — largura do RRH ≥ 737 mm medida a 686 mm acima do ponto do Geraldão
  {
    const yTarget = geraldao.y + 686
    const hit = (side: Member[]): Vec3 | null => {
      for (const m of side) {
        const q = pointAtY(p(m.a), p(m.b), yTarget)
        if (q) return q
      }
      return null
    }
    const l = hit(rrhLeft)
    const r = hit(rrhRight)
    if (l && r) {
      const w = dist(l, r)
      results.push({
        id: 'B6.2.4.3',
        title: 'Largura do RRH ≥ 737 mm a 686 mm acima do assento (Geraldão)',
        status: w >= 737 ? 'pass' : 'fail',
        measured: `${fmt(w)} mm em y = ${fmt(yTarget, 0)} mm`,
        limit: '≥ 737 mm',
        members: memberIds(rrh),
      })
    } else {
      results.push({
        id: 'B6.2.4.3',
        title: 'Largura do RRH ≥ 737 mm a 686 mm acima do assento (Geraldão)',
        status: 'fail',
        measured: 'montantes do RRH não alcançam a altura de medição',
        limit: '≥ 737 mm',
        members: memberIds(rrh),
      })
    }
  }

  // ---------------------------------------------------------------
  // B6.2.4.8 — ALC não pode se estender mais de 25 mm além dos pontos A
  {
    const alc = byType('ALC')
    const offenders: string[] = []
    let worst = 0
    for (const m of alc) {
      for (const end of [p(m.a), p(m.b)]) {
        const ext = Math.abs(end.x) - Math.abs(p('AL').x)
        if (ext > 25) {
          offenders.push(m.id)
          worst = Math.max(worst, ext)
        }
      }
    }
    results.push({
      id: 'B6.2.4.8',
      title: 'ALC não se estende mais de 25 mm além dos pontos A',
      status: offenders.length ? 'fail' : 'pass',
      measured: offenders.length ? `${fmt(worst)} mm além` : 'dentro do limite',
      limit: '≤ 25 mm',
      members: offenders.length ? offenders : memberIds(alc),
    })
  }

  // ---------------------------------------------------------------
  // B6.2.4.9 — ALC, BLC, montantes do RRH, LDB e SHC coplanares
  {
    const planeMembers = [
      ...rrh,
      ...byType('ALC'),
      ...byType('BLC'),
      ...byType('LDB'),
      ...byType('SHC'),
    ]
    const pts: Vec3[] = []
    for (const m of planeMembers) pts.push(p(m.a), p(m.b))
    const n = newellNormal([p('AL'), p('AR'), p('BR'), p('BL')])
    const c = centroid([p('AL'), p('AR'), p('BR'), p('BL')])
    let worst = 0
    const offenders: string[] = []
    for (const m of planeMembers) {
      const d = Math.max(distToPlane(p(m.a), c, n), distToPlane(p(m.b), c, n))
      if (d > 10) offenders.push(m.id)
      worst = Math.max(worst, d)
    }
    results.push({
      id: 'B6.2.4.9',
      title: 'ALC, BLC, montantes RRH, LDB e SHC coplanares',
      status: offenders.length ? 'fail' : 'pass',
      measured: `desvio máx ${fmt(worst)} mm`,
      limit: 'tolerância adotada 10 mm',
      members: offenders.length ? offenders : memberIds(planeMembers),
      note: 'Regulamento não define tolerância numérica; protótipo adota 10 mm.',
    })
  }

  // ---------------------------------------------------------------
  // B6.2.5.1 — LDB presente, estendendo-se de um montante do RRH ao outro
  const ldb = byType('LDB')
  {
    let ok = ldb.length > 0
    if (ok) {
      for (const m of ldb) {
        const nearVertical = (q: Vec3) =>
          rrh.some((v) => distPointToSegment(q, p(v.a), p(v.b)) <= 30)
        if (!nearVertical(p(m.a)) || !nearVertical(p(m.b))) ok = false
      }
    }
    results.push({
      id: 'B6.2.5.1',
      title: 'LDB presente, de um montante do RRH ao outro',
      status: ok ? 'pass' : 'fail',
      measured: ldb.length ? 'extremidades sobre os montantes' : 'LDB ausente',
      members: memberIds(ldb),
      presence: !ldb.length,
    })
  }

  // ---------------------------------------------------------------
  // B6.2.5.2 — interseções do LDB a ≤ 127 mm (vertical) dos pontos A e B
  if (ldb.length) {
    const anchors = [p('AL'), p('AR'), p('BL'), p('BR')]
    let worst = 0
    let ok = true
    for (const m of ldb) {
      for (const end of [p(m.a), p(m.b)]) {
        const dv = Math.min(...anchors.map((q) => Math.abs(end.y - q.y)))
        worst = Math.max(worst, dv)
        if (dv > 127) ok = false
      }
    }
    results.push({
      id: 'B6.2.5.2',
      title: 'Extremidades do LDB a ≤ 127 mm (vertical) dos pontos A e B',
      status: ok ? 'pass' : 'fail',
      measured: `máx ${fmt(worst)} mm`,
      limit: '≤ 127 mm',
      members: memberIds(ldb),
    })
  }

  // ---------------------------------------------------------------
  // B6.2.5.3 — ângulo entre LDB e montantes do RRH ≥ 20°
  if (ldb.length) {
    let worst = 90
    for (const m of ldb) {
      const dir = sub(p(m.b), p(m.a))
      for (const v of rrh) {
        const a = angleDeg(dir, sub(p(v.b), p(v.a)))
        worst = Math.min(worst, a)
      }
    }
    results.push({
      id: 'B6.2.5.3',
      title: 'Ângulo entre LDB e montantes do RRH ≥ 20°',
      status: worst >= 20 ? 'pass' : 'fail',
      measured: `${fmt(worst)}°`,
      limit: '≥ 20°',
      members: memberIds(ldb),
    })
  }

  // ---------------------------------------------------------------
  // B6.2.6 — SHC: tubo reto horizontal dentro do plano do RRH
  {
    const shc = byType('SHC')
    if (!shc.length) {
      results.push({
        id: 'B6.2.6.1',
        title: 'SHC presente (fixação das tiras de ombro)',
        status: 'fail',
        measured: 'SHC ausente',
        members: [],
        presence: true,
      })
    } else {
      const m = shc[0]
      const dy = Math.abs(p(m.a).y - p(m.b).y)
      const nearVertical = (q: Vec3) => rrh.some((v) => distPointToSegment(q, p(v.a), p(v.b)) <= 30)
      const spans = nearVertical(p(m.a)) && nearVertical(p(m.b))
      const ok = dy <= 10 && spans
      results.push({
        id: 'B6.2.6.1',
        title: 'SHC horizontal, contínuo entre os montantes do RRH',
        status: ok ? 'pass' : 'fail',
        measured: `Δy = ${fmt(dy)} mm; ${spans ? 'apoiado nos montantes' : 'não alcança os montantes'}`,
        limit: 'horizontal (tolerância 10 mm)',
        members: memberIds(shc),
      })
    }
  }

  // ---------------------------------------------------------------
  // B6.2.7.4 — pontos C ≥ 305 mm à frente do ponto do assento (aproximação em Z)
  if (has('CL', 'CR')) {
    const dzL = p('CL').z - geraldao.z
    const dzR = p('CR').z - geraldao.z
    const worst = Math.min(dzL, dzR)
    results.push({
      id: 'B6.2.7.4',
      title: 'Pontos C ≥ 305 mm à frente do ponto traseiro do assento',
      status: worst >= 305 ? 'pass' : 'fail',
      measured: `${fmt(worst)} mm`,
      limit: '≥ 305 mm',
      members: memberIds(byType('RHO')),
      note: 'Aproximação: distância horizontal C→Geraldão; regulamento mede da interseção RHO × vertical do assento.',
    })
  }

  // ---------------------------------------------------------------
  // B6.2.7.5 — pontos C a pelo menos 1041 mm acima do ponto traseiro do assento
  if (has('CL', 'CR')) {
    const dyL = p('CL').y - geraldao.y
    const dyR = p('CR').y - geraldao.y
    const worst = Math.min(dyL, dyR)
    results.push({
      id: 'B6.2.7.5',
      title: 'Pontos C ≥ 1041 mm acima do ponto traseiro do assento',
      status: worst >= 1041 ? 'pass' : 'fail',
      measured: `${fmt(worst)} mm`,
      limit: '≥ 1041 mm',
      members: memberIds(byType('RHO')),
    })
  }

  // ---------------------------------------------------------------
  // B6.2.9.2 / B6.2.9.3 — LFDB: interseções ≤ 51 mm dos pontos A e I
  {
    const lfdb = byType('LFDB')
    if (lfdb.length && has('IL', 'IR')) {
      const aPts = [p('AL'), p('AR')]
      const iPts = [p('IL'), p('IR')]
      let worst = 0
      let ok = true
      for (const m of lfdb) {
        for (const end of [p(m.a), p(m.b)]) {
          const d = Math.min(...aPts.map((q) => dist(end, q)), ...iPts.map((q) => dist(end, q)))
          worst = Math.max(worst, d)
          if (d > 51) ok = false
        }
      }
      results.push({
        id: 'B6.2.9.2/3',
        title: 'LFDB: extremidades a ≤ 51 mm dos pontos A e I',
        status: ok ? 'pass' : 'fail',
        measured: `máx ${fmt(worst)} mm`,
        limit: '≤ 51 mm',
        members: memberIds(lfdb),
      })
    }
  }

  // ---------------------------------------------------------------
  // B6.2.10.3 — USM passa diretamente abaixo do ponto do Geraldão (tolerância 51 mm à frente)
  {
    const usm = [...byType('USM'), ...byType('ASB')]
    let ok = false
    for (const m of usm) {
      const zLo = Math.min(p(m.a).z, p(m.b).z)
      const zHi = Math.max(p(m.a).z, p(m.b).z)
      if (geraldao.z >= zLo - 0 && geraldao.z <= zHi + 51) ok = true
    }
    results.push({
      id: 'B6.2.10.3',
      title: 'USM/ASB passa diretamente abaixo do piloto (ponto do Geraldão)',
      status: ok ? 'pass' : 'fail',
      measured: usm.length ? (ok ? 'coberto' : 'não passa sob o ponto') : 'USM/ASB ausente',
      limit: 'tolerância 51 mm à frente',
      members: memberIds(usm),
      presence: !usm.length,
    })
  }

  // ---------------------------------------------------------------
  // B6.2.12.4 — distância entre SIMs não decrescente da frente (D) para trás (S)
  {
    const sim = byType('SIM')
    const left = sim.filter((m) => (p(m.a).x + p(m.b).x) / 2 < 0)
    const right = sim.filter((m) => (p(m.a).x + p(m.b).x) / 2 >= 0)
    if (left.length && right.length) {
      const pathOf = (ms: Member[]): Vec3[] => {
        const pts = ms.flatMap((m) => [p(m.a), p(m.b)])
        return pts.sort((u, v) => u.z - v.z)
      }
      const lp = pathOf(left)
      const rp = pathOf(right)
      const zMin = Math.max(lp[0].z, rp[0].z)
      const zMax = Math.min(lp[lp.length - 1].z, rp[rp.length - 1].z)
      let ok = true
      // varre de trás (S, z menor) para frente (D, z maior): largura não pode crescer para frente
      const widths: number[] = []
      for (let i = 0; i <= 10; i++) {
        const z = zMin + ((zMax - zMin) * i) / 10
        const wl = absXAtZ(lp, z)
        const wr = absXAtZ(rp, z)
        if (wl == null || wr == null) continue
        widths.push(wl + wr)
      }
      for (let i = 1; i < widths.length; i++) {
        if (widths[i] > widths[i - 1] + 1) ok = false // cresceu para frente → decresceu de D para S
      }
      results.push({
        id: 'B6.2.12.4',
        title: 'Distância entre SIMs não decrescente de D (frente) para S (trás)',
        status: ok ? 'pass' : 'fail',
        measured: widths.length
          ? `largura ${fmt(widths[widths.length - 1], 0)} → ${fmt(widths[0], 0)} mm (frente→trás)`
          : 'sem amostras',
        members: memberIds(sim),
      })
    }
  }

  // ---------------------------------------------------------------
  // B6.2.12.6 — SIM entre 203 e 356 mm acima da parte inferior do assento
  {
    const sim = byType('SIM')
    let ok = true
    let lo = Infinity
    let hi = -Infinity
    for (const m of sim) {
      for (const end of [p(m.a), p(m.b)]) {
        const h = end.y - cage.seatBottomY
        lo = Math.min(lo, h)
        hi = Math.max(hi, h)
        if (h < 203 || h > 356) ok = false
      }
    }
    if (sim.length) {
      results.push({
        id: 'B6.2.12.6',
        title: 'SIM entre 203 e 356 mm acima da parte inferior do assento',
        status: ok ? 'pass' : 'fail',
        measured: `${fmt(lo, 0)}–${fmt(hi, 0)} mm`,
        limit: '203–356 mm',
        members: memberIds(sim),
      })
    }
  }

  // ---------------------------------------------------------------
  // B6.2.13.5 — ângulo entre FBM_UP e a vertical ≤ 45°
  {
    const fbm = byType('FBM_UP')
    let worst = 0
    for (const m of fbm) {
      const dir = sub(p(m.b), p(m.a))
      const a = angleDeg(dir, { x: 0, y: 1, z: 0 })
      worst = Math.max(worst, a)
    }
    if (fbm.length) {
      results.push({
        id: 'B6.2.13.5',
        title: 'Ângulo entre FBM superior e a vertical ≤ 45°',
        status: worst <= 45 ? 'pass' : 'fail',
        measured: `${fmt(worst)}°`,
        limit: '≤ 45°',
        members: memberIds(fbm),
      })
    }
  }

  // ---------------------------------------------------------------
  // B6.2.14 — Fore-Aft Bracing (travamento do RRH)
  {
    const fab = members.filter(
      (m) => m.type === 'FAB_UP' || m.type === 'FAB_MID' || m.type === 'FAB_LOW',
    )
    if (!fab.length) {
      results.push({
        id: 'B6.2.14.2',
        title: 'Ao menos um travamento Fore-Aft: dianteiro OU traseiro (um dispensa o outro)',
        status: 'fail',
        measured: 'nenhum membro FAB',
        members: [],
        presence: true,
      })
    } else {
      const rrhZ = Math.min(p('AL').z, p('BL').z)
      const rearFab = fab.filter((m) => (p(m.a).z + p(m.b).z) / 2 < rrhZ)
      const frontFab = fab.filter((m) => (p(m.a).z + p(m.b).z) / 2 >= rrhZ)
      // B6.2.14.2: exige AO MENOS UM dos dois sistemas — dianteiro dispensa traseiro e vice-versa
      results.push({
        id: 'B6.2.14.2',
        title: 'Ao menos um travamento Fore-Aft: dianteiro OU traseiro (um dispensa o outro)',
        status: 'pass',
        measured:
          rearFab.length && frontFab.length
            ? 'ambos presentes'
            : rearFab.length
              ? 'traseiro presente — dianteiro dispensado'
              : 'dianteiro presente — traseiro dispensado',
        members: memberIds(fab),
      })
      if (rearFab.length) {
        const fab = rearFab
        // Travamento traseiro (B6.2.14.4) — três níveis em CADA lado (B6.2.14.4.1)
        const missing: string[] = []
        for (const [label, sideTest] of [
          ['esquerdo', (m: Member) => (p(m.a).x + p(m.b).x) / 2 < 0],
          ['direito', (m: Member) => (p(m.a).x + p(m.b).x) / 2 >= 0],
        ] as Array<[string, (m: Member) => boolean]>) {
          for (const t of ['FAB_UP', 'FAB_MID', 'FAB_LOW'] as const) {
            if (!fab.some((m) => m.type === t && sideTest(m))) missing.push(`${t} ${label}`)
          }
        }
        results.push({
          id: 'B6.2.14.4.6',
          title: 'Travamento traseiro com FAB superior, intermediário e inferior em cada lado',
          status: missing.length ? 'fail' : 'pass',
          measured: missing.length
            ? `faltando: ${missing.join(', ')}`
            : 'três níveis nos dois lados',
          members: memberIds(fab),
        })

        let worstLen = 0
        for (const m of fab) worstLen = Math.max(worstLen, dist(p(m.a), p(m.b)))
        results.push({
          id: 'B6.2.14.4.2',
          title: 'Membros do travamento traseiro ≤ 813 mm entre apoios',
          status: worstLen <= 813 ? 'pass' : 'fail',
          measured: `máx ${fmt(worstLen)} mm`,
          limit: '≤ 813 mm',
          members: memberIds(fab),
        })

        // B6.2.14.4.7 — junções ao RRH a ≤ 51 mm dos pontos B, S e A
        const anchors = [p('BL'), p('BR'), p('SL'), p('SR'), p('AL'), p('AR')]
        let worstJ = 0
        for (const m of fab) {
          // extremidade mais próxima do RRH (z maior) é a junção
          const ends = [p(m.a), p(m.b)].sort((u, v) => v.z - u.z)
          const d = Math.min(...anchors.map((q) => dist(ends[0], q)))
          worstJ = Math.max(worstJ, d)
        }
        results.push({
          id: 'B6.2.14.4.7',
          title: 'Junções do travamento traseiro a ≤ 51 mm dos pontos B, S e A',
          status: worstJ <= 51 ? 'pass' : 'fail',
          measured: `máx ${fmt(worstJ)} mm`,
          limit: '≤ 51 mm',
          members: memberIds(fab),
        })

        // B6.2.14.4.3 — ângulo mínimo de 25° entre membros dos triângulos
        let worstA = 90
        for (let i = 0; i < fab.length; i++) {
          for (let j = i + 1; j < fab.length; j++) {
            const mi = fab[i]
            const mj = fab[j]
            const shared =
              mi.a === mj.a || mi.a === mj.b ? mi.a : mi.b === mj.a || mi.b === mj.b ? mi.b : null
            if (!shared) continue
            const otherI = mi.a === shared ? mi.b : mi.a
            const otherJ = mj.a === shared ? mj.b : mj.a
            const a = angleDeg(sub(p(otherI), p(shared)), sub(p(otherJ), p(shared)))
            worstA = Math.min(worstA, a)
          }
        }
        results.push({
          id: 'B6.2.14.4.3',
          title: 'Ângulo mínimo de 25° entre membros dos triângulos traseiros',
          status: worstA >= 25 ? 'pass' : 'fail',
          measured: `mín ${fmt(worstA)}°`,
          limit: '≥ 25°',
          members: memberIds(fab),
        })

        // B6.2.14.4.9 — RLC unindo os dois lados, próximo aos vértices R
        const rlc = byType('RLC')
        const vertices = fab.map((m) => [p(m.a), p(m.b)].sort((u, v) => u.z - v.z)[0])
        let ok = rlc.length > 0
        let worstR = 0
        for (const m of rlc) {
          for (const end of [p(m.a), p(m.b)]) {
            const d = Math.min(...vertices.map((q) => dist(end, q)))
            worstR = Math.max(worstR, d)
            if (d > 381) ok = false
          }
        }
        results.push({
          id: 'B6.2.14.4.9',
          title: 'RLC presente unindo os dois lados do travamento traseiro',
          status: ok ? 'pass' : 'fail',
          measured: rlc.length ? `máx ${fmt(worstR)} mm dos vértices` : 'RLC ausente',
          limit: '≤ 381 mm do ponto médio B→R→A',
          members: memberIds(rlc),
          note: 'Aproximação: distância aos vértices R; regulamento mede ao ponto médio do percurso B→R→A.',
        })

        // B6.2.9.5 — com travamento traseiro, LFDB restrito à alternativa (c) da Figura B-25
        results.push({
          id: 'B6.2.9.5',
          title: 'Com travamento traseiro, LFDB deve seguir a alternativa (c) da Figura B-25',
          status: 'manual',
          members: memberIds(byType('LFDB')),
          note: 'Verificação visual da configuração do LFDB contra a figura do regulamento.',
        })
        results.push({
          id: 'B6.2.14.4.8',
          title: 'FAB superior traseiro se estende além de todos os componentes do motor',
          status: 'manual',
          members: memberIds(rearFab.filter((x) => x.type === 'FAB_UP')),
        })
      }
      if (frontFab.length && has('CL')) {
        // Travamento dianteiro (B6.2.14.3)
        const fab = frontFab
        const fbmUp = byType('FBM_UP')
        let worstC = 0
        let worstA = 90
        for (const m of fab.filter((x) => x.type === 'FAB_UP')) {
          const ends = [p(m.a), p(m.b)]
          const dC = Math.min(Math.abs(ends[0].y - p('CL').y), Math.abs(ends[1].y - p('CL').y))
          worstC = Math.max(worstC, dC)
          for (const f of fbmUp) {
            worstA = Math.min(worstA, angleDeg(sub(ends[1], ends[0]), sub(p(f.b), p(f.a))))
          }
        }
        results.push({
          id: 'B6.2.14.3.1',
          title: 'FAB dianteiro: interseção com FBM superior ≤ 127 mm do ponto C',
          status: worstC <= 127 ? 'pass' : 'fail',
          measured: `máx ${fmt(worstC)} mm (vertical)`,
          limit: '≤ 127 mm',
          members: memberIds(fab),
        })
        results.push({
          id: 'B6.2.14.3.3',
          title: 'FAB dianteiro: ângulo com FBM superior ≥ 30°',
          status: worstA >= 30 ? 'pass' : 'fail',
          measured: `mín ${fmt(worstA)}°`,
          limit: '≥ 30°',
          members: memberIds(fab),
        })

        // B6.2.14.3.2 — pontos P suportados verticalmente por membro ligando SIM ao LFS
        {
          const fabUpF = fab.filter((x) => x.type === 'FAB_UP')
          const fabLowF = fab.filter((x) => x.type === 'FAB_LOW')
          const lfs = byType('LFS')
          let ok = fabUpF.length > 0
          for (const mu of fabUpF) {
            const ends = [p(mu.a), p(mu.b)].sort((u, v) => u.y - v.y)
            const P = ends[0] // extremidade inferior = ponto P no SIM
            let supported = false
            for (const ml of fabLowF) {
              const le = [p(ml.a), p(ml.b)]
              const near = le.find((e) => dist(e, P) <= 51)
              if (!near) continue
              const other = le[0] === near ? le[1] : le[0]
              if (lfs.some((ls) => distPointToSegment(other, p(ls.a), p(ls.b)) <= 30)) {
                supported = true
                break
              }
            }
            if (!supported) ok = false
          }
          results.push({
            id: 'B6.2.14.3.2',
            title: 'FAB dianteiro: pontos P suportados por membro descendo ao LFS',
            status: ok ? 'pass' : 'fail',
            measured: ok ? 'todos os pontos P suportados' : 'ponto P sem suporte até o LFS',
            limit: 'tolerância 51 mm no ponto P',
            members: memberIds([...fabUpF, ...fabLowF]),
          })
        }
      }
    }
  }

  // ---------------------------------------------------------------
  // Ancoragens da suspensão
  {
    const anchors = cage.anchors ?? []
    if (anchors.length) {
      const off: string[] = []
      let worst = 0
      for (const a of anchors) {
        let best = Infinity
        for (const m of members) best = Math.min(best, distPointToSegment(a.pos, p(m.a), p(m.b)))
        if (best > 25) off.push(anchorLabel(a))
        worst = Math.max(worst, best)
      }
      results.push({
        id: 'SUSP.1',
        title: 'Ancoragens da suspensão apoiadas em tubos da gaiola',
        status: off.length ? 'fail' : 'pass',
        measured: off.length ? `fora do tubo: ${off.join('; ')}` : `desvio máx ${fmt(worst)} mm`,
        limit: '≤ 25 mm do eixo do tubo',
        members: [],
        note: 'Tolerância de modelagem do protótipo — a fixação física deve estar sobre o tubo.',
      })

      // B6.2.8.4 — ILC a ≤ 51 mm da ancoragem traseira das bandejas inferiores dianteiras
      const ilc = byType('ILC')
      const rearLower = anchors.filter((a) => a.axle === 'dianteira' && a.role === 'inf1')
      if (ilc.length && rearLower.length) {
        let worstD = 0
        for (const a of rearLower) {
          const d = Math.min(...ilc.map((m) => distPointToSegment(a.pos, p(m.a), p(m.b))))
          worstD = Math.max(worstD, d)
        }
        results.push({
          id: 'B6.2.8.4',
          title: 'ILC a ≤ 51 mm da ancoragem traseira das bandejas inferiores dianteiras',
          status: worstD <= 51 ? 'pass' : 'fail',
          measured: `máx ${fmt(worstD)} mm`,
          limit: '≤ 51 mm',
          members: memberIds(ilc),
        })
      }
    }
  }

  // ---------------------------------------------------------------
  // STEER.1 — ancoragem do suporte do volante apoiada em tubo (DF-5, padrão SUSP.1)
  {
    const pts = cage.steering?.points ?? []
    if (pts.length) {
      const off: string[] = []
      const support: string[] = []
      let worst = 0
      for (const pt of pts) {
        let best = Infinity
        let bestMember: string | null = null
        for (const m of members) {
          const d = distPointToSegment(pt.pos, p(m.a), p(m.b))
          if (d < best) {
            best = d
            bestMember = m.id
          }
        }
        if (best > 25) off.push(`${pt.id} (${fmt(best)} mm)`)
        else if (bestMember) support.push(bestMember)
        worst = Math.max(worst, best)
      }
      results.push({
        id: 'STEER.1',
        title: 'Ancoragem do suporte do volante apoiada em tubo da gaiola',
        status: off.length ? 'fail' : 'pass',
        measured: off.length
          ? `sem suporte — ajuste a gaiola ou adicione tubo: ${off.join('; ')}`
          : `desvio máx ${fmt(worst)} mm`,
        limit: '≤ 25 mm do eixo do tubo',
        members: support,
        note: 'Regra de modelagem do portal (como SUSP.1); a fixação real deve estar sobre o tubo. B11.5 (geometria do volante) segue com os juízes.',
      })
    }
  }

  // ---------------------------------------------------------------
  // B6.3.3 — seção dos membros primários (%C deriva do material, DF-1)
  {
    const s = cage.primarySection
    const mat = materialOf(s)
    const dimOk = s.od >= 25.4 && s.wall >= 3.05
    const carbonOk = mat.carbon >= 0.18
    const primaries = members.filter((m) => PRIMARY_TYPES.includes(m.type))
    const eqApplies = !dimOk && s.wall >= 1.57
    const stiff = bendingStiffness(s)
    const strong = bendingStrength(s)
    const refStiff = bendingStiffness(REFERENCE_SECTION)
    const refStrong = bendingStrength(REFERENCE_SECTION)
    const eqOk = stiff >= refStiff && strong >= refStrong
    results.push({
      id: 'B6.3.3.1',
      title: 'Membros primários: Ø ≥ 25,4 mm, parede ≥ 3,05 mm, C ≥ 0,18%',
      status: dimOk && carbonOk ? 'pass' : eqApplies && carbonOk && eqOk ? 'pass' : 'fail',
      measured: `Ø ${fmt(s.od)} × ${fmt(s.wall, 2)} mm, ${mat.label} (C ${fmt(mat.carbon, 2)}%)`,
      limit: 'Ø 25,4 × 3,05 mm (ou equivalência B6.3.3.2)',
      members: memberIds(primaries),
      note:
        eqApplies && carbonOk && eqOk
          ? 'Aprovado via equivalência de rigidez/resistência à flexão (B6.3.3.2).'
          : undefined,
    })
    if (eqApplies) {
      // B6.3.3.2 — equivalência automática: E·I e Sy·I/c vs tubo de referência (SAE 1018, Ø 25,4 × 3,05)
      results.push({
        id: 'B6.3.3.2',
        title:
          'Equivalência de rigidez (E·I) e resistência à flexão (Sy·I/c) vs tubo de referência',
        status: eqOk ? 'pass' : 'fail',
        measured: `E·I = ${fmt(stiff / 1e9, 2)}·10⁹ N·mm² · Sy·I/c = ${fmt(strong / 1e3, 0)} N·m`,
        limit: `≥ ${fmt(refStiff / 1e9, 2)}·10⁹ N·mm² · ≥ ${fmt(refStrong / 1e3, 0)} N·m`,
        members: memberIds(primaries),
        note: 'Referência: SAE 1018, Ø 25,4 × 3,05 mm (E = 205 GPa, Sy = 370 MPa).',
      })
    }
  }

  // ---------------------------------------------------------------
  // B6.3.4 — seção dos membros secundários (%C deriva do material, DF-1)
  {
    const s = cage.secondarySection
    const mat = materialOf(s)
    const ok = s.od >= 25.4 && s.wall >= 0.89 && mat.carbon >= 0.18
    const secondaries = members.filter((m) => !PRIMARY_TYPES.includes(m.type))
    results.push({
      id: 'B6.3.4.1',
      title: 'Membros secundários: dim. ≥ 25,4 mm, parede ≥ 0,89 mm, C ≥ 0,18%',
      status: ok ? 'pass' : 'fail',
      measured: `Ø ${fmt(s.od)} × ${fmt(s.wall, 2)} mm, ${mat.label} (C ${fmt(mat.carbon, 2)}%)`,
      limit: 'Ø ≥ 25,4 mm, parede ≥ 0,89 mm',
      members: memberIds(secondaries),
    })
  }

  // ---------------------------------------------------------------
  // MAT.1 — material customizado com propriedades fora de faixas plausíveis (FR-DF1.2)
  {
    const issues: string[] = []
    for (const [label, s] of [
      ['primário', cage.primarySection],
      ['secundário', cage.secondarySection],
    ] as const) {
      if (s.materialId !== 'custom' || !s.custom) continue
      const m = s.custom
      const checks: Array<[string, number, readonly [number, number]]> = [
        ['E', m.youngGPa, PLAUSIBLE.youngGPa],
        ['Sy', m.yieldMPa, PLAUSIBLE.yieldMPa],
        ['ρ', m.densityKgM3, PLAUSIBLE.densityKgM3],
        ['%C', m.carbon, PLAUSIBLE.carbon],
      ]
      for (const [prop, v, [lo, hi]] of checks) {
        if (v < lo || v > hi)
          issues.push(`${label}: ${prop} = ${fmt(v, 2)} fora de ${fmt(lo, 0)}–${fmt(hi, 0)}`)
      }
    }
    if (issues.length) {
      results.push({
        id: 'MAT.1',
        title: 'Material customizado com propriedades fora de faixas plausíveis para aço',
        status: 'warn',
        measured: issues.join('; '),
        members: [],
        note: 'Regra de modelagem do portal — confira o certificado de matéria-prima.',
      })
    }
  }

  // ---------------------------------------------------------------
  // B6.3.1 — emendas de topo detectadas (DF-6): membros quase colineares (< 5°) num nó
  // sem passagem contínua declarada exigem reforço por luva interna (B6.3.1.2–.5)
  {
    const splices = spliceCandidates(cage)
    if (splices.length) {
      results.push({
        id: 'B6.3.1',
        title: 'Emendas de topo (< 5°) exigem luva interna: 2×Ø p/ cada lado, ≥ 102 mm de solda',
        status: 'manual',
        measured: `emenda(s) em: ${splices.map((s) => s.node).join(', ')}`,
        members: splices.flatMap((s) => s.pair),
        note: 'Detecção automática (DF-6): par de tubos quase colineares sem passagem contínua declarada. Se for uma peça única, declare a continuidade no painel do nó.',
      })
    }
  }

  // ---------------------------------------------------------------
  // JOINT.X — tubos que se cruzam/colidem sem nó de junta (DF-7, FR-DF7.2)
  {
    const crossings = detectJoints(cage).filter((j) => j.kind === 'crossing')
    if (crossings.length) {
      results.push({
        id: 'JOINT.X',
        title: 'Tubos se cruzam sem nó de junta (colisão ou recorte especial)',
        status: 'warn',
        measured: crossings
          .map((c) => `${c.target} × ${c.coped[0]} (eixos a ${fmt(c.pairDistMm ?? 0)} mm)`)
          .join('; '),
        limit: 'criar nó na interseção ou afastar os tubos',
        members: crossings.flatMap((c) => [c.target, ...c.coped]),
        note: 'Regra de modelagem do portal. Cruzamentos reais exigem interrupção (ex.: LFDB × USM, B6.2.9.4) ou travessia declarada (SHC × LDB, B6.2.6.2).',
      })
    }
  }

  // ---------------------------------------------------------------
  // Itens não verificáveis automaticamente — checklist manual
  const manual: Array<[string, string]> = [
    [
      'B6.1.3',
      'Folga do capacete ≥ 152 mm até retas entre membros do habitáculo (verificação com piloto)',
    ],
    ['B6.1.4', 'Folga do corpo ≥ 76 mm (ombros, tronco, quadril, coxas, joelhos, braços, mãos)'],
    ['B6.2.4.5', 'Montantes do RRH são tubos contínuos (sem emendas soldadas)'],
    ['B6.2.7.2', 'RHO + FBM superior de cada lado em tubo único contínuo (curva no ponto C)'],
    ['B6.3.2', 'Amostras de soldagem (ensaio destrutivo + inspeção de penetração) documentadas'],
    ['B6.3.5', 'Ficha de Especificação da Gaiola completa, assinada, com notas fiscais/laudos'],
  ]
  for (const [id, title] of manual) {
    results.push({ id, title, status: 'manual', members: [] })
  }

  return results
}

/**
 * Regras que passam a falhar se o membro for totalmente removido.
 * Lista vazia = remoção não infringe nenhuma regra automática.
 */
export function removalImpact(cage: Cage, memberId: string, baseResults?: RuleResult[]): string[] {
  const base = baseResults ?? evaluate(cage)
  const baseFails = new Set(base.filter((r) => r.status === 'fail').map((r) => r.id))
  const sub: Cage = { ...cage, members: cage.members.filter((m) => m.id !== memberId) }
  return evaluate(sub)
    .filter((r) => r.status === 'fail' && !baseFails.has(r.id))
    .map((r) => r.id)
}
