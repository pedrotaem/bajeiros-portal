# DF-22 — Planos da gaiola e cotas entre pontos

- **Status:** ✅ **IMPLEMENTADA** (2026-08-31) — promovida a US-13/US-14 em [spec.md](../spec.md).
  - Módulo puro novo: `packages/core/src/model/planes.ts` (detecção, ângulo, giro e cota), 16 testes.
  - Toggle "Planos" na barra do viewport, aba "Planos" no inspetor, cota no nó e comprimento
    editável no membro. Nada disso entra no `Cage` — plano é derivado, como junta.
- **Ordem de desenvolvimento:** 8ª do lote do validador (depois de DF-1…DF-7)
- **Dependências:** nenhuma (usa `Cage`, `isNamedIn` e as primitivas de `rules/geometry.ts`) ·
  **Desbloqueia:** ângulo entre painéis como entrada de projeto, e não só como leitura
- **Documentos:** [índice de drafts](../draft-features.md) · [spec.md](../spec.md) · [design.md](../design.md)

## 1. Contexto e motivação

Hoje a gaiola só se edita **ponto a ponto**: coordenada no painel (FR-2.1) ou arrasto no 3D
(FR-2.8). São as duas formas de dizer _onde_ um ponto está — e nenhuma de dizer o que o
projetista realmente tem na cabeça, que é **quanto** e **quão inclinado**:

- "a bitola entre os pontos A é 700 mm" — hoje vira conta de cabeça para achar o X de cada lado;
- "o corta-fogo tem 10° de inclinação" — hoje vira tentativa e erro movendo B, H e S um por um,
  e ainda assim os três saem do plano.

O regulamento raciocina em **painéis**: B6.2.4.9 exige que ALC, BLC, montantes do RRH, LDB e SHC
sejam coplanares; B6.2.4.2 mede a inclinação do RRH _em relação à vertical_; B6.2.13.5 mede o
ângulo do FBM. O modelo tem toda a informação para exibir esses planos, e não exibia nenhum.

## 2. Objetivos e não-objetivos

**Objetivos**

- Editar a **distância** entre dois pontos digitando o valor, com escolha explícita de quem se move.
- Mostrar os **planos** formados por pontos denominados adjacentes, com liga/desliga na barra do
  viewport, no mesmo padrão do Geraldão (DF-3) e do Piloto (DF-4).
- **Medir e editar o ângulo** entre dois planos vizinhos, girando um deles em torno da aresta comum.

**Não-objetivos**

- Solucionador de restrições (paramétrico tipo CAD). Cada cota e cada ângulo é uma edição
  imperativa que acontece uma vez; nada fica "amarrado" depois.
- Regra B6 nova. Os planos são ferramenta de projeto; nenhum `RuleResult` depende deles.
- Superfície fechada / casca / malha para análise. Plano aqui é referência de projeto, não painel
  físico com espessura.

## 3. Histórias de usuário

- **US-DF22.a** Como projetista, quero digitar a distância entre dois pontos denominados para
  cravar uma cota de projeto (bitola, entre-eixos do habitáculo) sem calcular coordenada.
- **US-DF22.b** Como projetista, quero ver os planos da gaiola para entender que o corta-fogo, o
  teto e o assoalho são superfícies, e não oito pontos soltos.
- **US-DF22.c** Como projetista, quero mudar o ângulo entre o corta-fogo e o assoalho digitando o
  valor, e ver a inclinação do RRH (B6.2.4.2) acompanhar no checklist.

## 4. Requisitos funcionais

### 4.1 Cotas

- **FR-DF22.1** `setPointDistance(cage, a, b, alvo, move)` (puro): desloca sobre a reta que já une
  os dois pontos, preservando a direção. `move` = `b` (padrão), `a` ou `both` (simétrico, preserva
  o ponto médio). Recusa alvo ≤ 0, ponto inexistente e pontos coincidentes (sem direção definida).
- **FR-DF22.2** Espelhamento (FR-2.2) se aplica. **Exceção:** quando os dois pontos são gêmeos L/R
  e o espelho está ligado, o modo vira `both` à força — mover só um lado seria desfeito pelo
  próprio espelho no mesmo passo, entregando uma cota diferente da pedida.
