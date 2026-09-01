import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  BRASIL,
  COORTES,
  MOSTRAR_ATRITOS,
  NOME_COORTE,
  OPACIDADE_ALCANCE,
  OPACIDADE_PISO,
  REGIOES,
  UFS_DA_REGIAO,
  EQUIPES_POR_UF,
  equipesDaUf,
  opacidadeDe,
  selecao,
} from './data/panorama'
import { MAPA_VIEWBOX, UFS } from './data/brasil-uf'

describe('panorama — invariantes do dado (DF-25)', () => {
  it('AC-DF25.1: o Brasil é a SOMA das regiões, não um literal', () => {
    const soma = (f: 'total' | 'alta' | 'intermediaria' | 'iniciante' | 'ufs' | 'nacional') =>
      REGIOES.reduce((a, r) => a + r[f], 0)
    expect(BRASIL.total).toBe(soma('total'))
    expect(BRASIL.alta).toBe(soma('alta'))
    expect(BRASIL.intermediaria).toBe(soma('intermediaria'))
    expect(BRASIL.iniciante).toBe(soma('iniciante'))
    expect(BRASIL.ufs).toBe(soma('ufs'))
    expect(BRASIL.nacional).toBe(soma('nacional'))
  })

  it('AC-DF25.2: em toda região as três coortes fecham o total', () => {
    for (const r of REGIOES) {
      expect(r.alta + r.intermediaria + r.iniciante, `${r.nome} não fecha`).toBe(r.total)
    }
    expect(BRASIL.alta + BRASIL.intermediaria + BRASIL.iniciante).toBe(BRASIL.total)
  })

  it('bate com o levantamento: 91 equipes, 18 estados, 62 no Nacional 2026', () => {
    expect(BRASIL.total).toBe(91)
    expect(BRASIL.ufs).toBe(18)
    expect(BRASIL.nacional).toBe(62)
  })

  it('ninguém leva mais equipes ao Nacional do que tem mapeadas', () => {
    for (const r of REGIOES) expect(r.nacional, r.nome).toBeLessThanOrEqual(r.total)
  })

  it('as cinco regiões existem uma vez cada, com nota', () => {
    expect(REGIOES.map((r) => r.id).sort()).toEqual(['CO', 'N', 'NE', 'S', 'SE'])
    for (const r of REGIOES) expect(r.nota.length).toBeGreaterThan(20)
  })

  it('a soma das UFs de cada região bate com o total dela', () => {
    for (const r of REGIOES) {
      const soma = UFS_DA_REGIAO[r.id].reduce((a, uf) => a + equipesDaUf(uf), 0)
      expect(soma, `${r.nome} não fecha por UF`).toBe(r.total)
    }
  })

  it('as 27 UFs aparecem exatamente uma vez no agrupamento por região', () => {
    const todas = Object.values(UFS_DA_REGIAO).flat()
    expect(todas).toHaveLength(27)
    expect(new Set(todas).size).toBe(27)
  })

  it('só entram na contagem as UFs que têm equipe — ausência é o dado', () => {
    expect(Object.keys(EQUIPES_POR_UF)).toHaveLength(18)
    for (const [uf, n] of Object.entries(EQUIPES_POR_UF)) {
      expect(n, uf).toBeGreaterThan(0)
      expect(Object.values(UFS_DA_REGIAO).flat()).toContain(uf)
    }
  })

  it('o número de estados do painel é o de UFs COM equipe, não o de UFs da região', () => {
    for (const r of REGIOES) {
      const comEquipe = UFS_DA_REGIAO[r.id].filter((uf) => equipesDaUf(uf) > 0).length
      expect(comEquipe, r.nome).toBe(r.ufs)
    }
  })
})

