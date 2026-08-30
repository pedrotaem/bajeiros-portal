# ADR-003: Cognito p/ identidade

**Status:** aceito (2026-08-22, revisado 2026-08-24) — tier em reavaliação no gate M3 (dissenso D3 da revisão v2)

## Contexto

Precisamos de e-mail+senha, verificação, MFA, tokens OIDC validáveis no API GW.

## Decisão

Cognito User Pool, tier **Essentials**, região **sa-east-1** (ADR-008: dados pessoais no Brasil). OIDC code flow + PKCE no SPA, tokens em memória (não localStorage). JWT authorizer no API GW.

**Revisão 2026-08-24 (decisão do usuário):** UI de auth = **Managed Login** (versão nova, 2025) via redirect — cadastro, confirmação de e-mail, recuperação de senha e MFA hospedados pelo Cognito. Substitui a intenção original de "telas próprias via SDK": o Managed Login atual resolve a objeção de UX, corta 4 fluxos de tela do SPA e já prepara o IdP Google (fase 12), que exige o domínio OAuth de qualquer forma. O isolamento continua: nada de Cognito fora de `packages/auth` (cliente PKCE próprio, sem SDK).

O Bearer aceito pela API é o **ID token** (o access token do Cognito não carrega email/name); validação JWKS na aplicação com issuer + aud (client id) + `token_use=id` + `email_verified`.

## Alternativas

- **Auth0**: DX melhor, custo por MAU maior.
- **Supabase Auth**: rejeitado junto com ADR-001.
- **Telas próprias via SDK** (decisão original): UX 100% no visual do portal, mas 4 fluxos de tela a manter e SDK do Cognito no bundle; revertido em favor do Managed Login.

## Consequências

- Branding do Managed Login gerenciado via Terraform (`aws_cognito_managed_login_branding`); começa com defaults do Cognito.
- Proteção contra credential stuffing (tier **Plus**, pricing nov/2024) fica p/ o gate M3 — persona de segurança registrou preferência por Plus desde já (2×1).

## Nota (2026-08-30, DF-17 — IdP Google)

O Google entra como **provedor de identidade do mesmo pool** (`aws_cognito_identity_provider`,
`provider_type = "Google"`), não como segundo sistema de login: o SPA continua falando só com o
domínio do Cognito e recebendo o **ID token do pool**. Nada muda no contrato do token nem em
`auth/jwt.ts`.

Para preservar o invariante **`users.id` = `sub`**, a colisão de e-mail (conta com senha ×
conta Google) é resolvida **dentro do Cognito**, com `AdminLinkProviderForUser` numa trigger
`PreSignUp_ExternalProvider`. A alternativa de desacoplar `users.id` do `sub` (tabela de
identidades + resolução no middleware) foi rejeitada: cobra migração, revisão de RLS e uma
query por request para resolver o caso mais raro. O risco residual da vinculação automática
está aceito e justificado no `threat-model.md`; a reversão é a flag `google_enabled`.

Spec completa: [specs/drafts/df17-login-google.md](../../specs/drafts/df17-login-google.md).

## Nota (2026-08-24, fase 11)

A validação do ID token permanece na aplicação (jose + JWKS do pool) também na AWS — sem JWT authorizer no API Gateway (ver nota no ADR-001). `assertAuthEnv`/`assertProdEnv` rodam no module scope da Lambda: cold start falha alto com config incompleta.
