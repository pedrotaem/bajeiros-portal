import { create } from 'zustand'
import type {
  Axle,
  Cage,
  Member,
  MemberType,
  NodeId,
  Side,
  SteelMaterialRef,
  SteeringMount,
  SuspensionType,
  TireSpec,
  Vec3,
} from '@bajeiros/core/model/types'
import { isLocked, mirrorId, sanitizeLocked, wheelLockId } from '@bajeiros/core/model/types'
import {
  AXLES,
  defaultSuspension,
  isTypeAllowed,
  reconcileAnchors,
  sanitizeSuspension,
} from '@bajeiros/core/model/suspension'
import { applyRenames, identifyNamedPoints } from '@bajeiros/core/model/identify'
import {
  PLANE_TOL_MM,
  detectPlanes,
  rotatePlaneTo,
  setPointDistance,
} from '@bajeiros/core/model/planes'
import { templateCage } from '@bajeiros/core/model/template'
import { DEFAULT_MATERIAL_ID, STEELS, migrateSection } from '@bajeiros/core/model/materials'
import { sanitizeContinuity } from '@bajeiros/core/model/continuity'
import {
  defaultManikin,
  profileById,
  solveManikin,
  type JointId,
  type ManikinConfig,
} from '@bajeiros/core/model/manikin'

interface Pending {
  type: MemberType
  first: NodeId | null
}

/**
 * Aplica as posições novas e, com o espelho ligado, reflete as que ainda não têm
 * gêmeo no próprio lote — o mesmo contrato de `moveNode`, num lugar só porque
 * agora três ações (arrastar, cotar e girar plano) movem nó.
 *
 * DF-23: gêmeo TRAVADO não acompanha. Recusar o movimento inteiro por causa do
 * outro lado seria pior — travar o lado direito porque ele já está decidido não
 * pode impedir de mexer no esquerdo.
 */
function withMirror(
  cage: Cage,
  moved: Record<NodeId, Vec3>,
  mirror: boolean,
): Record<NodeId, Vec3> {
  const next = { ...cage.nodes, ...moved }
  if (!mirror) return next
  for (const [id, pos] of Object.entries(moved)) {
    const mid = mirrorId(id)
    if (mid && next[mid] && !(mid in moved) && !isLocked(cage, mid)) {
      next[mid] = { x: -pos.x, y: pos.y, z: pos.z }
    }
  }
  return next
}

/** Vistas canônicas da câmera (DF-23). `seq` faz o mesmo botão reenquadrar. */
export type CameraView = 'lateral' | 'frontal' | 'superior' | 'iso'

/** Resumo do último "Recalcular" (DF-31) — o que mudou no modelo, para a tela dizer. */
export interface RecalcReport {
  renamed: [NodeId, NodeId][]
  skipped: { id: string; wanted: string; reason: string }[]
  prunedNamed: number
  prunedLocked: number
  prunedContinuity: number
  /** ancoragens criadas (+) ou removidas (−) pela reconciliação com o tipo de suspensão */
  anchorsDelta: number
  suspensionDropped: boolean
  at: number
}

