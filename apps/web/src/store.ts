import { create } from 'zustand'
import type {
  Cage,
  Member,
  MemberType,
  NodeId,
  SteelMaterialRef,
  SteeringMount,
  Vec3,
} from '@bajeiros/core/model/types'
import { mirrorId } from '@bajeiros/core/model/types'
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

interface State {
  cage: Cage
  selectedNode: NodeId | null
  selectedMember: string | null
  selectedAnchor: string | null
  selectedSteering: string | null
  highlightRule: string | null
  mirror: boolean
  showRedundant: boolean
  showGeraldao: boolean
  showManikin: boolean
  pending: Pending | null
  wizardActive: boolean
  setWizardActive: (v: boolean) => void
  selectNode: (id: NodeId | null) => void
  selectMember: (id: string | null) => void
  selectAnchor: (id: string | null) => void
  selectSteering: (id: string | null) => void
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
  highlightRule: null,
  mirror: true,
  showRedundant: false,
  showGeraldao: false,
  showManikin: false,
  pending: null,
  wizardActive: false,
  setWizardActive: (v) =>
    set({
      wizardActive: v,
      selectedNode: null,
      selectedMember: null,
      selectedAnchor: null,
      selectedSteering: null,
      pending: null,
    }),
  selectNode: (id) =>
    set({
      selectedNode: id,
      selectedMember: null,
      selectedAnchor: null,
      selectedSteering: null,
      highlightRule: null,
    }),
  selectMember: (id) =>
    set({
      selectedMember: id,
      selectedNode: null,
      selectedAnchor: null,
      selectedSteering: null,
      highlightRule: null,
    }),
  selectAnchor: (id) =>
    set({
      selectedAnchor: id,
      selectedNode: null,
      selectedMember: null,
      selectedSteering: null,
      highlightRule: null,
    }),
  selectSteering: (id) =>
    set({
      selectedSteering: id,
      selectedNode: null,
      selectedMember: null,
      selectedAnchor: null,
      highlightRule: null,
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
    set((s) => ({ cage: { ...s.cage, steering: undefined }, selectedSteering: null })),
  setSteeringMode: (mode) =>
    set((s) => {
      const st = s.cage.steering
      if (!st || st.mode === mode) return {}
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
      if (!st) return {}
      const points = st.points.map((p) => {
        if (p.id === id) return { ...p, pos }
        if (
          s.mirror &&
          st.mode === 'mesa' &&
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
      const anchors = (s.cage.anchors ?? []).map((a) => {
        if (a.id === id) return { ...a, pos }
        if (s.mirror) {
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
    }),
  cancelPending: () => set({ pending: null }),
  pickNode: (id) =>
    set((s) => {
      if (!s.pending)
        return { selectedNode: id, selectedMember: null, selectedAnchor: null, highlightRule: null }
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
      const nodes = { ...s.cage.nodes, [id]: pos }
      if (s.mirror) {
        const mid = mirrorId(id)
        if (mid && nodes[mid]) nodes[mid] = { x: -pos.x, y: pos.y, z: pos.z }
      }
      return { cage: { ...s.cage, nodes } }
    }),
  deleteNode: (id) =>
    set((s) => {
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
    set({
      cage: {
        ...cage,
        // FR-DF1.6 — migração silenciosa de projetos exportados antes do DF-1
        primarySection: migrateSection(cage.primarySection),
        secondarySection: migrateSection(cage.secondarySection),
        // FR-DF6.4/6.5 — saneia declarações de continuidade importadas
        continuity: sanitizeContinuity(cage),
      },
      selectedNode: null,
      selectedMember: null,
      selectedAnchor: null,
      selectedSteering: null,
      highlightRule: null,
      pending: null,
    }),
  reset: () =>
    set({
      cage: structuredClone(templateCage),
      selectedNode: null,
      selectedMember: null,
      selectedAnchor: null,
      selectedSteering: null,
      highlightRule: null,
      pending: null,
    }),
}))
