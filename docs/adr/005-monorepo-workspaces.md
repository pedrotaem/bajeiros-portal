# ADR-005: Monorepo npm workspaces

**Status:** aceito e executado (2026-08-22)

## Contexto

Motor de regras B6 precisa rodar no browser (grátis/offline) E no backend (validação server-side). Repo tinha 1 commit — custo de reestruturar era mínimo (C13).

## Decisão

```
apps/web        SPA (Vite + React + R3F)
apps/api        (futuro) Lambda handlers
packages/core   motor B6 + modelos — TypeScript puro, zero deps de runtime
contracts/      contratos ODCS
infra/          Terraform
```

`@bajeiros/core` exporta fonte TS (`"./*": "./src/*.ts"`); Vite/tsc/vitest consomem direto, sem build step do pacote.

## Alternativas

- Repo separado p/ api: rejeitado — sincronizar versões do core entre repos é atrito puro nesse estágio.
- Turborepo/Nx: desnecessário no tamanho atual; reavaliar se builds ficarem lentos.

## Consequências

- Testes acoplados ao store (zustand) vivem em `apps/web`; testes puros em `packages/core`.
- CI roda scripts na raiz; `infra/` tem workflow próprio com path filter.
