import type { Anchor, Cage, Member, Vec3 } from './types'

// Sistema de coordenadas: mm. +Y para cima, +Z para frente do veículo, +X lado direito do piloto.
//
// Gaiola default do portal — projeto do usuário exportado do próprio editor
// ("Novas referencias/gaiola-bajeiros (3).json", 2026-08-22), derivado da réplica FEI
// (gabarito da corta-fogo octogonal, perfil GOM, Fig A5/A6 — ver "Novas referencias/"
// e scratchpad/fei/). Normalizações aplicadas ao importar como template:
// - simetria L/R: criado N1L (espelho do N1), X do assoalho completado (IL→FX, FX→FR),
//   FX/U2 recentrados no eixo, diagonal espelhada do corta-fogo (LDB3→LDB4), base em y=0;
// - N1 projetado sobre a reta C→N e o FBM dividido nele (CR→N1→NR / CL→N1L→NL);
// - retipagem dos membros criados no editor com o tipo default do dropdown (FAB_UP):
//   C→N = FBM_UP, SM→N = SIM (fecha a cadeia RRH→SIM→FBM), SM→I e N1→SM = FREE;
// - USM prolongado até a ILC (B6.2.10/11) e continuidade RHO+FBM declarada no ponto C.
// Sem cintura D/DLC: o FBM desce direto do teto ao quadro frontal N (dobra em N,
// ponto denominado), nariz curto e elevado (F em y=81), lateral inteira na altura do
// cinto (S/SM/N em y≈340) — B6.2.9 fecha com o Geraldão em y=105, que também dá
// C 1041 mm acima do assento (B6.2.7.5).

const nodes: Record<string, Vec3> = {
  // corta-fogo (octógono reclinado ~11°)
  AL: { x: -348, y: 0, z: 0 },
  AR: { x: 348, y: 0, z: 0 },
  SL: { x: -406.1, y: 340, z: -64.6 },
  SR: { x: 406.1, y: 340, z: -64.6 },
  HL: { x: -440, y: 710, z: -134.9 },
  HR: { x: 440, y: 710, z: -134.9 },
  BL: { x: -300, y: 1150, z: -218.5 },
  BR: { x: 300, y: 1150, z: -218.5 },
  // teto
  CL: { x: -232, y: 1146, z: 449 },
  CR: { x: 232, y: 1146, z: 449 },
  // nó do FBM onde ancora a diagonal N1→SM (sobre a reta C→N)
  N1L: { x: -229.9, y: 1028, z: 530.2 },
  N1: { x: 229.9, y: 1028, z: 530.2 },
  // quadro frontal (topo N, base F) — nariz curto e elevado
  NL: { x: -218, y: 342, z: 1002 },
  NR: { x: 218, y: 342, z: 1002 },
  FL: { x: -217, y: 81, z: 1010 },
  FR: { x: 217, y: 81, z: 1010 },
  IL: { x: -291, y: 41, z: 670 },
  IR: { x: 291, y: 41, z: 670 },
  // nó do SIM (denominado)
  SML: { x: -310, y: 337, z: 634 },
  SMR: { x: 310, y: 337, z: 634 },
  // nó da diagonal do assoalho dianteiro (sobre a reta IL→FR)
  FX: { x: 0, y: 63.9, z: 864.8 },
  // USM curto sob o assento (design do usuário, v4)
  U1: { x: 0, y: 0, z: 0 },
  U2: { x: 0, y: 15, z: 378 },
  // amarração traseira e suportes do motor
  RL: { x: -330, y: 400, z: -450 },
  RR: { x: 330, y: 400, z: -450 },
  EML: { x: -280, y: 60, z: -430 },
  EMR: { x: 280, y: 60, z: -430 },
  // extremidades das diagonais do corta-fogo (sobre os montantes)
  LDB1: { x: -369, y: 121, z: -27 },
  LDB2: { x: 340.4, y: 1023, z: -194.4 },
  LDB3: { x: 369, y: 121, z: -27 },
  LDB4: { x: -340.4, y: 1023, z: -194.4 },
}

