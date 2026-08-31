import { AREA_IDS, AREA_SHORT } from './areas'
import type {
  AreaId,
  AreaLevel,
  CompetitionInput,
  RankBlock,
  RankDef,
  RankInput,
  RankNumber,
  RankResult,
  RankStep,
} from './types'

/**
 * DF-18 — patentes do protótipo: a maturidade vira emblema.
 *
 * A patente NÃO é métrica nova (RF-1.3). É leitura do que o motor do DF-13 já
 * calcula, mais uma coisa que o modelo não tinha: validação por resultado de
 * competição oficial. Some o modelo de maturidade e a patente some junto — é o que
 * garante que ela não pode ser farmada por fora.
 *
 * A unidade avaliada é o PROTÓTIPO DA TEMPORADA (§3.1), não a equipe: sem projeto
 * designado não há patente, e a tela mostra um passo só ("designe o protótipo") em
 * vez de seis barras penalizadas.
 *
 * AS DUAS TRAVAS (§3.4). A patente é a MAIOR cujas duas travas estão cumpridas —
 * cumulativa, como os níveis das áreas:
 *  - **maturidade**: média das 6 áreas E **piso** (menor nível entre elas). O piso é
 *    o que impede a patente torta: sem ele a equipe sobe só salvando versões da
 *    gaiola — a área que sobe com menos esforço — e ignora Conhecimento, que é
 *    justamente onde mora o problema nº 1 da pesquisa (rotatividade);
 *  - **competição**: da patente 4 para cima exige resultado oficial do acervo do
 *    DF-15, e sem vínculo aprovado o teto é 5.
 *
 * Os limiares são PRIMEIRA CALIBRAÇÃO (§11.1), não medida — e por isso são dados de
 * catálogo versionado (RF-1.2), nunca constantes espalhadas no fluxo.
 */

export const MAX_RANK = 8 as const

/**
 * §3.3 — a escada, do menos maduro para o mais maduro. A grafia é a da arte:
 * **PEACEMAKER**, não "Piecemaker".
 *
 * `nomeLivre` é a reserva livre de marca (RF-8.3): a cláusula NC da arte vale
 * enquanto o portal for gratuito, e o marco M3 prevê assinaturas. Trocar a pele é
 * trocar uma coluna desta tabela — a escada é o produto, os nomes são pele.
 */
export const RANKS: readonly RankDef[] = [
  {
    n: 1,
    id: 'interceptor',
    nome: 'The Interceptor',
    nomeLivre: 'Ponta de Lança',
    leitura: 'Pódio ou 10% superior, com as seis áreas fortes ao mesmo tempo.',
    mediaMin: 4.5,
    pisoMin: 4,
    competicao: 'podio',
    emblema: 'patente-1-interceptor.gif',
  },
  {
    n: 2,
    id: 'buggy-9',
    nome: 'Buggy #9',
    nomeLivre: 'Gaiola 9',
    leitura: 'Nada além do necessário. Pontua acima da mediana da coorte — virou referência.',
    mediaMin: 4.0,
    pisoMin: 3,
    competicao: 'mediana',
    emblema: 'patente-2-buggy-9.gif',
  },
  {
    n: 3,
    id: 'plymouth-rock',
    nome: 'Plymouth Rock',
    nomeLivre: 'Brasa',
    leitura:
      'Aguentou o pior: terminou o enduro com pontuação. Divisa entre "competiu" e "compete".',
    mediaMin: 3.5,
    pisoMin: 3,
    competicao: 'enduro',
    emblema: 'patente-3-plymouth-rock.gif',
  },
  {
    n: 4,
    id: 'nux-car',
    nome: 'The Nux Car',
    nomeLivre: 'Ligeiro',
    leitura: 'Leve, feito para correr — e correu. O ciclo fechou, do regulamento à inspeção.',
    mediaMin: 3.0,
    pisoMin: 2,
    competicao: 'participou',
    emblema: 'patente-4-nux-car.gif',
  },
  {
    n: 5,
    id: 'elvis',
    nome: 'Elvis',
    nomeLivre: 'Marreta',
    leitura: 'Rústico, mas cada sistema tem função e dono. Teto de quem ainda não competiu.',
    mediaMin: 2.5,
    pisoMin: 2,
    competicao: null,
    emblema: 'patente-5-elvis.gif',
  },
  {
    n: 6,
    id: 'gigahorse',
    nome: 'The Gigahorse',
    nomeLivre: 'Colosso',
    leitura:
      'Potência mal aproveitada: há ferramenta e cerimônia, falta disciplina que converta em resultado.',
    mediaMin: 1.8,
    pisoMin: 1,
    competicao: null,
    emblema: 'patente-6-gigahorse.gif',
  },
  {
    n: 7,
    id: 'peacemaker',
    nome: 'The Peacemaker',
    nomeLivre: 'Aríete',
    leitura: 'O carro existe e é pesado demais para o que precisa fazer. Bruto, superdimensionado.',
    mediaMin: 1.0,
    pisoMin: 1,
    competicao: null,
    emblema: 'patente-7-peacemaker.gif',
  },
  {
    n: 8,
    id: 'motorats',
    nome: 'Motorats',
    nomeLivre: 'Enxame',
    leitura:
      'Sem carro e com pouco registro — mas com gente e vontade. Ponto de partida, não castigo.',
    mediaMin: 0,
    pisoMin: 0,
    competicao: null,
    emblema: 'patente-8-motorats.gif',
  },
]

