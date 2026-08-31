import { describe, expect, it } from 'vitest'
import { AREA_IDS } from './areas'
import {
  MAX_RANK,
  RANKS,
  RANK_GRACE_DAYS,
  computeRank,
  graceExpired,
  nextRank,
  rankDef,
} from './ranks'
import type { AreaId, AreaLevel, CompetitionInput, RankInput } from './types'

// DF-18 — AC-DF18.1: fixtures de níveis + participações → patente esperada nas 8
// faixas, incluindo bordas de média e de piso.

const NOW = new Date('2027-03-01T12:00:00Z')

/** Níveis iguais nas 6 áreas — o caso "reto", sem patente torta. */
const flat = (n: AreaLevel): Record<AreaId, AreaLevel> =>
  Object.fromEntries(AREA_IDS.map((a) => [a, n])) as Record<AreaId, AreaLevel>

const levels = (over: Partial<Record<AreaId, AreaLevel>>, base: AreaLevel = 5) => ({
  ...flat(base),
  ...over,
})

const NO_COMPETITION: CompetitionInput = {
  linked: false,
  seasons: [],
  currentSeason: null,
  enduroPoints: null,
  enduroPresent: false,
  pointsTotal: null,
  median: null,
  medianSource: null,
  medianTeams: 0,
  position: null,
  fieldSize: null,
}

const competed = (over: Partial<CompetitionInput> = {}): CompetitionInput => ({
  ...NO_COMPETITION,
  linked: true,
  seasons: [2026, 2027],
  currentSeason: 2027,
  enduroPoints: 180,
  enduroPresent: true,
  pointsTotal: 640,
  median: 500,
  medianSource: 'coorte',
  medianTeams: 12,
  position: 2,
  fieldSize: 40,
  ...over,
})

const input = (over: Partial<RankInput> = {}): RankInput => ({
  optIn: true,
  seasonProjectId: 'p1',
  levels: flat(0),
  competition: NO_COMPETITION,
  ...over,
})

const rankOf = (over: Partial<RankInput> = {}) => computeRank(input(over)).rank

