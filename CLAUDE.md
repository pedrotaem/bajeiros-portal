# Bajeiros — portal das equipes

Monorepo npm workspaces. Portal comunitário do Baja SAE brasileiro: validador de gaiola B6,
fichas técnicas, evolução de equipe, assistente do regulamento.

**Idioma do repo é pt-BR** — código, comentário, commit, spec e doc. Comentário explica
**por quê**, não o quê.

## Mapa

```
apps/api          Fastify + RDS Data API (Aurora PG 16)   @bajeiros/api
apps/web          React 18 + Vite + three.js/r3f          @bajeiros/web
packages/         auth · core · datasheet · evolution
contracts/        ODCS (*.odcs.yaml) — contrato de dado
infra/            Terraform (envs/ + modules/)
specs/            spec.md (MVP) · design.md · rules.md · draft-features.md · drafts/
docs/adr/         decisões de arquitetura
docs/             design-system.md (normativo) · runbook.md · threat-model.md
```

## Comandos

```bash
npm run lint          # eslint + check-tokens + check-icons  <- roda os dois guardas
npm test              # vitest em todos os workspaces
npm run typecheck     # tsc em todos os workspaces
npm run build         # build do web
npm run format        # prettier --write
npm run contracts:check
npm run tokens:build  # tokens.ts -> tokens.css (gerado, não editar o .css à mão)
```

Node 24 (`.nvmrc`). CI: `ci.yml` (lint·typecheck·test·build), `deploy.yml`, `infra-ci.yml`,
mais CodeQL e gitleaks.

## Guardas invioláveis

Falham o `lint` e o CI. Não contorne — emende a regra ou o baseline com motivo escrito.

- **Zero hex fora de `tokens.ts`/`tokens.css`.** `check-tokens` varre `apps/web/src`
  e tem catraca por arquivo que **só pode cair**. Use `var(--bj-*)`.
- **Teto de iconografia:** 24 formas (`Icon*`) e 4 marcas de produto (`Mark*`), doador único
  Lucide. `check-icons` também proíbe, dentro de `glyphs.tsx`/`marks.tsx`: cor literal, `fill`,
  `opacity`, `stroke-dasharray`, `strokeWidth`, `<g>` e `url()`.
- **Marca identifica produto nomeado** e nunca aparece sem rótulo ao lado.
- **Contratos ODCS** batem com o schema (`contracts:check`).

Fonte normativa: `docs/design-system.md`. Ele manda; este arquivo só aponta.

## Convenções que já custaram caro

<!-- caveman ultra: uma linha por lição, só o que muda decisão futura. Teto 500 linhas no
     arquivo inteiro. Lição que virou teste ou guarda SAI daqui — a guarda é o registro. -->

- `check-tokens` **não isenta comentário**. Hex em comentário quebra o lint.
- Rail estreito tem **dois caminhos**: classe `.bj-shell-compacto` e media query `1199px`.
  Regra que esconde algo no rail precisa existir nos dois.
- **ADR não se edita, se supersede.** Definição mudou → emenda o doc normativo. Escolha de
  nível ADR mudou → ADR novo + uma linha `Status: substituído por ADR-0NN` no antigo.
- **Spec fechada:** promove US/FR para `spec.md`, marca ✅ em `draft-features.md`, e o arquivo
  em `drafts/` **fica** com o link. Não move nem apaga.
- **ADR pode declarar a própria condição de promoção** ("vira aceito com o merge de X"). Conferir
  se disparou antes de tratar como pendente.
- Assets de `apps/web/public/marca/` são **gerados** por script, fora deste repo. Não editar PNG.
- `tokens.css` é gerado de `tokens.ts`. Editar o CSS direto é perda garantida.
- Tema tem **dois seletores**: `:root[data-theme='light']` e
  `@media (prefers-color-scheme: light) { :root:not([data-theme='dark']) }`. Regra temática
  precisa dos dois.
- `docs/handoff-sessao.md` e `docs/arquitetura.html` são **gitignored** — sem CI, sem review,
  já mentiram sobre o estado. Conferir contra o repo antes de agir sobre o que dizem.
- Contador em prosa envelhece (testes, migrações, contratos). Medir, não citar.
- three.js não interpreta `var()`: material 3D lê o token de `tokens.ts`, não do CSS.
- `drei/Html` = **root React separado**. Input controlado dentro dele precisa do estado **dentro do
  portal**; estado fora perde teclas (o root restaura o valor antigo antes do estado chegar).
- Teste que **crava número do template** (posição de nó/âncora, contagem, entre-eixos) quebra a
  cada template novo. Comparar com `templateCage`, não cravar.
- JSON exportado de staging **vira template só depois de `evaluate`**: já veio com SUSP.1 e SUSP.2
  falhando (âncora fora do tubo, declarado ≠ medido). Normalizar e registrar no cabeçalho do
  `template.ts`.
- Site da organização (`saebrasil.org.br`) devolve **403 a cliente não-browser** (`WebFetch`) e
  troca URL de sub-página sem redirect. Coletar pelo Chrome; guardar URL + data da conferência.
- Rota **sem auth** só nasce em `/api/v1/public/*` (montado antes do `requireAuth`), lê via
  `withPublic` (sem `app.user_id` — só policy `USING (true)` responde) e sai com
  `Cache-Control` público. Coluna `date` sai do banco como `to_char(..., 'YYYY-MM-DD')`: o pg
  devolve `Date` local e a Data API devolve string — um prazo é um dia, não um instante.

## Trabalhar aqui

- Branch a partir de `main`; PR com base `main`. Não commitar direto na `main`.
- `npm run lint && npm test && npm run typecheck` antes de abrir PR.
- Feature nova nasce como spec em `specs/drafts/` antes do código.
- **O working tree pode estar compartilhado com outra sessão.** `git status` antes de
  commitar; só faça `git add` dos arquivos que você mesmo tocou.
- **Ao fechar a sessão, rode `/handoff`** (`.claude/skills/handoff/`). Ela roteia o que a
  sessão produziu: definição → doc normativo ou ADR, implementação → specs, aprendizado →
  este arquivo, perecível → morre. Sem isso o `docs/handoff-sessao.md` volta a ser a única
  memória, e ele não é revisado por ninguém.

## Ler sob demanda (não carregar por padrão)

| Quando                                | Arquivo                                     |
| ------------------------------------- | ------------------------------------------- |
| mexer em cor, ícone, componente, tema | `docs/design-system.md`                     |
| entender uma decisão de arquitetura   | `docs/adr/`                                 |
| requisito do validador (US/FR)        | `specs/spec.md` · `specs/rules.md`          |
| feature em andamento                  | `specs/drafts/` · `specs/draft-features.md` |
| operar staging/prod                   | `docs/runbook.md`                           |
| o que a sessão anterior aprendeu      | `docs/handoff-sessao.md`                    |