const members: Member[] = [
  { id: 'RRH-0', type: 'RRH', a: 'AL', b: 'SL' },
  { id: 'RRH-1', type: 'RRH', a: 'SL', b: 'HL' },
  { id: 'RRH-2', type: 'RRH', a: 'HL', b: 'BL' },
  { id: 'RRH-3', type: 'RRH', a: 'AR', b: 'SR' },
  { id: 'RRH-4', type: 'RRH', a: 'SR', b: 'HR' },
  { id: 'RRH-5', type: 'RRH', a: 'HR', b: 'BR' },
  { id: 'ALC-6', type: 'ALC', a: 'AL', b: 'AR' },
  { id: 'BLC-7', type: 'BLC', a: 'BL', b: 'BR' },
  { id: 'SHC-8', type: 'SHC', a: 'HL', b: 'HR' },
  { id: 'LDB-9', type: 'LDB', a: 'LDB1', b: 'LDB2' },
  { id: 'FREE-10', type: 'FREE', a: 'LDB3', b: 'LDB4' },
  { id: 'RHO-11', type: 'RHO', a: 'BL', b: 'CL' },
  { id: 'RHO-12', type: 'RHO', a: 'BR', b: 'CR' },
  { id: 'CLC-13', type: 'CLC', a: 'CL', b: 'CR' },
  // FBM: teto → quadro frontal, dividido no nó N1 (colinear)
  { id: 'FBM_UP-14', type: 'FBM_UP', a: 'CL', b: 'N1L' },
  { id: 'FBM_UP-15', type: 'FBM_UP', a: 'N1L', b: 'NL' },
  { id: 'FBM_UP-16', type: 'FBM_UP', a: 'CR', b: 'N1' },
  { id: 'FBM_UP-17', type: 'FBM_UP', a: 'N1', b: 'NR' },
  { id: 'FBM_LOW-20', type: 'FBM_LOW', a: 'NL', b: 'FL' },
  { id: 'FBM_LOW-22', type: 'FBM_LOW', a: 'NR', b: 'FR' },
  // SIM: S → SM → N (cadeia completa até o FBM)
  { id: 'SIM-23', type: 'SIM', a: 'SL', b: 'SML' },
  { id: 'SIM-25', type: 'SIM', a: 'SR', b: 'SMR' },
  { id: 'SIM-56', type: 'SIM', a: 'SML', b: 'NL' },
  { id: 'SIM-57', type: 'SIM', a: 'SMR', b: 'NR' },
  { id: 'LFS-27', type: 'LFS', a: 'AL', b: 'IL' },
  { id: 'LFS-28', type: 'LFS', a: 'IL', b: 'FL' },
  { id: 'LFS-29', type: 'LFS', a: 'AR', b: 'IR' },
  { id: 'LFS-30', type: 'LFS', a: 'IR', b: 'FR' },
  { id: 'ILC-31', type: 'ILC', a: 'IL', b: 'IR' },
  { id: 'FLC-32', type: 'FLC', a: 'FL', b: 'FR' },
  { id: 'LFDB-33', type: 'LFDB', a: 'AL', b: 'IR' },
  { id: 'USM-35', type: 'USM', a: 'U1', b: 'U2' },
  { id: 'FAB_UP-36', type: 'FAB_UP', a: 'BL', b: 'RL' },
  { id: 'FAB_UP-37', type: 'FAB_UP', a: 'BR', b: 'RR' },
  { id: 'FAB_MID-38', type: 'FAB_MID', a: 'SL', b: 'RL' },
  { id: 'FAB_MID-39', type: 'FAB_MID', a: 'SR', b: 'RR' },
  { id: 'FAB_LOW-40', type: 'FAB_LOW', a: 'AL', b: 'RL' },
  { id: 'FAB_LOW-41', type: 'FAB_LOW', a: 'AR', b: 'RR' },
  { id: 'RLC-42', type: 'RLC', a: 'RL', b: 'RR' },
  { id: 'FREE-43', type: 'FREE', a: 'BL', b: 'CR' },
  // travessa do topo do quadro frontal = DLC (os pontos N fazem o papel dos D)
  { id: 'DLC-47', type: 'DLC', a: 'NL', b: 'NR' },
  { id: 'FREE-48', type: 'FREE', a: 'NL', b: 'IL' },
  { id: 'FREE-49', type: 'FREE', a: 'NR', b: 'IR' },
  // diagonal única do assoalho dianteiro (IL→FX→FR), par da LFDB traseira
  { id: 'FREE-63', type: 'FREE', a: 'IL', b: 'FX' },
  { id: 'FREE-64', type: 'FREE', a: 'FX', b: 'FR' },
  { id: 'FREE-54', type: 'FREE', a: 'AL', b: 'SML' },
  { id: 'FREE-55', type: 'FREE', a: 'AR', b: 'SMR' },
  { id: 'FREE-58', type: 'FREE', a: 'AL', b: 'EML' },
  { id: 'FREE-59', type: 'FREE', a: 'AR', b: 'EMR' },
  { id: 'FREE-60', type: 'FREE', a: 'EML', b: 'EMR' },
  { id: 'FREE-61', type: 'FREE', a: 'EML', b: 'RL' },
  { id: 'FREE-62', type: 'FREE', a: 'EMR', b: 'RR' },
  // diagonais do usuário: FBM (N1) → SM e SM → I, nos dois lados
  { id: 'm1000', type: 'FREE', a: 'N1', b: 'SMR' },
  { id: 'm1002', type: 'FREE', a: 'N1L', b: 'SML' },
  { id: 'm1001', type: 'FREE', a: 'SMR', b: 'IR' },
  { id: 'm1006', type: 'FREE', a: 'IL', b: 'SML' },
]

