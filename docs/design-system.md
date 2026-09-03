# Design System — Bajeiros

**Data:** 2026-08-26 · **Versão:** 1.0 (normativo) · **Escopo:** `apps/web`
**Status:** proposto (2026-08-26, direção de design decidida + auditorias css/ux/3d/docs + crítica adversarial de acessibilidade, viabilidade e marca)
**Documentos irmãos:** [`specs/design.md`](../specs/design.md), [`specs/spec.md`](../specs/spec.md), [`docs/estudo-design.md`](estudo-design.md) (a medição e o argumento), [`docs/plano-implementacao-design.md`](plano-implementacao-design.md) (as 13 fases de migração) e [`docs/adr/009-design-system.md`](adr/009-design-system.md) (a decisão de tokens/tema/ausência de framework), indexada em [`docs/adr/README.md`](adr/README.md)

Este documento é **normativo**. Ele existe para que uma pessoa implemente a interface sem precisar
perguntar nada e sem precisar decidir nada de cor, medida, forma ou texto. Onde ele diz "proibido",
é proibido e o CI reprova. Onde ele registra pendência, a pendência é conhecida e está marcada.

Direção fixada, fora de discussão neste documento: **arquitetura de interação do Claude Console +
gradação cromática Mad Max**, com o ocre como **acento e nunca superfície**. A referência Mad Max é
**fonte de matiz e nada mais**: nenhuma decisão deste documento pode ser justificada por narrativa
temática — toda decisão cita medição.

---

## 1. Fundamentos

### 1.1 Onde os tokens vivem

| Arquivo                       | Papel                                                                                              |
| ----------------------------- | -------------------------------------------------------------------------------------------------- |
| `apps/web/src/tokens.ts`      | **Fonte de verdade.** Módulo TS com três grupos: `dark`, `light`, `viewport3d`. Nada mais é fonte. |
| `apps/web/src/tokens.css`     | Custom properties CSS. **Gerado** de `tokens.ts`, versionado no repo, nunca editado à mão.         |
| `apps/web/src/styles.css`     | Folha da aplicação. Primeira linha: `@import './tokens.css';`. Zero literais de cor.               |
| `scripts/build-tokens.mjs`    | Gerador `tokens.ts` → `tokens.css`. Roda em `npm run build` e no pre-commit.                       |
| `scripts/check-tokens.mjs`    | Guarda de CI (§1.4).                                                                               |
| `apps/web/src/tokens.test.ts` | Paridade `tokens.ts` ↔ `tokens.css` + contratos de contraste (§1.4).                               |

Três consumidores leem **o mesmo símbolo**: a regra CSS (via `var()`), o material three.js (via
`import { viewport3d } from './tokens'`) e o swatch da legenda 2D. É o que impede a recorrência da
divergência histórica `#e5484d` (3D) × `#ff8a8e` (badge) para o mesmo conceito.

**Consequência operacional obrigatória:** three.js **não lê custom properties CSS**.
`<meshStandardMaterial color="var(--bj-3d-member)" />` não funciona — `THREE.Color` parseia strings
de cor, não `var()`. Materiais 3D importam de `tokens.ts`. Quem tentar `var()` num material perde
meia hora; está escrito aqui para não perder.

### 1.2 Como usar os tokens

- **Sempre `var(--bj-*)`.** Nenhum valor de cor, raio, sombra, duração ou passo de espaço é escrito
  literalmente fora de `tokens.css`.
- **Não derivar cor em tempo de CSS.** Sem `color-mix()`, sem `filter: brightness()`, sem
  `opacity` para simular estado. Se um estado precisa de uma cor, ele usa um token que já existe.
  Os seis `filter: brightness(1.25/1.3)` legados são convertidos para `--bj-hover` / `--bj-active`
  na migração — `brightness()` clareia borda e texto junto com o fundo e destrói o contraste medido.
- **Um mecanismo por estado.** Hover é `background: var(--bj-hover)`. Ativo é
  `background: var(--bj-active)`. Selecionado é `background: var(--bj-selected)` **mais** uma pista
  não-cromática (§2.5). Três mecanismos concorrentes de hover é o defeito que esta migração corrige.
- **Espaçamento, raio, tipografia e duração também são tokens.** `padding: 7px` é tão proibido
  quanto `color: #f3a712`.
- **Prefixo de classe `bj-` para componente novo ou reescrito.** Permite migrar família por família
  sem `!important` e sem colisão com as ~185 classes planas legadas.

### 1.3 Regra dura: nenhum hex fora de `tokens.css`

Proibido em `apps/web/src/**`, exceto `tokens.ts` e `tokens.css`:

- literais `#rgb`, `#rrggbb`, `#rrggbbaa`;
- `rgb()`, `rgba()`, `hsl()`, `hsla()` com canais literais;
- nomes de cor CSS (`red`, `white`, `transparent` é permitido);
- `style={{ color: '…' }}` e `style={{ background: '…' }}` em TSX;
- `filter: brightness()`, `filter: invert()`, `opacity` usada como estado de cor.

Permitido: `currentColor`, `transparent`, `inherit`, e os valores importados de `tokens.ts`.

### 1.4 Como o lint garante isso

O repo não tem stylelint e não vai ganhar um: o guarda é um script Node no mesmo molde do
`scripts/check-contracts.mjs` que já existe, ligado ao job de CI (`lint · format:check · typecheck ·
test · build`).

`scripts/check-tokens.mjs` — reprova quando:

1. `apps/web/src/**/*.{css,ts,tsx}` contém `/#[0-9a-fA-F]{3,8}\b/` fora de `tokens.ts`/`tokens.css`;
2. `apps/web/src/**/*.css` contém `rgb(`/`hsl(` com número literal fora de `tokens.css`;
3. `styles.css` contém `filter:` com `brightness`/`invert`;
4. `styles.css` contém `px` em `font-size`, `border-radius`, `padding`, `margin`, `gap`,
   `box-shadow` (exceto `0`, `1px` e `2px` de hairline/offset declarados na lista de exceções do
   script);
5. `tokens.css` diverge do que `scripts/build-tokens.mjs` gera a partir de `tokens.ts`
   (mesmo padrão de `contracts:check`);
6. qualquer arquivo contém `hsl(from ` ou `color-mix(` — §1.6.

`apps/web/src/tokens.test.ts` (vitest, ~80 linhas) — reprova quando:

1. uma razão de contraste da tabela de contratos (§2.6) cai abaixo do piso;
2. um par CIEDE2000 do grupo `viewport3d` cai abaixo do piso de ΔE (§9.4);
3. `tokens.ts` e `tokens.css` divergem em qualquer chave.

Isso não é ornamento de processo. Duas razões passam com folga de 0,01: `--bj-fail` sobre
`--bj-bg-raised` = **4,51** e `--bj-brand` claro sobre `--bj-brand-bg` = **4,50**. Sem teste, um
ajuste de um canal reprova a paleta em silêncio — que foi exatamente como os 47 casos reprovados do
CSS legado surgiram.

**O que este sistema NÃO tem e não vai fingir ter:** teste de regressão visual. `apps/web` tem 14
casos de teste, ambos de store zustand; não há jsdom, testing-library, playwright nem storybook em
nenhum workspace. Uma reescrita de ~620 declarações roda com detecção automática **zero** para
layout. A rede de proteção realista é: teste de contraste + paridade no CI, e **checklist manual de
screenshot dos 5 produtos (editor, assistente, equipes, admin, landing) por PR**.

### 1.5 Contratos duros do sistema

Cinco regras que valem em todo o documento e que os componentes do §7 apenas aplicam.

- **CT-1 — Tier de borda.** `--bj-border` (1,36:1 dark / 1,27:1 light) é hairline decorativo:
  divisor, separador de lista, grade de tabela. **Nunca** é o único limite visual de um controle
  interativo. Todo `input`, `select`, `textarea`, `checkbox` e botão de superfície usa
  `--bj-border-strong` (3,25:1 dark e 3,27:1 light sobre `--bj-bg-base`; **≥ 3,0 nas seis
  superfícies dos dois modos**, pior caso 3,06 em `overlay` escuro e 3,02 em `inset` claro — §2.6).
- **CT-2 — Degrau de superfície não é limite.** Os passos adjacentes da rampa medem 1,05 a 1,11:1
  (`inset`→`sunken` = 1,05; `sunken`→`base` = 1,07). Em painel TN de notebook e em projetor isso não
  existe. Todo limite que **carrega significado** (moldura do viewport, cabeçalho × corpo de tabela,
  painel × painel, card × fundo) usa borda explícita. _Pendência registrada: validar a rampa de seis
  níveis em projetor real antes de congelá-la; se colapsar, cortar `--bj-bg-overlay` e trabalhar com
  cinco._
- **CT-3 — Status nunca depende só de cor.** Todo estado (`pass`/`fail`/`warn`/`manual`/`info`)
  carrega **ícone + texto** com a string canônica do §11.3. Vale para chip, ponto, linha de tabela,
  nó de organograma, faixa de escore e legenda. Medido: `brand` × `warn` dá ΔE00 **0,9** em
  deuteranopia no escuro e **1,1** no claro; `fail` × `warn` no claro dá **1,1**. A cor é reforço,
  não portador.
- **CT-4 — Foco, seleção e destaque são três canais distintos.** Foco = `outline` externo com
  offset. Seleção = tinta `--bj-selected` **mais** borda `--bj-border-strong` **mais**
  `aria-selected`/`aria-current`. Destaque de regra = barra `inset 3px` em `--bj-accent`. Os três
  nunca são o mesmo desenho, ainda que compartilhem matiz.
- **CT-5 — `--bj-selected` só existe como `background`.** Composto, rende 1,25:1 (dark) e 1,21:1
  (light) contra `--bj-bg-base`. **Proibido** em `border-color`, `color`, `outline` e `box-shadow`.
  Um componente que precisa comunicar seleção pela borda usa `--bj-border-stronger` ou
  `--bj-brand-border`.

### 1.6 Desvios registrados em relação ao briefing de tokens

Três valores do briefing foram reescritos por defeito verificado, não por gosto. Ficam registrados
aqui porque quem implementar vai comparar os dois textos.

1. **Sintaxe de cor relativa eliminada.** Os treze tokens definidos como `hsl(from #fff h s l / X%)`
   viram `rgb(R G B / X%)` literal. O alvo de build do projeto é `chrome107/edge107/firefox104/
safari16` (Vite, `baseline-widely-available`; `vite.config.ts` não sobrescreve). Relative color
   syntax exige Chrome 119 / Safari 16.4 / Firefox 128 — acima de **todos** os quatro, e o esbuild
   não rebaixa. O modo de falha não é degradar: o custom property fica inválido,
   `border: 1px solid var(--bj-border)` vira _invalid at computed-value time_, o shorthand inteiro
   cai para `unset`, `border-style` volta a `none` e as **79 bordas do app somem**; `--bj-hover`,
   `--bj-active` e `--bj-selected` viram `transparent` e as seis sombras viram `none`. Todas as
   origens eram literais, então a conversão tem perda de informação **zero**.
2. **`--bj-focus-ring` deixa de ser `box-shadow`.** Vira `--bj-focus-ring-color` +
   `--bj-focus-ring-offset` aplicados como `outline`. Motivo: `box-shadow` é recortado por
   `overflow: hidden` do ancestral e há pelo menos nove no CSS legado (dropdown de conta, modal,
   cards de admin/assistente/team, `.page-body`, `.page-inner`, organograma) — o anel sumiria
   exatamente nos itens de borda de dropdown, modal e card. E `box-shadow` não é renderizado em
   `forced-colors`, o que apaga o indicador de foco para quem mais depende dele. `outline` não é
   recortado e sobrevive ao alto contraste. As cores (`#4fb8d8` / `#15637a`) são as do briefing.
3. **Tokens estruturais acrescentados.** Larguras, alturas de controle, alvo mínimo, densidades,
   z-index e scrim (§4, §5). Nenhum introduz **cor nova**: o scrim é alfa de `#0a0603` (dark, mesma
   base das sombras) e de `#251c15` (light, mesma base das bordas claras). Sem eles a migração de
   cor sai do PR com `380px`, `24×22px` e `z-index: 200` sobrescrito por `50` intactos, e o sistema
   novo passa a legitimar os defeitos.

---

## 2. Cor

### 2.1 Estratégia de tema — exata

- **Escuro é o modo canônico.** Ele mora em `:root` nu. Um navegador sem suporte a
  `prefers-color-scheme`, um render sem JS e um usuário sem preferência recebem o escuro.
- **Claro é modo de alta luminosidade**, não segunda expressão de marca (§2.7).
- Precedência: escolha explícita do usuário (`data-theme` na raiz) **vence** a preferência do SO.

```css
:root {
  color-scheme: dark;
}
:root[data-theme='light'] {
  color-scheme: light;
}
@media (prefers-color-scheme: light) {
  :root:not([data-theme='dark']) {
    color-scheme: light;
  }
}
```

Três seletores, nesta ordem, em `tokens.css`:

1. `:root { … }` — corpo **dark** completo (§2.2). É o padrão.
2. `:root[data-theme='light'] { … }` — corpo **light** completo (§2.3). Escolha explícita.
3. `@media (prefers-color-scheme: light) { :root:not([data-theme='dark']) { … } }` — corpo **light**
   idêntico ao de (2). Preferência do SO, cancelável por `data-theme="dark"`.

O corpo claro aparece **duas vezes** no arquivo. Isso é intencional e não é duplicação manual:
`scripts/build-tokens.mjs` emite os dois blocos a partir de `tokens.light`. Editar `tokens.css` à
mão é proibido (§1.1).

O grupo `viewport3d` (§9) fica em `:root` e **não tem variante clara** — decisão declarada, não
omissão (§9.1).

### 2.2 Bloco dark — copiável, completo

```css
:root {
  color-scheme: dark;

  /* superfícies — rampa neutra quente, OKLCh h=68° C=0.013, passo de L 0.029 */
  --bj-bg-canvas: #211c16;
  --bj-bg-base: #28231d;
  --bj-bg-raised: #2f2a24;
  --bj-bg-overlay: #37312b;
  --bj-bg-sunken: #1a1510;
  --bj-bg-inset: #140f0a;

  /* texto */
  --bj-fg-primary: #f1efeb;
  --bj-fg-secondary: #c2bdb7;
  --bj-fg-muted: #98938d;
  --bj-fg-faint: #7f7a74;
  --bj-fg-inverse: #19120d;
  --bj-disabled-fg: #6e6860;

  /* bordas — alfa sobre branco */
  --bj-border: rgb(255 255 255 / 10%);
  --bj-border-strong: rgb(255 255 255 / 36%);
  --bj-border-stronger: rgb(255 255 255 / 55%);

  /* marca */
  --bj-brand: #c89123;
  --bj-brand-strong: #e0a72e;
  --bj-brand-dim: #b58f54;
  --bj-brand-bg: #2e2109;
  --bj-brand-border: #887040;
  --bj-on-brand: #1a1206;

  /* acento */
  --bj-accent: #4fb8d8;
  --bj-accent-bg: #0e2a35;
  --bj-accent-border: #4d7a8a;
  --bj-on-accent: #08161c;

  /* status */
  --bj-pass: #6fb060;
  --bj-pass-bg: #16240f;
  --bj-pass-border: #64795d;
  --bj-on-pass: #0d1409;
  --bj-fail: #e56e4d;
  --bj-fail-bg: #3a1610;
  --bj-fail-border: #97685d;
  --bj-on-fail: #1b0d08;
  --bj-warn: #e07a24;
  --bj-warn-bg: #331e07;
  --bj-warn-border: #8e6d4d;
  --bj-on-warn: #1c1004;
  --bj-manual: #8ba3bc;
  --bj-manual-bg: #182029;
  --bj-manual-border: #667584;
  --bj-on-manual: #0e1319;
  --bj-info: #b8ada0;
  --bj-info-bg: #26211b;
  --bj-info-border: #78736c;
  --bj-on-info: #17130e;

  /* estados de interação */
  --bj-hover: rgb(255 255 255 / 5.5%);
  --bj-active: rgb(255 255 255 / 10%);
  --bj-selected: rgb(200 145 35 / 14%);
  --bj-scrim: rgb(10 6 3 / 72%);

  /* foco */
  --bj-focus-ring-color: #4fb8d8;
  --bj-focus-ring-offset: 2px;

  /* forma */
  --bj-radius-sm: 4px;
  --bj-radius: 8px;
  --bj-radius-lg: 12px;
  --bj-radius-pill: 999px;

  /* elevação */
  --bj-shadow-sm: 0 1px 2px 0 rgb(10 6 3 / 40%), 0 2px 8px 0 rgb(0 0 0 / 24%);
  --bj-shadow-md: 0 2px 4px 0 rgb(10 6 3 / 44%), 0 8px 24px 0 rgb(0 0 0 / 34%);
  --bj-shadow-lg: 0 4px 8px 0 rgb(10 6 3 / 48%), 0 24px 56px 0 rgb(0 0 0 / 46%);

  /* espaço — base 4 */
  --bj-space-1: 4px;
  --bj-space-2: 8px;
  --bj-space-3: 12px;
  --bj-space-4: 16px;
  --bj-space-5: 24px;
  --bj-space-6: 32px;
  --bj-space-7: 48px;
  --bj-space-8: 64px;

  /* tipografia */
  --bj-font-display:
    'Newsreader', 'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, 'Times New Roman',
    serif;
  --bj-font-sans:
    'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  --bj-font-mono:
    'JetBrains Mono', ui-monospace, 'Cascadia Mono', Consolas, 'Liberation Mono', monospace;
  --bj-text-xs: 11px;
  --bj-text-sm: 12px;
  --bj-text-base: 14px;
  --bj-text-lg: 16px;
  --bj-text-xl: 18px;
  --bj-text-2xl: 22px;
  --bj-text-3xl: 30px;
  --bj-leading-tight: 1.2;
  --bj-leading-normal: 1.55;
  --bj-weight-regular: 400;
  --bj-weight-medium: 500;
  --bj-weight-bold: 700;
  --bj-tracking-wide: 0.04em;

  /* movimento */
  --bj-ease: cubic-bezier(0.2, 0, 0, 1);
  --bj-dur-fast: 120ms;
  --bj-dur-base: 200ms;

  /* estrutura — iguais nos dois modos (§4, §5) */
  --bj-rail-w: 224px;
  --bj-rail-w-compact: 56px;
  --bj-topbar-h: 48px;
  --bj-panel-w: 360px;
  --bj-panel-w-sm: 320px;
  --bj-panel-w-min: 280px;
  --bj-viewport-min-w: 360px;
  --bj-modal-w: 560px;
  --bj-modal-w-lg: 880px;
  --bj-page-w: 1200px;
  --bj-prose-w: 860px;
  --bj-control-h-sm: 28px;
  --bj-control-h: 32px;
  --bj-control-h-lg: 40px;
  --bj-target-min: 32px;
  --bj-z-base: 0;
  --bj-z-sticky: 10;
  --bj-z-3d-label: 40;
  --bj-z-viewport-chrome: 50;
  --bj-z-dropdown: 60;
  --bj-z-overlay: 100;
  --bj-z-modal: 110;
  --bj-z-toast: 120;
  --bj-z-landing: 200;

  /* viewport 3D — sem variante clara (§9.1) */
  --bj-3d-bg: #140f0a;
  --bj-3d-grid: #6c5e51;
  --bj-3d-member: #e2d6c4;
  --bj-3d-member-secondary: #928780;
  --bj-3d-selected: #ffbb54;
  --bj-3d-fail: #e56e4d;
  --bj-3d-removable: #b2aadb;
  --bj-3d-anchor-ok: #3186d4;
  --bj-3d-anchor-bad: #e56e4d;
  --bj-3d-node: #6c788b;
  --bj-3d-node-named: #d5effd;
  --bj-3d-pilot: #6bb5ab;
  --bj-3d-datum: #4fb8d8;
  --bj-3d-label-fg: #ece7dd;
  --bj-3d-label-bg: #241f19;
}
```

`--bj-3d-datum` é **alias de valor** de `--bj-accent` com papel fechado (gabarito de habitáculo, zona
do punho, ponto normativo). Existe como nome próprio para que o 2D e a cena possam divergir sem
caçar ocorrências — ver §2.5, sobrecarga do ciano.

### 2.3 Bloco light — copiável, completo

```css
:root[data-theme='light'] {
  color-scheme: light;

  --bj-bg-canvas: #f4e9d9;
  --bj-bg-base: #faf2e6;
  --bj-bg-raised: #fdf8f0;
  --bj-bg-overlay: #fffdfb;
  --bj-bg-sunken: #eadecc;
  --bj-bg-inset: #e1d3be;

  --bj-fg-primary: #251c15;
  --bj-fg-secondary: #52473f;
  --bj-fg-muted: #70655c;
  --bj-fg-faint: #7f766e;
  --bj-fg-inverse: #faf2e6;
  --bj-disabled-fg: #9a8f84;

  /* bordas invertem para alfa sobre a tinta — alfa-branco sobre areia é invisível.
     Esta é a única inversão estrutural entre os modos. */
  --bj-border: rgb(37 28 21 / 12%);
  --bj-border-strong: rgb(37 28 21 / 51%);
  --bj-border-stronger: rgb(37 28 21 / 68%);

  --bj-brand: #805c12;
  --bj-brand-strong: #684a0f;
  --bj-brand-dim: #7e643c;
  --bj-brand-bg: #f1dcac;
  --bj-brand-border: #957a42;
  --bj-on-brand: #fbf5ea;

  --bj-accent: #15637a;
  --bj-accent-bg: #d8ecf3;
  --bj-accent-border: #658b98;
  --bj-on-accent: #f4fbfd;

  --bj-pass: #3d6a2c;
  --bj-pass-bg: #e3efd7;
  --bj-pass-border: #728f62;
  --bj-on-pass: #f6faf1;
  --bj-fail: #a3341c;
  --bj-fail-bg: #fadfd5;
  --bj-fail-border: #ad7564;
  --bj-on-fail: #fdf3ef;
  --bj-warn: #93450f;
  --bj-warn-bg: #fae2c9;
  --bj-warn-border: #a57c4e;
  --bj-on-warn: #fdf5ec;
  --bj-manual: #3a5169;
  --bj-manual-bg: #dfe7f0;
  --bj-manual-border: #758696;
  --bj-on-manual: #f4f7fb;
  --bj-info: #5d5347;
  --bj-info-bg: #ece2d2;
  --bj-info-border: #8c806f;
  --bj-on-info: #faf6ef;

  --bj-hover: rgb(37 28 21 / 5%);
  --bj-active: rgb(37 28 21 / 10%);
  --bj-selected: rgb(128 92 18 / 14%);
  --bj-scrim: rgb(37 28 21 / 40%);

  --bj-focus-ring-color: #15637a;

  --bj-shadow-sm: 0 1px 2px 0 rgb(74 52 18 / 10%), 0 2px 8px 0 rgb(74 52 18 / 8%);
  --bj-shadow-md: 0 2px 4px 0 rgb(74 52 18 / 12%), 0 8px 24px 0 rgb(74 52 18 / 12%);
  --bj-shadow-lg: 0 4px 8px 0 rgb(74 52 18 / 14%), 0 24px 56px 0 rgb(74 52 18 / 18%);
}

@media (prefers-color-scheme: light) {
  :root:not([data-theme='dark']) {
    /* corpo idêntico ao de :root[data-theme='light'] acima.
       Emitido pelo mesmo `tokens.light` por scripts/build-tokens.mjs — não duplicar à mão. */
  }
}
```

Tudo que **não** aparece no bloco claro (raios, espaço, tipografia, movimento, estrutura, `viewport3d`,
`--bj-focus-ring-offset`) é herdado de `:root` e é idêntico nos dois modos, por decisão.

### 2.4 Escalas auxiliares — densidade e apresentação

```css
[data-density='compact'] {
  --bj-row-h: 28px;
  --bj-pad-y: var(--bj-space-1);
  --bj-pad-x: var(--bj-space-2);
  --bj-gap: var(--bj-space-2);
}
[data-density='comfortable'] {
  --bj-row-h: 36px;
  --bj-pad-y: var(--bj-space-2);
  --bj-pad-x: var(--bj-space-3);
  --bj-gap: var(--bj-space-3);
}

/* Modo apresentação — projetor e sala de aula. Só redefine a escala tipográfica. */
[data-scale='presentation'] {
  --bj-text-xs: 13px;
  --bj-text-sm: 14px;
  --bj-text-base: 16px;
  --bj-text-lg: 18px;
  --bj-text-xl: 22px;
  --bj-text-2xl: 28px;
  --bj-text-3xl: 38px;
  --bj-control-h-sm: 32px;
  --bj-control-h: 36px;
  --bj-target-min: 40px;
}
```

`compact` é o padrão do editor (checklist, Inspector, tabelas de admin). `comfortable` é o padrão de
página de conteúdo (assistente, landing, visão geral de equipe).

### 2.5 Tabela semântica — token → uso permitido → uso proibido

| Token                   | Uso permitido                                                                                        | Uso proibido                                                                                |
| ----------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `--bj-bg-canvas`        | Fundo do shell, atrás do rail e entre painéis.                                                       | Fundo de card, de campo ou de modal.                                                        |
| `--bj-bg-base`          | Painel padrão: rail, topbar, sidebar, corpo de página, corpo de tabela.                              | Fundo de campo de entrada.                                                                  |
| `--bj-bg-raised`        | Card, chip neutro, botão secundário em repouso, linha de tabela destacada.                           | Fundo de página inteira.                                                                    |
| `--bj-bg-overlay`       | Modal, dropdown, popover, tooltip, toast.                                                            | Superfície fixa de layout. **Texto `--bj-fail` (4,07:1) e `--bj-warn` (4,26:1) sobre ele.** |
| `--bj-bg-sunken`        | Moldura do viewport, cabeçalho de tabela, cabeçalho de painel, faixa de escore.                      | Texto corrido longo.                                                                        |
| `--bj-bg-inset`         | Poço: `input`, `select`, `textarea`, bloco de código, campo de busca.                                | Card aninhado (usar `raised` sobre `base`).                                                 |
| `--bj-fg-primary`       | Corpo de texto, título, valor numérico, rótulo de controle.                                          | —                                                                                           |
| `--bj-fg-secondary`     | Rótulo de campo, texto de apoio, descrição de card, `th`.                                            | —                                                                                           |
| `--bj-fg-muted`         | Metadado, texto grande secundário (≥ 18,66px, ou 14px bold).                                         | Corpo de texto sobre `overlay` (4,21) ou sobre `sunken`/`inset` claros (4,27/3,85).         |
| `--bj-fg-faint`         | Marca d'água, contador, texto **grande** decorativo. Piso 3,02:1 na pior superfície.                 | **Qualquer texto normal.** Nunca no disclaimer legal, que é conteúdo obrigatório.           |
| `--bj-fg-inverse`       | Texto sobre superfície de marca em tema claro.                                                       | Sobre superfície neutra.                                                                    |
| `--bj-disabled-fg`      | Texto e ícone de controle desabilitado (isento por WCAG 1.4.3).                                      | Texto informativo que o usuário precisa ler.                                                |
| `--bj-border`           | Divisor, separador de lista, grade interna de tabela, hairline de card.                              | **Único limite de controle interativo** (CT-1).                                             |
| `--bj-border-strong`    | `input`, `select`, `checkbox`, botão de superfície, moldura do viewport, limite painel × painel.     | —                                                                                           |
| `--bj-border-stronger`  | Item selecionado, nó de organograma selecionado, ênfase de limite.                                   | Borda padrão de tudo (vira ruído a 5,69:1).                                                 |
| `--bj-brand`            | Marca-palavra, botão primário (**fundo**), item ativo do rail, régua de assinatura, link ativo.      | **Cena 3D.** Chip de status. Estado de dado. Ícone de alerta.                               |
| `--bj-brand-strong`     | Hover do botão primário; marca em display ≥ `--bj-text-2xl`.                                         | Texto pequeno sobre superfície neutra no claro.                                             |
| `--bj-brand-dim`        | Vice-capitão no organograma, marca decorativa de baixa ênfase.                                       | Texto de status.                                                                            |
| `--bj-brand-bg`         | Chip de marca (capitão, vaga, projeto atual), fundo de item ativo do rail.                           | **Chip de status.** Ver a colisão brand × warn no fim desta seção.                          |
| `--bj-brand-border`     | Borda de chip de marca; borda de seleção quando `--bj-border-stronger` for pesada demais.            | —                                                                                           |
| `--bj-on-brand`         | Texto e ícone sobre `--bj-brand`/`-strong`/`-dim`.                                                   | Sobre superfície neutra.                                                                    |
| `--bj-accent`           | Destaque de regra ativa (barra `inset 3px`), chip de citação, toast informativo, barra de progresso. | Anel de foco (usar `--bj-focus-ring-color`). Estado ativo de toggle sem pista adicional.    |
| `--bj-accent-bg`        | Fundo de item de regra ativo, fundo de chip de citação, fundo de mensagem do usuário.                | Fundo de página.                                                                            |
| `--bj-accent-border`    | Borda dos itens acima.                                                                               | —                                                                                           |
| `--bj-on-accent`        | Texto sobre `--bj-accent` chapado.                                                                   | —                                                                                           |
| `--bj-pass`             | Texto/ícone de **CONFORME** no 2D.                                                                   | **Cena 3D** — conformidade é ausência de status (§9.3).                                     |
| `--bj-fail`             | Texto/ícone de **INFRAÇÃO**, contagem de infrações, faixa de escore ruim.                            | Sobre `--bj-bg-overlay` nu (4,07:1). Ação destrutiva sem confirmação.                       |
| `--bj-warn`             | Texto/ícone de **VERIFICAR**.                                                                        | Sobre `--bj-bg-overlay` nu (4,26:1). Qualquer papel de marca.                               |
| `--bj-manual`           | Texto/ícone de **PRESENCIAL** (verificação humana).                                                  | "Selecionado", "ativo", "info".                                                             |
| `--bj-info`             | Texto/ícone de **NOTA**. Único status acromático.                                                    | Chip de citação do assistente (usar `accent` — a leitura "referência normativa" é dele).    |
| `--bj-*-bg` / `-border` | Sempre em par com o `--bj-*` correspondente, no molde de chip do §7.7.                               | Cruzar famílias (fundo de `warn` com texto de `brand`).                                     |
| `--bj-hover`            | `background` de hover em qualquer superfície interativa.                                             | `border-color`, `color`.                                                                    |
| `--bj-active`           | `background` de `:active` e de estado pressionado.                                                   | Idem.                                                                                       |
| `--bj-selected`         | **Só `background`** de item selecionado (CT-5), sempre com borda e ARIA.                             | `border-color`, `color`, `outline`, `box-shadow`.                                           |
| `--bj-scrim`            | Fundo do overlay de modal e da landing.                                                              | Placa de rótulo 3D (essa é opaca, §9.5).                                                    |
| `--bj-focus-ring-color` | **Só** `outline-color` de `:focus-visible`.                                                          | Qualquer estado de dado.                                                                    |

**Colisão marca × atenção — resolvida por exclusão de forma, não por matiz.** `brand` (40°) e `warn`
(27,4°) estão a 12,6° e medem ΔE00 0,9 em deuteranopia. A separação real é:

1. **Polaridade.** Marca aparece como **superfície chapada com tinta escura** (`--bj-brand` de fundo,
   `--bj-on-brand` de texto). Status aparece como **chip tinto escuro com texto claro**
   (`--bj-warn-bg` + `--bj-warn-border` + `--bj-warn`). Botão ocre chapado e pílula marrom com letra
   laranja não se confundem.
2. **Proibição de forma.** A forma-chip (`--bj-*-bg` + `--bj-*-border` + `--bj-*` de texto) é
   **exclusiva dos cinco status**. A marca **não pode** usá-la. Consequência direta e obrigatória: o
   chip de _trainee_ do organograma, que hoje seria `--bj-brand-strong` sobre `--bj-brand-bg`, migra
   para `--bj-info-bg` / `--bj-info-border` / `--bj-info` com ícone. Sem isso, `brand-bg` × `warn-bg`
   (ΔE00 0,7) e `brand-border` × `warn-border` (ΔE00 2,5) tornam os dois chips a mesma coisa.
3. **Exclusão de domínio.** `--bj-brand` é **proibido na cena 3D**. O `pending` (nó a clicar) migra
   para `--bj-3d-datum`. Os dois nunca coabitam um pixel de WebGL.

O lint reforça (2): `scripts/check-tokens.mjs` reprova qualquer seletor que use `--bj-brand-bg` junto
de `--bj-*-border` de status no mesmo bloco.

**Sobrecarga do ciano — orçamento fechado.** A família ciano recebeu treze papéis na migração, que é
o mesmo defeito que a família âmbar tinha. Fica dividida em três nomes de papel fechado, com o mesmo
valor por enquanto: `--bj-focus-ring-color` (só foco de teclado), `--bj-accent` (só estado ativo e
referência normativa no 2D) e `--bj-3d-datum` (só normativo na cena). Um papel novo pede nome novo,
não reuso.

### 2.6 Contratos de contraste (o que o teste do §1.4 assere)

Todos os números vêm da auditoria de paleta (luminância relativa sRGB, WCAG 2.1; tokens com alfa
compostos sobre cada superfície antes de medir).

