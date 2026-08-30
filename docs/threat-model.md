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

| Ameaça          | Exemplo                                | Mitigação                                                                                                                                                                                      | Status                                              |
| --------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Spoofing        | token forjado/reuso                    | ID token RS256 validado na app: JWKS + iss + aud + token_use=id + email_verified, validade 1h (sem authorizer no API GW — nota ADR-001/003); `assertAuthEnv`/`assertProdEnv` no cold start     | implementado (2026-08-24)                           |
| Tampering       | IDOR: acessar projeto de outro tenant  | policy layer `can()` + RLS (`SET LOCAL` por transação nos DOIS drivers pg/data-api; runtime com role sem BYPASSRLS — secret do app, nunca o master); teste de isolamento no CI (`rls.test.ts`) | implementado (2026-08-24)                           |
| Repudiation     | disputa sobre ação                     | `audit_events` append-only (GRANT só SELECT/INSERT)                                                                                                                                            | implementado                                        |
| Info disclosure | enumeração de e-mail em convite        | resposta idêntica exista ou não conta (C9)                                                                                                                                                     | implementado (fase 14)                              |
| DoS             | flood na API                           | throttling API GW (rate 20/burst 50) + timeout 28s; WAF rate-based (16.1)                                                                                                                      | parcial — **WAF = pendência BLOQUEANTE do gate M1** |
| Elevation       | member → admin                         | papéis validados no backend (`policy.ts` + testes teams/admin); revisão 14.2                                                                                                                   | parcial                                             |
| Info disclosure | vazamento via secret/IAM               | Lambda lê SÓ o secret do app (GetSecretValue restrito); master restrito à deploy role (migração)                                                                                               | implementado (2026-08-24)                           |
| Elevation       | tomada de conta pela vinculação Google | vincula só com `email_verified=true` no Google **E** no usuário local, 1 match exato, alvo `CONFIRMED` e não-federado; IAM com 3 ações no ARN do pool; log de decisão sem PII                  | **risco residual aceito** — ver nota abaixo (DF-17) |

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

## Risco residual aceito — vinculação automática Google (DF-17)

**Decisão do product owner (2026-08-30).** A trigger `PreSignUp_ExternalProvider`
(`apps/api/src/idp/pre-sign-up.ts`) vincula automaticamente a identidade Google a uma conta
local quando o e-mail bate. A AWS desaconselha a prática: igualdade de e-mail, sozinha, não
prova que é a mesma pessoa.

**Por que foi aceita:** o pool já usa `recovery_mechanism = verified_email`. Quem controla a
caixa postal já toma a conta hoje pelo "esqueci minha senha" — a vinculação se apoia na mesma
âncora de confiança e **não abre caminho de ataque novo**. Se a recuperação de conta um dia
ficar mais forte (ex.: MFA obrigatório no reset), a vinculação automática precisa ser
reavaliada junto, senão vira o elo mais fraco.

**Continua exposto, conscientemente:** (a) conta Google comprometida = acesso ao portal;
(b) e-mail institucional reciclado pela universidade vincula ao novo dono do endereço. Ambos
já valem para a recuperação de senha.

**Reversão:** `google_enabled = false` no Terraform, 1 apply. Nada no banco depende da
vinculação, então não há migração para desfazer. Detalhe e alternativas em
[specs/drafts/df17-login-google.md](../specs/drafts/df17-login-google.md) §3.3 e §8.1.

## Incidente com dado pessoal

Comunicação ANPD/titulares: **3 dias úteis** (Resolução CD/ANPD nº 15/2024). Plano completo na fase 16.5.
