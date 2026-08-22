# Revisão do Plano v2 — 3 Personas

**Data:** 2026-08-22 · **Documento revisado:** `plano-producao-v2.md` (v2.0)
**Personas:** Arquiteto de Software Sênior (ARQ), Especialista DevOps/Infra (DEV), Especialista em Cibersegurança c/ competência LGPD (SEC) — todas 10+ anos.

## Sumário executivo

O plano v2 está **estruturalmente correto**: a leitura de que a visão (auth, equipes, planos, multi-projeto) muda o problema de "publicar site" para "operar plataforma" é acertada, e o faseamento M1→M3 com gates é o ponto mais forte. As três personas convergiram em **17 mudanças** (C1–C17). As correções mais importantes: (1) **contas AWS separadas antes do primeiro `apply`** — nada foi provisionado ainda, o custo de fazer certo agora é mínimo; (2) **base legal LGPD errada no plano** — cadastro/serviço opera por _execução de contrato_ (art. 7º, V), não por consentimento; consentimento fica só para finalidades opcionais; (3) **Aurora Serverless v2 tem scale-to-zero desde nov/2024** e o **RDS Data API elimina Lambda-em-VPC e NAT (~US$ 32/mês)** — o custo mínimo temido no risco 4 não se sustenta mais; (4) **prazo de incidente é norma, não alvo interno**: Resolução CD/ANPD nº 15/2024 fixa 3 dias úteis; (5) **ODCS entra com escopo contido** — documentação viva + classificação PII/base legal/retenção + teste de drift em CI, sem construir plataforma de codegen. Divergências abertas: **região dos dados** (us-east-1 × sa-east-1) e **provedor de billing** (Stripe × player BR) — ambas decisões do usuário; dissenso registrado no tier do Cognito.

---

## §2 — Decisões de arquitetura

### A2.1 Backend serverless AWS-native (vs Supabase)

- **ARQ — APROVA COM RESSALVA.** Coerência com a fundação v1 (Terraform/OIDC/contas) é argumento real; Supabase daria velocity a dev solo, mas introduz segunda plataforma fora do IaC e um lock-in próprio. Ressalva: **spike timeboxed (≤1 semana) do caminho API GW+Lambda+Data API antes de fechar**, e ADR com gatilho explícito de revisão ("se o spike mostrar fricção de DX inaceitável, reabrir Supabase"). Registrar em ADR-001.
- **DEV — APROVA.** Reaproveita 100% da fundação; com scale-to-zero + Data API (ver C4/C5) o custo de beta é ~zero; sem servidor para patchear.
- **SEC — APROVA COM RESSALVA.** Superfície gerenciada menor que qualquer VM/container. Ressalvas: Data API com IAM auth (elimina credencial de DB em código), Secrets Manager com rotação. Nota: Supabase adicionaria um subprocessador de dados pessoais fora do guarda-chuva AWS — mais um DPA/transferência internacional para gerir no registro LGPD.

### A2.2 Postgres relacional (vs DynamoDB)

- **ARQ — APROVA.** Domínio é relacional; modelagem user↔team↔project↔snapshot em Dynamo custaria caro em flexibilidade de consulta.
- **DEV — APROVA.** Migrações SQL versionadas + testcontainers é fluxo maduro.
- **SEC — APROVA.** RLS nativa + SQL ad-hoc para export/erasure (direitos do titular) é exatamente o que a LGPD operacional exige.

### A2.3 Cognito

- **ARQ — APROVA COM RESSALVA.** DX e customização fracos são reais. Ressalva: **isolar o IdP atrás de camada própria** (telas de auth próprias via SDK, nenhum import de Cognito fora de `packages/auth`) para manter troca possível.
- **DEV — APROVA.** JWT authorizer nativo no HTTP API (sem Lambda authorizer), IaC completo, disponível em sa-east-1.
- **SEC — APROVA COM RESSALVA.** O plano cita "advanced security": desde nov/2024 isso é o **tier Plus**, cobrado por MAU (Essentials ≈ US$ 0,015/MAU, Plus ≈ US$ 0,02/MAU após faixa grátis — **verificar valores vigentes**). Começar em **Essentials** (senha forte, MFA TOTP, tokens curtos) + rate limiting próprio; reavaliar Plus (threat protection/credential stuffing) quando billing entrar (M3). Corrigir 12.1.

