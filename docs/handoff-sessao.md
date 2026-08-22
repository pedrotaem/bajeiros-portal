# Handoff de sessão — Portal Bajeiros

**Data:** 2026-08-22 · **Escrito por:** sessão anterior do Claude Code (protocolo de reset de contexto)
**Próximo bloco combinado:** **Equipes e convites (fase 14)** — começar por aqui.

---

## 1. O que é o portal e como funciona

**Produto:** portal da comunidade Bajeiros (Baja, sem vínculo SAE). Piloto = **validador visual 3D de gaiola** contra as regras B6 do RATBSB emenda 7 (~40 regras automáticas + itens manuais). Visão: SaaS p/ estudantes — contas, equipes de universidade c/ recursos compartilhados, N projetos (projeto = carro), features pagas (Stripe, Pix/usuário/mês simbólico), LGPD por design, dados modelados via contratos **ODCS** (`contracts/*.odcs.yaml`).

**Monorepo npm workspaces** (repo público `github.com/pedrotaem/bajeiros-portal`, sem LICENSE = todos direitos reservados):

- `packages/core` — `@bajeiros/core`: motor de regras B6 + modelos, TS puro, zero deps. Exporta fonte direto (`"./*": "./src/*.ts"`, sem build). Roda no browser E no backend.
- `apps/web` — SPA Vite+React+react-three-fiber+zustand. Editor 3D (nós/membros, wizard 6 passos, massa, juntas, manequim) + telas de sessão (login/perfil/projetos).
- `apps/api` — Hono TS. Local: `@hono/node-server` porta 8787; prod: `src/lambda.ts` (hono/aws-lambda). Módulos: `identity` (bootstrap idempotente `POST /api/v1/me`, perfil, consents append-only, export LGPD, soft delete) e `projects` (CRUD + snapshots versionados c/ lock otimista `expectedSeq`→409, validação server-side c/ `evaluate()` do core, limites free 2 projetos/10 versões→403). Erros RFC 9457 (`problem()` usa `c.body`, NÃO `c.json` — c.json sobrescreve content-type).
- `contracts/` — 7 contratos ODCS v3 (user, consent, team, project, cage-snapshot, subscription, audit-event) c/ `pii`/`legalBasis`/`retention` por propriedade. Validador: `npm run contracts:check`. **Regra: mudou schema → muda contrato no MESMO PR** (ADR-006).
- `infra/` — Terraform S3+CloudFront+ACM+Route53+OIDC (site estático v1; NADA aplicado ainda).
- `docs/` — planos v1/v2, revisões 3-personas, `adr/001–008`, `threat-model.md`, `runbook.md`.

**Banco/segurança:** Postgres c/ **RLS** (migração `apps/api/migrations/0001_init.sql`): app conecta como `bajeiros_app` (NOBYPASSRLS); `withUser()` em `db.ts` roda cada request em transação c/ `set_config('app.user_id', $1, true)`. Helpers SECURITY DEFINER `user_team_ids()`/`team_has_members()` evitam recursão de RLS. `consents`/`cage_snapshots`/`audit_events` são append-only por GRANT. **Teste de isolamento entre usuários = gate do M1** (`apps/api/src/test/rls.test.ts`).

**Dev local (SEM Docker — máquina não tem):**

```bash
npm run db:start -w @bajeiros/api   # Postgres embutido porta 5433 (embedded-postgres 17.10.0-beta.17;
                                    # initdbFlags UTF8 obrigatórias — default Windows WIN1252 quebra c/ "≤")
npm run dev -w @bajeiros/api        # API 8787 (AUTH_MODE=dev)
npm run dev -w @bajeiros/web        # Vite (proxy /api→8787; 5173-75 podem estar ocupadas → vai p/ 5176)
```

Login dev: `POST /api/v1/dev/token {email,name}` → Bearer HS256 c/ claims iguais Cognito (sub uuid estável por e-mail via localStorage do front). Testes: Postgres embutido efêmero porta 5434 via globalSetup. **68 testes** (38 core + 14 web + 16 api). node-pg-migrate v9 = import nomeado `{ runner }`.

## 2. O que foi feito e por quê (resumo cronológico)