| Contrato                                                      | Piso | Pior caso medido                           |
| ------------------------------------------------------------- | ---- | ------------------------------------------ |
| `fg-primary` / `fg-secondary` sobre as 6 superfícies, 2 modos | 4,5  | 6,12 (`fg-secondary` / `inset` claro)      |
| `fg-muted` sobre as 6 superfícies, 2 modos                    | 3,0  | 3,85 (claro / `inset`)                     |
| `fg-faint` sobre as 6 superfícies, 2 modos                    | 3,0  | 3,02 (claro / `inset`)                     |
| `--bj-on-X` sobre `--bj-X` (7 pares, 2 modos)                 | 4,5  | 5,13 (`on-brand` / `brand-dim` claro)      |
| `--bj-X` sobre `--bj-X-bg` (7 status, 2 modos)                | 4,5  | 4,50 (`brand` claro)                       |
| `--bj-X` sobre `base` / `raised` / `canvas`                   | 4,5  | 4,51 (`fail` / `raised` escuro)            |
| `--bj-border-strong` composta, 6 superfícies, 2 modos         | 3,0  | 3,02 (claro / `inset`)                     |
| `--bj-*-border` sobre `base` e sobre o próprio `-bg`          | 3,0  | 3,00 (`warn-border` / `warn-bg` claro)     |
| `--bj-focus-ring-color` sobre as 6 superfícies, 2 modos       | 3,0  | 4,60 (claro / `inset`)                     |
| `--bj-3d-label-fg` / `--bj-3d-label-bg`                       | 4,5  | 13,26                                      |
| `--bj-3d-grid` / `--bj-3d-bg`                                 | 3,0  | 3,05 — ver a ressalva de espessura em §9.5 |

Três exceções registradas, não varridas para debaixo do tapete:

- **`--bj-disabled-fg`** mede 2,83 / 2,85 e fica assim: WCAG 1.4.3 isenta componentes desabilitados,
  e elevá-lo destrói o sinal de "indisponível".
- **`--bj-fg-faint`** continua reprovado para texto normal por construção do tier. Ele **não** é o
  token do disclaimer legal — o disclaimer é obrigação declarada do produto e usa `--bj-fg-secondary`
  em `--bj-text-sm`.
- **`--bj-selected`** composto rende 1,25:1 / 1,21:1. Não é corrigível por token; é corrigido por
  componente (CT-4, CT-5).

### 2.7 Tema claro — custo × benefício, honesto

O tema claro é **modo de alta luminosidade** para projetor e oficina iluminada. Não é uma segunda
expressão de marca, e o documento de paleta que o chamava de "papel de areia" errava: `--bj-bg-raised`
(`#fdf8f0`) e `--bj-bg-overlay` (`#fffdfb`) são branco, `--bj-bg-base` é quase branco, e o areia só
existe em `canvas`/`sunken`/`inset` — camadas que ficam cobertas por painel num app de três colunas
com `overflow: hidden` no `body`. O resultado é um app claro com acento marrom (`#805c12`), não um
pôster.

Custos reais, assumidos:

- **R11 ("um hex por conceito") passa a valer por modo, não globalmente.** `tokens.ts` expõe
  `dark.fail` e `light.fail` com o mesmo nome e valores diferentes.
- **A marca perde intensidade.** `#c89123` sobre areia dá 2,2:1 e não serve para texto. O claro usa
  `--bj-brand` `#805c12` (4,50:1) e o ocre do pôster sobrevive em `--bj-brand-dim`, restrito a
  display ≥ `--bj-text-2xl` e a elementos onde 3:1 basta.
- **Dobra a superfície de QA manual** num repo sem screenshot test, e os seis hexes legados com dois
  ou três papéis (o `#0f1216` que é fundo do body **e** fundo de campo; o `#171c22` que é chrome
  **e** botão **e** `th` sticky) passam despercebidos no escuro e quebram visivelmente no claro.

Por isso: **projetar os dois modos agora (é barato e evita retrabalho na fonte de verdade), entregar
só o escuro.** O tema claro é a última fase da fila (§12.4, fase 12), depois da tokenização completa.

E a justificativa que **não** vale: o gabarito de habitáculo a 1,91:1 não é resolvido pelo tema
claro, porque o viewport permanece escuro nos dois modos (§9.1). O gabarito é resolvido por wireframe
opaco + alfa recalibrado, no tema escuro, e isso é outro PR.

---

## 3. Tipografia

### 3.1 Famílias e o custo de carregamento

| Papel                       | Token               | Primeira escolha | O que roda hoje, sem baixar nada           |
| --------------------------- | ------------------- | ---------------- | ------------------------------------------ |
| Display (serifada)          | `--bj-font-display` | Newsreader       | Georgia (Windows/macOS), Palatino Linotype |
| Corpo (sans)                | `--bj-font-sans`    | Inter            | `system-ui` → Segoe UI no Windows          |
| Mono (ID de regra, medidas) | `--bj-font-mono`    | JetBrains Mono   | Consolas (Windows), `ui-monospace`         |

**Decisão para a v1: zero webfont.** As três famílias são declaradas exatamente como nos tokens, e
nenhum arquivo é carregado. Razões medidas, em ordem:

1. A CSP do site é `style-src 'self' 'unsafe-inline'; font-src 'self'` — **Google Fonts está
   bloqueado**. Alargar a CSP anda contra o objetivo já registrado na infra de promover a política a
   estrita. A única saída é auto-hospedar.
2. Auto-hospedar custa ~5 arquivos woff2 (Inter 400/500/700 + Newsreader 500 + JetBrains Mono 400),
   ≈ 150–250 KB, para um público declarado com "conexão variável" em oficina.
3. O fallback já é bom onde importa. `system-ui` no Windows **é** Segoe UI, então a substituição de
   `'Segoe UI'` do CSS legado é literalmente a mesma renderização com um token no lugar de um
   literal. Georgia cobre a assinatura serifada nos dois SOs do público. Consolas cobre o mono — e
   isso resolve de graça a `var(--mono, …)` órfã da linha 1315 e os três `Consolas, monospace`
   hardcoded, que hoje produzem dois monoespaçados diferentes na mesma tela.

**Quando um webfont se paga:** só Inter e Newsreader, auto-hospedados, subset `latin`,
`font-display: swap`, `<link rel="preload">` no `index.html`, num PR próprio depois da tokenização —
e apenas se a medição em notebook de estudante mostrar ganho de legibilidade a 11–12px que Segoe UI
não entrega. **JetBrains Mono não se paga**: o mono aparece em ID de regra, cota e medida, sempre em
`--bj-text-xs`/`-sm`, onde Consolas já é excelente. O token continua nomeando JetBrains Mono para o
dia em que a decisão mudar; simplesmente não há `@font-face`.

**Compromisso da serifada.** Newsreader/Georgia não pode existir para seis strings — isso é cargo
cult do Console. `--bj-font-display` é obrigatório em: título de página, título de modal, título de
painel, cabeçalho de seção do checklist e **leitura numérica** (escore, massa, cota) em
`--bj-text-2xl`. Se depois da migração a serifada aparecer em menos de ~30 lugares, ela é cortada e o
orçamento de identidade vai inteiro para a régua ocre e para o tratamento dos números (§11.5).

### 3.2 Escala

| Token            | Valor | `line-height`         | `letter-spacing`     | `font-weight` |
| ---------------- | ----- | --------------------- | -------------------- | ------------- |
| `--bj-text-xs`   | 11px  | `--bj-leading-tight`  | `--bj-tracking-wide` | 500 ou 700    |
| `--bj-text-sm`   | 12px  | `--bj-leading-normal` | normal               | 400 / 500     |
| `--bj-text-base` | 14px  | `--bj-leading-normal` | normal               | 400 / 500     |
| `--bj-text-lg`   | 16px  | `--bj-leading-normal` | normal               | 500           |
| `--bj-text-xl`   | 18px  | `--bj-leading-tight`  | normal               | 500           |
| `--bj-text-2xl`  | 22px  | `--bj-leading-tight`  | normal               | 500 (display) |
| `--bj-text-3xl`  | 30px  | `--bj-leading-tight`  | normal               | 500 (display) |

Sete degraus substituem os catorze do CSS legado. Morrem as meias-unidades (10,5 / 11,5 / 12,5px),
que não sobrevivem a nenhuma conversão de unidade e não são perceptíveis: 84 das 94 declarações de
`font-size` do app viviam entre 10 e 13px, em sete degraus, numa faixa de 3px.

**Regra de piso de conteúdo.** `--bj-text-xs` é **exclusivo de metadado não essencial** (contador,
timestamp, rótulo de seção em caixa alta). São proibidos em `xs`: rótulo de status, limite normativo
de regra, texto de citação do assistente, mensagem de erro e disclaimer legal — esses usam no mínimo
`--bj-text-sm`, e o rótulo de status usa `--bj-text-sm` com peso 700.

**Sobre px e zoom.** A escala é em px, como especificada. Isso responde ao **zoom de página** do
navegador (o caso comum, incluindo o de 200% do §10.6) mas **não** responde à preferência de tamanho
de fonte base do SO. Pendência registrada e mitigada pelo modo `[data-scale='presentation']` (§2.4),
que é o mecanismo do caso de uso "projetor" citado no briefing — um alternador na topbar, sem
redesenho.

### 3.3 Qual estilo em qual elemento

| Elemento                               | Família | Tamanho          | Peso | Cor                |
| -------------------------------------- | ------- | ---------------- | ---- | ------------------ |
| Título de página / saudação            | display | `--bj-text-2xl`  | 500  | `fg-primary`       |
| Título de landing (hero)               | display | `--bj-text-3xl`  | 500  | `fg-primary`       |
| Título de modal                        | display | `--bj-text-xl`   | 500  | `fg-primary`       |
| Título de painel / cabeçalho de coluna | display | `--bj-text-lg`   | 500  | `fg-primary`       |
| Rótulo de seção (caixa alta)           | sans    | `--bj-text-xs`   | 700  | `fg-muted`         |
| Corpo de texto / parágrafo             | sans    | `--bj-text-base` | 400  | `fg-primary`       |
| Texto de apoio / descrição de card     | sans    | `--bj-text-sm`   | 400  | `fg-secondary`     |
| Rótulo de campo                        | sans    | `--bj-text-sm`   | 500  | `fg-secondary`     |
| Valor de campo numérico                | mono    | `--bj-text-base` | 400  | `fg-primary`       |
| Unidade do campo numérico              | sans    | `--bj-text-sm`   | 400  | `fg-muted`         |
| Item de navegação do rail              | sans    | `--bj-text-base` | 500  | `fg-secondary`     |
| Rótulo de botão                        | sans    | `--bj-text-base` | 500  | conforme variante  |
| Rótulo de botão pequeno                | sans    | `--bj-text-sm`   | 500  | conforme variante  |
| Chip / badge de status                 | sans    | `--bj-text-sm`   | 700  | `--bj-<status>`    |
| ID de regra (`B6.2.4.3`)               | mono    | `--bj-text-sm`   | 400  | `fg-muted`         |
| Título de regra                        | sans    | `--bj-text-base` | 500  | `fg-primary`       |
| Limite normativo da regra              | mono    | `--bj-text-sm`   | 400  | `fg-secondary`     |
| Faixa de escore — número               | display | `--bj-text-2xl`  | 500  | `pass` / `fail`    |
| Faixa de escore — texto                | sans    | `--bj-text-sm`   | 500  | `fg-secondary`     |
| Cabeçalho de tabela (`th`)             | sans    | `--bj-text-sm`   | 500  | `fg-secondary`     |
| Célula de tabela (`td`)                | sans    | `--bj-text-sm`   | 400  | `fg-primary`       |
| Célula numérica de tabela              | mono    | `--bj-text-sm`   | 400  | `fg-primary`       |
| Bolha de mensagem do assistente        | sans    | `--bj-text-base` | 400  | `fg-primary`       |
| Chip de citação                        | mono    | `--bj-text-sm`   | 500  | `accent`           |
| Toast                                  | sans    | `--bj-text-sm`   | 500  | conforme variante  |
| Tooltip                                | sans    | `--bj-text-sm`   | 400  | `fg-primary`       |
| Rótulo 3D                              | sans    | `--bj-text-xs`   | 500  | `--bj-3d-label-fg` |
| Disclaimer legal                       | sans    | `--bj-text-sm`   | 400  | `fg-secondary`     |

---

## 4. Espaçamento, grade e layout

### 4.1 Escala base-4

`--bj-space-1` 4 · `-2` 8 · `-3` 12 · `-4` 16 · `-5` 24 · `-6` 32 · `-7` 48 · `-8` 64.

Oito degraus substituem os 21 valores do CSS legado. Morrem os ímpares ad-hoc (1, 3, 5, 7, 9, 11px),
que somavam ~40 declarações sem justificativa. Conversão de referência: 1→0 ou hairline · 3→4 ·
5→4 · 7→8 · 9→8 · 10→8 ou 12 · 11→12 · 14→16 · 18→16 · 20→24 · 22→24 · 28→32.

Único uso legítimo de valor cru: `1px` de hairline e `2px` de offset de foco. Ambos na lista de
exceções do lint.

### 4.2 Densidades

| Densidade     | `--bj-row-h` | Padding de célula/linha | Onde                                                    |
| ------------- | ------------ | ----------------------- | ------------------------------------------------------- |
| `compact`     | 28px         | `4px 8px`               | Checklist B6, Inspector, tabelas de admin e de equipe.  |
| `comfortable` | 36px         | `8px 12px`              | Assistente, landing, visão geral, formulários de modal. |

Declarada com `data-density` no contêiner do produto, não por componente. Um componente lê
`var(--bj-row-h)`, `var(--bj-pad-y)`, `var(--bj-pad-x)` e `var(--bj-gap)` e serve às duas.

### 4.3 Larguras

| Token                 | Valor  | Papel                                                                     |
| --------------------- | ------ | ------------------------------------------------------------------------- |
| `--bj-rail-w`         | 224px  | Rail de navegação expandido (rótulo + item ativo).                        |
| `--bj-rail-w-compact` | 56px   | Rail só com ícone + tooltip. **Padrão no editor abaixo de 1440px.**       |
| `--bj-topbar-h`       | 48px   | Topbar de contexto acima da área de conteúdo.                             |
| `--bj-panel-w-sm`     | 320px  | Painel esquerdo do editor (checklist B6).                                 |
| `--bj-panel-w`        | 360px  | Painel direito do editor (Inspector / Wizard).                            |
| `--bj-panel-w-min`    | 280px  | Piso de redimensionamento por arraste.                                    |
| `--bj-viewport-min-w` | 360px  | **Piso do canvas 3D.** Abaixo disso o painel de menor prioridade colapsa. |
| `--bj-modal-w`        | 560px  | Modal padrão.                                                             |
| `--bj-modal-w-lg`     | 880px  | Modal de tabela (projetos, versões).                                      |
| `--bj-page-w`         | 1200px | Largura máxima de página de conteúdo.                                     |
| `--bj-prose-w`        | 860px  | Largura máxima de coluna de leitura (assistente).                         |

**Regra de sobrevivência do viewport (bloqueante).** Os painéis são `flex-shrink: 0`; o viewport é
`flex: 1` com `min-width: var(--bj-viewport-min-w)`. Sem isso, a 200% de zoom em 1366px os dois
painéis (base 380px cada, sem `flex-shrink: 0`) absorvem os 683px disponíveis e **o canvas 3D fica
com largura 0** — o modelo desaparece e `body { overflow: hidden }` impede qualquer rolagem de
recuperação. Contas do orçamento horizontal, a 100%: 1366 − 224 (rail) − 320 − 360 = **462px** de 3D;
com o rail compacto, **630px**. É por isso que o rail entra compacto no editor.

### 4.4 Breakpoints

| Nome     | Condição        | Comportamento                                                                      |
| -------- | --------------- | ---------------------------------------------------------------------------------- |
| `xl`     | ≥ 1600px        | Rail expandido, dois painéis abertos, grid de cards em 4 colunas.                  |
| `lg`     | 1440–1599px     | Rail expandido, dois painéis abertos, 3 colunas.                                   |
| **`nb`** | **1200–1439px** | **Rail compacto no editor.** Dois painéis abertos. Inclui o alvo 1366×768.         |
| `md`     | 1024–1199px     | Rail compacto. Inspector colapsado por padrão; abre sobreposto ao viewport.        |
| `sm`     | < 1024px        | Rail vira barra inferior. Painéis viram abas sobre o viewport. Página em 1 coluna. |

```css
@media (max-width: 1439px) {
  .bj-shell {
    --bj-rail-w: var(--bj-rail-w-compact);
  }
}
```

**1366×768 é o alvo de verificação obrigatório de todo PR de layout**, junto com 1024×768 (projetor)
e 1366×768 a 200% de zoom.

### 4.5 Rolagem

`body { overflow: hidden }` continua valendo **apenas** para o shell do editor, que é
full-viewport por natureza (o canvas ocupa a área). O shell de página (`assistant`, `admin`, `team`,
`landing`) usa `overflow: auto` na área de conteúdo. Abaixo de `sm`, ou acima de 200% de zoom, o
shell inteiro passa a `overflow: auto` — degradar com rolagem é obrigatório; degradar com perda de
conteúdo é falha de WCAG 1.4.10.

---

## 5. Forma e elevação

### 5.1 Raios

| Token              | Valor | Onde                                                                       |
| ------------------ | ----- | -------------------------------------------------------------------------- |
| `--bj-radius-sm`   | 4px   | Chip, badge, swatch, checkbox, barra de progresso, célula de destaque.     |
| `--bj-radius`      | 8px   | **Dominante.** Botão, campo, card, item de rail, painel, modal, toast.     |
| `--bj-radius-lg`   | 12px  | Superfície grande: cartão de landing, bolha de mensagem, painel flutuante. |
| `--bj-radius-pill` | 999px | Pílula de filtro, contador, avatar (com `50%` proibido — usar pill).       |

Quatro valores substituem os dez do legado, incluindo os pares indistinguíveis 3/4px e 5/6px. Raio é
propriedade do **componente**, não do contexto: o mesmo botão tem o mesmo raio em modal e em painel.

### 5.2 Bordas

Três tiers, com contrato em CT-1.

```css
.bj-divider {
  border-bottom: 1px solid var(--bj-border);
}
.bj-control {
  border: 1px solid var(--bj-border-strong);
}
.bj-selected-outline {
  border: 1px solid var(--bj-border-stronger);
}
```

Bordas são **alfa**, não hex: no escuro sobre branco (10/36/55%), no claro sobre a tinta
`#251c15` (12/51/68%). Alfa-branco sobre areia é invisível — essa inversão é a única diferença
estrutural entre os modos. Consequência prática: uma borda sobre uma superfície mais clara fica
naturalmente mais discreta, e é por isso que os tiers foram promovidos de 20/40% para 36/55%.

### 5.3 Elevação

| Token            | Uso                                                                      |
| ---------------- | ------------------------------------------------------------------------ |
| `--bj-shadow-sm` | Dropdown, tooltip, popover, chip flutuante, card em hover.               |
| `--bj-shadow-md` | Toast, painel sobreposto ao viewport, cartão de organograma selecionado. |
| `--bj-shadow-lg` | Modal, landing.                                                          |

Elevação é **muito sutil** por decisão: a hierarquia é carregada pela rampa de superfície e pela
borda, não pela sombra. Sombra sozinha nunca é o único indicador de camada. E sombra **nunca**
comunica estado — hover de card usa `--bj-hover`, não uma sombra maior.

Proibido: `box-shadow` colorido, glow, e `box-shadow` como anel de foco (§1.6).

### 5.4 Camadas (z-index)

| Token                    | Valor | Camada                                                    |
| ------------------------ | ----- | --------------------------------------------------------- |
| `--bj-z-base`            | 0     | Conteúdo.                                                 |
| `--bj-z-sticky`          | 10    | Cabeçalho sticky de tabela, topbar de contexto.           |
| `--bj-z-3d-label`        | 40    | Rótulos `drei/Html` (fixo pelo `zIndexRange={[40, 0]}`).  |
| `--bj-z-viewport-chrome` | 50    | Toolbar e legenda do viewport — **acima** dos rótulos 3D. |
| `--bj-z-dropdown`        | 60    | Menu de conta, popover, tooltip.                          |
| `--bj-z-overlay`         | 100   | Scrim de modal.                                           |
| `--bj-z-modal`           | 110   | Caixa do modal.                                           |
| `--bj-z-toast`           | 120   | Região de toasts — acima do modal, por definição.         |
| `--bj-z-landing`         | 200   | Landing.                                                  |

Corrige dois defeitos concretos: `.modal-overlay` declarava `z-index` **duas vezes na mesma regra**
(200 na linha 787, 50 na 793 — a segunda vencia, e a escala documentada estava errada); e a legenda
do viewport não tinha `z-index` nenhum enquanto os rótulos 3D estavam em 40, o que permitia um
rótulo de nó cobrir a própria legenda que traduz as cores da cena.

---

## 6. Movimento

| Token           | Valor                        | Uso                                                 |
| --------------- | ---------------------------- | --------------------------------------------------- |
| `--bj-dur-fast` | 120ms                        | Hover, foco, troca de cor, aparecimento de tooltip. |
| `--bj-dur-base` | 200ms                        | Abrir/fechar modal, toast, popover, expandir seção. |
| `--bj-ease`     | `cubic-bezier(0.2, 0, 0, 1)` | Todas as transições. Não existe segunda curva.      |

Regras:

- **Só `opacity`, `transform`, `background-color`, `border-color`, `color` e `box-shadow` transicionam.**
  Proibido transicionar `width`, `height`, `top`, `left`, `padding` e `margin`.
- **Proibido animar largura de painel.** O `<Canvas>` do react-three-fiber usa `useMeasure` com
  debounce de resize **zero**: cada frame de uma animação de largura dispara `root.configure({size})`
  → `setSize` + atualização de `aspect` sobre a cena inteira (gaiola + gabarito + manequins). Em
  notebook de estudante isso é jank visível na interação mais frequente do editor. O colapso de
  painel é **instantâneo**, por decisão. `--bj-dur-base` **não se aplica** a largura de contêiner do
  viewport.
- Nada pisca, nada pulsa por mais de um ciclo, nada se move sem interação do usuário.

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

Bloco global, e não as duas `@media` pontuais do CSS legado, que cobriam a animação de entrada da
landing e o `.org-node` mas deixavam de fora justamente as transições de `transform` do hover
(`.landing-cta`, `.landing-cta-arrow`, `.landing-account`).

**A cena 3D não é alcançada por `@media`.** `prefers-reduced-motion` é lido uma vez em JS
(`window.matchMedia('(prefers-reduced-motion: reduce)')`, com `change` listener), exposto no store, e
com `reduce` ativo: anel do nó pendente fica **estático**, contorno de seleção aparece **sem
transição**, `damping` do `OrbitControls` é **desligado** e qualquer enquadramento de câmera (o
"camera fit" já pendente) vira **salto instantâneo**. Sem isso, o viewport — que ocupa a maior área
da tela — é a única parte do produto que ignora a preferência do usuário.

---

## 7. Catálogo de componentes

Convenção do catálogo: cada componente traz **anatomia**, **variantes**, **estados**, **tokens**,
**acessibilidade** e **CSS de referência**. O CSS é normativo — implementar diferente exige ADR.
Estados que não aparecem na lista de um componente **não existem** para ele.

Base global, aplicada uma vez em `styles.css` logo depois do `@import`:

```css
*:focus-visible {
  outline: 2px solid var(--bj-focus-ring-color);
  outline-offset: var(--bj-focus-ring-offset);
  border-radius: inherit;
}
@media (forced-colors: active) {
  *:focus-visible {
    outline-color: Highlight;
  }
}
body {
  margin: 0;
  background: var(--bj-bg-canvas);
  color: var(--bj-fg-primary);
  font-family: var(--bj-font-sans);
  font-size: var(--bj-text-base);
  line-height: var(--bj-leading-normal);
}
.bj-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
```

Os três `outline: none` do CSS legado (`.num-field input:focus`, `.field input:focus`,
`.team-select:focus`) são **removidos**, não substituídos por mudança de borda.

---

### C-01 — Shell de aplicação (rail + topbar + área)

**Anatomia.** `.bj-shell` (grid de 2 colunas) → `.bj-rail` (`<nav aria-label="Seções">`: busca, lista
plana de destinos, rodapé com avatar + nome + papel) · `.bj-area` (grid de 2 linhas) →
`.bj-topbar` (contexto da página, ações à direita, disclaimer) · `<main id="conteudo">`.

**Variantes.** `expanded` (padrão ≥ 1440px) · `compact` (só ícone + tooltip, padrão no editor abaixo
de 1440px) · `off-canvas` (< 1024px, rail vira barra inferior).

**Estados.** Não tem estado próprio; o estado vive no item de navegação (C-02).

**Tokens.** `--bj-rail-w`, `--bj-rail-w-compact`, `--bj-topbar-h`, `--bj-bg-canvas` (shell),
`--bj-bg-base` (rail e topbar), `--bj-border` (divisores), `--bj-space-2/-3/-4`.

**Acessibilidade.**

- Um `<h1>` por página, na topbar ou no início de `<main>`. Hoje o único `<h1>` do app está na
  landing; os quatro produtos não têm nenhum.
- **Skip link** como primeiro elemento focável do documento: `<a class="bj-skip" href="#conteudo">`.
- `<nav aria-label="Seções">` · `<main id="conteudo">` · a landing deixa de ser `role="dialog"` (ela é
  a home, não um diálogo) e vira `<main>` com `<h1>`.
- O editor permanece **montado** com `display: none` quando `page !== 'editor'`. Isso preserva
  contexto WebGL, câmera e `OrbitControls` — o `createRoot(canvas)` do react-three-fiber só é
  reconfigurado quando o retângulo tem largura e altura maiores que zero, então sob `display: none` o
  efeito é pulado e a cena sobrevive. `display: none` também remove a árvore do fluxo de
  acessibilidade, o que torna o hack correto. **Trocar por `visibility`/`opacity` é proibido**:
  deixaria dois apps focáveis ao mesmo tempo.
- **Nenhum PR de layout pode alterar a montagem de `.bj-area` / `<Viewport>`.** O rail troca
  `.bj-shell` de coluna para linha; isso é reflow único e aceitável. Desmontar o `<Viewport>` perde
  WebGL e câmera, e não existe estado de câmera no store para restaurar.

```css
.bj-shell {
  display: grid;
  grid-template-columns: var(--bj-rail-w) 1fr;
  height: 100dvh;
  background: var(--bj-bg-canvas);
}
.bj-rail {
  display: flex;
  flex-direction: column;
  gap: var(--bj-space-1);
  padding: var(--bj-space-3);
  background: var(--bj-bg-base);
  border-right: 1px solid var(--bj-border);
  overflow: hidden auto;
}
.bj-rail-foot {
  margin-top: auto;
  padding-top: var(--bj-space-3);
  border-top: 1px solid var(--bj-border);
}
.bj-area {
  display: grid;
  grid-template-rows: var(--bj-topbar-h) 1fr;
  min-width: 0;
}
.bj-topbar {
  display: flex;
  align-items: center;
  gap: var(--bj-space-3);
  padding: 0 var(--bj-space-4);
  background: var(--bj-bg-base);
  border-bottom: 1px solid var(--bj-border);
}
.bj-skip {
  position: absolute;
  left: var(--bj-space-2);
  top: -64px;
  z-index: var(--bj-z-toast);
  padding: var(--bj-space-2) var(--bj-space-3);
  background: var(--bj-bg-overlay);
  color: var(--bj-fg-primary);
  border: 1px solid var(--bj-border-strong);
  border-radius: var(--bj-radius);
  transition: top var(--bj-dur-fast) var(--bj-ease);
}
.bj-skip:focus-visible {
  top: var(--bj-space-2);
}
```

---

### C-02 — Item de navegação

**Anatomia.** `<a>` ou `<button>` ocupando a largura do rail: ícone 20px · rótulo · contador opcional
à direita. O ícone é **obrigatório**, não opcional: §8.5 nomeia um glifo por destino (`IconHouse`
início · `IconUsers` equipe · `IconWrench` ferramentas · `IconTrophy` comunidade · `IconSliders`
admin · `IconAccount` no rodapé) porque em `rail-compact` ele é o único identificador na tela.

> **Emenda (DF-24, 2026-08-31): `rail-compact` foi ao ar, e a vaga do Editor não precisou ser
> preenchida.** O texto anterior dizia que o destino Editor estava sem glifo e que isso bloqueava esta
> variante. A premissa caiu: o Editor não é destino de primeiro nível desde o DF-12 e agora é
> **sub-item** (variante `sub`), que **não é renderizado no rail compacto** — no compacto só ficam os
> quatro destinos, todos com glifo do inventário. Detalhes e escopo em §8.6.1.

**Variantes.** `rail` (padrão) · `rail-compact` (só ícone, rótulo em `.bj-sr-only` + tooltip) ·
`sub` (nível 2, recuo de `--bj-space-5`; abre por **seleção** do destino pai, não por segundo clique,
e mostra a marca da ferramenta quando o recurso é um produto nomeado — §8.6.1).

**Estados.**

| Estado      | Desenho                                                                                                           |
| ----------- | ----------------------------------------------------------------------------------------------------------------- |
| default     | `color: fg-secondary`, fundo transparente.                                                                        |
| hover       | `background: --bj-hover`, `color: fg-primary`.                                                                    |
| active      | `background: --bj-active`.                                                                                        |
| **current** | `background: --bj-brand-bg`, `color: --bj-brand`, régua de 3px em `--bj-brand` à esquerda, `aria-current="page"`. |
| focus       | anel global.                                                                                                      |
| disabled    | `color: --bj-disabled-fg`, `pointer-events: none`, `aria-disabled="true"`.                                        |

**Tokens.** `--bj-radius`, `--bj-space-2/-3`, `--bj-text-base`, `--bj-weight-medium`, `--bj-brand`,
`--bj-brand-bg`, `--bj-hover`, `--bj-active`, `--bj-control-h-lg`.

**Acessibilidade.** `aria-current="page"` no item ativo é **obrigatório** — a régua ocre é reforço,
não portador (CT-3). Em `rail-compact`, o rótulo textual permanece no DOM em `.bj-sr-only` e o
tooltip (C-15) aparece em hover **e** em foco. Altura mínima `--bj-control-h-lg` (40px).

```css
.bj-nav-item {
  display: flex;
  align-items: center;
  gap: var(--bj-space-2);
  min-height: var(--bj-control-h-lg);
  padding: 0 var(--bj-space-3);
  border: 0;
  border-left: 3px solid transparent;
  border-radius: var(--bj-radius);
  background: transparent;
  color: var(--bj-fg-secondary);
  font: var(--bj-weight-medium) var(--bj-text-base) var(--bj-font-sans);
  text-align: left;
  cursor: pointer;
  transition:
    background var(--bj-dur-fast) var(--bj-ease),
    color var(--bj-dur-fast) var(--bj-ease);
}
.bj-nav-item:hover {
  background: var(--bj-hover);
  color: var(--bj-fg-primary);
}
.bj-nav-item:active {
  background: var(--bj-active);
}
.bj-nav-item[aria-current='page'] {
  background: var(--bj-brand-bg);
  border-left-color: var(--bj-brand);
  color: var(--bj-brand);
}
.bj-nav-item[aria-disabled='true'] {
  color: var(--bj-disabled-fg);
  pointer-events: none;
}
```

---

### C-03 — Botão

**Anatomia.** `<button>` · ícone opcional 16px · rótulo · ícone opcional à direita.

**Variantes.**

| Variante    | Repouso                                                    | Texto               |
| ----------- | ---------------------------------------------------------- | ------------------- |
| `primary`   | `background: --bj-brand`, sem borda                        | `--bj-on-brand`     |
| `secondary` | `background: --bj-bg-raised`, `border: --bj-border-strong` | `--bj-fg-primary`   |
| `danger`    | `background: --bj-fail-bg`, `border: --bj-fail-border`     | `--bj-fail`         |
| `ghost`     | transparente, sem borda                                    | `--bj-fg-secondary` |
| `icon`      | quadrado `--bj-target-min`, transparente                   | `currentColor`      |

**Estados.** `default` · `hover` (`--bj-hover` por cima, ou `--bj-brand-strong` no primário) ·
`active` (`--bj-active`) · `focus` (anel global) · `disabled` (`--bj-disabled-fg`, sem hover,
`cursor: not-allowed`) · `loading` (spinner de 16px no lugar do ícone, rótulo mantido,
`aria-busy="true"`, `disabled`).

**Tokens.** `--bj-control-h` / `-sm` / `-lg`, `--bj-target-min`, `--bj-radius`, `--bj-space-2/-3`,
`--bj-text-base` / `-sm`, `--bj-weight-medium`.

**Acessibilidade.**

- **Alvo mínimo 32×32** (`--bj-target-min`) para toda variante `icon`. O botão de recolher e o de
  fechar modal do legado têm 24×22px e o `.org-collapse` tem 20×20 — todos abaixo do mínimo. O
  público usa trackpad de notebook e às vezes 2-em-1 com toque.
- Variante `icon` exige `aria-label` em português. O caractere `✕` como único conteúdo dá nome
  acessível "multiplication x" — **proibido**.
- `loading` mantém o rótulo visível (largura estável) e anuncia por `aria-busy`.
- **Zero `!important`.** Os quatro `!important` de `button.primary` existiam por colisão de seletores
  planos; a variante `bj-btn--primary` resolve por especificidade normal.
- Ação destrutiva usa `danger` **e** confirmação (C-13), nunca só a cor.

