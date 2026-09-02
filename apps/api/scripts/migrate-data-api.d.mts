// Tipos das funções puras do runner (importadas pelo vitest em src/test).
// O runner é .mjs; sem este arquivo o TS não enxerga export nenhum — e, pior, ele
// enxerga SÓ o que estiver declarado aqui: export novo no .mjs sem linha aqui vira
// "has no exported member" mesmo existindo em runtime.
export declare function extractUpSection(sql: string): string
export declare function splitSqlStatements(sql: string): string[]

/** Orçamento de espera pelo resume do Aurora a 0 ACU, em ms. */
export declare const RESUME_BUDGET_MS_DEFAULT: number
export declare function resumeDelay(attempt: number): number
export declare function isResuming(err: unknown): boolean
export declare function withResumeRetry<T>(
  fn: () => Promise<T>,
  opts?: {
    budgetMs?: number
    now?: () => number
    sleep?: (ms: number) => Promise<void>
    log?: (msg: string) => void
    warn?: (msg: string) => void
  },
): Promise<T>