1. **Fundação v1** (plano `docs/plano-producao.md`, revisado por 3 personas em `docs/revisao-plano.md`): repo higiene, ESLint/Prettier (2 regras react-hooks v6 rebaixadas a warn), CI hardened (SHA-pinned, gitleaks binário v8.30.1 — a action v3 é bugada "stderr is not empty"), `npm ci --ignore-scripts` (testado verde), deploy.yml OIDC staging→prod gated (no-op até variable `DEPLOY_ENABLED=true`), Terraform static-site.
2. **Plano v2 SaaS** (`docs/plano-producao-v2.md` + `docs/revisao-plano-v2.md`, 17 consensos aplicados): arquitetura serverless AWS. Decisões fechadas em ADRs: serverless API GW+Lambda (001), Aurora Serverless v2 scale-to-zero (002), Cognito Essentials→Plus no M3 (003), **Stripe** (004, decisão do Pedro; Pix recorrente = send_invoice ou Pix Automático, verificar), monorepo (005), escopo ODCS sem codegen (006), RDS Data API sem VPC (007), **região dados = sa-east-1** (008, voto de minerva da persona Segurança; verificar Data API/0 ACU em sa-east-1 no apply). Marcos: M1 contas+projetos → M2 equipes → M3 pagamentos.
3. **GitHub configurado:** secret scanning+push protection, CodeQL default setup, Dependabot (baseline tinha 7 vulns; PRs abertos), environments `staging`/`production` (reviewer pedrotaem), ruleset `main-protection` (PR + checks "Secret scan (gitleaks)" e "Lint · Typecheck · Test · Build" obrigatórios, sem force-push). **Claude NÃO consegue mergear PR (classifier bloqueia) — merge é do Pedro.**
4. **API implementada** (PR #9) e **telas de sessão** (PR #10, base = branch do #9, retarget auto p/ main). Smoke test real no Chrome ok (login→projeto→salvar v1).
5. **Estudo de design/UX** (artefato Claude c/ telas reais): diagnóstico "ausência de hierarquia e sequência". Proposta: onboarding 3 cartões (Validar/Criar/Explorar), modos Checar (problemas primeiro) vs Modelar, camada de linguagem humana antes do código B6, persistência única, topbar compacta. Bugs achados: **Esc não fecha modais; labels 3D vazam por cima dos modais (z-index); logout silencioso no reload; câmera inicial não enquadra**.

**Incidente aprendido:** branch de telas criada a partir da main (sem o PR #9) c/ worktree sujo → `add -A` commitou `apps/api/.dev/pgdata` (1320 arquivos) e a troca de branch corrompeu o banco dev. Corrigido (branch recriada limpa, force-push, DB recriado). **Regras: branch dependente nasce do branch da dependência; `git status --short` antes de `add -A`; `.dev/` está no .gitignore.**

## 3. Estado pendente (ações em andamento)

| Ação                                                                                                                                                                         | Dono   | Status                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Merge PR **#9** (API) → depois **#10** (telas)                                                                                                                               | Pedro  | ambos c/ checks verdes; #9 já contém o fix de CI do #8                                                                                                                                                                                                                                                                                                                                         |
| Fechar PR **#8** (conteúdo dentro do #9)                                                                                                                                     | Pedro  | —                                                                                                                                                                                                                                                                                                                                                                                              |
| PRs Dependabot #1–#7 (mergear os verdes; #5 TS7 e #7 Vite8 são majors)                                                                                                       | Pedro  | abertos                                                                                                                                                                                                                                                                                                                                                                                        |
| AWS Organizations (contas staging/prod ANTES do 1º apply) → bootstrap tfstate → apply global → NS Registro.br → staging/prod → vars nos environments + `DEPLOY_ENABLED=true` | Pedro  | nada aplicado; ver `infra/README.md` (bucket de state por conta pendente de ajuste)                                                                                                                                                                                                                                                                                                            |
| bajeiros.com.br                                                                                                                                                              | —      | JÁ registrado                                                                                                                                                                                                                                                                                                                                                                                  |
| **PRÓXIMO BLOCO: Equipes e convites (fase 14)**                                                                                                                              | Claude | schema/RLS/contratos já prontos; falta API (criar equipe, convite por e-mail c/ token hash + expiração, aceitar, papéis owner/admin/member, transferir projeto p/ equipe, policy layer `can()` c/ RBAC fino) + telas + testes de autorização por papel (gate M2). **Sem enumeração de e-mail** nos convites (C9). Envio real de e-mail não existe ainda — convite por link copiável nesta fase |
| Depois: quick wins UX do estudo → inversão checklist → onboarding; purge job 30d (LGPD); Cognito real (bloqueado em AWS)                                                     | Claude | ordem combinada                                                                                                                                                                                                                                                                                                                                                                                |

## 4. Convenções de trabalho desta dupla

- Modo caveman ultra no chat (o Pedro invoca `/caveman ultra`); docs/código em português normal.
- Fluxo p/ mudanças grandes: plano → revisão por 3 personas (agente fork: Arquiteto, DevOps, Segurança — divergência vira decisão do Pedro; empate = voto de minerva combinado) → executar consensos.
- Todo PR: gitleaks + lint + typecheck + test + build verdes; commits c/ trailer Co-Authored-By Claude.
- Memória automática do Claude (`bajeiros-portal.md`) tem o histórico técnico detalhado — este arquivo é o resumo de handoff.
