import { describe, expect, it } from 'vitest'
import { competitionCycle, cycleOf, cycleRange, monthsOf } from './cycle'
import { countdown, daysBetween, faixaDeDatas, stateChip, stateOf } from './dates'
import { buildIcs, foldLine, icsEscape } from './ics'
import { ariaLabelDoMarco, chipDaCompeticao, shapeOf } from './labels'
import { guessKind, parseMilestoneTable } from './parse-table'
import { defaultMine, isStale, marcosVisiveis, porMes, proximos, separaPassados } from './recorte'
import type { CalendarCompetition, CalendarMilestone, CalendarPayload } from './types'

// DF-33 — o que a spec fixa em número ou em texto está aqui, longe da tela.

const HOJE = '2026-09-06'

const nacional: CalendarCompetition = {
  id: 'nac',
  season: 2027,
  kind: 'nacional',
  region: null,
  name: 'Nacional 2027',
  startsOn: '2027-03-31',
  endsOn: '2027-04-04',
  location: 'São José dos Campos – SP',
  officialUrl: 'https://exemplo.test/nacional',
  registrationOpensOn: '2026-07-15',
  registrationClosesOn: '2026-09-15',
  checkedAt: '2026-09-06T00:00:00Z',
  stale: false,
  links: [],
  bond: null,
}
const sul: CalendarCompetition = {
  ...nacional,
  id: 'sul',
  season: 2026,
  kind: 'regional',
  region: 'Sul',
  name: 'Regional Sul 2026',
  startsOn: '2026-11-20',
  endsOn: '2026-11-22',
}

const fonte = {
  id: 'inf09',
  competitionId: 'nac',
  kind: 'informativo' as const,
  number: 9,
  title: 'Inscrição de Integrantes e Associação',
  url: 'https://exemplo.test/Informativo09.pdf',
  publishedOn: '2026-12-10',
  edition: null,
  checkedAt: '2026-09-06T00:00:00Z',
}

function marco(p: Partial<CalendarMilestone> & { id: string; dueOn: string }): CalendarMilestone {
  return {
    competitionId: 'nac',
    kind: 'documento',
    title: p.id,
    summary: null,
    startsOn: null,
    appliesTo: [],
    status: 'confirmado',
    sectionId: null,
    checkedAt: null,
    source: null,
    team: null,
    ...p,
  }
}

describe('ciclo (§3.2)', () => {
  it('a temporada é rotulada pelo ano do Nacional e vira em julho', () => {
    expect(cycleOf('2026-09-06')).toBe(2027)
    expect(cycleOf('2027-03-31')).toBe(2027)
    expect(cycleOf('2026-06-30')).toBe(2026)
    expect(cycleOf('2026-07-01')).toBe(2027)
  })

  it('a regional do ano anterior entra no ciclo do Nacional seguinte', () => {
    expect(competitionCycle('regional', 2026)).toBe(2027)
    expect(competitionCycle('nacional', 2027)).toBe(2027)
  })

  it('a faixa vai de 1º de julho a 30 de junho, com 12 meses', () => {
    const r = cycleRange(2027)
    expect(r).toEqual({ from: '2026-07-01', to: '2027-06-30' })
    const meses = monthsOf(r)
    expect(meses).toHaveLength(12)
    expect(meses[0]).toMatchObject({ key: '2026-07', label: 'jul', days: 31 })
    expect(meses[7]).toMatchObject({ key: '2027-02', label: 'fev', days: 28 })
    expect(meses[11].key).toBe('2027-06')
  })
})

describe('datas e contagem (FR-DF33.5, §7.3)', () => {
  it('conta em dias inteiros, na voz do DS', () => {
    expect(countdown('2026-09-15', HOJE)).toEqual({ days: 9, text: 'faltam 9 dias' })
    expect(countdown(HOJE, HOJE)).toEqual({ days: 0, text: 'vence hoje' })
    expect(countdown('2026-09-07', HOJE).text).toBe('falta 1 dia')
    expect(countdown('2026-09-03', HOJE).text).toBe('passou há 3 dias')
    expect(daysBetween('2026-01-01', '2027-01-01')).toBe(365)
  })

  it('AC-DF33.3 — em até 7 dias ganha o chip EM N DIAS; hoje ganha HOJE; depois nada', () => {
    expect(stateChip('2026-09-11', HOJE)).toBe('EM 5 DIAS')
    expect(stateChip('2026-09-07', HOJE)).toBe('EM 1 DIA')
    expect(stateChip(HOJE, HOJE)).toBe('HOJE')
    expect(stateChip('2026-09-13', HOJE)).toBe('EM 7 DIAS')
    expect(stateChip('2026-09-14', HOJE)).toBeNull()
    expect(stateOf('2026-09-01', HOJE)).toBe('passado')
    expect(stateOf('2026-10-01', HOJE)).toBe('futuro')
  })

  it('faixa de datas curta como no §12.2', () => {
    expect(faixaDeDatas('2027-03-31', '2027-04-04')).toBe('31 mar – 4 abr 2027')
    expect(faixaDeDatas('2026-09-25', '2026-09-27')).toBe('25 – 27 set 2026')
    expect(faixaDeDatas('2026-09-15', null)).toBe('15 set 2026')
    expect(faixaDeDatas(null, null)).toBe('datas a confirmar')
  })
})

