import { beforeEach, describe, expect, it, vi } from 'vitest'

// `session.ts` lê o rail recolhido no import; o stub precisa existir ANTES dele.
const guardado = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => guardado.get(k) ?? null,
  setItem: (k: string, v: string) => void guardado.set(k, v),
  removeItem: (k: string) => void guardado.delete(k),
})

const { useSession } = await import('./session')
const { DESTINOS, destinoAtivo, subAtivo } = await import('./components/Shell')

beforeEach(() => {
  guardado.clear()
  useSession.setState({
    page: 'inicio',
    teamTab: 'evolucao',
    communityTab: 'resultados',
    railCompact: false,
  })
})

describe('menu principal — recolher (DF-24)', () => {
  it('AC-DF24.1: recolher guarda a escolha para a próxima sessão', () => {
    useSession.getState().setRailCompact(true)
    expect(useSession.getState().railCompact).toBe(true)
    expect(guardado.get('bajeiros:rail-compacto')).toBe('1')
    useSession.getState().setRailCompact(false)
    expect(guardado.get('bajeiros:rail-compacto')).toBe('0')
  })

  it('recolher não muda a página nem as abas — é só chrome', () => {
    useSession.setState({ page: 'editor', teamTab: 'projetos' })
    useSession.getState().setRailCompact(true)
    expect(useSession.getState().page).toBe('editor')
    expect(useSession.getState().teamTab).toBe('projetos')
  })
})

describe('menu principal — recursos da página (DF-24)', () => {
  it('AC-DF24.2: Ferramentas abre as duas ferramentas, e só elas têm marca', () => {
    const ferramentas = DESTINOS.find((d) => d.page === 'ferramentas')!
    expect(ferramentas.subs?.map((s) => s.id)).toEqual(['editor', 'assistant'])
    expect(ferramentas.subs?.every((s) => s.kind === 'page' && !!s.Mark)).toBe(true)
    // aba de página é recurso sem produto: não ganha marca (design-system §8.4)
    for (const d of DESTINOS) {
      for (const s of d.subs ?? []) {
        if (s.kind !== 'page') expect(s.Mark).toBeUndefined()
      }
    }
  })

  it('AC-DF24.3: o destino acende com a página e com as que ele abre', () => {
    const ferramentas = DESTINOS.find((d) => d.page === 'ferramentas')!
    expect(destinoAtivo(ferramentas, 'ferramentas')).toBe(true)
    expect(destinoAtivo(ferramentas, 'editor')).toBe(true)
    expect(destinoAtivo(ferramentas, 'assistant')).toBe(true)
    expect(destinoAtivo(ferramentas, 'equipe')).toBe(false)
  })

  it('AC-DF24.4: o recurso aceso depende do tipo — página própria ou aba do pai', () => {
    const ferramentas = DESTINOS.find((d) => d.page === 'ferramentas')!
    const equipe = DESTINOS.find((d) => d.page === 'equipe')!
    const comunidade = DESTINOS.find((d) => d.page === 'comunidade')!
    const editor = ferramentas.subs![0]
    const pessoas = equipe.subs!.find((s) => s.id === 'pessoas')!
    const equipes = comunidade.subs!.find((s) => s.id === 'equipes')!

    const base = { page: 'editor', teamTab: 'pessoas', communityTab: 'equipes' } as const
    expect(subAtivo(editor, base)).toBe(true)
    // a aba só acende na página dela: `teamTab` sozinho não acende fora de Equipe
    expect(subAtivo(pessoas, base)).toBe(false)
    expect(subAtivo(pessoas, { ...base, page: 'equipe' })).toBe(true)
    expect(subAtivo(equipes, { ...base, page: 'comunidade' })).toBe(true)
    expect(subAtivo(equipes, { ...base, page: 'comunidade', communityTab: 'resultados' })).toBe(
      false,
    )
  })

  it('sub-item de equipe e comunidade exige conta; ferramenta não', () => {
    const porPagina = Object.fromEntries(DESTINOS.map((d) => [d.page, d]))
    expect(porPagina.equipe.subsExigemConta).toBe(true)
    expect(porPagina.comunidade.subsExigemConta).toBe(true)
    expect(porPagina.ferramentas.subsExigemConta).toBeUndefined()
    expect(porPagina.inicio.subs).toBeUndefined()
  })
})
