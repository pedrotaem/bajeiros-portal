# DF-9 — Página de administração do portal

- **Status:** 🚧 **EM IMPLEMENTAÇÃO** (2026-08-23) — pedido direto do usuário; sem ciclo
  de revisão 3 personas (disponível sob demanda).
- **Dependências:** fases 12–14 (identidade, projetos, equipes — implementadas).
- **Relação com DF-8:** a visão de uso do chat (§3.3) exige **persistir pergunta e
  resposta**, revertendo a decisão "v1 sem persistência de conversas" do DF-8 e a
  política "logs sem conteúdo" do gateway **no lado do portal** (decisão do usuário,
  2026-08-23). Implicações LGPD tratadas em §5.

## 1. Objetivo

Área administrativa para o operador do portal (admin) com visibilidade de:

1. **Usuários e equipes** — lista de usuários (perfil, último login, admin, excluídos),
   equipes, papéis e relacionamentos, contagem de projetos.
2. **Atividade do site** — log de acesso a páginas (SPA) e recursos (API) por usuário.
3. **Uso do chat de IA** — quem perguntou o quê, resposta dada, tokens, latência,
   modelo, versão do corpus.

## 2. Modelo de acesso

- Flag `users.is_admin` (default `false`). **Nenhuma rota concede admin**: promoção é
  operação manual no banco com a conexão owner
  (`UPDATE users SET is_admin = true WHERE email = '…'`), documentada no runbook.
- Helper `app_is_admin()` (SECURITY DEFINER) + policies RLS `FOR SELECT` adicionais
  (`users`, `teams`, `team_members`, `projects`, `audit_events`, `access_log`,
  `assistant_log`) — admin lê tudo, escreve nada além do que já podia.
- API `/api/v1/admin/*` atrás de `requireAdmin` (403 problem p/ não-admin).
- Toda consulta admin gera `audit_events` (`admin.view`, metadata com filtros) —
  acesso de admin a dado pessoal é auditável.

## 3. Funcionalidades

### 3.1 Usuários e equipes

- `GET /api/v1/admin/users?q=` — id, e-mail, nome, universidade, criado, excluído,
  admin, **último login** (`users.last_login_at`, atualizado no bootstrap `POST /me`),
  equipes (nome+papel) e nº de projetos.
- `GET /api/v1/admin/teams` — equipes c/ membros (nome, e-mail, papel, entrada) e nº
  de projetos.

### 3.2 Atividade

- Tabela `access_log` (append-only): user_id, método, rota (padrão) e caminho real,
  status HTTP, duração ms, IP, timestamp.
  - API: middleware pós-auth registra toda chamada `/api/v1/*` (exceto health),
    fire-and-forget (não bloqueia a resposta).
  - Páginas: SPA envia `POST /api/v1/activity/pageview` (método lógico `PAGE`) em
    landing/editor/painéis — só usuário logado (anônimo não é rastreado).
- `GET /api/v1/admin/activity?userId=&limit=&offset=` — join com e-mail.

### 3.3 Chat de IA

- Tabela `assistant_log` (append-only): user_id, pergunta, resposta, status, modelo,
  corpus_version, tokens in/out/cache, duração ms, timestamp. Preenchida pelo proxy do
  chat (DF-8 fase 2+); admin já enxerga a partir de agora (vazio até o chat entrar).
- `GET /api/v1/admin/assistant?userId=&limit=&offset=`.

### 3.4 UI

- `AdminPanel.tsx`: painel modal (padrão SessionPanels) com abas **Visão geral**
  (contadores), **Usuários**, **Equipes**, **Atividade**, **Chat IA**; busca por
  usuário, paginação simples. Botão "Admin" na topbar só p/ `user.isAdmin`.

## 4. Contratos ODCS

- `access-log.odcs.yaml` (novo): pii (user_id, ip, path) — base legal
  **legítimo interesse** (segurança/melhoria, art. 7º, IX), retenção **90 dias**.
- `assistant-log.odcs.yaml` (novo): pergunta/resposta = conteúdo potencialmente
  pessoal — base legal **execução de contrato** da feature, retenção **90 dias**;
  visibilidade admin declarada.
- `user.odcs.yaml` → 1.1.0: `is_admin` (não-PII), `last_login_at` (pii, contrato).

## 5. LGPD

- **Transparência:** o aviso do assistente (FR-DF8.10) passa a declarar que perguntas
  e respostas são **armazenadas e visíveis ao administrador** (retenção 90 d); a
  política de privacidade deve listar o log de atividade (legítimo interesse — cabe
  direito de oposição, art. 18 §2º).
- **Direitos do titular:** `GET /me/export` passa a incluir `accessLog` e
  `assistantLog` (RLS mostra as próprias linhas); purge 30 d pós-exclusão cobre ambos
  (job futuro já previsto).
- **Minimização:** IP truncável no futuro; sem user-agent/fingerprint; anônimos fora.
- Retenção 90 d: job de purge por idade (junto com o purge de contas, pendente).

## 6. Critérios de aceite

| #        | Critério                                                                              |
| -------- | ------------------------------------------------------------------------------------- |
| AC-DF9.1 | Não-admin em `/api/v1/admin/*` recebe 403 problem+json; sem vazar existência de dados |
| AC-DF9.2 | Admin lista usuários com último login, equipes e nº de projetos                       |
| AC-DF9.3 | Chamada de API de usuário logado aparece em `access_log` com rota/status/duração      |
| AC-DF9.4 | Pageview da SPA aparece como método `PAGE`                                            |
| AC-DF9.5 | Registro em `assistant_log` aparece na visão de chat com tokens e latência            |
| AC-DF9.6 | Export LGPD do usuário inclui suas linhas de access_log/assistant_log                 |
| AC-DF9.7 | Consulta admin gera `audit_events` `admin.view`                                       |
