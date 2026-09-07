// Tipos das funções puras do gerador do índice do regulamento (DF-34 §5.2),
// importadas pelo vitest em apps/web.
export declare function depthOf(id: string): number
export declare function ehTitulo(title: string | undefined): boolean
export declare function editionOf(corpusVersion: string): string
export declare function buildIndice(manifest: unknown, opts?: { generatedAt?: string }): unknown
export declare function validarIndice(indice: unknown): void
export declare function serializar(indice: unknown): string
export declare function listarEdicoes(dir: string): string[]
