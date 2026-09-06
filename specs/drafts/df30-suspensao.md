# DF-30 — Módulo de suspensão: tipo por eixo, centros de roda, entre-eixos e corpos genéricos

- **Status:** ✅ **v1 IMPLEMENTADA** (2026-09-05) — promovida a US-17 em [spec.md](../spec.md);
  regras SUSP.2 e SUSP.3 em [rules.md](../rules.md) §5. Testes: `packages/core/src/model/suspension.test.ts`,
  `packages/core/src/rules/b6-suspension.test.ts`, `apps/web/src/suspension-store.test.ts`,
  `packages/datasheet/src/suggest.test.ts`.
  - Pendências residuais nomeadas em §10 (bitola declarada, cinemática, largura total do veículo).
- **Ordem de desenvolvimento:** depois de DF-22/DF-23 (usa cota, trava e vistas); antes de qualquer
  cinemática de suspensão.
- **Dependências:** US-4 (ancoragens) · DF-21 (ficha: `dim.entre-eixos`, `dim.bitola-*`,
  `susp.tipo-*`) · DF-23 (trava) · **Desbloqueia:** curso e cinemática (fora desta spec), largura
  total do veículo, ângulo de ataque das bandejas.
- **Documentos:** [índice de drafts](../draft-features.md) · [spec.md](../spec.md) ·
  [rules.md](../rules.md) · [design.md](../design.md) §3.5/§7 · [DF-21](df21-ficha-prototipo.md)

## 1. Contexto e motivação

A gaiola existe para segurar o piloto e **para receber a suspensão**. Hoje o portal modela 20
ancoragens (US-4) que assumem, sem dizer, duplo A na dianteira e na traseira: quatro pontos de
bandeja mais o amortecedor por roda. Não há roda, não há entre-eixos, não há centro de roda — a
única relação da gaiola com o carro é "a ancoragem está sobre um tubo" (SUSP.1).

Isso deixa três decisões de projeto invisíveis ao validador:

1. **O tipo de suspensão** define quantos pontos a gaiola precisa oferecer e onde. Uma traseira
   de braço arrastado tem dois pivôs e um amortecedor por lado; uma McPherson tem bandeja inferior
   e torre. Com 20 ancoragens fixas, a equipe que não usa duplo A arrasta losangos "sobrando"
   para fora do caminho e o SUSP.1 acusa ancoragens que não existem no projeto.
2. **O entre-eixos** é a primeira cota do carro e nasce na suspensão, não na gaiola — mas é a
   gaiola que tem de fechar com ele. Hoje ele mora só na ficha (DF-21), digitado à mão, sem
   ninguém conferir se a geometria modelada bate.
3. **A roda ocupa espaço.** Bandeja, amortecedor e pneu disputam volume com o LFS, o SIM e o
   quadro frontal. Sem um corpo genérico na cena, a interferência só aparece no CAD — ou na
   oficina.

O pedido (2026-09-05): módulo próprio onde a equipe escolhe o tipo por eixo, entra com os dados
básicos do projeto de suspensão (entre-eixos, pneu), vê os pontos correspondentes na gaiola e
os corpos genéricos (bandejas, amortecedor, manga, roda e pneu), com dois alternadores no
viewport — um para os corpos, outro para os pontos de ancoragem.

## 2. Objetivos e não-objetivos

**Objetivos**

- Tipo de suspensão **por eixo**, com o conjunto de ancoragens derivado do tipo.
- **Centro de roda** por eixo (par L/R espelhado): o ponto que define entre-eixos e bitola.
- **Entre-eixos declarado** como cota de projeto, conferido pelo validador contra a geometria.
- Corpos genéricos na cena: bandejas/braços, amortecedor, manga de eixo, roda e pneu — um
  modelo paramétrico simples por tipo, suficiente para ver volume e direção, não para fabricar.
- Dois alternadores na barra do viewport: **Suspensão** (corpos) e **Ancoragens** (pontos).
- Bitola e entre-eixos medidos alimentam as **sugestões da ficha** (DF-21 §3.2).

**Não-objetivos (v1)**

- Cinemática: curso, cambagem dinâmica, centro de rolagem, anti-dive. A suspensão aqui é um
  **estado estático em ordem de marcha**.