### A2.4 Stripe

- **ARQ — APROVA COM RESSALVA.** DX excelente; mas NF-e/NFS-e fica 100% fora (15.3) — prever integração (eNotas/NFe.io/Focus) no orçamento do M3.
- **DEV — APROVA.** Webhooks, portal do cliente e idempotência maduros; menos código próprio.
- **SEC — APROVA COM RESSALVA.** Checkout hospedado ⇒ SAQ-A, correto; nunca originar dado de cartão. A escolha final contra player BR (taxas de Pix, repasse, NF) é **comercial** — tecnicamente ambos fecham. → Divergência D2 (decisão do usuário).

### A2.5 Monorepo npm workspaces

- **ARQ — APROVA.** `packages/core` compartilhando o motor B6 entre web e api é a decisão mais valiosa do plano (validação server-side sem duplicação).
- **DEV — APROVA COM RESSALVA.** Fazer **agora**, com o repo em 1 commit — reestruturar depois de o backend existir custa 10×. CI com path filters por workspace. (→ C13)
- **SEC — APROVA.** Sem impacto negativo; um lockfile único facilita SCA.

## §3 — ODCS

- **ARQ — APROVA COM RESSALVA.** Honestidade técnica: ODCS nasceu para **data products analíticos** (data mesh), não para schema OLTP de aplicação. Usá-lo como _fonte de verdade documental_ (schema lógico + classificação + retenção + ownership) com **teste de drift em CI** funciona bem; usá-lo como fonte de _codegen_ (DTOs/zod gerados do contrato) exigiria tooling próprio — over-engineering para o estágio. Fixar escopo: documentação viva + gate de CI; zod à mão; teste de aderência cobre o gap. (→ C6)
- **DEV — APROVA COM RESSALVA.** `datacontract-cli` suporta ODCS v3 (lint/test contra Postgres — **verificar cobertura exata do `test` p/ ODCS**); rodar lint em todo PR e aderência contra o Postgres efêmero do CI. Contrato com `physicalType` alinhado às migrações.
- **SEC — APROVA.** Ponto alto do plano: classificação PII + **base legal + retenção por propriedade** dentro do contrato é, na prática, o registro de operações do art. 37 em formato executável. Exigir campo `customProperties.legalBasis` por finalidade (→ C2) e que o job de CI falhe se uma coluna PII entrar sem classificação.

## Fases

### Fase 10 — Fundações

- **ARQ — APROVA COM RESSALVA.** 10.2/10.4/10.5 corretos e na ordem certa (contratos antes do schema). Ressalva em 10.1: ver DEV.
- **DEV — APROVA COM RESSALVA.** **10.1 está mal sequenciado no tempo**: nada foi provisionado ainda (o `apply` da v1 não aconteceu). Criar AWS Organizations + contas `management`/`staging`/`prod` **antes do primeiro apply** — hoje custa 1h; depois de dados em prod custa uma migração (CloudFront não se move entre contas; seria recriar + cutover). Corrigir também 18.1, que diz "M0 (hoje): no ar" — ainda não está. (→ C1)
- **SEC — APROVA COM RESSALVA.** 10.3/10.6 corretos e bloqueantes certos. Ressalva em 10.6: "consentimento" não pode ser a base legal universal (→ C2); registro de operações art. 37 sai dos contratos ODCS (§3).

### Fase 11 — Backend + banco

- **ARQ — APROVA.** `/api/v1`, zod na borda, RFC 9457 — padrão correto.
- **DEV — APROVA COM RESSALVA.** (a) Adotar **RDS Data API** em vez de Lambda-em-VPC: sem ENI/cold start de VPC, sem NAT Gateway (~US$ 32/mês fixos), sem RDS Proxy; disponível p/ Aurora PostgreSQL Serverless v2 (**verificar** versões de engine e disponibilidade em sa-east-1; fallback: Lambda em VPC + VPC endpoints, sem NAT). (b) CloudFront→API GW exige cache policy `CachingDisabled` + origin request policy que **repassa `Authorization` e não repassa `Host`** — detalhe clássico que quebra em silêncio; fixar no módulo Terraform. (c) Migrações: expand-contract (nunca drop direto em coluna viva). (→ C4, C7)
- **SEC — APROVA COM RESSALVA.** 11.5 correto; acrescentar: logs sem PII **verificado por teste** (scrubber com denylist de campos dos contratos ODCS marcados `pii: true`).

