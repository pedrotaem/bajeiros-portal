import { describe, expect, it } from 'vitest'
import { formatAverage } from './areas'
import { CATALOG } from './catalog'
import { computeLevels, evidence } from './compute'
import type { ComputeInput, Declaration, Evidence } from './types'

// DF-13 (níveis) + DF-19 (modo autodeclarativo) + DF-20 (aferição).
//
// A virada do DF-19 está em toda a suíte: no v1.0.0 o critério `auto` era satisfeito
// pela EVIDÊNCIA; na v2.0.0 quem satisfaz é a DECLARAÇÃO, e a evidência vira a
// MEDIDA que aparece ao lado da resposta (RF-1.3). Por isso o que antes se afirmava
// em `reason` agora se afirma em `measured`.

const NOW = new Date('2026-08-30T12:00:00Z')
const days = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000)

function run(
  evidences: Evidence[],
  declarations: (string | Declaration)[] = [],
  over: Partial<ComputeInput> = {},
) {
  const input: ComputeInput = {
    evidences,
    declarations: declarations.map<Declaration>((d) =>
      typeof d === 'string' ? { criterionId: d, declaredAt: days(1) } : d,
    ),
    now: NOW,
    ...over,
  }
  return computeLevels(input)
}

const ALL_IDS = CATALOG.map((c) => c.id)

const validation = (
  over: Partial<{
    fail: number
    presence: number
    failedRuleIds: string[]
    seq: number
    massKg: number | null
  }> = {},
  at = days(1),
) =>
  evidence(
    'validation.summary',
    {
      projectId: 'p1',
      snapshotSeq: over.seq ?? 15,
      counts: { pass: 37, fail: over.fail ?? 0, warn: 0, manual: 3 },
      presence: over.presence ?? 0,
      massKg: over.massKg === undefined ? 62.4 : over.massKg,
      failedRuleIds: over.failedRuleIds ?? [],
      manualRuleIds: ['B6.2.5.3'],
    },
    at,
  )

const org = (over: Record<string, unknown> = {}, at = days(1)) =>
  evidence(
    'org.summary',
    {
      members: 9,
      owners: 1,
      admins: 2,
      trainees: 1,
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
      decisions: 0,
      guides: 0,
      guidesByKind: { guia: 0, trilha: 0, checklist: 0 },
      guidesWithoutOwner: 0,
      oldestGuideUpdatedAt: null,
      guideTags: [],
      ...over,
    },
    at,
  )

type Result = ReturnType<typeof run>
const level = (r: Result, area: string) => r.levels[area as 'estrutura']
const crit = (r: Result, id: string) => r.areas.flatMap((a) => a.criteria).find((c) => c.id === id)
const reason = (r: Result, id: string) => crit(r, id)?.reason
const measured = (r: Result, id: string) => crit(r, id)?.measured?.reason

describe('equipe zerada', () => {
  it('todas as áreas em 0, média 0,0 e piso 0', () => {
    const r = run([])
    expect(r.average).toBe(0)
    expect(formatAverage(r.average)).toBe('0,0')
    expect(r.floor).toBe(0)
    for (const a of r.areas) expect(a.level, a.area).toBe(0)
  })

  it('explica que falta o projeto da temporada, não "0 infrações"', () => {
    expect(measured(run([]), 'EST-3.1')).toBe('nenhuma versão salva do projeto da temporada')
  })

  it('só o próximo nível gera pendências (fila não vira cobrança)', () => {
    const est = run([]).areas.find((a) => a.area === 'estrutura')!
    expect(est.pending.every((c) => c.level === 1)).toBe(true)
    expect(est.pending.map((c) => c.id)).toEqual(['EST-1.1'])
  })
})

