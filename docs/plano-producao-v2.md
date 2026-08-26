# Plano v2: Bajeiros — de site estático a produto SaaS

**Data:** 2026-08-22 · **Versão:** 2.0 (rascunho para revisão)
**Supersede:** `plano-producao.md` (v1) — a fundação v1 (fases 0–9) **permanece válida e já executada no repo**; este documento a estende para a visão de produto.

## 1. Visão de produto

- **Usuário-alvo:** estudante de engenharia; pode pertencer a uma **equipe** de universidade.
- **Equipes:** recursos compartilhados, trabalho colaborativo sobre os mesmos projetos.
- **Projeto = carro:** contém uma gaiola (+ futuros recursos: suspensão, ergonomia…). Usuário/equipe tem **N projetos**.
- **Monetização:** features gratuitas (validador atual) + features por **plano pago**.
- **Dados pessoais:** cadastro → LGPD (consentimento, direitos do titular, minimização).
- **Dados:** contratos de dados **ODCS** (Open Data Contract Standard, Bitol/Linux Foundation) como fonte de verdade das entidades.

Consequência: frontend + **backend + banco + identidade + billing**. O plano muda de "publicar site" para "operar plataforma".

## 2. Arquitetura alvo

```
Browser (SPA React) ── CloudFront ──► S3 (frontend estático)      [já existe, v1]
        │
        └── /api ── CloudFront ──► API Gateway (HTTP API) ──► Lambda (Node/TS)
                                        │
                                        ├─► Aurora Serverless v2 (PostgreSQL) — RLS por tenant
                                        ├─► Cognito (User Pool) — identidade/OIDC
                                        ├─► S3 (assets de projeto: exports, gabaritos)
                                        └─► EventBridge/SQS (webhooks billing, e-mails, jobs)
```

**Decisão A2.1 — backend serverless AWS-native** (API Gateway + Lambda TS + Aurora Serverless v2 Postgres):

- Coerente com a stack declarada (GitHub/Actions/AWS) e com a fundação já construída (Terraform, OIDC, contas).
- Custo proporcional ao uso (começa ~US$ 0 + Aurora min ACU); sem servidor para patchear.
- _Alternativa considerada:_ Supabase (auth+Postgres+RLS prontos, velocity maior p/ dev solo; porém segunda plataforma fora do IaC/OIDC AWS, lock-in próprio). **Personas: opinar.**

**Decisão A2.2 — Postgres relacional** (não DynamoDB): domínio é relacional (user↔team↔project↔snapshot↔plan), RLS nativa p/ multi-tenancy, SQL p/ direitos LGPD (export/erasure), migrações versionadas.

**Decisão A2.3 — Cognito p/ identidade**: e-mail+senha e social login, MFA opcional, tokens OIDC validados no API GW (JWT authorizer). Customização de UI limitada — aceita; telas próprias via SDK.

**Decisão A2.4 — Billing: Stripe** — **decidido pelo product owner (ADR-004)**: conta Stripe já existente; modelo = Pix por usuário/mês em valor simbólico. Atenção: Pix recorrente exige `send_invoice` por ciclo ou Pix Automático (verificar suporte Stripe BR na fase 15). Nunca tocar dado de cartão (SAQ-A).

**Decisão A2.5 — Monorepo npm workspaces:**

```
apps/web        ← SPA atual (move de src/)
apps/api        ← Lambda handlers + domínio de plataforma
packages/core   ← motor de regras B6 + modelos (compartilhado web/api)
contracts/      ← contratos ODCS (YAML)
infra/          ← Terraform (já existe; ganha módulos api/db/auth)
docs/
```

Motor de regras roda no browser (grátis, offline) E no backend (validação server-side p/ features pagas/equipe) — mesma lib.

## 3. Dados: ODCS como contrato

### 3.1 Princípios

- 1 contrato por **data product** em `contracts/*.odcs.yaml`, ODCS v3.x, `apiVersion` explícito.
- Contrato = schema lógico + **classificação por propriedade**: `pii`, **`legalBasis`** (base legal LGPD daquele dado: contrato art. 7º V, obrigação legal, consentimento…), retenção + qualidade (checks) + SLA + ownership.
- **Semver por contrato**; breaking change = major + migração escrita antes do merge. PR que altera contrato exige alteração correspondente de migração/DTO — verificado em CI.
- CI: validação de sintaxe/lint dos contratos + teste de aderência do schema físico (datacontract-cli ou script próprio contra Postgres de teste).

### 3.2 Data products iniciais

