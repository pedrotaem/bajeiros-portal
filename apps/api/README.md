# @bajeiros/api

Backend do portal — Hono + TypeScript. Mesmo código roda como servidor Node local (dev) e Lambda (produção, `src/lambda.ts`).

## Dev local (sem Docker)

```bash
# terminal 1 — Postgres portátil (embedded-postgres) + migrações
npm run db:start -w @bajeiros/api

# terminal 2 — API em http://localhost:8787
npm run dev -w @bajeiros/api

# terminal 3 — SPA (proxy /api → 8787)
npm run dev -w @bajeiros/web
```

Login em dev (`AUTH_MODE=dev`, "Cognito de mentira"):

```bash
curl -s localhost:8787/api/v1/dev/token -H 'content-type: application/json' \
  -d '{"email":"ana@fei.edu.br","name":"Ana"}'
# → { token } → use como Authorization: Bearer <token>
curl -s localhost:8787/api/v1/me -X POST -H "Authorization: Bearer $TOKEN"
```

## Rotas (M1)

| Rota                                  | O quê                                                                                               |
| ------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `POST /api/v1/me`                     | bootstrap idempotente a partir do token (art. 7º V — sem consentimento)                             |
| `GET/PATCH/DELETE /api/v1/me`         | perfil · soft delete (purge 30d = job futuro)                                                       |
| `GET /api/v1/me/export`               | portabilidade LGPD (JSON completo)                                                                  |
| `POST/GET /api/v1/me/consents`        | consentimentos opcionais, append-only                                                               |
| `CRUD /api/v1/projects`               | limite free: 2 projetos (entitlement no backend)                                                    |
| `POST /api/v1/projects/:id/snapshots` | valida c/ motor B6 (`@bajeiros/core`), lock otimista (`expectedSeq` → 409), limite free: 10 versões |

Erros: RFC 9457 (`application/problem+json`).

## Segurança (revisão v2)

- Pool da app conecta como `bajeiros_app` (LOGIN, `NOBYPASSRLS`); toda query roda em transação com `SET LOCAL app.user_id` (C9). RLS = isolamento; RBAC fino de equipe = policy layer (fase 14).
- `consents`/`cage_snapshots`/`audit_events`: append-only por GRANT (sem UPDATE/DELETE).
- Testes de isolamento entre usuários (`src/test/rls.test.ts`) = **gate do M1** — rodam em Postgres embutido real (initdb UTF-8), local e no CI, sem Docker.

## Migrações

`migrations/*.sql` via node-pg-migrate (URL admin `DATABASE_URL`; a app usa `APP_DATABASE_URL`). Schema espelha `contracts/*.odcs.yaml` — mudou schema, muda contrato no mesmo PR (ADR-006).

## Produção (fase 11)

Modo cognito (real): `AUTH_MODE=cognito` + `COGNITO_ISSUER` (`https://cognito-idp.sa-east-1.amazonaws.com/<poolId>`) + `COGNITO_CLIENT_ID` — config validada no boot (`assertAuthEnv`). O Bearer é o **ID token** do Managed Login (RS256, JWKS), validado com issuer + aud + `token_use=id` + `email_verified`. Receita p/ rodar local contra o pool de staging: exportar as 3 vars (valores em `terraform output auth` no env staging) e criar `apps/web/public/config.json` (gitignored) com `{"authMode":"cognito","cognito":{"domain":"…","clientId":"…"}}`.

Aurora via RDS Data API exigirá driver próprio no lugar de `pg` (ADR-007) — interface `withUser()` é o ponto de troca.
