import type { ReactElement } from 'react'
import { IconBanSlash, IconCheck, IconInfoCircle, IconPerson, IconTriangleAlert } from './glyphs'
import type { SvgProps } from './Svg'

/**
 * O mapa dos cinco papéis de status (design-system §8.7) e as strings canônicas
 * de §11.3. É a implementação de CT-3: **status nunca depende só de cor** — o par
 * ícone + texto é o portador, a cor é reforço.
 *
 * Medido na auditoria: `brand` × `warn` dá ΔE00 0,9 em deuteranopia no escuro e 1,1
 * no claro; `fail` × `warn` no claro dá 1,1. Quem confia na cor não distingue.
 *
 * VOCABULÁRIO — divergência registrada (DF-12 RF-4.2): o design-system §11.3 fixa
 * INFRAÇÃO/PRESENCIAL; o estudo §9.4 e o canvas usam NÃO CONFORME / VERIFICAÇÃO
 * PRESENCIAL. A escolha é do product owner (fase 2.6 do plano de design). Enquanto
 * ela não vem, a fonte é §11.3 — e mudar depois é editar ESTE arquivo, nunca telas.
 */
export type StatusRole = 'pass' | 'fail' | 'warn' | 'manual' | 'info'

export const STATUS_LABEL: Record<StatusRole, string> = {
  pass: 'CONFORME',
  fail: 'INFRAÇÃO',
  warn: 'VERIFICAR',
  manual: 'PRESENCIAL',
  info: 'NOTA',
}

/** Forma por papel. Um papel, um glifo — e nenhum glifo em dois papéis (§8.7). */
const GLYPH: Record<StatusRole, (p: Omit<SvgProps, 'children'>) => ReactElement> = {
  pass: IconCheck,
  fail: IconBanSlash,
  warn: IconTriangleAlert,
  manual: IconPerson,
  info: IconInfoCircle,
}

export function StatusIcon({
  role,
  size = 16,
}: {
  role: StatusRole
  size?: SvgProps['size']
}): ReactElement {
  const Glyph = GLYPH[role]
  // decorativo por construção: o texto canônico ao lado é o portador do significado
  return <Glyph size={size} />
}

/** Chip completo — a forma recomendada de exibir status (C-07). */
export function StatusChip({ role, size = 16 }: { role: StatusRole; size?: SvgProps['size'] }) {
  return (
    <span className={`bj-chip bj-chip-${role}`}>
      <StatusIcon role={role} size={size} />
      {STATUS_LABEL[role]}
    </span>
  )
}