const anchors: Anchor[] = [
  {
    id: 'dianteira-inf1-L',
    axle: 'dianteira',
    side: 'L',
    role: 'inf1',
    pos: { x: -291, y: 84, z: 665 },
  },
  {
    id: 'dianteira-inf1-R',
    axle: 'dianteira',
    side: 'R',
    role: 'inf1',
    pos: { x: 291, y: 84, z: 665 },
  },
  {
    id: 'dianteira-inf2-L',
    axle: 'dianteira',
    side: 'L',
    role: 'inf2',
    pos: { x: -220, y: 144, z: 1002 },
  },
  {
    id: 'dianteira-inf2-R',
    axle: 'dianteira',
    side: 'R',
    role: 'inf2',
    pos: { x: 220, y: 144, z: 1002 },
  },
  {
    id: 'dianteira-sup1-L',
    axle: 'dianteira',
    side: 'L',
    role: 'sup1',
    pos: { x: -304, y: 276, z: 638 },
  },
  {
    id: 'dianteira-sup1-R',
    axle: 'dianteira',
    side: 'R',
    role: 'sup1',
    pos: { x: 304, y: 276, z: 638 },
  },
  {
    id: 'dianteira-sup2-L',
    axle: 'dianteira',
    side: 'L',
    role: 'sup2',
    pos: { x: -216, y: 291, z: 1009 },
  },
  {
    id: 'dianteira-sup2-R',
    axle: 'dianteira',
    side: 'R',
    role: 'sup2',
    pos: { x: 216, y: 291, z: 1009 },
  },
  {
    id: 'dianteira-amort-L',
    axle: 'dianteira',
    side: 'L',
    role: 'amort',
    pos: { x: -265, y: 343, z: 796 },
  },
  {
    id: 'dianteira-amort-R',
    axle: 'dianteira',
    side: 'R',
    role: 'amort',
    pos: { x: 265, y: 343, z: 796 },
  },
  {
    id: 'traseira-inf1-L',
    axle: 'traseira',
    side: 'L',
    role: 'inf1',
    pos: { x: -342, y: 36, z: -166 },
  },
  {
    id: 'traseira-inf1-R',
    axle: 'traseira',
    side: 'R',
    role: 'inf1',
    pos: { x: 342, y: 36, z: -166 },
  },
  {
    id: 'traseira-inf2-L',
    axle: 'traseira',
    side: 'L',
    role: 'inf2',
    pos: { x: -297, y: 61, z: -398 },
  },
  {
    id: 'traseira-inf2-R',
    axle: 'traseira',
    side: 'R',
    role: 'inf2',
    pos: { x: 297, y: 61, z: -398 },
  },
  {
    id: 'traseira-sup1-L',
    axle: 'traseira',
    side: 'L',
    role: 'sup1',
    pos: { x: -379.5, y: 361, z: -199.5 },
  },
  {
    id: 'traseira-sup1-R',
    axle: 'traseira',
    side: 'R',
    role: 'sup1',
    pos: { x: 379.5, y: 361, z: -199.5 },
  },
  {
    id: 'traseira-sup2-L',
    axle: 'traseira',
    side: 'L',
    role: 'sup2',
    pos: { x: -345.2, y: 388, z: -372.9 },
  },
  {
    id: 'traseira-sup2-R',
    axle: 'traseira',
    side: 'R',
    role: 'sup2',
    pos: { x: 345.2, y: 388, z: -372.9 },
  },
  {
    id: 'traseira-amort-L',
    axle: 'traseira',
    side: 'L',
    role: 'amort',
    pos: { x: -371, y: 378, z: -267 },
  },
  {
    id: 'traseira-amort-R',
    axle: 'traseira',
    side: 'R',
    role: 'amort',
    pos: { x: 371, y: 378, z: -267 },
  },
]

