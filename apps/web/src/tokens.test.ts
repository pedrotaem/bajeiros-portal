import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildCss, TARGET } from '../../../scripts/build-tokens.mjs'
import { findHexes } from '../../../scripts/check-tokens.mjs'
import { dark, light, presentation, shared, tokens, viewport3d } from './tokens'

// Fase 0 do plano de design, passos 0.2/0.4/0.5. Este arquivo é a razão de o
// design system ser verificável: sem ele, o CI passa verde num arquivo visualmente
// destruído (o app não tem um único teste de UI).

// ---------- cor: parsing e composição ----------

type Rgb = [number, number, number]

function parseColor(value: string): { rgb: Rgb; alpha: number } {
  const hex = value.trim().match(/^#([0-9a-f]{3,8})$/i)
  if (hex) {
    const h = hex[1]
    const full = h.length <= 4 ? [...h].map((c) => c + c).join('') : h
    return {
      rgb: [
        parseInt(full.slice(0, 2), 16),
        parseInt(full.slice(2, 4), 16),
        parseInt(full.slice(4, 6), 16),
      ],
      alpha: full.length === 8 ? parseInt(full.slice(6, 8), 16) / 255 : 1,
    }
  }
  const rgb = value.match(/rgb\(\s*(\d+)\s+(\d+)\s+(\d+)\s*(?:\/\s*([\d.]+)%\s*)?\)/i)
  if (!rgb) throw new Error(`cor não reconhecida: ${value}`)
  return {
    rgb: [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])],
    alpha: rgb[4] === undefined ? 1 : Number(rgb[4]) / 100,
  }
}

/** Token com alfa NÃO tem contraste próprio: mede-se composto sobre a superfície. */
function over(fg: string, bg: string): Rgb {
  const f = parseColor(fg)
  const b = parseColor(bg)
  if (f.alpha === 1) return f.rgb
  return f.rgb.map((c, i) => Math.round(c * f.alpha + b.rgb[i] * (1 - f.alpha))) as Rgb
}

