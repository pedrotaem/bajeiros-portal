# ADR-006: ODCS — escopo de uso

**Status:** aceito (2026-08-22, C6 da revisão v2)

## Contexto

Requisito do produto: trabalhar dados com ODCS (Open Data Contract Standard, Bitol/LF). Risco apontado pelas personas: transformar contratos em plataforma completa de data contracts é overkill p/ o estágio.

## Decisão

ODCS como **documentação viva + gate de CI**:

1. 1 contrato por data product em `contracts/*.odcs.yaml` (ODCS v3), semver.
2. Classificação por propriedade: `pii`, `legalBasis` (LGPD), `retention` — validadas por `npm run contracts:check`.
3. Schema físico (migrações) e DTOs (zod) conferidos contra os contratos em **revisão de PR** — **sem codegen**.
4. Breaking change = major + migração no mesmo PR.

## Consequências

- Contrato responde "que dado existe, por quê, com que base legal, até quando" — insumo direto p/ registro de operações (LGPD art. 37) e direitos do titular.
- Verificação de drift automatizada (datacontract-cli contra Postgres de teste) fica como evolução.
