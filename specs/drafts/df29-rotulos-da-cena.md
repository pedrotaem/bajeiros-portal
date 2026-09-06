# DF-29 — Rótulos dos pontos na cena: mostrar e ocultar

- **Status:** ✅ **IMPLEMENTADA** (2026-09-05) — promovida a FR-1.7 em [spec.md](../spec.md).
  Testes: `apps/web/src/scene-store.test.ts`.
- **Ordem de desenvolvimento:** independente (um alternador na barra do viewport)
- **Dependências:** barra do viewport (FR-14.3, FR-16.1) · **Desbloqueia:** —
- **Documentos:** [índice de drafts](../draft-features.md) · [spec.md](../spec.md) ·
  [design.md](../design.md) §7 · design-system C-23/C-25

## 1. Contexto e motivação

Todo nó da gaiola carrega um rótulo `drei/Html` com o próprio id: os pontos denominados em
peso 500, os nós livres em peso 400 (design-system C-25). Numa gaiola completa são 30 a 40
placas, e elas cobrem exatamente o que a pessoa quer ver quando está **avaliando forma**: o
encontro de tubos no ponto C, a dobra do FBM, o vão do SIM. O rótulo é indispensável para
_nomear_ e atrapalha para _olhar_. Hoje não há como escolher.

O pedido veio de uso real em staging (2026-09-05): "botão que oculte ou mostre as legendas dos
pontos denominados".

## 2. Objetivos e não-objetivos

**Objetivos**

- Um alternador na barra do viewport que esconde e mostra os rótulos de id dos nós.
- Com os rótulos ocultos, o nó **selecionado** (e o primeiro nó de "adicionar membro")
  continua rotulado: quem clicou precisa saber em que clicou.

**Não-objetivos**

- Decluttering automático por distância (C-25 "hidden") — fica para o redesign (DF-11).
- Persistir a preferência no JSON: é estado de visualização, como Geraldão, Piloto e Planos.
- Ocultar rótulos de ancoragem, volante ou plano — esses só aparecem quando selecionados e já
  são raros na cena.

## 3. Conceito

Um estado de cena, `showLabels` (default **ligado**), ao lado de `showGeraldao`, `showManikin`
e `showPlanes`. Um alternador **"Rótulos"** na barra do viewport, no grupo dos alternadores de
camada, antes do separador das vistas. Rótulo oculto é `null` no React — não é `visibility:
hidden` — porque cada `Html` é um portal DOM e 40 portais invisíveis continuam custando layout.

## 4. Requisitos funcionais

- **FR-DF29.1** Alternador "Rótulos" na barra do viewport (`aria-pressed` refletindo o estado),
  ligado por padrão. Desligado, nenhum rótulo de nó é montado.
- **FR-DF29.2** Exceções que continuam rotuladas com o alternador desligado: o nó selecionado
  e o primeiro nó capturado em "adicionar membro" (`pending.first`).
- **FR-DF29.3** O estado é de sessão (store), não vai para o JSON e não muda ao importar ou
  restaurar o template.
- **FR-DF29.4** Rótulos de ancoragem, volante e plano não são afetados — já são condicionais à
  seleção.

## 5. Modelo de dados

Nenhuma mudança em `Cage`. No store: `showLabels: boolean`, `setShowLabels(v)`.

## 6. Módulos afetados

| Módulo         | Mudança                                           |
| -------------- | ------------------------------------------------- |
| `store.ts`     | `showLabels` + `setShowLabels`                    |
| `App.tsx`      | alternador "Rótulos" em `ViewportToggles`         |
| `Viewport.tsx` | monta o `Html` do nó só se visível ou selecionado |

## 7. Critérios de aceite

| #         | Critério                                                                                |
| --------- | --------------------------------------------------------------------------------------- |
| AC-DF29.1 | Ligar/desligar "Rótulos" esconde/mostra os ids de todos os nós                          |
| AC-DF29.2 | Com rótulos desligados, clicar num nó mostra o rótulo dele; clicar fora esconde de novo |
| AC-DF29.3 | Importar JSON ou restaurar o template não muda o estado do alternador                   |
| AC-DF29.4 | O alternador expõe `aria-pressed` coerente com o estado (C-23)                          |

## 8. Riscos e questões em aberto

- Nenhum. A feature é um `&&` no JSX e um booleano no store.
