# Threat Model — Bajeiros (documento vivo)

**Método:** STRIDE por componente. **Revisão obrigatória** a cada feature que cria superfície nova (gate de PR nas fases 11+). Última revisão: 2026-08-22 (esqueleto — C16 da revisão v2).

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

## STRIDE por componente (esqueleto — preencher na fase 11)

### SPA / CloudFront

| Ameaça          | Exemplo                      | Mitigação                                                                 | Status                    |
| --------------- | ---------------------------- | ------------------------------------------------------------------------- | ------------------------- |
| Spoofing        | phishing de domínio parecido | HSTS; monitorar registros similares                                       | pendente                  |
| Tampering       | XSS injetando script         | CSP enforce; sem `dangerouslySetInnerHTML`; frameworks escapam por padrão | parcial (CSP report-only) |
| Info disclosure | tokens em localStorage       | tokens em memória + refresh silencioso (12.4)                             | planejado                 |

### API (API GW + Lambda)

| Ameaça          | Exemplo                               | Mitigação                                                                                         | Status    |
| --------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------- | --------- |
| Spoofing        | token forjado/reuso                   | JWT authorizer (iss/aud/exp), tokens curtos                                                       | planejado |
| Tampering       | IDOR: acessar projeto de outro tenant | policy layer `can()` + RLS (`SET LOCAL`, role sem BYPASSRLS); teste de isolamento no CI (gate M1) | planejado |
| Repudiation     | disputa sobre ação                    | `audit_event` append-only                                                                         | planejado |
| Info disclosure | enumeração de e-mail em convite       | resposta idêntica exista ou não conta (C9)                                                        | planejado |
| DoS             | flood na API                          | throttling API GW + WAF rate-based (16.1)                                                         | planejado |
| Elevation       | member → admin                        | testes de autorização por papel no CI (14.2)                                                      | planejado |

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

| Ameaça          | Exemplo                         | Mitigação                                                    | Status    |
| --------------- | ------------------------------- | ------------------------------------------------------------ | --------- |
| Info disclosure | dump do banco                   | TLS, encryption at rest, secret c/ rotação, contas separadas | planejado |
| Tampering       | alteração de snapshot histórico | snapshots append-only                                        | planejado |
| DoS/perda       | deleção acidental/ransomware    | PITR 35d + snapshot cross-region; restore testado (16.3)     | planejado |

## Incidente com dado pessoal

Comunicação ANPD/titulares: **3 dias úteis** (Resolução CD/ANPD nº 15/2024). Plano completo na fase 16.5.