- **FR-DF22.3** Posições resultantes arredondadas a **0,01 mm** (o arrasto continua em 1 mm: lá o
  gesto é grosso, aqui o número é digitado).
- **FR-DF22.4** Duas entradas na tela: bloco "Cota até outro ponto" no nó selecionado (escolhe o
  segundo ponto numa lista, denominados primeiro) e **comprimento editável** no membro selecionado
  (desloca a ponta `b` sobre o eixo do tubo).

### 4.2 Planos

- **FR-DF22.5** **Definição:** um plano é um **circuito fechado de pontos denominados adjacentes**
  cujos vértices cabem todos dentro de `tolMm` de um mesmo plano ajustado por mínimos quadrados
  totais. "Adjacente" é a adjacência de vão (design §5.2): dois denominados ligados por tubo,
  atravessando nós de curva (não denominados de grau 2) — dividir um tubo não desfaz o plano.
  "Circuito fechado" é o que separa plano de trecho: todo ponto do conjunto tem ao menos **dois**
  vizinhos dentro do próprio conjunto.
- **FR-DF22.6** **Detecção** (`detectPlanes`): cada canto (dois vizinhos de um mesmo ponto) semeia
  um conjunto que cresce enquanto houver ponto adjacente dentro da tolerância — o de **menor
  resíduo primeiro**, o que torna o resultado independente da ordem de varredura. Depois: pontas
  soltas são podadas, conjuntos com área < 100 cm² caem (lasca entre pontos quase colineares) e só
  os **maximais** sobrevivem (nenhum plano é subconjunto de outro).
- **FR-DF22.7** **Tolerância** default **5 mm**, editável de 1 a 50 mm na tela. É apertada de
  propósito: afrouxar funde painéis vizinhos — a 20 mm o assoalho da gaiola default vira um plano
  só e esconde a dobra nos pontos I. Perder um plano é recuperável pelo campo; anunciar um plano
  que não existe, não.
- **FR-DF22.8** **Estado de UI, nunca do projeto:** o toggle e a tolerância vivem no store; o JSON
  exportado não muda. Nenhum `RuleResult` depende da visibilidade dos planos.
- **FR-DF22.9** **Render:** preenchimento translúcido (leque de triângulos a partir do centro, na
  ordem de contorno) + contorno, cor de acento; selecionado em âmbar com rótulo dos pontos.
  O preenchimento é **clicável** e isso é seguro por construção: a superfície passa pelo eixo dos
  tubos e pelo centro dos nós, então a esfera do nó (r = 20 mm) e o cilindro do tubo (r = 12,7 mm)
  estão sempre mais perto da câmera — o raio do ponteiro encontra o elemento antes do plano.
  Durante "adicionar membro" os planos saem de cena, porque ali todo clique é para nó.

### 4.3 Ângulos

- **FR-DF22.10** **Medida:** com aresta comum (≥ 2 pontos compartilhados e colineares dentro da
  tolerância), o ângulo é a **abertura entre os dois semiplanos** medida na dobradiça — o ângulo
  que o projetista enxerga entre dois painéis, em [0°, 180°]. Sem aresta comum, é o ângulo entre as
  normais em [0°, 90°], e **não é editável** (sem dobradiça não existe rotação que preserve o resto).
- **FR-DF22.11** **Edição:** digitar o ângulo gira rigidamente o plano selecionado em torno da
  aresta comum; o plano de referência não se move. Como os pontos compartilhados estão **sobre o
  eixo**, o ângulo muda exatamente pelo delta pedido. O sentido do giro sai de qual dos dois
  aproxima do alvo (a abertura é um ângulo sem sinal; tentar é mais barato e mais seguro que
  orientá-la).
- **FR-DF22.12** **Quem viaja** (`planeCarry`), em três camadas: (1) os pontos denominados do
  plano; (2) os nós de curva das arestas do plano; (3) qualquer nó **dentro do corpo de um tubo do
  plano** (distância ao eixo ≤ raio externo da classe do tubo) — é o caso das pontas das diagonais
  LDB do template, apoiadas sobre os montantes sem estarem ligadas a eles. Sem a camada 3, girar o
  corta-fogo deixa a diagonal para trás e o B6.2.4.9 passa a falhar por efeito colateral da
  ferramenta. Os pontos do plano de referência ficam de fora — são a dobradiça.
