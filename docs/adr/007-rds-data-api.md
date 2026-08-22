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