interface State {
  cage: Cage
  selectedNode: NodeId | null
  selectedMember: string | null
  selectedAnchor: string | null
  selectedSteering: string | null
  selectedPlane: string | null
  // DF-30: centro de roda selecionado (um ponto por eixo; o lado só muda o rótulo e o sinal de x)
  selectedWheel: { axle: Axle; side: Side } | null
  highlightRule: string | null
  mirror: boolean
  showRedundant: boolean
  showGeraldao: boolean
  showManikin: boolean
  showPlanes: boolean
  // DF-29: rótulos de id dos nós. DF-30: corpos da suspensão e marcadores de ancoragem.
  showLabels: boolean
  showSuspension: boolean
  showAnchors: boolean
  planeTolMm: number
  cameraView: { view: CameraView; seq: number } | null
  setCameraView: (view: CameraView) => void
  recalcReport: RecalcReport | null
  recalculate: () => void
  toggleLock: (id: string) => void
  setLocked: (ids: string[], locked: boolean) => void
  pending: Pending | null
  wizardActive: boolean
  setWizardActive: (v: boolean) => void
  selectNode: (id: NodeId | null) => void
  selectMember: (id: string | null) => void
  selectAnchor: (id: string | null) => void
  selectSteering: (id: string | null) => void
  selectPlane: (id: string | null) => void
  selectWheel: (sel: { axle: Axle; side: Side } | null) => void
  setShowPlanes: (v: boolean) => void
  setShowLabels: (v: boolean) => void
  setShowSuspension: (v: boolean) => void
  setShowAnchors: (v: boolean) => void
  enableSuspension: () => void
  removeSuspension: () => void
  setSuspensionType: (axle: Axle, type: SuspensionType) => void
  setWheelbase: (mm: number) => void
  setTire: (axle: Axle, patch: Partial<TireSpec>) => void
  moveWheelCenter: (axle: Axle, side: Side, pos: Vec3) => void
  setPlaneTol: (mm: number) => void
  setDistance: (a: NodeId, b: NodeId, targetMm: number, move: 'a' | 'b' | 'both') => void
  setPlaneAngle: (movingId: string, refId: string, deg: number) => void
  moveAnchor: (id: string, pos: Vec3) => void
  addSteering: (mode: 'central' | 'mesa') => void
  removeSteering: () => void
  setSteeringMode: (mode: 'central' | 'mesa') => void
  setSteeringZone: (radiusMm: number) => void
  moveSteeringPoint: (id: string, pos: Vec3) => void
  splitMember: (id: string) => void
  toggleNamed: (id: NodeId) => void
  setHighlightRule: (id: string | null) => void
  setMirror: (v: boolean) => void
  setShowRedundant: (v: boolean) => void
  setShowGeraldao: (v: boolean) => void
  setShowManikin: (v: boolean) => void
  setManikin: (patch: Partial<ManikinConfig>) => void
  setManikinAngle: (joint: JointId, value: number) => void
  startAddMember: (type: MemberType) => void
  cancelPending: () => void
  pickNode: (id: NodeId) => void
  addFreeNode: () => void
  moveNode: (id: NodeId, pos: Vec3) => void
  deleteNode: (id: NodeId) => void
  deleteMember: (id: string) => void
  setMemberType: (id: string, type: MemberType) => void
  setGeraldao: (pos: Vec3) => void
  setSeatBottomY: (y: number) => void
  setSection: (which: 'primary' | 'secondary', field: 'od' | 'wall', value: number) => void
  setMaterial: (which: 'primary' | 'secondary', materialId: string) => void
  setWeightParams: (params: Partial<NonNullable<Cage['weightParams']>>) => void
  setContinuity: (node: NodeId, pair: [string, string]) => void
  clearContinuity: (node: NodeId, pair: [string, string]) => void
  setCustomMaterial: (which: 'primary' | 'secondary', props: Partial<SteelMaterialRef>) => void
  loadCage: (cage: Cage) => void
  reset: () => void
}

let memberSeq = 1000