describe('a escada', () => {
  it('tem 8 patentes, da 1 (mais madura) à 8, sem buraco', () => {
    expect(RANKS.map((r) => r.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(MAX_RANK).toBe(8)
  })

  it('a arte grafa PEACEMAKER, e todo degrau tem nome livre de marca (RF-8.3)', () => {
    expect(rankDef(7).nome).toBe('The Peacemaker')
    for (const r of RANKS) {
      expect(r.nomeLivre, r.id).toBeTruthy()
      expect(r.nomeLivre, r.id).not.toBe(r.nome)
      expect(r.emblema, r.id).toMatch(/^patente-\d-[a-z0-9-]+\.gif$/)
    }
  })

  it('os limiares só sobem à medida que a patente melhora (escada monótona)', () => {
    for (let i = 1; i < RANKS.length; i++) {
      expect(RANKS[i - 1].mediaMin).toBeGreaterThanOrEqual(RANKS[i].mediaMin)
      expect(RANKS[i - 1].pisoMin).toBeGreaterThanOrEqual(RANKS[i].pisoMin)
    }
  })
})

describe('AC-DF18.1 — as 8 faixas', () => {
  it('sem maturidade nenhuma, a patente é 8 (ponto de partida, não castigo)', () => {
    expect(rankOf()).toBe(8)
  })

  it('a trava de maturidade abre cada degrau até o teto de quem não competiu', () => {
    expect(rankOf({ levels: flat(1) })).toBe(7)
    expect(rankOf({ levels: flat(2) })).toBe(6) // média 2,0 < 2,5 do Elvis
    expect(rankOf({ levels: flat(3) })).toBe(5) // 5 é o teto sem competição
    expect(rankOf({ levels: flat(5) })).toBe(5)
  })

  it('borda de média: 1,8 fecha o Gigahorse, 1,5 não', () => {
    // 5 áreas em 2 e uma em 1 → média 1,8 · piso 1
    expect(rankOf({ levels: levels({ conhecimento: 1 }, 2) })).toBe(6)
    // 3 áreas em 2 e 3 em 1 → média 1,5 · piso 1: passa a 7, para antes da 6
    expect(rankOf({ levels: levels({ conhecimento: 1, documentacao: 1, fabricacao: 1 }, 2) })).toBe(
      7,
    )
    // piso 0 segura tudo, mesmo com média acima do limiar da 7
    expect(rankOf({ levels: levels({ conhecimento: 1, documentacao: 0 }, 2) })).toBe(8)
  })

  it('AC-DF18.6 — piso: média 3,2 com uma área em 1 não passa da patente 6', () => {
    // 5 áreas em 4 e uma em 1 → média 3,5 · piso 1 → só o Gigahorse (piso 1) passa
    const r = computeRank(input({ levels: levels({ conhecimento: 1 }, 4) }))
    expect(r.average).toBe(3.5)
    expect(r.floor).toBe(1)
    expect(r.rank).toBe(6)
  })

  it('as travas de competição abrem as patentes 4 a 1, na ordem', () => {
    const maduro = flat(5)
    expect(rankOf({ levels: maduro, competition: competed({ position: 30 }) })).toBe(2)
    expect(rankOf({ levels: maduro, competition: competed() })).toBe(1)
  })

  it('participação só nas últimas 2 temporadas destrava a patente 4 (RF-3.2)', () => {
    const velho = competed({ seasons: [2023], currentSeason: 2027 })
    expect(rankOf({ levels: flat(5), competition: velho })).toBe(5)
    const recente = competed({ seasons: [2026], currentSeason: 2027, enduroPoints: 0 })
    expect(rankOf({ levels: flat(5), competition: recente })).toBe(4)
  })

  it('RF-3.3 — prova de enduro ausente na edição bloqueia a 3 com motivo próprio', () => {
    const semProva = competed({ enduroPresent: false, enduroPoints: null })
    const r = computeRank(input({ levels: flat(5), competition: semProva }))
    expect(r.rank).toBe(4)
    expect(r.next?.block).toBe('prova-ausente')
    expect(r.next?.competition?.text).toMatch(/rol de provas/)
  })

  it('mediana da coorte é a régua da patente 2, e a tela sabe qual régua foi usada', () => {
    const abaixo = competed({ pointsTotal: 400, median: 500, medianSource: 'geral' })
    const r = computeRank(input({ levels: flat(5), competition: abaixo }))
    expect(r.rank).toBe(3)
    expect(r.next?.competition?.text).toMatch(/mediana geral da competição/)
  })

  it('pódio da patente 1 aceita top 3 OU 10% superior da geral', () => {
    const top10 = competed({ position: 9, fieldSize: 90 })
    expect(rankOf({ levels: flat(5), competition: top10 })).toBe(1)
    const fora = competed({ position: 10, fieldSize: 90 })
    expect(rankOf({ levels: flat(5), competition: fora })).toBe(2)
  })
})

describe('opt-in e protótipo da temporada', () => {
  it('AC-DF18.2 — sem opt-in não há patente', () => {
    const r = computeRank(input({ optIn: false, levels: flat(5) }))
    expect(r.rank).toBeNull()
    expect(r.reason).toBe('sem-avaliacao')
  })

  it('§3.1 — sem protótipo da temporada não há unidade avaliada', () => {
    const r = computeRank(input({ seasonProjectId: null, levels: flat(5) }))
    expect(r.rank).toBeNull()
    expect(r.reason).toBe('sem-prototipo')
  })
})

describe('AC-DF18.7 — sem vínculo, o teto é 5', () => {
  it('média 4,8 sem vínculo aprovado para na patente 5, e o motivo é `sem-vinculo`', () => {
    const r = computeRank(input({ levels: levels({ conhecimento: 4 }, 5) }))
    expect(r.average).toBe(4.8)
    expect(r.rank).toBe(5)
    expect(r.next?.n).toBe(4)
    expect(r.next?.block).toBe('sem-vinculo')
    expect(r.next?.competition?.text).toMatch(/vincular a equipe/)
  })
})

describe('RF-1.5 — o que falta para a próxima', () => {
  it('separa "falta maturidade" de "falta competição"', () => {
    const r = computeRank(input({ levels: flat(1), competition: competed() }))
    expect(r.rank).toBe(7)
    expect(r.next?.n).toBe(6)
    expect(r.next?.block).toBe('maturidade')
    expect(r.next?.maturity.map((s) => s.text)).toEqual(['subir a média de 1,0 para 1,8'])
    expect(r.next?.competition).toBeNull()
  })

  it('nomeia a área que está segurando o piso', () => {
    const r = computeRank(input({ levels: levels({ conhecimento: 1 }, 4) }))
    expect(r.next?.maturity.map((s) => s.text)).toContain('levar Conhecimento do nível 1 ao 2')
  })

  it('na patente 1 não há próxima', () => {
    const r = computeRank(input({ levels: flat(5), competition: competed() }))
    expect(r.rank).toBe(1)
    expect(r.next).toBeNull()
    expect(nextRank(r, input({ levels: flat(5), competition: competed() }))).toBeNull()
  })
})

describe('§3.5 — carência de 30 dias na queda', () => {
  it('a trava rompida hoje não derruba; no 31º dia, sim', () => {
    const rompeu = new Date(NOW.getTime() - 20 * 86_400_000)
    expect(graceExpired(rompeu, NOW)).toBe(false)
    const antigo = new Date(NOW.getTime() - (RANK_GRACE_DAYS + 1) * 86_400_000)
    expect(graceExpired(antigo, NOW)).toBe(true)
  })
})
