import { describe, expect, it } from 'vitest'
import { formatAverage } from './areas'
import { computeLevels, evidence } from './compute'
import type { ComputeInput, Declaration, Evidence } from './types'

const NOW = new Date('2026-08-30T12:00:00Z')
const days = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000)

function run(evidences: Evidence[], declarations: string[] = [], now = NOW) {
  const input: ComputeInput = {
    evidences,
    declarations: declarations.map<Declaration>((criterionId) => ({
      criterionId,
      declaredAt: days(1),
    })),
    now,
  }
  return computeLevels(input)
}

const validation = (
  over: Partial<{
    fail: number
    presence: number
    failedRuleIds: string[]
    seq: number
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
      massKg: 62.4,
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

const level = (r: ReturnType<typeof run>, area: string) => r.levels[area as 'estrutura']
const reason = (r: ReturnType<typeof run>, id: string) =>
  r.areas.flatMap((a) => a.criteria).find((c) => c.id === id)?.reason

describe('equipe zerada', () => {
  it('todas as áreas em 0 e média 0,0', () => {
    const r = run([])
    expect(r.average).toBe(0)
    expect(formatAverage(r.average)).toBe('0,0')
    for (const a of r.areas) expect(a.level, a.area).toBe(0)
  })

  it('explica que falta o projeto da temporada, não "0 infrações"', () => {
    expect(reason(run([]), 'EST-3.1')).toBe('nenhuma versão salva do projeto da temporada')
  })

  it('só o próximo nível gera pendências (fila não vira cobrança)', () => {
    const est = run([]).areas.find((a) => a.area === 'estrutura')!
    expect(est.pending.every((c) => c.level === 1)).toBe(true)
    expect(est.pending.map((c) => c.id)).toEqual(['EST-1.1'])
  })
})

describe('AC-DF13.2 — ciclo do validador', () => {
  it('com EST-2.2/3.2 declarados, salvar sem infração sobe Estrutura para 3', () => {
    const r = run([validation()], ['EST-2.2', 'EST-3.2'])
    expect(level(r, 'estrutura')).toBe(3)
  })

  it('salvar com infração derruba Estrutura para 2', () => {
    const r = run(
      [validation({ fail: 2, failedRuleIds: ['B6.2.4.2', 'B6.3.1'] })],
      ['EST-2.2', 'EST-3.2'],
    )
    expect(level(r, 'estrutura')).toBe(2)
    expect(reason(r, 'EST-3.1')).toBe('2 infrações na última versão')
  })

  it('pendência de presença segura no nível 1', () => {
    const r = run([validation({ fail: 1, presence: 1 })], ['EST-2.2', 'EST-3.2'])
    expect(level(r, 'estrutura')).toBe(1)
  })

  it('a evidência mais recente manda (nível acompanha a última versão salva)', () => {
    const r = run(
      [validation({ fail: 3, seq: 14 }, days(5)), validation({ fail: 0, seq: 15 }, days(1))],
      ['EST-2.2', 'EST-3.2'],
    )
    expect(level(r, 'estrutura')).toBe(3)
  })

  it('sem declarar EST-2.2, o nível trava em 1 mesmo com validação limpa', () => {
    expect(level(run([validation()]), 'estrutura')).toBe(1)
  })
})

describe('dinâmica — regras do validador por ID', () => {
  it('SUSP.1 com infração impede o nível 2', () => {
    const r = run([validation({ fail: 1, failedRuleIds: ['SUSP.1'] })], ['DIN-1.1'])
    expect(level(r, 'dinamica')).toBe(1)
    expect(reason(r, 'DIN-2.1')).toBe('SUSP.1 com infração na última versão')
  })

  it('STEER.1 ausente do projeto não bloqueia (critério condicional)', () => {
    const r = run([validation()], ['DIN-1.1'])
    expect(level(r, 'dinamica')).toBe(2)
  })
})

describe('gestão — organograma e temporada', () => {
  it('capitania regular + organograma criado fecha o nível 1', () => {
    expect(level(run([org({ leads: 6, leadsFilled: 0 })]), 'gestao')).toBe(1)
  })

  it('capitania irregular (2 capitães) reprova GES-1.1', () => {
    const r = run([org({ owners: 2 })])
    expect(level(r, 'gestao')).toBe(0)
    expect(reason(r, 'GES-1.1')).toBe('capitania irregular (2 capitão/capitã, 2 co)')
  })

  it('cargo de liderança vago segura o nível 2', () => {
    const r = run([org({ leadsFilled: 4 })], ['GES-2.2'])
    expect(level(r, 'gestao')).toBe(1)
    expect(reason(r, 'GES-2.1')).toBe('2 cargos de liderança sem ocupante')
  })

  it('AC-DF13.7 — temporada com marcos satisfaz GES-3.1', () => {
    const r = run(
      [org(), evidence('season.configured', { label: '2027', milestones: 5 }, days(1))],
      ['GES-2.2', 'GES-3.2'],
    )
    expect(level(r, 'gestao')).toBe(3)
  })

  it('temporada sem marcos não conta', () => {
    const r = run(
      [org(), evidence('season.configured', { label: '2027', milestones: 0 }, days(1))],
      ['GES-2.2', 'GES-3.2'],
    )
    expect(level(r, 'gestao')).toBe(2)
  })
})

describe('conhecimento — contagens vivas e janelas temporais', () => {
  const areasDecisions = (areas: string[], at = days(10)) =>
    areas.map((area) => evidence('decision.created', { area }, at))

  it('uma decisão fecha o nível 1', () => {
    expect(level(run([knowledge({ decisions: 1 })]), 'conhecimento')).toBe(1)
  })

  it('10 decisões + 2 guias + trilha fecham o nível 2', () => {
    const r = run([
      knowledge({ decisions: 10, guides: 2, guidesByKind: { guia: 1, trilha: 1, checklist: 0 } }),
    ])
    expect(level(r, 'conhecimento')).toBe(2)
  })

  it('CON-3.2 conta só decisões dentro da janela de 6 meses', () => {
    const base = knowledge({
      decisions: 12,
      guides: 2,
      guidesByKind: { guia: 1, trilha: 1, checklist: 0 },
    })
    const antigas = areasDecisions(['estrutura', 'dinamica', 'gestao'], days(300))
    const recentes = areasDecisions(['estrutura', 'dinamica', 'gestao'], days(10))
    expect(reason(run([base, ...antigas]), 'CON-3.2')).toBe('0/3 áreas com decisão em 6 meses')
    expect(reason(run([base, ...recentes]), 'CON-3.2')).toBe('3 áreas com decisão em 6 meses')
  })

  it('decisão de área "geral" não conta como área distinta', () => {
    const base = knowledge({ decisions: 12 })
    const r = run([base, ...areasDecisions(['estrutura', 'geral', 'geral'])])
    expect(reason(r, 'CON-3.2')).toBe('1/3 áreas com decisão em 6 meses')
  })

  it('CON-3.1 exige que o ÚLTIMO novato aprovado tenha concluído a trilha', () => {
    const base = [knowledge({ decisions: 12 }), org({ lastApprovedUserId: 'u2' })]
    expect(reason(run([knowledge({ decisions: 12 }), org()]), 'CON-3.1')).toBe(
      'nenhum novato aprovado ainda',
    )
    const outro = evidence('trail.completed', { userId: 'u1' }, days(3))
    expect(reason(run([...base, outro]), 'CON-3.1')).toBe(
      'o último novato aprovado não concluiu a trilha',
    )
    const certo = evidence('trail.completed', { userId: 'u2' }, days(2))
    expect(reason(run([...base, outro, certo]), 'CON-3.1')).toBe(
      'último novato aprovado concluiu a trilha',
    )
  })

  it('CON-4.1 — kit vencido derruba; concluir o kit resolve', () => {
    const aberto = evidence('kit.opened', { kitId: 'k1', dueDate: '2026-06-01' }, days(120))
    const concluido = evidence('kit.completed', { kitId: 'k2' }, days(30))
    const outroAberto = evidence('kit.opened', { kitId: 'k2', dueDate: '2026-05-01' }, days(150))
    expect(reason(run([aberto, outroAberto, concluido]), 'CON-4.1')).toBe(
      '1 kits abertos com saída vencida',
    )
    const fechado = evidence('kit.completed', { kitId: 'k1' }, days(1))
    expect(reason(run([aberto, outroAberto, concluido, fechado]), 'CON-4.1')).toBe('kits em dia')
  })

  it('kit aberto com saída futura não é pendência', () => {
    const futuro = evidence('kit.opened', { kitId: 'k9', dueDate: '2026-12-20' }, days(1))
    const feito = evidence('kit.completed', { kitId: 'k1' }, days(10))
    expect(reason(run([futuro, feito]), 'CON-4.1')).toBe('kits em dia')
  })

  it('CON-4.2 — guia sem dono ou envelhecido reprova', () => {
    expect(reason(run([knowledge({ guides: 3, guidesWithoutOwner: 1 })]), 'CON-4.2')).toBe(
      '1 guias sem dono',
    )
    expect(
      reason(
        run([knowledge({ guides: 3, oldestGuideUpdatedAt: days(300).toISOString() })]),
        'CON-4.2',
      ),
    ).toBe('há guia sem atualização há mais de 6 meses')
    expect(
      reason(
        run([knowledge({ guides: 3, oldestGuideUpdatedAt: days(10).toISOString() })]),
        'CON-4.2',
      ),
    ).toBe('todos os guias com dono e atualizados')
  })

  it('a mesma entrada em outra data muda o resultado (now é injetado)', () => {
    const g = knowledge({ guides: 1, oldestGuideUpdatedAt: '2026-08-01T00:00:00Z' })
    expect(reason(run([g], [], new Date('2026-08-30T12:00:00Z')), 'CON-4.2')).toBe(
      'todos os guias com dono e atualizados',
    )
    expect(reason(run([g], [], new Date('2027-08-30T12:00:00Z')), 'CON-4.2')).toBe(
      'há guia sem atualização há mais de 6 meses',
    )
  })
})

describe('fabricação', () => {
  it('gabarito gerado + plano de solda declarado fecham o nível 2', () => {
    const r = run(
      [evidence('template.generated', { projectId: 'p1' }, days(1))],
      ['FAB-1.1', 'FAB-2.2'],
    )
    expect(level(r, 'fabricacao')).toBe(2)
  })

  it('guia com etiqueta "solda" satisfaz FAB-3.1', () => {
    const r = run(
      [
        evidence('template.generated', { projectId: 'p1' }, days(1)),
        knowledge({ guides: 2, guideTags: ['Solda', 'freio'] }),
      ],
      ['FAB-1.1', 'FAB-2.2', 'FAB-3.2'],
    )
    expect(level(r, 'fabricacao')).toBe(3)
  })
})

describe('AC-DF13.6 — critério oculto', () => {
  it('não aparece na lista nem impede o nível 4', () => {
    const declaradosEstrutura = ['EST-2.2', 'EST-3.2', 'EST-4.2', 'EST-4.3']
    const r = run([validation()], declaradosEstrutura)
    const est = r.areas.find((a) => a.area === 'estrutura')!
    expect(est.criteria.some((c) => c.id === 'EST-4.1')).toBe(false)
    expect(est.level).toBe(4)
  })
})

describe('média da equipe', () => {
  it('é a média aritmética das 6 áreas com uma casa decimal', () => {
    const r = run(
      [validation(), org(), knowledge({ decisions: 1 })],
      ['EST-2.2', 'EST-3.2', 'DIN-1.1', 'GES-2.2'],
    )
    // estrutura 3 · dinâmica 2 · documentação 0 · fabricação 0 · gestão 2 · conhecimento 1
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
  })

  it('equipe completa chega a 5,0', () => {
    const todos = [
      ...['EST-2.2', 'EST-3.2', 'EST-4.2', 'EST-4.3', 'EST-5.1', 'EST-5.2'],
      ...['DIN-1.1', 'DIN-3.1', 'DIN-3.2', 'DIN-4.1', 'DIN-4.2', 'DIN-5.1', 'DIN-5.2'],
      ...['DOC-1.1', 'DOC-2.1', 'DOC-3.1', 'DOC-3.2', 'DOC-4.1', 'DOC-5.1'],
      ...['FAB-1.1', 'FAB-2.2', 'FAB-3.2', 'FAB-4.1', 'FAB-5.1'],
      ...['GES-2.2', 'GES-3.2', 'GES-4.1', 'GES-4.2', 'GES-5.1', 'GES-5.2'],
      ...['CON-5.1', 'CON-5.2'],
    ]
    const r = run(
      [
        validation(),
        org({ lastApprovedUserId: 'u2' }),
        evidence('season.configured', { label: '2027', milestones: 5 }, days(1)),
        evidence('template.generated', { projectId: 'p1' }, days(1)),
        knowledge({
          decisions: 40,
          guides: 12,
          guidesByKind: { guia: 10, trilha: 1, checklist: 1 },
          guideTags: ['solda'],
          oldestGuideUpdatedAt: days(20).toISOString(),
        }),
        evidence('decision.created', { area: 'estrutura' }, days(5)),
        evidence('decision.created', { area: 'dinamica' }, days(5)),
        evidence('decision.created', { area: 'gestao' }, days(5)),
        evidence('trail.completed', { userId: 'u2' }, days(4)),
        evidence('kit.completed', { kitId: 'k1' }, days(9)),
      ],
      todos,
    )
    expect(r.average).toBe(5)
    for (const a of r.areas) {
      expect(a.level, `${a.area}: ${a.pending.map((p) => p.id).join(', ')}`).toBe(5)
      expect(a.pending).toEqual([])
    }
  })
})

describe('resultado do cálculo', () => {
  it('carrega a versão do catálogo (base do delta de recomputação)', () => {
    expect(run([]).catalogVersion).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it('resultado de competição não muda nível (maturidade ≠ resultado, ADR-010)', () => {
    const semResultado = run([validation()], ['EST-2.2', 'EST-3.2'])
    const comResultado = run(
      [validation(), evidence('competition.result', { position: 3, total: 42 }, days(2))],
      ['EST-2.2', 'EST-3.2'],
    )
    expect(comResultado.levels).toEqual(semResultado.levels)
  })

  it('é determinístico: mesma entrada, mesmo resultado', () => {
    const ev = [validation(), org(), knowledge({ decisions: 4 })]
    expect(JSON.stringify(run(ev, ['EST-2.2']))).toBe(JSON.stringify(run(ev, ['EST-2.2'])))
  })
})
