import type { CSSProperties, ReactNode } from 'react'

/**
 * Primitivo de ícone (design-system §8.1). É o ÚNICO lugar que emite `viewBox`,
 * `stroke-width` e os atributos de acessibilidade — nenhum glifo os repete.
 *
 * `stroke-linecap="round"` é REGRA DE BUILD, não estética: `M12 17h.01` (do
 * `triangle-alert`) e `M12 8h.01` (do `info`) são segmentos de comprimento ~0. Sem o
 * cap redondo, o ponto da exclamação e o pingo do "i" simplesmente desaparecem — e
 * nada no CI falha. Pelo mesmo motivo, `removeUselessStrokeAndFill` do SVGO fica
 * DESLIGADO se um dia houver pipeline de otimização.
 */
export interface SvgProps {
  /** 16 (denso), 20 (padrão), 24 (destaque) — design-system §8.1. */
  size?: 16 | 20 | 24
  /** Sem rótulo o ícone é decorativo e some do leitor de tela (o texto ao lado basta). */
  label?: string
  className?: string
  style?: CSSProperties
  children: ReactNode
}

export function Svg({ size = 20, label, className, style, children }: SvgProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden={label ? undefined : true}
      role={label ? 'img' : undefined}
      aria-label={label}
      focusable="false"
    >
      {children}
    </svg>
  )
}
