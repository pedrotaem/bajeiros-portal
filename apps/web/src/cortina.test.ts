import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { mostrarCortina } from './cortina'

const app = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8')
const comingSoon = readFileSync(new URL('./components/ComingSoon.tsx', import.meta.url), 'utf8')

const anonimo = null
const comum = { isAdmin: false }
const admin = { isAdmin: true }

describe('cortina — tabela-verdade (DF-27 FR-DF27.4)', () => {
  it('sem o campo no config, ninguém vê cortina (fail-open, §6)', () => {
    expect(mostrarCortina({}, anonimo)).toBe(false)
    expect(mostrarCortina({}, comum)).toBe(false)
    expect(mostrarCortina({ comingSoon: false }, anonimo)).toBe(false)
  })

  it('com a cortina ligada, anônimo e conta comum ficam do lado de fora', () => {
    expect(mostrarCortina({ comingSoon: true }, anonimo)).toBe(true)
    expect(mostrarCortina({ comingSoon: true }, comum)).toBe(true)
    // `isAdmin` ausente (usuário antigo, resposta sem o campo) NÃO abre a porta
    expect(mostrarCortina({ comingSoon: true }, {})).toBe(true)
  })

  it('só o administrador vê o portal com a cortina ligada (FR-DF27.9)', () => {
    expect(mostrarCortina({ comingSoon: true }, admin)).toBe(false)
  })
})

describe('cortina — o portal não monta atrás dela (FR-DF27.5)', () => {
  it('o App decide ANTES do Portal, e a cortina é o único retorno desse ramo', () => {
    expect(app).toMatch(/if \(mostrarCortina\(appConfigAtual\(\), user\)\) return <ComingSoon \/>/)
    // o corpo do portal virou `Portal`: o `Shell` só existe dentro dele
    expect(app).toContain('function Portal()')
  })

  it('a cortina não desenha shell, rail nem vitrine — ela substitui a tela', () => {
    expect(comingSoon).not.toMatch(/<Shell|bj-rail|bj-topbar|PublicHome|HomePage/)
  })

  it('a porta continua aberta: painéis de sessão e o login existente', () => {
    expect(comingSoon).toContain('<SessionPanels />')
    expect(comingSoon).toContain("setPanel('login')")
  })

  it('a obrigação de interface do spec.md §1 vem do mesmo texto do shell (FR-DF27.10)', () => {
    expect(comingSoon).toContain("import { DISCLAIMER } from './Shell'")
    expect(comingSoon).toContain('{DISCLAIMER}')
  })
})
