/**
 * Registro do inventário de ícones (design-system §8.5). DADOS PUROS: quem consome
 * importa o componente de `glyphs.tsx`; este arquivo existe para o guard
 * (`scripts/check-icons.mjs`), para a galeria e para o aviso de terceiros.
 *
 * TETO DE 24 FORMAS. Hoje são 23 (5 status + 15 utilitárias + 3 de destino do rail +
 * **0 de domínio**): dos 17 candidatos de domínio Baja, 14 caíram no portão de §8.9 e
 * os 3 finalistas perderam para glifos reais na tira de colisão a 16px. Um glifo novo
 * só entra pelo processo de §8.9, com doador único (Lucide) e geometria colada de
 * §8.10 — nunca desenhada à mão.
 *
 * `IconMessage` (balão) saiu no DF-24: seu único significado era "assistente", e o
 * assistente passou a ter marca própria. Glifo sem call site não ocupa vaga (§8.4).
 * As MARCAS de ferramenta são outra categoria e estão no fim deste arquivo.
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

  // destinos do rail (DF-12) — as 3 vagas restantes; o inventário fecha em 24
  {
    name: 'IconHouse',
    upstream: 'house.svg',
    role: 'navegacao',
    license: 'ISC',
    meaning: 'início',
  },
  {
    name: 'IconWrench',
    upstream: 'wrench.svg',
    role: 'navegacao',
    license: 'ISC',
    meaning: 'ferramentas',
  },
  {
    name: 'IconTrophy',
    upstream: 'trophy.svg',
    role: 'navegacao',
    license: 'ISC',
    meaning: 'comunidade',
  },
]

/** Glifos herdados do Feather (MIT) — o aviso de terceiros os lista nominalmente. */
export const FEATHER_DERIVED = ICONS.filter((i) => i.license === 'ISC + MIT').map((i) => i.name)

/**
 * MARCAS DE PRODUTO (DF-24; ampliada pelo DF-25) — categoria separada, **não entra na
 * contagem de 24**. São obra própria do projeto (não há doador), identificam produto e
 * não vocabulário, e nunca aparecem sem rótulo ao lado. Exceção escrita no
 * design-system §8.6.
 *
 * O teto de 4 continua o mesmo: 3 ocupadas, 1 livre.
 */
export interface MarkEntry {
  /** Nome do componente exportado por `marks.tsx`. */
  name: string
  /** O produto que a marca identifica — marca sem produto nomeado não entra. */
  product: string
  meaning: string
}

export const MARK_CEILING = 4

export const MARKS: readonly MarkEntry[] = [
  {
    name: 'MarkCage',
    product: 'Validador de Gaiola',
    meaning: 'três pontos denominados, os tubos que os ligam e o ângulo no vértice',
  },
  {
    name: 'MarkAssistant',
    product: 'Assistente do Regulamento',
    meaning: 'a folha do regulamento com o brilho de IA — sem balão de conversa',
  },
  {
    name: 'MarkPortal',
    product: 'Portal Bajeiros',
    meaning: 'o perfil octogonal do corta-fogo com o X das diagonais e os nós nos vértices',
  },
]
