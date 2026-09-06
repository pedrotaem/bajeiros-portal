import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AVISO_FONTE } from '@bajeiros/calendar/labels'

// `session.ts` lê o storage no import; o stub precisa existir ANTES dele.
const guardado = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => guardado.get(k) ?? null,
  setItem: (k: string, v: string) => void guardado.set(k, v),
  removeItem: (k: string) => void guardado.delete(k),
})

const { useSession, contextoDaPagina, resumoDoContexto, CALENDAR_DEFAULT } =
  await import('./session')
const { DESTINOS, subsParaVisitante, subAtivo } = await import('./components/Shell')

const src = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8')
const tab = src('./components/CalendarTab.tsx')
const panel = src('./components/MilestonePanel.tsx')
const timeline = src('./components/CalendarTimeline.tsx')
const list = src('./components/CalendarList.tsx')
const css = src('./shell.css')
const app = src('./App.tsx')

beforeEach(() => {
  guardado.clear()
  useSession.setState({
    page: 'inicio',
    teamTab: 'evolucao',
    communityTab: 'resultados',
    calendar: CALENDAR_DEFAULT,
  })
})

describe('DF-33 — a aba abre sem conta (FR-DF33.1/2)', () => {
  it('é o terceiro sub-item de Comunidade e o único que o visitante vê', () => {
    const comunidade = DESTINOS.find((d) => d.page === 'comunidade')!
    expect(comunidade.subs?.map((s) => s.id)).toEqual(['resultados', 'equipes', 'calendario'])
    expect(subsParaVisitante(comunidade, false).map((s) => s.id)).toEqual(['calendario'])
    expect(subsParaVisitante(comunidade, true)).toHaveLength(3)
    // sub-item de aba não ganha marca (DS §8.4)
    expect(comunidade.subs!.find((s) => s.id === 'calendario')!.Mark).toBeUndefined()
    // a exceção é declarada, e só ela
    const equipe = DESTINOS.find((d) => d.page === 'equipe')!
    expect(subsParaVisitante(equipe, false)).toEqual([])
  })

  it('o App deixa a Comunidade renderizar sem sessão só quando a aba é o Calendário', () => {
    expect(app).toContain("sessionUser || communityTab === 'calendario'")
  })

  it('goToCalendar abre a aba certa e o sub-item acende', () => {
    useSession.getState().goToCalendar({ selected: 'm1' })
    const s = useSession.getState()
    expect(s.page).toBe('comunidade')
    expect(s.communityTab).toBe('calendario')
    expect(s.calendar.selected).toBe('m1')
    const sub = DESTINOS.find((d) => d.page === 'comunidade')!.subs!.find(
      (x) => x.id === 'calendario',
    )!
    expect(subAtivo(sub, { page: s.page, teamTab: s.teamTab, communityTab: s.communityTab })).toBe(
      true,
    )
  })
})

describe('DF-33 — filtros no estado da sessão (FR-DF33.3, DF-12 P-1.4)', () => {
  it('sobrevivem à troca de página', () => {
    useSession
      .getState()
      .setCalendar({ view: 'lista', chips: ['Sul'], mine: true, quick: 'prazos' })
    useSession.getState().setPage('editor')
    useSession.getState().setPage('comunidade')
    expect(useSession.getState().calendar).toMatchObject({
      view: 'lista',
      chips: ['Sul'],
      mine: true,
      quick: 'prazos',
    })
  })

  it('a sugestão (DF-26) descreve a aba pelo nome', () => {
    useSession.getState().goToCalendar()
    const ctx = contextoDaPagina(useSession.getState(), { innerWidth: 1366, innerHeight: 768 })
    expect(ctx.view).toBe('calendario')
    expect(resumoDoContexto(ctx)).toContain('Comunidade · Calendário')
  })
})

describe('DF-33 — disclaimer obrigatório (§4.6)', () => {
  it('o texto é o pedido pelo dono do produto, fixo', () => {
    expect(AVISO_FONTE).toBe(
      'O Portal é um facilitador de acesso à informação e não substitui a leitura integral do material direto da fonte. O usuário deve sempre verificar o documento oficial vigente referente à competição que lhe afeta e tomar qualquer decisão baseada no documento oficial.',
    )
  })

  it('aparece na faixa fixa da aba e no rodapé do painel (FR-DF33.16/17)', () => {
    expect(tab).toContain('bj-fonte-aviso')
    expect(tab).toContain('{AVISO_FONTE}')
    expect(panel).toContain('bj-cal-painel-aviso')
    expect(panel).toContain('{AVISO_FONTE}')
    // a faixa é sticky e não tem botão de fechar
    const faixa = css.slice(css.indexOf('.bj-fonte-aviso {'), css.indexOf('.bj-fonte-aviso > svg'))
    expect(faixa).toContain('position: sticky')
    expect(
      tab.slice(tab.indexOf('bj-fonte-aviso'), tab.indexOf('bj-fonte-aviso') + 300),
    ).not.toMatch(/Fechar|IconX/)
  })
})

describe('DF-33 — linha do tempo e lista (FR-DF33.5/6/8/10)', () => {
  it('cada tipo tem forma própria e o marco é botão com aria-label completo', () => {
    for (const forma of ['losango', 'barra', 'faixa', 'circulo', 'quadrado'])
      expect(css).toContain(`.bj-cal-forma--${forma}`)
    expect(timeline).toContain('ariaLabelDoMarco(')
    expect(timeline).toMatch(/ArrowLeft.*ArrowRight|ArrowRight.*ArrowLeft/)
  })

  it('a lista não manda para fora: cada linha abre o painel', () => {
    const itens = list.slice(
      list.indexOf('const Linha'),
      list.indexOf('return (\n    <div className="bj-cal-lista"'),
    )
    expect(itens).not.toContain('target="_blank"')
    expect(itens).toContain('onSelect(m.id)')
  })

  it('abaixo de 1024px a linha do tempo não é desenhada', () => {
    expect(tab).toContain('useMinWidth(1024)')
    const media = css.slice(css.lastIndexOf('@media (max-width: 1023px)'))
    expect(media).toContain('.bj-cal-linha')
  })
})

describe('DF-33 — tokens (AC-DF33.12)', () => {
  it('a seção do calendário não tem hex nem cor literal', () => {
    const secao = css.slice(css.indexOf('DF-33 · calendário'))
    expect(secao).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    expect(secao).not.toMatch(/\brgba?\(/)
  })
})
