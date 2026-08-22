# ADR-002: PostgreSQL relacional (Aurora Serverless v2)

**Status:** aceito (2026-08-22)

## Contexto

Domínio é relacional: user ↔ team ↔ project ↔ snapshot ↔ subscription. LGPD exige export/erasure confiáveis por titular.

## Decisão

Aurora Serverless v2 (Postgres) com **scale-to-zero (0 ACU, GA nov/2024; retomada ~15 s)**. RLS como segunda linha de isolamento multi-tenant (role sem `BYPASSRLS`, `SET LOCAL` por transação). Migrações SQL versionadas via pipeline.

## Alternativas

- **DynamoDB**: modelagem single-table prematura p/ domínio em evolução; SQL facilita direitos LGPD.
- **RDS t4g.micro**: mais barato em uso constante, mas sem scale-to-zero; beta tem tráfego esparso.

## Consequências

- Custo idle ≈ storage.
- Teste de isolamento entre tenants no CI é gate do M1.
