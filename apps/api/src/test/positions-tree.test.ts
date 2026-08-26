import { describe, expect, it } from 'vitest'
import { depthOf, descendants, subtreeHeight, type PositionNode } from '../modules/teams/positions'

// Helpers de árvore do organograma (DF-10). Rodam sem banco: aqui é onde as
// guardas de ciclo e profundidade são exercitadas nos extremos.

function node(id: string, parentId: string | null): PositionNode {
  return { id, parentId, kind: 'custom', name: id, description: null, sortOrder: 0 }
}

// a > b > c > d  (+ e solto sob b)
const arvore: PositionNode[] = [
  node('a', null),
  node('b', 'a'),
  node('c', 'b'),
  node('d', 'c'),
  node('e', 'b'),
]

describe('árvore de funções', () => {
  it('profundidade conta a partir da raiz', () => {
    expect(depthOf(arvore, 'a')).toBe(1)
    expect(depthOf(arvore, 'b')).toBe(2)
    expect(depthOf(arvore, 'd')).toBe(4)
  })

  it('descendentes incluem netos, não incluem o próprio nó', () => {
    expect([...descendants(arvore, 'b')].sort()).toEqual(['c', 'd', 'e'])
    expect(descendants(arvore, 'd').size).toBe(0)
  })

  it('altura da subárvore mede o galho mais fundo', () => {
    expect(subtreeHeight(arvore, 'a')).toBe(4)
    expect(subtreeHeight(arvore, 'b')).toBe(3)
    expect(subtreeHeight(arvore, 'd')).toBe(1)
  })

  it('ciclo em dado corrompido não trava: profundidade vira Infinity', () => {
    const ciclo = [node('x', 'y'), node('y', 'x')]
    expect(depthOf(ciclo, 'x')).toBe(Infinity)
    expect([...descendants(ciclo, 'x')].sort()).toEqual(['x', 'y'])
  })

  it('parentId órfão é tratado como raiz', () => {
    expect(depthOf([node('solto', 'sumiu')], 'solto')).toBe(1)
  })
})
