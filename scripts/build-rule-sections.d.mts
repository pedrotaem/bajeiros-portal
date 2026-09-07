// Tipos das funções puras do gerador do mapa regra ↔ seção (DF-34 §5.4),
// importadas pelo vitest em apps/web.
export declare function sectionOf(ruleId: string): string
export declare function parseRules(markdown: string): Map<string, string>
export declare function render(mapa: Map<string, string>): string
