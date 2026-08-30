/**
 * Fonte de verdade dos tokens do design system (fase 0 do plano de design; ADR-009).
 *
 * ESTE ARQUIVO E `tokens.css` SÃO OS ÚNICOS LUGARES DO REPO ONDE UM HEX PODE SER
 * ESCRITO — `scripts/check-tokens.mjs` falha em qualquer outro.
 *
 * Por que TS e não só CSS: o `three.js` NÃO lê `var()`. `THREE.Color` parseia string
 * de cor, não custom property — o material 3D importa o símbolo daqui e a regra CSS
 * lê a variável gerada deste mesmo objeto. Um teste de paridade falha se divergirem.
 *
 * Alfas saem como `rgb(R G B / A%)` LITERAL, nunca `hsl(from …)`: o alvo de build do
 * projeto é chrome107/edge107/firefox104/safari16 e a sintaxe de cor relativa exige
 * Chrome 119. Num motor do alvo o custom property fica inválido, `border: 1px solid
 * var(--bj-border)` vira invalid-at-computed-value-time e as bordas do app somem
 * inteiras (design-system §1.6).
 */

/** Tema escuro — o canônico. Chaves = nome do custom property sem o prefixo `--bj-`. */
export const dark = {
  // superfícies — rampa neutra quente, OKLCh h=68° C=0.013, passo de L 0.029
  'bg-canvas': '#211c16',
  'bg-base': '#28231d',
  'bg-raised': '#2f2a24',
  'bg-overlay': '#37312b',
  'bg-sunken': '#1a1510',
  'bg-inset': '#140f0a',

  // texto
  'fg-primary': '#f1efeb',
  'fg-secondary': '#c2bdb7',
  'fg-muted': '#98938d',
  'fg-faint': '#7f7a74',
  'fg-inverse': '#19120d',
  'disabled-fg': '#6e6860',

  // bordas — alfa sobre branco
  border: 'rgb(255 255 255 / 10%)',
  'border-strong': 'rgb(255 255 255 / 36%)',
  'border-stronger': 'rgb(255 255 255 / 55%)',

  // marca
  brand: '#c89123',
  'brand-strong': '#e0a72e',
  'brand-dim': '#b58f54',
  'brand-bg': '#2e2109',
  'brand-border': '#887040',
  'on-brand': '#1a1206',

  // acento
  accent: '#4fb8d8',
  'accent-bg': '#0e2a35',
  'accent-border': '#4d7a8a',
  'on-accent': '#08161c',

  // status
  pass: '#6fb060',
  'pass-bg': '#16240f',
  'pass-border': '#64795d',
  'on-pass': '#0d1409',
  fail: '#e56e4d',
  'fail-bg': '#3a1610',
  'fail-border': '#97685d',
  'on-fail': '#1b0d08',
  warn: '#e07a24',
  'warn-bg': '#331e07',
  'warn-border': '#8e6d4d',
  'on-warn': '#1c1004',
  manual: '#8ba3bc',
  'manual-bg': '#182029',
  'manual-border': '#667584',
  'on-manual': '#0e1319',
  info: '#b8ada0',
  'info-bg': '#26211b',
  'info-border': '#78736c',
  'on-info': '#17130e',

  // estados de interação
  hover: 'rgb(255 255 255 / 5.5%)',
  active: 'rgb(255 255 255 / 10%)',
  selected: 'rgb(200 145 35 / 14%)',
  scrim: 'rgb(10 6 3 / 72%)',

  // foco — outline, nunca box-shadow (§1.6, desvio 2)
  'focus-ring-color': '#4fb8d8',

  // elevação
  'shadow-sm': '0 1px 2px 0 rgb(10 6 3 / 40%), 0 2px 8px 0 rgb(0 0 0 / 24%)',
  'shadow-md': '0 2px 4px 0 rgb(10 6 3 / 44%), 0 8px 24px 0 rgb(0 0 0 / 34%)',
  'shadow-lg': '0 4px 8px 0 rgb(10 6 3 / 48%), 0 24px 56px 0 rgb(0 0 0 / 46%)',
} as const

/**
 * Tema claro — MODO DE ALTA LUMINOSIDADE (projetor, oficina), não segunda expressão
 * de marca. Projetado agora porque é barato; entregue depois (fase 12 do plano).
 */
