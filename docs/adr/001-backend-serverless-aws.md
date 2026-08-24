# ADR-001: Backend serverless AWS-native

**Status:** aceito (2026-08-22, revisão v2 das 3 personas)

## Contexto

Portal evolui de SPA estática p/ SaaS (auth, equipes, planos, multi-projeto). Stack declarada: GitHub + Actions + AWS. Fundação v1 (Terraform, OIDC, CI/CD) já construída sobre AWS.

## Decisão

API Gateway (HTTP API) + Lambda (Node/TS, esbuild) + Aurora Serverless v2 Postgres. Rota `/api/*` na distribuição CloudFront existente.

## Alternativas

- **Supabase**: auth+Postgres+RLS prontos, velocity maior p/ dev solo; rejeitado por introduzir segunda plataforma fora do IaC/OIDC AWS e lock-in próprio.
- **ECS Fargate**: custo fixo e ops maiores; sem necessidade no volume atual.

## Consequências

- Custo proporcional ao uso (~0 em idle c/ Aurora 0 ACU).
- Cold start aceitável p/ ferramenta de engenharia (não checkout de e-commerce).
- Dependência de padrões AWS (mitigada por domínio puro em `packages/core`).

## Nota (2026-08-24, fase 11)

JWT é validado **na aplicação** (`apps/api/src/auth/jwt.ts`), não em um authorizer do API Gateway — desvio consciente do A2.3: um único ponto de validação nos dois modos (dev e cognito), testável no vitest; o API GW HTTP fica só com throttling. Revisar se a API ganhar consumidores fora do SPA.
