# Contratos de dados (ODCS)

Contratos no formato **ODCS — Open Data Contract Standard v3** (Bitol / Linux Foundation), 1 arquivo por data product: `<nome>.odcs.yaml`.

## Convenções (revisão v2: C2, C6, C14)

- **Fonte de verdade das entidades**: schema físico (migrações) e DTOs da API são conferidos contra os contratos em revisão de PR — **sem codegen** (decisão C6).
- Toda propriedade com `classification: pii` DEVE ter `customProperties` com:
  - `legalBasis` — base legal LGPD daquele dado (`contrato-art7-V`, `obrigacao-legal`, `consentimento`, `legitimo-interesse`);
  - `retention` — regra de retenção.
- Conta/prestação do serviço usa **execução de contrato (art. 7º, V)** como base legal — consentimento apenas p/ finalidades opcionais (C2).
- **Semver por contrato**: breaking change = major + migração escrita no mesmo PR.
- Validação em CI: `npm run contracts:check` (estrutura + convenção PII). Evolução registrada: datacontract-cli quando o suporte ODCS estiver maduro no nosso fluxo.

## Contratos

| Arquivo                   | Data product                                       | PII     |
| ------------------------- | -------------------------------------------------- | ------- |
| `user.odcs.yaml`          | conta e perfil                                     | sim     |
| `consent.odcs.yaml`       | registros de consentimento (finalidades opcionais) | sim     |
| `team.odcs.yaml`          | equipes e membros                                  | parcial |
| `project.odcs.yaml`       | projeto (carro)                                    | não     |
| `cage-snapshot.odcs.yaml` | versões imutáveis da gaiola                        | não     |
| `subscription.odcs.yaml`  | assinatura/plano (referência Stripe, nunca cartão) | parcial |
| `audit-event.odcs.yaml`   | trilha de auditoria                                | sim     |