describe('formas e rótulos (FR-DF33.5 / FR-DF33.6)', () => {
  it('cada tipo tem forma própria — a cor só reforça', () => {
    expect(shapeOf({ kind: 'documento', startsOn: null })).toBe('losango')
    expect(shapeOf({ kind: 'inscricao', startsOn: '2026-07-15' })).toBe('barra')
    expect(shapeOf({ kind: 'evento', startsOn: null })).toBe('faixa')
    expect(shapeOf({ kind: 'comunicado', startsOn: null })).toBe('circulo')
    expect(shapeOf({ kind: 'equipe', startsOn: null })).toBe('quadrado')
  })

  it('o aria-label é a frase completa da spec', () => {
    const m = marco({
      id: 'm1',
      title: 'Inscrição de integrantes',
      dueOn: '2027-01-25',
      kind: 'pessoas',
      source: fonte,
    })
    expect(ariaLabelDoMarco(m, 'Nacional 2027')).toBe(
      'Inscrição de integrantes, até 25 de janeiro de 2027, Nacional 2027, fonte Informativo 09',
    )
    expect(chipDaCompeticao(sul)).toBe('Sul')
    expect(chipDaCompeticao(nacional)).toBe('Nacional')
  })
})

describe('recorte pessoal (§4.4)', () => {
  const marcos = [
    marco({ id: 'lote-integral', dueOn: '2026-09-28', kind: 'pagamento', appliesTo: ['integral'] }),
    marco({
      id: 'lote-novata',
      dueOn: '2026-10-28',
      kind: 'pagamento',
      appliesTo: ['novata', 'light'],
    }),
    marco({ id: 'sul-inscricao', dueOn: '2026-10-01', competitionId: 'sul', kind: 'inscricao' }),
    marco({ id: 'inf', dueOn: '2026-09-20', kind: 'comunicado' }),
    marco({
      id: 'team:0',
      dueOn: '2026-12-10',
      competitionId: null,
      kind: 'equipe',
      title: 'Relatório de projeto',
    }),
    marco({ id: 'cancelado', dueOn: '2026-12-01', status: 'cancelado' }),
  ]
  const base: CalendarPayload = {
    season: 2027,
    seasons: [2027],
    range: cycleRange(2027),
    today: HOJE,
    competitions: [nacional, sul],
    milestones: marcos,
    links: [],
    team: {
      teamId: 't',
      label: '2027',
      registrationKind: 'integral',
      competitionIds: ['nac'],
      interestCompetitionIds: [],
      updatedAt: null,
      canManage: true,
      canSteps: true,
    },
  }
  const tudo = { mine: false, quick: 'tudo' as const, chips: new Set<string>() }

  it('AC-DF33.5 — inscrita integral: some o lote de novata/light e a outra competição', () => {
    const ids = marcosVisiveis(base, { ...tudo, mine: true }).map((m) => m.id)
    expect(ids).toContain('lote-integral')
    expect(ids).not.toContain('lote-novata')
    expect(ids).not.toContain('sul-inscricao')
    expect(ids).toContain('team:0')
    expect(ids).not.toContain('cancelado')
  })

  it('sem recorte tudo aparece; sem categoria declarada todos os lotes aparecem', () => {
    expect(marcosVisiveis(base, tudo).map((m) => m.id)).toContain('lote-novata')
    const semCategoria = { ...base, team: { ...base.team!, registrationKind: null } }
    expect(marcosVisiveis(semCategoria, { ...tudo, mine: true }).map((m) => m.id)).toContain(
      'lote-novata',
    )
  })

  it('AC-DF33.16 — "Só prazos oficiais" esconde equipe e informativos; "Só minha equipe" só ela', () => {
    const prazos = marcosVisiveis(base, { ...tudo, quick: 'prazos' }).map((m) => m.id)
    expect(prazos).not.toContain('team:0')
    expect(prazos).not.toContain('inf')
    expect(prazos).toContain('lote-integral')
    expect(marcosVisiveis(base, { ...tudo, quick: 'equipe' }).map((m) => m.id)).toEqual(['team:0'])
  })

  it('chip de competição filtra pelo nome curto', () => {
    const ids = marcosVisiveis(base, { ...tudo, chips: new Set(['Sul']) }).map((m) => m.id)
    expect(ids).toEqual(['sul-inscricao', 'team:0'])
  })

  it('FR-DF33.13 — o alternador nasce ligado só com competição marcada', () => {
    expect(defaultMine(base.team)).toBe(true)
    expect(defaultMine({ ...base.team!, competitionIds: [], interestCompetitionIds: [] })).toBe(
      false,
    )
    expect(defaultMine(null)).toBe(false)
  })

  it('FR-DF33.7 — próximos 30 dias: até cinco, em ordem, contando hoje', () => {
    const lista = proximos(marcos, HOJE)
    expect(lista.map((m) => m.id)).toEqual(['inf', 'lote-integral', 'sul-inscricao'])
    expect(proximos(marcos, HOJE, 30, 1)).toHaveLength(1)
  })

  it('FR-DF33.9 — agrupa por mês e separa "Já passou"', () => {
    expect(porMes(marcos).map((g) => g.key)).toEqual(['2026-09', '2026-10', '2026-12'])
    const { futuros, passados } = separaPassados(marcos, '2026-10-15')
    expect(passados.map((m) => m.id).sort()).toEqual(['inf', 'lote-integral', 'sul-inscricao'])
    expect(futuros).toHaveLength(3)
  })

  it('AC-DF33.8 — conferido há mais de 30 dias com marco futuro pede VERIFICAR', () => {
    expect(isStale('2026-07-01T00:00:00Z', HOJE, true)).toBe(true)
    expect(isStale('2026-08-20T00:00:00Z', HOJE, true)).toBe(false)
    expect(isStale('2026-07-01T00:00:00Z', HOJE, false)).toBe(false)
    expect(isStale(null, HOJE, true)).toBe(true)
  })
})