```css
.bj-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--bj-space-2);
  min-height: var(--bj-control-h);
  padding: 0 var(--bj-space-3);
  border: 1px solid transparent;
  border-radius: var(--bj-radius);
  background: transparent;
  color: var(--bj-fg-primary);
  font: var(--bj-weight-medium) var(--bj-text-base) var(--bj-font-sans);
  cursor: pointer;
  transition:
    background var(--bj-dur-fast) var(--bj-ease),
    border-color var(--bj-dur-fast) var(--bj-ease);
}
.bj-btn--sm {
  min-height: var(--bj-control-h-sm);
  padding: 0 var(--bj-space-2);
  font-size: var(--bj-text-sm);
}
.bj-btn--lg {
  min-height: var(--bj-control-h-lg);
  padding: 0 var(--bj-space-4);
}
.bj-btn--primary {
  background: var(--bj-brand);
  color: var(--bj-on-brand);
}
.bj-btn--primary:hover {
  background: var(--bj-brand-strong);
}
.bj-btn--secondary {
  background: var(--bj-bg-raised);
  border-color: var(--bj-border-strong);
}
.bj-btn--secondary:hover {
  background: var(--bj-hover);
}
.bj-btn--danger {
  background: var(--bj-fail-bg);
  border-color: var(--bj-fail-border);
  color: var(--bj-fail);
}
.bj-btn--ghost {
  color: var(--bj-fg-secondary);
}
.bj-btn--ghost:hover {
  background: var(--bj-hover);
  color: var(--bj-fg-primary);
}
.bj-btn--icon {
  min-width: var(--bj-target-min);
  min-height: var(--bj-target-min);
  padding: 0;
  color: var(--bj-fg-secondary);
}
.bj-btn:active:not(:disabled) {
  background: var(--bj-active);
}
.bj-btn:disabled {
  color: var(--bj-disabled-fg);
  background: transparent;
  border-color: var(--bj-border);
  cursor: not-allowed;
}
.bj-btn[aria-busy='true'] {
  cursor: progress;
}
```

---

### C-04 — Campo numérico com unidade

**Anatomia.** `<label>` · `.bj-numfield` (poço) → `<input type="number" inputmode="decimal">` ·
`<span class="bj-numfield-unit">` (mm, kg, °, MPa) · texto de ajuda ou de erro.

**Variantes.** `default` · `readonly` (fundo `--bj-bg-sunken`, sem borda forte) · `derived` (valor
calculado: `--bj-fg-muted`, `aria-readonly`).

**Estados.** `default` · `hover` (`border-color: --bj-border-stronger`) · `focus` (anel global no
wrapper) · `disabled` · `invalid` (`border-color: --bj-fail-border`, mensagem em `--bj-fail`,
`aria-invalid="true"`, `aria-describedby` apontando para a mensagem).

**Tokens.** `--bj-bg-inset`, `--bj-border-strong`, `--bj-radius`, `--bj-font-mono`, `--bj-text-base`
(valor), `--bj-text-sm` (unidade e ajuda), `--bj-fg-muted` (unidade), `--bj-control-h`.

**Acessibilidade.** `<label for>` sempre — placeholder não é rótulo. A **unidade é parte do nome
acessível**: ou entra no rótulo ("Largura (mm)") ou é referenciada por `aria-describedby`. O valor usa
`--bj-font-mono` para que dígitos alinhem em coluna. Mensagem de erro fica **abaixo** do campo, com
`role="alert"` apenas quando o erro aparece depois da interação.

```css
.bj-numfield {
  display: flex;
  align-items: center;
  gap: var(--bj-space-2);
  min-height: var(--bj-control-h);
  padding: 0 var(--bj-space-2);
  background: var(--bj-bg-inset);
  border: 1px solid var(--bj-border-strong);
  border-radius: var(--bj-radius);
}
.bj-numfield:hover {
  border-color: var(--bj-border-stronger);
}
.bj-numfield input {
  flex: 1;
  min-width: 0;
  border: 0;
  background: transparent;
  color: var(--bj-fg-primary);
  font: var(--bj-weight-regular) var(--bj-text-base) var(--bj-font-mono);
  text-align: right;
}
.bj-numfield input:focus {
  outline: none;
}
.bj-numfield:has(input:focus-visible) {
  outline: 2px solid var(--bj-focus-ring-color);
  outline-offset: var(--bj-focus-ring-offset);
}
.bj-numfield-unit {
  color: var(--bj-fg-muted);
  font-size: var(--bj-text-sm);
}
.bj-numfield[data-invalid='true'] {
  border-color: var(--bj-fail-border);
}
.bj-field-error {
  margin-top: var(--bj-space-1);
  color: var(--bj-fail);
  font-size: var(--bj-text-sm);
}
```

---

### C-05 — Select

**Anatomia.** `<label>` · `<select>` nativo · chevron de 16px desenhado com `currentColor` · texto de
ajuda opcional.

**Variantes.** `default` · `sm` (tabelas densas) · `inline` (dentro de linha de tabela).

**Estados.** `default` · `hover` · `focus` · `disabled` · `invalid` · `busy` (durante persistência:
`aria-busy="true"`, `disabled`).

**Tokens.** Iguais a C-04, mais `--bj-space-5` de padding à direita para o chevron.

**Acessibilidade.**

- `<select>` **nativo**, sem substituto customizado. É o único jeito barato de ter teclado, leitor de
  tela e comportamento de toque corretos.
- **Proibido persistir no `onChange` de select que dispara mutação remota.** Navegar as opções com as
  setas emite um evento por passo — o padrão legado de papel de acesso e função de membro gravava um
  `PATCH` a cada seta, sem confirmação e sem desfazer. Persistir em `onBlur`, ou exigir um botão
  "Aplicar" por linha. Mudança de papel de acesso passa por confirmação (C-13).
- Sem `outline: none`.

```css
.bj-select {
  min-height: var(--bj-control-h);
  padding: 0 var(--bj-space-5) 0 var(--bj-space-2);
  background: var(--bj-bg-inset);
  border: 1px solid var(--bj-border-strong);
  border-radius: var(--bj-radius);
  color: var(--bj-fg-primary);
  font: var(--bj-weight-regular) var(--bj-text-base) var(--bj-font-sans);
  appearance: none;
}
.bj-select:hover {
  border-color: var(--bj-border-stronger);
}
.bj-select:disabled {
  color: var(--bj-disabled-fg);
  cursor: not-allowed;
}
```

---

### C-06 — Checkbox

**Anatomia.** `<input type="checkbox">` com aparência própria: caixa de 16px · glifo de marca em
`--bj-on-brand` · `<label>` clicável.

**Variantes.** `default` · `indeterminate` (traço em vez de marca).

**Estados.** `default` · `hover` (`border-color: --bj-border-stronger`) · `checked`
(`background: --bj-brand`, glifo `--bj-on-brand`) · `focus` (anel no wrapper) · `disabled`
(`border-color: --bj-border`, glifo `--bj-disabled-fg`).

**Tokens.** `--bj-border-strong`, `--bj-brand`, `--bj-on-brand`, `--bj-radius-sm`,
`--bj-target-min`, `--bj-space-2`.

**Acessibilidade.** A caixa visual tem 16px, mas a **área clicável do rótulo inteiro** cumpre o alvo
mínimo de 32px de altura. O estado `checked` é marcado por **forma** (a marca) e não só por cor; em
`forced-colors` a caixa herda `CanvasText`/`Highlight`.

```css
.bj-check {
  display: inline-flex;
  align-items: center;
  gap: var(--bj-space-2);
  min-height: var(--bj-target-min);
  color: var(--bj-fg-primary);
  font-size: var(--bj-text-base);
  cursor: pointer;
}
.bj-check input {
  appearance: none;
  width: 16px;
  height: 16px;
  margin: 0;
  display: grid;
  place-content: center;
  border: 1px solid var(--bj-border-strong);
  border-radius: var(--bj-radius-sm);
  background: var(--bj-bg-inset);
}
.bj-check input:checked {
  background: var(--bj-brand);
  border-color: var(--bj-brand);
}
.bj-check input:checked::after {
  content: '';
  width: 8px;
  height: 4px;
  border-left: 2px solid var(--bj-on-brand);
  border-bottom: 2px solid var(--bj-on-brand);
  transform: rotate(-45deg) translate(1px, -1px);
}
.bj-check input:disabled {
  border-color: var(--bj-border);
}
```

---

### C-07 — Chip / badge de status

O componente mais carregado do sistema. Molde único, cinco famílias, e a **forma-chip é exclusiva do
status** (§2.5).

**Anatomia.** `<span class="bj-chip bj-chip--<status>">` → ícone de 16px (`aria-hidden`) · rótulo
textual canônico (§11.3) · contador opcional.

**Variantes.** `pass` · `fail` · `warn` · `manual` · `info` · `neutral` (sem semântica:
`--bj-bg-raised` + `--bj-border` + `--bj-fg-secondary`) · `brand` (marca: `--bj-brand-bg` +
`--bj-brand-border` + `--bj-brand`, **nunca** com ícone de alerta e nunca para estado de dado).

**Estados.** `default` · `interactive` (quando é filtro: hover `--bj-hover`, `aria-pressed`) ·
`disabled`. Chip não tem `loading`.

**Tokens.** `--bj-<status>`, `--bj-<status>-bg`, `--bj-<status>-border`, `--bj-radius-pill`,
`--bj-text-sm`, `--bj-weight-bold`, `--bj-space-1/-2`.

**Acessibilidade.**

- **CT-3 é absoluto aqui.** Ícone **e** texto, sempre. `pass` × `fail` mede ΔE00 4,9 (escuro) e 6,6
  (claro) em deuteranopia; `brand` × `warn` mede 0,9. Sem texto, o chip não informa nada para uma
  parte do público.
- O fundo do chip mede 1,01–1,06:1 contra `--bj-bg-base`: a **borda é a única pista do limite**, e
  por isso `--bj-<status>-border` é obrigatória (≥ 3,00:1 medido).
- Chip nunca é o único indicador de um estado global (ver C-09).
- Chip clicável vira `<button>` com `aria-pressed` e altura mínima de 32px.

```css
.bj-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--bj-space-1);
  padding: var(--bj-space-1) var(--bj-space-2);
  border: 1px solid var(--bj-border);
  border-radius: var(--bj-radius-pill);
  background: var(--bj-bg-raised);
  color: var(--bj-fg-secondary);
  font: var(--bj-weight-bold) var(--bj-text-sm) var(--bj-font-sans);
  letter-spacing: var(--bj-tracking-wide);
  white-space: nowrap;
}
.bj-chip--pass {
  background: var(--bj-pass-bg);
  border-color: var(--bj-pass-border);
  color: var(--bj-pass);
}
.bj-chip--fail {
  background: var(--bj-fail-bg);
  border-color: var(--bj-fail-border);
  color: var(--bj-fail);
}
.bj-chip--warn {
  background: var(--bj-warn-bg);
  border-color: var(--bj-warn-border);
  color: var(--bj-warn);
}
.bj-chip--manual {
  background: var(--bj-manual-bg);
  border-color: var(--bj-manual-border);
  color: var(--bj-manual);
}
.bj-chip--info {
  background: var(--bj-info-bg);
  border-color: var(--bj-info-border);
  color: var(--bj-info);
}
.bj-chip--brand {
  background: var(--bj-brand-bg);
  border-color: var(--bj-brand-border);
  color: var(--bj-brand);
}
```

---

### C-08 — Item de regra do checklist

**Anatomia.** `<li class="bj-rule">` (contêiner, **não interativo**) → `<button class="bj-rule-main">`
(ID de regra em mono · título · chip de status · limite normativo) · `<button class="bj-rule-ask">`
(perguntar ao assistente), **irmão** do principal.

**Variantes.** `pass` · `fail` · `warn` · `manual`, aplicadas ao chip.

**Estados.**

| Estado   | Desenho                                                                             |
| -------- | ----------------------------------------------------------------------------------- |
| default  | fundo transparente, régua lateral transparente.                                     |
| hover    | `background: --bj-hover`.                                                           |
| active   | `background: --bj-active`.                                                          |
| focus    | anel global no `.bj-rule-main`.                                                     |
| selected | `background: --bj-accent-bg`, régua de 3px em `--bj-accent`, `aria-current="true"`. |
| disabled | não existe — regra é sempre consultável.                                            |

**Tokens.** `--bj-accent`, `--bj-accent-bg`, `--bj-hover`, `--bj-active`, `--bj-font-mono` (ID e
limite), `--bj-row-h`, `--bj-pad-y`, `--bj-pad-x`, `--bj-radius`.

**Acessibilidade.**

- **A reestruturação é obrigatória e é pré-requisito de qualquer polimento cromático.** Hoje o
  checklist é `<li onClick>` sem `tabIndex`, sem `role` e sem `onKeyDown`, com um `<button>` aninhado
  dentro. Pôr `tabIndex` no `<li>` cria _nested interactive_ e o clique no botão interno borbulha para
  o handler do `<li>`. O item de checklist é o controle primário do produto e hoje é **inalcançável
  por teclado**.
- A lista é `<ul>`; cada item é `<li>`; o corpo clicável é `<button>`; "perguntar ao assistente" é
  irmão, com `aria-label` que inclui o ID da regra.
- Selecionado é anunciado por `aria-current`, não pela cor.
- Destaque de regra (`--bj-accent`, barra sólida à esquerda) e anel de foco
  (`--bj-focus-ring-color`, anel externo com offset) compartilham matiz: por isso **diferem em posição
  e forma** (CT-4).

```css
.bj-rule {
  list-style: none;
  border-radius: var(--bj-radius);
}
.bj-rule-main {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: var(--bj-space-2);
  width: 100%;
  min-height: var(--bj-row-h);
  padding: var(--bj-pad-y) var(--bj-pad-x);
  border: 0;
  border-left: 3px solid transparent;
  border-radius: var(--bj-radius);
  background: transparent;
  color: var(--bj-fg-primary);
  font: var(--bj-weight-medium) var(--bj-text-base) var(--bj-font-sans);
  text-align: left;
  cursor: pointer;
}
.bj-rule-main:hover {
  background: var(--bj-hover);
}
.bj-rule-main[aria-current='true'] {
  background: var(--bj-accent-bg);
  border-left-color: var(--bj-accent);
}
.bj-rule-id {
  font: var(--bj-weight-regular) var(--bj-text-sm) var(--bj-font-mono);
  color: var(--bj-fg-muted);
}
.bj-rule-limit {
  grid-column: 2 / -1;
  font: var(--bj-weight-regular) var(--bj-text-sm) var(--bj-font-mono);
  color: var(--bj-fg-secondary);
}
.bj-rule-ask {
  margin: 0 var(--bj-pad-x) var(--bj-pad-y);
}
```

---

### C-09 — Faixa de status / escore

**Anatomia.** `.bj-score` → ícone de 20px · número em display · texto ("nenhuma infração" /
"3 infrações") · detalhe secundário (massa estimada).

**Variantes.** `good` (nenhuma infração) · `bad` (uma ou mais) · `unknown` (calculando → C-17).

**Estados.** Estático. Não é interativo, não tem hover.

**Tokens.** `--bj-bg-sunken` (fundo), `--bj-border-strong` (limite, por CT-2), `--bj-pass` /
`--bj-fail`, `--bj-font-display`, `--bj-text-2xl`, `--bj-radius`.

**Acessibilidade.**

- `role="status"` + `aria-live="polite"`: a contagem muda enquanto o usuário edita e precisa ser
  anunciada sem roubar o foco.
- **Ícone + número + texto.** A versão recolhida da sidebar **não pode** ser um ponto de 9px de cor
  pura: hoje é o único indicador do estado global do projeto, sem texto, sem `title`, sem comparador,
  e mede 1,62:1 sob deuteranopia. Passa a mostrar a **contagem numérica** no rótulo vertical
  ("3 infrações"), com o ponto como reforço.
- `--bj-fail` sobre `--bj-bg-sunken` mede 5,37:1 — dentro do contrato. Sobre `--bj-bg-overlay` seria
  4,07:1, e por isso a faixa nunca vive dentro de um modal sem o chip tinto.

```css
.bj-score {
  display: flex;
  align-items: center;
  gap: var(--bj-space-3);
  padding: var(--bj-space-3);
  background: var(--bj-bg-sunken);
  border: 1px solid var(--bj-border-strong);
  border-radius: var(--bj-radius);
}
.bj-score-value {
  font: var(--bj-weight-medium) var(--bj-text-2xl) / var(--bj-leading-tight) var(--bj-font-display);
}
.bj-score--good .bj-score-value {
  color: var(--bj-pass);
}
.bj-score--bad .bj-score-value {
  color: var(--bj-fail);
}
.bj-score-text {
  color: var(--bj-fg-secondary);
  font-size: var(--bj-text-sm);
}
```

---

### C-10 — Painel colapsável

**Anatomia.** `<section class="bj-panel">` → `.bj-panel-head` (`<h2>` estilizado · ações · botão de
colapsar) · `.bj-panel-body` (rolagem própria) · `.bj-panel-foot` opcional. Estado recolhido:
`.bj-panel--collapsed`, com rótulo vertical e indicador de estado.

**Variantes.** `left` (checklist, `--bj-panel-w-sm`) · `right` (Inspector/Wizard, `--bj-panel-w`) ·
`inline` (seção dentro de painel, sem largura própria).

**Estados.** `expanded` · `collapsed` · `resizing` (cursor `col-resize`, sem transição) · `empty`
(C-16) · `loading` (C-17).

**Tokens.** `--bj-bg-base` (painel), `--bj-bg-sunken` (cabeçalho), `--bj-border` (divisor interno),
`--bj-border-strong` (limite externo, CT-2), `--bj-panel-w`, `--bj-panel-w-sm`, `--bj-panel-w-min`.

**Acessibilidade.**

- `.bj-panel-head` é `<h2>` estilizado, não `<div>` — sem isso não há navegação por regiões.
- Botão de colapsar: `aria-expanded`, `aria-controls` apontando para o corpo, `aria-label` em
  português ("Recolher checklist B6").
- **`flex-shrink: 0`** no painel e `min-width: var(--bj-viewport-min-w)` no viewport (§4.3).
- Colapso é **instantâneo** — sem transição de largura (§6).
- O indicador do painel recolhido segue C-09: contagem + ícone, nunca ponto de cor.

```css
.bj-panel {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  width: var(--bj-panel-w);
  min-width: var(--bj-panel-w-min);
  background: var(--bj-bg-base);
  border-right: 1px solid var(--bj-border-strong);
  overflow: hidden;
}
.bj-panel--left {
  width: var(--bj-panel-w-sm);
}
.bj-panel-head {
  display: flex;
  align-items: center;
  gap: var(--bj-space-2);
  min-height: var(--bj-control-h-lg);
  margin: 0;
  padding: 0 var(--bj-space-3);
  background: var(--bj-bg-sunken);
  border-bottom: 1px solid var(--bj-border);
  color: var(--bj-fg-primary);
  font: var(--bj-weight-medium) var(--bj-text-lg) var(--bj-font-display);
}
.bj-panel-body {
  flex: 1;
  min-height: 0;
  overflow: hidden auto;
  padding: var(--bj-space-3);
}
.bj-panel--collapsed {
  width: var(--bj-rail-w-compact);
  min-width: 0;
}
```

---

### C-11 — Aba

**Anatomia.** `<div role="tablist">` → N × `<button role="tab">` · painéis `<div role="tabpanel">`.

**Variantes.** `underline` (padrão, abas de página) · `segmented` (pílulas, dentro de painel denso) ·
`sub` (nível 2, `--bj-text-sm`).

**Estados.** `default` · `hover` (`--bj-hover`) · `selected` (`aria-selected="true"`:
`color: --bj-fg-primary`, peso 700, sublinhado de 2px em `--bj-brand`) · `focus` · `disabled`.

**Tokens.** `--bj-brand` (indicador), `--bj-fg-secondary` → `--bj-fg-primary`, `--bj-hover`,
`--bj-control-h`, `--bj-text-base`.

**Acessibilidade.**

- Padrão ARIA de abas completo: `role="tablist"` / `role="tab"` / `aria-selected` / `aria-controls`,
  navegação por **setas**, `Home`/`End` e _roving tabindex_ (só a aba selecionada é tabulável).
- **Um único componente `<Tabs>` para os três lugares** (Inspector, Equipes, Admin). Hoje são três
  implementações de `<button className="toggle active">` sem semântica nenhuma, e a classe `.toggle`
  tem dois donos com esquemas de cor opostos (ativo azul no viewport, ativo âmbar em equipes).
- **O estado ativo não é só cor:** peso 700 **e** sublinhado. O par `--bj-bg-raised` ×
  `--bj-accent-bg` mede 1,05:1 — diferença puramente de croma, que é o primeiro canal a se perder em
  projetor.
- **Proibido trocar de aba sob o usuário.** Selecionar algo no 3D não pode saltar a sub-aba do
  Inspector: sinalizar a nova seleção com um marcador na aba correspondente e só saltar quando a aba
  atual não tiver relação nenhuma com o objeto selecionado.

```css
.bj-tabs {
  display: flex;
  gap: var(--bj-space-1);
  border-bottom: 1px solid var(--bj-border);
}
.bj-tab {
  min-height: var(--bj-control-h);
  padding: 0 var(--bj-space-3);
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--bj-fg-secondary);
  font: var(--bj-weight-medium) var(--bj-text-base) var(--bj-font-sans);
  cursor: pointer;
}
.bj-tab:hover {
  background: var(--bj-hover);
  color: var(--bj-fg-primary);
}
.bj-tab[aria-selected='true'] {
  color: var(--bj-fg-primary);
  font-weight: var(--bj-weight-bold);
  border-bottom-color: var(--bj-brand);
}
```

---

### C-12 — Tabela de dados

**Anatomia.** `<div class="bj-table-wrap">` (rolagem horizontal própria) → `<table>` → `<caption>`
(em `.bj-sr-only`) · `<thead>` sticky · `<tbody>` · linha de vazio (C-16) ou de erro.

**Variantes.** `compact` (padrão em admin e equipes) · `comfortable` · `selectable` (primeira coluna
com C-06) · `numeric` (colunas numéricas em mono, alinhadas à direita).

**Estados.** `default` · `row:hover` (`--bj-hover`) · `row:selected` (`--bj-selected` **+**
`aria-selected="true"` **+** régua de 3px em `--bj-brand`) · `row:deleted` (`--bj-disabled-fg`, texto
riscado) · `loading` (skeleton de linhas) · `empty` · `error`.

**Tokens.** `--bj-bg-sunken` (`thead`), `--bj-bg-base` (`tbody`), `--bj-border` (grade),
`--bj-border-strong` (limite `thead`/`tbody`, CT-2), `--bj-row-h`, `--bj-pad-y`, `--bj-pad-x`,
`--bj-text-sm`, `--bj-font-mono` (numérico), `--bj-z-sticky`.

**Acessibilidade.**

- `<th scope="col">` obrigatório; `<caption>` descreve a tabela mesmo quando visualmente oculta.
- Linha selecionada carrega `aria-selected` — a tinta rende 1,25:1 e não comunica nada sozinha (CT-5).
- A rolagem horizontal fica no `.bj-table-wrap`, com `tabindex="0"` para que o teclado possa rolar.
- Estado de carregamento é `'loading' | 'ok' | 'error'`, **não** `null | T[]`. O padrão legado deixava
  "Carregando..." para sempre ao lado da mensagem de erro, porque `rows` nunca saía de `null`.
- Tabela vazia **sempre** tem linha de vazio com ação (C-16).
- `.bj-table` e `.bj-card` são **um** componente cada: os blocos `.admin-table`/`.team-table` e
  `.admin-card`/`.team-card` do legado são byte-a-byte idênticos e devem ser colapsados **antes** da
  tokenização, senão cada token é escrito duas vezes e a duplicata fica para sempre.

```css
.bj-table-wrap {
  overflow: auto;
  border: 1px solid var(--bj-border-strong);
  border-radius: var(--bj-radius);
}
.bj-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--bj-text-sm);
}
.bj-table th {
  position: sticky;
  top: 0;
  z-index: var(--bj-z-sticky);
  padding: var(--bj-pad-y) var(--bj-pad-x);
  background: var(--bj-bg-sunken);
  border-bottom: 1px solid var(--bj-border-strong);
  color: var(--bj-fg-secondary);
  font-weight: var(--bj-weight-medium);
  text-align: left;
}
.bj-table td {
  height: var(--bj-row-h);
  padding: var(--bj-pad-y) var(--bj-pad-x);
  border-bottom: 1px solid var(--bj-border);
  vertical-align: top;
}
.bj-table td.bj-num {
  font-family: var(--bj-font-mono);
  text-align: right;
}
.bj-table tbody tr:hover {
  background: var(--bj-hover);
}
.bj-table tbody tr[aria-selected='true'] {
  background: var(--bj-selected);
  box-shadow: inset 3px 0 0 0 var(--bj-brand);
}
```

---

### C-13 — Modal / diálogo

**Anatomia.** `.bj-overlay` (scrim) → `.bj-dialog` (`role="dialog"`) → `.bj-dialog-head`
(`<h2 id>` + botão fechar) · `.bj-dialog-body` (rolagem própria) · `.bj-dialog-foot` (ações,
primária à direita).

**Variantes.** `default` (`--bj-modal-w`) · `lg` (`--bj-modal-w-lg`, tabelas) · `confirm` (curto,
sem rolagem) · `confirm-danger` (ação primária em `danger`, e para exclusão de conta exige digitar o
e-mail).

**Estados.** `open` · `closing` · `busy` (ações desabilitadas, `aria-busy` no diálogo) · `error`
(mensagem no topo do corpo, `role="alert"`).

**Tokens.** `--bj-scrim`, `--bj-bg-overlay`, `--bj-border-strong`, `--bj-shadow-lg`,
`--bj-radius-lg`, `--bj-z-overlay`, `--bj-z-modal`, `--bj-modal-w`, `--bj-space-4/-5`.

**Acessibilidade — este é o componente com mais dívida acumulada.**

- `role="dialog"` + `aria-modal="true"` + `aria-labelledby` apontando para o `<h2>` do cabeçalho.
- **Foco inicial** no primeiro elemento interativo (ou no `<h2>` com `tabindex="-1"` quando o
  primeiro for destrutivo); **ciclo de Tab contido**; **foco restaurado no gatilho** ao fechar.
- **`Escape` fecha.** Não existe **um único** handler de teclado no `src` hoje além do Enter do
  textarea do assistente. `Esc fecha modal` já constava como pendência do estudo UX anterior.
- `inert` (ou `aria-hidden`) no resto da árvore enquanto aberto.
- Botão de fechar: `aria-label="Fechar"`, 32×32 mínimo. `✕` sozinho é proibido (C-03).
- **Um componente `<Dialog>` para tudo.** As sete confirmações em `window.confirm` e o `alert('JSON
inválido')` migram para ele: fora do tema, sem hierarquia entre "desistir de um convite" e "excluir
  a conta", e impossíveis de cobrir por teste.
- **Texto de erro dentro de modal usa o chip tinto** (C-07), nunca `--bj-fail` sobre
  `--bj-bg-overlay` nu (4,07:1).

```css
.bj-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--bj-z-overlay);
  display: grid;
  place-items: center;
  padding: var(--bj-space-4);
  background: var(--bj-scrim);
}
.bj-dialog {
  z-index: var(--bj-z-modal);
  display: flex;
  flex-direction: column;
  width: min(100%, var(--bj-modal-w));
  max-height: 82vh;
  background: var(--bj-bg-overlay);
  border: 1px solid var(--bj-border-strong);
  border-radius: var(--bj-radius-lg);
  box-shadow: var(--bj-shadow-lg);
}
.bj-dialog--lg {
  width: min(100%, var(--bj-modal-w-lg));
}
.bj-dialog-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--bj-space-3);
  margin: 0;
  padding: var(--bj-space-4);
  border-bottom: 1px solid var(--bj-border);
  color: var(--bj-fg-primary);
  font: var(--bj-weight-medium) var(--bj-text-xl) var(--bj-font-display);
}
.bj-dialog-body {
  flex: 1;
  min-height: 0;
  overflow: hidden auto;
  padding: var(--bj-space-4);
}
.bj-dialog-foot {
  display: flex;
  justify-content: flex-end;
  gap: var(--bj-space-2);
  padding: var(--bj-space-4);
  border-top: 1px solid var(--bj-border);
}
```

---

### C-14 — Toast

**Anatomia.** `.bj-toasts` (região fixa, canto inferior direito) → N × `.bj-toast` → ícone de 16px ·
texto · ação opcional (`ghost`) · botão de fechar.

**Variantes.** `info` · `pass` · `warn` · `fail`. A cor segue as famílias de status.

**Estados.** `entering` · `visible` · `leaving`. Duração: **5 s** para sucesso e informação,
**persistente até fechar** para erro. Toast com ação (Desfazer) dura **8 s**.

**Tokens.** `--bj-bg-overlay`, `--bj-<status>-border`, `--bj-<status>`, `--bj-shadow-md`,
`--bj-radius`, `--bj-z-toast`, `--bj-space-3`.

**Acessibilidade.**

- Região com `role="status"` + `aria-live="polite"` para sucesso/informação; erro usa
  `role="alert"` (assertivo). Não existe **nenhum** `aria-live` no app hoje: a confirmação de
  salvamento é um texto de 12px que aparece por 4 s no canto oposto ao foco, sem anúncio.
- Toast com ação: o botão é focável e a contagem **pausa** enquanto o mouse está sobre ele ou algo
  dentro dele tem foco.
- O toast de conflito de versão traz a ação embutida ("Abrir projetos") em vez de mandar o usuário
  abrir uma tela que a própria mensagem não abre.
- **Toast é o mecanismo de desfazer** para exclusão de membro e de nó: 8 s com "Desfazer",
  restaurando o último snapshot. O app não tem pilha de undo e não vai ganhar uma neste ciclo.

```css
.bj-toasts {
  position: fixed;
  right: var(--bj-space-4);
  bottom: var(--bj-space-4);
  z-index: var(--bj-z-toast);
  display: flex;
  flex-direction: column;
  gap: var(--bj-space-2);
  max-width: 360px;
}
.bj-toast {
  display: flex;
  align-items: flex-start;
  gap: var(--bj-space-2);
  padding: var(--bj-space-3);
  background: var(--bj-bg-overlay);
  border: 1px solid var(--bj-border-strong);
  border-radius: var(--bj-radius);
  box-shadow: var(--bj-shadow-md);
  color: var(--bj-fg-primary);
  font-size: var(--bj-text-sm);
}
.bj-toast--fail {
  border-color: var(--bj-fail-border);
}
.bj-toast--warn {
  border-color: var(--bj-warn-border);
}
.bj-toast--pass {
  border-color: var(--bj-pass-border);
}
.bj-toast--info {
  border-color: var(--bj-accent-border);
}
```

---

### C-15 — Tooltip

**Anatomia.** Gatilho (`aria-describedby`) → `.bj-tooltip` (`role="tooltip"`) com seta opcional.

**Variantes.** `default` (uma linha) · `rich` (até três linhas, para explicar jargão).

**Estados.** `hidden` · `visible`. Aparece em **hover e em foco**, some em `Escape` e em `blur`.
Atraso de entrada: `--bj-dur-base`; de saída: 0.

**Tokens.** `--bj-bg-overlay`, `--bj-border-strong`, `--bj-shadow-sm`, `--bj-radius`,
`--bj-text-sm`, `--bj-z-dropdown`.

**Acessibilidade.**

- **`title` é proibido como portador de informação.** Ele não aparece ao foco de teclado na maioria
  dos navegadores e nunca aparece ao toque. Hoje as explicações de "Geraldão", "Piloto" e
  "Redundância" existem **só** em `title` — e "Geraldão" é jargão de grupo.
- WCAG 1.4.13: o conteúdo é dispensável por `Escape`, permanece visível ao mover o ponteiro para
  dentro dele, e é persistente enquanto houver hover ou foco.
- Tooltip **não** carrega informação essencial. Para jargão que o usuário precisa entender, usar uma
  linha de ajuda persistente sob a barra de ferramentas (C-23), não tooltip.

```css
.bj-tooltip {
  position: absolute;
  z-index: var(--bj-z-dropdown);
  max-width: 280px;
  padding: var(--bj-space-2);
  background: var(--bj-bg-overlay);
  border: 1px solid var(--bj-border-strong);
  border-radius: var(--bj-radius);
  box-shadow: var(--bj-shadow-sm);
  color: var(--bj-fg-primary);
  font-size: var(--bj-text-sm);
  line-height: var(--bj-leading-normal);
}
```

---

### C-16 — Estado vazio

**Anatomia.** `.bj-empty` → ícone de 24px em `--bj-fg-faint` · título · uma linha de explicação ·
**ação primária** (C-03).

**Variantes.** `panel` (dentro de painel) · `table-row` (linha `<td colspan>`) · `page` (centro da
área de conteúdo).

**Estados.** Estático.

**Tokens.** `--bj-fg-secondary` (título), `--bj-fg-muted` (explicação), `--bj-fg-faint` (ícone),
`--bj-space-4/-5`, `--bj-text-base`, `--bj-text-sm`.

**Acessibilidade.**

- **Todo estado vazio tem saída.** Texto puro é proibido: o organograma vazio hoje diz "crie a
  estrutura padrão na aba Estrutura" e não leva a lugar nenhum; vira botão que troca a aba.
- Tabela vazia **sempre** renderiza linha de vazio. A tabela de membros hoje não renderiza nada
  quando `team.members` é vazio, ao contrário das quatro do Admin.
- O título não é uma piada nem uma frase de efeito: diz o que falta e a ação diz o que fazer.

```css
.bj-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--bj-space-2);
  padding: var(--bj-space-5);
  text-align: center;
  color: var(--bj-fg-muted);
  font-size: var(--bj-text-sm);
}
.bj-empty-title {
  color: var(--bj-fg-secondary);
  font-size: var(--bj-text-base);
  font-weight: var(--bj-weight-medium);
}
```

---

### C-17 — Skeleton

**Anatomia.** `.bj-skel` — bloco retangular com a **forma do conteúdo que vai chegar** (linha de
tabela, card, parágrafo de três linhas).

**Variantes.** `line` (altura `--bj-text-base`) · `block` (altura livre) · `row` (linha de tabela
completa, com as mesmas larguras de coluna).