export const useStore = create<State>((set, _get) => ({
  cage: structuredClone(templateCage),
  selectedNode: null,
  selectedMember: null,
  selectedAnchor: null,
  selectedSteering: null,
  selectedPlane: null,
  selectedWheel: null,
  highlightRule: null,
  mirror: true,
  showRedundant: false,
  showGeraldao: false,
  showManikin: false,
  showPlanes: false,
  showLabels: true,
  showSuspension: true,
  showAnchors: true,
  planeTolMm: PLANE_TOL_MM,
  cameraView: null,
  recalcReport: null,
  // DF-31 — re-identifica os pontos denominados pela topologia, saneia como a importação e
  // reconcilia as ancoragens com o tipo de cada eixo. O modelo saneado é um objeto novo:
  // tudo que deriva dele (regras, planos, remoção) recalcula por conta própria.
  recalculate: () =>
    set((s) => {
      const ident = identifyNamedPoints(s.cage)
      let cage: Cage = applyRenames(s.cage, ident.renames)
      const namedBefore = cage.namedExtra?.length ?? 0
      const namedExtra = (cage.namedExtra ?? []).filter((id) => id in cage.nodes)
      const contBefore = cage.continuity?.length ?? 0
      const continuity = sanitizeContinuity(cage)
      const suspension = sanitizeSuspension(cage)
      const anchorsBefore = cage.anchors?.length ?? 0
      let anchors = cage.anchors ?? []
      if (suspension) {
        for (const axle of AXLES) {
          anchors = reconcileAnchors(
            anchors,
            axle,
            suspension[axle].type,
            suspension[axle].wheelCenter,
          )
        }
      }
      cage = {
        ...cage,
        namedExtra,
        continuity,
        suspension,
        anchors,
        primarySection: migrateSection(cage.primarySection),
        secondarySection: migrateSection(cage.secondarySection),
      }
      const lockedBefore = cage.locked?.length ?? 0
      const locked = sanitizeLocked(cage)
      cage = { ...cage, locked }
      const map = (id: NodeId) => ident.renames[id] ?? id
      return {
        cage,
        // a seleção segue o rename; "adicionar membro" pendente cai (o 1º nó pode ter mudado de id)
        selectedNode: s.selectedNode ? map(s.selectedNode) : null,
        selectedAnchor:
          s.selectedAnchor && anchors.some((a) => a.id === s.selectedAnchor)
            ? s.selectedAnchor
            : null,
        pending: null,
        recalcReport: {
          renamed: Object.entries(ident.renames),
          skipped: ident.skipped,
          prunedNamed: namedBefore - namedExtra.length,
          prunedLocked: lockedBefore - locked.length,
          prunedContinuity: contBefore - continuity.length,
          anchorsDelta: anchors.length - anchorsBefore,
          suspensionDropped: !!s.cage.suspension && !suspension,
          at: Date.now(),
        },
      }
    }),
  setCameraView: (view) =>
    set((s) => ({ cameraView: { view, seq: (s.cameraView?.seq ?? 0) + 1 } })),
  toggleLock: (id) =>
    set((s) => {
      const cur = s.cage.locked ?? []
      return {
        cage: {
          ...s.cage,
          locked: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id],
        },
      }
    }),
  setLocked: (ids, locked) =>
    set((s) => {
      const cur = new Set(s.cage.locked ?? [])
      for (const id of ids) {
        if (locked) cur.add(id)
        else cur.delete(id)
      }
      return { cage: { ...s.cage, locked: [...cur] } }
    }),
  pending: null,
  wizardActive: false,
  setWizardActive: (v) =>
    set({
      wizardActive: v,
      selectedNode: null,
      selectedMember: null,
      selectedAnchor: null,
      selectedSteering: null,
      selectedPlane: null,
      selectedWheel: null,
      pending: null,
    }),
  selectNode: (id) =>
    set({
      selectedNode: id,
      selectedMember: null,
      selectedAnchor: null,
      selectedSteering: null,
      selectedPlane: null,
      selectedWheel: null,
      highlightRule: null,
    }),
  selectMember: (id) =>
    set({
      selectedMember: id,
      selectedNode: null,
      selectedAnchor: null,
      selectedSteering: null,
      selectedPlane: null,
      selectedWheel: null,
      highlightRule: null,
    }),
  selectAnchor: (id) =>
    set({
      selectedAnchor: id,
      selectedNode: null,
      selectedMember: null,
      selectedSteering: null,
      selectedPlane: null,
      selectedWheel: null,
      highlightRule: null,
    }),
  selectSteering: (id) =>
    set({
      selectedSteering: id,
      selectedNode: null,
      selectedMember: null,
      selectedAnchor: null,
      selectedPlane: null,
      selectedWheel: null,
      highlightRule: null,
    }),
  selectPlane: (id) =>
    set({
      selectedPlane: id,
      selectedWheel: null,
      selectedNode: null,
      selectedMember: null,
      selectedAnchor: null,
      selectedSteering: null,
      highlightRule: null,
    }),
  selectWheel: (sel) =>
    set({
      selectedWheel: sel,
      selectedNode: null,
      selectedMember: null,
      selectedAnchor: null,
      selectedSteering: null,
      selectedPlane: null,
      highlightRule: null,
    }),
  setShowPlanes: (v) => set({ showPlanes: v }),
  setShowLabels: (v) => set({ showLabels: v }),
  setShowSuspension: (v) => set({ showSuspension: v }),
  setShowAnchors: (v) => set({ showAnchors: v }),
  // DF-30 — a configuração nasce do que a gaiola já tem (FR-DF30.3); com ela presente é no-op
  enableSuspension: () =>
    set((s) =>
      s.cage.suspension ? {} : { cage: { ...s.cage, suspension: defaultSuspension(s.cage) } },
    ),
  removeSuspension: () =>
    set((s) => {
      if (!s.cage.suspension) return {}
      const cage: Cage = { ...s.cage, suspension: undefined }
      // as ancoragens ficam (FR-DF30.5); só a trava dos centros de roda morre com eles
      return { cage: { ...cage, locked: sanitizeLocked(cage) }, selectedWheel: null }
    }),
  setSuspensionType: (axle, type) =>
    set((s) => {
      const susp = s.cage.suspension
      if (!susp || susp[axle].type === type || !isTypeAllowed(axle, type)) return {}
      const anchors = reconcileAnchors(s.cage.anchors ?? [], axle, type, susp[axle].wheelCenter)
      const cage: Cage = {
        ...s.cage,
        anchors,
        suspension: { ...susp, [axle]: { ...susp[axle], type } },
      }
      // ancoragem removida pela reconciliação não pode deixar trava fantasma (FR-15.5)
      const locked = sanitizeLocked(cage)
      const selectedAnchor =
        s.selectedAnchor && anchors.some((a) => a.id === s.selectedAnchor) ? s.selectedAnchor : null
      return { cage: { ...cage, locked }, selectedAnchor }
    }),
  setWheelbase: (mm) =>
    set((s) =>
      s.cage.suspension && Number.isFinite(mm) && mm > 0
        ? { cage: { ...s.cage, suspension: { ...s.cage.suspension, wheelbaseMm: mm } } }
        : {},
    ),
  setTire: (axle, patch) =>
    set((s) => {
      const susp = s.cage.suspension
      if (!susp) return {}
      const tire = { ...susp[axle].tire, ...patch }
      if (!(tire.od > 0 && tire.width > 0 && tire.rim > 0)) return {}
      return { cage: { ...s.cage, suspension: { ...susp, [axle]: { ...susp[axle], tire } } } }
    }),
  // o centro é um ponto por eixo, guardado para o lado L: mover o R move o par (FR-DF30.7)
  moveWheelCenter: (axle, side, pos) =>
    set((s) => {
      const susp = s.cage.suspension
      if (!susp || isLocked(s.cage, wheelLockId(axle))) return {}
      const left: Vec3 = side === 'L' ? pos : { x: -pos.x, y: pos.y, z: pos.z }
      return {
        cage: {
          ...s.cage,
          suspension: { ...susp, [axle]: { ...susp[axle], wheelCenter: left } },
        },
      }
    }),
  setPlaneTol: (mm) => set({ planeTolMm: Math.max(1, Math.min(50, mm)), selectedPlane: null }),
  setDistance: (a, b, targetMm, move) =>
    set((s) => {
      // par L/R espelhado só admite afastamento simétrico: mover só um lado seria
      // desfeito pelo próprio espelho no mesmo passo, com a cota errada no fim.
      const twins = s.mirror && mirrorId(a) === b
      const moved = setPointDistance(s.cage, a, b, targetMm, twins ? 'both' : move)
      // DF-23: quem se move é escolha explícita — se o escolhido está travado, a cota
      // não acontece. Deslocar o outro ponto "para ajudar" entregaria uma edição que
      // ninguém pediu.
      if (!moved || Object.keys(moved).some((id) => isLocked(s.cage, id))) return {}
      return { cage: { ...s.cage, nodes: withMirror(s.cage, moved, s.mirror) } }
    }),
  setPlaneAngle: (movingId, refId, deg) =>
    set((s) => {
      const planes = detectPlanes(s.cage, s.planeTolMm)
      const moving = planes.find((p) => p.id === movingId)
      const ref = planes.find((p) => p.id === refId)
      if (!moving || !ref) return {}
      const moved = rotatePlaneTo(s.cage, moving, ref, deg, s.planeTolMm)
      // giro é corpo rígido: com um ponto travado no meio, girar o resto deformaria o
      // plano em vez de inclinar — recusa inteiro (a tela avisa antes, FR-DF23.6)
      if (!moved || Object.keys(moved).some((id) => isLocked(s.cage, id))) return {}
      return { cage: { ...s.cage, nodes: withMirror(s.cage, moved, s.mirror) } }
    }),
  addSteering: (mode) =>
    set((s) => {
      if (s.cage.steering) return {}
      // default: zona do punho do manequim (percentil maior) com a configuração atual
      const cfg = { ...defaultManikin(), ...s.cage.manikin }
      const wrist = solveManikin(
        cfg,
        profileById(cfg.profileMax),
        s.cage.seatBottomY,
        s.cage.geraldao.z,
      ).wrist
      const base = { x: 0, y: Math.round(wrist.y), z: Math.round(wrist.z) }
      const steering: SteeringMount =
        mode === 'central'
          ? { mode, points: [{ id: 'SW', pos: base }] }
          : {
              mode,
              points: [
                { id: 'SWL', pos: { ...base, x: -150 } },
                { id: 'SWR', pos: { ...base, x: 150 } },
              ],
            }
      return { cage: { ...s.cage, steering } }
    }),
  removeSteering: () =>
    set((s) => {
      const cage: Cage = { ...s.cage, steering: undefined }
      return { cage: { ...cage, locked: sanitizeLocked(cage) }, selectedSteering: null }
    }),
  setSteeringMode: (mode) =>
    set((s) => {
      const st = s.cage.steering
      if (!st || st.mode === mode) return {}
      // trocar de modo troca os ids dos pontos (SW ↔ SWL/SWR): a trava do id antigo
      // não pode sobreviver como fantasma
      const locked = (s.cage.locked ?? []).filter((id) => !st.points.some((p) => p.id === id))
      if (mode === 'central') {
        const avg = st.points.reduce(
          (a, p) => ({
            x: a.x + p.pos.x / st.points.length,
            y: a.y + p.pos.y / st.points.length,
            z: a.z + p.pos.z / st.points.length,
          }),
          { x: 0, y: 0, z: 0 },
        )
        return {
          cage: {
            ...s.cage,
            locked,
            steering: {
              ...st,
              mode,
              points: [{ id: 'SW', pos: { x: 0, y: Math.round(avg.y), z: Math.round(avg.z) } }],
            },
          },
          selectedSteering: null,
        }
      }
      const c = st.points[0]?.pos ?? { x: 0, y: 700, z: 400 }
      return {
        cage: {
          ...s.cage,
          locked,
          steering: {
            ...st,
            mode,
            points: [
              { id: 'SWL', pos: { ...c, x: -150 } },
              { id: 'SWR', pos: { ...c, x: 150 } },
            ],
          },
        },
        selectedSteering: null,
      }
    }),
  setSteeringZone: (radiusMm) =>
    set((s) =>
      s.cage.steering
        ? { cage: { ...s.cage, steering: { ...s.cage.steering, zoneRadiusMm: radiusMm } } }
        : {},
    ),
  moveSteeringPoint: (id, pos) =>
    set((s) => {
      const st = s.cage.steering
      if (!st || isLocked(s.cage, id)) return {}
      const points = st.points.map((p) => {
        if (p.id === id) return { ...p, pos }
        if (
          s.mirror &&
          st.mode === 'mesa' &&
          !isLocked(s.cage, p.id) &&
          ((id === 'SWL' && p.id === 'SWR') || (id === 'SWR' && p.id === 'SWL'))
        ) {
          return { ...p, pos: { x: -pos.x, y: pos.y, z: pos.z } }
        }
        return p
      })
      return { cage: { ...s.cage, steering: { ...st, points } } }
    }),
  moveAnchor: (id, pos) =>
    set((s) => {
      if (isLocked(s.cage, id)) return {}
      const anchors = (s.cage.anchors ?? []).map((a) => {
        if (a.id === id) return { ...a, pos }
        if (s.mirror && !isLocked(s.cage, a.id)) {
          const me = (s.cage.anchors ?? []).find((x) => x.id === id)
          if (me && a.axle === me.axle && a.role === me.role && a.side !== me.side) {
            return { ...a, pos: { x: -pos.x, y: pos.y, z: pos.z } }
          }
        }
        return a
      })
      return { cage: { ...s.cage, anchors } }
    }),
  splitMember: (id) =>
    set((s) => {
      const m = s.cage.members.find((x) => x.id === id)
      if (!m) return {}
      let i = 1
      while (s.cage.nodes[`N${i}`]) i++
      const nid = `N${i}`
      const a = s.cage.nodes[m.a]
      const b = s.cage.nodes[m.b]
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 }
      const members = s.cage.members.flatMap((x) =>
        x.id === id
          ? [
              { ...x, id: `${x.id}a`, b: nid },
              { ...x, id: `${x.id}b`, a: nid },
            ]
          : [x],
      )
      // DF-6: dividir não solda — as metades nascem como passagem contínua no novo nó,
      // e declarações existentes nas pontas antigas migram para a metade correspondente
      const continuity = [
        ...(s.cage.continuity ?? []).map((c) => ({
          ...c,
          pair: c.pair.map((pid) =>
            pid === id ? (c.node === m.a ? `${id}a` : `${id}b`) : pid,
          ) as [string, string],
        })),
        { node: nid, pair: [`${id}a`, `${id}b`] as [string, string] },
      ]
      return {
        cage: { ...s.cage, nodes: { ...s.cage.nodes, [nid]: mid }, members, continuity },
        selectedMember: null,
        selectedNode: nid,
      }
    }),
  toggleNamed: (id) =>
    set((s) => {
      const cur = s.cage.namedExtra ?? []
      const namedExtra = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
      return { cage: { ...s.cage, namedExtra } }
    }),
  setHighlightRule: (id) => set({ highlightRule: id }),
  setMirror: (v) => set({ mirror: v }),
  setShowRedundant: (v) => set({ showRedundant: v }),
  setShowGeraldao: (v) => set({ showGeraldao: v }),
  setShowManikin: (v) => set({ showManikin: v }),
  setManikin: (patch) =>
    set((s) => ({
      cage: { ...s.cage, manikin: { ...defaultManikin(), ...s.cage.manikin, ...patch } },
    })),
  setManikinAngle: (joint, value) =>
    set((s) => {
      const cur = { ...defaultManikin(), ...s.cage.manikin }
      return {
        cage: { ...s.cage, manikin: { ...cur, angles: { ...cur.angles, [joint]: value } } },
      }
    }),
  startAddMember: (type) =>
    set({
      pending: { type, first: null },
      selectedMember: null,
      selectedNode: null,
      selectedAnchor: null,
      selectedPlane: null,
      selectedWheel: null,
    }),
  cancelPending: () => set({ pending: null }),
  pickNode: (id) =>
    set((s) => {
      if (!s.pending)
        return {
          selectedNode: id,
          selectedMember: null,
          selectedAnchor: null,
          selectedPlane: null,
          selectedWheel: null,
          highlightRule: null,
        }
      if (!s.pending.first) return { pending: { ...s.pending, first: id } }
      if (s.pending.first === id) return {}
      const exists = s.cage.members.some(
        (m) => (m.a === s.pending!.first && m.b === id) || (m.b === s.pending!.first && m.a === id),
      )
      if (exists) return { pending: null }
      const member: Member = {
        id: `m${memberSeq++}`,
        type: s.pending.type,
        a: s.pending.first,
        b: id,
      }
      return {
        cage: { ...s.cage, members: [...s.cage.members, member] },
        pending: null,
        selectedMember: member.id,
        selectedNode: null,
      }
    }),
  addFreeNode: () =>
    set((s) => {
      let i = 1
      while (s.cage.nodes[`N${i}`]) i++
      const id = `N${i}`
      const g = s.cage.geraldao
      return {
        cage: { ...s.cage, nodes: { ...s.cage.nodes, [id]: { x: 0, y: g.y + 300, z: g.z } } },
        selectedNode: id,
        selectedMember: null,
      }
    }),
  moveNode: (id, pos) =>
    set((s) => {
      if (isLocked(s.cage, id)) return {}
      return { cage: { ...s.cage, nodes: withMirror(s.cage, { [id]: pos }, s.mirror) } }
    }),
  deleteNode: (id) =>
    set((s) => {
      if (isLocked(s.cage, id)) return {}
      if (s.cage.members.some((m) => m.a === id || m.b === id)) return {}
      const nodes = { ...s.cage.nodes }
      delete nodes[id]
      return { cage: { ...s.cage, nodes }, selectedNode: null }
    }),
  deleteMember: (id) =>
    set((s) => ({
      cage: {
        ...s.cage,
        members: s.cage.members.filter((m) => m.id !== id),
        // DF-6: remove passagens que referenciam o membro (sem estado órfão)
        continuity: (s.cage.continuity ?? []).filter((c) => !c.pair.includes(id)),
      },
      selectedMember: null,
    })),
  setMemberType: (id, type) =>
    set((s) => ({
      cage: {
        ...s.cage,
        members: s.cage.members.map((m) => (m.id === id ? { ...m, type } : m)),
      },
    })),
  setGeraldao: (pos) => set((s) => ({ cage: { ...s.cage, geraldao: pos } })),
  setSeatBottomY: (y) => set((s) => ({ cage: { ...s.cage, seatBottomY: y } })),
  setSection: (which, field, value) =>
    set((s) => ({
      cage: {
        ...s.cage,
        [which === 'primary' ? 'primarySection' : 'secondarySection']: {
          ...s.cage[which === 'primary' ? 'primarySection' : 'secondarySection'],
          [field]: value,
        },
      },
    })),
  setMaterial: (which, materialId) =>
    set((s) => {
      const key = which === 'primary' ? 'primarySection' : 'secondarySection'
      const cur = s.cage[key]
      const custom =
        materialId === 'custom'
          ? (cur.custom ?? {
              ...STEELS.find((m) => m.id === DEFAULT_MATERIAL_ID)!,
              id: 'custom',
              label: 'Customizado',
            })
          : undefined
      return {
        cage: {
          ...s.cage,
          [key]: { ...cur, materialId, ...(custom ? { custom } : { custom: undefined }) },
        },
      }
    }),
  setContinuity: (node, pair) =>
    set((s) => {
      const next: Cage = {
        ...s.cage,
        continuity: [...(s.cage.continuity ?? []), { node, pair }],
      }
      // sanitiza: rejeita pares inválidos ou extremidade já usada (fica como estava)
      const clean = sanitizeContinuity(next)
      const added = clean.some(
        (c) => c.node === node && c.pair.includes(pair[0]) && c.pair.includes(pair[1]),
      )
      return added ? { cage: { ...next, continuity: clean } } : {}
    }),
  clearContinuity: (node, pair) =>
    set((s) => ({
      cage: {
        ...s.cage,
        continuity: (s.cage.continuity ?? []).filter(
          (c) => !(c.node === node && c.pair.includes(pair[0]) && c.pair.includes(pair[1])),
        ),
      },
    })),
  setWeightParams: (params) =>
    set((s) => ({
      cage: {
        ...s.cage,
        weightParams: { weldPerJointG: 30, ...s.cage.weightParams, ...params },
      },
    })),
  setCustomMaterial: (which, props) =>
    set((s) => {
      const key = which === 'primary' ? 'primarySection' : 'secondarySection'
      const cur = s.cage[key]
      if (cur.materialId !== 'custom' || !cur.custom) return {}
      return { cage: { ...s.cage, [key]: { ...cur, custom: { ...cur.custom, ...props } } } }
    }),
  loadCage: (cage) =>
    set(() => {
      // FR-DF30.6 — configuração de suspensão inválida é descartada inteira, e a trava do
      // centro de roda depende dela existir: por isso sai antes de sanear as travas
      const withSusp: Cage = { ...cage, suspension: sanitizeSuspension(cage) }
      return {
        cage: {
          ...withSusp,
          // FR-DF1.6 — migração silenciosa de projetos exportados antes do DF-1
          primarySection: migrateSection(cage.primarySection),
          secondarySection: migrateSection(cage.secondarySection),
          // FR-DF6.4/6.5 — saneia declarações de continuidade importadas
          continuity: sanitizeContinuity(cage),
          // DF-23 — trava de id que não existe mais no JSON importado é fantasma
          locked: sanitizeLocked(withSusp),
        },
        selectedNode: null,
        selectedMember: null,
        selectedAnchor: null,
        selectedSteering: null,
        selectedPlane: null,
        selectedWheel: null,
        highlightRule: null,
        pending: null,
      }
    }),
  reset: () =>
    set({
      cage: structuredClone(templateCage),
      selectedNode: null,
      selectedMember: null,
      selectedAnchor: null,
      selectedSteering: null,
      selectedPlane: null,
      selectedWheel: null,
      highlightRule: null,
      pending: null,
    }),
}))