- Dimensionamento de braço, rótula, bucha ou amortecedor.
- Geometria de direção (bitola de esterço, Ackermann) — segue no domínio de DF-5 e da ficha.
- Restrições normativas sobre largura/comprimento do veículo — ver §9.

## 3. Conceito

**A suspensão é configuração de projeto, vai para o JSON** (como `manikin`, `steering` e
`locked`) e é **opt-in**: projeto sem `suspension` continua exatamente como hoje — 20 ancoragens
soltas, SUSP.1 e nada mais. O template do portal nasce **com** a configuração (duplo A na
dianteira, braço arrastado na traseira, pneu 22×7-10), porque é a gaiola de referência.

**Um tipo define papéis, não posições.** Cada tipo lista os papéis de ancoragem que exige por
roda (`ANCHOR_ROLES_BY_TYPE`). Trocar o tipo **reconcilia** as ancoragens do eixo: as que têm
papel no tipo novo ficam onde estão; as que não têm são removidas (e as travas delas
morrem, FR-15.5); as que faltam nascem em posição derivada das vizinhas. A filosofia de US-4
continua: identidade fixa, posição livre.

| Tipo                                   | Eixo       | Papéis por roda                 | Corpos genéricos                                                 |
| -------------------------------------- | ---------- | ------------------------------- | ---------------------------------------------------------------- |
| `duplo-a` — duplo A                    | diant/tras | `sup1 sup2 inf1 inf2 amort` (5) | duas bandejas em A, manga vertical, amortecedor sobre a inferior |
| `mcpherson` — McPherson                | dianteira  | `inf1 inf2 amort` (3)           | bandeja inferior em A, coluna (amortecedor) da torre à rótula    |
| `semi-trailing` — braço semi-arrastado | traseira   | `inf1 inf2 amort` (3)           | braço dos dois pivôs ao cubo, amortecedor sobre o braço          |
| `trailing` — braço arrastado           | traseira   | `inf1 inf2 amort` (3)           | idem, pivôs alinhados                                            |

Os ids dos tipos são os **mesmos** do catálogo da ficha (`SUSP_DIANT`/`SUSP_TRAS`, DF-21 §5.4):
o módulo sugere o tipo para a ficha sem tradução.

**Centro de roda** é um ponto por eixo, guardado para o lado L (`x < 0`) e espelhado para o R.
Bitola do eixo = `2·|x|`. Entre-eixos medido = `|z(traseira) − z(dianteira)|`. O ponto é
arrastável e cotável como uma ancoragem, e travável (DF-23) pelo id do eixo (`roda-dianteira`,
`roda-traseira`) — travar o centro trava os dois lados, porque é um ponto só.

**Entre-eixos declarado × medido.** A equipe digita o entre-eixos de projeto. A regra `SUSP.2`
compara com o medido dos centros de roda, com 5 mm de tolerância de modelagem. Ao criar a
configuração, o declarado nasce igual ao medido — o template passa; quando a dinâmica manda
outro número, a equipe digita e o checklist mostra a diferença até a gaiola (ou os centros)
fecharem.

**Corpos genéricos são derivados**, nunca gravados: `suspensionBodies(cage)` devolve cilindros
(`{a, b, raio}`) a partir das ancoragens, do centro de roda e do pneu — o que a cena desenha e o
que os testes contam. Todos com `raycast` nulo (como Geraldão e manequim): não capturam clique,
não entram em regra nem em massa.

## 4. Requisitos funcionais

### 4.1 Configuração

- **FR-DF30.1** `Cage.suspension?: SuspensionConfig` com `wheelbaseMm` e, por eixo, `{ type,
wheelCenter (lado L), tire: { od, width, rim } }` em mm. Opt-in: ausente, nada muda em relação
  a US-4.
- **FR-DF30.2** Tipos permitidos por eixo: dianteira `duplo-a | mcpherson`; traseira
  `duplo-a | semi-trailing | trailing`. Ids idênticos ao catálogo da ficha.
- **FR-DF30.3** "Configurar suspensão" cria a configuração a partir das ancoragens existentes:
  o tipo é **inferido** (tem `sup1`+`sup2` → duplo A; senão McPherson na dianteira e braço
  arrastado na traseira), o centro de roda nasce fora da ancoragem mais externa do eixo
  (`|x| máx + 250`), na altura média das bandejas e no z médio delas; o entre-eixos declarado nasce
  igual ao medido; pneu 559 × 178, aro 254 (22×7-10).