**Estados.** Único. Não pisca; a animação é um _shimmer_ lento de `opacity`, desligado por
`prefers-reduced-motion` (§6).

**Tokens.** `--bj-bg-raised` (base), `--bj-hover` (brilho), `--bj-radius-sm`, `--bj-dur-base`.

**Acessibilidade.** O contêiner carrega `aria-busy="true"` e `aria-live="polite"`; os retângulos são
`aria-hidden`. Skeleton substitui o "Carregando..." solto — e nunca aparece **ao lado** de uma
mensagem de erro (o estado é `'loading' | 'ok' | 'error'`, exclusivos).

```css
.bj-skel {
  background: var(--bj-bg-raised);
  border-radius: var(--bj-radius-sm);
  animation: bj-skel-pulse 1600ms var(--bj-ease) infinite;
}
@keyframes bj-skel-pulse {
  50% {
    opacity: 0.55;
  }
}
```

---

### C-18 — Barra de progresso do wizard

**Anatomia.** `<ol class="bj-steps">` → N × `<li>` com marcador (número ou marca) · rótulo curto ·
conector.

**Variantes.** `horizontal` (padrão) · `dots` (só marcadores, quando o painel é estreito).

**Estados.** `done` (marcador preenchido em `--bj-brand`, glifo de marca em `--bj-on-brand`) ·
`current` (`aria-current="step"`, marcador com borda `--bj-brand`, número visível, rótulo em peso 700) · `todo` (marcador com borda `--bj-border-strong`, número em `--bj-fg-muted`) · `error`
(marcador com borda `--bj-fail-border`, glifo de alerta).

**Tokens.** `--bj-brand`, `--bj-on-brand`, `--bj-border-strong`, `--bj-fail-border`,
`--bj-radius-pill`, `--bj-text-sm`, `--bj-space-2/-3`.

**Acessibilidade.** `<ol>` real (a ordem é semântica), `aria-current="step"` no atual, e o estado
`done` marcado por **glifo**, não só por preenchimento colorido. Um rótulo textual acompanha cada
passo — "passo 3 de 6" está no `aria-label` da lista.

```css
.bj-steps {
  display: flex;
  gap: var(--bj-space-3);
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: var(--bj-text-sm);
}
.bj-step-dot {
  display: grid;
  place-content: center;
  width: 20px;
  height: 20px;
  border: 1px solid var(--bj-border-strong);
  border-radius: var(--bj-radius-pill);
  color: var(--bj-fg-muted);
}
.bj-step[data-state='done'] .bj-step-dot {
  background: var(--bj-brand);
  border-color: var(--bj-brand);
  color: var(--bj-on-brand);
}
.bj-step[aria-current='step'] .bj-step-dot {
  border-color: var(--bj-brand);
  color: var(--bj-brand);
}
.bj-step[data-state='error'] .bj-step-dot {
  border-color: var(--bj-fail-border);
  color: var(--bj-fail);
}
```

---

### C-19 — Cartão

**Anatomia.** `.bj-card` → cabeçalho (título · chip opcional) · corpo (texto curto ou métrica) ·
rodapé com **uma** ação.

**Variantes.** `static` (informativo) · `action` (o cartão inteiro é `<a>`/`<button>`) ·
`metric` (número grande em display + rótulo) · `nested` (dentro de painel: fundo `--bj-bg-base`
sobre `--bj-bg-sunken`).

**Estados.** `default` · `hover` (só na variante `action`: `background: --bj-hover`,
`border-color: --bj-border-strong`) · `focus` · `selected` (`--bj-selected` + borda
`--bj-border-stronger` + `aria-current`) · `disabled`.

**Tokens.** `--bj-bg-raised`, `--bj-border`, `--bj-border-strong`, `--bj-radius`,
`--bj-shadow-sm` (só em hover de `action`), `--bj-space-3/-4`, `--bj-font-display` (métrica).

**Acessibilidade.** Cartão clicável é **um único** elemento interativo — nunca um card `<div
onClick>` com botão dentro (mesmo defeito do item de checklist). Se precisar de duas ações, o cartão
é estático e as ações ficam no rodapé. Grid de cartões: `grid-template-columns: repeat(auto-fill,
minmax(240px, 1fr))`, que dá 4 colunas em `xl`, 3 em `lg` e 1 em `sm` sem media query.

```css
.bj-card {
  display: flex;
  flex-direction: column;
  gap: var(--bj-space-2);
  padding: var(--bj-space-3);
  background: var(--bj-bg-raised);
  border: 1px solid var(--bj-border);
  border-radius: var(--bj-radius);
}
.bj-card--action:hover {
  background: var(--bj-hover);
  border-color: var(--bj-border-strong);
  box-shadow: var(--bj-shadow-sm);
}
.bj-card-metric {
  color: var(--bj-fg-primary);
  font: var(--bj-weight-medium) var(--bj-text-2xl) / var(--bj-leading-tight) var(--bj-font-display);
}
.bj-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: var(--bj-space-3);
}
```

---

### C-20 — Chip de citação do assistente

**Anatomia.** `<button class="bj-cite">` → ícone de documento 16px · referência em mono
("§ B6.2.4.3 · p. 42").

**Variantes.** `inline` (dentro do parágrafo da resposta) · `list` (rodapé da mensagem, agrupados).

**Estados.** `default` · `hover` · `focus` · `active` (a regra citada fica destacada no checklist).

**Tokens.** `--bj-accent`, `--bj-accent-bg`, `--bj-accent-border`, `--bj-font-mono`,
`--bj-text-sm`, `--bj-radius-sm`, `--bj-space-1/-2`.

**Acessibilidade.**

- Usa a família **accent**, não `info`. `--bj-info` sobre `--bj-bg-base` mede 1,18:1 contra
  `--bj-fg-secondary` e ΔE00 5,4 — o chip informativo é indistinguível do texto ao redor, e a citação
  é justamente o elemento de credibilidade do assistente.
- `aria-label` completo em português ("Abrir regra B6.2.4.3, página 42") — o texto abreviado do chip
  não serve como nome acessível.
- Altura mínima 32px; não usar padding vertical de 1px como no legado.
- O chip é **prova**, não decoração: se a resposta não tem citação, ela não ganha um chip vazio.
- O contexto injetado na pergunta é visível como chip removível acima do campo de entrada
  ("contexto: regra B6.2.4.3 — INFRAÇÃO"). Hoje o contexto entra invisivelmente e o usuário não
  entende por que a resposta seguinte muda de tom.

```css
.bj-cite {
  display: inline-flex;
  align-items: center;
  gap: var(--bj-space-1);
  min-height: var(--bj-target-min);
  padding: var(--bj-space-1) var(--bj-space-2);
  background: var(--bj-accent-bg);
  border: 1px solid var(--bj-accent-border);
  border-radius: var(--bj-radius-sm);
  color: var(--bj-accent);
  font: var(--bj-weight-medium) var(--bj-text-sm) var(--bj-font-mono);
  cursor: pointer;
}
.bj-cite:hover {
  background: var(--bj-hover);
}
```

---

### C-21 — Bolha de mensagem

**Anatomia.** `<article class="bj-msg">` → corpo (markdown renderizado) · rodapé (citações C-20 ·
horário · ações).

**Variantes.** `user` (alinhada à direita, `--bj-accent-bg` + `--bj-accent-border`) · `assistant`
(alinhada à esquerda, `--bj-bg-raised` + `--bj-border`) · `system` (centrada, `--bj-info-bg`,
`--bj-text-sm`).

**Estados.** `default` · `streaming` (cursor de bloco piscando ao fim do texto, `aria-busy="true"`) ·
`error` (chip `fail` + botão "Tentar de novo") · `stopped`.

**Tokens.** `--bj-bg-raised`, `--bj-accent-bg`, `--bj-accent-border`, `--bj-border`,
`--bj-radius-lg`, `--bj-prose-w`, `--bj-space-3/-4`, `--bj-leading-normal`.

**Acessibilidade.**

- A lista de mensagens é `<div role="log" aria-live="polite" aria-relevant="additions">`. Durante o
  streaming, **não** anunciar cada token: anunciar a mensagem completa ao final, com `aria-busy` no
  artigo enquanto corre.
- Largura de leitura limitada a `--bj-prose-w`; nada de linha de 1200px.
- Botão "Nova conversa" no cabeçalho da página. O store já tem `clear()` e **nenhum componente o
  chama** — a conversa não pode ser reiniciada nem retomada hoje.
- Blocos de código dentro da bolha usam `--bj-bg-inset` + `--bj-font-mono` e rolam em contêiner
  próprio.

```css
.bj-msg {
  max-width: var(--bj-prose-w);
  padding: var(--bj-space-3) var(--bj-space-4);
  border: 1px solid var(--bj-border);
  border-radius: var(--bj-radius-lg);
  background: var(--bj-bg-raised);
  color: var(--bj-fg-primary);
  line-height: var(--bj-leading-normal);
}
.bj-msg--user {
  margin-left: auto;
  background: var(--bj-accent-bg);
  border-color: var(--bj-accent-border);
}
.bj-msg--system {
  margin-inline: auto;
  background: var(--bj-info-bg);
  border-color: var(--bj-info-border);
  font-size: var(--bj-text-sm);
}
```

---

### C-22 — Organograma (nó / nível / vaga)

**Anatomia.** `.bj-org` (fundo com grade em `--bj-border`) → `.bj-org-level` (linha) →
`.bj-org-node` (avatar · nome · cargo · chip de papel) · conectores em `--bj-border-strong`.

**Variantes por papel.**

| Papel       | Desenho                                                                                        |
| ----------- | ---------------------------------------------------------------------------------------------- |
| `captain`   | Borda `--bj-brand-border`, chip `brand` com o texto "capitão".                                 |
| `cocaptain` | Borda `--bj-brand-border`, nome em `--bj-brand-dim`, chip `brand` "vice".                      |
| `lead`      | Borda `--bj-accent-border`, chip `neutral` com o nome da área.                                 |
| `member`    | Borda `--bj-border`, sem chip.                                                                 |
| `custom`    | Borda `--bj-border-strong` (**não** `--bj-border`, que hoje é um _no-op_ a 1,30:1 sobre o nó). |
| `vacant`    | Borda **tracejada** `--bj-border-strong`, fundo `--bj-bg-inset`, chip `neutral` "vaga".        |
| `trainee`   | Chip `info` (**não** `brand` — §2.5, proibição de forma-chip para a marca).                    |

**Estados.** `default` · `hover` (`--bj-hover`) · `focus` · `selected` (`--bj-selected` **+** borda
`--bj-border-stronger` **+** `aria-selected="true"`) · `collapsed` (ramo recolhido, contador de
ocultos) · `dragging`.

**Tokens.** `--bj-bg-sunken` (fundo), `--bj-bg-base` (nó), `--bj-border`, `--bj-border-strong`,
`--bj-border-stronger`, `--bj-brand-border`, `--bj-brand-dim`, `--bj-accent-border`,
`--bj-selected`, `--bj-radius`, `--bj-space-2/-3`.

**Acessibilidade.**

- O `.bj-org` é `role="region"` com `aria-label`; a árvore editável usa `role="tree"` /
  `role="treeitem"` com `aria-level`, `aria-expanded` e navegação por setas.
- **`vacant` é o modelo do produto inteiro**: tracejado + fundo + pílula "vaga". Cor é a terceira
  pista, não a única. Todo estado do sistema deveria ter essa qualidade.
- Botão de recolher ramo: 32×32 mínimo (hoje 20×20).
- **A borda de seleção não pode virar `--bj-selected`.** O legado usava azul saturado; a tinta
  composta rende 1,25:1 e apagaria a indicação. Seleção = tinta **+** `--bj-border-stronger` (CT-5).
- Indentação por nível usa `--bj-space-4` (16px) via CSS, não `marginLeft: depth * 18` inline.

```css
.bj-org-node {
  display: flex;
  align-items: center;
  gap: var(--bj-space-2);
  padding: var(--bj-space-2) var(--bj-space-3);
  background: var(--bj-bg-base);
  border: 1px solid var(--bj-border);
  border-radius: var(--bj-radius);
  transition:
    border-color var(--bj-dur-fast) var(--bj-ease),
    background var(--bj-dur-fast) var(--bj-ease);
}
.bj-org-node--captain,
.bj-org-node--cocaptain {
  border-color: var(--bj-brand-border);
}
.bj-org-node--lead {
  border-color: var(--bj-accent-border);
}
.bj-org-node--custom {
  border-color: var(--bj-border-strong);
}
.bj-org-node--vacant {
  background: var(--bj-bg-inset);
  border-style: dashed;
  border-color: var(--bj-border-strong);
}
.bj-org-node[aria-selected='true'] {
  background: var(--bj-selected);
  border-color: var(--bj-border-stronger);
}
.bj-org-connector {
  border-left: 1px solid var(--bj-border-strong);
}
```

---

### C-23 — Toolbar do viewport

**Anatomia.** `.bj-vp-toolbar` (flutuante, canto superior esquerdo do viewport) → grupos de
alternadores (Gabarito de habitáculo · Piloto · Redundância) · separador · ações de câmera
(enquadrar, vistas ortogonais) · linha de ajuda persistente abaixo.

**Variantes.** `full` · `compact` (**rótulo abreviado**, abaixo de `--bj-viewport-min-w` + 200px).
`compact` **não** é só-ícone: "Gabarito", "Piloto" e "Redundância" nomeiam camadas — substantivos de
domínio —, e §8.4 os proíbe sem rótulo escrito.

**Estados por botão.** `off` (`--bj-bg-raised`, `aria-pressed="false"`) · `on`
(`background: --bj-accent-bg`, borda `--bj-accent-border`, **marca de verificação antes do rótulo**,
`aria-pressed="true"`) · `hover` · `focus` · `disabled` (camada indisponível para o modelo atual).

**Tokens.** `--bj-bg-raised`, `--bj-accent-bg`, `--bj-accent-border`, `--bj-border-strong`,
`--bj-radius`, `--bj-shadow-sm`, `--bj-z-viewport-chrome`, `--bj-control-h`.

**Acessibilidade.**

- **`aria-pressed` obrigatório.** Não existe **nenhum** `aria-pressed` no app hoje: para leitor de
  tela, o estado ligado/desligado das três camadas simplesmente não existe.
- **O estado ligado não é só cor.** `--bj-bg-raised` × `--bj-accent-bg` mede 1,05:1 — a diferença é
  puramente de croma, o primeiro canal a se perder em projetor desbotado e em parte das dicromacias.
  Por isso o estado ligado ganha **glifo de verificação** antes do rótulo.
- Cada alternador ligado exibe um **ponto na cor da camada que ele controla** (§9): vira legenda
  embutida e resolve parte da lacuna de cobertura da legenda.
- **Nenhum alternador recebe glifo de domínio.** Marca de verificação + ponto de camada + rótulo já
  são três marcadores num controle de `--bj-control-h` flutuando sobre a cena; um quarto seria textura,
  e encostaria um glifo reservado a status (§8.7) num glifo de domínio. Decisão registrada em §8.4.
- `z-index: var(--bj-z-viewport-chrome)` (50) — **acima** dos rótulos 3D em 40. Sem isso, um rótulo de
  nó cobre os alternadores.
- A explicação de cada camada é **texto persistente** na linha de ajuda, não `title` (C-15). O
  gabarito é rotulado "gabarito de habitáculo (Geraldão)" pelo menos uma vez — "Geraldão" é apelido
  de grupo e não serve para juiz nem para calouro.

```css
.bj-vp-toolbar {
  position: absolute;
  top: var(--bj-space-3);
  left: var(--bj-space-3);
  z-index: var(--bj-z-viewport-chrome);
  display: flex;
  gap: var(--bj-space-1);
  padding: var(--bj-space-1);
  background: var(--bj-bg-base);
  border: 1px solid var(--bj-border-strong);
  border-radius: var(--bj-radius);
  box-shadow: var(--bj-shadow-sm);
}
.bj-vp-toggle {
  display: inline-flex;
  align-items: center;
  gap: var(--bj-space-1);
  min-height: var(--bj-control-h);
  padding: 0 var(--bj-space-2);
  background: var(--bj-bg-raised);
  border: 1px solid var(--bj-border-strong);
  border-radius: var(--bj-radius-sm);
  color: var(--bj-fg-secondary);
  font: var(--bj-weight-medium) var(--bj-text-sm) var(--bj-font-sans);
  cursor: pointer;
}
.bj-vp-toggle[aria-pressed='true'] {
  background: var(--bj-accent-bg);
  border-color: var(--bj-accent-border);
  color: var(--bj-accent);
}
```

---

### C-24 — Legenda do viewport

**Anatomia.** `.bj-legend` (canto inferior esquerdo) → N × `.bj-legend-item` → **amostra** (mínimo
24×12px) · rótulo.

**Variantes.** `full` (todos os significados ativos) · `collapsed` (botão "Legenda" que abre).

**Estados.** `expanded` · `collapsed`. A legenda mostra **só os significados presentes na cena atual**
— ligar Redundância acrescenta a entrada correspondente.

**Tokens.** `--bj-bg-base`, `--bj-border-strong`, `--bj-radius`, `--bj-text-sm`,
`--bj-z-viewport-chrome`, `--bj-space-2`.

**Acessibilidade.**

- **A amostra tem no mínimo 24×12px.** A do legado tem 14×5px: a discriminação cromática degrada em
  campos pequenos, então a legenda era justamente onde a paleta otimizada rendia pior.
- **A amostra ensina o código de forma, não só a cor** — contorno para VERIFICAR, preenchimento para
  INFRAÇÃO, tracejado para wireframe, círculo pequeno para nó, losango para ancoragem. Forma é o
  canal primário da cena (§9.3); a legenda tem que ensinar o canal primário.
- **As entradas de forma desenham a forma na própria caixa de amostra, de 24×16 — não usam glifo de
  ícone.** Losango para ancoragem, círculo pequeno para nó, volume do manequim: a amostra é a forma da
  cena reduzida, e §8.4 lista a amostra da legenda como **não-ícone**, fora do escopo de §8. Não há
  glifo de domínio no sistema para usar aqui (§8.6), e não faz falta: a amostra reproduz o que a cena
  desenha, o que um glifo estilizado nunca faria. As entradas de **cor pura** mantêm a amostra de
  24×12: nelas a informação é a cor renderizada do cilindro, e substituir por forma mentiria.
- **A cor da amostra é a cor renderizada, não a crua.** A cena aplica `metalness 0.4` /
  `roughness 0.5` e iluminação; o desvio entre o hex do material e o tubo na tela chega a 2,7:1. A
  amostra é renderizada sob a mesma luz, ou é um recorte do próprio buffer.
- `pointer-events: none` é **removido** — sem isso não há tooltip nem foco.
- `z-index: var(--bj-z-viewport-chrome)`, acima dos rótulos 3D.
- A legenda cobre **todos** os significados ativos. A do legado cobria 5 de ~15.

```css
.bj-legend {
  position: absolute;
  left: var(--bj-space-3);
  bottom: var(--bj-space-3);
  z-index: var(--bj-z-viewport-chrome);
  display: flex;
  flex-direction: column;
  gap: var(--bj-space-1);
  padding: var(--bj-space-2);
  background: var(--bj-bg-base);
  border: 1px solid var(--bj-border-strong);
  border-radius: var(--bj-radius);
  color: var(--bj-fg-secondary);
  font-size: var(--bj-text-sm);
}
.bj-legend-item {
  display: flex;
  align-items: center;
  gap: var(--bj-space-2);
}
.bj-legend-swatch {
  width: 24px;
  height: 12px;
  border-radius: var(--bj-radius-sm);
}
.bj-legend-swatch--shape {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 16px;
  border-radius: 0;
}
```

---

### C-25 — Rótulo 3D (`drei/Html`)

**Anatomia.** `<Html zIndexRange={[40, 0]}>` → `.bj-3d-label` → texto (id do nó, cota, papel da
ancoragem).

**Variantes.** `node` (nó nomeado, peso 500) · `free` (nó livre, peso 400) · `anchor` (ancoragem: a
distinção é a **borda**, não a cor do texto) · `measure` (cota, em mono).

**Estados.** `default` · `selected` (borda `--bj-3d-selected`) · `hidden` (fora do campo, ou
densidade alta demais: os rótulos entram em _decluttering_ por distância).

**Tokens.** `--bj-3d-label-bg` (**opaco**), `--bj-3d-label-fg`, `--bj-border`, `--bj-radius-sm`,
`--bj-text-xs`, `--bj-z-3d-label`.

**Acessibilidade.**

- **A placa é opaca**, derivada do fundo do viewport (`--bj-3d-label-bg` `#241f19`). Isso resolve dois
  problemas de uma vez: a placa acompanha o fundo se ele mudar, e o contraste do texto passa a ser
  **13,26:1 contra a placa** — a "pior superfície atrás" deixa de importar. As placas translúcidas do
  legado (`rgba(15,18,22,.75)`) faziam o rótulo de nó livre cair de 6,10:1 para 3,52:1 quando
  compunham sobre um tubo primário iluminado.
- Os `Html` **não** usam `occlude`, então rótulos do lado oposto da gaiola são desenhados por cima da
  geometria da frente. Com a placa opaca isso deixa de ser problema de contraste, mas continua sendo
  de leitura: aplicar `occlude` onde a densidade permitir.
- `distanceFactor` encolhe o texto no zoom-out. Piso: abaixo de `--bj-text-xs` efetivo, o rótulo é
  **ocultado**, não miniaturizado.
- Rótulo 3D nunca é o único portador de uma informação: tudo que ele diz existe também na lista DOM
  do Inspector (§10.7).

```css
.bj-3d-label {
  padding: var(--bj-space-1) var(--bj-space-2);
  background: var(--bj-3d-label-bg);
  border: 1px solid var(--bj-border);
  border-radius: var(--bj-radius-sm);
  color: var(--bj-3d-label-fg);
  font: var(--bj-weight-medium) var(--bj-text-xs) var(--bj-font-sans);
  white-space: nowrap;
  pointer-events: none;
}
.bj-3d-label--free {
  font-weight: var(--bj-weight-regular);
}
.bj-3d-label--measure {
  font-family: var(--bj-font-mono);
}
```

---

## 8. Iconografia

### 8.1 Estilo e métrica

Traço, não preenchimento. `viewBox="0 0 24 24"`, `fill="none"`, `stroke="currentColor"`,
`stroke-width="1.6"`, `stroke-linecap="round"`, `stroke-linejoin="round"`. É o estilo que
`Landing.tsx` já usa e não há razão para um segundo.

Ícones são componentes React em `apps/web/src/icons/`, um por arquivo, sem biblioteca externa. `fill`
literal é **proibido**; a cor vem sempre de `currentColor`, o que os torna automaticamente corretos em
qualquer variante de botão, chip ou status.

```tsx
<svg
  width="16"
  height="16"
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  strokeWidth="1.6"
  strokeLinecap="round"
  strokeLinejoin="round"
  aria-hidden="true"
  focusable="false"
/>
```

**O bloco acima é o que o primitivo emite, não o que o arquivo de ícone escreve.**
`apps/web/src/icons/Svg.tsx` é o único lugar do repositório onde `viewBox`, `fill`, `stroke`,
`stroke-width`, `stroke-linecap`, `stroke-linejoin`, `aria-hidden` e `focusable` aparecem escritos.
Um arquivo de ícone contém **só geometria**; se ele declara qualquer um desses atributos, está errado.

**A métrica de origem é 24×24 com traço 1.6, e 1.6 vale em todos os tamanhos de caixa.** Não há escada
de compensação por tamanho. A alternativa examinada — emitir `2.0` a 16px para igualar a tinta efetiva
de 20px — foi **recusada**; o motivo, com as contas, está em §8.3.

**Ao adaptar um glifo desenhado em outra grade, o trabalho é de geometria, não de atributo.** Trocar
`stroke-width="2"` por `1.6` num glifo desenhado para 2 numa grade estranha não o converte: retira 20%
de tinta de um desenho cujos vãos foram calibrados para outra coisa. Procedimento obrigatório:

1. **Grade.** Se a origem não for 24×24, o glifo **não é adaptado — é redesenhado** (§8.9). Reescalar
   uma grade de 15 (Radix) ou de 256 (Phosphor) para 24 desloca todo traço para fora de coordenada
   inteira e destrói o padding calculado.
2. **Despir.** Remover `xmlns`, `width`, `height`, `class`, `style`, `fill`, `stroke`, `stroke-width`,
   `stroke-linecap`, `stroke-linejoin`. Sobra a geometria.
3. **Nenhum valor de cor pode restar.** Um `stroke="#0F172A"` esquecido reprova em `check-tokens`
   (§1.3) — e é exatamente por isso que Heroicons foi reprovado como doador (§8.2).
4. **Nenhuma `opacity`.** Um segundo peso visual obtido por transparência não existe neste sistema:
   ele desaparece em impressão e em `forced-colors`, e não é reproduzível com `currentColor`.
5. **Reconferir padding e vão mínimo de §8.3 com o traço 1.6.** Passar a 2.0 e falhar a 1.6 é
   reprovação, não arredondamento.
6. **Teto de complexidade:** no máximo 4 subpaths e 5 traços por glifo. Sem texto, sem hachura, sem
   perspectiva, sem preenchimento, sem gradiente. **Exceção única e registrada:** `IconSliders`
   (`sliders-horizontal`) tem 9 elementos. Ele entra assim mesmo, como cópia literal do doador, porque
   redesenhá-lo para caber no teto seria exatamente o desenho à mão que este documento passou a
   proibir. Ver a ressalva de uso em §8.5.

**A renormalização 2 → 1.6 dentro do próprio Lucide é o caso verificado, e é o único.** O doador já
nasce na grade de 24; as 21 formas do inventário (§8.5) foram rasterizadas a 16, 20 e 24px com traço
1.6, em Chrome headless com `--force-device-scale-factor=1` — 16px CSS = 16 pixels de dispositivo — e
lidas pixel a pixel numa segunda passagem com `image-rendering: pixelated`. Nenhuma se fundiu, nenhuma
sumiu, **nenhuma coordenada foi tocada**: a diferença entre 2 e 1.6 é um atributo só, e ele mora no
`<svg>` raiz, que é o primitivo. O `viewBox` continua 24. Fora do Lucide o item 1 vale sem exceção —
Iconoir (1.5, contra-espaços que fecham a 1.6), Material 24 e Material Symbols 960 (path preenchido, e
o 960 ainda inverte o eixo Y), Phosphor 256 (a variante "regular" não é traço), Solar (mistura caps
`butt` e `round` no mesmo desenho) e game-icons 512 (preenchido, e com retângulo de fundo preto como
primeiro elemento) foram examinados glifo a glifo e **reprovados**.

**Regra de build, não negociável: `stroke-linecap="round"` é obrigatório, e o
`removeUselessStrokeAndFill` do SVGO fica desligado.** Dois glifos de status dependem literalmente
disso: `IconInfoCircle` traz `M12 8h.01` e `IconTriangleAlert` traz `M12 17h.01` — segmentos de
comprimento ~0 que só viram disco por causa do cap arredondado. Na raster a 16px o pingo aparece e
fica separado da haste por ~1px; com `stroke-linecap="butt"` ele **desaparece**, os dois glifos ficam
mutilados e nada falha no CI. O mesmo mecanismo já mordeu o `IconShield` legado de `Landing.tsx`
(§8.8). Otimizador de SVG que não saiba excluir esses caminhos não entra no pipeline.

### 8.2 Origem dos glifos e licença

#### A decisão

**Doador único: Lucide, versão fixada, glifos copiados para dentro do repositório. O pacote
`lucide-react` não é instalado.**

**Versão fixada: Lucide v1.34.0** — tag `1.34.0`, commit `1a60fd28ed7111bbf6acedc0896f3d83cd73945a`,
<https://github.com/lucide-icons/lucide>. Toda geometria do sistema saiu daí, arquivo a arquivo, e a
§8.10 traz cada `svg_inner` conferido contra essa tag.

**O que se copia: tudo. As 21 formas do inventário, sem exceção.** A gramática genérica de interface —
seta, chevron, chevron duplo, fechar, mais, lixeira, exportar, importar, nuvem, restaurar, balão,
silhuetas, controles deslizantes, folhas, escudo —, os cinco glifos de status de §8.7 **e** o
`IconAccount` (`circle-user`), que antes estava marcado para redesenho e não precisou: a rasterização
lado a lado (§8.5, formas humanas) mostrou que ele já se separa do `IconPerson` por topologia.

**O que se desenha: nada.** A camada de domínio de §8.6 morreu inteira — os três conceitos que
sobreviviam ao portão de §8.4 não encontraram glifo real e bem desenhado em conjunto aberto nenhum, e
o que existia no documento eram aproximações escritas à mão imitando o Lucide. **Desenho à mão deixa
de ser um caminho permitido neste sistema** (§8.9, passo 3): ou existe glifo pronto que passe no teste
a 16px, ou o conceito vira texto. Entregar desenho ruim é pior que não ter ícone.

**Doador único mantido, zero exceção.** Como nenhum conceito de domínio sobreviveu, nenhum candidato
de fora entrou: não há Tabler, não há Apache 2.0, não há CC BY. Um conjunto, uma versão fixada, duas
licenças (ISC + MIT/Feather) — e é só isso que o repositório precisa reproduzir. A única alternativa
que chegou a passar no teste óptico e foi **recusada por semântica e por custo** está registrada em
§8.6; se algum dia uma decisão de marca a reabrir, ela exige exceção escrita aqui, uma terceira
entrada de licença e uma segunda versão fixada.

**Os cinco glifos de status congelam no ato da cópia.** A partir do commit em que entram, a geometria
deles é contrato deste documento (CT-3), não referência a um projeto externo: uma atualização do
Lucide **nunca** se propaga para eles. Alterar a forma de um status exige emenda ao ADR-009 (§8.9).

#### Por que Lucide, e por que não o pacote

| Conjunto         | Grade nativa    | Traço nativo    | Cor no arquivo    | Veredito                                          |
| ---------------- | --------------- | --------------- | ----------------- | ------------------------------------------------- |
| **Lucide**       | 24×24           | 2               | `currentColor`    | **doador**                                        |
| Feather          | 24×24           | 2               | `currentColor`    | congelado; Lucide é o fork vivo                   |
| Tabler           | 24×24           | 2               | `currentColor`    | vice; casamento de peso **confirmado na raster**  |
| Heroicons        | 24×24 (só o 24) | 1.5             | `#0F172A` literal | reprovado — hex no arquivo reprova `check-tokens` |
| Phosphor         | 256×256         | path preenchido | —                 | outra métrica; a conversão destrói a grade        |
| Radix Icons      | 15×15           | ~1              | —                 | grade incompatível                                |
| Material Symbols | 24 com eixos    | path preenchido | —                 | não é traço; contraria §8.1, e o 960 inverte o Y  |
| Iconoir          | 24×24           | 1.5             | `currentColor`    | contra-espaços que **fecham** ao subir para 1.6   |
| Solar            | 24×24           | 1.5             | `currentColor`    | mistura caps `butt` e `round`; e é CC BY 4.0      |
| game-icons       | 512×512         | preenchido      | —                 | vem com retângulo de fundo preto; CC BY 3.0       |

Todas as linhas abaixo do Lucide foram reexaminadas glifo a glifo durante a validação de §8.6, com
candidatos reais baixados da origem — não por reputação de conjunto.

Instalar `lucide-react` está descartado por três razões, nesta ordem:

1. **Deriva de versão é bug de acessibilidade aqui.** Um _bump_ menor pode redesenhar um glifo. Os
   cinco de §8.7 são um contrato de distinção de forma; uma dependência externa pode alterar essa
   forma sem que ninguém revise. Copiar congela a geometria sob revisão de PR.
2. **O `strokeWidth` padrão do pacote é 2** e teria de ser sobrescrito em todo call site ou por um
   _wrapper_ — e o wrapper custa exatamente o mesmo que possuir o arquivo.
3. **Custo de desenvolvimento com Vite.** Importar do _barrel_ puxa ~1.583 módulos para o grafo do
   servidor de dev (Vite não faz _tree-shaking_ em dev). É o mesmo mecanismo descrito em §8.8.

**Regra dura: doador único.** É **proibido** misturar Lucide com Tabler, Heroicons ou qualquer outro
conjunto sob o mesmo `stroke-width` nominal — a mesma espessura declarada sobre geometrias desenhadas
para pesos diferentes produz ícones que _parecem_ de pesos diferentes. **Se um glifo não existe no
Lucide, o conceito vira texto** (§8.4) — não se pesca em outro conjunto e, desde a validação de §8.6,
também não se desenha à mão.

**Duas armadilhas de nome, ambas verificadas no path do doador, ambas prontas para enganar quem buscar
por palavra:** `lucide/nut` é uma **castanha** (o alimento), não uma porca de fixação; `lucide/anchor`
é uma **âncora náutica**, que casa com o nome `IconAnchor` e erra o significado por completo. Buscar
por nome nunca basta — o path tem de ser aberto e olhado.

**Dois nomes mudaram upstream e os antigos dão 404:** `alert-triangle` → `triangle-alert`,
`user-circle` → `circle-user`. O `LICENSE` da tag 1.34.0 ainda lista `alert-triangle` pelo nome antigo;
é o mesmo glifo.

#### O que a licença exige

O `LICENSE` do Lucide contém **duas** licenças, e isso não é detalhe:

- **ISC** — cabeçalho de copyright da tag 1.34.0: _"Copyright (c) 2026 Lucide Icons and
  Contributors"_, com a nota de atribuição parcial _"Copyright (c) for portions of Lucide are held by
  Cole Bemis 2013-2022 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide
  Contributors 2022."_ Cobre **os 21 glifos**. Cláusula operante: _"provided that the above copyright
  notice and this permission notice appear in all copies."_
