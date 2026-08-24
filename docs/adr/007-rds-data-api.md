# ADR-007: RDS Data API (Lambda fora de VPC)

**Status:** aceito (2026-08-22, C4 da revisão v2) — verificar suporte engine/região no apply

## Contexto

Aurora em subnet privada exigiria Lambda em VPC: NAT Gateway ~US$ 32/mês, RDS Proxy p/ pooling, cold start maior.

## Decisão

Acesso ao Aurora via **RDS Data API**: Lambda fora de VPC, chamadas HTTPS autenticadas por IAM, sem gestão de pool de conexões.

## Fallback documentado

Se limites da Data API (payload, transações longas, indisponibilidade na região escolhida) bloquearem: Lambda em VPC + VPC endpoints (Secrets Manager, etc.) + RDS Proxy.

## Consequências

- Sem NAT/Proxy → custo fixo ≈ 0.
- Transações via API (`BeginTransaction`/`CommitTransaction`) — biblioteca de acesso deve encapsular (inclusive `SET LOCAL` do RLS dentro da transação).
- Limites de payload (~1 MB response) — snapshots grandes devem ser paginados/comprimidos.

## Adendo (2026-08-24, fase 11 — achados da implementação)

A exploração confirmou que Data API é a opção "pesada" no código (decisão mantida pelo usuário ciente do esforço). O driver (`apps/api/src/db/data-api.ts`) absorve tudo para os call sites não mudarem:

- **Serialização por transação**: a Data API não aceita statements concorrentes na mesma transação — o driver enfileira internamente; `Promise.all` nos call sites (export, gate do assistente) roda em série sem alteração.
- **Placeholders**: `$N` → `:pN` com tokenizer ciente de strings/comentários/dollar-quoting.
- **typeHints**: uuid (senão `uuid = varchar` falha), JSON (jsonb), TIMESTAMP (Date). Colunas text que recebem uuid usam `::text` explícito no SQL (`audit.resource_id`); jsonb usa `::jsonb` explícito p/ determinismo nos 2 drivers.
- **Volta**: mapeada por `columnMetadata.typeName` (timestamptz→`Date`, jsonb→objeto) — contratos da API inalterados.
- **1 MB de response**: listas com `cage_json` paginadas na mesma transação (`fetchAllPaged`).
- **Resume 0 ACU (~15s)**: retry com backoff no `DatabaseResumingException` (timeout da Lambda 28s cobre).
- **Migrações**: node-pg-migrate não fala Data API → runner próprio (`scripts/migrate-data-api.mjs`) com splitter ciente de dollar-quoting, tabela `pgmigrations` compatível, secret MASTER p/ DDL + realinha a senha do role `bajeiros_app` ao secret do APP (runtime roda com o role sem BYPASSRLS → RLS viva).
- **Latência**: cada statement é uma chamada HTTPS (access-log soma ~4/request). Aceito; follow-up: consolidar/async.