### Fase 12 — Identidade + consentimento

- **ARQ — APROVA.** Coleta mínima e telas próprias ok.
- **DEV — APROVA.** PKCE + tokens em memória + refresh silencioso: correto p/ SPA.
- **SEC — OBJETA (pontual, 12.2) / APROVA no restante.** **Erro de base legal:** dados necessários p/ prestar o serviço (e-mail, credenciais, projetos) operam por **execução de contrato (art. 7º, V)** — não por consentimento. Consentimento é revogável a qualquer momento; se for a base do cadastro, a revogação implode a conta. Consentimento granular fica **só** para finalidades opcionais (marketing, analytics/telemetria, comunicações). Mapear base legal por finalidade nos contratos ODCS. 18+ na v1: **APROVA** — LGPD art. 14 exige consentimento parental p/ criança e "melhor interesse" p/ adolescente; simplificação correta, reavaliar em M2 (16–17 anos existem na graduação). 12.3: prazo de resposta a titular — LGPD art. 19 fixa 15 dias p/ declaração completa; ok. (→ C2, C8)

### Fase 13 — Projetos múltiplos

- **ARQ — APROVA.** 13.2 (modo anônimo como porta de entrada + import ao logar) é a decisão de produto mais inteligente do plano — preserva o funil gratuito. Conflito otimista por versão: suficiente.
- **DEV — APROVA.** Snapshots imutáveis simplificam backup/restore e auditoria.
- **SEC — APROVA.** Limites por plano checados no backend (15.1) cobrem abuso de armazenamento.

### Fase 14 — Equipes

- **ARQ — APROVA.** RBAC de 3 papéis é o mínimo viável certo; resistir a permissões finas até haver demanda.
- **DEV — APROVA.** Testes de autorização por papel no CI: ok.
- **SEC — APROVA COM RESSALVA.** (a) RLS: documentar mecanismo concreto — role da aplicação **sem** `BYPASSRLS`, `SET LOCAL app.user_id` por transação (com Data API: via API de transação — **verificar** ergonomia; alternativa: policy layer como linha primária e RLS como cinto). (b) Convite por e-mail: token de uso único com expiração **e** resposta idêntica p/ e-mail existente/inexistente (não vazar cadastro). (→ C9)

### Fase 15 — Planos pagos

- **ARQ — APROVA.** 15.1 (entitlements no backend, UI só reflete) e 15.4 (read-only, nunca apagar) são as duas regras que evitam os piores incidentes de billing.
- **DEV — APROVA.** Checkout + portal hospedados = menos superfície própria.
- **SEC — APROVA COM RESSALVA.** Webhook: endpoint **fora** do authorizer Cognito, validação de assinatura com tolerância de replay (≤5 min) e **dedupe persistido por `event.id`** (idempotência de verdade, não só handler idempotente). 15.3 corretamente marcado bloqueante comercial. (→ C10)

### Fase 16 — Segurança de plataforma

- **ARQ — APROVA.** WAF deixar de ser adiado quando API/auth entram: coerente com o threat model.
- **DEV — APROVA COM RESSALVA.** PITR do Aurora dá RPO de ~5 min — o alvo declarado (RPO 24h) está **frouxo demais** para o que a infra já entrega; declarar RPO 1h / RTO 4h sem custo adicional. Teste de restore trimestral: manter, é o passo que todo mundo pula.
- **SEC — APROVA COM RESSALVA.** 16.5: o prazo não é "razoável/alvo interno 72h" — a **Resolução CD/ANPD nº 15/2024** fixa comunicação de incidente relevante em **3 dias úteis** à ANPD e aos titulares. Corrigir o texto e refletir no plano de resposta. 16.4 (pentest/ASVS L1 + ZAP baseline antes de billing): aprovado como gate de M3. (→ C3)