const BY_N = new Map(RANKS.map((r) => [r.n, r]))

export function rankDef(n: RankNumber): RankDef {
  return BY_N.get(n) as RankDef
}

/** §3.5 — a queda é amortecida por 30 dias; a subida é imediata. */
export const RANK_GRACE_DAYS = 30

/** §3.4 — piso de coorte do benchmark: abaixo disso a régua é a geral (RF-3.4). */
export const RANK_COHORT_FLOOR = 8

/** §3.4 — "participação nas últimas 2 temporadas" (RF-3.2: temporada, não data). */
export const PARTICIPATION_SEASONS = 2

/** §3.4 — pódio da patente 1: top 3 OU 10% superior da geral. */
export const TOP_FRACTION = 0.1

/** RF-1.4 — strings de UI canônicas: a tela IMPORTA daqui, nunca reescreve. */
export const RANK_BLOCK_LABELS: Record<RankBlock, string> = {
  'sem-avaliacao': 'a avaliação de maturidade ainda não foi ativada pela capitania',
  'sem-prototipo': 'a equipe ainda não designou o protótipo da temporada',
  'sem-vinculo': 'vincular a equipe ao registro do Brasil (Comunidade)',
  'prova-ausente': 'a edição mais recente não teve prova de enduro no rol de provas',
  maturidade: 'faltam critérios de maturidade',
  competicao: 'falta resultado em competição oficial',
}

export const COMPETITION_LABELS: Record<NonNullable<RankDef['competicao']>, string> = {
  participou: 'ao menos 1 participação nas últimas 2 temporadas',
  enduro: 'enduro concluído com pontuação na participação mais recente',
  mediana: 'pontuação total igual ou acima da mediana da coorte',
  podio: 'pódio (top 3) ou 10% superior da geral',
}

interface LockResult {
  ok: boolean
  /** Preenchido quando falha: o motivo canônico que a tela converte em passo. */
  block: RankBlock | null
  /** Texto do que falta, com o número medido quando existe. */
  text: string
}

const PASS: LockResult = { ok: true, block: null, text: '' }

function average(levels: Record<AreaId, AreaLevel>): number {
  const sum = AREA_IDS.reduce((acc, a) => acc + (levels[a] ?? 0), 0)
  return Math.round((sum / AREA_IDS.length) * 10) / 10
}

function floorOf(levels: Record<AreaId, AreaLevel>): AreaLevel {
  return AREA_IDS.reduce<AreaLevel>((min, a) => {
    const v = levels[a] ?? 0
    return v < min ? v : min
  }, 5 as AreaLevel)
}

/** Trava 1: média E piso. O piso é o que impede a patente torta (§3.4). */
function maturityLock(
  def: RankDef,
  levels: Record<AreaId, AreaLevel>,
): { ok: boolean; steps: RankStep[] } {
  const avg = average(levels)
  const steps: RankStep[] = []
  if (avg < def.mediaMin) {
    steps.push({
      kind: 'maturidade',
      text: `subir a média de ${fmt(avg)} para ${fmt(def.mediaMin)}`,
    })
  }
  for (const area of AREA_IDS) {
    const lvl = levels[area] ?? 0
    if (lvl < def.pisoMin) {
      steps.push({
        kind: 'maturidade',
        text: `levar ${AREA_SHORT[area]} do nível ${lvl} ao ${def.pisoMin}`,
      })
    }
  }
  return { ok: steps.length === 0, steps }
}

/**
 * Trava 2 (RF-3.x). Sem vínculo aprovado ao registro canônico do DF-15 ela é falsa
 * da patente 4 para cima e o teto é 5 — efeito colateral desejado: passar de 5 exige
 * o claim que o DF-15 não tinha como estimular.
 */
