# Threat Model — Bajeiros (documento vivo)

**Método:** STRIDE por componente. **Revisão obrigatória** a cada feature que cria superfície nova (gate de PR nas fases 11+). Última revisão: 2026-08-24 (fase 11 — API na AWS: STRIDE da API preenchido).

## Ativos

1. Dados pessoais de estudantes (e-mail, nome, universidade, IP) — LGPD.
2. Projetos/gaiolas das equipes (propriedade intelectual dos usuários).
3. Credenciais e sessões (Cognito), referências de billing.
4. Integridade do pipeline (supply chain) e da infra (contas AWS).

## Componentes e fronteiras de confiança

```
[Browser/SPA] --TLS--> [CloudFront] --> [S3 estático]
                          └--/api--> [API GW +JWT] --> [Lambda] --IAM--> [Aurora via Data API]
[Stripe] --webhook assinado--> [Lambda webhook (sem JWT)]
[GitHub Actions] --OIDC--> [IAM roles deploy]
```

## STRIDE por componente

### SPA / CloudFront

| Ameaça          | Exemplo                      | Mitigação                                                                 | Status                    |
| --------------- | ---------------------------- | ------------------------------------------------------------------------- | ------------------------- |
| Spoofing        | phishing de domínio parecido | HSTS; monitorar registros similares                                       | pendente                  |
| Tampering       | XSS injetando script         | CSP enforce; sem `dangerouslySetInnerHTML`; frameworks escapam por padrão | parcial (CSP report-only) |
| Info disclosure | tokens em localStorage       | tokens em memória + refresh silencioso (12.4)                             | implementado (2026-08-24) |

### API (API GW + Lambda)

| Ameaça          | Exemplo                               | Mitigação                                                                                                                                                                                      | Status                                              |
| --------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Spoofing        | token forjado/reuso                   | ID token RS256 validado na app: JWKS + iss + aud + token_use=id + email_verified, validade 1h (sem authorizer no API GW — nota ADR-001/003); `assertAuthEnv`/`assertProdEnv` no cold start     | implementado (2026-08-24)                           |
| Tampering       | IDOR: acessar projeto de outro tenant | policy layer `can()` + RLS (`SET LOCAL` por transação nos DOIS drivers pg/data-api; runtime com role sem BYPASSRLS — secret do app, nunca o master); teste de isolamento no CI (`rls.test.ts`) | implementado (2026-08-24)                           |
| Repudiation     | disputa sobre ação                    | `audit_events` append-only (GRANT só SELECT/INSERT)                                                                                                                                            | implementado                                        |
| Info disclosure | enumeração de e-mail em convite       | resposta idêntica exista ou não conta (C9)                                                                                                                                                     | implementado (fase 14)                              |
| DoS             | flood na API                          | throttling API GW (rate 20/burst 50) + timeout 28s; WAF rate-based (16.1)                                                                                                                      | parcial — **WAF = pendência BLOQUEANTE do gate M1** |
| Elevation       | member → admin                        | papéis validados no backend (`policy.ts` + testes teams/admin); revisão 14.2                                                                                                                   | parcial                                             |
| Info disclosure | vazamento via secret/IAM              | Lambda lê SÓ o secret do app (GetSecretValue restrito); master restrito à deploy role (migração)                                                                                               | implementado (2026-08-24)                           |

### Billing (webhooks)

| Ameaça    | Exemplo                    | Mitigação                                                | Status    |
| --------- | -------------------------- | -------------------------------------------------------- | --------- |
| Spoofing  | webhook forjado            | verificação de assinatura; endpoint fora do authorizer   | planejado |
| Replay    | evento reenviado           | tolerância ≤5 min + dedupe persistido por event.id (C10) | planejado |
| Tampering | upgrade de plano sem pagar | entitlements SEMPRE no backend (15.1)                    | planejado |

### Supply chain / pipeline

| Ameaça          | Exemplo                   | Mitigação                                       | Status |
| --------------- | ------------------------- | ----------------------------------------------- | ------ |
| Tampering       | dependência npm maliciosa | `npm ci --ignore-scripts`, Dependabot, lockfile | ativo  |
| Tampering       | action comprometida       | pin por SHA                                     | ativo  |
| Info disclosure | segredo commitado         | gitleaks (pré-commit + CI)                      | ativo  |
| Elevation       | credencial CI onipotente  | OIDC por environment, roles least-privilege     | ativo  |

### Dados (Aurora / S3)

| Ameaça          | Exemplo                         | Mitigação                                                                                                                              | Status               |
| --------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| Info disclosure | dump do banco                   | Data API sobre TLS/IAM, SG sem NENHUM ingress (zero caminho de rede), encryption at rest, contas separadas; rotação de secret pendente | parcial (2026-08-24) |
| Tampering       | alteração de snapshot histórico | snapshots append-only (GRANT sem UPDATE/DELETE)                                                                                        | implementado         |
| DoS/perda       | deleção acidental/ransomware    | backup 7d (stg)/35d (prod) + deletion_protection prod; snapshot cross-region + restore testado (16.3)                                  | parcial              |

## Incidente com dado pessoal

Comunicação ANPD/titulares: **3 dias úteis** (Resolução CD/ANPD nº 15/2024). Plano completo na fase 16.5.