### Fase 17 — Observabilidade

- **ARQ — APROVA.** Métricas de negócio desde o dia 1 do backend: certo.
- **DEV — APROVA.** OTel/X-Ray + request-id correlacionado: padrão.
- **SEC — APROVA COM RESSALVA.** Sentry: telemetria de erro pode operar por **legítimo interesse com opt-out** (não trave em consentimento prévio), desde que payload minimizado: scrubbing por denylist derivada dos contratos, IP truncado, sem corpo de request. Registrar no registro de operações.

### Fase 18 — Rollout

- **ARQ — APROVA COM RESSALVA.** Gates corretos. Ressalva: teste de **isolamento entre usuários** já é gate de **M1** (multi-usuário existe desde projetos pessoais), não só de M2. Corrigir 18.2. (→ C12)
- **DEV — APROVA COM RESSALVA.** 18.1 diz "M0 (hoje): no ar" — o apply v1 ainda não ocorreu; M0 é o próximo passo, atrás da criação das contas (C1).
- **SEC — APROVA.** Pentest como gate de M3 e LGPD mínimo como gate de M1: sequência certa.

## Riscos & decisões-chave (10 itens)

| #   | Item                      | ARQ                  | DEV                                                                                                                       | SEC                                    | Resolução                                        |
| --- | ------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------ |
| 1   | AWS-native × Supabase     | RESSALVA (spike+ADR) | APROVA                                                                                                                    | RESSALVA (subprocessador)              | Mantido AWS-native c/ spike gate (C15/ADR-001)   |
| 2   | Cognito                   | RESSALVA (abstração) | APROVA                                                                                                                    | RESSALVA (tier)                        | Mantido c/ C11; dissenso de tier registrado (D3) |
| 3   | Stripe × player BR        | RESSALVA (NF)        | APROVA                                                                                                                    | NEUTRO (ambos SAQ-A)                   | **Aberta — D2 (comercial)**                      |
| 4   | Custo mínimo Aurora       | —                    | **Fato desatualizado**: v2 tem scale-to-zero (0 ACU) desde nov/2024, engines PG 13.15+/14.12+/15.7+/16.3+; retomada ~15 s | —                                      | C5: risco cai; documentar cold-resume            |
| 5   | Monorepo agora            | APROVA               | APROVA (1 commit = agora)                                                                                                 | APROVA                                 | C13: executar já                                 |
| 6   | Profundidade ODCS         | Doc+CI, sem codegen  | idem                                                                                                                      | idem + gate PII                        | C6                                               |
| 7   | 18+ na v1                 | APROVA               | APROVA                                                                                                                    | APROVA (art. 14)                       | C8: 18+, reavaliar em M2                         |
| 8   | Colaboração assíncrona v1 | APROVA (CRDT depois) | APROVA                                                                                                                    | APROVA                                 | Mantido                                          |
| 9   | VPC × Data API            | NEUTRO               | **Data API** (sem NAT/proxy)                                                                                              | APROVA (IAM auth)                      | C4: Data API c/ verificação + fallback           |
| 10  | Região dos dados          | sa-east-1 (latência) | us-east-1 (custo/simplicidade)                                                                                            | NEUTRO (art. 33 permite transferência) | **Aberta — D1**                                  |

---

## CONSENSO

### (a) Edições no documento v2 — unânimes