- **MIT** — "Copyright (c) 2013-present Cole Bemis" — cobre nominalmente os **147** ícones herdados
  do Feather, listados de `airplay` a `zoom-out`. Cláusula operante: _"The above copyright notice and
  this permission notice shall be included in all copies or substantial portions of the Software."_

**Onze dos 21 caem na lista MIT/Feather**, e a lista é nominal, não estimada: `check` ·
`triangle-alert` (que o `LICENSE` ainda lista pelo nome antigo `alert-triangle`) · `info` ·
`arrow-right` · `chevron-right` · `chevrons-right` · `x` · `plus` · `trash` · `download` · `upload`.
Os outros **dez** são ISC pura: `ban` · `user` · `cloud-upload` · `rotate-ccw` · `message-square` ·
`users` · `files` · `sliders-horizontal` · `circle-user` · `shield`. Reproduzir só a ISC seria
**descumprir** a MIT. Os dois textos vão juntos, sem edição.

**Contagem corrigida:** a auditoria anterior dizia "doze" e listava onze; o décimo segundo seria
`trash-2`, que não entrou no inventário. **Onze** é o número do conjunto final.

**Não é obrigatório separar o aviso por glifo** — o aviso duplo cobrindo o conjunto satisfaz as duas
licenças. A lista nominal dos onze consta mesmo assim, para quem auditar.

**Conjuntos e licenças que deixaram de existir no projeto ao morrer a camada de domínio:** Tabler
(MIT, Pawel Kuna), MDI e Material Design Icons do Google (Apache 2.0, que obrigaria a incluir cópia
integral da licença e preservar avisos de alteração), Solar (CC BY 4.0, a única da lista que exige
atribuição explícita e **visível**) e game-icons (CC BY 3.0). **Nenhuma entra.**

#### Onde o aviso fica no repositório

**Os conjuntos que sobraram são um só, e as licenças a reproduzir são duas:**

| Conjunto   | Versão fixada                                                | Cobre                      | Licença                                                             | Exige crédito na tela? |
| ---------- | ------------------------------------------------------------ | -------------------------- | ------------------------------------------------------------------- | ---------------------- |
| **Lucide** | `1.34.0` · commit `1a60fd28ed7111bbf6acedc0896f3d83cd73945a` | os 21 glifos do inventário | **ISC** (conjunto) + **MIT**/Cole Bemis (os 11 herdados do Feather) | **não**                |

Não há segunda linha, e o `THIRD-PARTY-NOTICES.md` não deve ganhar uma sem exceção escrita em §8.2.
Como o pacote `lucide-react` **não** é instalado, nenhuma entrada de licença é gerada a partir do
`package.json`: o aviso é mantido à mão ou não existe.

| Onde                            | O quê                                                                                                                                                                                                                                                                                   |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`/THIRD-PARTY-NOTICES.md`**   | Arquivo novo, na raiz. Seção `## Lucide` com a linha de versão (`Lucide v1.34.0 (commit 1a60fd28ed7111bbf6acedc0896f3d83cd73945a) — https://github.com/lucide-icons/lucide`), o texto **ISC** íntegro, o texto **MIT** íntegro e a lista nominal dos **11** glifos herdados do Feather. |
| `apps/web/src/icons/README.md`  | Cabeçalho curto apontando para o arquivo da raiz e repetindo "doador único, versão fixada `1.34.0`".                                                                                                                                                                                    |
| Cabeçalho de cada arquivo doado | Comentário de uma linha: `/* lucide: chevron-right @ 1.34.0 — ISC/MIT, ver THIRD-PARTY-NOTICES.md */`. **Todo arquivo de ícone leva o comentário, porque todo glifo é doado; a ausência é bug, não sinal.**                                                                             |
| `docs/adr/009-design-system.md` | Um parágrafo em Consequências registrando o doador único, a versão fixada e a obrigação de aviso duplo.                                                                                                                                                                                 |

**`THIRD-PARTY-NOTICES.md` é escrito à mão, uma vez, e revisado quando a versão fixada mudar.** Um
gerador (`npm run notices`) com guarda de CI de arquivo defasado foi **recusado**: é infraestrutura de
time grande aplicada a um repositório de um mantenedor, para cobrir 21 arquivos de geometria que mudam
uma vez por ano.

#### O repositório é público e não tem `LICENSE` — as duas coisas convivem

- **Nosso código continua sem licença** (todos os direitos reservados por omissão). Publicar no GitHub
  não concede licença a terceiros. Isso não muda.
- **Manter o aviso do Lucide é obrigação nossa, não concessão nossa.** ISC e MIT exigem que o aviso
  acompanhe as cópias e as "porções substanciais", inclusive num bundle distribuído.
- **ISC e MIT não exigem** que a obra derivada seja aberta nem que o crédito apareça na tela. Nada de
  "Icons by Lucide" no rodapé — seria ruído, e §11.6 já fecha o orçamento de assinatura.
- O comentário de uma linha no cabeçalho de cada arquivo doado resolve a única ambiguidade real de um
  repositório público: **qual arquivo é de quem**. Com o inventário 100% doado, a resposta é uniforme —
  toda a geometria de `apps/web/src/icons/` é do Lucide, e só o primitivo `Svg.tsx`, o `registry.ts` e o
  `statusIcon.tsx` são nossos.

### 8.3 Tamanhos e ótica

| Tamanho | Onde                                                                       |
| ------- | -------------------------------------------------------------------------- |
| 16px    | Dentro de botão, chip, campo, célula de tabela, item de lista. **Padrão.** |
| 20px    | Item de navegação do rail, cabeçalho de painel, faixa de escore.           |
| 24px    | Estado vazio, cartão de onboarding, landing.                               |

Não existe 12px nem 32px. O ícone nunca é maior que a linha de texto que acompanha, exceto no estado
vazio, onde não há texto na mesma linha.

#### O limiar, em número

"Maior que a linha" precisa ser aritmética, não julgamento. **Um ícone só é permitido onde a altura de
linha computada do texto adjacente é maior ou igual ao tamanho do ícone.** Com a escala de §3.2:

| Texto adjacente  | Valor | `line-height`         | Altura de linha | 16px | 20px | 24px |
| ---------------- | ----- | --------------------- | --------------- | ---- | ---- | ---- |
| `--bj-text-xs`   | 11px  | `--bj-leading-tight`  | 13,2px          | não  | não  | não  |
| `--bj-text-sm`   | 12px  | `--bj-leading-normal` | 18,6px          | sim  | não  | não  |
| `--bj-text-base` | 14px  | `--bj-leading-normal` | 21,7px          | sim  | sim  | não  |
| `--bj-text-lg`   | 16px  | `--bj-leading-normal` | 24,8px          | sim  | sim  | sim  |
| `--bj-text-2xl`  | 22px  | `--bj-leading-tight`  | 26,4px          | sim  | sim  | sim  |

Três consequências normativas, todas verificáveis:

- **`--bj-text-xs` nunca recebe ícone.** Isso resolve de uma vez `.disclaimer-link`, "limpar" do filtro
  do Admin, "perguntar ao assistente", rótulo de seção em caixa alta, chip de citação e rótulo 3D:
  todos são texto, e a resposta para "não coube" é encurtar o rótulo, nunca encolher o glifo.
- **Chip, célula de tabela e alternador do viewport (`--bj-text-sm`) recebem 16px** — 18,6 ≥ 16. A
  densidade (§4.2) muda altura de linha da **fileira** e o padding, não o `font-size`, então o veredito
  não muda entre `compact` e `comfortable`.
- **Na faixa de escore (C-09) o glifo de 20px alinha ao número (`--bj-text-2xl`, 26,4px), não à
  legenda** (`--bj-text-sm`, 18,6px). Alinhar à legenda estouraria o limiar.

#### Traço efetivo — a aritmética de 1.6 sobre a grade de 24

O `viewBox` de 24 é escalado pelo tamanho da caixa: fator `s = tamanho / 24`, e a espessura em CSS px
é `stroke-width × s`.

| Caixa | `s`    | `stroke-width` | CSS px | Device px @1x | Device px @2x |
| ----- | ------ | -------------- | ------ | ------------- | ------------- |
| 16px  | 0,6667 | 1.6            | 1,067  | 1,07          | 2,13          |
| 20px  | 0,8333 | 1.6            | 1,333  | 1,33          | 2,67          |
| 24px  | 1,0    | 1.6            | 1,600  | 1,60          | 3,20          |

**A escada de compensação (2.0 a 16px, 1.6 a 20 e 24) foi examinada e recusada.** Ela igualaria a
tinta efetiva de 16 e 20px em 1,333 CSS px e reproduziria a renderização nativa do Lucide a 16px. Foi
recusada por quatro motivos:

1. **Contradiria §8.1**, cujo bloco canônico mostra `width="16"` com `strokeWidth="1.6"`. Emendar §8.1
   para uma escada por tamanho é custo permanente de leitura para um ganho de 0,27 CSS px.
2. **A terceira justificativa da escada não existe.** Ela é vendida junto com uma regra de
   "coordenadas em múltiplos de 6" que entregaria traço crocante — e não entrega em traço nenhum:
   coordenada inteira é o **centro** do traço, então as bordas caem em `centro ± 0,533` (a 1.6) ou
   `centro ± 0,667` (a 2.0), nunca em fronteira de pixel, em nenhum DPR. **A regra de múltiplos de 6
   não entra neste documento**, porque seria norma morta no dia 1.
3. **A raster refutou a premissa.** O argumento "2.0 é a renderização nativa do doador" supõe que a
   1.6 alguma coisa quebra. As 21 formas foram rasterizadas a 16px com traço 1.6 e lidas pixel a pixel
   (§8.1): traço efetivo de 1,067 CSS px, sub-pixel, e mesmo assim os ortogonais caem em linha de
   pixel inteira e ficam nítidos, os diagonais ficam suaves e **contínuos**. Nenhum glifo desapareceu,
   nenhum contorno fechado encheu, nenhum vão se fundiu. Não há problema para a escada resolver.
4. **Um mantenedor, um traço.** Duas espessuras nominais para o mesmo desenho é uma classe inteira de
   erro (desenhar a 2.0, revisar a 1.6) que some ao não existir.

**O que a recusa custa, escrito:** a 16px, 1,067 CSS px fica mais leve que a haste da fonte de sistema
a 14px (~1,3–1,5px), e a 1x o antialiasing espalha o traço por 2–3 linhas de pixel. É a razão
aritmética de duas proibições que **já** estão no documento — 12px não existe (§8.2) e ícone nunca
carrega informação sozinho (§8.7) — e é a razão de uma terceira: **onde o glifo precisar de mais
presença, a resposta é caixa maior (20px), nunca traço mais grosso.**

Três atalhos de renderização ficam **proibidos**:

- **`vector-effect="non-scaling-stroke"`.** Inverte a intenção: a espessura passaria a ser
  interpretada fora da transformação do `viewBox`, e `1.6` renderizaria 1,6 CSS px numa caixa de 16px
  — 10% da caixa, entupido, e ícones _mais_ pesados quanto menores.
- **`shape-rendering="crispEdges"`.** Mata o antialiasing das diagonais e curvas; a marca de
  verificação vira escada.
- **Uma segunda grade de 16.** Dobraria cada ativo, cada revisão e cada teste para atacar uma condição
  de renderização, não um problema de compreensão. O gatilho para reabrir é teste de usabilidade
  mostrando **confusão entre glifos** a 1x — e a resposta então é remover o ícone daquele contexto.

#### Área óptica e padding interno

Formas diferentes com a mesma caixa delimitadora têm pesos visuais diferentes. Padding de casa, medido
na grade de 24 e mais rígido que o mínimo do Lucide:

| Forma                              | Caixa na grade de 24                              | Por quê                                                       |
| ---------------------------------- | ------------------------------------------------- | ------------------------------------------------------------- |
| Quadrado / retângulo               | 18 × 18, de 3 a 21                                | referência                                                    |
| Círculo                            | ⌀20, centro (12,12), r = 10                       | perde ~10% de área percebida contra o quadrado de mesma caixa |
| Triângulo (apenas `warn`)          | largura 20 (x 2→22), ápice y ≈ 2,5, base y ≈ 20,5 | o centro óptico fica abaixo do geométrico; sobe ~1 unidade    |
| Forma girada 45°                   | cabe em ⌀20 → caixa 14,1 × 14,1                   | a diagonal de um quadrado de 18 mede 25,5 e estoura a grade   |
| Glifo predominantemente horizontal | largura até 20, altura livre                      |                                                               |

- **Padding mínimo ≥ 2 unidades**, medido **com a meia-espessura do traço incluída**. Um
  `M2.5 12L21.5 12` com traço 1.6 estende para x ∈ [1,7 · 22,3] — padding 1,7 — e **reprova**.
- **Centragem é pelo centro de gravidade**, não pela caixa delimitadora.
- **Vão mínimo: 2 unidades medidas borda-a-borda, com `stroke-width: 1.6`.** Isso equivale a centros
  distantes ≥ 3,6 unidades, e a 1,33 CSS px de branco a 16px. A ambiguidade "centro-a-centro ou
  borda-a-borda" é a diferença entre um vão legível e traços que se fundem: aqui é **borda-a-borda**,
  sempre.
- **Contato deliberado é permitido; quase-contato é proibido.** Uma junção (o mastro que encosta no
  chão, a diagonal que nasce no piso) tem de ser sobreposição plena dos traços. Vão maior que zero e
  menor que 2 unidades é reprovação.
- **Nenhum traço cruza um círculo fechado**, e nenhum glifo que não seja de status traz haste interna
  dentro de círculo. É o que reserva a família circular a `fail` e `info` (§8.7).
- **Linha tracejada é proibida.** Com `stroke-linecap="round"` obrigatório, cada traço ganha meia
  espessura de cap em cada ponta: um `stroke-dasharray="3 2.5"` a 16px deixa `2,5 − 1,6 = 0,9` unidade
  de vão real, ou 0,6 CSS px — a linha renderiza **sólida**. Textura pontilhada não é canal disponível
  neste sistema.

#### Alinhamento com a linha de texto

**Padrão obrigatório:** o pai é `display: inline-flex; align-items: center; gap: var(--bj-space-*)`, e
o `<svg>` é `display: block`. Sem exceção onde houver contêiner.

**Fallback inline, dentro de texto corrido:** um `<svg>` inline alinha pela _baseline_ — o fundo da
caixa encosta na baseline e o ícone flutua alto. `vertical-align: middle` também está errado: alinha
ao centro da altura-x (≈ 0,52 em) e deixa um ícone de 16px cerca de 1,4px baixo demais sobre texto de
14px, com o erro variando por plataforma.

Fórmula: `deslocamento = (tamanhoDoÍcone − alturaDeCaixaAlta) / 2`, abaixo da baseline, com altura de
caixa alta da pilha de sistema ≈ 0,71 em.

- ícone 16 sobre `--bj-text-base` (14px) → (16 − 9,94)/2 = 3,03 → **`vertical-align: -3px`**
- ícone 16 sobre `--bj-text-lg` (16px) → (16 − 11,4)/2 = 2,3 → **`vertical-align: -2px`**

**O valor é sempre px inteiro.** Meio pixel de deslocamento borra o glifo inteiro. Nunca `em`, nunca
`%`.

#### Grade de pixel

16, 20 e 24 são pares de propósito: caixa par centrada em contêiner de altura **par** produz
deslocamento inteiro; em contêiner **ímpar** produz `x,5`, e todo traço do glifo dobra o antialiasing.

- **Alturas de controle que contêm ícone são pares:** 28 (`--bj-control-h-sm`), 32 (`--bj-control-h`),
  36 (`--bj-row-h` confortável), 40 (`--bj-control-h-lg`). Nunca 33, 35, 38.
- `padding` e `gap` em px inteiros da escala de §4.1.
- Nunca `transform: translateY(-50%)` sobre caixa de altura ímpar.
- **`width`/`height` como atributos px literais**, nunca `1em`, `%`, `rem` ou `flex`. `width: 1em`
  dentro de texto de 14px dá 14px — fora da escala de §8.2.
- Nunca `transform: scale()` num ícone. Rotação em múltiplos de 90° é permitida (§8.8).
- **Conflito a resolver com o alvo de toque (§10.8).** `--bj-target-min` é 32px para controle sem
  rótulo textual, e a faixa lateral recolhida tem 30px de largura: **um alvo de 32px não cabe em 30**.
  A faixa passa a 32px na fase 1. `.collapse-btn` (24×22) e `.org-collapse` (20×20) já constam de
  §10.8 e são corrigidos no mesmo passo — o glifo de 16px vive numa caixa de 32×32.

#### `forced-colors`

Em modo de cores forçadas o navegador substitui as cores por palavra-chave de sistema.
**`stroke="currentColor"` continua funcionando**: o traço herda `ButtonText` dentro de botão,
`LinkText` em link, `GrayText` em desabilitado e `CanvasText` em texto corrido. É aqui que a proibição
de cor literal de §8.1 se paga.

- **`forced-color-adjust: none` em ícone é proibido.** Só é admissível numa amostra de cor da galeria.
- **A codificação de status por cor desaparece por completo.** É a prova de fogo do CT-3: sobram a
  forma distinta e o texto canônico (§8.7). Nada precisa ser feito, e nada deve ser feito para
  "recuperar" a cor.
- **O glifo de marca perde o ocre.** Aceitar; não contornar.
- **Consequência de entrega:** ícone como `background-image` (data-URI) **não** recebe cores forçadas
  e desaparece sobre o `Canvas` do usuário. É um dos motivos da proibição de data-URI em §8.8.

#### Movimento

O único glifo animado é o indicador de carregamento, e a rotação é aplicada por CSS **no `<svg>`**,
nunca no path. Sob `prefers-reduced-motion: reduce`, **todo** indicador troca rotação por pulso de
opacidade — regra única, sem juízo caso a caso. O wrapper leva `role="status"` com texto ("Carregando…");
o `<svg>` continua `aria-hidden`. Espera projetada acima de ~5s não pode ser representada só por
movimento: exige progresso textual ("Validando 3 de 47 regras…").

### 8.4 Quando NÃO usar ícone

**O padrão do sistema é: sem ícone.** Um ícone é exceção que precisa ser justificada, não enfeite que
precisa ser vetado. O produto é ferramenta de engenharia lida em português por estudantes sob prazo — a
palavra é mais rápida que o glifo em quase todo lugar.

#### O teste de uma linha

> Apague o ícone. Se a linha continuar compreensível **e igualmente rápida de varrer**, o ícone não
> deve existir.

Ele passa só quando o glifo faz uma de três coisas: **sinaliza estado** que o olho precisa achar antes
de ler (§8.7); **marca uma convenção** que já é gramática de interface (chevron, direção, fechar,
arrastar, link externo); ou **é o único identificador** de um destino cujo rótulo foi removido da tela
por decisão de layout (rail compacto, C-02).

**O teste vale igualmente para os glifos de domínio, e foi ele que matou os 17 candidatos** — 14 na
primeira rodada, os 3 finalistas na validação contra o desenho real do doador (§8.6). Rigor aplicado
só à camada que se quer cortar não é rigor. **A camada de domínio deixou de existir**, e foi este
parágrafo que a matou.

#### Repetição: a regra é estrutural, não numérica

**Um glifo repetido idêntico em toda linha de uma lista ou coluna não discrimina nada e sai.** O ícone
por linha só se justifica quando ele **varia** entre as linhas — e no produto o único caso é o status
(§8.7). Isso decide, sem contagem arbitrária:

- `.rule-item` (~40 itens): o chip de status já carrega o glifo; um segundo ícone por item multiplica
  por 40. **Sem ícone.**
- Fileira de ações do nó de estrutura, repetida em até 40 nós: **sem ícone.** Se a fileira virar um
  menu por nó, só o abridor ganha glifo.
- "gabarito SVG 1:1", repetido por junta; "perguntar ao assistente", repetido por regra não conforme;
  os 4 marcadores do aviso LGPD; os até 6 diagnósticos de lacuna da Visão geral: **sem ícone**, um
  único glifo no cabeçalho do bloco quando o bloco tiver cabeçalho.

#### Só-ícone

Permitido em exatamente dois lugares:

1. **Convenção fechada da lista de obrigatórios abaixo** — fechar sobreposição, expandir/recolher,
   direção de ordenação de coluna, alça de arrastar, indicador de carregamento —, sempre com
   `aria-label` em português e alvo de 32×32 (§10.8).
2. **`rail-compact` (C-02)**, onde o rótulo permanece no DOM em `.bj-sr-only` e o tooltip (C-15)
   aparece em hover **e** em foco. Não é uma hipótese futura: `--bj-rail-w-compact` é o **padrão do
   editor abaixo de 1440px** (§4.3) e o rail compacto é correção normativa de reflow (§10.6, item 3).
   É por isso que os destinos de navegação de §8.5 têm glifo — sem eles o rail compacto não existe. E
   é por isso que a vaga do **Editor**, que ficou aberta ao morrer o `IconCage` (§8.6), **bloqueia**
   `rail-compact`: quatro dos cinco destinos têm identificador, e um destino sem glifo num rail
   só-ícone é um alvo mudo.

**Substantivo de domínio nunca vai só-ícone fora de (2).** Tubo, nó, ancoragem, membro, solda: sempre
com o rótulo escrito. Nenhum estudante aprende que um losango significa "ancoragem" mais rápido do que
lê "ancoragem".

#### Reconciliação com o catálogo

Três entradas do catálogo tocavam iconografia e precisavam de decisão única. Ela está aqui:

- **C-23 (toolbar do viewport).** Os alternadores de camada **não recebem glifo de domínio**. O estado
  ligado continua sendo marca de verificação antes do rótulo + ponto na cor da camada + `aria-pressed`,
  como C-23 já manda. Glifo de camada + marca de verificação + ponto colorido + rótulo seriam quatro
  marcadores num controle de 32px flutuando sobre a cena — a textura que este parágrafo existe para
  proibir — e encostaria um glifo de status num glifo de domínio. **A variante `compact` deixa de ser
  só-ícone** e passa a ser rótulo abreviado: "Gabarito", "Piloto", "Redundância" são substantivos de
  camada, e a regra acima os proíbe sem rótulo.
- **C-24 (legenda do viewport).** Era a **única** superfície onde glifo de domínio seria obrigatório,
  e a exigência sobreviveu à morte da camada — só que sem ícone. C-24 continua tendo de ensinar o
  código de forma, não só a cor, e ele já era **amostra de forma**, não glifo: contorno para
  VERIFICAR, preenchimento para INFRAÇÃO, tracejado para wireframe, círculo pequeno para nó, losango
  para ancoragem — desenhados na própria caixa de amostra, que §8.4 lista explicitamente como
  **não-ícone**. As entradas de cor pura continuam sendo amostra de cor, porque nelas a informação é a
  cor renderizada do cilindro e substituir por forma mentiria. **Nenhuma superfície do produto exige
  glifo de domínio, porque não existe glifo de domínio.**
- **C-02 (item de navegação).** O rail tem ícone, pelo motivo do bloco anterior. A alternativa
  ("rail de rótulos, sem glifo") foi **recusada**: ela contradiz C-02, §4.3 e §10.6, e se apoiava em
  imitação de outro produto, não em medição.

#### Proibições absolutas

- **Emoji como ícone**, em qualquer lugar — não só em status (estende §8.7 e §11.1).
- **Caractere de texto como ícone** — `✓`, `✕`, `▾`, `▸`, `«`, `»`, `←`, `→`, `+`, `−`, `✦`, `⚠`. Ver
  §8.8, "o passivo tipográfico".
- **Ícone decorativo** que não corresponde a objeto ou ação da tela.
- **Ícone duplicando informação que o texto já dá**, exceto o par obrigatório de status de §8.7, que é
  redundância deliberada por CT-3.
- **Ícone sozinho no botão de confirmação de ação destrutiva.** "Excluir equipe" se escreve por extenso.
- **Glifo de marca (ocre) como ícone funcional** — já em §8.7, vale para todo o sistema.
- **Glifo que dependa de trocadilho ou de convenção em inglês.** O raio não significa "automático"; o
  polegar não significa "aprovado"; o disquete não significa "salvar" para quem nasceu em 2005.
- **Encolher para só-ícone porque "não coube".** Rótulo em português é mais comprido que o equivalente
  em inglês; quando ícone + texto não cabe, **o que sai é o ícone**. Encurte o rótulo, quebre a linha
  ou remova o glifo.

#### Não é ícone — fora do escopo, explicitamente

Amostra de cor da legenda · barra de progresso do wizard · ponto de presença de seleção (6px, abaixo
da escala **de propósito**) · avatar tipográfico do organograma · indicador de carregamento animado ·
rótulo numérico (`+3` significa "mais três", não "adicionar") · rótulo 3D ancorado na geometria ·
badge de contagem (o número **é** a informação) · caixa de checkbox nativo · borda tracejada de vaga.

#### Onde o ícone é obrigatório

Lista curta e fechada. Fora dela, é opcional, e o padrão é não ter:

status (§8.7) · chevron de expandir/recolher · direção em par de navegação sequencial · direção de
ordenação de coluna · fechar de sobreposição · alça de arrastar · marcador de link externo ·
indicador de carregamento · **item de rail em `rail-compact`**. Aqui o ícone **é** a convenção, e a
palavra no lugar dele seria mais lenta.

### 8.5 Vocabulário — o inventário

**Teto: 24 formas. O inventário v1 tem 21 — 5 de status + 16 utilitárias + 0 de domínio. Sobram três
vagas, e elas estão nomeadas abaixo.** Este é o único lugar do sistema onde o teto está escrito;
nenhum outro documento numera glifos por conta própria. Estourar o teto é decisão do dono do design
system (§8.9) e obriga a reavaliar a decisão de entrega de §8.8.

**O teto continua 24, e não foi rebaixado para 21 de propósito.** Rebaixá-lo transformaria o resultado
de uma validação — a camada de domínio não encontrou glifo real que passasse — em norma permanente, e
fecharia por decreto a vaga que o rail compacto de fato precisa. As três vagas ficam abertas,
com dono e com regra:

| Vaga | Para quê                                                           | Estado                                                                                                                                                                                                              |
| ---- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | **Identificador do destino Editor no rail** (C-02, `rail-compact`) | **Pendente e bloqueante para C-02.** É o único call site com necessidade comprovada — em `rail-compact` o glifo é o único identificador na tela (§8.4). Tem de ser glifo `ui` do Lucide 1.34.0, escolhido por §8.9. |
| 2    | —                                                                  | Livre. Sem call site. O padrão do sistema é não preencher (§8.4).                                                                                                                                                   |
| 3    | —                                                                  | Livre. Sem call site.                                                                                                                                                                                               |

> **Emenda (DF-12 e DF-24) — o que o código tem hoje.** As três vagas foram usadas pelo DF-12 nos
> destinos do rail (`IconHouse`, `IconWrench`, `IconTrophy`), fechando o inventário em 24; o DF-24
> tirou o `IconMessage` (balão) porque seu único significado, "assistente", virou marca de produto, e o
> inventário está em **23/24** — a vaga livre é uma. A **vaga 1 acima deixou de bloquear** o
> `rail-compact`: o Editor não é destino de primeiro nível, é sub-item, e sub-item não aparece no
> compacto. A regra da linha continua valendo se ele um dia voltar a ser destino. As **marcas de
> ferramenta** (`MarkCage`, `MarkAssistant`) não entram nesta contagem — categoria própria, §8.6.1.

A contagem é de **formas distintas**, não de instâncias. Setas e chevrons contam **uma vez cada**: são
um componente com rotação aplicada por CSS, não quatro arquivos (§8.8).

**Toda a geometria das 21 formas está em §8.10**, copiada literalmente do doador e conferida contra a
tag `1.34.0`. Nenhuma linha deste inventário descreve um desenho que não exista lá.

#### Status — 5 formas

As cinco de §8.7, cuja geometria é contrato. Repetidas aqui só para a contagem fechar: `IconCheck`
(`check`) · `IconBanSlash` (`ban`) · `IconTriangleAlert` (`triangle-alert`) · `IconPerson` (`user`) ·
`IconInfoCircle` (`info`).

#### Utilitários e ações — 16 formas

A coluna **Upstream** é o nome do arquivo em `icons/` do Lucide 1.34.0; a geometria correspondente
está em §8.10. As silhuetas descritas abaixo foram **lidas na raster a 16px**, não deduzidas do nome.

| Glifo           | Componente          | Upstream             | Conceito                        | Silhueta (verificada a 16px)                                                                         | Onde aparece                                                                                  | Tam.     |
| --------------- | ------------------- | -------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | -------- |
| seta            | `IconArrow`         | `arrow-right`        | direção em navegação sequencial | haste horizontal cheia de quadro + ponta em V                                                        | "Voltar" das páginas · paginação do Admin · par do Wizard · CTA da landing                    | 16       |
| chevron         | `IconChevronRight`  | `chevron-right`      | expandir / recolher             | V único, sem haste — o mais leve do lote, correto para afordância                                    | menu de conta · seção colapsável do Inspector · nó do organograma · linha expansível do Admin | 16       |
| chevron duplo   | `IconChevronsRight` | `chevrons-right`     | recolher painel lateral         | dois V em sequência, vértices separados por ~2px                                                     | botão de recolher checklist e editor · faixa lateral recolhida                                | 16       |
| fechar          | `IconX`             | `x`                  | fechar sobreposição             | cruz **diagonal**                                                                                    | cabeçalho de modal (C-13) · aba Organograma · aviso dispensável de Equipes                    | 16       |
| mais            | `IconPlus`          | `plus`               | adicionar item                  | cruz **ortogonal**, os dois traços em linha de pixel inteira                                         | `.add-row` do Inspector (membro, nó, ancoragem, mesa) · dividir tubo                          | 16       |
| lixeira         | `IconTrash`         | `trash`              | excluir                         | corpo de **laterais verticais** (x=5 e x=19, cantos inferiores r=2) + tampa separada por 1px + haste | excluir membro, nó, ancoragem do volante, projeto, conta                                      | 16       |
| exportar        | `IconDownload`      | `download`           | tirar dado do produto           | bandeja em U + seta **descendo**, ponta a ~1,5px da bandeja                                          | "Exportar JSON" · "Baixar meus dados"                                                         | 16       |
| importar        | `IconUpload`        | `upload`             | trazer dado para o produto      | espelho vertical do anterior: bandeja em U + seta **subindo**                                        | "Importar JSON"                                                                               | 16       |
| nuvem com seta  | `IconCloudUp`       | `cloud-upload`       | salvar versão fora do navegador | nuvem aberta embaixo, seta atravessando a barriga                                                    | "Salvar" da topbar                                                                            | 16       |
| seta circular   | `IconRotateCcw`     | `rotate-ccw`         | restaurar estado anterior       | arco quase fechado, abertura ainda visível a 16px, ponta no canto superior esquerdo                  | "Restaurar template"                                                                          | 16       |
| balão           | `IconMessage`       | `message-square`     | assistente de regras            | balão retangular + rabicho inferior esquerdo; forma única no sistema                                 | rail (Assistente) · topbar · estado vazio do thread                                           | 20/16/24 |
| duas silhuetas  | `IconUsers`         | `users`              | equipes                         | mancha **assimétrica**: busto completo à esquerda + meia cabeça e meio ombro à direita               | rail (Equipes) · topbar                                                                       | 20/16    |
| pilha de folhas | `IconFiles`         | `files`              | projetos e versões              | duas folhas em diagonal, a da frente com **orelha dobrada** (sobrevive a 16px)                       | rail (Projetos) · chip de projeto da topbar (marca o único item **não clicável** da fileira)  | 20/16    |
| controles       | `IconSliders`       | `sliders-horizontal` | operação / administração        | **três** trilhos horizontais, cada um interrompido por um punho vertical                             | rail (Admin) · topbar, só com `isAdmin`                                                       | 20/16    |
| conta           | `IconAccount`       | `circle-user`        | a pessoa que está usando        | **disco fechado** com miolo compacto no terço inferior; os ombros pousam sobre a circunferência      | rodapé do rail · menu de conta da topbar · "Entrar ou criar conta" da landing                 | 20/16    |
| escudo          | `IconShield`        | `shield`             | aviso legal                     | escudo fechado de ombros retos e ponta inferior, **path único, sem haste interna**                   | cabeçalho do bloco legal da landing · cabeçalho do aviso do assistente                        | 20       |

Três ressalvas saíram da rasterização e são normativas:

- **`IconSliders` é o glifo mais carregado do inventário** — 9 elementos, exceção registrada em §8.1. A
  16px ele lê "filtro", mas os três trilhos ficam ruidosos. **Liberado nos três tamanhos, com
  recomendação de preferir 20 quando o layout permitir.**
- **`IconDownload` e `IconUpload` são espelhos verticais um do outro. Nunca podem aparecer adjacentes
  sem rótulo.** Não é defeito de escolha — é regra de layout, e vale para toolbar, menu e barra de
  ações.
- **`IconTrash` não tem corpo trapezoidal.** A descrição antiga vinha do desenho à mão e era falsa: as
  laterais são verticais e o corpo não afunila. Conferido na raster contra a tag `1.34.0`.

#### Domínio Baja — 0 formas

**A camada de domínio não existe.** Os três conceitos que tinham sobrevivido ao portão de §8.4 —
gaiola, manequim do piloto e ancoragem de suspensão — morreram na validação contra glifos reais, cada
um por um motivo diferente e todos registrados em §8.6. Nenhum foi substituído por uma versão menos
ruim: **viraram texto.**

Continua valendo, de forma agora trivial, a regra que existia aqui: **nenhum glifo de domínio pode
carregar status.** Um glifo de tubo nunca fica vermelho para dizer infração — quem diz é o glifo de
status ao lado (§8.7).

#### Restrição de sistema: as três formas humanas

