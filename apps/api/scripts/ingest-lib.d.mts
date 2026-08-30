// Tipos das funções puras da ingestão (importadas pelo vitest em src/test).

export interface PlanTeam {
  key: string
  displayName: string
  university: string | null
  city: string | null
  uf: string | null
  region: string | null
  links: { kind: string; url: string }[]
}

export interface PlanResult {
  teamKey: string
  displayName: string
  university: string | null
  uf: string | null
  carNumber: number | null
  position: number | null
  pointsTotal: number | null
  points: Record<string, unknown>
  sourceUrl: string | null
}

export interface PlanCompetition {
  key: string
  season: number
  kind: string
  region: string | null
  name: string
  location: string | null
  sourceUrl: string | null
  results: PlanResult[]
  ambiguous: { key: string; count: number }[]
}

export interface IngestPlan {
  competitions: PlanCompetition[]
  teams: PlanTeam[]
  counts: { competitions: number; teams: number; results: number; ambiguous: number }
}

export declare const PII_FIELDS: string[]
export declare function isPiiKey(key: string): boolean
export declare function stripPii<T>(value: T): T
export declare function displayName(competition: Record<string, unknown>): string
export declare function competitionKey(competition: Record<string, unknown>): string
export declare function teamKey(name: unknown): string
export declare function normalizeEvents(pontuacoes: unknown): {
  points: Record<string, number>
  source: Record<string, string>
}
export declare function toResult(
  row: Record<string, unknown>,
  competition: Record<string, unknown>,
): PlanResult | null
export declare function toCompetition(competition: Record<string, unknown>): PlanCompetition
export declare function toCommunityTeam(team: Record<string, unknown>): PlanTeam
export declare function buildPlan(resultsDoc: unknown, teamsDoc: unknown): IngestPlan