describe('DF-19 — modo autodeclarativo', () => {
  it('AC-DF19.1 — critério `auto` NÃO satisfeito por evidência sobe o nível quando declarado', () => {
    const semDeclarar = run([validation()])
    expect(level(semDeclarar, 'estrutura')).toBe(0)
    expect(measured(semDeclarar, 'EST-1.1')).toBe('projeto da temporada com versão salva')

    const declarado = run([], ['EST-1.1'])
    expect(level(declarado, 'estrutura')).toBe(1)
  })

  it('AC-DF19.2 — 51 critérios, todos visíveis, nenhum fora do denominador', () => {
    const r = run([])
    expect(r.areas.flatMap((a) => a.criteria)).toHaveLength(51)
    expect(r.areas.flatMap((a) => a.criteria).map((c) => c.id)).toContain('EST-4.1')
    expect(r.areas.flatMap((a) => a.criteria).map((c) => c.id)).toContain('DOC-4.2')
  })

  it('AC-DF19.3 — a medida aparece ao lado da resposta; discordar grava `divergent` sem mudar o nível', () => {
    // a equipe diz que a gaiola está sem infração; a última versão salva tem 2
    const r = run(
      [validation({ fail: 2 })],
      ['EST-1.1', 'EST-2.1', 'EST-2.2', 'EST-3.1', 'EST-3.2'],
    )
    const c = crit(r, 'EST-3.1')!
    expect(c.satisfied).toBe(true) // na v1 a divergência NÃO muda o nível
    expect(c.divergent).toBe(true)
    expect(c.measured).toEqual({ satisfied: false, reason: '2 infrações na última versão' })
    expect(level(r, 'estrutura')).toBe(3)
  })

  it('divergência não existe onde o portal não mede', () => {
    const r = run([], ['EST-3.2'])
    expect(crit(r, 'EST-3.2')?.measured).toBeNull()
    expect(crit(r, 'EST-3.2')?.divergent).toBe(false)
  })

  it('AC-DF19.4 — cumulativo: declarar nível 5 com o 2 incompleto não altera o nível', () => {
    const r = run([], ['EST-1.1', 'EST-5.1', 'EST-5.2'])
    expect(level(r, 'estrutura')).toBe(1)
    expect(crit(r, 'EST-5.1')?.satisfied).toBe(true)
  })

  it('AC-DF19.5 — critério sazonal declarado em outra temporada vence na virada', () => {
    const decl: Declaration = { criterionId: 'DOC-1.1', declaredAt: days(400), seasonLabel: '2026' }
    const vigente = run([], [decl], { seasonLabel: '2026' })
    expect(crit(vigente, 'DOC-1.1')?.satisfied).toBe(true)
    expect(vigente.expiring).toContain('DOC-1.1')

    const virou = run([], [decl], { seasonLabel: '2027' })
    expect(crit(virou, 'DOC-1.1')?.satisfied).toBe(false)
    expect(crit(virou, 'DOC-1.1')?.expired).toBe(true)
    expect(reason(virou, 'DOC-1.1')).toBe('vencido com a virada da temporada 2027')
    expect(level(virou, 'documentacao')).toBe(0)
  })

  it('declaração sem rótulo de temporada não expira retroativamente', () => {
    const r = run([], [{ criterionId: 'DOC-1.1', declaredAt: days(400) }], { seasonLabel: '2027' })
    expect(crit(r, 'DOC-1.1')?.satisfied).toBe(true)
  })

  it('critério não-sazonal atravessa a virada', () => {
    const decl: Declaration = { criterionId: 'DOC-3.2', declaredAt: days(400), seasonLabel: '2026' }
    expect(crit(run([], [decl], { seasonLabel: '2027' }), 'DOC-3.2')?.satisfied).toBe(true)
  })
})

