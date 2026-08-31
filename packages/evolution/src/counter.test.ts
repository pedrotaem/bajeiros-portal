import { describe, expect, it } from 'vitest'
import { CATALOG } from './catalog'
import { computeLevels, evidence } from './compute'
import { COUNTER_CHECKS, MASS_FLOOR, isReaffirmable } from './counter'
import type { ComputeInput, Declaration, Evidence } from './types'

// DF-20 — AC-DF20.10: as contraprovas da V1 disparam e cessam nos casos de borda
// documentados. Todo este arquivo roda em `mode: 'aferido'` — é o gate que a v1 do
// produto ainda não liga (CATALOG_MODE = 'declarado').

const NOW = new Date('2026-08-30T12:00:00Z')
const days = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000)

function run(
  evidences: Evidence[],
  declarations: (string | Declaration)[],
  over: Partial<ComputeInput> = {},
) {
  const input: ComputeInput = {
    evidences,
    declarations: declarations.map<Declaration>((d) =>
      typeof d === 'string' ? { criterionId: d, declaredAt: days(1) } : d,
    ),
    now: NOW,
    mode: 'aferido',
    ...over,
  }
  return computeLevels(input)
}

type Result = ReturnType<typeof run>
const crit = (r: Result, id: string) => r.areas.flatMap((a) => a.criteria).find((c) => c.id === id)!
const level = (r: Result, area: string) => r.levels[area as 'estrutura']

const validation = (over: Record<string, unknown> = {}, at = days(1)) =>
  evidence(
    'validation.summary',
    {
      projectId: 'p1',
      snapshotSeq: 15,
      counts: { pass: 37, fail: 0, warn: 0, manual: 3 },
      presence: 0,
      massKg: 62.4,
      failedRuleIds: [],
      manualRuleIds: [],
      ...over,
    },
    at,
  )

const org = (over: Record<string, unknown> = {}, at = days(1)) =>
  evidence(
    'org.summary',
    {
      members: 9,
      owners: 1,
      admins: 1,
      trainees: 0,
      positions: 14,
      leads: 6,
      leadsFilled: 6,
      unfilledLeads: [],
      lastApprovedUserId: null,
      ...over,
    },
    at,
  )

const knowledge = (over: Record<string, unknown> = {}, at = days(1)) =>
  evidence(
    'knowledge.summary',
    {
      decisions: 40,
      guides: 12,
      guidesByKind: { guia: 10, trilha: 1, checklist: 1 },
      guidesWithoutOwner: 0,
      oldestGuideUpdatedAt: days(10).toISOString(),
      guideTags: ['solda'],
      ...over,
    },
    at,
  )

describe('DF-20 §2.1 — contradição direta', () => {
  it('AC-DF20.1 — EST-3.1 declarado + versão salva com 1 infração cai, e o nível de Estrutura cai', () => {
    const declaradas = ['EST-1.1', 'EST-2.1', 'EST-2.2', 'EST-3.1', 'EST-3.2']
    const limpo = run([validation()], declaradas)
    expect(level(limpo, 'estrutura')).toBe(3)

    const sujo = run(
      [validation({ counts: { pass: 36, fail: 1, warn: 0, manual: 3 } })],
      declaradas,
    )
    const c = crit(sujo, 'EST-3.1')
    expect(c.state).toBe('em-contraprova')
    expect(c.satisfied).toBe(false)
    expect(c.counterCheck?.kind).toBe('contradiction')
    expect(c.counterCheck?.measured).toBe('1 infrações na última versão')
    expect(level(sujo, 'estrutura')).toBe(2)
  })

  it('AC-DF20.2 — salvar versão conforme devolve a `vigente` sem nova declaração, e o nível sobe', () => {
    const declaradas = ['EST-1.1', 'EST-2.1', 'EST-2.2', 'EST-3.1', 'EST-3.2']
    const conserto = run(
      [
        validation({ counts: { pass: 36, fail: 1, warn: 0, manual: 3 } }, days(5)),
        validation({}, days(1)),
      ],
      declaradas,
    )
    expect(crit(conserto, 'EST-3.1').state).toBe('vigente')
    expect(level(conserto, 'estrutura')).toBe(3)
  })

  it('AC-DF20.5 — contradição direta não é reafirmável', () => {
    const r = run(
      [validation({ counts: { pass: 36, fail: 1, warn: 0, manual: 3 } })],
      [{ criterionId: 'EST-3.1', declaredAt: days(3), reaffirmedAt: days(1) }],
    )
    const c = crit(r, 'EST-3.1')
    expect(c.state).toBe('em-contraprova')
    expect(c.reaffirmable).toBe(false)
    expect(isReaffirmable(c.counterCheck)).toBe(false)
  })

  it('o papel de dinâmica vago contradiz o DIN-1.1', () => {
    const vago = run(
      [org({ leadsFilled: 5, unfilledLeads: ['Líder — Suspensão e Direção'] })],
      ['DIN-1.1'],
    )
    expect(crit(vago, 'DIN-1.1').state).toBe('em-contraprova')
    // outro cargo vago, que não é de dinâmica, não contradiz ESTE critério
    const outro = run(
      [org({ leadsFilled: 5, unfilledLeads: ['Líder — Financeiro e Marketing'] })],
      ['DIN-1.1'],
    )
    expect(crit(outro, 'DIN-1.1').state).toBe('vigente')
  })

  it('os contadores de Conhecimento contradizem os próprios critérios', () => {
    const r = run([knowledge({ decisions: 3, guides: 1 })], ['CON-1.1', 'CON-2.1'])
    expect(crit(r, 'CON-1.1').state).toBe('vigente') // 3 ≥ 1
    expect(crit(r, 'CON-2.1').state).toBe('em-contraprova')
    expect(crit(r, 'CON-2.1').counterCheck?.measured).toBe('3/10 decisões e 1/2 guias')
  })
})