- **FR-DF30.4** Trocar o tipo de um eixo reconcilia as ancoragens do eixo (§3): mantém as com papel
  no tipo novo, remove as sem papel (limpando travas), cria as que faltam a partir das vizinhas
  (`sup_i = inf_i + 200 mm em y`, `inf_i = sup_i − 200 mm`, `amort` 250 mm acima do meio das
  bandejas), sempre em par L/R espelhado.
- **FR-DF30.5** Remover a configuração apaga só `suspension` e as travas dos centros de roda; as
  ancoragens ficam como estão.
- **FR-DF30.6** Importar JSON saneia: configuração com número não finito, pneu não positivo ou
  tipo inválido para o eixo é descartada inteira (o projeto abre sem módulo, como antes de DF-30).

### 4.2 Centro de roda e cotas

- **FR-DF30.7** Um marcador por roda (quatro na cena), **cubo** na cor de ancoragem — mesma cor,
  forma distinta (design-system §9.3). Arrastável com o mesmo gesto de nó/ancoragem; arrastar
  qualquer lado move o par espelhado. Selecionável; a seleção mostra rótulo
  `roda dianteira L · centro`.
- **FR-DF30.8** No inspetor, o centro de roda tem X/Y/Z (lado L; o R é o espelho), trava (DF-23) e
  as leituras derivadas: bitola do eixo e entre-eixos medido.
- **FR-DF30.9** Bitola medida (`2·|x|`) e entre-eixos medido entram no enquadramento das vistas
  (FR-16.2): a caixa envolvente passa a incluir as rodas (centro ± raio do pneu) quando os corpos
  estão visíveis.

### 4.3 Regras

- **FR-DF30.10** `SUSP.2` — Entre-eixos do projeto (cond. `suspension`): `|medido − declarado| ≤
5 mm` → `pass` com o medido; senão `fail` com medido, declarado e a diferença. `members: []`.
- **FR-DF30.11** `SUSP.3` — Ancoragens conforme o tipo (cond. `suspension`): cada eixo tem, dos
  dois lados, exatamente os papéis do tipo. Papel faltando → `fail` com `presence: true` (o
  assistente trata como pendência); papel sobrando → `fail` listando o que remover. `members: []`.
- **FR-DF30.12** `SUSP.1` continua igual e passa a se referir ao conjunto reconciliado — a
  contagem "20" sai dos textos (título da lista, passo 5 do assistente).

### 4.4 Cena

- **FR-DF30.13** Alternador **"Suspensão"** na barra do viewport: liga/desliga os corpos
  genéricos. Ligado por padrão; desabilitado quando não há configuração (o `title` diz onde
  configurar).
- **FR-DF30.14** Alternador **"Ancoragens"**: liga/desliga os marcadores de ancoragem **e** os
  centros de roda. Ligado por padrão. Desligar não desmarca a seleção atual, mas o marcador
  selecionado some com os demais.
- **FR-DF30.15** Corpos por tipo. Braços/bandejas, manga, cubo e amortecedor são **tubos sólidos**
  com o material dos membros da gaiola, na cor `--bj-3d-suspension` — um passo mais claro que o
  tubo secundário: a suspensão lê como estrutura sem passar por membro. Raios: braços 11 mm, manga
  22, cubo 18, amortecedor corpo 16 + haste 7 (coluna McPherson 20). Rótula inferior/superior a
  ±100 mm do centro de roda, no plano do pneu deslocado 40 mm para dentro da face interna
  (`x = cx ± (width/2 + 40)`). **Roda com volume**: carcaça do pneu revolucionada (talão no aro,
  flanco abaulado, ombro arredondado, banda plana) em `--bj-3d-rubber`, garras off-road em duas
  fileiras alternadas (passo ~45 mm, instanciadas), letra branca em dois arcos mais filete na
  lateral **externa** (`--bj-3d-label-fg`); aro em prato até o cubo na cor do membro primário. O
  cilindro `kind: 'tire'` de `suspensionBodies` segue sendo o envelope (centro, largura, raio) —
  é o que o enquadramento e os testes usam. Emenda 2026-09-06: a v1 desenhava tudo como cilindro
  translúcido na cor de ancoragem; o pedido de uso trouxe os tubos sólidos e o pneu concreto.
- **FR-DF30.16** Ancoragem exigida pelo tipo mas ausente (JSON inconsistente): o corpo que dependia
  dela não é desenhado; a cena não quebra e `SUSP.3` explica.
