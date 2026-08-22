# Bajeiros Portal

Portal da comunidade Bajeiros. Produto piloto: **validador visual 3D de gaiola de proteção** contra as regras da seção B6 do regulamento brasileiro (RATBSB, emenda 7).

Editor 3D de nós e membros (Vite + React + react-three-fiber), motor de ~40 regras automáticas + itens de verificação manual, assistente "nova gaiola do zero", estimativa de massa, detecção de juntas com gabarito de corte SVG 1:1 e manequim antropométrico.

## Aviso legal

- Ferramenta **educacional**. **Não substitui** a inspeção técnica oficial da competição.
- Projeto comunitário **sem vínculo com a SAE** ou com organizadores de competição.
- As verificações são **paráfrases interpretativas** do regulamento — o texto oficial do RATBSB prevalece sempre. O texto do regulamento **não** é reproduzido neste repositório.

## Desenvolvimento

```bash
npm ci
npm run dev        # http://localhost:5173
npm test           # vitest
npm run lint
npm run typecheck
npm run build      # tsc + vite build → dist/
```

Node: ver `.nvmrc`.

## Estrutura (monorepo npm workspaces)

- `apps/web/` — SPA (Vite + React + R3F): componentes 3D, store, testes de integração c/ store
- `packages/core/` — `@bajeiros/core`: motor de regras B6 + modelos de domínio (TS puro, roda em browser e Node)
- `contracts/` — contratos de dados ODCS (schema + PII/base legal LGPD/retenção)
- `infra/` — Terraform (S3 + CloudFront + Route53 + ACM + OIDC)
- `docs/` — planos de produção (v1/v2), revisões das personas, ADRs, threat model, runbook
- `specs/` — especificações e user stories

Scripts na raiz: `npm run dev | build | test | lint | typecheck | contracts:check`.

## Deploy

CI/CD via GitHub Actions → AWS (S3 privado + CloudFront, OIDC sem chaves de longa duração). Ver `docs/plano-producao.md` e `docs/runbook.md`.