- **FR-DF22.13** A tela mostra **antes de digitar** a dobradiça e a lista de quem se move.
- **FR-DF22.14** Cota e ângulo aplicam **no Enter ou ao sair do campo**, não a cada tecla. Para
  coordenada, aplicar por tecla é inofensivo (o ponto passeia e chega); para ângulo não é — digitar
  "102" passaria por 1° e 10°, e o plano deitado sobre o vizinho no caminho pode fundir os dois,
  mudando a identidade do plano que a próxima tecla ia editar.

## 5. Modelo de dados

**Nenhuma mudança em `Cage`.** Plano é derivado da geometria a cada consulta, como junta (DF-7):

```ts
// packages/core/src/model/planes.ts (novo, puro)
interface CagePlane {
  id: string // pontos em ordem alfabética unidos por '-' — estável enquanto o conjunto for o mesmo
  points: NodeId[] // ordem de contorno (giro angular em torno do centro)
  normal: Vec3
  center: Vec3
  residualMm: number // maior desvio ao plano ajustado
  areaMm2: number
  orientation: 'transversal' | 'horizontal' | 'lateral' // eixo dominante da normal
}
interface PlaneAngle {
  deg: number
  shared: NodeId[]
  hinged: boolean // false = sem aresta comum ⇒ ângulo entre normais, não editável
  axisPoint: Vec3
  axisDir: Vec3
}
```

```ts
// store.ts — estado de UI
showPlanes: boolean // default false
planeTolMm: number // default PLANE_TOL_MM = 5, faixa 1–50
selectedPlane: string | null // id do plano; entra no mesmo grupo exclusivo das outras seleções
```

## 6. Módulos afetados

| Módulo                     | Mudança                                                                            |
| -------------------------- | ---------------------------------------------------------------------------------- |
| `model/planes.ts`          | **novo**: `namedLinks`, `namedAdjacency`, `fitPlane`, `planeOf`, `detectPlanes`,   |
|                            | `planeAngle`, `planeCarry`, `rotateAboutAxis`, `rotatePlaneTo`, `setPointDistance` |
| `store.ts`                 | `showPlanes`, `planeTolMm`, `selectedPlane` + `setDistance`, `setPlaneAngle`,      |
|                            | helper `withMirror` (um lugar só para o espelho das três ações que movem nó)       |
| `components/Planes.tsx`    | **novo**: leque de triângulos + contorno + rótulo do selecionado                   |
| `components/Viewport.tsx`  | renderiza `<Planes/>` quando ativo; `onPointerMissed` limpa a seleção de plano     |
| `components/Inspector.tsx` | aba "Planos" (lista, tolerância, ângulos), `DistanceBlock` no nó, comprimento no   |
|                            | membro, `CommitField` (aplica no Enter)                                            |
| `App.tsx`                  | toggle "Planos" na barra; `detectPlanes` num `useMemo` sobre o `useDeferredValue`  |
| `styles.css`               | `.node-label.plane` (por token, sem hex novo)                                      |

## 7. UI/UX

- Botão **Planos** na barra do viewport, entre "Piloto" e "Redundância".
- Aba **Planos** no inspetor: caixa de mostrar no 3D, tolerância, o porquê da tolerância em uma
  frase, e a lista ordenada por área (pontos à esquerda, área em cm² à direita).
- Plano selecionado abre o bloco de ângulos: um campo por vizinho **com aresta comum**, e sob cada
  campo a linha "dobradiça em X·Y · move A, B, C (+ espelho L/R)". Vizinho sem aresta comum não
  aparece: mostrar um número que não se pode editar seria oferecer o que não existe.
- Cota no nó: seletor do segundo ponto (denominados primeiro, livres marcados como tal), campo de
  distância e seletor de quem se move. Em par L/R espelhado o seletor trava em "os dois
  (simétrico)" com a explicação ao lado.

## 8. Critérios de aceite

