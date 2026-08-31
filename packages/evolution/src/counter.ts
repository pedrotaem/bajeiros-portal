import { AUTO_CHECKS } from './checks'
import type { Facts } from './facts'
import type { ActivityFloor, CounterCheckResult, CounterKind } from './types'

/**
 * DF-20 — aferição: a declaração vale até o dado dizer o contrário.
 *
 * TRÊS MECANISMOS, em ordem de força da inferência (§2), e a ordem importa porque
 * misturá-los num único "reprovado" faria o portal afirmar o que ele não sabe:
 *
 *  1. **contradição direta** — o portal mede o MESMO fato que o critério afirma e o
 *     valor é incompatível. Derruba na hora, e não admite reafirmação (RF-3.2):
 *     o caminho é consertar o dado.
 *  2. **indício quantitativo** — o portal mede algo correlacionado, forte para
 *     justificar uma pergunta e fraco para justificar um veredito. Suspende e PEDE
 *     JUSTIFICATIVA; reafirmar com nota devolve ao cálculo (RF-3.3).
 *  3. **piso de atividade** — sem rastro nenhum de operação, um aviso único de
 *     equipe, nunca vinte contraprovas individuais (§2.3).
 *
 * REGRA QUE PRECEDE AS TRÊS (§2.0): **ausência de dado não é contraprova.** Projeto
 * sem gaiola modelada, ficha vazia, guia mantido fora do portal — nada disso
 * contradiz uma declaração; a declaração fica vigente e a tela diz que não há como
 * conferir aqui. A única exceção é o critério cujo enunciado AFIRMA a existência do
 * dado (EST-1.1, GES-1.1, GES-3.1): aí a ausência contradiz o que foi declarado.
 *
 * Sem esta regra a aferição transformaria "não usei esta ferramenta" em "menti",
 * que é o oposto do que a feature existe para fazer.
 */

/** §2.2 — 50% acima da mediana é o limiar proposto; não medido contra o acervo (§8.2). */
export const MASS_INDICATION_RATIO = 1.5

/** Piso de protótipos na mediana de massa (P-1.3, mesmo piso do DF-13 RF-7.2). */
export const MASS_FLOOR = 8

/** §2.3 — as duas condições JUNTAS: só uma seria injusta com equipe pequena/em recesso. */
export const ACTIVITY_FLOOR_DAYS = 90

/** GES-2.2 — indício de rotina de reunião: janela mais curta que a do piso. */
export const MEETING_INDICATION_DAYS = 60

export const NOT_COMPARABLE = {
  validator: 'sem como conferir aqui — o projeto não está modelado no validador',
  knowledge: 'sem como conferir aqui — a equipe ainda não publicou nada em Conhecimento',
  org: 'sem como conferir aqui — o organograma não foi montado no portal',
  template: 'sem como conferir aqui — a equipe declarou gabarito gerado fora do portal',
  mass: 'sem como conferir aqui — não há protótipos comparáveis suficientes no acervo',
} as const

/** O que a contraprova precisa saber sobre a declaração (fora dos fatos de evidência). */
export interface CounterContext {
  /** DF-19 §5.4 — FAB-2.1: gabarito externo entra como link na declaração. */
  hasLink: boolean
}

interface CounterSpec {
  kind: CounterKind
  /**
   * §2.0 — `null` quando o dado existe e dá para comparar; string quando não dá, e
   * a string é o que a tela mostra no lugar da acusação.
   */
  notComparable: (f: Facts, ctx: CounterContext) => string | null
  fire: (f: Facts, ctx: CounterContext) => { message: string; measured: string } | null
}

const hasValidation = (f: Facts) => (f.hasValidation ? null : NOT_COMPARABLE.validator)
const hasKnowledge = (f: Facts) => (f.hasKnowledge ? null : NOT_COMPARABLE.knowledge)
const hasOrg = (f: Facts) => (f.hasOrg ? null : NOT_COMPARABLE.org)
const always = () => null

/**
 * Contradição derivada da própria medida: o check `auto` diz "não" e o critério foi
 * declarado. O `measured` é a razão canônica do check — é o número que a equipe
 * confere para saber se a acusação procede (P-1.1).
 */
function fromMeasure(criterionId: string, message: string) {
  return (f: Facts) => {
    const check = AUTO_CHECKS[criterionId]?.(f)
    if (!check || check.satisfied) return null
    return { message, measured: check.reason }
  }
}

