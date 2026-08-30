/**
 * Registro do inventário de ícones (design-system §8.5). DADOS PUROS: quem consome
 * importa o componente de `glyphs.tsx`; este arquivo existe para o guard
 * (`scripts/check-icons.mjs`), para a galeria e para o aviso de terceiros.
 *
 * TETO DE 24 FORMAS. Hoje são 21 (5 status + 16 utilitárias + **0 de domínio**): dos
 * 17 candidatos de domínio Baja, 14 caíram no portão de §8.9 e os 3 finalistas
 * perderam para glifos reais na tira de colisão a 16px. Um glifo novo só entra pelo
 * processo de §8.9, com doador único (Lucide) e geometria colada de §8.10 — nunca
 * desenhada à mão.
 */
export type IconRole = 'status' | 'acao' | 'navegacao' | 'objeto'

export interface IconEntry {
  /** Nome do componente exportado por `glyphs.tsx`. */
  name: string
  /** Arquivo no doador — a origem literal, para conferir a cópia. */
  upstream: string
  role: IconRole
  license: 'ISC' | 'ISC + MIT'
  /** O que o glifo significa aqui. Um significado, um glifo (§8.5). */
  meaning: string
}

export const ICON_DONOR = { name: 'lucide', version: '1.34.0', commit: '1a60fd28' } as const
export const ICON_CEILING = 24

export const ICONS: readonly IconEntry[] = [
  // status — geometria congelada por CT-3; atualização do doador NUNCA se propaga
  {
    name: 'IconCheck',
    upstream: 'check.svg',
    role: 'status',
    license: 'ISC + MIT',
    meaning: 'conforme',
  },
  {
    name: 'IconBanSlash',
    upstream: 'ban.svg',
    role: 'status',
    license: 'ISC',
    meaning: 'infração',
  },
  {
    name: 'IconTriangleAlert',
    upstream: 'triangle-alert.svg',
    role: 'status',
    license: 'ISC + MIT',
    meaning: 'verificar',
  },
  {
    name: 'IconPerson',
    upstream: 'user.svg',
    role: 'status',
    license: 'ISC',
    meaning: 'presencial',
  },
  {
    name: 'IconInfoCircle',
    upstream: 'info.svg',
    role: 'status',
    license: 'ISC + MIT',
    meaning: 'nota',
  },

  // navegação
  {
    name: 'IconArrow',
    upstream: 'arrow-right.svg',
    role: 'navegacao',
    license: 'ISC + MIT',
    meaning: 'ir para / voltar',
  },
  {
    name: 'IconChevronRight',
    upstream: 'chevron-right.svg',
    role: 'navegacao',
    license: 'ISC + MIT',
    meaning: 'expandir',
  },
  {
    name: 'IconChevronsRight',
    upstream: 'chevrons-right.svg',
    role: 'navegacao',
    license: 'ISC + MIT',
    meaning: 'recolher painel',
  },

  // ações
  { name: 'IconX', upstream: 'x.svg', role: 'acao', license: 'ISC + MIT', meaning: 'fechar' },
  {
    name: 'IconPlus',
    upstream: 'plus.svg',
    role: 'acao',
    license: 'ISC + MIT',
    meaning: 'adicionar',
  },
  {
    name: 'IconTrash',
    upstream: 'trash.svg',
    role: 'acao',
    license: 'ISC + MIT',
    meaning: 'excluir',
  },
  {
    name: 'IconDownload',
    upstream: 'download.svg',
    role: 'acao',
    license: 'ISC + MIT',
    meaning: 'baixar',
  },
  {
    name: 'IconUpload',
    upstream: 'upload.svg',
    role: 'acao',
    license: 'ISC + MIT',
    meaning: 'enviar arquivo',
  },
  {
    name: 'IconCloudUp',
    upstream: 'cloud-upload.svg',
    role: 'acao',
    license: 'ISC',
    meaning: 'salvar na nuvem',
  },
  {
    name: 'IconRotateCcw',
    upstream: 'rotate-ccw.svg',
    role: 'acao',
    license: 'ISC',
    meaning: 'desfazer / recomeçar',
  },

  // objetos
  {
    name: 'IconMessage',
    upstream: 'message-square.svg',
    role: 'objeto',
    license: 'ISC',
    meaning: 'assistente',
  },
  { name: 'IconUsers', upstream: 'users.svg', role: 'objeto', license: 'ISC', meaning: 'equipe' },
  { name: 'IconFiles', upstream: 'files.svg', role: 'objeto', license: 'ISC', meaning: 'projetos' },
  {
    name: 'IconSliders',
    upstream: 'sliders-horizontal.svg',
    role: 'objeto',
    license: 'ISC',
    meaning: 'administração',
  },
  {
    name: 'IconAccount',
    upstream: 'circle-user.svg',
    role: 'objeto',
    license: 'ISC',
    meaning: 'conta',
  },
  {
    name: 'IconShield',
    upstream: 'shield.svg',
    role: 'objeto',
    license: 'ISC',
    meaning: 'segurança',
  },
]

/** Glifos herdados do Feather (MIT) — o aviso de terceiros os lista nominalmente. */
export const FEATHER_DERIVED = ICONS.filter((i) => i.license === 'ISC + MIT').map((i) => i.name)