| Contrato        | Conteúdo                                                               | PII     | Retenção                                |
| --------------- | ---------------------------------------------------------------------- | ------- | --------------------------------------- |
| `user`          | conta, perfil (nome, e-mail, universidade)                             | sim     | conta ativa + 30d pós-exclusão (backup) |
| `consent`       | registros de consentimento: versão do termo, timestamp, IP, finalidade | sim     | 5 anos (prova de conformidade)          |
| `team`          | equipe, universidade, membros+papéis                                   | parcial | vida da equipe                          |
| `project`       | carro: metadados, ownership (user ou team)                             | não     | vida do projeto                         |
| `cage_snapshot` | versão imutável da gaiola (JSON atual do editor) + resultado do motor  | não     | N versões por plano                     |
| `subscription`  | plano, status, referência Stripe (nunca dados de cartão)               | parcial | fiscal: 5 anos                          |
| `audit_event`   | quem fez o quê (acesso/alteração de dado pessoal incluído)             | sim     | 1 ano                                   |

### 3.3 Multi-tenancy

- `team_id`/`owner_id` em toda tabela de recurso; **RLS no Postgres** como segunda linha (além do filtro na aplicação): role da aplicação **sem `BYPASSRLS`**, tenant corrente via **`SET LOCAL` por transação**. Teste automatizado de isolamento entre tenants no CI — **gate do M1** (isolamento entre usuários), não só do M2.

## 4. Fases (estendem as fases 0–9 da v1)

### Fase 10 — Fundações de plataforma (pré-código)

| #    | Passo                | Detalhe                                                                                                                                                                                                          |
| ---- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 10.1 | Contas AWS separadas | **Antes do primeiro apply** (nada foi provisionado ainda; distribuição CloudFront não migra entre contas): AWS Organizations, contas `staging` e `prod` (+ `management`). A stack v1 já nasce nas contas certas. |
| 10.2 | Monorepo             | Reestruturar repo p/ workspaces (A2.5) **antes** do backend nascer; CI passa a rodar por workspace (path filters).                                                                                               |
| 10.3 | Threat model         | STRIDE da arquitetura alvo (auth, API, billing webhooks, colaboração). Documento vivo em `docs/threat-model.md`; revisão a cada feature de superfície nova.                                                      |
| 10.4 | Contratos ODCS v1    | Escrever os 7 contratos da §3.2 ANTES do schema físico; revisar com foco em minimização de dados (coletar só o necessário).                                                                                      |
| 10.5 | ADRs                 | `docs/adr/` — registrar A2.1–A2.5 como ADRs formais com alternativas e consequências.                                                                                                                            |
| 10.6 | Programa LGPD mínimo | Política de privacidade + termos de uso (revisão jurídica humana), registro de operações (art. 37), definição de controlador/encarregado, DPIA leve. **Bloqueante p/ abrir cadastro.**                           |

### Fase 11 — Backend + banco

> **Status 2026-08-24:** em execução — PR A (driver Data API, runner de migração, bundle esbuild, fail-fast) MERGEADO; PR B (Terraform módulo `api` + `/api/*` no CloudFront + deploy.yml) implementado. 11.2: runner custom via Data API (node-pg-migrate não fala Data API — adendo ADR-007). 11.4: integração via embedded-postgres (não testcontainers) + `rls.test.ts` desde a fase 12. 11.5: CORS dispensado (same-origin `/api/*`); WAF adiado = pendência bloqueante M1.

| #    | Passo            | Detalhe                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 11.1 | Infra            | Módulos Terraform: Aurora Serverless v2 (Postgres, **scale-to-zero 0 ACU**, TLS, secret no Secrets Manager c/ rotação), acesso via **RDS Data API** (Lambda fora de VPC: sem NAT ~US$ 32/mês, sem RDS Proxy, IAM auth) — _verificar suporte engine/região no momento do apply_; fallback documentado: Lambda em VPC + VPC endpoints. API GW HTTP API, Lambdas Node 24 TS (esbuild bundle), rota `/api/*` no CloudFront existente c/ **cache policy `CachingDisabled` + origin request policy repassando `Authorization` e NÃO repassando `Host`**. |
| 11.2 | Migrações        | Ferramenta de migração SQL versionada (ex.: drizzle-kit/node-pg-migrate) rodando via pipeline; nunca schema manual.                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 11.3 | API              | REST JSON versionada (`/api/v1`), validação de entrada (zod) **mantida manualmente e conferida contra os contratos ODCS em revisão de PR — sem codegen** (C6), erros RFC 9457.                                                                                                                                                                                                                                                                                                                                                                     |
| 11.4 | Testes           | Unit (vitest) + integração com Postgres efêmero (testcontainers) no CI; teste de isolamento RLS.                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 11.5 | Segurança de API | Rate limiting/throttling no API GW, tamanho máx de payload, CORS restrito ao domínio, logs estruturados sem PII.                                                                                                                                                                                                                                                                                                                                                                                                                                   |

