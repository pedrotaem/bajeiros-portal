// Tipos das funções puras do gerador de tokens (importadas pelo vitest em apps/web).
export declare const SOURCE: string
export declare const TARGET: string
export declare function loadTokens(): Promise<Record<string, Record<string, string>>>
export declare function buildCss(tokens: unknown): string
