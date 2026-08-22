# ADR-003: Cognito p/ identidade

**Status:** aceito (2026-08-22) — tier em reavaliação no gate M3 (dissenso D3 da revisão v2)

## Contexto

Precisamos de e-mail+senha, verificação, MFA, tokens OIDC validáveis no API GW.

## Decisão

Cognito User Pool, tier **Essentials**. OIDC code flow + PKCE no SPA, tokens em memória (não localStorage). JWT authorizer no API GW.

## Alternativas

- **Auth0**: DX melhor, custo por MAU maior.
- **Supabase Auth**: rejeitado junto com ADR-001.

## Consequências

- UX de UI hospedada limitada → telas próprias via SDK.
- Proteção contra credential stuffing (tier **Plus**, pricing nov/2024) fica p/ o gate M3 — persona de segurança registrou preferência por Plus desde já (2×1).