- **FR-DF30.17** A legenda do viewport nomeia a cor compartilhada: "ancoragem · suspensão".

### 4.5 Ficha (DF-21)

- **FR-DF30.18** Sugestões novas em `suggestFrom`: `dim.entre-eixos` (medido dos centros),
  `dim.bitola-dianteira`, `dim.bitola-traseira`, `susp.tipo-dianteiro`, `susp.tipo-traseiro`. Só
  quando `suspension` existe; a ficha continua editável à mão (RF-1.4 do DF-21).

## 5. Modelo de dados

```ts
// model/types.ts
export type Axle = 'dianteira' | 'traseira'
export type SuspensionType = 'duplo-a' | 'mcpherson' | 'semi-trailing' | 'trailing'
export interface TireSpec {
  od: number
  width: number
  rim: number
} // mm
export interface AxleSuspension {
  type: SuspensionType
  wheelCenter: Vec3 // lado L (x < 0); o R é o espelho
  tire: TireSpec
}
export interface SuspensionConfig {
  wheelbaseMm: number // cota de projeto — SUSP.2 confere contra os centros
  dianteira: AxleSuspension
  traseira: AxleSuspension
}
interface Cage {
  /* ... */ suspension?: SuspensionConfig
}
```

`model/suspension.ts` (puro): `ANCHOR_ROLES_BY_TYPE`, `SUSPENSION_TYPES_BY_AXLE`,
`defaultSuspension(cage)`, `reconcileAnchors(anchors, axle, type, wheelCenter)`,
`wheelCenters(cfg)`, `measuredWheelbase(cfg)`, `measuredTrack(cfg, axle)`,
`suspensionBodies(cage)`, `sanitizeSuspension(cage)`, `wheelLockId(axle)`.

## 6. Módulos afetados

| Módulo                                           | Mudança                                                                         |
| ------------------------------------------------ | ------------------------------------------------------------------------------- |
| `core/model/types.ts`                            | tipos acima; `sanitizeLocked` conhece `roda-*`                                  |
| `core/model/suspension.ts`                       | **novo**: papéis por tipo, reconciliação, medidas, corpos, saneamento           |
| `core/model/template.ts`                         | `suspension` do template (duplo A + braço arrastado, 22×7-10, entre-eixos 1121) |
| `core/rules/b6.ts`                               | `SUSP.2`, `SUSP.3`                                                              |
| `datasheet/types.ts`, `catalog.ts`, `suggest.ts` | cinco `SuggestId` novos                                                         |
| `web/store.ts`                                   | `showSuspension`, `showAnchors`, `selectedWheel`, ações do módulo               |
| `web/components/Suspension.tsx`                  | **novo**: corpos genéricos a partir de `suspensionBodies`                       |
| `web/components/Viewport.tsx`                    | marcadores de centro de roda; gating de ancoragens; enquadramento               |
| `web/App.tsx`                                    | alternadores "Suspensão" e "Ancoragens"; legenda                                |
| `web/components/Inspector.tsx`                   | aba **Suspensão** (config, centros, lista de ancoragens); painel do centro      |

## 7. UI/UX

- Aba **Suspensão** no inspetor (entre Planos e Tubos). Sem configuração: um parágrafo e o botão
  "Configurar suspensão a partir das ancoragens". Com: bloco **Entre-eixos** (declarado, Enter
  aplica · medido · estado), um bloco por eixo (tipo, pneu Ø/largura/aro, centro de roda X/Y/Z,
  trava, bitola medida), a **lista de ancoragens** (que sai da aba Seleção — passa a ter uma casa
  só) e "Remover configuração".
- Selecionar um centro de roda no 3D abre a aba Seleção com o painel do ponto, como ancoragem.
- Os corpos nunca capturam clique: clicar "no pneu" seleciona o que estiver atrás, e isso é
  intencional — a suspensão é contexto, a gaiola é o objeto.

## 8. Critérios de aceite