describe('DF-20 §2.0 — ausência de dado não é contraprova', () => {
  it('AC-DF20.11 — projeto sem gaiola salva: nenhuma contraprova de validador dispara', () => {
    const semGaiola = ['EST-2.1', 'EST-3.1', 'DIN-2.1', 'DIN-2.2', 'FAB-2.1']
    const r = run([org()], semGaiola)
    for (const id of semGaiola) {
      const c = crit(r, id)
      expect(c.state, id).toBe('vigente')
      expect(c.satisfied, id).toBe(true)
      expect(c.counterCheck, id).toBeNull()
      expect(c.notComparable, id).toMatch(/não está modelado no validador/)
    }
  })

  it('AC-DF20.12 — ficha vazia e sem gaiola contradiz só o critério que AFIRMA o dado', () => {
    const r = run([org()], ['EST-1.1', 'EST-2.1'])
    // EST-1.1 diz "o projeto está registrado no portal" — a ausência contradiz
    expect(crit(r, 'EST-1.1').state).toBe('em-contraprova')
    // EST-2.1 fala do carro, não do portal — fica vigente com "sem como conferir"
    expect(crit(r, 'EST-2.1').state).toBe('vigente')
    expect(crit(r, 'EST-2.1').notComparable).toBeTruthy()
  })

  it('FAB-2.1: gabarito gerado fora do portal (link na declaração) não é contradito', () => {
    const semGabarito = [validation()]
    const semLink = run(semGabarito, ['FAB-2.1'])
    expect(crit(semLink, 'FAB-2.1').state).toBe('em-contraprova')

    const comLink = run(semGabarito, [
      { criterionId: 'FAB-2.1', declaredAt: days(1), hasLink: true },
    ])
    expect(crit(comLink, 'FAB-2.1').state).toBe('vigente')
    expect(crit(comLink, 'FAB-2.1').notComparable).toMatch(/fora do portal/)
  })

  it('sem nada publicado em Conhecimento, os contadores não acusam ninguém', () => {
    const r = run([org()], ['CON-1.1', 'CON-2.1', 'CON-4.2'])
    for (const id of ['CON-1.1', 'CON-2.1', 'CON-4.2']) {
      expect(crit(r, id).state, id).toBe('vigente')
      expect(crit(r, id).notComparable, id).toBeTruthy()
    }
  })
})