describe('iCalendar (FR-DF33.20 / AC-DF33.7)', () => {
  const m = marco({
    id: 'm1',
    title: 'Inscrição de integrantes',
    dueOn: '2027-01-25',
    kind: 'pessoas',
    summary: 'Cadastro de estudantes e orientadores no sistema da organização.',
    source: fonte,
  })

  it('um VEVENT por marco (dia inteiro) e um por competição (multi-dia), UID estável', () => {
    const a = buildIcs({
      milestones: [m],
      competitions: [nacional],
      name: 'Calendário Baja · Temporada 2027',
      stamp: '2026-09-06T12:00:00Z',
    })
    const b = buildIcs({
      milestones: [m],
      competitions: [nacional],
      name: 'Calendário Baja · Temporada 2027',
      stamp: '2026-09-07T12:00:00Z',
    })
    expect(a).toContain('BEGIN:VCALENDAR')
    expect(a).toContain('UID:m1@calendario.bajeiros')
    expect(a).toContain('DTSTART;VALUE=DATE:20270125')
    expect(a).toContain('DTEND;VALUE=DATE:20270126')
    expect(a).toContain('URL:https://exemplo.test/Informativo09.pdf')
    expect(a).toContain('Fonte: Informativo 09 — confira o documento oficial')
    expect(a).toContain('UID:competition-nac@calendario.bajeiros')
    expect(a).toContain('DTSTART;VALUE=DATE:20270331')
    expect(a).toContain('DTEND;VALUE=DATE:20270405')
    // duas exportações seguidas: só o carimbo muda, o UID não
    const uids = (s: string) => s.match(/^UID:.*$/gm)
    expect(uids(a)).toEqual(uids(b))
    expect(a.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 76)).toBe(true)
  })

  it('escapa separadores e dobra linhas longas', () => {
    expect(icsEscape('a, b; c\\d')).toBe('a\\, b\\; c\\\\d')
    const longa = foldLine('SUMMARY:' + 'x'.repeat(200))
    expect(longa.split('\r\n ')).toHaveLength(3)
    expect(longa.split('\r\n ').join('')).toBe('SUMMARY:' + 'x'.repeat(200))
  })

  it('FR-DF33.31 — marco da equipe sai com CATEGORIES:Equipe', () => {
    const s = buildIcs({
      milestones: [
        marco({ id: 'team:0', dueOn: '2026-12-10', kind: 'equipe', competitionId: null }),
      ],
      competitions: [],
      name: 'x',
      stamp: '2026-09-06T12:00:00Z',
    })
    expect(s).toContain('CATEGORIES:Equipe')
  })
})