### Fase 12 — Identidade + consentimento

| #    | Passo               | Detalhe                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 12.1 | Cognito             | User Pool: e-mail verificado, política de senha forte, MFA opcional (TOTP), tokens curtos + refresh. Proteção contra credential stuffing = **tier Plus** (pricing nov/2024) — **iniciar no Essentials**, subir p/ Plus no gate M3 (dissenso D3 registrado).                                                                                                                                                                     |
| 12.2 | Fluxo de cadastro   | Coleta mínima (e-mail, nome, universidade opcional). **Base legal correta:** conta/prestação do serviço = **execução de contrato (art. 7º, V)** — não consentimento; consentimento granular e registrado (termo versionado, evidência em `consent`) **só p/ finalidades opcionais** (marketing, analytics). Menor de idade: exigir 18+ na v1 (art. 14 exige consentimento parental p/ menores) — **decidido; reavaliar no M2**. |
| 12.3 | Direitos do titular | Endpoints/fluxos: exportar meus dados (JSON), excluir conta (soft delete + purge em 30d, cascata em projetos pessoais), revogar consentimento. SLA interno: 15 dias.                                                                                                                                                                                                                                                            |
| 12.4 | Sessão no SPA       | OIDC code flow + PKCE; tokens em memória + refresh silencioso (não localStorage).                                                                                                                                                                                                                                                                                                                                               |

### Fase 13 — Projetos múltiplos

| #    | Passo                    | Detalhe                                                                                                                                              |
| ---- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 13.1 | CRUD projetos            | Projeto (carro) c/ nome, descrição; gaiola do editor vira `cage_snapshot` versionado (save explícito). Free: limite (ex.: 2 projetos, 10 snapshots). |
| 13.2 | Migração do modo anônimo | Editor continua funcionando sem login (localStorage + export JSON, como hoje); ao logar, oferece importar. Grátis-sem-cadastro = porta de entrada.   |
| 13.3 | Autosave/conflito        | v1: save explícito + detecção de conflito otimista (version no snapshot). Colaboração em tempo real NÃO é meta (ver 14.3).                           |

### Fase 14 — Equipes

| #    | Passo                    | Detalhe                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 14.1 | Modelo                   | Team, papéis: `owner`, `admin`, `member` (RBAC simples). Convite por e-mail com token expirável e **resposta idêntica exista ou não a conta (sem enumeração de e-mail)**. Projeto pode pertencer a team → todos os membros acessam.                                                                                                                                                                                                   |
| 14.2 | Autorização              | Camada única de policy no backend (`can(user, action, resource)`) + RLS. Testes de autorização por papel no CI.                                                                                                                                                                                                                                                                                                                       |
| 14.3 | Colaboração              | v1 = assíncrona (snapshots + histórico + "quem salvou"). Tempo real (CRDT/websocket) = fase futura explícita, não agora.                                                                                                                                                                                                                                                                                                              |
| 14.4 | Gestão de equipe (DF-10) | Entrada na equipe passa por **confirmação da capitania** (1 capitã/capitão + até 2 co-capitães); **organograma** customizável com responsabilidades por função; gestão vira **página inteira**. O papel de acesso segue o de 14.1 — a função organizacional é outra dimensão (`team_positions`), e os nós de capitania mostram quem tem o papel. Spec: [`specs/drafts/df10-gestao-equipe.md`](../specs/drafts/df10-gestao-equipe.md). |

### Fase 15 — Planos pagos

| #    | Passo        | Detalhe                                                                                                                                                                                                                                                   |
| ---- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 15.1 | Entitlements | Tabela de capacidades por plano (`max_projects`, `max_team_members`, `advanced_reports`…). Checagem SEMPRE no backend; UI apenas reflete.                                                                                                                 |
| 15.2 | Stripe       | Checkout hospedado + customer portal (cancelamento self-service). Webhook: **endpoint fora do JWT authorizer** (auth = assinatura do evento), tolerância de replay ≤ 5 min no timestamp, **dedupe persistido por `event.id`**, idempotência nos handlers. |
| 15.3 | Fiscal BR    | Emissão de NF de serviço: resolver via contador/ferramenta (fora do escopo técnico, **bloqueante comercial**).                                                                                                                                            |
| 15.4 | Degradação   | Downgrade/inadimplência: nunca apagar dados — recursos excedentes ficam read-only.                                                                                                                                                                        |