describe('a medida do portal (checks do catálogo)', () => {
  it('EST-1.1 aceita os dois caminhos: gaiola salva OU ficha com conteúdo', () => {
    expect(measured(run([validation()]), 'EST-1.1')).toBe('projeto da temporada com versão salva')
    const comFicha = run([evidence('datasheet.summary', { projectId: 'p1', filled: 12 }, days(1))])
    expect(measured(comFicha, 'EST-1.1')).toBe('ficha do protótipo com 12 campos')
    expect(measured(run([]), 'EST-1.1')).toBe('sem versão salva e sem ficha preenchida')
  })

  it('infração e pendência de presença aparecem com o número', () => {
    expect(measured(run([validation({ fail: 2 })]), 'EST-3.1')).toBe('2 infrações na última versão')
    expect(measured(run([validation({ fail: 1, presence: 1 })]), 'EST-2.1')).toBe(
      '1 pendências de presença',
    )
  })

  it('a evidência mais recente manda', () => {
    const r = run([
      validation({ fail: 3, seq: 14 }, days(5)),
      validation({ fail: 0, seq: 15 }, days(1)),
    ])
    expect(measured(r, 'EST-3.1')).toBe('zero infrações automáticas na última versão')
  })

  it('SUSP.1 e STEER.1 são lidas por ID', () => {
    const r = run([validation({ fail: 1, failedRuleIds: ['SUSP.1'] })])
    expect(measured(r, 'DIN-2.1')).toBe('SUSP.1 com infração na última versão')
    expect(measured(r, 'DIN-2.2')).toBe('ancoragem da direção apoiada (ou não declarada)')
  })

  it('capitania irregular e cargo vago aparecem no organograma', () => {
    expect(measured(run([org({ owners: 2 })]), 'GES-1.1')).toBe(
      'capitania irregular (2 capitão/capitã, 2 co)',
    )
    expect(measured(run([org({ leadsFilled: 4 })]), 'GES-2.1')).toBe(
      '2 cargos de liderança sem ocupante',
    )
  })

  it('temporada sem marcos não conta', () => {
    const semMarcos = run([
      evidence('season.configured', { label: '2027', milestones: 0 }, days(1)),
    ])
    expect(measured(semMarcos, 'GES-3.1')).toBe('temporada sem marcos datados')
    const comMarcos = run([
      evidence('season.configured', { label: '2027', milestones: 5 }, days(1)),
    ])
    expect(measured(comMarcos, 'GES-3.1')).toBe('temporada com 5 marcos')
  })

  it('CON-3.2 conta só decisões dentro da janela de 6 meses', () => {
    const areasDecisions = (areas: string[], at: Date) =>
      areas.map((area) => evidence('decision.created', { area }, at))
    const base = knowledge({ decisions: 12 })
    expect(
      measured(
        run([base, ...areasDecisions(['estrutura', 'dinamica', 'gestao'], days(300))]),
        'CON-3.2',
      ),
    ).toBe('0/3 áreas com decisão em 6 meses')
    expect(
      measured(
        run([base, ...areasDecisions(['estrutura', 'dinamica', 'gestao'], days(10))]),
        'CON-3.2',
      ),
    ).toBe('3 áreas com decisão em 6 meses')
  })

  it('decisão de área "geral" não conta como área distinta', () => {
    const r = run([
      knowledge({ decisions: 12 }),
      evidence('decision.created', { area: 'estrutura' }, days(10)),
      evidence('decision.created', { area: 'geral' }, days(10)),
    ])
    expect(measured(r, 'CON-3.2')).toBe('1/3 áreas com decisão em 6 meses')
  })

  it('CON-3.1 exige que o ÚLTIMO novato aprovado tenha concluído a trilha', () => {
    const base = [knowledge({ decisions: 12 }), org({ lastApprovedUserId: 'u2' })]
    expect(measured(run([knowledge(), org()]), 'CON-3.1')).toBe('nenhum novato aprovado ainda')
    const outro = evidence('trail.completed', { userId: 'u1' }, days(3))
    expect(measured(run([...base, outro]), 'CON-3.1')).toBe(
      'o último novato aprovado não concluiu a trilha',
    )
    const certo = evidence('trail.completed', { userId: 'u2' }, days(2))
    expect(measured(run([...base, outro, certo]), 'CON-3.1')).toBe(
      'último novato aprovado concluiu a trilha',
    )
  })

  it('CON-4.1 — kit vencido derruba; concluir o kit resolve', () => {
    const aberto = evidence('kit.opened', { kitId: 'k1', dueDate: '2026-06-01' }, days(120))
    const concluido = evidence('kit.completed', { kitId: 'k2' }, days(30))
    const outroAberto = evidence('kit.opened', { kitId: 'k2', dueDate: '2026-05-01' }, days(150))
    expect(measured(run([aberto, outroAberto, concluido]), 'CON-4.1')).toBe(
      '1 kits abertos com saída vencida',
    )
    const fechado = evidence('kit.completed', { kitId: 'k1' }, days(1))
    expect(measured(run([aberto, outroAberto, concluido, fechado]), 'CON-4.1')).toBe('kits em dia')
  })

  it('CON-4.2 — guia sem dono ou envelhecido reprova', () => {
    expect(measured(run([knowledge({ guides: 3, guidesWithoutOwner: 1 })]), 'CON-4.2')).toBe(
      '1 guias sem dono',
    )
    expect(
      measured(
        run([knowledge({ guides: 3, oldestGuideUpdatedAt: days(300).toISOString() })]),
        'CON-4.2',
      ),
    ).toBe('há guia sem atualização há mais de 6 meses')
  })

  it('a mesma entrada em outra data muda o resultado (now é injetado)', () => {
    const g = knowledge({ guides: 1, oldestGuideUpdatedAt: '2026-08-01T00:00:00Z' })
    expect(measured(run([g], [], { now: new Date('2026-08-30T12:00:00Z') }), 'CON-4.2')).toBe(
      'todos os guias com dono e atualizados',
    )
    expect(measured(run([g], [], { now: new Date('2027-08-30T12:00:00Z') }), 'CON-4.2')).toBe(
      'há guia sem atualização há mais de 6 meses',
    )
  })
})