1. **C1 — Resequenciar 10.1/18.1:** AWS Organizations + contas separadas **antes do primeiro `apply`** (nada provisionado ainda; CloudFront não migra entre contas). Corrigir 18.1: M0 ainda não está no ar.
2. **C2 — Corrigir base legal (10.6/12.2):** dados de conta/serviço = **execução de contrato (art. 7º, V)**; consentimento granular **só** para finalidades opcionais (marketing, analytics). Base legal por finalidade registrada nos contratos ODCS (`customProperties.legalBasis`).
3. **C3 — Corrigir 16.5:** Resolução CD/ANPD nº 15/2024 — comunicação de incidente relevante em **3 dias úteis** (ANPD e titulares); não é "alvo interno".
4. **C4 — Adotar RDS Data API (11.1):** sem Lambda-em-VPC, sem NAT (~US$ 32/mês), sem RDS Proxy; IAM auth. Verificar versões de engine/região; fallback documentado: Lambda em VPC + VPC endpoints (sem NAT).
5. **C5 — Atualizar risco 4:** Aurora Serverless v2 **tem scale-to-zero (0 ACU, nov/2024)**; retomada ~15 s — documentar cold-resume na UX do beta; custo idle ≈ storage.
6. **C6 — Fixar escopo ODCS (§3):** documentação viva + classificação (PII/base legal/retenção) + lint e teste de drift no CI (datacontract-cli); **sem codegen** de DTOs; zod à mão + teste de aderência.
7. **C7 — Detalhar 11.1:** CloudFront→API GW com `CachingDisabled` + origin request policy repassando `Authorization` e **não** repassando `Host`; fixar no módulo Terraform.
8. **C8 — Manter 18+ na v1 (12.2)** com fundamento (art. 14) e reavaliação explícita em M2.
9. **C9 — Detalhar RLS (14.2):** role sem `BYPASSRLS`, `SET LOCAL` por transação (verificar ergonomia via Data API); convites sem enumeração de e-mail.
10. **C10 — Detalhar 15.2:** webhook fora do authorizer, assinatura + janela de replay ≤5 min + **dedupe persistido por `event.id`**.
11. **C11 — Corrigir A2.3/12.1:** "advanced security" = tier **Plus** (pricing nov/2024); iniciar em **Essentials**, reavaliar Plus no M3.
12. **C12 — Corrigir 18.2:** teste de isolamento entre usuários é gate de **M1**; entre tenants/equipes, de M2. RPO alvo 1h (PITR já entrega ~5 min).

### (b) Ações executáveis agora no repo — unânimes

13. **C13 — Reestruturar monorepo agora** (repo tem 1 commit): `apps/web` (SPA atual), `packages/core` (motor B6 + modelos puros), `contracts/`, `docs/`; CI com path filters. `apps/api` nasce na fase 11.
14. **C14 — Escrever os 7 contratos ODCS iniciais** (§3.2) com classificação PII, `legalBasis` e retenção por propriedade + job de lint no CI.
15. **C15 — Criar `docs/adr/`** com ADR-001 (AWS-native vs Supabase, c/ gatilho de spike), ADR-002 (Postgres), ADR-003 (Cognito + abstração), ADR-004 (billing — **status: aberto**), ADR-005 (monorepo), ADR-006 (escopo ODCS), ADR-007 (Data API).
16. **C16 — Esqueleto `docs/threat-model.md`** (STRIDE por componente da arquitetura alvo, documento vivo).
17. **C17 — Atualizar plano v1/runbook** com nota: Organizations/contas separadas precedem o primeiro apply.

### Divergências abertas — decisão do usuário

- **D1 — Região dos dados (Aurora/Lambda/Cognito).** DEV: `us-east-1` — custo menor (sa-east-1 é ~25–50% mais caro — verificar), tudo já está lá, menos partes móveis. ARQ: `sa-east-1` — latência de API ~15–30 ms vs ~140 ms; para save explícito é tolerável, mas colaboração futura sente. SEC: juridicamente indiferente — LGPD art. 33 permite transferência internacional com salvaguardas; "dados no Brasil" vale como argumento de marketing, não de conformidade. _CloudFront/ACM/WAF permanecem us-east-1 em qualquer cenário._
- **D2 — Billing: Stripe × Mercado Pago/Pagar.me.** ARQ+DEV: Stripe (DX, webhooks, portal, menos código). SEC: neutro (ambos SAQ-A com checkout hospedado). O desempate é **comercial**: taxas de Pix, repasse, facilidade de NF — fora do alcance técnico das personas.
- **D3 — Tier do Cognito (registrado, 2×1).** SEC: Plus (threat protection) no mínimo a partir do M3/billing. DEV+ARQ: Essentials até sinal real de abuso (custo/MAU). _Mantido Essentials; dissenso registrado — reavaliar no gate M3._