export const light = {
  'bg-canvas': '#f4e9d9',
  'bg-base': '#faf2e6',
  'bg-raised': '#fdf8f0',
  'bg-overlay': '#fffdfb',
  'bg-sunken': '#eadecc',
  'bg-inset': '#e1d3be',

  'fg-primary': '#251c15',
  'fg-secondary': '#52473f',
  'fg-muted': '#70655c',
  'fg-faint': '#7f766e',
  'fg-inverse': '#faf2e6',
  'disabled-fg': '#9a8f84',

  // bordas invertem para alfa sobre a TINTA — alfa-branco sobre areia é invisível.
  // É a única inversão estrutural entre os modos.
  border: 'rgb(37 28 21 / 12%)',
  'border-strong': 'rgb(37 28 21 / 51%)',
  'border-stronger': 'rgb(37 28 21 / 68%)',

  brand: '#805c12',
  'brand-strong': '#684a0f',
  'brand-dim': '#7e643c',
  'brand-bg': '#f1dcac',
  'brand-border': '#957a42',
  'on-brand': '#fbf5ea',

  accent: '#15637a',
  'accent-bg': '#d8ecf3',
  'accent-border': '#658b98',
  'on-accent': '#f4fbfd',

  pass: '#3d6a2c',
  'pass-bg': '#e3efd7',
  'pass-border': '#728f62',
  'on-pass': '#f6faf1',
  fail: '#a3341c',
  'fail-bg': '#fadfd5',
  'fail-border': '#ad7564',
  'on-fail': '#fdf3ef',
  warn: '#93450f',
  'warn-bg': '#fae2c9',
  'warn-border': '#a57c4e',
  'on-warn': '#fdf5ec',
  manual: '#3a5169',
  'manual-bg': '#dfe7f0',
  'manual-border': '#758696',
  'on-manual': '#f4f7fb',
  info: '#5d5347',
  'info-bg': '#ece2d2',
  'info-border': '#8c806f',
  'on-info': '#faf6ef',

  hover: 'rgb(37 28 21 / 5%)',
  active: 'rgb(37 28 21 / 10%)',
  selected: 'rgb(128 92 18 / 14%)',
  scrim: 'rgb(37 28 21 / 40%)',

  'focus-ring-color': '#15637a',

  'shadow-sm': '0 1px 2px 0 rgb(74 52 18 / 10%), 0 2px 8px 0 rgb(74 52 18 / 8%)',
  'shadow-md': '0 2px 4px 0 rgb(74 52 18 / 12%), 0 8px 24px 0 rgb(74 52 18 / 12%)',
  'shadow-lg': '0 4px 8px 0 rgb(74 52 18 / 14%), 0 24px 56px 0 rgb(74 52 18 / 18%)',
} as const

/**
 * Cena 3D — SEM variante clara (design-system §9.1): o viewport permanece escuro nos
 * dois modos. Emitido como `--bj-3d-*`; consumido em TS pelo material do three.js.
 */
export const viewport3d = {
  bg: '#140f0a',
  grid: '#6c5e51',
  member: '#e2d6c4',
  'member-secondary': '#928780',
  selected: '#ffbb54',
  fail: '#e56e4d',
  removable: '#b2aadb',
  'anchor-ok': '#3186d4',
  'anchor-bad': '#e56e4d',
  node: '#6c788b',
  'node-named': '#d5effd',
  pilot: '#6bb5ab',
  datum: '#4fb8d8',
  'label-fg': '#ece7dd',
  'label-bg': '#241f19',
} as const

/** Iguais nos dois modos, por decisão: forma, espaço, tipografia, movimento, estrutura. */
export const shared = {
  'radius-sm': '4px',
  radius: '8px',
  'radius-lg': '12px',
  'radius-pill': '999px',

  'focus-ring-offset': '2px',

  'space-1': '4px',
  'space-2': '8px',
  'space-3': '12px',
  'space-4': '16px',
  'space-5': '24px',
  'space-6': '32px',
  'space-7': '48px',
  'space-8': '64px',

  'font-display':
    "'Newsreader', 'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, 'Times New Roman', serif",
  'font-sans':
    "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  'font-mono':
    "'JetBrains Mono', ui-monospace, 'Cascadia Mono', Consolas, 'Liberation Mono', monospace",
  'text-xs': '11px',
  'text-sm': '12px',
  'text-base': '14px',
  'text-lg': '16px',
  'text-xl': '18px',
  'text-2xl': '22px',
  'text-3xl': '30px',
  'leading-tight': '1.2',
  'leading-normal': '1.55',
  'weight-regular': '400',
  'weight-medium': '500',
  'weight-bold': '700',
  'tracking-wide': '0.04em',

  ease: 'cubic-bezier(0.2, 0, 0, 1)',
  'dur-fast': '120ms',
  'dur-base': '200ms',

  'rail-w': '224px',
  'rail-w-compact': '56px',
  'topbar-h': '48px',
  'panel-w': '360px',
  'panel-w-sm': '320px',
  'panel-w-min': '280px',
  'viewport-min-w': '360px',
  'modal-w': '560px',
  'modal-w-lg': '880px',
  'page-w': '1200px',
  'prose-w': '860px',
  'control-h-sm': '28px',
  'control-h': '32px',
  'control-h-lg': '40px',
  'target-min': '32px',

  'z-base': '0',
  'z-sticky': '10',
  'z-3d-label': '40',
  'z-viewport-chrome': '50',
  'z-dropdown': '60',
  'z-overlay': '100',
  'z-modal': '110',
  'z-toast': '120',
  'z-landing': '200',
} as const

/** Densidade: `compact` é o padrão do editor; `comfortable`, o das páginas de conteúdo. */
export const density = {
  compact: {
    'row-h': '28px',
    'pad-y': 'var(--bj-space-1)',
    'pad-x': 'var(--bj-space-2)',
    gap: 'var(--bj-space-2)',
  },
  comfortable: {
    'row-h': '36px',
    'pad-y': 'var(--bj-space-2)',
    'pad-x': 'var(--bj-space-3)',
    gap: 'var(--bj-space-3)',
  },
} as const

/** Modo apresentação (projetor, sala de aula): só redefine a escala tipográfica. */
export const presentation = {
  'text-xs': '13px',
  'text-sm': '14px',
  'text-base': '16px',
  'text-lg': '18px',
  'text-xl': '22px',
  'text-2xl': '28px',
  'text-3xl': '38px',
  'control-h-sm': '32px',
  'control-h': '36px',
  'target-min': '40px',
} as const

export const tokens = { dark, light, viewport3d, shared, density, presentation }

export type ThemeTokens = typeof dark
export type TokenName = keyof ThemeTokens
export type Color3d = keyof typeof viewport3d

// NADA além de objetos literais, `as const` e `export type` mora neste arquivo:
// `scripts/build-tokens.mjs` o carrega removendo essas duas construções, sem
// compilador TS. Uma anotação de tipo em função quebraria o build dos tokens.