| #          | Critério                                                                                                                                   | Verificação    |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------- |
| AC-DF30.1  | Template (duplo A na frente, braço arrastado atrás, 16 ancoragens): `suspension` presente, `SUSP.2` e `SUSP.3` `pass`, `SUSP.1` inalterado | vitest ✔       |
| AC-DF30.2  | Sem `suspension`, nenhum `SUSP.2`/`SUSP.3` é emitido; `suggestFrom` não sugere entre-eixos nem bitola                                      | vitest ✔       |
| AC-DF30.3  | Declarar entre-eixos 1400 no template → `SUSP.2` `fail` com medido, declarado e diferença                                                  | vitest ✔       |
| AC-DF30.4  | Trocar a dianteira para McPherson remove `sup1`/`sup2` dos dois lados (10 → 6 ancoragens dianteiras… 12 total) e limpa a trava delas       | vitest ✔       |
| AC-DF30.5  | Voltar para duplo A recria `sup1`/`sup2` em par espelhado, 200 mm acima das inferiores                                                     | vitest ✔       |
| AC-DF30.6  | Arrastar o centro de roda R para x = +600 deixa o L em −600 (bitola 1200)                                                                  | vitest ✔       |
| AC-DF30.7  | Apagar uma ancoragem exigida no JSON → `SUSP.3` `fail` com `presence: true`; a cena desenha os demais corpos                               | vitest ✔       |
| AC-DF30.8  | `suggestFrom` do template sugere entre-eixos 1121, bitolas 1114/1228 e tipos `duplo-a`/`trailing`                                          | vitest ✔       |
| AC-DF30.9  | JSON com `suspension.dianteira.type = 'trailing'` importa sem módulo (saneado)                                                             | vitest ✔       |
| AC-DF30.10 | Alternadores "Suspensão" e "Ancoragens" escondem corpos e marcadores; "Suspensão" fica desabilitado sem config                             | manual/browser |
| AC-DF30.11 | Vista Lateral com corpos ligados enquadra os pneus                                                                                         | manual/browser |

## 9. Riscos e questões em aberto

- **Largura e comprimento máximos do veículo.** O regulamento limita as dimensões externas do
  carro, e com pneu e bitola o portal passaria a saber a largura total. **Não implementado**:
  o item e os valores da Emenda 7 precisam ser conferidos antes de virar regra com id — o que
  não se confere não entra no motor (mesma disciplina do DF-5 §9).
- **Centro de roda sem cota vertical de referência.** O `y = 0` da cena é o assoalho da gaiola,
  não o solo; a altura livre do solo é `centro.y − od/2`, negativa em relação ao assoalho. A cena
  não desenha o solo. Desenhar um plano de solo derivado do pneu é candidato natural para a v2.
- **Bitola declarada.** Só o entre-eixos tem declarado × medido. Bitola tem só o medido, porque
  ela nasce da posição do centro de roda que a equipe escolhe — declarar duas vezes o mesmo número
  seria burocracia. Se a dinâmica pedir bitola como cota independente, é uma linha na config e uma
  regra irmã de SUSP.2.
- **Corpos são caricatura útil.** Rótula a ±100 mm, braço reto, amortecedor reto: servem para ver
  volume e interferência grossa, não folga de 10 mm. O texto da aba diz isso.
- **Critério de maturidade** (`packages/evolution` · "Ancoragens de suspensão apoiadas em tubo")
  cita "as 20 ancoragens" no texto de cumprimento. O que ele confere é SUSP.1, que continua
  valendo para qualquer conjunto; o texto fica como está até a próxima versão do catálogo (a
  versão é contrato, DF-19).
- **`ANCHOR_ROLE_LABELS`** continua com o vocabulário do duplo A ("bandeja inferior · ancoragem
  traseira") para os pivôs do braço arrastado. A ambiguidade é pequena (os dois papéis são "os
  dois pontos do braço"); rótulo por tipo fica para quando houver um terceiro leitor além da
  lista.

## 10. Plano de implementação (executado)

1. `model/suspension.ts` puro + tipos + template + testes.
2. `SUSP.2`/`SUSP.3` + testes contra o template.
3. Store: estado de cena, seleção do centro, ações de configuração/reconciliação/movimento.
4. `Suspension.tsx` (corpos), marcadores no `Viewport.tsx`, alternadores e legenda no `App.tsx`.
5. Aba Suspensão no inspetor; lista de ancoragens migra para lá; painel do centro na Seleção.
6. Sugestões da ficha + testes; promoção para `spec.md`/`rules.md`/`design.md`.

**Pendências residuais (v2):** solo derivado do pneu; largura total × regulamento (após
conferência); bitola declarada; rótulo de papel por tipo.
