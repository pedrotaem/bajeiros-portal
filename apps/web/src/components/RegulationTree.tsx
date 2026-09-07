import { useEffect, useMemo, useRef } from 'react'
import { IconChevronRight } from '../icons/glyphs'
import { arvore, regrasDaSecao, type Bloco, type NoIndice } from '../regulamento/indice'

/**
 * DF-34 FR-DF34.6 / design-system C-27 — índice do regulamento em árvore.
 *
 * A árvore é ACHATADA numa lista só (`role="tree"` + `aria-level`/`aria-posinset`):
 * a navegação por seta vira aritmética de índice sobre o que está visível, e é isso
 * que faz ←/→/Home/End se comportarem igual em três níveis (AC-DF34.11). ARIA aceita
 * árvore achatada desde que o nível seja declarado, e o DOM linear é o mesmo que o
 * leitor de tela anuncia.
 *
 * Os itens de `depth >= 3` aparecem SÓ com número e página (§3.1): o "título" deles no
 * manifest é o começo do parágrafo, ou seja, texto do regulamento.
 */

export interface ItemArvore {
  bloco: Bloco
  nivel: number
  temFilhos: boolean
  aberto: boolean
}

/** Percorre a árvore respeitando o que está aberto — a ordem é a do documento. */
export function achatar(raizes: NoIndice[], abertos: Set<string>): ItemArvore[] {
  const out: ItemArvore[] = []
  const visita = (no: NoIndice, nivel: number) => {
    const temFilhos = no.filhos.length > 0 || no.fundos.length > 0
    const aberto = abertos.has(no.bloco.id)
    out.push({ bloco: no.bloco, nivel, temFilhos, aberto })
    if (!aberto) return
    for (const filho of no.filhos) visita(filho, nivel + 1)
    for (const fundo of no.fundos) {
      out.push({ bloco: fundo, nivel: nivel + 1, temFilhos: false, aberto: false })
    }
  }
  for (const raiz of raizes) visita(raiz, 1)
  return out
}

/**
 * O que abrir para que uma seção fique à vista: ela e todos os ancestrais. Chega uma
 * citação do assistente e a árvore abre sozinha até `B6.2.4.3` (FR-DF34.7).
 */
export function abrirAte(sectionId: string | null, abertos: Set<string>): Set<string> {
  if (!sectionId) return abertos
  const novo = new Set(abertos)
  const partes = sectionId.split('.')
  if (!sectionId.startsWith('PARTE ') && sectionId !== 'PREAMBULO')
    novo.add(`PARTE ${sectionId[0]}`)
  for (let i = 1; i <= partes.length; i++) novo.add(partes.slice(0, i).join('.'))
  return novo
}

export function RegulationTree({
  blocos,
  selecionado,
  abertos,
  onSelecionar,
  onAbrir,
}: {
  blocos: Bloco[]
  selecionado: string | null
  abertos: Set<string>
  onSelecionar: (id: string) => void
  onAbrir: (abertos: Set<string>) => void
}) {
  const raizes = useMemo(() => arvore(blocos), [blocos])
  const itens = useMemo(() => achatar(raizes, abertos), [raizes, abertos])
  const lista = useRef<HTMLUListElement>(null)

  const alternar = (id: string, abrir: boolean) => {
    const novo = new Set(abertos)
    if (abrir) novo.add(id)
    else novo.delete(id)
    onAbrir(novo)
  }

  const focar = (i: number) => {
    const alvo = lista.current?.querySelectorAll<HTMLLIElement>('[role="treeitem"]')[i]
    alvo?.focus()
  }

  const teclado = (e: React.KeyboardEvent, i: number) => {
    const item = itens[i]
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        focar(Math.min(i + 1, itens.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        focar(Math.max(i - 1, 0))
        break
      case 'ArrowRight':
        e.preventDefault()
        if (item.temFilhos && !item.aberto) alternar(item.bloco.id, true)
        else if (item.temFilhos) focar(i + 1)
        break
      case 'ArrowLeft': {
        e.preventDefault()
        if (item.temFilhos && item.aberto) {
          alternar(item.bloco.id, false)
          break
        }
        // sobe para o pai: o primeiro item acima com nível menor
        for (let j = i - 1; j >= 0; j--) {
          if (itens[j].nivel < item.nivel) {
            focar(j)
            break
          }
        }
        break
      }
      case 'Home':
        e.preventDefault()
        focar(0)
        break
      case 'End':
        e.preventDefault()
        focar(itens.length - 1)
        break
      case 'Enter':
      case ' ':
        e.preventDefault()
        onSelecionar(item.bloco.id)
        break
      default:
        break
    }
  }

  const foco = itens.findIndex((it) => it.bloco.id === selecionado)

  // A árvore rola sozinha (60vh de altura própria) até o item selecionado: sem isso a
  // citação do assistente abre a seção certa e deixa o índice parado no preâmbulo.
  useEffect(() => {
    if (!selecionado) return
    const alvo = lista.current?.querySelector<HTMLLIElement>('[aria-current="true"]')
    alvo?.scrollIntoView({ block: 'nearest' })
  }, [selecionado, itens])

  return (
    <ul className="bj-reg-arvore" role="tree" aria-label="Índice do regulamento" ref={lista}>
      {itens.map((item, i) => {
        const regras = regrasDaSecao(item.bloco.id).length
        const sel = item.bloco.id === selecionado
        return (
          <li
            key={item.bloco.id}
            role="treeitem"
            aria-level={item.nivel}
            aria-expanded={item.temFilhos ? item.aberto : undefined}
            aria-selected={sel}
            aria-current={sel ? 'true' : undefined}
            tabIndex={(foco < 0 ? 0 : foco) === i ? 0 : -1}
            className={sel ? 'bj-reg-item bj-reg-item--sel' : 'bj-reg-item'}
            style={{ paddingLeft: `calc(var(--bj-space-2) * ${item.nivel})` }}
            onKeyDown={(e) => teclado(e, i)}
            onClick={(e) => {
              e.stopPropagation()
              onSelecionar(item.bloco.id)
              if (item.temFilhos && !item.aberto) alternar(item.bloco.id, true)
            }}
          >
            <span className="bj-reg-item-linha">
              {item.temFilhos ? (
                <span
                  className={
                    item.aberto ? 'bj-reg-chevron bj-reg-chevron--aberto' : 'bj-reg-chevron'
                  }
                  aria-hidden="true"
                >
                  <IconChevronRight size={16} />
                </span>
              ) : (
                <span className="bj-reg-chevron" aria-hidden="true" />
              )}
              <span className="bj-reg-num">{item.bloco.id}</span>
              {item.bloco.title ? (
                <span className="bj-reg-titulo">{item.bloco.title}</span>
              ) : (
                <span className="bj-reg-pagina">
                  p. {item.bloco.pageStart}
                  {item.bloco.pageEnd > item.bloco.pageStart ? `–${item.bloco.pageEnd}` : ''}
                </span>
              )}
              {regras > 0 && (
                <span className="bj-reg-contador" title="Regras conferidas pelo validador">
                  {regras} {regras === 1 ? 'regra' : 'regras'}
                </span>
              )}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