describe('colar tabela (FR-DF33.23 / AC-DF33.9)', () => {
  // A tabela do §12.3 como sai de um Ctrl+C na página oficial (colunas por tabulação).
  const TABELA_2026 = [
    'ATIVIDADE\tLOCAL\tPRAZO\tINFORMATIVO',
    'Inscrição de equipe\tSite\taté 15/09/2025\tInformativo 01',
    'Inscrição dos integrantes e professores orientadores\tSite\taté 25/01/2026\tInformativo 09',
    'Associação dos integrantes\tSite\taté a competição\tInformativo 09',
    'Envio de atestado de matrícula\tE-mail\taté 08/03/2026\tInformativo 13',
    'Representante de imprensa\tSite\taté 08/03/2026\tInformativo 14',
    'Apresentação em escolas de ensino médio\tPresencial\taté 15/03/2026\tInformativo 10',
    'Pesquisa sobre hospedagem\tFormulário\taté 15/03/2026\tInformativo 15',
    'Agendamento para credenciamento\tSite\taté 15/03/2026\t(em breve)',
  ].join('\n')

  it('propõe 8 marcos com data e número de informativo corretos', () => {
    const { rows, ignored } = parseMilestoneTable(TABELA_2026)
    expect(rows).toHaveLength(8)
    expect(ignored).toEqual(['ATIVIDADE\tLOCAL\tPRAZO\tINFORMATIVO'])
    expect(rows[0]).toMatchObject({
      title: 'Inscrição de equipe',
      dueOn: '2025-09-15',
      sourceNumber: 1,
      kindGuess: 'inscricao',
      location: 'Site',
    })
    expect(rows[1]).toMatchObject({ dueOn: '2026-01-25', sourceNumber: 9, kindGuess: 'pessoas' })
    // "até a competição" não é data: fica nulo com a dica, para a pessoa decidir
    expect(rows[2]).toMatchObject({ dueOn: null, dateHint: 'até a competição', sourceNumber: 9 })
    expect(rows[3]).toMatchObject({ dueOn: '2026-03-08', sourceNumber: 13, kindGuess: 'documento' })
    expect(rows[4]).toMatchObject({ dueOn: '2026-03-08', sourceNumber: 14, kindGuess: 'pessoas' })
    expect(rows[5]).toMatchObject({ dueOn: '2026-03-15', sourceNumber: 10, kindGuess: 'evento' })
    expect(rows[6]).toMatchObject({ dueOn: '2026-03-15', sourceNumber: 15, kindGuess: 'logistica' })
    expect(rows[7]).toMatchObject({
      dueOn: '2026-03-15',
      sourceNumber: null,
      kindGuess: 'logistica',
    })
  })

  it('aceita a tabela colada com | e com espaços duplos', () => {
    const pipes = 'Inscrição de equipe | Site | até 15/09/2025 | Informativo 01'
    expect(parseMilestoneTable(pipes).rows[0]).toMatchObject({
      dueOn: '2025-09-15',
      sourceNumber: 1,
    })
    const espacos = 'Envio de atestado de matrícula   E-mail   até 08/03/2026   Informativo 13'
    expect(parseMilestoneTable(espacos).rows[0]).toMatchObject({
      title: 'Envio de atestado de matrícula',
      dueOn: '2026-03-08',
      sourceNumber: 13,
    })
  })

  it('prosa solta e cabeçalho são ignorados, nunca viram marco', () => {
    const { rows, ignored } = parseMilestoneTable(
      'Dúvidas administrativas por e-mail.\n\nPRAZO\tINFORMATIVO\n',
    )
    expect(rows).toHaveLength(0)
    expect(ignored).toHaveLength(2)
  })

  it('o tipo é adivinhado por palavra-chave e confere com o vocabulário', () => {
    expect(guessKind('Pagamento do 2º lote')).toBe('pagamento')
    expect(guessKind('Briefing de segurança')).toBe('evento')
    expect(guessKind('Coisa nova sem pista')).toBe('logistica')
  })
})