### Fase 16 — Segurança de plataforma (reforço sobre v1)

| #    | Passo      | Detalhe                                                                                                                                                                                              |
| ---- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 16.1 | WAF        | **Deixa de ser adiado**: AWS WAF no CloudFront (managed rules: Core, KnownBadInputs, IP reputation, rate-based) quando API/auth entrarem no ar.                                                      |
| 16.2 | Secrets    | Secrets Manager + rotação; zero secrets em env de Lambda em claro no state (usar referência).                                                                                                        |
| 16.3 | Backups/DR | Aurora PITR (35d) + snapshot diário cross-region; teste de restore trimestral documentado no runbook. **RPO 1h** (PITR entrega ~5 min) / RTO 4h (alvos iniciais).                                    |
| 16.4 | Pentest    | Teste de intrusão externo (ou no mínimo ZAP baseline no CI + revisão ASVS L1) **antes** de abrir pagamento.                                                                                          |
| 16.5 | Incidentes | Plano de resposta: detecção, contenção, comunicação ANPD/titulares em incidente com dado pessoal relevante — **prazo normativo: 3 dias úteis (Resolução CD/ANPD nº 15/2024)**, não "prazo razoável". |

### Fase 17 — Observabilidade de plataforma

| #    | Passo                | Detalhe                                                                                                                                |
| ---- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 17.1 | Logs/métricas/traces | CloudWatch Logs estruturado (JSON, correlação request-id), métricas de negócio (signups, saves, conversão), X-Ray ou OTel nas Lambdas. |
| 17.2 | Erros de frontend    | Sentry (ou similar) agora justificado — com consentimento e scrubbing de PII.                                                          |
| 17.3 | Alertas              | 5xx API, latência p95, DLQ não vazia, falha de webhook billing, custo.                                                                 |

### Fase 18 — Rollout incremental

| #    | Marco                        | Gate                                                                                                                                              |
| ---- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 18.1 | M0                           | Validador estático no ar conforme plano v1. **Ainda não está no ar** — nenhum apply executado; provisionar já dentro das contas separadas (10.1). |
| 18.2 | M1: contas + projetos salvos | LGPD mínimo (10.6) pronto; pentest não exigido; beta fechado c/ equipes convidadas.                                                               |
| 18.3 | M2: equipes                  | Testes de autorização/isolamento verdes; beta ampliado.                                                                                           |
| 18.4 | M3: pagamentos               | 15.3 fiscal resolvido + 16.4 pentest + termos revisados.                                                                                          |
| 18.5 | Cada marco                   | Sobe primeiro em staging → validação → prod com gate manual (pipeline v1 estendido por app).                                                      |

## 5. Riscos & decisões-chave (para as personas)

1. **A2.1 Serverless AWS-native vs Supabase** — velocity solo vs coerência de stack/IaC.
2. **A2.3 Cognito** — UX/DX fracos vs integração nativa; alternativa: Auth0 (custo), Supabase Auth.
3. **A2.4 Stripe vs player BR** (Pix nativo, NF, taxas).
4. ~~Custo mínimo Aurora~~ **Resolvido (C5):** Aurora Serverless v2 suporta **scale-to-zero (0 ACU) desde nov/2024**; retomada ~15 s no primeiro request. Custo idle ≈ storage — viável p/ beta pequeno.
5. **Monorepo agora** (reestruturação antes de qualquer feature) vs repo separado p/ api.
6. ~~ODCS profundidade~~ **Resolvido (C6):** documentação viva + classificação PII/base legal + lint e verificação de drift no CI (datacontract-cli); **sem codegen** de DTOs.
7. ~~18+ na v1~~ **Resolvido (C8):** 18+ na v1 (art. 14 LGPD — consentimento parental p/ menores é complexidade indevida agora); reavaliar no M2.
8. **Colaboração assíncrona (não realtime) na v1** — expectativa de usuário vs custo/complexidade CRDT.
9. ~~VPC p/ Lambda+Aurora~~ **Resolvido (C4):** RDS Data API como padrão (Lambda sem VPC, sem NAT, IAM auth); fallback Lambda-em-VPC + endpoints documentado; verificar engine/região no apply.
10. ~~Tudo em us-east-1~~ **Resolvido (ADR-008):** camada de dados/API em **sa-east-1** (voto de minerva da Segurança — residência LGPD elimina obrigação de transferência internacional; latência BR ~5–30 ms vs ~140 ms); CloudFront/ACM continuam us-east-1; condição: verificar Data API + 0 ACU em sa-east-1 na fase 11.