O produto tem **três** silhuetas de pessoa — eram quatro; a quarta (`IconDriver`) morreu com a camada
de domínio — e elas precisam ser mutuamente distinguíveis a 16px. Isso não é detalhe de desenho: é a
restrição que impede as três de convergirem para o mesmo boneco.

**Resolvido na raster, sem troca.** As três foram rasterizadas lado a lado a 16px, ampliadas 8× com
vizinho-mais-próximo, e lidas. O alerta anterior sobre `IconPerson` × `IconAccount` **não se
confirmou** — e o discriminador real é melhor do que o que estava escrito aqui: não é a moldura, é a
**topologia**. Forma aberta contra forma fechada se resolve na visão periférica, antes de qualquer
leitura de detalhe.

| Componente    | Papel            | O que a distingue (lido na raster)                                                                                                      |
| ------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `IconPerson`  | status `manual`  | busto **ABERTO**: cabeça pequena solta no topo, ombros largos e baixos, contorno interrompido nas laterais — forma aberta e larga       |
| `IconAccount` | conta do usuário | **DISCO FECHADO** com massa compacta no terço inferior. Aberto × fechado é a diferença dominante; o aro é consequência, não o argumento |
| `IconUsers`   | equipes          | mancha **ASSIMÉTRICA**: busto completo deslocado para a esquerda + meia cabeça e meio ombro sugeridos à direita                         |

**O redesenho do `IconAccount` foi cancelado — ele não era necessário.** O que resolve a violação de
CT-3 que hoje existe em `Landing.tsx` (o `IconUser` de "Entrar ou criar conta" é o desenho literal do
busto reservado ao status `manual`) é **substituir** aquele SVG pelo `circle-user` do doador, não
desenhar nada. Continua sendo a primeira correção da fila.

**Reserva registrada, não adotada:** o par `user-round`
(`<circle cx="12" cy="8" r="5" />` + `<path d="M20 21a8 8 0 0 0-16 0" />`) foi rasterizado junto e
**não é necessário**. Fica como contingência única se um teste com usuários reais contradisser a
raster. **Proibido** trocar o par para `user-round` + `circle-user-round`: ali o aro seria 100% da
diferença, que é exatamente o cenário que esta restrição existe para evitar.

#### O que NÃO virou ícone — decisões registradas

Nada aqui foi esquecido; tudo foi examinado e reprovado.

**Nomes de gramática de UI sem call site.** `IconSearch` (a lupa seria a terceira enunciação da mesma
ideia ao lado de um campo com placeholder "Buscar…" e um botão "Buscar") · `IconFilter` ·
`IconSettings` · `IconExternalLink` · `IconCopy` (não existe botão de copiar no produto; se for
criado, decide-se junto com o chip de citação, que disputa o mesmo espaço) · `IconPencil` ·
`IconArrowUpDown` · `IconGripVertical` · `IconMenu` · `IconLogOut` ("Sair" vive num menu de dois itens,
onde não há varredura a acelerar). Todos reprovam no portão de §8.9: não estão na lista de
obrigatórios de §8.4 e não são status.

**`IconChevronDown`, `IconChevronUp`, `IconChevronLeft`, e as setas por direção.** Não existem como
arquivo. São rotação de §8.8.

**Glifos de "adicionar" especializados** (membro, nó livre, dividir tubo). O `+` genérico mais o
rótulo escrito resolve; quatro formas parecidas na mesma `.add-row` seriam quatro alvos a aprender
para separar rótulos que já são muito diferentes entre si.

**Mira / alvo** para o modo "clique no nó no 3D". Reprovado pela regra do próprio §8.3: retícula sobre
círculo é traço cruzando círculo fechado, que é a receita do `fail`. O modo ativo se sinaliza com a
borda e o texto do bloco pendente.

**Os 17 glifos de domínio reprovados** estão nominalmente em §8.6 — os 14 da primeira rodada e os 3
finalistas que morreram na validação contra o desenho real.

### 8.6 Glifos de domínio — nenhum

**Sobreviveram zero. A camada de domínio não existe.** Dos 17 conceitos candidatos, 14 morreram na
primeira rodada, no portão de §8.4, e os **3 finalistas** — gaiola, manequim do piloto, ancoragem de
suspensão — morreram na validação contra glifos reais e desenhados. Esta seção não tem SVG porque não
há SVG para ter, e isso é o resultado, não uma lacuna a preencher depois.

**O que estava escrito aqui antes era desenho à mão, e era ruim.** Três formas com paths inventados
imitando a métrica do Lucide. O usuário viu e reprovou, com razão. A instrução que passou a valer é:
_ou se usa um glifo real, bem desenhado, de conjunto aberto, ou o conceito vira texto._

**O critério de sobrevivência não mudou; ele apenas foi aplicado até o fim.** Sobreviveria o glifo
cuja forma o usuário já vê todo dia na cena 3D, **e** que existisse pronto, **e** que passasse no
teste a 16px ao lado de todo o resto do inventário. Os três finalistas falharam em pelo menos um dos
três, e o briefing proíbe aceitar "razoável": entregar desenho ruim é pior que não ter ícone.

#### Como os três foram testados

Não foi leitura de catálogo. Os candidatos foram **baixados byte a byte da origem** (Lucide 1.34.0 e
Tabler v3.41.0), conferidos dígito a dígito contra o que a pesquisa tinha transcrito, e **rasterizados
de verdade**: cada um dentro do primitivo real de §8.1, sobre `--bj-bg-base`, a 16/20/24px em Chrome
headless com `--force-device-scale-factor=1`, e depois reampliados de 4× a 8× com
`image-rendering: pixelated` para inspeção pixel a pixel. Três tiras de colisão foram montadas e
lidas. Tudo o que esta seção afirma sobre 16px **foi visto**, não deduzido.

| Tira      | Família testada           | O que continha                                                                                    | Veredito                                                                                             |
| --------- | ------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `c_ring`  | anel com miolo            | `IconBanSlash`, `IconInfoCircle`, `IconAccount`, `lucide/bolt`, `tabler/nut`, `lucide/circle-dot` | Entre os três **aprovados**, sem colisão. Os candidatos entrariam como **quarto** membro da família. |
| `c_track` | trilho e punho            | `IconSliders`, `lucide/git-commit-horizontal`, `IconArrow`, `IconPlus`, `IconChevronsRight`       | **Colisão fatal.** Matou o `IconAnchor`. Entre os aprovados, sem problema.                           |
| `c_veh`   | formas que enchem a caixa | `IconTrash`, `IconShield`, `IconMessage`, `tabler/car-off-road`, `lucide/car`, `IconFiles`        | Sem colisão. Os dois veículos morreram por **semântica**, não por colisão.                           |

Uma quarta tira, `s_all16`, pôs as 21 formas finais em fileira única a 16px: **sem colisão**, e peso
de traço e tamanho óptico consistentes ao longo das 21 — o que confirma que renormalizar 2 → 1.6 no
atributo do `<svg>` raiz, sem tocar em coordenada, foi a decisão certa (§8.1).

#### `IconAnchor` — a ancoragem de suspensão. MORTO.

O vencedor proposto era `lucide/git-commit-horizontal`, e o argumento no papel era forte: _a geometria
É o conceito — um nó sobre um tubo_. **Não sobrevive ao olho.** Duas causas de morte, ambas vistas em
imagem:

1. **Colisão direta com `IconSliders`.** Na tira `c_track` a 16px, `git-commit-horizontal` é
   **literalmente uma das três linhas do `IconSliders`** — o mesmo motivo de trilho horizontal
   interrompido por um punho, que o `IconSliders` repete três vezes. Isso é o critério de exclusão
   explícito de §8.9, passo 4. O conflito real não estava com um candidato futuro: já estava **dentro
   do inventário aprovado**.
2. **Tamanho óptico fora da família.** O glifo ocupa só a faixa central do quadro e não tem massa
   vertical nenhuma. Ao lado de `IconTrash`, `IconShield` e `IconAccount`, que preenchem a caixa, ele
   lê como um **hífen com uma conta** — mais leve e menor que todos os vizinhos. Quebra a consistência
   de peso do sistema.

**Fallbacks testados e reprovados.** `lucide/bolt` sobrevive bem a 16px isolado, mas na tira `c_ring`
vira o **quarto** glifo da família anel-com-miolo (ao lado de `IconBanSlash`, `IconInfoCircle`,
`IconAccount`), e o hexágono renderiza visivelmente mais **cheio e pesado** que os círculos Lucide
vizinhos, porque as arestas planas caem sobre linhas de pixel — além de "bolt" significar a **peça**,
não a **relação** de ancoragem. `tabler/car-suspension` é pior do que se previa: as três espiras (y=8,
11, 14) fundem num borrão sólido a 16px e o glifo lê "vareta com bolinha" ou termômetro. `tabler/nut`
empata visualmente com `lucide/bolt`, sem ganho, e custaria exceção de doador — descartado por regra.

**Texto substituto:** rótulo "Ancoragem" (ou "Fixação" no rail do Editor). O portão de §8.4 passa
trivialmente.

#### `IconDriver` — o manequim do piloto sentado. MORTO.

1. **Não existe.** Não há figura humana sentada desenhada **em traço** em nenhum conjunto aberto — a
   varredura cobriu 220 coleções do índice Iconify. Tudo o que retorna é path preenchido de linhagem
   Material (`material-symbols:airline-seat-recline-extra`, `mdi:seat-recline-extra`), impossível de
   exprimir em traço 1.6 sem redesenhar à mão, que é precisamente o que está vetado. Nos conjuntos que
   são traço nativo em grade 24 só existe **mobiliário** (`lucide:armchair`, `iconoir:sleeper-chair`,
   `tabler:chair-director`) — cadeira não é piloto.
2. **Seria a quarta forma humana**, e esta causa sozinha bastaria. Com `IconPerson`, `IconAccount` e
   `IconUsers` já disputando o vocabulário "cabeça redonda + massa de tronco", uma figura de perfil
   sentada exigiria cinco segmentos curtos num quadro de 16px com traço efetivo de 1,07px. Não se
   separaria das outras três.

**Vetado explicitamente, e registrado para que ninguém o proponha de novo: `tabler/wheelchair`.**
Opticamente é limpo, mas não contém figura humana alguma e as tags upstream são
`[disabled, disability, accessibility, a11y]` — é o **símbolo internacional de acessibilidade**, com
significado social fixado. Usá-lo para "manequim do piloto" seria apropriação errada.

**Texto substituto:** rótulo "Piloto" (ou "Manequim" na cena 3D e no rail).

#### `IconCage` — a gaiola de proteção. MORTO.

O conceito literal não existe: "roll cage" e "racing seat" retornam **zero** em 220 conjuntos abertos;
os hits de "cage" são jaulas de prisão e gaiolas de pássaro, todos preenchidos.

**Registro honesto, para não parecer morte por preguiça:** o melhor substituto real,
`tabler/car-off-road`, foi rasterizado e **passou** no teste óptico. A 16px lê como um jipe/buggy de
teto aberto, o entalhe do teto e a diagonal do para-brisa sobrevivem, e o casamento de peso com os
vizinhos Lucide se confirmou em imagem na tira `c_veh` (Tabler e Lucide compartilham grade 24 e peso
nominal 2; a renormalização para 1.6 afeta os dois igualmente). **Não é por defeito de desenho que ele
morre.** Morre por três razões acumuladas:

1. **Semântica.** O portal valida a **estrutura tubular**, não o carro montado. Um ícone de veículo num
   validador de chassi é impreciso, e **signo errado é pior que signo ausente**. `lucide/car` é pior
   ainda: desenha um hatchback de rua.
2. **Portão de §8.4**, aplicado aos quatro usos citados — "Criar projeto", "Meus projetos", "Nenhum
   projeto ainda", lista de projetos. Apague o ícone e as quatro linhas continuam perfeitamente
   compreensíveis e igualmente rápidas de varrer. Nenhuma depende do ícone para desambiguar de uma
   linha vizinha.
3. **Custo.** Quebraria o doador único, acrescentaria uma **terceira** entrada de licença e uma
   **segunda** versão fixada — por um signo semanticamente errado.

**Texto substituto:** os próprios rótulos que já existem. Nada precisa ser escrito de novo.

**A única alternativa autorizada, e a recomendação é não usá-la.** Se houver decisão de **marca** (não
de navegação) para manter um sinal de domínio apenas no CTA da landing, a única porta é
`tabler/car-off-road`, MIT (Pawel Kuna, 2020–2026), já fixada e conferida em
`https://raw.githubusercontent.com/tabler/tabler-icons/v3.41.0/icons/outline/car-off-road.svg`.
Exigiria uma **terceira linha** no `THIRD-PARTY-NOTICES.md` e uma **exceção escrita** à regra de doador
único de §8.2. **A recomendação registrada é não fazer.**

#### O consumo que ficou órfão

Matar a camada tem consequência de produto, e ela está registrada, não escondida:

- **C-24 (legenda do viewport)** continua ensinando o código de forma — mas com **amostra de forma**
  desenhada na própria caixa, que §8.4 lista como não-ícone. Nada quebra.
- **C-02 (rail), destino Editor**, fica **sem identificador**. É a única perda real, e é bloqueante
  para `rail-compact`. A vaga 1 de §8.5 existe exatamente para isso, e a regra é: glifo `ui` do Lucide
  1.34.0, escolhido pelo processo de §8.9 — **nunca** um desenho novo.
- **Todos os demais usos** (CTA da landing, estado vazio, cabeçalhos do Inspector, toolbar) já tinham
  rótulo escrito e passam no portão de §8.4 sem alteração de texto.

#### Os 17 que morreram, e por quê

Registro obrigatório. Elas **não voltam** sem passar por §8.9 do zero. As 14 primeiras foram
desenhadas, medidas a 16px e reprovadas; as 3 últimas foram testadas contra glifos reais de conjunto
aberto, rasterizadas, e reprovadas assim mesmo.

| Candidato                 | O que ele de fato lê a 16px                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| membro primário           | Risco na diagonal. Ao lado do secundário, os dois são "um risco na diagonal". → texto "primário".                                                                                                                                                                                                                                                                                                    |
| membro secundário         | Risco na diagonal com dois tiques de 0,9px nas pontas; os tiques somem. → texto "secundário".                                                                                                                                                                                                                                                                                                        |
| nó livre                  | Anel de 4,5px com três cotocos — um asterisco borrado. E as hastes não têm o vão de 2u que a resolução alegava.                                                                                                                                                                                                                                                                                      |
| nó denominado             | Bandeirinha; lê "sinalizar/denunciar", convenção ocupada. E a letra do ponto (`A`, `B`, `H`) **é** o ícone, com precisão que glifo nenhum tem.                                                                                                                                                                                                                                                       |
| emenda                    | Retângulo atravessado por linha; lê "pílula", "bateria", "slider". Padding de 1,7u — reprova em §8.3.                                                                                                                                                                                                                                                                                                |
| junta soldada             | Tê com dois filetes de raio 2px que viram engrossamento do pé do T. Sobra "⊥". A contagem "T/Y/K-N" já é a informação.                                                                                                                                                                                                                                                                               |
| corta-fogo                | Paralelogramo com diagonal; lê "envelope", "caixa 3D", "cubo". A barra de progresso do wizard já numera o passo.                                                                                                                                                                                                                                                                                     |
| massa                     | Trapézio com alça semicircular = **cesta de compras**. E "31,4 kg" é a informação.                                                                                                                                                                                                                                                                                                                   |
| redundância               | Agá com travessa quebrada. Conceito abstrato de oito palavras em quatro traços; ninguém o deriva. O destaque na cena e a frase do checkbox já resolvem.                                                                                                                                                                                                                                              |
| grade / datum             | Cerquilha; colide com hashtag e com "menu" — **e não tem afordância no código**: a toolbar tem três alternadores e nenhum é de grade.                                                                                                                                                                                                                                                                |
| ângulo                    | Sobrevive melhor que os outros, mas seus únicos usos eram itens de regra do checklist, território proibido por §8.4 (repetição sem variação).                                                                                                                                                                                                                                                        |
| simetria                  | Depende de linha tracejada, que §8.3 proíbe por aritmética. Sem o tracejado, é o glifo de redundância.                                                                                                                                                                                                                                                                                               |
| seção do tubo             | Anéis concêntricos = alvo / mira / gravação / carregando.                                                                                                                                                                                                                                                                                                                                            |
| gabarito do habitáculo    | Círculo com haste vertical tangente **fundida** ao disco — que é a definição literal do glifo `info`. E símbolo arbitrário não ensina termo arbitrário: quem ensina "Geraldão" é a linha de ajuda persistente que C-23 já obriga.                                                                                                                                                                    |
| **ancoragem** (finalista) | `lucide/git-commit-horizontal` **é uma das três linhas do `IconSliders`** — colisão direta com glifo já aprovado, vista na tira `c_track`. E lê como hífen com uma conta: massa vertical zero ao lado de vizinhos que enchem a caixa. Fallbacks `bolt`/`nut` viram o quarto anel-com-miolo e renderizam mais pesados; `tabler/car-suspension` funde as três espiras num borrão. → texto "Ancoragem". |
| **manequim** (finalista)  | Não existe em traço em nenhum dos 220 conjuntos abertos — só path preenchido de linhagem Material, ou mobiliário. E seria a **quarta** forma humana, com cinco segmentos curtos a 1,07px de traço. `tabler/wheelchair` **vetado**: é o símbolo internacional de acessibilidade, e usá-lo aqui é apropriação errada. → texto "Piloto".                                                                |
| **gaiola** (finalista)    | O conceito literal retorna **zero** em 220 conjuntos. `tabler/car-off-road` **passou** no teste óptico e no casamento de peso, e morre assim mesmo: o portal valida a estrutura tubular, não o carro montado — signo errado é pior que signo ausente. Reprova no portão de §8.4 nos quatro usos, e custaria doador novo + terceira licença. → os rótulos que já existem.                             |

**Conceitos que não devem ter ícone, decididos junto:** passagem contínua de tubo (qualquer desenho
cai em cima de nó ou de junta; o Inspector já escreve quais dois membros) · ancoragem do volante (a
forma óbvia — volante = círculo com raios — cruza círculo fechado; e, sem `IconAnchor`, resta a
palavra "volante", que é o que o código já trata) · cota linear em mm (o número é mais preciso e custa 5 traços a
menos) · os 21 tipos de membro individuais (21 formas distintas a 16px é impossível e colidiria dentro
do próprio conjunto; os rótulos de tipo e o destaque no 3D resolvem) · lado esquerdo/direito isolados
(só o par espelhado é conceito; "lado esquerdo" é palavra).

### 8.6.1 Emenda (DF-24) — marcas de ferramenta, categoria à parte

**Decisão do dono do produto, 2026-08-31:** as duas ferramentas do portal ganham marca própria —
`MarkCage` (Validador de Gaiola: três pontos denominados, os tubos que os ligam e o arco do ângulo no
vértice) e `MarkAssistant` (Assistente do Regulamento: a folha do regulamento com o brilho de IA).
São **desenho novo**, o que §8.6 fecha para glifo. A exceção está aqui, escrita, com escopo e trava.

**Por que não contradiz §8.6.** O que §8.6 proibiu foi desenhar **vocabulário**: glifo de domínio que
entraria no inventário de §8.5 para significar um conceito genérico ("gaiola", "manequim",
"ancoragem"), competindo a 16px com 21 formas de um doador único. Marca é outra coisa: **identifica um
produto nomeado**, do mesmo jeito que um logo. E o motivo pelo qual a "gaiola" morreu em §8.6 continua
valendo e agora joga a favor: _o conceito literal retorna zero em 220 conjuntos abertos_ — não existe
o que copiar, e o dono do produto pediu a forma. As alternativas honestas eram duas: seguir usando a
chave inglesa (o mesmo glifo do destino Ferramentas — signo repetido, que §8.5 proíbe: um significado,
um glifo) ou o balão de conversa para um assistente que não é chat. Nenhuma das duas descreve a
ferramenta.

**Trava do escopo — o que a exceção NÃO abre:**

| Regra                                                                                                                     | Onde é cobrada                             |
| ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Marca mora em `icons/marks.tsx`, **fora** do inventário de §8.5; não entra na contagem de 24 nem no teto de formas        | `check-icons.mjs` (listas não se misturam) |
| Teto próprio de **4** marcas; cada uma precisa nomear o **produto** que identifica no registro                            | `check-icons.mjs`                          |
| Mesma geometria de §8.10: primitivo `Svg`, traço 1.6, `currentColor`, sem `fill`, sem cor literal, sem `<g>`, sem `url()` | `check-icons.mjs` + `check-tokens.mjs`     |
| **Nunca aparece sem rótulo ao lado** — marca não é identificador único de destino em lugar nenhum                         | revisão de PR                              |
| **Nunca carrega status** (§8.7): marca não fica vermelha para dizer infração                                              | revisão de PR                              |
| O inventário de ícones continua com **doador único (Lucide), zero desenho à mão**                                         | §8.2, intocado                             |

**Efeito colateral registrado:** `IconMessage` (balão) saiu do inventário. Seu único significado era
"assistente", o assistente passou a ter marca, e glifo sem call site não ocupa vaga (§8.4). O
inventário caiu de 24 para **23 formas**.

**A vaga 1 de §8.5 deixou de bloquear o `rail-compact`, e não foi preenchida.** A premissa dela era
que o **Editor é destino do rail** e, no compacto, precisaria de glifo como único identificador. Não é
mais: desde o DF-12 o Editor vive dentro de Ferramentas, e no DF-24 ele é **sub-item** — nível 2 que
**some no rail compacto**, onde só os quatro destinos (casa, silhuetas, chave, troféu) permanecem, todos
com glifo do inventário. A vaga continua aberta e livre; se algum dia o Editor voltar a ser destino de
primeiro nível, a regra antiga volta a valer inteira.

### 8.6.2 Emenda (2026-09-02) — arte de marca é ilustração, não é a marca do sistema

**Decisão do dono do produto, 2026-09-02:** a arte de `logo_bajeiros` — a gaiola de Baja desenhada
em ouro, raster — entra no produto como **ilustração de marca**, em dois níveis, e **não substitui a
`MarkPortal`**. A arte aparece onde é grande (hero e fecho da vitrine, marca do rail, cartão social);
a `MarkPortal` continua onde é pequeno (favicon, vitrine de ícones, sub-itens do rail).

**Por que não contradiz §8.6.1.** Aquela emenda abriu exceção para **marca de produto**: vetor no
primitivo `Svg`, `currentColor`, dentro de `icons/marks.tsx`, contra um teto de 4. Esta arte não é
nada disso — é raster, mora em `apps/web/public/marca/`, não entra no registro e **não ocupa vaga**.
A quarta vaga de marca continua livre. O que a emenda abre é o direito de o produto ter uma
ilustração além do seu glifo, que é o que qualquer marca faz.

**A separação é medida, não gosto.** Duas medições forçaram os dois níveis:

| O que foi medido                                                                            | Consequência                                                       |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Abaixo de ~120 px de largura a treliça some e o desenho vira mancha; a 16 px não sobra nada | a arte **não** serve para favicon, avatar nem rail estreito        |
| O ouro da arte é uma **rampa metálica de três valores**; o token é chapado                  | a arte **não** é `currentColor` e nunca herdará tema como um glifo |
| A arte é 1,46:1 horizontal; o disco de avatar é 1:1                                         | recorte circular ou sobra vazio ou corta as rodas                  |

**Como a arte obedece ao tema mesmo sendo raster.** Um arquivo, dois papéis, um download:
`background-image` entrega o metálico onde a superfície é escura e o desenho é grande;
`mask-image` usa **só o canal alpha** do mesmo arquivo e a cor vem de `--bj-brand`, que é o que
serve em superfície clara e em tamanho pequeno. A troca por tema usa os dois seletores de
`tokens.css` — `:root[data-theme='light']` **e**
`@media (prefers-color-scheme: light) { :root:not([data-theme='dark']) }`.

**Trava do escopo — o que a exceção NÃO abre:**

| Regra                                                                                                   |
| ------------------------------------------------------------------------------------------------------- |
| Ilustração de marca **não entra** em `icons/marks.tsx`, não é registrada e não conta contra o teto de 4 |
| **Nunca** é identificador único de destino, e nunca aparece sem o nome em texto ao lado                 |
| **Nunca carrega status** (§8.7), como qualquer marca                                                    |
| Entra decorativa (`aria-hidden`): o nome ao lado é que o leitor de tela anuncia                         |
| Cor chapada sai **sempre** de token, nunca de valor assado no arquivo                                   |
| O que precisa sobreviver abaixo de ~120 px continua sendo vetor de uma cor — a `MarkPortal`             |

**Efeito registrado:** `MarkPortal` saiu do hero e do fecho da vitrine (onde o CSS a esticava para
96 px e 56 px) e passou a ser favicon. O inventário de ícones e o teto de marcas ficaram **intactos**:
23/24 formas, 3/4 marcas.

### 8.7 Regra de ícone + texto para status

**CT-3 aplicado à iconografia:** cada status tem **um glifo dedicado, de forma distinta**, e ele nunca
aparece sozinho.

| Status   | Glifo                     | Forma (o que sobrevive à dicromacia) | Texto canônico |
| -------- | ------------------------- | ------------------------------------ | -------------- |
| `pass`   | marca de verificação      | dois traços em ângulo agudo          | CONFORME       |
| `fail`   | círculo com barra oblíqua | círculo fechado + diagonal           | INFRAÇÃO       |
| `warn`   | triângulo com exclamação  | triângulo — a única forma triangular | VERIFICAR      |
| `manual` | silhueta de pessoa        | forma orgânica, sem ângulos          | PRESENCIAL     |
| `info`   | círculo com "i"           | círculo + haste vertical             | NOTA           |

O glifo é `aria-hidden="true"`; quem carrega a informação para leitor de tela é o texto. Um ícone de
status **sem** texto ao lado só é permitido dentro de uma célula de tabela cuja coluna já tem
cabeçalho de status **e** que traga `aria-label` na célula com o texto canônico.

Proibido: usar o mesmo glifo para dois status; usar o glifo de marca (ocre) como ícone de alerta;
usar emoji como ícone de status.

### 8.8 Nomeação, organização e entrega

#### Convenção de arquivo

- **Arquivo = componente = `Icon` + PascalCase.** `apps/web/src/icons/IconChevronRight.tsx` exporta
  `export function IconChevronRight`. Um arquivo, um componente, **export nomeado apenas** — nada de
  `export default`: export nomeado sobrevive a renomeação e é buscável por grep.
- **Diretório plano.** Sem subpasta por categoria; a categorização vive no registro. Subpasta convida
  a mover arquivo, e mover arquivo quebra import.
- **Nomes em inglês.** O código já é todo em inglês (`Inspector`, `OrgChart`, `Viewport`, `Manikin`,
  `Wizard`) e a interface é em português. Misturar produziria `IconNo` para "nó", que colide com "no"
  em inglês. O termo em português vive no registro, no campo `rotulo`, e é ele que vai para
  `aria-label` e tooltip.
- **Três arquivos de apoio, que não são ícones:** `Svg.tsx` (o primitivo de §8.1), `registry.ts`
  (dados puros) e `statusIcon.tsx` (o mapa de papéis).

#### Nome pelo QUE É, nunca pelo onde ou pelo papel

| Certo               | Errado              | Por quê                                  |
| ------------------- | ------------------- | ---------------------------------------- |
| `IconSliders`       | `IconAdminRail`     | nomeia o local                           |
| `IconCheck`         | `IconStatusPass`    | nomeia o papel, não o desenho            |
| `IconTriangleAlert` | `IconWarning`       | o papel é atribuído; o desenho é o que é |
| `IconChevronsRight` | `IconCollapsePanel` | nomeia a interação                       |
| `IconFiles`         | `IconGaiolasB6`     | especificidade falsa e mistura de língua |

**O nome local pode divergir do nome upstream, e diverge de propósito em quatro casos:** `IconArrow`
(`arrow-right`), `IconBanSlash` (`ban`), `IconAccount` (`circle-user`) e `IconCloudUp`
(`cloud-upload`). A regra continua sendo nomear pelo QUE É; o vínculo com o doador vive no campo
`origin` do registro e no comentário de cabeçalho do arquivo (§8.2), não no nome do componente. A
tabela completa de correspondência está em §8.10.

**O mapeamento papel → glifo é uma camada separada.** `apps/web/src/icons/statusIcon.tsx` contém
apenas:

```ts
export const statusIcon = {
  pass: IconCheck,
  fail: IconBanSlash,
  warn: IconTriangleAlert,
  manual: IconPerson,
  info: IconInfoCircle,
} as const
```

Esse arquivo é o único lugar onde os papéis de §8.7 existem, e resolve dois problemas de uma vez:
impede que nome por papel entre no diretório de ícones, e torna verificável por teste a proibição
"mesmo glifo para dois status" — basta assertar que os cinco valores são distintos. É a **única**
exceção ao "sem barrel" abaixo: conjunto fechado, cinco entradas, todas sempre usadas.

#### O registro

`apps/web/src/icons/registry.ts` — **dados puros; não importa nenhum componente.** Se importar, vira
barrel disfarçado e arrasta os 21 glifos para todo lugar que consulte um rótulo.

Cinco campos por entrada, e só cinco: `name` · `category` (`ui` | `status` | `domain`) · `rotulo`
(português, o que vai para `aria-label`) · `meaning` (uma linha) · `aliases` (sinônimos em português
**e** inglês) · `origin`.

**`origin` hoje tem uma forma só:**
`{ donor: 'lucide', name: 'circle-user', version: '1.34.0', license: 'ISC' | 'ISC+MIT' }`. A variante
`{ donor: 'bajeiros' }` **continua no tipo e sem nenhum uso** — ela é o que o `check-icons` usa para
provar que o inventário está 100% doado. A categoria `domain` também continua no tipo, com zero
entradas (§8.6). Nenhuma das duas se remove: elas são o assento vazio que torna a regra verificável.

`aliases` é o campo que mais previne duplicata na prática: quem vai adicionar um ícone busca por
sinônimo e encontra o que já existe.

#### Rotação em vez de duplicata

`IconChevronRight`, `IconChevronsRight` e `IconArrow` cobrem as quatro direções por
`transform: rotate(90deg | 180deg | 270deg)` em CSS. **Só múltiplos de 90°** — 45° tira todo traço da
grade de pixel e desloca as pontas arredondadas. Vale para chevrons e setas; não vale para nada
assimétrico.

Ao migrar, **preservar a posição do glifo em relação ao rótulo**: "← Voltar" tem a direção antes,
"Próximo →" tem depois. A assimetria é intencional e informa o sentido da leitura.

#### Entrega: SVG inline, sem barrel

**Componente React por arquivo, SVG emitido como JSX pelo primitivo, import explícito por caminho.**

- Vai para **o mesmo chunk do componente que importa** — nenhuma requisição extra, nenhum chunk de
  ícones, nenhum flash de ícone ausente.
- `currentColor` funciona sem ressalva, inclusive em `forced-colors` (§8.3).
- É código sob revisão de PR e sob os guardas de CI que já existem: `check-tokens` pega qualquer hex
  que escape (§1.4).

**Peso.** Um path do Lucide gira em torno de 90–140 bytes; com o primitivo carregando os atributos
fixos, o arquivo de ícone é praticamente só geometria (~180 bytes minificados). Os 21 glifos somam
~3,8 KB brutos, ~1,6 KB gzip, mais ~400 B do primitivo. **O orçamento que aperta é a contagem de
formas (§8.5), não os bytes** — e é a contagem que se monitora.

**O barrel está banido.** Em produção o Rollup elimina um barrel de puro re-export; o problema não é a
produção:

- **Dev.** Vite não faz tree-shaking em modo de desenvolvimento: serve módulo por módulo. Um
  `import { IconCheck } from '@/icons'` puxa o grafo inteiro para o servidor de dev e degrada o HMR.
- **Vitest e `tsc --noEmit`** pagam o mesmo custo, e o CI já roda os dois.
- **Fragilidade.** Um único módulo com efeito colateral no barrel envenena a eliminação em produção,
  silenciosamente.

Normativo: import sempre explícito (`import { IconCheck } from '../icons/IconCheck'`); ESLint
`no-restricted-imports` bloqueando `**/icons` e `**/icons/index`; busca dinâmica de componente só para
conjunto fechado de ≤ 8 entradas todas efetivamente usadas — hoje, exclusivamente `statusIcon.tsx`.

**Alternativas recusadas.**

- **Sprite SVG.** É tudo-ou-nada: sem tree-shaking, o arquivo inteiro viaja mesmo que a tela use três
  glifos. Com `<use>` externo, `currentColor` e herança de CSS através da fronteira do documento são
  historicamente irregulares no Safari; com `<use>` inline, o `<symbol>` precisa estar no DOM antes do
  primeiro render. Sprite compensa acima de ~60 glifos repetidos muitas vezes por tela; o teto aqui é
  24, e o inventário real, 21.
- **Data-URI.** Congela a cor no URI (quebra `currentColor`), não recebe cores forçadas (§8.3), torna
  a cor uma string opaca para o `check-tokens`, e é governado por `img-src` — que na ausência de
  diretiva cai em `default-src`, onde `data:` não é coberto por `'self'`: o ícone simplesmente não
  pinta, e o modo de falha é silencioso. **Proibido.**
- **Fonte de ícone.** Exige webfont, e a decisão v1 do ADR-009 é **zero webfont** sob `font-src 'self'`
  — e enquanto a fonte não chega ou falha o usuário vê tofu ou um caractere de área privada que o
  leitor de tela pode anunciar em voz alta. **Proibida.**

**CSP.** `style-src 'self' 'unsafe-inline'; font-src 'self'` (ADR-009) **não afeta SVG inline**: não há
requisição e não há folha externa. Não há nada a fazer.

#### O passivo tipográfico

