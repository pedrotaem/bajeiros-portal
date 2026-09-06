# DF-31 — Recalcular: re-identificação dos pontos denominados e reavaliação do checklist

- **Status:** ✅ **IMPLEMENTADA** (2026-09-06) — promovida a US-18 em [spec.md](../spec.md).
  Testes: `packages/core/src/model/identify.test.ts`, `apps/web/src/recalc-store.test.ts`.
- **Ordem de desenvolvimento:** depois de DF-30 (a reconciliação das ancoragens entra no recálculo).
- **Dependências:** motor B6 (lê pontos por id), DF-6 (continuidade), DF-23 (travas), DF-30
  (suspensão) · **Desbloqueia:** modelagem livre (nó genérico + tipo de membro) sem perder
  cobertura de regra.
- **Documentos:** [índice de drafts](../draft-features.md) · [spec.md](../spec.md) ·
  [design.md](../design.md) §3.2/§7

## 1. Contexto e motivação

O motor B6 lê os pontos denominados **pelo id do nó**: `p('CL')`, `has('DL')`, `isNamedNode`.
Quem constrói com o assistente recebe os ids certos; quem modela livre ("+ Nó livre" e um tipo
de membro no dropdown) cria `N7`, `N8`… e as regras que dependem daqueles pontos **não os
enxergam** — algumas nem rodam. Exemplo real do template: a cadeia do SIM em B6.2.4.5 só é
conferida quando `DL` existe; como a dobra do FBM se chama `N`, um trecho do SIM faltando
passava em branco.

O pedido de uso (2026-09-06): "um botão no Checklist B6 para recálculo e re-identificação dos
pontos denominados e recálculo das validações".

## 2. Objetivos e não-objetivos

**Objetivos**

- Um botão **Recalcular** no painel do Checklist B6 que, num passo:
  1. **re-identifica** os pontos denominados pela topologia — nó genérico no encontro dos
     membros que definem uma letra do regulamento recebe o id do regulamento (`N7` → `SL`);
  2. **saneia** o modelo com as mesmas regras da importação (continuidade, travas,
     `namedExtra`, suspensão) e reconcilia as ancoragens com o tipo de suspensão de cada eixo;
  3. **reavalia** todas as regras e mostra um resumo do que mudou.
- Conservador: só renomeia o que é **inequívoco**; nunca toca em nó que já tem letra.

**Não-objetivos**

- Adivinhar letra por posição no espaço ("o nó mais alto do RRH é B"). A identificação é por
  **tipo de membro incidente**, que é o que o regulamento define.
- Desfazer. Não há histórico no editor; a mitigação é o resumo do que foi renomeado.
- Ponto `O` (sem regra de topologia definida) e curvas intermediárias.

## 3. Conceito

**Uma letra é um encontro de tipos.** A tabela abaixo é a definição (ordem = prioridade; o nó
recebe a primeira letra cujos dois conjuntos aparecem entre os membros que chegam nele):

| Letra | Tem membro de… | …e de                    | Exceto se tiver |
| ----- | -------------- | ------------------------ | --------------- |
| A     | RRH            | ALC, LFS, FAB_LOW, LFDB  |                 |
| B     | RRH            | BLC, RHO, FAB_UP         |                 |
| H     | RRH            | SHC                      |                 |
| S     | RRH            | SIM, FAB_MID             |                 |
| C     | RHO            | CLC, FBM_UP              |                 |
| D     | FBM_UP         | FBM_LOW, DLC             |                 |
| F     | LFS            | FLC, FBM_LOW             |                 |
| I     | LFS            | ILC                      |                 |
| R     | RLC            | FAB_UP, FAB_MID, FAB_LOW |                 |
| P     | FAB_UP         | FAB_LOW, SIM             | RRH, RLC        |

O **lado** vem do sinal de `x`; nó no plano de simetria (|x| < 1 mm) não tem lado e não recebe
letra. Dois tipos iguais no mesmo nó (FBM_UP → FBM_UP, como N1) não definem letra: é curva, não
ponto.

**Quatro recusas, todas relatadas:** nó já com letra (decisão de quem modela — nunca é tocado);
vaga ocupada (`CL` já existe); dois candidatos para a mesma vaga; sem lado.

**Renomear é renomear tudo que aponta para o nó:** membros (`a`/`b`), continuidade, travas e
`namedExtra` — um nó que virou letra sai da lista extra, porque `isNamedNode` já o cobre.
Ancoragens, volante e suspensão guardam posição, não id: não mudam.