describe('média, piso e cumulatividade', () => {
  it('é a média aritmética das 6 áreas com uma casa decimal, e o piso é a menor', () => {
    const r = run(
      [],
      [
        'EST-1.1',
        'EST-2.1',
        'EST-2.2',
        'EST-3.1',
        'EST-3.2',
        'DIN-1.1',
        'DIN-2.1',
        'DIN-2.2',
        'GES-1.1',
        'GES-2.1',
        'GES-2.2',
        'CON-1.1',
      ],
    )
    expect(r.levels).toEqual({
      estrutura: 3,
      dinamica: 2,
      documentacao: 0,
      fabricacao: 0,
      gestao: 2,
      conhecimento: 1,
    })
    expect(r.average).toBe(1.3)
    expect(formatAverage(r.average)).toBe('1,3')
    expect(r.floor).toBe(0)
  })

  it('equipe que responde tudo chega a 5,0 com piso 5', () => {
    const r = run([], ALL_IDS)
    expect(r.average).toBe(5)
    expect(r.floor).toBe(5)
    for (const a of r.areas) {
      expect(a.level, `${a.area}: ${a.pending.map((p) => p.id).join(', ')}`).toBe(5)
      expect(a.pending).toEqual([])
    }
  })
})

describe('resultado do cálculo', () => {
  it('carrega a versão e o modo do catálogo (base do delta de recomputação)', () => {
    const r = run([])
    expect(r.catalogVersion).toMatch(/^\d+\.\d+\.\d+$/)
    expect(r.mode).toBe('declarado')
  })

  it('resultado de competição não muda nível (maturidade ≠ resultado, ADR-010)', () => {
    const declaradas = ['EST-1.1', 'EST-2.1', 'EST-2.2']
    const semResultado = run([validation()], declaradas)
    const comResultado = run(
      [validation(), evidence('competition.result', { position: 3, total: 42 }, days(2))],
      declaradas,
    )
    expect(comResultado.levels).toEqual(semResultado.levels)
  })

  it('é determinístico: mesma entrada, mesmo resultado', () => {
    const ev = [validation(), org(), knowledge({ decisions: 4 })]
    expect(JSON.stringify(run(ev, ['EST-1.1']))).toBe(JSON.stringify(run(ev, ['EST-1.1'])))
  })
})