/** Onda V1 (§4): 18 contradições + 1 indício. Nenhuma exige ferramenta nova. */
export const COUNTER_CHECKS: Record<string, CounterSpec> = {
  // ---- o critério AFIRMA que o dado existe: a ausência contradiz (§2.0, exceção)
  'EST-1.1': {
    kind: 'contradiction',
    notComparable: always,
    fire: fromMeasure(
      'EST-1.1',
      'O projeto da temporada não tem versão salva nem ficha com conteúdo no portal.',
    ),
  },
  'GES-1.1': {
    kind: 'contradiction',
    notComparable: always,
    fire: fromMeasure(
      'GES-1.1',
      'O organograma não está montado no portal, ou a capitania é irregular.',
    ),
  },
  'GES-3.1': {
    kind: 'contradiction',
    notComparable: always,
    fire: fromMeasure('GES-3.1', 'A temporada configurada no portal está sem marcos datados.'),
  },

  // ---- validador: só disparam quando existe versão salva de gaiola (§4, precondição)
  'EST-2.1': {
    kind: 'contradiction',
    notComparable: hasValidation,
    fire: fromMeasure('EST-2.1', 'A última versão salva tem pendências de presença.'),
  },
  'EST-3.1': {
    kind: 'contradiction',
    notComparable: hasValidation,
    fire: fromMeasure('EST-3.1', 'A última versão salva tem infração automática.'),
  },
  'DIN-2.1': {
    kind: 'contradiction',
    notComparable: hasValidation,
    fire: fromMeasure('DIN-2.1', 'Há ancoragem de suspensão sem apoio na última versão salva.'),
  },
  'DIN-2.2': {
    kind: 'contradiction',
    notComparable: hasValidation,
    fire: fromMeasure('DIN-2.2', 'A ancoragem da direção está sem apoio na última versão salva.'),
  },
  'FAB-2.1': {
    kind: 'contradiction',
    // duas saídas: sem gaiola no portal, e a do gabarito externo (DF-19 §5.4)
    notComparable: (f, ctx) =>
      ctx.hasLink ? NOT_COMPARABLE.template : f.hasValidation ? null : NOT_COMPARABLE.validator,
    fire: fromMeasure('FAB-2.1', 'Nenhum gabarito foi gerado para o projeto da temporada.'),
  },

  // ---- organograma
  'DIN-1.1': {
    kind: 'contradiction',
    notComparable: hasOrg,
    fire: (f) =>
      f.dynamicsLeadVacant
        ? {
            message: 'Os papéis de suspensão/direção ou de trem de força estão sem ocupante.',
            measured: `sem ocupante: ${f.unfilledLeads.join(', ')}`,
          }
        : null,
  },
  'GES-2.1': {
    kind: 'contradiction',
    notComparable: hasOrg,
    fire: fromMeasure('GES-2.1', 'Há cargo de liderança vago no organograma.'),
  },

  // ---- conhecimento: o contador do próprio critério não bate
  'FAB-3.1': {
    kind: 'contradiction',
    notComparable: hasKnowledge,
    fire: fromMeasure('FAB-3.1', 'Não há guia publicado com a etiqueta de solda.'),
  },
  'CON-1.1': {
    kind: 'contradiction',
    notComparable: hasKnowledge,
    fire: fromMeasure('CON-1.1', 'O diário da equipe não tem nenhuma decisão registrada.'),
  },
  'CON-2.1': {
    kind: 'contradiction',
    notComparable: hasKnowledge,
    fire: fromMeasure('CON-2.1', 'Os contadores de decisões e guias não batem com o critério.'),
  },
  'CON-2.2': {
    kind: 'contradiction',
    notComparable: hasKnowledge,
    fire: fromMeasure('CON-2.2', 'Não há guia do tipo trilha publicado.'),
  },
  'CON-3.1': {
    kind: 'contradiction',
    notComparable: hasKnowledge,
    fire: fromMeasure('CON-3.1', 'O último novato aprovado não marcou a trilha como concluída.'),
  },
  'CON-3.2': {
    kind: 'contradiction',
    notComparable: hasKnowledge,
    fire: fromMeasure('CON-3.2', 'O diário não cobre três áreas distintas nos últimos seis meses.'),
  },
  'CON-4.1': {
    kind: 'contradiction',
    notComparable: hasKnowledge,
    fire: fromMeasure('CON-4.1', 'Não há kit de passagem concluído, ou há kit vencido em aberto.'),
  },
  'CON-4.2': {
    kind: 'contradiction',
    notComparable: hasKnowledge,
    fire: fromMeasure('CON-4.2', 'Há guia sem dono ou parado há mais de seis meses.'),
  },

  // ---- indício (§2.2): pergunta, nunca veredito
  'GES-2.2': {
    kind: 'indication',
    notComparable: always,
    fire: (f) =>
      f.daysSinceEvidence !== null && f.daysSinceEvidence >= MEETING_INDICATION_DAYS
        ? {
            message:
              `Não há nenhum rastro de atividade da equipe no portal há ${f.daysSinceEvidence} ` +
              'dias — a rotina de reunião combinada segue acontecendo?',
            measured: `última evidência há ${f.daysSinceEvidence} dias`,
          }
        : null,
  },

  /*
   * Onda V2 do `DIN-3.x` (§4). A questão aberta §8.1 — "comparar massa entre projetos
   * incomparáveis" — foi RESOLVIDA pelo DF-21 §5.1: a ficha marca ocupantes e tração
   * como campos comparáveis, e a mediana só cruza protótipos da mesma classe. Sem
   * classe declarada, ou com menos de 8 protótipos na classe, não há comparação e a
   * contraprova simplesmente não existe (P-1.3/P-1.4).
   *
   * A honestidade da inferência é REQUISITO, não ressalva (§2.2): massa alta não
   * prova dinâmica ruim — potência, relação de transmissão e pneu entram na conta e o
   * portal não os conhece. Por isso o texto é pergunta e o mecanismo não derruba.
   */
  'DIN-3.1': massIndication('a geometria de suspensão foi calculada com esta massa?'),
  'DIN-3.2': massIndication('o setup de transmissão foi calculado com esta massa?'),
}