O produto tem hoje **4 SVG** (todos em `Landing.tsx`) e **nove caracteres** fazendo trabalho de ícone.
Os caracteres são o passivo real: herdam métrica de fonte, não respondem a `stroke-width`, desalinham
da baseline, `▾`/`▸` não têm caixa consistente entre plataformas, `✓` é anunciado em voz alta por
leitor de tela — e, pior, **o mesmo caractere carrega significados diferentes em lugares diferentes**.

| Caractere | Onde                                        | Vira                                                                                               |
| --------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `✓`       | 8 ocorrências, dois papéis                  | `IconCheck` (16px; **20px** na faixa de escore)                                                    |
| `✕`       | fechar modal **e** infração                 | **colisão grave:** fechar → `IconX`; infração → `IconBanSlash`. Formas obrigatoriamente diferentes |
| `⚠`       | 5 ocorrências                               | `IconTriangleAlert` (16px; 20px na faixa de escore). Dentro de `--bj-text-xs`, vira texto puro     |
| `▾` `▸`   | menu de conta, seção colapsável             | `IconChevronRight` com rotação **+ `aria-expanded` no botão**, que hoje não existe                 |
| `«` `»`   | conteúdo inteiro dos botões de recolher     | `IconChevronsRight` com rotação + `aria-label`                                                     |
| `←` `→`   | 10 ocorrências de navegação                 | `IconArrow` com rotação, posição preservada                                                        |
| `+`       | adicionar (5×), **expandir** (1×), contagem | adicionar → `IconPlus`; expandir → **chevron, nunca mais/menos**; `+3` **continua texto**          |
| `−`       | par do `+` no colapso do organograma        | some: substituído pela rotação do chevron                                                          |
| `✦`       | prefixo de "Nova gaiola do zero"            | **puramente decorativo, não significa nada.** Removido, não migrado                                |

**O `+` é o caractere mais sobrecarregado do produto e a decisão mais importante desta lista.** Reusar
`+` para "expandir" criaria dois significados para a mesma forma no mesmo produto — e é justamente
porque `+3` existe como rótulo numérico que o colapso não pode usar `+`.

**`→` dentro de prosa fica como texto.** `"H-point→calcanhar"`, `"A1→B1"`, `"mm → m"` são notação, não
afordância. Não confundir com o `→` de navegação.

**Três tamanhos fora da escala, todos na landing, são correção de CSS e não decisão nova:** 17px do
ícone de conta → **16**; 15px do escudo → **20** (é cabeçalho de bloco); 34px dos ícones de CTA →
**24**. §8.2 já diz que 32px não existe; 34 é ainda mais órfão.

**Os quatro SVG existentes migram por substituição, não por redesenho.** Nenhum dos quatro tem
`stroke-linecap`/`stroke-linejoin` (§8.1 os exige), nenhum tem `focusable="false"`, todos usam
`aria-hidden` sem valor, e o `IconCage` ainda traz `opacity=".55"` em dois traços — um segundo peso
visual que §8.1 não prevê, que some em impressão e em `forced-colors`, e que a 16px transforma o
interior numa mancha cinza cuja silhueta lê "casa/celeiro". O destino de cada um:

| SVG legado   | Vira                                                                                                                                                                                            |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IconUser`   | `IconAccount` = `lucide/circle-user`, **copiado**, não redesenhado. É a violação de CT-3 descrita em §8.5 e a primeira correção da fila.                                                        |
| `IconShield` | `lucide/shield`, copiado. O ponto de comprimento 0,01 do legado, que sem `stroke-linecap="round"` **não renderiza em produção hoje**, some junto: o `shield` do doador é path único, sem miolo. |
| `IconCage`   | **Nada.** O conceito morreu (§8.6); o CTA da landing fica com o rótulo escrito. É remoção, não migração.                                                                                        |
| `IconChat`   | `IconMessage` = `lucide/message-square`, copiado. O rabicho inferior esquerdo sobrevive a 16px como um dente claro.                                                                             |

### 8.9 Como adicionar um ícone novo

#### Passo 0 — Portão. Cinco perguntas antes de tocar em qualquer arquivo.

1. **O rótulo em texto resolve?** Aplique o teste de §8.4. Se resolver, **pare aqui.** Este é o
   desfecho mais comum e é um resultado bom.
2. **Já existe glifo equivalente?** Busque em `registry.ts` por `name` e por `aliases`, em português e
   em inglês. Se ele "quase serve", o problema quase sempre é de rótulo, não de desenho.
3. **É rotação de um glifo existente?** Chevrons e setas cobrem 90/180/270°. Se sim, **pare aqui.**
4. **Está na lista de obrigatórios de §8.4?** Se não está e não é status, o padrão é **não adicionar**.
   O inventário está em **21 de 24** (§8.5): há três vagas, e uma delas tem dono. Vaga aberta **não é
   convite** — é margem. Quando o inventário chegar a 24, adicionar exige **remover**; o teto não se
   estica por conveniência.
5. **Existe no Lucide 1.34.0, bem desenhado, e passa a 16px?** Se não existe glifo pronto que passe,
   **pare aqui: o conceito vira texto.** Desenhar à mão não é mais uma saída (passo 3).

#### Passo 1 — Classificar

`ui` · `status` · `domain`.

- **`ui` tem de vir do Lucide** (§8.2). Se o Lucide não tem, desconfie do conceito: ~1.600 glifos
  cobrem a gramática de interface inteira. A ausência quase sempre significa que a ideia é de domínio,
  ou que não é ícone.
- **`status` — mexer nos cinco de §8.7 exige emenda ao ADR-009**, não um PR. É contrato de
  acessibilidade (CT-3), não estética.
- **`domain` — a categoria existe e está vazia** (§8.6). Ela só se preenche por um glifo real e bem
  desenhado, de conjunto aberto, que passe nos passos 4 e 5 **e** não custe exceção de doador. Se o
  candidato exigir outro conjunto, o passo 8 pede exceção escrita em §8.2 antes de qualquer código.

#### Passo 2 — Obter e normalizar

Baixe o SVG bruto **da tag fixada, direto da origem** — não copie de catálogo, de blog nem de
transcrição: `https://raw.githubusercontent.com/lucide-icons/lucide/1.34.0/icons/<nome>.svg`. Confira
o path baixado contra o que a fonte secundária dizia. Anote nome upstream e versão, aplique os seis
itens do procedimento de §8.1 e acrescente o comentário de cabeçalho de uma linha (§8.2).

Na prática, os 21 glifos do inventário **não precisaram de nenhuma limpeza**: uma auditoria por script
sobre `stroke-width`, `fill=`, `opacity`, `stroke-dasharray`, hex, `rgb()`, `stroke=`, `style=`,
`class=`, `<g>` e `url()` voltou **zero ocorrências** nos 21, e só apareceram elementos de geometria
pura (`path`, `circle`, `line`). Todos os atributos do doador moram no `<svg>` raiz, que é substituído
pelo primitivo. **Se o seu candidato precisar de limpeza, ele é a exceção, não a regra — desconfie.**

**Três armadilhas verificadas, para não repetir o trabalho:**

- **Nome ≠ desenho.** `lucide/nut` é uma **castanha** (alimento), não uma porca; `lucide/anchor` é uma
  **âncora náutica**. Abra o path.
- **Nomes que mudaram upstream**, com os antigos dando 404: `alert-triangle` → `triangle-alert`,
  `user-circle` → `circle-user`.
- **Segmento de comprimento ~0** (`h.01`) é um recurso, não um defeito: ele só vira ponto por causa de
  `stroke-linecap="round"`. Ver a regra de build de §8.1.

#### Passo 3 — Desenhar à mão: **proibido**

**Este passo era "desenhar (só `domain`)" e foi revogado.** A camada desenhada à mão produziu três
glifos ruins, o resultado foi reprovado, e a §8.6 registra a validação inteira. Nenhum glifo novo
entra neste sistema por desenho.

O que sobrou do passo, como **critério de aceitação de glifo doado**, continua valendo integralmente e
é o que o passo 5 mede:

- **Padding ≥ 2 unidades com a meia-espessura incluída** (§8.3).
- **Vão mínimo de 2 unidades borda-a-borda a `stroke-width: 1.6`**; contato deliberado é sobreposição
  plena, nunca quase-contato.
- **Teto de 4 subpaths e 5 traços**, com a exceção já registrada do `IconSliders` (§8.1). Sem texto,
  hachura, perspectiva, preenchimento ou tracejado.
- **Nenhum traço cruza círculo fechado; nenhuma forma triangular; nenhum par de traços em ângulo agudo
  ascendente; nenhum busto de pessoa.** Essas quatro silhuetas são monopólio dos cinco status — e é
  por isso que um candidato como `bolt` ou `nut`, que entraria como quarto anel-com-miolo, reprova.
- **Nenhuma conversão de grade.** Se a origem não é 24×24 com traço nominal 2, o candidato está fora
  (§8.1). Converter exigiria redesenhar, e redesenhar está proibido.

#### Passo 4 — Teste de distinção de forma

Renderize o candidato **a 16px** na galeria (fase 0), numa grade, ao lado de **todos** os glifos
existentes — não só os da mesma família: a premissa "famílias diferentes não colidem" é falsa, e foi
ela que deixou passar escudo × triângulo de alerta (mesmo miolo, contornos vizinhos, semânticas
adjacentes). Aplique desfoque gaussiano de 2px, ou afaste-se e aperte os olhos. **Dois glifos
confundíveis → descarte o candidato** (não há redesenho a fazer: passo 3).

**Testar por família é a armadilha, e ela já cobrou o preço.** O candidato a `IconAnchor` foi proposto
por analogia de conceito, e o que o matou foi uma tira que ninguém tinha pensado em montar: ele
reproduzia exatamente **um dos três trilhos do `IconSliders`**, um glifo de outra família e de outra
semântica, já aprovado e no inventário (§8.6). Monte a tira contra **todo** o conjunto.

**Vale também o tamanho óptico, não só a forma.** Um glifo que ocupa a faixa central do quadro e não
tem massa vertical lê como mais leve e menor que os vizinhos que enchem a caixa, e quebra a
consistência de peso do sistema mesmo sem colidir com ninguém. Foi a segunda causa de morte do mesmo
candidato.

Para `status` a barra é mais alta: a silhueta precisa diferir em **topologia** — aberto × fechado,
número de subpaths, presença de ângulo agudo — e não em detalhe. É o que §8.7 quer dizer com "o que
sobrevive à dicromacia".

#### Passo 5 — Teste a 16px, no traço real

Renderize a exatamente 16px com **`stroke-width: 1.6`** (1,067 CSS px), em **1x e 2x**, em Windows — é
o hardware do público —, em tema claro **e** escuro.

Medir num traço que não é o de produção invalida o teste inteiro: uma folga de "1,6px" medida a 2.0 é
1,33px de verdade, e é a diferença entre um vão e uma fusão.

- Nenhum detalhe pode se fundir; nenhum contorno fechado pode encher.
- Traço claro sobre fundo escuro lê mais grosso — se entupir no escuro, reprova.
- Nenhum vão abaixo de 2 unidades borda-a-borda.

**O pipeline que validou as 21 formas, para ser repetido e não reinventado.** Não é preciso `resvg`,
`sharp` nem ImageMagick — basta o Chrome:

1. **Primeira passagem.** Cada glifo dentro do primitivo real de §8.1 (`viewBox="0 0 24 24"`,
   `fill="none"`, `stroke` na cor de texto, `stroke-width="1.6"`, caps e joins `round`) sobre a
   superfície real, nos três tamanhos, capturado em Chrome headless com
   `--force-device-scale-factor=1`. **16px CSS = 16 pixels de dispositivo**: é a rasterização
   verdadeira, com o antialiasing que o usuário vai ver.
2. **Segunda passagem.** Cada PNG recarregado num `<img>` com `image-rendering: pixelated`, ampliado de
   4× a 8× e capturado de novo, para inspeção pixel a pixel sem suavização.
3. **Ler as imagens.** Afirmação sobre 16px que não foi vista numa raster não vale.

Tiras obrigatórias: uma por família suspeita, mais uma com **todo** o inventário em fileira única a
16px.

#### Passo 6 — Checagem de ARIA

- Padrão: `aria-hidden="true"` + `focusable="false"` (§8.1). O componente **não** aceita prop `title`.
- Ícone como único conteúdo de um controle → o **controle** leva `aria-label` em português (o `rotulo`
  do registro) e alvo de 32×32 (§10.8); o `<svg>` continua oculto.
- Ícone de status → texto canônico ao lado (§8.7 e §11.3). Sozinho, só em célula de tabela com
  cabeçalho de status e `aria-label` na célula.
- Controle que expande → `aria-expanded` no **botão**, e o glifo gira. Hoje o menu de conta e a seção
  de ancoragens alternam o caractere sem `aria-expanded`; a migração fecha as duas coisas no mesmo
  commit.
- Carregando → `role="status"` no wrapper com texto; `<svg>` oculto (§8.3).

#### Passo 7 — Registrar e verificar

Entrada em `registry.ts` com os cinco campos, `origin` incluído. **Todo glifo é doado**, então
acrescentar o nome à lista de `THIRD-PARTY-NOTICES.md` **à mão** e conferir se ele cai na lista
Feather/MIT é obrigatório, não condicional. Acrescente o `svg_inner` a §8.10 no mesmo PR: o documento
é a referência de geometria, e foi a ausência dela que produziu aproximações à mão.

**Um guarda de CI, `check-icons`, e só um:** arquivo em `icons/` sem entrada no registro → falha;
entrada sem arquivo → falha; `statusIcon` com dois papéis apontando para o mesmo componente → falha;
entrada com `origin.donor` diferente de `'lucide'` → falha, salvo exceção escrita em §8.2. Mais
`check-tokens` (nenhum hex) e o ESLint `no-restricted-imports` (nenhum barrel), que já existem.

**Recusados explicitamente:** guarda por hash de geometria normalizada (pega "copiei o mesmo path com
outro nome", que é o erro que ninguém comete, e **não** pega duas formas diferentes que borram igual,
que é o erro de fato — para esse o guarda é o passo 4) · gerador de avisos com CI de arquivo defasado
(§8.2) · entrada obrigatória na galeria como bloqueio de merge.

#### Passo 8 — Quem aprova

- **`ui` e `domain`:** o dono do design system — quem mantém este documento. **Uma** aprovação.
- **`domain`, adicionalmente:** um revisor que tenha efetivamente inspecionado uma gaiola B6. Metáfora
  de domínio errada é bug de correção, não questão de gosto: um glifo de "ancoragem" que na verdade
  desenha uma solda ensina errado — e um glifo de veículo num validador de estrutura tubular ensina
  errado do mesmo jeito, foi o que matou o `IconCage` (§8.6).
- **Doador diferente de Lucide:** exceção **escrita** em §8.2 antes do PR, com a justificativa, a
  versão fixada do novo doador e a linha nova do `THIRD-PARTY-NOTICES.md`. Hoje há **zero** exceções, e
  a recomendação registrada é manter assim.
- **`status` (os cinco de §8.7):** emenda ao `docs/adr/009-design-system.md`, com a justificativa de
  distinção de forma escrita. PR sozinho não basta.
- **Estouro do teto de 24 formas (§8.5):** decisão do dono do design system, com reavaliação explícita
  da opção sprite (§8.8). **Preencher uma das três vagas não é estouro** — é o passo 0 normal.

O processo é curto de propósito. Um repositório com um mantenedor não sustenta três instâncias de
aprovação em que o autor assina três vezes: ou a norma nasce descumprida, ou a fase não termina.
Quando houver um segundo revisor de fato, o passo 8 é o primeiro a crescer.

#### Checklist de revisão de PR de ícone

- [ ] O rótulo em texto não resolvia — §8.4 aplicado e registrado na descrição do PR.
- [ ] `registry.ts` buscado por `name` e `aliases`; não existe equivalente; não é rotação de glifo
      existente; o inventário de §8.5 continua com no máximo 24 formas.
- [ ] Origem correta: **Lucide na versão fixada `1.34.0`**, baixado da tag, **nenhum outro doador** e
      **nenhum desenho à mão**. Se for outro doador, a exceção está escrita em §8.2.
- [ ] Path conferido contra o arquivo da tag, não contra catálogo ou transcrição. Nome upstream
      registrado (e checado contra os renomeios `alert-triangle` / `user-circle`).
- [ ] Arquivo só com geometria: sem cor, sem `opacity`, sem `stroke-width`, sem `width`/`height`, sem
      `xmlns`, sem `stroke-dasharray`, sem `<g>`, sem `style`/`class`, sem `url()`.
- [ ] `stroke-linecap="round"` preservado e nenhuma otimização de SVG podando segmento de comprimento
      ~0 (§8.1).
- [ ] Um arquivo, um componente, export nomeado, diretório plano, nome em inglês pelo QUE É.
- [ ] Padding ≥ 2u e vão ≥ 2u **borda-a-borda medidos a 1.6**; nenhum quase-contato.
- [ ] Distinção de forma verificada a 16px com desfoque contra **todo** o conjunto, não só a família —
      e o tamanho óptico casa com o dos vizinhos.
- [ ] Legível a 16px em 1x e 2x, tema claro e escuro, com `stroke-width: 1.6`, **em raster de verdade**
      (§8.9, passo 5), não em pré-visualização de editor.
- [ ] Geometria acrescentada a §8.10 no mesmo PR.
- [ ] `aria-hidden` + `focusable="false"`; se só-ícone, o controle tem `aria-label` em português e
      32×32; se expande, tem `aria-expanded`.
- [ ] Entrada no registro completa, com `origin`; `THIRD-PARTY-NOTICES.md` atualizado à mão se o glifo
      é doado.
- [ ] Import explícito, sem barrel; nenhum caractere de texto sobrou fazendo trabalho de ícone no
      arquivo tocado.
- [ ] CI verde: `check-icons`, `check-tokens`, ESLint.
- [ ] Aprovação correta obtida — DS · + revisor técnico se `domain` · + ADR se `status`.

### 8.10 Geometria de referência — as 21 formas, prontas para colar

**Esta seção existe porque a sua ausência causou o problema.** O documento nomeava os glifos doados e
descrevia as silhuetas, mas nunca trouxe a geometria — e o resultado foi que a implementação e o
espécime visual passaram a usar **aproximações escritas à mão imitando o Lucide**. Aqui está o desenho
real, baixado da tag `1.34.0` e conferido dígito a dígito.

**Como usar.** Cada bloco é o **conteúdo interno** do `<svg>`, pronto para colar dentro do primitivo de
§8.1. Nenhum traz `fill`, cor literal, `opacity`, `stroke-dasharray`, `stroke-width`, `style`, `class`,
`<g>` ou `url()` — auditado por script sobre os 21, com **zero** ocorrências. Em TSX, atributos
hifenizados viram camelCase. O `viewBox` continua 24; o único atributo que muda em relação ao doador é
`stroke-width`, de 2 para 1.6, e ele mora no primitivo.

**Contrato.** As cinco formas de status (§8.7) **congelam no ato da cópia**: a partir do commit em que
entram, a geometria abaixo é contrato deste documento (CT-3), não referência a um projeto externo. Uma
atualização do Lucide **nunca** se propaga para elas. Alterar qualquer uma exige emenda ao ADR-009.

| Nome local          | Upstream (`icons/…`)     | Licença   |
| ------------------- | ------------------------ | --------- |
| `IconCheck`         | `check.svg`              | ISC + MIT |
| `IconBanSlash`      | `ban.svg`                | ISC       |
| `IconTriangleAlert` | `triangle-alert.svg`     | ISC + MIT |
| `IconPerson`        | `user.svg`               | ISC       |
| `IconInfoCircle`    | `info.svg`               | ISC + MIT |
| `IconArrow`         | `arrow-right.svg`        | ISC + MIT |
| `IconChevronRight`  | `chevron-right.svg`      | ISC + MIT |
| `IconChevronsRight` | `chevrons-right.svg`     | ISC + MIT |
| `IconX`             | `x.svg`                  | ISC + MIT |
| `IconPlus`          | `plus.svg`               | ISC + MIT |
| `IconTrash`         | `trash.svg`              | ISC + MIT |
| `IconDownload`      | `download.svg`           | ISC + MIT |
| `IconUpload`        | `upload.svg`             | ISC + MIT |
| `IconCloudUp`       | `cloud-upload.svg`       | ISC       |
| `IconRotateCcw`     | `rotate-ccw.svg`         | ISC       |
| `IconMessage`       | `message-square.svg`     | ISC       |
| `IconUsers`         | `users.svg`              | ISC       |
| `IconFiles`         | `files.svg`              | ISC       |
| `IconSliders`       | `sliders-horizontal.svg` | ISC       |
| `IconAccount`       | `circle-user.svg`        | ISC       |
| `IconShield`        | `shield.svg`             | ISC       |

#### Status — os cinco de §8.7

**`IconCheck`** · `lucide/check` · ISC + MIT/Feather. Cópia literal. Diagonal única ascendente; a 16px
não tem um único ponto de fusão — **o glifo mais seguro do lote**.

```svg
<path d="M20 6 9 17l-5-5" />
```

**`IconBanSlash`** · `lucide/ban` · ISC. Cópia literal. Círculo cheio de quadro atravessado por
diagonal completa; verificado na raster que as pontas caem sobre a linha de centro e a barra encosta
na circunferência de borda a borda, **sem abrir fresta a 1.6**.

```svg
<circle cx="12" cy="12" r="10" />
<path d="M4.929 4.929 19.07 19.071" />
```

**`IconTriangleAlert`** · `lucide/triangle-alert` · ISC + MIT/Feather (o `LICENSE` ainda o lista pelo
nome antigo `alert-triangle`). Cópia literal. **Depende da regra de build de §8.1:** `M12 17h.01` é um
segmento de comprimento ~0 que só vira ponto por causa de `stroke-linecap="round"`. A 16px o vão entre
haste e ponto é de 1px — é o glifo de status mais apertado, e passa.

```svg
<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
<path d="M12 9v4" />
<path d="M12 17h.01" />
```

**`IconPerson`** · `lucide/user` · ISC. Cópia literal. **Mantido sem troca** após o teste das formas
humanas a 16px lado a lado (§8.5): busto **aberto**, cabeça pequena solta no topo, ombros largos e
baixos, contorno interrompido nas laterais — o oposto óptico do disco fechado do `IconAccount`.

```svg
<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
<circle cx="12" cy="7" r="4" />
```

**`IconInfoCircle`** · `lucide/info` · ISC + MIT/Feather. Cópia literal. Mesmo aviso de build do
`IconTriangleAlert`: `M12 8h.01` só existe como pingo do "i" por causa do linecap redondo. Na raster a
16px o pingo aparece e fica visivelmente separado da haste.

```svg
<circle cx="12" cy="12" r="10" />
<path d="M12 16v-4" />
<path d="M12 8h.01" />
```

#### Utilitários e ações — as 16 de §8.5

**`IconArrow`** · `lucide/arrow-right` · ISC + MIT/Feather. Cópia literal. Haste horizontal cheia de
quadro com ponta em V; a 16px, perfeito.

```svg
<path d="M5 12h14" />
<path d="m12 5 7 7-7 7" />
```

**`IconChevronRight`** · `lucide/chevron-right` · ISC + MIT/Feather. Cópia literal. V único, o mais
leve do lote — correto para o papel de afordância, não de ação.

```svg
<path d="m9 18 6-6-6-6" />
```

**`IconChevronsRight`** · `lucide/chevrons-right` · ISC + MIT/Feather. Cópia literal. Dois V em
sequência; a 16px os vértices ficam separados por ~2px e não empastelam.

```svg
<path d="m6 17 5-5-5-5" />
<path d="m13 17 5-5-5-5" />
```

**`IconX`** · `lucide/x` · ISC + MIT/Feather. Cópia literal. Cruz **diagonal**; não colide com o
`IconPlus`, que é ortogonal.

```svg
<path d="M18 6 6 18" />
<path d="m6 6 12 12" />
```

**`IconPlus`** · `lucide/plus` · ISC + MIT/Feather. Cópia literal. Cruz **ortogonal**; a 16px os dois
traços caem em linha de pixel inteira e ficam nítidos.

```svg
<path d="M5 12h14" />
<path d="M12 5v14" />
```

**`IconTrash`** · `lucide/trash` · ISC + MIT/Feather. Cópia literal. **O corpo não é trapezoidal** — as
laterais são verticais em `x=5` e `x=19`, com cantos inferiores de raio 2, e o corpo não afunila. A
descrição antiga vinha do desenho à mão. A 16px a tampa fica separada do corpo por 1px e a haste
aparece.

```svg
<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
<path d="M3 6h18" />
<path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
```

**`IconDownload`** · `lucide/download` · ISC + MIT/Feather. Cópia literal. Bandeja em U com seta
descendo; a 16px a ponta da seta **não toca** a bandeja (vão de ~1,5px).

```svg
<path d="M12 15V3" />
<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
<path d="m7 10 5 5 5-5" />
```

**`IconUpload`** · `lucide/upload` · ISC + MIT/Feather. Cópia literal. **Espelho vertical do
`IconDownload`** — distinguem-se pela direção da ponta, e a regra de layout de §8.5 vale: **nunca
adjacentes sem rótulo**.

```svg
<path d="M12 3v12" />
<path d="m17 8-5-5-5 5" />
<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
```

**`IconCloudUp`** · `lucide/cloud-upload` · ISC. Cópia literal. Nuvem aberta embaixo com seta
emergindo; a seta atravessa a barriga da nuvem e a leitura sobrevive. Segundo glifo mais denso das
utilitárias, e passou.

```svg
<path d="M12 13v8" />
<path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
<path d="m8 17 4-4 4 4" />
```

**`IconRotateCcw`** · `lucide/rotate-ccw` · ISC. Cópia literal. Arco quase fechado com cabeça de seta
no canto superior esquerdo. **O risco principal deste glifo não se materializou:** a 16px a abertura
do arco continua visível e ele não vira círculo fechado.

```svg
<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
<path d="M3 3v5h5" />
```

**`IconMessage`** · `lucide/message-square` · ISC. Cópia literal, path único. Balão retangular com
rabicho inferior esquerdo, que a 16px sobrevive como um dente claro. **Forma única no sistema, zero
colisão.**

```svg
<path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z" />
```

**`IconUsers`** · `lucide/users` · ISC. Cópia literal. Aprovado na checagem das formas humanas: mancha
**assimétrica** — busto completo deslocado para a esquerda, meia cabeça e meio ombro sugeridos à
direita. Na raster a 16px o desequilíbrio é imediatamente visível.

```svg
<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
<path d="M16 3.128a4 4 0 0 1 0 7.744" />
<path d="M22 21v-2a4 4 0 0 0-3-3.87" />
<circle cx="9" cy="7" r="4" />
```

**`IconFiles`** · `lucide/files` · ISC. Cópia literal. **O plano B `copy` não foi acionado:** a orelha
dobrada **sobreviveu** a 16px, como chanfro claro no canto superior direito. Mantido `files`, e a
semântica "documentos" fica preservada.

```svg
<path d="M15 2h-4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8" />
<path d="M16.706 2.706A2.4 2.4 0 0 0 15 2v5a1 1 0 0 0 1 1h5a2.4 2.4 0 0 0-.706-1.706z" />
<path d="M5 7a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h8a2 2 0 0 0 1.732-1" />
```

**`IconSliders`** · `lucide/sliders-horizontal` · ISC. Cópia literal. **9 elementos, o mais carregado
do inventário** — exceção ao teto de complexidade, registrada em §8.1. A 16px lê "filtro", mas os três
trilhos ficam ruidosos: liberado nos três tamanhos, com **recomendação de preferir 20**. É esta
silhueta — trilho horizontal interrompido por punho vertical, repetida três vezes — que matou o
candidato a `IconAnchor` (§8.6).

```svg
<path d="M10 5H3" />
<path d="M12 19H3" />
<path d="M14 3v4" />
<path d="M16 17v4" />
<path d="M21 12h-9" />
<path d="M21 19h-5" />
<path d="M21 5h-7" />
<path d="M8 10v4" />
<path d="M8 12H3" />
```

**`IconAccount`** · `lucide/circle-user` · ISC. Cópia literal — **o redesenho previsto foi cancelado
porque não era necessário**. Disco **fechado** com miolo compacto no terço inferior. Confirmado na
raster que os ombros pousam sobre a circunferência (`y=20.662` contra `12+√75=20,660`) e continuam
soldados ao aro a 1.6, sem abrir fresta.

```svg
<circle cx="12" cy="12" r="10" />
<circle cx="12" cy="10" r="3" />
<path d="M7 20.662V19a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1.662" />
```

**`IconShield`** · `lucide/shield` · ISC. Cópia literal, path único. Escudo fechado, ombros retos e
ponta inferior; a 16px, sólido e inconfundível. **Não tem haste interna** — o ponto de comprimento
0,01 do `IconShield` legado de `Landing.tsx` não existe aqui (§8.8).

```svg
<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
```

#### Domínio — vazio

Não há bloco de geometria porque não há glifo de domínio (§8.6). Se um dia houver, ele entra aqui no
mesmo PR em que entra no `registry.ts` (§8.9, passo 7).

#### Contingência registrada, **não adotada**

`lucide/user-round`, rasterizado junto na tira das formas humanas e **considerado desnecessário**.
Fica aqui para o caso único de um teste com usuários reais contradizer a raster. **Não usar o par
`user-round` + `circle-user-round`:** ali o aro seria 100% da diferença entre as duas formas humanas,
exatamente o cenário que §8.5 existe para evitar.

```svg
<circle cx="12" cy="8" r="5" />
<path d="M20 21a8 8 0 0 0-16 0" />
```

---

## 9. Camada 3D

### 9.1 Declaração de escopo

**O viewport é dark-only, nos dois temas.** Não é omissão, é decisão medida: o membro primário
(`#e2d6c4`, L ≈ 0,78) satura para branco na face iluminada (fator ×1,8) sobre fundo claro e some,
enquanto `fail` e `warn` **ganham** contraste — a polaridade dividida que a auditoria diagnosticou.
Portar a cena para fundo claro exigiria escurecer os dois membros abaixo de L 0,45, o que inverte a
ordem de peso visual que o modelo precisa preservar (o membro primário tem que continuar parecendo o
mais estrutural).

No tema claro, o viewport mantém `--bj-3d-bg` `#140f0a` **emoldurado por `--bj-bg-inset` claro
(`#e1d3be`) com borda `--bj-border-strong`**. O degrau de luminância entre a moldura e o campo é
grande (≈ 14:1 se a moldura fosse `--bj-bg-sunken`), e usar `inset` em vez de `sunken` reduz a
adaptação pupilar em sessão longa. Canvas escuro dentro de UI clara é padrão consolidado em CAD.

`forced-colors` **não é coberto**. WebGL ignora o alto contraste do SO: o 2D inverte e a cena não,
rompendo a correspondência legenda↔cena. Pendência registrada — exige um modo próprio da cena,
controlado pela aplicação, e nenhuma escolha de paleta o resolve.

### 9.2 Como aplicar os tokens aos materiais

```ts
import { viewport3d } from '../tokens'

const MAT = {
  member: { color: viewport3d.member, metalness: 0.4, roughness: 0.35 },
  memberSecondary: { color: viewport3d.memberSecondary, metalness: 0.4, roughness: 0.75 },
  fail: { color: viewport3d.fail, emissive: viewport3d.fail, emissiveIntensity: 0.25 },
} as const
```

Regras:

1. **`var()` não funciona em three.js.** `THREE.Color` parseia strings de cor CSS, não custom
   properties. Materiais importam de `tokens.ts` (§1.1).
2. **Uma cor, um símbolo.** O material 3D, a amostra da legenda (C-24) e a regra CSS leem a mesma
   chave. Nenhum hex em `Viewport.tsx`, `Geraldao.tsx`, `Manikin.tsx`, `Inspector.tsx` ou `App.tsx`.
3. **`--bj-brand` é proibido na cena.** O `pending` (nó a clicar) usa `--bj-3d-datum`.
4. **Verde é `pass` e só `pass`, e `pass` não existe na cena.** Conformidade é a **ausência** de
   status. O ponto do gabarito, que era verde, passa a `--bj-3d-datum` com wireframe opaco.
5. **Luminância não é canal.** `ambientLight 0.6` + `directionalLight 1.2` move a mesma cor 2,26 a
   2,73:1 entre face iluminada e face em sombra. Qualquer par separado por menos de ~2,7:1 de
   luminância é ruído: a separação tem que estar em matiz, croma ou geometria.

### 9.3 Redundância não-cromática — obrigatória

Seis conceitos ortogonais (tipo do membro, status, seleção, destaque de regra, cadeia física,
redundância de remoção) disputavam **um** canal — `material.color` — numa cascata destrutiva:
selecionar um tubo em infração apagava a infração da cena. A regra nova separa canais.

| Conceito                           | Canal primário                               | Canal de reforço                    |
| ---------------------------------- | -------------------------------------------- | ----------------------------------- |
| Membro primário × secundário       | **`roughness`** (0,35 × 0,75) + rótulo       | Luminância (`member` × `secondary`) |
| **INFRAÇÃO**                       | **Preenchimento + `emissive`**               | `--bj-3d-fail`                      |
| **VERIFICAR**                      | **Contorno** + marcador ancorado             | `--bj-warn`                         |
| Seleção                            | **Contorno aditivo**, `--bj-3d-selected`     | —                                   |
| Destaque de regra                  | **Contorno tracejado**, `--bj-3d-datum`      | —                                   |
| Cadeia de tubo físico contínuo     | **Contorno tracejado a 50%**, cor de seleção | Texto no Inspector                  |
| Removível sem infração             | **Wireframe** sobre a cor de identidade      | `--bj-3d-removable`                 |
| Ancoragem: suspensão × amortecedor | **Forma** (octaedro × cubo)                  | Mesma cor `--bj-3d-anchor-ok`       |
| Manequim mínimo × máximo           | **Sólido × wireframe opaco**                 | Mesma cor `--bj-3d-pilot`           |
| Nó nomeado × livre                 | **Peso do rótulo** + raio                    | `node-named` × `node`               |