describe('malha estadual (DF-25 §5.3, revisto)', () => {
  it('a malha traz as 27 UFs, uma vez cada, e todas com região', () => {
    expect(UFS).toHaveLength(27)
    expect(new Set(UFS.map((u) => u.sigla)).size).toBe(27)
    for (const u of UFS) {
      expect(['N', 'NE', 'CO', 'SE', 'S'], u.sigla).toContain(u.regiao)
    }
  })

  it('a região de cada UF na malha é a mesma do agrupamento do dado', () => {
    for (const u of UFS) {
      expect(UFS_DA_REGIAO[u.regiao], u.sigla).toContain(u.sigla)
    }
  })

  it('todo contorno é fechado e cabe no viewBox', () => {
    const [, , largura, altura] = MAPA_VIEWBOX.split(' ').map(Number)
    for (const u of UFS) {
      expect(u.d.startsWith('M'), u.sigla).toBe(true)
      expect(u.d.endsWith('Z'), u.sigla).toBe(true)
      const nums = u.d.match(/-?\d+(\.\d+)?/g)!.map(Number)
      const xs = nums.filter((_, i) => i % 2 === 0)
      const ys = nums.filter((_, i) => i % 2 === 1)
      expect(Math.min(...xs), `${u.sigla} sai à esquerda`).toBeGreaterThanOrEqual(0)
      expect(Math.max(...xs), `${u.sigla} sai à direita`).toBeLessThanOrEqual(largura)
      expect(Math.min(...ys), `${u.sigla} sai em cima`).toBeGreaterThanOrEqual(0)
      expect(Math.max(...ys), `${u.sigla} sai embaixo`).toBeLessThanOrEqual(altura)
      expect(u.centro[0]).toBeGreaterThanOrEqual(0)
      expect(u.centro[1]).toBeGreaterThanOrEqual(0)
    }
  })

  it('a malha cabe no orçamento de bytes da vitrine', () => {
    const bytes = UFS.reduce((a, u) => a + u.d.length, 0)
    expect(bytes).toBeLessThan(40 * 1024)
  })
})

describe('panorama — rampa derivada por estado (DF-25 §5.5)', () => {
  it('AC-DF25.3: o maior estado chega ao teto e nenhum com equipe cai abaixo do piso', () => {
    const maior = Math.max(...Object.values(EQUIPES_POR_UF))
    expect(opacidadeDe(maior)).toBeCloseTo(OPACIDADE_PISO + OPACIDADE_ALCANCE, 10)
    for (const n of Object.values(EQUIPES_POR_UF)) {
      expect(opacidadeDe(n)).toBeGreaterThanOrEqual(OPACIDADE_PISO)
      expect(opacidadeDe(n)).toBeLessThanOrEqual(OPACIDADE_PISO + OPACIDADE_ALCANCE)
    }
  })

  it('estado sem equipe fica FORA da rampa — é categoria, não degrau', () => {
    expect(opacidadeDe(0)).toBe(0)
    // e o primeiro degrau já se separa bem do vazio
    expect(opacidadeDe(1)).toBeGreaterThanOrEqual(OPACIDADE_PISO)
  })

  it('a rampa é monotônica: mais equipes nunca dá tom mais fraco', () => {
    const ordenados = Object.values(EQUIPES_POR_UF).sort((a, b) => a - b)
    for (let i = 1; i < ordenados.length; i++) {
      expect(opacidadeDe(ordenados[i])).toBeGreaterThanOrEqual(opacidadeDe(ordenados[i - 1]))
    }
  })

  it('o teto de 0,80 é o que sustenta o contraste do rótulo claro com halo', () => {
    expect(OPACIDADE_PISO + OPACIDADE_ALCANCE).toBeCloseTo(0.8, 10)
  })
})

describe('panorama — seleção (DF-25 §4.2)', () => {
  it('AC-DF25.4: cada região resolve para si; desconhecida cai no Brasil', () => {
    for (const r of REGIOES) {
      const s = selecao(r.id)
      expect(s.id).toBe(r.id)
      expect(s.nome).toBe(r.nome)
      expect(s.rotulo).toBe('Região')
    }
    expect(selecao('BR').nome).toBe('Brasil')
    // a vitrine nunca fica sem painel: id fora do domínio devolve o agregado
    expect(selecao('XX' as never).nome).toBe('Brasil')
  })

  it('FR-DF25.10: as coortes têm nome, e nenhum nome é "Tier N"', () => {
    expect(COORTES).toEqual(['alta', 'intermediaria', 'iniciante'])
    for (const c of COORTES) {
      expect(NOME_COORTE[c]).toBeTruthy()
      expect(NOME_COORTE[c]).not.toMatch(/tier/i)
      expect(NOME_COORTE[c]).not.toMatch(/\d/)
    }
  })
})

describe('panorama — o módulo é estático (DF-25 §5.2)', () => {
  const fonte = readFileSync(new URL('./data/panorama.ts', import.meta.url), 'utf8')

  it('AC-DF25.5: nada de fetch, de sessão nem de import de React', () => {
    expect(fonte).not.toMatch(/\bfetch\s*\(/)
    expect(fonte).not.toMatch(/from '\.\.\/session'/)
    expect(fonte).not.toMatch(/from 'react'/)
  })

  it('AC-DF25.7: nenhum hex — a catraca de check-tokens varre esta pasta', () => {
    expect(fonte.match(/#[0-9a-fA-F]{3}\b|#[0-9a-fA-F]{6}\b/g)).toBeNull()
  })

  it('a faixa sobre a organização é uma constante, não JSX editado', () => {
    expect(typeof MOSTRAR_ATRITOS).toBe('boolean')
  })
})