function massIndication(question: string): CounterSpec {
  const notComparable = (f: Facts) => {
    const co = f.community
    if (f.validationMassKg === null) return NOT_COMPARABLE.validator
    if (!co || !co.classLabel || co.massMedianKg === null || co.massProjects < MASS_FLOOR) {
      return NOT_COMPARABLE.mass
    }
    return null
  }
  return {
    kind: 'indication',
    notComparable,
    fire: (f) => {
      if (notComparable(f)) return null
      const mass = f.validationMassKg as number
      const median = f.community?.massMedianKg as number
      if (mass <= median * MASS_INDICATION_RATIO) return null
      const pct = Math.round((mass / median - 1) * 100)
      return {
        message: `A massa da gaiola está ${pct}% acima da mediana da classe — ${question}`,
        measured: `${fmt(mass)} kg contra mediana de ${fmt(median)} kg em ${f.community?.massProjects} protótipos`,
      }
    },
  }
}

function fmt(v: number): string {
  return (Math.round(v * 10) / 10).toFixed(1).replace('.', ',')
}

export interface CounterStatus {
  result: CounterCheckResult | null
  /** §2.0 — há contraprova desenhada, mas o dado para compará-la não existe. */
  notComparable: string | null
}

const NOTHING: CounterStatus = { result: null, notComparable: null }

export function counterStatusFor(
  criterionId: string,
  f: Facts,
  ctx: CounterContext,
): CounterStatus {
  const spec = COUNTER_CHECKS[criterionId]
  if (!spec) return NOTHING
  const blocked = spec.notComparable(f, ctx)
  if (blocked) return { result: null, notComparable: blocked }
  const hit = spec.fire(f, ctx)
  return hit ? { result: { kind: spec.kind, ...hit }, notComparable: null } : NOTHING
}

/**
 * §2.3 — piso de atividade: avaliado ANTES das contraprovas individuais e, quando
 * dispara, as demais nem são avaliadas. Um aviso, não vinte (RF-1.3).
 */
export function activityFloorOf(f: Facts): ActivityFloor | null {
  const quiet = f.daysSinceEvidence === null || f.daysSinceEvidence >= ACTIVITY_FLOOR_DAYS
  if (!quiet || f.hasOrg) return null
  return {
    message:
      'A equipe não tem organograma no portal nem nenhum registro de atividade nos últimos ' +
      `${ACTIVITY_FLOOR_DAYS} dias. As declarações ficam suspensas até haver lastro — comece ` +
      'pelo caminho mínimo.',
    measured:
      f.daysSinceEvidence === null
        ? 'nenhuma evidência registrada'
        : `última evidência há ${f.daysSinceEvidence} dias, sem organograma`,
  }
}

/** DF-20 RF-3.2 — contradição direta não admite reafirmação: o caminho é consertar. */
export function isReaffirmable(result: CounterCheckResult | null): boolean {
  return result?.kind === 'indication'
}