Quatro proibições que valem literalmente:

- **Estados transitórios são aditivos.** Seleção, destaque de regra, cadeia e `pending` **nunca**
  sobrescrevem o status. `--bj-3d-selected` é contorno **por cima** da cor de status, não fill.
- **Escala de seleção é radial e vive numa malha de contorno separada.** Escalar o
  `cylinderGeometry` escala o **comprimento** junto: o tubo selecionado ficaria 15% mais longo. Numa
  ferramenta cujo produto é conformidade dimensional, isso é inaceitável.
- **O raio renderizado vem da seção declarada** (`cage.primarySection.od / 2`), nunca de uma
  constante por categoria. O `0.0127` fixo de hoje já contradiz o default de Ø31,75 mm, e usar raio
  por categoria faria o desenho mentir sobre a coisa que ele existe para conferir. Como o OD é
  **editável** e uma equipe pode declarar os dois iguais (entrada legal), o raio **não pode ser o
  único canal** de identidade — por isso `roughness` é o primário e a luminância continua como
  reforço.
- **VERIFICAR não é só contorno.** Num enquadramento da gaiola inteira, um anel de contorno num tubo
  de poucos pixels é subpixel e some — um estado de atenção que desaparece no zoom padrão é regressão
  funcional. O contorno é acompanhado de um **marcador ancorado no membro**, visível enquanto o
  membro ocupar menos de ~4px de largura na tela.

### 9.4 Segurança para daltonismo — o que está garantido e o que não está

Método: Brettel-Vienot-Mollon 1997 em RGB linear, CIE L\*a\*b\* D65, CIEDE2000 completa.

**Garantido.** Os 55 pares dos 11 tokens do grupo `viewport3d` medem **mínimo global 12,32** nos
quatro modos de visão (normal, protanopia, deuteranopia, tritanopia); 51 dos 54 pares reais ficam
≥ 14,3 e 49 ficam ≥ 15. O piso de contraste contra `--bj-3d-bg` também passa: `grid` 3,05 ·
`node` 4,26 · `anchor-ok` 4,98 · `member-secondary` 5,44 · `fail`/`anchor-bad` 6,05 · `pilot` 8,00 ·
`removable` 8,77 · `selected` 11,33 · `member` 13,29 · `node-named` 15,96.

Três decisões de projeto sustentam isso e mudam a leitura da cena:

1. `--bj-3d-selected` saiu do branco-osso para âmbar `#ffbb54`. O estado mais importante do viewport
   não pode depender de 8 pontos de L\* contra um nó nomeado; passa a depender de croma, que
   sobrevive às três dicromacias.
2. `node` e `node-named` migraram para aço frio — era a única forma de tirar `node` de cima de
   `member-secondary` (ΔE 3,1) sem estourar a escada de luminância.
3. `pilot` foi de ardósia para verdete `#6bb5ab`. Três azuis na mesma luminância era a causa raiz do
   colapso protan/deutan; um tinha que sair do eixo azul.

**Duas exceções deliberadas, registradas:**

- **`--bj-3d-pilot` tem piso 12, não 15.** Não existe paleta de 10 cores simultaneamente
  distinguíveis com ΔE ≥ 15 nos quatro modos: a otimização max-min **sem restrição alguma** de matiz
  converge para 13,63 e achata todos os pares nesse teto. Exigir 15 uniforme é matematicamente
  inviável. A folga foi concentrada em `pilot` porque é o único token renderizado como volume
  translúcido de grande área — forma e tamanho já o separam de tubos e marcadores.
- **`--bj-3d-fail` == `--bj-3d-anchor-bad`** (ΔE 0,00 em todos os modos), de propósito. Os dois
  significam "este elemento está errado" e são desambiguados por geometria (tubo × marcador pontual).
  Criar um segundo vermelho obrigaria o usuário a discriminar dois vermelhos, o que piora a
  acessibilidade real.

**O que NÃO está garantido — pendência bloqueante para a fase 10 (separação de canal).** A otimização
mediu **11** tokens, mas a cena renderiza **13**: `--bj-warn` (contorno de VERIFICAR) e
`--bj-3d-datum` (gabarito, zona do punho, `pending`, destaque de regra) também aparecem no WebGL e
ficaram fora do conjunto otimizado. Com os tokens realmente presentes, os piores pares medem
`fail` × `warn` **2,1** (tritanopia) e **5,7** (deuteranopia), `removable` × `datum` **2,6**
(protanopia) e `pilot` × `datum` **4,3** (tritanopia). O mínimo global real é **2,1**, não 12,32.
Uma gaiola com um membro em VERIFICAR e outro em INFRAÇÃO é o caso normal, então a hipótese de
"não coabitam" é falsa.

Mitigação vigente enquanto a reotimização não roda: os pares afetados **não dependem de cor** —
`fail` é preenchimento com `emissive`, `warn` é contorno com marcador, `datum` é wireframe de
gabarito. É a aplicação da regra do §9.3, e é a razão pela qual o canal geométrico não é ornamento.
**Ação registrada:** refazer a otimização max-min com os 13 tokens (78 pares × 4 modos) antes de
fechar a fase 10 (separação de canal).

### 9.5 Contraste de rótulos, camadas e grade sobre o canvas

- **Placas de rótulo são opacas** (`--bj-3d-label-bg` `#241f19`, derivada do fundo). Texto sobre a
  placa: **13,26:1**; texto direto sobre o fundo: **15,46:1**. A placa contra o fundo mede 1,17:1 —
  informativo, não requisito: a placa é _scrim_ contra geometria arbitrária, não figura.
- **Camadas translúcidas ganham wireframe opaco na mesma cor.** Composta contra o fundo, cada uma
  ficava abaixo de 3:1 (gabarito 1,91 · manequins 2,23 e 2,12 · zona do punho 1,45). O gabarito de
  habitáculo é **datum normativo**: invisível em projetor ou em oficina iluminada é falha funcional,
  não estética. Alfas: gabarito `--bj-3d-datum` @ 0,30 + wireframe opaco · zona do punho
  `--bj-3d-datum` @ 0,16 + wireframe opaco · manequim mínimo `--bj-3d-pilot` sólido @ 0,55 ·
  manequim máximo `--bj-3d-pilot` wireframe opaco.
- **Grade: faixa, não piso.** Alvo 1,5–3:1 contra o fundo — grade é referência espacial, não figura.
  `--bj-3d-grid` mede **3,05:1**, com apenas 1,6% de folga sobre o mínimo de 3:1. Ressalva medida: a
  grade é linha antialiasada; com cobertura parcial de subpixel ela compõe em direção ao fundo e o
  contraste efetivo cai. **Por isso a grade é desenhada com espessura ≥ 1,5px**, `sectionColor` a
  100% e `cellColor` a 60%.
- **Texto sobre canvas mede contra a pior superfície atrás dele**, não contra o fundo. Com a placa
  opaca, isso deixa de importar; sem ela, o rótulo de nó livre caía de 6,10:1 para 3,52:1 sobre um
  tubo primário iluminado.
- **Camada.** Legenda e toolbar em `--bj-z-viewport-chrome` (50), acima dos rótulos `drei/Html` em 40.
  Uma paleta que depende da legenda para ser decodificada não pode ter a legenda coberta pelos
  próprios rótulos.

### 9.6 Movimento e desempenho na cena

`prefers-reduced-motion` é lido em JS e propagado ao store (§6). Além disso: nada de animação de
largura de contêiner do viewport (§6), e o `<Canvas>` recebe `resize={{ debounce: { resize: 150 } }}`
se em algum momento a largura passar a mudar de forma contínua.

---

## 10. Acessibilidade

Alvo declarado: **WCAG 2.1 AA** no 2D, mais o critério já registrado no plano v1 de **Lighthouse ≥ 90
em acessibilidade**. Nada aqui é aspiracional: cada item abaixo corresponde a um defeito medido no
código atual.

### 10.1 Contraste

Pisos e exceções estão em §2.6 e §9.5. Três lembretes operacionais:

- Texto normal 4,5:1 · texto grande (≥ 18,66px, ou 14px bold) 3:1 · componente e limite gráfico 3:1.
- `--bj-fg-faint` e `--bj-fg-muted` têm domínio restrito (§2.5). O disclaimer legal — obrigação
  declarada do produto — usa `--bj-fg-secondary` em `--bj-text-sm`, nunca `--bj-fg-faint` a 11px como
  no legado.
- O teste do §1.4 é o que garante isso ao longo do tempo, não a boa vontade do revisor.

### 10.2 Foco visível

```css
*:focus-visible {
  outline: 2px solid var(--bj-focus-ring-color);
  outline-offset: var(--bj-focus-ring-offset);
}
```

Global, uma vez, para todo o app. Substitui as duas regras `:focus-visible` do legado, escopadas a
`.team-page` e `.org-chart`, e cobre os dezesseis botões que hoje ficam com o anel padrão do
navegador ou sem nenhum.

**Por que `outline` e não o anel duplo de `box-shadow` do Console.** O anel duplo (`inset 1px` na cor
do fundo + `2px` colorido) é excelente quando o contêiner não recorta. Aqui há pelo menos nove
ancestrais com `overflow: hidden` — dropdown de conta, modal, cards de admin/assistente/equipe,
`.page-body`, `.page-inner`, organograma — e `box-shadow` é recortado por eles: o anel sumiria
exatamente nos itens de borda. Além disso `box-shadow` não é renderizado em `forced-colors`, o que
apaga o indicador para quem mais depende dele. `outline-offset: 2px` já cria a separação que a linha
interna criava, e sem depender de acertar a cor da superfície embaixo — que era outro defeito do
token original, que fixava a linha interna em `--bj-bg-inset` mesmo quando o botão estava sobre
`--bj-bg-overlay`.

Complemento obrigatório:

```css
@media (forced-colors: active) {
  *:focus-visible {
    outline-color: Highlight;
  }
}
```

### 10.3 Ordem de tabulação

- A ordem do DOM **é** a ordem de leitura. `tabindex` positivo é proibido; só `0` e `-1`.
- Skip link é o primeiro elemento focável (C-01).
- Listas longas usam _roving tabindex_ (uma parada de Tab para a lista, setas para navegar dentro):
  abas (C-11), checklist (C-08), árvore do organograma (C-22), lista de membros e nós (§10.7).
- Nada interativo fica escondido atrás de hover: todo controle que aparece em `:hover` aparece
  também em `:focus-within`.
- O editor oculto por `display: none` sai do fluxo de tabulação automaticamente (C-01).

### 10.4 Escape, armadilha de foco e diálogos

Hoje **não existe um único** handler de `Escape` no `src`. O contrato:

| Contexto                       | `Escape` faz                         |
| ------------------------------ | ------------------------------------ |
| Modal / diálogo                | Fecha e devolve o foco ao gatilho.   |
| Dropdown / menu de conta       | Fecha e devolve o foco ao gatilho.   |
| Tooltip                        | Esconde, sem mover o foco.           |
| Edição inline (nó, membro)     | Cancela a edição e restaura o valor. |
| Ferramenta de coleta (pending) | Cancela a ação pendente.             |
| Viewport com seleção           | Limpa a seleção.                     |

Um hook único, `useDismissable(onClose)`, trata `Escape`, guarda e devolve o foco, contém o Tab e
aplica `inert`/`aria-hidden` ao resto da árvore. É usado por C-13, pelo menu de conta e por toda
edição inline. O menu de conta hoje fecha só por `onMouseLeave` — não fecha por clique fora nem por
teclado.

Atalhos globais desta rodada: **`Escape`** e nada mais. `Ctrl+K` está **cortado**: o app tem quatro
destinos alcançáveis em dois cliques, uma paleta de comandos custa 250–300 linhas (listener global,
armadilha de foco, semântica de listbox com `aria-activedescendant`, índice de comandos) e serve mal
a esse volume. Reavaliar quando houver mais de ~8 destinos, e então como busca de **regra B6**, onde
há volume real.

### 10.5 ARIA — o mínimo obrigatório

| Elemento             | Obrigação                                                                                |
| -------------------- | ---------------------------------------------------------------------------------------- |
| Rail                 | `<nav aria-label="Seções">` + `aria-current="page"` no item ativo.                       |
| Área de conteúdo     | `<main id="conteudo">` + um `<h1>` por página.                                           |
| Cabeçalho de painel  | `<h2>` real, não `<div>`.                                                                |
| Abas                 | `role="tablist"` / `role="tab"` / `role="tabpanel"` + `aria-selected` + `aria-controls`. |
| Alternador de camada | `aria-pressed` (não existe nenhum no app hoje).                                          |
| Item selecionado     | `aria-selected` ou `aria-current` — a tinta rende 1,25:1 e não comunica nada.            |
| Diálogo              | `role="dialog"` + `aria-modal="true"` + `aria-labelledby`.                               |
| Toast                | `role="status"`/`aria-live="polite"`; erro usa `role="alert"`.                           |
| Faixa de escore      | `role="status"` + `aria-live="polite"`.                                                  |
| Lista de mensagens   | `role="log"` + `aria-live="polite"` + `aria-relevant="additions"`.                       |
| Tabela               | `<th scope="col">` + `<caption>`.                                                        |
| Botão só com ícone   | `aria-label` em português.                                                               |
| Carregando           | `aria-busy="true"` no contêiner; skeleton `aria-hidden`.                                 |

### 10.6 Zoom 200% e reflow

Requisito: **1366×768 a 200% de zoom** e **1024×768 a 100%** são cenários de verificação obrigatórios.

Hoje, a 200% em 1366px, os dois painéis de 380px sem `flex-shrink: 0` competem com um viewport de
base 0 e `min-width: 0`: sobram 683px CSS, os painéis encolhem para ~341px cada e o **canvas fica com
largura 0**. Com `body { overflow: hidden }`, não há rolagem de recuperação: o conteúdo não é
reduzido, é perdido — falha de WCAG 1.4.10.

Correções normativas, já refletidas em §4.3 e §4.5:

1. `flex-shrink: 0` nos painéis; `min-width: var(--bj-viewport-min-w)` no viewport.
2. Abaixo do piso, **colapsar o painel de menor prioridade** em vez de espremer o canvas.
3. Rail compacto a partir de 1440px, e barra inferior abaixo de 1024px.
4. `overflow: auto` no shell quando o conteúdo não couber — degradar com rolagem, nunca com perda.
5. Nenhum texto em contêiner de altura fixa: tudo cresce em altura.

### 10.7 O canvas 3D — alternativa textual

**Este é o maior buraco do produto e a paleta não o toca.** Não existe uma única chamada a
`selectMember()` / `selectNode()` fora do 3D em todo o TSX. O `<Canvas>` não tem `aria-label`, não tem
`role`, não tem `tabIndex` e não tem conteúdo alternativo; a única interação é `onClick` em `mesh` e
`onPointerMissed`. Quem usa teclado, quem usa leitor de tela e quem simplesmente não consegue mirar
num tubo de 12px não consegue inspecionar nem editar gaiola nenhuma. Isso é falha WCAG 2.1.1 (Nível
A) na **função central** do produto — e significa que os 220 ΔE de daltonismo protegem uma cena que
parte do público não alcança.

Contrato:

1. **A fonte canônica de seleção é uma lista DOM**, no Inspector: uma linha `<button>` por membro e
   por nó, com id, tipo, status e medida principal, `aria-selected` e _roving tabindex_. Mesma store,
   mesmos `selectMember` / `selectNode`.
2. **O canvas é espelho dessa lista**, não a fonte.
3. O wrapper do canvas tem `role="application"` + `aria-label` + uma descrição textual do estado
   atual em `aria-live="polite"` discreto ("membro P-14 selecionado, primário, 2 infrações").
4. Com o wrapper focado, **setas navegam entre membros** e `Enter` seleciona.
5. Tudo que um rótulo 3D diz existe também na lista (C-25).

Sem (1) e (2), nenhuma quantidade de otimização cromática torna o editor utilizável.

### 10.8 Alvo de toque

`--bj-target-min` = **32px** para todo controle sem rótulo textual, nas duas dimensões. Onde o layout
não comporta (organograma denso), ampliar a área com pseudo-elemento `::after` de `inset` negativo,
sem mudar o desenho. Alvos abaixo do mínimo hoje: `.collapse-btn` 24×22 (recolher checklist **e**
fechar modal), `.org-collapse` 20×20, `button.mini` ≈ 16px de altura, e os chips com padding vertical
de 1px.

**Consequência da iconografia (§8.3).** Os três primeiros passam a ser botões **só-ícone** e por isso
disparam os 32×32 obrigatórios — e a faixa lateral recolhida que hospeda um deles tem **30px** de
largura: um alvo de 32px não cabe em 30. A faixa passa a 32px no mesmo passo em que o glifo entra.
Alturas de controle que contêm ícone são pares (28 / 32 / 36 / 40), nunca 33, 35 ou 38.

---

## 11. Voz e conteúdo

### 11.1 Língua e registro

Português do Brasil. Registro técnico, direto, sem informalidade forçada e sem solenidade. O público
é estudante de engenharia: trate como colega competente, não como leigo nem como criança.

- Sem emoji na interface.
- Sem exclamação, exceto no glifo de VERIFICAR.
- Sem primeira pessoa do plural ("vamos calcular"). O sistema não é um personagem.
- Segunda pessoa só quando a frase pede ação do usuário ("Escolha um nó no modelo").
- **Nenhum código interno de entrega na UI.** Os `(DF-4)`, `(DF-5)`, `(DF-6)`, `(DF-2)`, `(DF-7)` que
  vazam para o Inspector saem — são rastreabilidade de repositório, não conteúdo de produto.

### 11.2 Como nomear ações

Verbo no **infinitivo**, objeto explícito, no máximo três palavras: "Salvar versão", "Adicionar
membro", "Restaurar template", "Excluir projeto", "Perguntar ao assistente".

- Proibido: "OK", "Sim", "Confirmar" isolados. O botão primário de um diálogo repete a ação
  ("Excluir projeto"), para que o rótulo faça sentido lido fora de contexto.
- Cancelar é sempre "Cancelar", e é o botão **secundário**, à esquerda do primário.
- Alternador nomeia a **camada**, não o verbo: "Gabarito de habitáculo", "Piloto", "Redundância" —
  com `aria-pressed` dizendo se está ligada.
- Rótulos ambíguos do legado a corrigir: "Papel de acesso" → **"Permissões"**; "Função" →
  **"Cargo no organograma"**; "Entradas" → **"Convites e pedidos"**; "Organograma" e "Estrutura"
  (duas visões da mesma árvore) fundem numa aba com alternador de visão.

### 11.3 Strings canônicas de estado

Vivem no **mesmo módulo dos tokens** (`apps/web/src/tokens.ts`, export `statusLabels`). Sem string
canônica, o contrato "status nunca depende só de cor" não é fiscalizável e cada componente inventa a
sua — que foi exatamente como surgiram três vermelhos e sete âmbares.

| Status   | Chip (curto) | Frase completa (leitor de tela, tooltip, relatório) |
| -------- | ------------ | --------------------------------------------------- |
| `pass`   | CONFORME     | Conforme ao item verificado.                        |
| `fail`   | INFRAÇÃO     | Infringe o item verificado.                         |
| `warn`   | VERIFICAR    | Precisa de verificação: valor no limite.            |
| `manual` | PRESENCIAL   | Depende de verificação presencial do inspetor.      |
| `info`   | NOTA         | Nota informativa.                                   |

**"FALHA" está proibido.** Em interface de software, "falha" lê como erro do aplicativo: um estudante
que vê "FALHA" ao lado de um indicador de carregamento conclui que o app quebrou. O vocabulário de
inspeção é conforme / não conforme, e "INFRAÇÃO" é o termo que o produto de fato quer dizer.
Analogamente, "MANUAL" não diz o que significa — "PRESENCIAL" diz.

### 11.4 Mensagens de erro e de regra

**Erro** — três partes, nesta ordem: (1) o que aconteceu, sem jargão; (2) o que **não** foi perdido;
(3) uma ação.

> Não conseguimos falar com o servidor. Sua gaiola está a salvo nesta tela. **[Tentar de novo]**

Proibido: mostrar instrução de desenvolvedor ao estudante. O texto atual —
"Erro de rede — API local rodando? (`npm run db:start` + `npm run dev -w @bajeiros/api`)" — aparece em
quatro arquivos e é um comando de terminal na cara de quem está montando uma gaiola. A dica técnica só
aparece quando `import.meta.env.DEV`.

Todo erro tem **ação de recuperação**. Erro sem "Tentar de novo" (ou sem um caminho alternativo
explícito) não passa na revisão de PR.

**Mensagem de regra** — quatro partes: identificador · o que o item exige, parafraseado · o valor
medido · a diferença.

> `B6.2.4.3` — largura mínima do habitáculo na altura do ombro. Medido: 712 mm. Faltam 25 mm.

- O identificador vem em mono, e é sempre o mesmo que o assistente cita (C-20).
- O valor medido e o limite sempre aparecem **juntos**: "está errado" sem o número não ajuda ninguém.
- A diferença é explícita ("faltam 25 mm"), porque é o que o usuário vai corrigir.

### 11.5 Termos do regulamento — uso sem reprodução

O produto é **ferramenta educacional** e **não substitui a inspeção técnica oficial**. O disclaimer é
permanente na interface — vale para todas as páginas, e continua valendo depois de qualquer redesenho
que "limpe" a topbar. Nenhum teste automatizado detecta a remoção dele; é item de checklist de PR
(§12.5).

Regras de conteúdo normativo:

1. **Não reproduzir texto do regulamento.** O que a UI mostra são **paráfrases interpretativas** e
   valores numéricos, sempre acompanhados do identificador do item para que o usuário confira na
   fonte.
2. **Não usar o nome nem a identidade da entidade organizadora.** A restrição de marca já está
   declarada no spec e não é negociável.
3. Identificador de item sempre em `--bj-font-mono`, sempre no formato que o usuário encontra no
   documento oficial.
4. Jargão de grupo recebe o nome formal pelo menos uma vez por tela: **"gabarito de habitáculo
   (Geraldão)"**. "Geraldão" sozinho não serve para juiz nem para calouro.
5. Onde o produto interpreta em vez de medir, dizer isso: a diferença entre "não conforme" e
   "precisa de verificação presencial" é a espinha dorsal da credibilidade do validador.

### 11.6 Identidade — onde ela mora, já que não mora na cor

Medição desconfortável, registrada: a rampa escura entregue fica a ΔE00 3,3 do amarelo do Gruvbox
(`brand`), 4,8 do `bg0` (`bg-base`), 5,5 do laranja e 6,1 do aqua. Dentro do erro de percepção, a
paleta **é** Gruvbox — o esquema mais clonado da última década em ferramentas de desenvolvedor.
Ninguém vai ler "Mad Max" nela; vai ler "tema de terminal". O risco que o briefing temia (parecer tema
de jogo) não se materializou; materializou-se o oposto.

A conclusão não é aumentar croma — a aritmética do §2.7 fecha essa porta. É gastar o orçamento de
identidade em canais que um tema de terminal não ocupa:

1. **A régua ocre de 3px** como assinatura estrutural: item ativo do rail, item de regra selecionado,
   linha de tabela selecionada, borda de capitão. É o único elemento saturado da tela e sempre marca
   "aqui".
2. **O tratamento dos números.** Massa, escore e cotas em `--bj-font-display`, `--bj-text-2xl`,
   tabulares. Um validador dimensional cuja leitura numérica tem peso editorial não se parece com
   nenhum tema de editor.
3. **A marca-palavra e a landing**, onde o ocre pode ocupar área sem custo de densidade.

E duas proibições que valem mais que qualquer paleta:

- **Proibido ornamento diegético.** Sem textura de poeira, grunge, estêncil, bordas desgastadas,
  gradiente de ferrugem, cromado ou ícone temático. É por aí que a credibilidade junto a juízes e
  orientadores se perde, não pela cor.
- **Proibido justificar decisão por narrativa.** "Coerente com a intenção Mad Max" não é argumento.
  Toda decisão cita medição.

---

## 12. Governança

### 12.1 Como adicionar um token

1. Abrir issue ou PR descrevendo **o papel**, não o valor: "preciso de uma superfície para X".
2. Verificar se um token existente já serve. Na esmagadora maioria dos casos, serve.
3. Se não servir, propor o valor **com a medição junto**: contraste contra as seis superfícies dos
   dois modos, e ΔE00 nos quatro modos de visão se for token da cena 3D.
4. Acrescentar em `apps/web/src/tokens.ts` (nos dois modos, com o **mesmo nome**), regenerar
   `tokens.css`, acrescentar a linha correspondente na tabela do §2.5 e o contrato no §2.6.
5. Acrescentar a asserção em `tokens.test.ts`. Token sem teste não entra.
6. `npm run format` antes de commitar — o CI roda `prettier --check` sobre `docs/` e `specs/`.

### 12.2 Quando NÃO adicionar um token

- **Para um valor usado uma vez.** Um token é um contrato; um valor único é uma decisão local. Se
  aparecer uma segunda vez, aí sim.
- **Para uma variação de matiz.** O orçamento de matizes está fechado: `pass` / `fail` / `warn` /
  `manual` / `info` / `brand` / `accent`. Um significado novo usa forma, posição ou texto — não um
  matiz novo. A cena 3D tem teto de **~6 cores com significado simultaneamente visíveis**.
- **Para um papel que já tem dono.** Precisa de "azul de destaque"? Já existe `--bj-accent`, com
  papel fechado. Se o papel é realmente outro, o nome é outro e o valor pode até coincidir
  (`--bj-3d-datum`) — mas o nome existe para que os dois possam divergir depois sem caça a
  ocorrências.
- **Para contornar um contrato.** Se `--bj-fail` não passa sobre `--bj-bg-overlay`, a resposta é usar
  o chip tinto, não criar `--bj-fail-on-overlay`.
- **Para densidade ou tamanho pontual.** As escalas base-4 e de sete degraus tipográficos existem
  justamente para impedir o retorno dos 21 valores de espaçamento e dos 14 de fonte.
- **Nunca para um estado.** Estado é combinação de tokens existentes mais uma pista não-cromática.

### 12.3 Como este documento evolui

Mesma regra dos planos e ADRs do repo: **histórico se anota, não se apaga**. Uma decisão superada é
riscada e reescrita no lugar como `**Resolvido (…)**`. Uma emenda posterior entra como
`## Nota (AAAA-MM-DD)` no fim, e não reescreve o corpo. Mudança de token, de contrato ou de proibição
exige ADR novo, e este documento passa a citá-lo.

### 12.4 Ordem de execução

Fatiamento obrigatório. **Nunca misturar cor e espaçamento no mesmo PR:** cor é mecânica e revisável
linha a linha; espaçamento muda layout e é onde a regressão visual mora.

A numeração é a de `docs/plano-implementacao-design.md` — **13 fases, 0 a 12, uma fase = um PR** — e é
a mesma citada pelo ADR-009. Nenhum outro documento numera PRs por conta própria.

| Fase | Conteúdo                                                                                                                                    | Gate                                                   |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| 0    | `tokens.ts` + `tokens.css` + gerador + `tokens.test.ts` + `check-tokens` + galeria. **Nada consome ainda.**                                 | Teste de contraste e de ΔE verde no CI.                |
| 1    | Base e chrome: troca de cor em `styles.css`, os 6 `filter: brightness()`, `:focus-visible` global, z-index e alvos em token.                | Percorrer o app inteiro só com teclado.                |
| 2    | Checklist B6: chips de status, faixa de placar, reestruturação do `RulePanel`, destaque × foco.                                             | Captura em escala de cinza + teclado.                  |
| 3    | Recolor 3D (`COLORS` do `Viewport`, legenda, inline de `Inspector`/`Manikin`/`Geraldao`) + grade ≥ 1,5px, placas opacas, wireframes opacos. | **Resolve o caso do projetor.** Verificar em projetor. |
| 4    | Inspector e Wizard, com a lista DOM de membros e nós (§10.7) + ARIA do canvas.                                                              | Editar uma gaiola sem tocar no mouse.                  |
| 5    | Modais, diálogos e toasts: um `<Dialog>`, `Escape` fecha, foco contido e restaurado.                                                        | Teclado + leitor de tela.                              |
| 6    | Shell novo: rail, topbar, breakpoints, `flex-shrink`, z-index aplicado.                                                                     | **Não altera a montagem do `<Viewport>`.**             |
| 7    | Equipes e organograma: abas ARIA, seleção sem depender de tinta.                                                                            | Escala de cinza + teclado.                             |
| 8    | Admin e Assistente: duplicatas colapsadas, estados de carregamento e erro.                                                                  | Screenshot dos 5 produtos.                             |
| 9    | Landing: disclaimer permanente, `role="dialog"` removido.                                                                                   | `check-tokens` sem exceções nas 5 superfícies.         |
| 10   | Separação de canal no 3D (contorno, fill, wireframe, `roughness`, raio pela seção).                                                         | Reotimização de ΔE com os 13 tokens (§9.4).            |
| 11   | Escala de espaçamento, raio e tipografia + webfonts auto-hospedadas — **se** a medição justificar (§3.1).                                   | Screenshot + 1366×768 a 200%; CSP intocada.            |
| 12   | Tema claro. **Condicionada.**                                                                                                               | Tokenização 100% concluída.                            |

**Cortados desta rodada, com motivo:** router (o token é memory-only por decisão de segurança e o app
redireciona `admin`/`team` para `editor` sem sessão, então todo deep link cai no editor; hash router
colide com o `#convite=` que é lido e apagado em todo boot) · `Ctrl+K` (§10.4) · escala 1,15 na
seleção 3D (§9.3) · tema claro na v1 (§2.7).

### 12.5 Checklist de revisão de PR de UI

Marcar tudo. Item não aplicável é marcado como não aplicável, não deixado em branco.

**Tokens**

- [ ] Nenhum hex, `rgb()`, `hsl()` ou nome de cor fora de `tokens.ts`/`tokens.css`.
- [ ] Nenhum `px` de espaçamento, raio ou fonte fora da escala (exceto hairline de 1px e offset de 2px).
- [ ] Nenhum `filter: brightness()`, `color-mix()` ou `hsl(from …)`.
- [ ] Nenhum `!important`.
- [ ] Token novo veio com medição, tabela do §2.5 atualizada e asserção em `tokens.test.ts`.

**Contraste e cor**

- [ ] `check-tokens` e `tokens.test.ts` verdes.
- [ ] CT-1: nenhum controle interativo com `--bj-border` como único limite.
- [ ] CT-2: todo limite que carrega significado tem borda explícita.
- [ ] CT-3: todo status traz ícone **e** texto canônico do §11.3.
- [ ] CT-5: `--bj-selected` só em `background`.
- [ ] `--bj-brand` ausente da cena 3D; forma-chip ausente da marca.

**Iconografia**

- [ ] Nenhum caractere de texto fazendo trabalho de ícone (`✓ ✕ ⚠ ▾ ▸ « » ← → + − ✦`) no arquivo tocado.
- [ ] Todo ícone novo passou pelo portão de §8.9 e o inventário de §8.5 continua com no máximo 24 formas.
- [ ] Nenhum `stroke-width`, `width`, `height`, cor ou `opacity` escrito num arquivo de ícone — tudo vem
      de `Svg.tsx`.
- [ ] Nenhum import de barrel de `icons/`; nenhum data-URI, sprite ou fonte de ícone.
- [ ] Ícone de 16px só onde a altura de linha computada do texto adjacente é ≥ 16px (§8.3); nunca em
      `--bj-text-xs`.
- [ ] `check-icons` verde; `THIRD-PARTY-NOTICES.md` atualizado se entrou glifo doado.

**Acessibilidade**

- [ ] O app inteiro percorrido só com teclado, sem armadilha e sem parada invisível.
- [ ] `:focus-visible` visível em **todo** controle novo, inclusive dentro de contêiner com `overflow`.
- [ ] `Escape` fecha o que o §10.4 manda fechar; foco devolvido ao gatilho.
- [ ] Diálogo com `role`, `aria-modal`, `aria-labelledby`, foco inicial, foco contido e `inert` no fundo.
- [ ] Botão só com ícone tem `aria-label` em português e 32×32 no mínimo, e o só-ícone é um dos dois
      casos permitidos por §8.4.
- [ ] Estado ativo/selecionado tem `aria-pressed`/`aria-selected`/`aria-current`.
- [ ] Estado de carregamento e de erro são exclusivos; nenhuma tela mostra os dois.
- [ ] Todo estado vazio tem ação.
- [ ] Verificado em **1366×768**, **1024×768** e **1366×768 a 200% de zoom** — o canvas 3D sobrevive
      nos três.
- [ ] `prefers-reduced-motion` respeitado no CSS **e** na cena 3D.

**Estrutura e conteúdo**

- [ ] A montagem de `.bj-area` / `<Viewport>` não foi alterada; câmera preservada ao trocar de página.
- [ ] Nenhuma animação de largura de contêiner do viewport.
- [ ] Disclaimer permanente visível.
- [ ] Nenhum código `(DF-n)` na interface.
- [ ] Nenhum texto do regulamento reproduzido; nenhum uso do nome da entidade organizadora.
- [ ] Rótulos de ação no infinitivo; erros com "o que aconteceu / o que está salvo / o que fazer".
- [ ] Nenhum ornamento diegético.

**Processo**

- [ ] `npm run format` rodado.
- [ ] Screenshot dos 5 produtos (editor, assistente, equipes, admin, landing) anexado ao PR.
- [ ] Se mudou token, contrato ou proibição: ADR aberto e citado aqui.