## 4. Requisitos funcionais

- **FR-DF31.1** `identifyNamedPoints(cage)` (puro, `model/identify.ts`) devolve `renames`
  (id atual → id do regulamento) e `skipped` (id, alvo, razão) segundo a tabela de §3.
- **FR-DF31.2** `applyRenames(cage, renames)` (puro) renomeia nós, membros, continuidade, travas e
  `namedExtra`. Sem renomes devolve a mesma referência.
- **FR-DF31.3** Ação `recalculate()` no store: aplica FR-DF31.1/2, saneia (`sanitizeContinuity`,
  `sanitizeLocked`, `sanitizeSuspension`, `namedExtra` sem fantasmas, `migrateSection`),
  reconcilia as ancoragens com o tipo de cada eixo quando há `suspension`, cancela "adicionar
  membro" pendente, segue a seleção pelo rename e grava `recalcReport`.
- **FR-DF31.4** Botão **Recalcular** no painel Checklist B6 (abaixo da massa), com `title`
  explicando o que faz. Abaixo dele, o resumo do último recálculo: pontos identificados
  (`N7→SL`), recusas com razão, ancoragens criadas/removidas, referências órfãs removidas, ou
  "nada a corrigir — regras reavaliadas".
- **FR-DF31.5** A reavaliação é a mesma do editor (o checklist já deriva da gaiola); o botão a
  torna **explícita** — o modelo saneado é um objeto novo, e tudo que deriva dele recalcula.
- **FR-DF31.6** O que o recálculo faz é o que a importação de JSON já fazia, mais a
  identificação e a reconciliação. Importar continua **não** renomeando: renomear é ação
  explícita.

## 5. Modelo de dados

Nenhuma mudança em `Cage`. No store: `recalcReport: RecalcReport | null` e `recalculate()`.

## 6. Módulos afetados

| Módulo                   | Mudança                                                                      |
| ------------------------ | ---------------------------------------------------------------------------- |
| `core/model/identify.ts` | **novo**: `LETTER_RULES`, `letterFor`, `identifyNamedPoints`, `applyRenames` |
| `web/store.ts`           | `recalculate`, `recalcReport`                                                |
| `web/App.tsx`            | `RecalcBar` no painel do checklist                                           |
| `web/styles.css`         | `.recalc-bar`, `.recalc-report` (só tokens)                                  |

## 7. Critérios de aceite

| #         | Critério                                                                                                             | Verificação    |
| --------- | -------------------------------------------------------------------------------------------------------------------- | -------------- |
| AC-DF31.1 | No template, a identificação propõe exatamente `NL→DL` e `NR→DR`; N1, SM, EM, FX, U e LDB não recebem letra          | vitest ✔       |
| AC-DF31.2 | Nó que já tem letra nunca é renomeado, mesmo que a topologia diga outra coisa                                        | vitest ✔       |
| AC-DF31.3 | Vaga ocupada e candidatos duplos ficam de fora, com a razão no relatório                                             | vitest ✔       |
| AC-DF31.4 | `applyRenames` renomeia nó, membros, continuidade e trava; a letra sai de `namedExtra`; ancoragens intactas          | vitest ✔       |
| AC-DF31.5 | Com `N→D`, o B6.2.4.5 passa a conferir a cadeia do SIM (trecho faltando vira `fail`); template íntegro não regride   | vitest ✔       |
| AC-DF31.6 | `recalculate()` no store renomeia, segue a seleção, limpa travas órfãs e reconcilia ancoragens; relatório preenchido | vitest ✔       |
| AC-DF31.7 | Botão no checklist mostra o resumo; segundo clique diz "nada a corrigir"                                             | manual/browser |

## 8. Riscos e questões em aberto

- **Renomear é mudar o modelo.** Deliberado e explícito (é um botão), mas sem desfazer. Se
  incomodar, o próximo passo natural é um diálogo de confirmação com a lista antes de aplicar.
- **P é heurística.** O ponto P do regulamento (pé do FAB dianteiro no SIM) é identificado por
  FAB_UP + (FAB_LOW | SIM) sem RRH/RLC. Cobre o assistente; uma amarração exótica pode não
  casar — e então nada acontece (recusa silenciosa por falta de letra).
- **`O` fora.** Sem regra de topologia clara para o ponto O, o módulo não o propõe.
- **Ids com letra fora do catálogo** (`FX`, `U1`, `EML`) são tratados como genéricos e só
  mudam se a topologia der letra — no template não dá.