describe('DF-20 §2.2 — indício quantitativo', () => {
  const massa = (over: Partial<ComputeInput['community']> = {}) => ({
    massMedianKg: 40,
    massProjects: 12,
    classLabel: 'monoposto/4x2',
    ...over,
  })

  it('AC-DF20.3 — massa 56% acima da mediana pergunta, com o valor medido', () => {
    const r = run([validation({ massKg: 62.4 })], ['DIN-3.1'], { community: massa() })
    const c = crit(r, 'DIN-3.1')
    expect(c.state).toBe('em-contraprova')
    expect(c.counterCheck?.kind).toBe('indication')
    expect(c.counterCheck?.message).toMatch(/56% acima da mediana/)
    expect(c.counterCheck?.message).toMatch(/\?$/) // é pergunta, nunca veredito (P-1.2)
    expect(c.counterCheck?.measured).toBe('62,4 kg contra mediana de 40,0 kg em 12 protótipos')
    expect(c.reaffirmable).toBe(true)
  })

  it('massa dentro do limiar de 50% não dispara nada', () => {
    const r = run([validation({ massKg: 58 })], ['DIN-3.1'], { community: massa() })
    expect(crit(r, 'DIN-3.1').state).toBe('vigente')
  })

  it('AC-DF20.4 — reafirmar com nota devolve ao cálculo e marca "reafirmada"', () => {
    const r = run(
      [validation({ massKg: 62.4 })],
      [{ criterionId: 'DIN-3.1', declaredAt: days(5), reaffirmedAt: days(1) }],
      { community: massa() },
    )
    const c = crit(r, 'DIN-3.1')
    expect(c.state).toBe('reafirmada')
    expect(c.satisfied).toBe(true)
    // a acusação continua à vista ao lado do critério (P-1.2)
    expect(c.counterCheck?.kind).toBe('indication')
  })

  it('§3.3 — reafirmação de outra temporada não vale nesta', () => {
    const r = run(
      [validation({ massKg: 62.4 })],
      [
        {
          criterionId: 'DIN-3.1',
          declaredAt: days(400),
          reaffirmedAt: days(400),
          reaffirmedSeason: '2026',
        },
      ],
      { community: massa(), seasonLabel: '2027' },
    )
    expect(crit(r, 'DIN-3.1').state).toBe('em-contraprova')
  })

  it('AC-DF20.7 — coorte abaixo do piso de 8 protótipos: a contraprova de massa não existe', () => {
    const r = run([validation({ massKg: 200 })], ['DIN-3.1'], {
      community: massa({ massProjects: MASS_FLOOR - 1 }),
    })
    expect(crit(r, 'DIN-3.1').state).toBe('vigente')
    expect(crit(r, 'DIN-3.1').notComparable).toMatch(/protótipos comparáveis/)
  })

  it('P-1.4 — sem classe declarada não há comparação honesta', () => {
    const r = run([validation({ massKg: 200 })], ['DIN-3.1'], {
      community: massa({ classLabel: null }),
    })
    expect(crit(r, 'DIN-3.1').state).toBe('vigente')
  })

  it('GES-2.2 — silêncio de 60 dias pergunta pela rotina de reunião', () => {
    const r = run([org({}, days(70)), knowledge({}, days(80))], ['GES-2.2'])
    const c = crit(r, 'GES-2.2')
    expect(c.counterCheck?.kind).toBe('indication')
    expect(c.counterCheck?.message).toMatch(/70 dias/)
  })
})

describe('DF-20 §2.3 — piso de atividade', () => {
  it('AC-DF20.6 — sem evidência em 90 dias e sem organograma: um aviso, nenhuma contraprova individual', () => {
    const r = run([knowledge({ decisions: 40 }, days(200))], ['CON-1.1', 'CON-2.1', 'GES-2.2'])
    expect(r.activityFloor?.message).toMatch(/caminho mínimo/)
    expect(r.activityFloor?.measured).toMatch(/200 dias/)
    for (const id of ['CON-1.1', 'CON-2.1', 'GES-2.2']) {
      const c = crit(r, id)
      expect(c.state, id).toBe('em-contraprova')
      // o aviso é DA EQUIPE: nenhum critério carrega acusação própria (RF-1.3)
      expect(c.counterCheck, id).toBeNull()
      expect(c.reason, id).toBe('suspenso pelo piso de atividade da equipe')
    }
  })

  it('as duas condições são exigidas juntas: equipe em recesso COM organograma não cai', () => {
    const r = run([org({}, days(200))], ['CON-1.1'])
    expect(r.activityFloor).toBeNull()
  })

  it('em modo declarado o piso não existe (o gate é do DF-20)', () => {
    const r = computeLevels({
      evidences: [knowledge({}, days(200))],
      declarations: [{ criterionId: 'CON-1.1', declaredAt: days(200) }],
      now: NOW,
      mode: 'declarado',
    })
    expect(r.activityFloor).toBeNull()
    expect(crit(r, 'CON-1.1').satisfied).toBe(true)
  })
})

describe('cobertura do catálogo de contraprovas', () => {
  it('toda contraprova aponta para um critério que existe', () => {
    const ids = new Set(CATALOG.map((c) => c.id))
    for (const id of Object.keys(COUNTER_CHECKS)) expect(ids.has(id), id).toBe(true)
  })

  it('§4 — 19 contraprovas na V1 (18 contradições + 1 indício) mais o par de massa da V2', () => {
    const v1 = CATALOG.filter((c) => c.audit.wave === 'V1').map((c) => c.id)
    expect(v1).toHaveLength(19)
    const contradicoes = v1.filter((id) => COUNTER_CHECKS[id].kind === 'contradiction')
    const indicios = v1.filter((id) => COUNTER_CHECKS[id].kind === 'indication')
    expect(contradicoes).toHaveLength(18)
    expect(indicios).toEqual(['GES-2.2'])
    expect(Object.keys(COUNTER_CHECKS).sort()).toEqual([...v1, 'DIN-3.1', 'DIN-3.2'].sort())
  })
})
