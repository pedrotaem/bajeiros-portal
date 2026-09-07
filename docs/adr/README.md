# Architecture Decision Records

Formato: contexto → decisão → consequências. Status: `aceito` | `proposto` | `aberto` | `substituído por ADR-xxx`.

| ADR                                  | Título                                            | Status                  |
| ------------------------------------ | ------------------------------------------------- | ----------------------- |
| [001](001-backend-serverless-aws.md) | Backend serverless AWS-native                     | aceito                  |
| [002](002-postgres-relacional.md)    | PostgreSQL relacional (Aurora Serverless v2)      | aceito                  |
| [003](003-cognito-identidade.md)     | Cognito p/ identidade (tier Essentials)           | aceito                  |
| [004](004-billing.md)                | Provedor de billing — Stripe (Pix/usuário/mês)    | aceito                  |
| [005](005-monorepo-workspaces.md)    | Monorepo npm workspaces                           | aceito                  |
| [006](006-odcs-escopo.md)            | ODCS: documentação viva + gate de CI, sem codegen | aceito                  |
| [007](007-rds-data-api.md)           | RDS Data API (Lambda sem VPC)                     | aceito                  |
| [008](008-regiao-dados.md)           | Região dos dados: sa-east-1 (voto de minerva)     | aceito                  |
| [009](009-design-system.md)          | Design system tokenizado (escuro primeiro)        | aceito                  |
| [010](010-evolucao-maturidade.md)    | Evolução da equipe: maturidade por área           | aceito                  |
| [011](011-patentes-gamificacao.md)   | Patentes do protótipo (emenda dec. 1 e 2 do 010)  | aceito                  |
| [012](012-rota-publica-api.md)       | Rota pública `/api/v1/public/*` cacheada na borda | aceito                  |
| [013](013-regulamento-embutido.md)   | Regulamento embutido (pdf.js) só com autorização  | substituído por ADR-014 |
| [014](014-copia-do-regulamento.md)   | Cópia do regulamento servida pelo portal          | aceito                  |