/** Luminância relativa WCAG 2.1. */
function luminance([r, g, b]: Rgb): number {
  const lin = [r, g, b].map((v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]
}

export function contrast(fg: string, bg: string): number {
  const a = luminance(over(fg, bg))
  const b = luminance(parseColor(bg).rgb)
  const [hi, lo] = a > b ? [a, b] : [b, a]
  return (hi + 0.05) / (lo + 0.05)
}

const SURFACES = [
  'bg-canvas',
  'bg-base',
  'bg-raised',
  'bg-overlay',
  'bg-sunken',
  'bg-inset',
] as const
const STATUS = ['brand', 'accent', 'pass', 'fail', 'warn', 'manual', 'info'] as const
const THEMES = { escuro: dark, claro: light } as const

// ---------- 0.4 — contratos de contraste (design-system §2.6) ----------

describe('contraste — contratos do design system', () => {
  for (const [nome, t] of Object.entries(THEMES)) {
    it(`${nome}: fg-primary e fg-secondary ≥ 4,5 nas 6 superfícies`, () => {
      for (const fg of ['fg-primary', 'fg-secondary'] as const) {
        for (const bg of SURFACES) {
          expect(contrast(t[fg], t[bg]), `${fg} × ${bg}`).toBeGreaterThanOrEqual(4.5)
        }
      }
    })

    it(`${nome}: fg-muted e fg-faint ≥ 3,0 nas 6 superfícies`, () => {
      for (const fg of ['fg-muted', 'fg-faint'] as const) {
        for (const bg of SURFACES) {
          expect(contrast(t[fg], t[bg]), `${fg} × ${bg}`).toBeGreaterThanOrEqual(3.0)
        }
      }
    })

    it(`${nome}: on-X sobre X ≥ 4,5 (7 pares)`, () => {
      for (const s of STATUS) {
        expect(contrast(t[`on-${s}`], t[s]), `on-${s} × ${s}`).toBeGreaterThanOrEqual(4.5)
      }
    })

    it(`${nome}: X sobre X-bg ≥ 4,5 (7 status)`, () => {
      for (const s of STATUS) {
        expect(contrast(t[s], t[`${s}-bg`]), `${s} × ${s}-bg`).toBeGreaterThanOrEqual(4.5)
      }
    })

    it(`${nome}: X sobre base/raised/canvas ≥ 4,5`, () => {
      for (const s of STATUS) {
        for (const bg of ['bg-base', 'bg-raised', 'bg-canvas'] as const) {
          expect(contrast(t[s], t[bg]), `${s} × ${bg}`).toBeGreaterThanOrEqual(4.5)
        }
      }
    })

    it(`${nome}: border-strong composta ≥ 3,0 nas 6 superfícies (CT-1)`, () => {
      for (const bg of SURFACES) {
        expect(contrast(t['border-strong'], t[bg]), `border-strong × ${bg}`).toBeGreaterThanOrEqual(
          3.0,
        )
      }
    })

    it(`${nome}: X-border sobre base e sobre o próprio X-bg ≥ 3,0`, () => {
      for (const s of STATUS) {
        expect(
          contrast(t[`${s}-border`], t['bg-base']),
          `${s}-border × base`,
        ).toBeGreaterThanOrEqual(3.0)
        expect(
          contrast(t[`${s}-border`], t[`${s}-bg`]),
          `${s}-border × ${s}-bg`,
        ).toBeGreaterThanOrEqual(3.0)
      }
    })

    it(`${nome}: anel de foco ≥ 3,0 nas 6 superfícies`, () => {
      for (const bg of SURFACES) {
        expect(contrast(t['focus-ring-color'], t[bg]), `focus × ${bg}`).toBeGreaterThanOrEqual(3.0)
      }
    })
  }

  it('rótulo 3D ≥ 4,5 e grade 3D ≥ 3,0 sobre o fundo da cena', () => {
    expect(contrast(viewport3d['label-fg'], viewport3d['label-bg'])).toBeGreaterThanOrEqual(4.5)
    expect(contrast(viewport3d.grid, viewport3d.bg)).toBeGreaterThanOrEqual(3.0)
  })

  it('as três exceções continuam registradas, não corrigidas em silêncio', () => {
    // WCAG 1.4.3 isenta desabilitado, e elevar destrói o sinal de "indisponível"
    expect(contrast(dark['disabled-fg'], dark['bg-base'])).toBeLessThan(4.5)
    // selected é fundo, nunca borda/texto (CT-5) — composto rende ~1,2:1
    expect(contrast(dark.selected, dark['bg-base'])).toBeLessThan(1.5)
  })
})

// ---------- 0.5 — daltonismo (nasce falhando; a fase 10 o torna verde) ----------

/** Brettel/Viénot 1997 em espaço linear — dicromacia por projeção no plano do LMS. */
function simulate(rgb: Rgb, kind: 'protan' | 'deutan' | 'tritan'): Rgb {
  const lin = rgb.map((v) => {
    const s = v / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }) as Rgb
  const M: Record<typeof kind, number[][]> = {
    protan: [
      [0.152286, 1.052583, -0.204868],
      [0.114503, 0.786281, 0.099216],
      [-0.003882, -0.048116, 1.051998],
    ],
    deutan: [
      [0.367322, 0.860646, -0.227968],
      [0.280085, 0.672501, 0.047413],
      [-0.01182, 0.04294, 0.968881],
    ],
    tritan: [
      [1.255528, -0.076749, -0.178779],
      [-0.078411, 0.930809, 0.147602],
      [0.004733, 0.691367, 0.3039],
    ],
  }
  const m = M[kind]
  const out = m.map((row) => row[0] * lin[0] + row[1] * lin[1] + row[2] * lin[2])
  return out.map((v) => {
    const c = Math.max(0, Math.min(1, v))
    const s = c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055
    return Math.round(s * 255)
  }) as Rgb
}

function toLab([r, g, b]: Rgb): [number, number, number] {
  const lin = [r, g, b].map((v) => {
    const s = v / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  const x = (0.4124 * lin[0] + 0.3576 * lin[1] + 0.1805 * lin[2]) / 0.95047
  const y = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]
  const z = (0.0193 * lin[0] + 0.1192 * lin[1] + 0.9505 * lin[2]) / 1.08883
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))]
}

/** ΔE CIE76 — suficiente para o piso de separação usado aqui. */
function deltaE(a: Rgb, b: Rgb): number {
  const [l1, a1, b1] = toLab(a)
  const [l2, a2, b2] = toLab(b)
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2)
}

/**
 * Os 13 tokens realmente renderizados na cena: os 11 de `viewport3d` que carregam
 * significado MAIS `warn` e `accent`, que a auditoria original esqueceu por estarem
 * fora do grupo `viewport3d` — e são desenhados na cena do mesmo jeito.
 */
const CENA: Record<string, string> = {
  member: viewport3d.member,
  memberSecondary: viewport3d['member-secondary'],
  selected: viewport3d.selected,
  fail: viewport3d.fail,
  removable: viewport3d.removable,
  anchorOk: viewport3d['anchor-ok'],
  node: viewport3d.node,
  nodeNamed: viewport3d['node-named'],
  pilot: viewport3d.pilot,
  datum: viewport3d.datum,
  grid: viewport3d.grid,
  warn: dark.warn,
  accent: dark.accent,
}

/** Pares que compartilham valor POR DECISÃO — medir ΔE entre eles não diz nada. */
const ALIASES = new Set(['datum'])