function competitionLock(def: RankDef, comp: CompetitionInput): LockResult {
  if (!def.competicao) return PASS
  if (!comp.linked) {
    return { ok: false, block: 'sem-vinculo', text: RANK_BLOCK_LABELS['sem-vinculo'] }
  }

  switch (def.competicao) {
    case 'participou': {
      // RF-3.2 — a régua é a TEMPORADA, não a data: um ano sem competir não derruba.
      const ref = comp.currentSeason
      const recent =
        ref === null
          ? comp.seasons.length > 0
          : comp.seasons.some((s) => s > ref - PARTICIPATION_SEASONS)
      return recent
        ? PASS
        : {
            ok: false,
            block: 'competicao',
            text: COMPETITION_LABELS.participou,
          }
    }
    case 'enduro': {
      // RF-3.3 — o rol de provas varia por edição: prova ausente devolve motivo
      // próprio, nunca um falso negativo silencioso.
      if (!comp.enduroPresent) {
        return { ok: false, block: 'prova-ausente', text: RANK_BLOCK_LABELS['prova-ausente'] }
      }
      return (comp.enduroPoints ?? 0) > 0
        ? PASS
        : { ok: false, block: 'competicao', text: COMPETITION_LABELS.enduro }
    }
    case 'mediana': {
      if (comp.median === null || comp.pointsTotal === null) {
        return { ok: false, block: 'competicao', text: COMPETITION_LABELS.mediana }
      }
      const regua = comp.medianSource === 'coorte' ? 'da coorte' : 'geral da competição'
      return comp.pointsTotal >= comp.median
        ? PASS
        : {
            ok: false,
            block: 'competicao',
            text: `alcançar a mediana ${regua}: ${fmt(comp.pointsTotal)} de ${fmt(comp.median)} pontos`,
          }
    }
    case 'podio': {
      const pos = comp.position
      if (pos === null) {
        return { ok: false, block: 'competicao', text: COMPETITION_LABELS.podio }
      }
      const cut = comp.fieldSize ? Math.max(3, Math.ceil(comp.fieldSize * TOP_FRACTION)) : 3
      return pos <= cut
        ? PASS
        : {
            ok: false,
            block: 'competicao',
            text: `terminar entre os ${cut} primeiros da geral (hoje: ${pos}º)`,
          }
    }
  }
}

/** Do degrau mais baixo (8) ao mais alto (1) — a ordem em que a escada se sobe. */
const LADDER: readonly RankDef[] = [...RANKS].reverse()

/**
 * A patente vigente: a MAIOR cujas duas travas estão cumpridas, **cumulativa** como
 * os níveis das áreas (§3.4). Sobe-se degrau a degrau e para-se no primeiro que não
 * passa — não existe pular a trava do enduro por ter subido no pódio, do mesmo jeito
 * que não existe fechar o nível 4 de uma área com o 2 aberto.
 *
 * Ninguém que ativou fica sem patente: 8 é ponto de partida, não castigo (§3.3).
 */
export function computeRank(input: RankInput): RankResult {
  const { optIn, seasonProjectId, levels, competition } = input
  const avg = average(levels)
  const piso = floorOf(levels)

  if (!optIn) {
    return { rank: null, reason: 'sem-avaliacao', average: avg, floor: piso, next: null }
  }
  if (!seasonProjectId) {
    return { rank: null, reason: 'sem-prototipo', average: avg, floor: piso, next: null }
  }

  let rank: RankNumber = MAX_RANK
  for (const def of LADDER) {
    if (!maturityLock(def, levels).ok) break
    if (!competitionLock(def, competition).ok) break
    rank = def.n
  }

  return { rank, reason: null, average: avg, floor: piso, next: nextOf(rank, input) }
}

/** RF-1.5 — a próxima patente e o que a destrava, separando as duas travas. */
export function nextOf(rank: RankNumber, input: RankInput): RankResult['next'] {
  if (rank === 1) return null
  const def = rankDef((rank - 1) as RankNumber)
  const mat = maturityLock(def, input.levels)
  const comp = competitionLock(def, input.competition)
  return {
    n: def.n,
    maturity: mat.steps,
    competition: comp.ok ? null : { kind: 'competicao', text: comp.text },
    block: comp.block ?? (mat.ok ? 'competicao' : 'maturidade'),
  }
}

export function nextRank(result: RankResult, input: RankInput): RankResult['next'] {
  return result.rank === null ? null : nextOf(result.rank, input)
}

/** "2,2" — mesma régua de exibição da média das áreas (DF-13 §3.2). */
function fmt(v: number): string {
  return (Math.round(v * 10) / 10).toFixed(1).replace('.', ',')
}

/**
 * §7 — "a mediana da sua coorte é _The Peacemaker_": a faixa da coorte em emblema,
 * ao lado da própria patente.
 *
 * Usa SÓ a trava de maturidade e para no teto de quem não competiu (patente 5),
 * porque o benchmark do DF-13 devolve a mediana das MÉDIAS, e não os resultados de
 * competição das outras equipes — que, aliás, o produto não pode cruzar por equipe
 * (RF-6.3/RF-7.3). Chamar isto de "patente da coorte" sem o recorte seria inventar
 * um número que ninguém mediu.
 */
export function medianRankOf(average: number): RankNumber {
  let rank: RankNumber = MAX_RANK
  for (const def of LADDER) {
    if (def.competicao) break
    if (average < def.mediaMin) break
    rank = def.n
  }
  return rank
}

export function isRankNumber(v: unknown): v is RankNumber {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= MAX_RANK
}

/** §3.5 — a queda só é efetiva depois da carência; consertar antes nunca desceu. */
export function graceExpired(brokenSince: Date, now: Date): boolean {
  return now.getTime() - brokenSince.getTime() >= RANK_GRACE_DAYS * 24 * 60 * 60 * 1000
}