export const templateCage: Cage = {
  nodes,
  members,
  geraldao: { x: 0, y: 105, z: 120 },
  seatBottomY: 100,
  // Seções da FEI atual (Figura A5/Tabela A3): primário SAE 4130 Ø31,75×1,60 (passa a
  // equivalência B6.3.3.2 c/ folga; SAE 1020 nominal Sy 350 MPa NÃO passa), secundário
  // 4130 Ø25,4×0,9. Tubos livres reais (Ø19,05×1,25) aproximados pela seção secundária.
  primarySection: { od: 31.75, wall: 1.6, materialId: '4130' },
  secondarySection: { od: 25.4, wall: 0.9, materialId: '4130' },
  namedExtra: ['SML', 'SMR', 'NL', 'NR'],
  anchors,
  continuity: [
    { node: 'AL', pair: ['FREE-54', 'FREE-58'] },
    { node: 'SL', pair: ['RRH-0', 'RRH-1'] },
    { node: 'SR', pair: ['RRH-3', 'RRH-4'] },
    { node: 'HL', pair: ['RRH-1', 'RRH-2'] },
    { node: 'HR', pair: ['RRH-4', 'RRH-5'] },
    { node: 'IL', pair: ['LFS-27', 'LFS-28'] },
    { node: 'IR', pair: ['LFS-29', 'LFS-30'] },
    { node: 'FX', pair: ['FREE-63', 'FREE-64'] },
    { node: 'SML', pair: ['FREE-54', 'm1002'] },
    { node: 'SMR', pair: ['FREE-55', 'm1000'] },
    // tubo contínuo dobrado no ponto C (RHO + FBM), como nos MBF
    { node: 'CL', pair: ['RHO-11', 'FBM_UP-14'] },
    { node: 'CR', pair: ['RHO-12', 'FBM_UP-16'] },
    // FBM passa reto pelo nó N1
    { node: 'N1L', pair: ['FBM_UP-14', 'FBM_UP-15'] },
    { node: 'N1', pair: ['FBM_UP-16', 'FBM_UP-17'] },
  ],
  manikin: {
    profileMin: 'F-P5',
    profileMax: 'M-P95',
    angles: { recline: 16, hip: 100, knee: 120, ankle: 100, shoulder: 30, elbow: 120 },
    seatPadMm: 40,
    helmetRadiusMm: 120,
  },
}