| #          | Critério                                                                                                                                     | Verificação      |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| AC-DF22.1  | O plano do corta-fogo sai com os 8 pontos do RRH (A/S/H/B dos dois lados) e resíduo zero                                                     | vitest ✔         |
| AC-DF22.2  | Todo plano detectado é circuito fechado (grau ≥ 2 interno), está dentro da tolerância, e nenhum é subconjunto de outro                       | vitest ✔         |
| AC-DF22.3  | Nó de curva não denominado não entra no plano nem o desfaz; apertar a tolerância separa o assoalho na dobra dos pontos I e afrouxar funde    | vitest ✔         |
| AC-DF22.4  | Duas faces com aresta comum medem a abertura entre os semiplanos (90° na caixa de teste); faces paralelas não têm dobradiça e recusam edição | vitest ✔         |
| AC-DF22.5  | Editar o ângulo gira só quem viaja, em torno da aresta; a dobradiça e o plano de referência não se movem; o giro vai nos dois sentidos       | vitest ✔         |
| AC-DF22.6  | Digitar a distância entre dois pontos entrega exatamente a distância pedida, preservando a direção da reta                                   | vitest ✔         |
| AC-DF22.7  | Par L/R espelhado se afasta simetricamente (700 → 800 mm deixa os pontos em ∓400), não pelo lado escolhido                                   | vitest ✔         |
| AC-DF22.8  | O giro carrega os nós de curva e os nós apoiados dentro do tubo (as 4 pontas das LDB do template continuam sobre os montantes)               | vitest ✔         |
| AC-DF22.9  | Toggle e tolerância não alteram o JSON do projeto nem nenhum `RuleResult`                                                                    | vitest ✔         |
| AC-DF22.10 | Com os planos visíveis, clicar num nó ou tubo que está sobre o plano seleciona o nó/tubo, não o plano                                        | manual/browser ✔ |
| AC-DF22.11 | Girar o corta-fogo de 97,3° para 102° leva a inclinação do RRH (B6.2.4.2) de 10,8° para 15,5° no checklist                                   | manual/browser ✔ |

## 9. Riscos e questões em aberto

- **A partição dianteira × traseira do FAB é sensível ao giro.** O motor classifica FAB por
  `midpoint.z < min(A.z, B.z)` (design §5.4). Girar o corta-fogo move os pontos B e desloca esse
  limiar — na gaiola default, +4,7° de inclinação joga FAB_MID e FAB_LOW para o grupo dianteiro e
  o B6.2.14.4.6 passa a acusar falta. **Não é defeito do DF-22** (arrastar o ponto B à mão faz o
  mesmo), mas é a heurística mais frágil que o giro encosta. Revisar o critério de partição é
  trabalho do motor, não desta spec.
- **Nó livre fora do corpo de qualquer tubo do plano não é carregado.** É deliberado: arrastar nó
  que não está apoiado seria adivinhação. O checklist acusa, e é a leitura honesta.
- **O contorno é o fecho convexo do conjunto.** Um plano côncavo (raro em gaiola) é preenchido a
  mais no 3D. A área relatada tem o mesmo viés; ela serve para ordenar a lista, não para cálculo.
- **Custo:** a detecção é ~6–13 ms na gaiola default (138 sementes) e roda no mesmo
  `useDeferredValue` da análise de remoção, que já custa ~40 avaliações. Gaiola muito maior pode
  pedir memo por topologia (separar o que depende de posição do que depende de grafo).
- **Ainda em aberto:** cota entre ponto e plano (distância perpendicular) e ângulo entre plano e
  um eixo global — "inclinação em relação à vertical" é exatamente o que o B6.2.4.2 mede, e hoje só
  o checklist informa.

## 10. Plano de implementação (executado)

1. `model/planes.ts` puro + 16 testes (caixa de 1 m como fixture de ângulo exato).
2. Store: flags, seleção e as duas ações (`setDistance`, `setPlaneAngle`) com o espelho num helper.
3. `Planes.tsx` + toggle + aba do inspetor + `CommitField`.
4. App rodando: foi o que mostrou as duas correções de projeto — aplicar por tecla (virou Enter) e
   o giro que deixava a LDB para trás (virou `planeCarry`).
5. Promoção para `spec.md` (US-13/US-14) e atualização de `design.md` e `docs/arquitetura.html`.