describe('daltonismo — separação de forma na cena 3D', () => {
  // NASCE FALHANDO, por decisão (plano de design, fase 0 passo 0.5): a otimização
  // original cobriu 11 tokens; com os 13 reais o mínimo cai para ~2,1 (fail × warn,
  // tritanopia). A fase 10 separa status e identidade em canais distintos e torna
  // este teste verde. Falhar aqui é o registro honesto de uma dívida conhecida.
  it.fails('ΔE ≥ 8 entre todos os pares da cena, nas 3 dicromacias', () => {
    const nomes = Object.keys(CENA)
    let pior = { par: '', valor: Infinity }
    for (const kind of ['protan', 'deutan', 'tritan'] as const) {
      for (let i = 0; i < nomes.length; i++) {
        for (let j = i + 1; j < nomes.length; j++) {
          const a = simulate(parseColor(CENA[nomes[i]]).rgb, kind)
          const b = simulate(parseColor(CENA[nomes[j]]).rgb, kind)
          const d = deltaE(a, b)
          if (d < pior.valor) pior = { par: `${nomes[i]} × ${nomes[j]} (${kind})`, valor: d }
        }
      }
    }
    expect(pior.valor, `pior par: ${pior.par}`).toBeGreaterThanOrEqual(8)
  })

  it('visão normal separa todos os pares da cena (ΔE ≥ 8)', () => {
    const nomes = Object.keys(CENA).filter((n) => !ALIASES.has(n))
    for (let i = 0; i < nomes.length; i++) {
      for (let j = i + 1; j < nomes.length; j++) {
        const d = deltaE(parseColor(CENA[nomes[i]]).rgb, parseColor(CENA[nomes[j]]).rgb)
        expect(d, `${nomes[i]} × ${nomes[j]}`).toBeGreaterThanOrEqual(8)
      }
    }
  })

  it('os aliases de valor continuam sendo alias (divergir tem de ser deliberado)', () => {
    // `--bj-3d-datum` É `--bj-accent` por decisão (design-system §2.2): existe como
    // nome próprio para que a cena e o 2D possam divergir sem caçar ocorrências.
    expect(viewport3d.datum).toBe(dark.accent)
    expect(viewport3d['anchor-bad']).toBe(viewport3d.fail)
  })
})

// ---------- 0.2 — paridade CSS ↔ TS ----------

describe('paridade tokens.css ↔ tokens.ts', () => {
  it('o CSS commitado é exatamente o que o gerador produz', () => {
    expect(readFileSync(TARGET, 'utf8')).toBe(buildCss(tokens))
  })

  it('os dois temas expõem exatamente as mesmas chaves', () => {
    expect(Object.keys(light).sort()).toEqual(Object.keys(dark).sort())
  })

  it('nenhum alfa usa sintaxe de cor relativa (§1.6, desvio 1)', () => {
    const todos = [...Object.values(dark), ...Object.values(light), ...Object.values(viewport3d)]
    for (const v of todos) expect(v, v).not.toMatch(/hsl\(\s*from|rgb\(\s*from|color-mix/i)
  })

  it('o anel de foco é cor + offset, nunca box-shadow (§1.6, desvio 2)', () => {
    expect(dark['focus-ring-color']).toMatch(/^#/)
    expect(shared['focus-ring-offset']).toBe('2px')
    expect(Object.keys(dark)).not.toContain('focus-ring')
  })

  it('estrutura, escala e movimento são compartilhados, não duplicados por tema', () => {
    for (const chave of ['radius', 'space-4', 'rail-w', 'z-modal', 'text-base'] as const) {
      expect(shared[chave]).toBeTruthy()
      expect(Object.keys(dark)).not.toContain(chave)
      expect(Object.keys(light)).not.toContain(chave)
    }
  })

  it('o modo apresentação só mexe em escala, nunca em cor', () => {
    for (const v of Object.values(presentation)) expect(v).not.toMatch(/#|rgb/)
  })
})

// ---------- 0.3 — a guarda de hex testa a si mesma ----------

describe('guarda de hex', () => {
  it('pega as quatro formas válidas e ignora rgb()', () => {
    const fixture = [
      "const a = '#fff'",
      "const b = '#FFFFFF'",
      "const c = '#ffffffcc'",
      "const d = '#fff8'",
      "const e = 'rgb(255 255 255 / 10%)'",
      "const f = 'var(--bj-fg-primary)'",
    ].join(String.fromCharCode(10))
    expect(findHexes(fixture).map((h) => h.hex)).toEqual(['#fff', '#FFFFFF', '#ffffffcc', '#fff8'])
  })

  it('não confunde fragmento de URL nem id com cor', () => {
    // 6 e 8 caracteres (contando o #) não são forma válida de cor
    expect(findHexes("const u = 'https://x/#abcde'")).toEqual([])
    expect(findHexes("const u = 'https://x/#abcdefg'")).toEqual([])
  })

  it('hex em comentário NÃO é isento — a regra é "nenhum hex fora dos tokens"', () => {
    expect(findHexes('// a cor antiga era #e5484d')).toHaveLength(1)
  })
})
