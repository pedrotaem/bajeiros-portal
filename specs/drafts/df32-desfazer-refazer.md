# DF-32 — Desfazer e refazer no editor

- **Status:** ✅ **IMPLEMENTADA** (2026-09-06) — promovida a US-19 em [spec.md](../spec.md).
  Testes: `apps/web/src/history-store.test.ts`.
- **Ordem de desenvolvimento:** depois de DF-31 (o recálculo renomeia nós e era a única ação
  "sem volta" do editor).
- **Dependências:** store do editor (todas as ações que mudam `cage`) · **Desbloqueia:** ações
  mais agressivas com menos medo (recálculo, reconciliação de ancoragens, importação).
- **Documentos:** [índice de drafts](../draft-features.md) · [spec.md](../spec.md) ·
  [design.md](../design.md) §7

## 1. Contexto e motivação

O editor tinha ~40 ações que mudam a gaiola e nenhuma volta. Arrastar um nó sem querer,
trocar o tipo da suspensão (que remove ancoragens), importar o JSON errado ou clicar em
"Recalcular" eram caminhos só de ida. O DF-31 registrou o risco por escrito ("sem desfazer; a
mitigação é o resumo"). O pedido de uso (2026-09-06): "a capacidade de desfazer e refazer ações
feitas pelo usuário — clássicos Ctrl+Z".

## 2. Objetivos e não-objetivos

**Objetivos**

- Desfazer e refazer **qualquer** mudança na gaiola: geometria, membros, ancoragens, suspensão,
  volante, manequim, seções, continuidade, travas, importação, template, recálculo.
- Passos com granularidade humana: um arrasto = um passo; digitar "1250" num campo = um passo.
- Atalhos clássicos (Ctrl+Z, Ctrl+Shift+Z, Ctrl+Y; ⌘ no Mac) e dois botões visíveis.

**Não-objetivos**

- Histórico de **estado de tela** (seleção, alternadores, câmera, aba do inspetor): não é
  edição; desfazer "selecionei outro nó" seria ruído.
- Persistir o histórico no JSON ou na nuvem: é da sessão.
- Nomear cada passo ("Desfazer mover AL"): fica para quando houver menu de histórico.

## 3. Conceito

**Só a gaiola tem histórico.** O store envolve o `set` de todas as ações: quando `cage` muda de
referência, a gaiola anterior vai para `past` e `future` esvazia. Desfazer e refazer trocam a
gaiola por `rawSet` e não entram no próprio histórico. Estado de tela não é gravado — ao
restaurar uma gaiola, a seleção que ainda existe fica, a que não existe vira `null`, e um
"adicionar membro" pendente cai.

**Dois mecanismos de fusão**, porque uma edição humana gera muitos `set`:

1. **Gesto** (arrasto no 3D): `beginGesture()` no `pointerdown`, `endGesture()` no `pointerup`.
   O primeiro `set` do gesto grava a gaiola de antes; os demais não gravam. Clique sem mover não
   grava nada.
2. **Assinatura + janela** (digitação): cada mudança tem uma assinatura — as chaves da gaiola que
   mudaram, com o id de cada nó movido (`nodes:AL|nodes:AR`). Mudança com a **mesma** assinatura
   dentro de **800 ms** da anterior funde no passo anterior: "1", "12", "125", "1250" no campo X
   viram um passo. Nó diferente, campo diferente ou pausa maior abrem outro passo.

**Teto de 100 passos.** A gaiola serializada tem ~15 KB; 100 delas são desprezíveis, e ninguém
desfaz mais que isso.

## 4. Requisitos funcionais

- **FR-DF32.1** `past: Cage[]`, `future: Cage[]` no store; toda ação que muda `cage` empilha a
  gaiola anterior em `past` e esvazia `future`. Desfazer e refazer não se gravam.
- **FR-DF32.2** Fusão por gesto: `beginGesture()`/`endGesture()` chamados pelo arrasto do 3D
  (nó, ancoragem, volante, centro de roda). Um gesto = no máximo um passo.
- **FR-DF32.3** Fusão por assinatura: mudanças com a mesma assinatura em menos de 800 ms fundem
  no passo anterior (o passo guarda a gaiola de antes do primeiro caractere).
- **FR-DF32.4** `undo()`/`redo()` restauram a gaiola, ajustam a seleção ao que existe na gaiola
  restaurada e cancelam "adicionar membro" pendente. Sem histórico/futuro, não fazem nada.
- **FR-DF32.5** Botões **Desfazer** e **Refazer** no cabeçalho do painel de edição, desabilitados
  quando não há o que fazer, com o atalho no `title`.
- **FR-DF32.6** Atalhos na página do editor: Ctrl/⌘+Z desfaz, Ctrl/⌘+Shift+Z e Ctrl/⌘+Y refazem.
  Dentro de `input`, `textarea`, `select` ou `contenteditable` o atalho fica com o campo — o
  desfazer da digitação não pode desfazer a gaiola.
- **FR-DF32.7** Importar JSON, restaurar o template e recalcular são passos normais do
  histórico: desfazer uma importação devolve a gaiola anterior.
- **FR-DF32.8** Estado de tela (seleção, alternadores, espelho, câmera, tolerância de planos)
  não entra no histórico.

## 5. Modelo de dados

Nenhuma mudança em `Cage`. No store: `past`, `future`, `histSig`, `histAt`, `histGesture`,
`undo`, `redo`, `beginGesture`, `endGesture`.

## 6. Módulos afetados

| Módulo         | Mudança                                                                  |
| -------------- | ------------------------------------------------------------------------ |
| `web/store.ts` | `set` envolvido (grava quando `cage` muda); assinatura; gesto; undo/redo |
| `Viewport.tsx` | `beginGesture` no `pointerdown` do arrasto, `endGesture` no `pointerup`  |
| `App.tsx`      | `HistoryButtons` no cabeçalho do painel; atalhos de teclado no editor    |
| `styles.css`   | `.history-btns` (só tokens)                                              |

## 7. Critérios de aceite

| #         | Critério                                                                                         | Verificação    |
| --------- | ------------------------------------------------------------------------------------------------ | -------------- |
| AC-DF32.1 | Mover um nó, desfazer volta a posição, refazer reaplica                                          | vitest ✔       |
| AC-DF32.2 | Três mudanças no mesmo nó em < 800 ms = um passo; outro nó ou pausa > 800 ms = outro passo       | vitest ✔       |
| AC-DF32.3 | Gesto com cinco movimentos espaçados de 1 s = um passo; gesto sem movimento não grava            | vitest ✔       |
| AC-DF32.4 | Ação nova depois de desfazer descarta o refazer                                                  | vitest ✔       |
| AC-DF32.5 | Desfazer "novo nó" limpa a seleção dele; seleção que continua existindo é preservada             | vitest ✔       |
| AC-DF32.6 | Importar, restaurar template e recalcular são desfazíveis; estado de tela não entra; teto de 100 | vitest ✔       |
| AC-DF32.7 | Botões habilitam/desabilitam; Ctrl+Z fora de campo desfaz; dentro de campo não mexe na gaiola    | manual/browser |

## 8. Riscos e questões em aberto

- **Assinatura por referência.** A fusão depende de as ações preservarem a referência do que não
  mudou (é o que `withMirror` faz para nós). Uma ação que reconstrua tudo (ex.: `loadCage`) tem
  assinatura larga e nunca funde — o que é o desejado.
- **800 ms é palpite.** Curto demais separa uma digitação lenta em dois passos; longo demais
  funde duas edições distintas no mesmo campo. Ajustável numa constante.
- **Memória.** 100 gaiolas × ~15 KB. Uma gaiola muito maior (import de CAD futuro) pode pedir
  histórico por diff; hoje não compensa.
