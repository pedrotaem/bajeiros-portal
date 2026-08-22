# Design técnico — Bajeiros · Validador de Gaiola B6

Companheiro de [spec.md](spec.md). Descreve como o sistema implementa os requisitos.

## 1. Stack e princípios

| Camada          | Escolha                                | Racional                                                         |
| --------------- | -------------------------------------- | ---------------------------------------------------------------- |
| Build/dev       | Vite 5 + TypeScript 5 (strict)         | iteração rápida, tipagem no motor de regras                      |
| UI              | React 18                               | componentização do painel                                        |
| 3D              | three.js via @react-three/fiber + drei | viewport declarativo, picking nativo                             |
| Estado          | zustand                                | store único, sem boilerplate                                     |
| Motor de regras | TypeScript puro, sem dependências      | roda 100% no browser; custo de infra zero; testável isoladamente |

Princípios:

- **Motor puro e síncrono:** `evaluate(cage) → RuleResult[]` é função pura. Validação em
  tempo real = recomputar tudo a cada mutação (custo desprezível na escala de ~40 membros).
- **Geometria = fonte de verdade.** Nenhum estado de validação é armazenado; tudo deriva do modelo.
- **Tolerância a modelo parcial:** toda regra guarda-se com `has(...nodeIds)` — o motor
  avalia gaiolas incompletas (requisito do assistente passo a passo).

## 2. Sistema de coordenadas e unidades

- Milímetros em todo o modelo; cena 3D converte por fator 0,001 (m).
- **+Y** para cima, **+Z** para a frente do veículo, **+X** lado direito do piloto.
- Plano dos membros LFS em y = 0.

## 3. Modelo de dados (`src/model/types.ts`)

```ts
Cage {
  nodes: Record<NodeId, Vec3>        // nós (juntas, dobras, extremidades)
  members: Member[]                   // tubos: { id, type, a, b }
  geraldao: Vec3                      // ponto do gabarito "Geraldão" (círculo R102 tangente assento/encosto)
  seatBottomY: number                 // base do assento (referência B6.2.12.6)
  primarySection / secondarySection: TubeSection  // { od, wall, carbon }
  namedExtra?: NodeId[]               // nós promovidos a "ponto denominado" pelo usuário
  anchors?: Anchor[]                  // ancoragens da suspensão (posição livre)
}
```

### 3.1 Tipos de membro (22)

Primários (B6.2.2.2): `RRH RHO FBM_UP FBM_LOW ALC BLC CLC DLC FLC LFS SHC`
Secundários (B6.2.2.3): `ILC RLC LDB LFDB USM ASB SIM FAB_UP FAB_MID FAB_LOW FREE`
`FREE` = tubo genérico/reforço — participa apenas das regras de seção e do suporte de ancoragens.

A classificação primário/secundário define qual `TubeSection` a regra de material aplica.

### 3.2 Pontos denominados

`isNamedIn(cage, id)` = id casa o padrão do regulamento (`A|B|C|D|F|H|I|S|O|P|R` + sufixo `L|R`)
**ou** consta em `namedExtra`. Consequência central: as regras de vão (B6.2.2.5.x) são
recomputadas quando o usuário promove um nó — sem código especial por regra.

### 3.3 Curvas

Não há entidade "curva". Uma dobra é um **nó intermediário não denominado de grau 2**.
O motor caminha o grafo entre pontos denominados (ver §5.2) somando comprimento e medindo
a deflexão em cada nó intermediário. Raio de curvatura não é modelado (item manual).

### 3.4 Ancoragens

`Anchor { id, axle: dianteira|traseira, side: L|R, role: sup1|sup2|inf1|inf2|amort, pos: Vec3 }`
— 20 fixas em identidade, livres em posição. Não referenciam tubos; o vínculo físico é
verificado por distância ponto-segmento contra todos os membros (SUSP.1, limiar 25 mm).

## 4. Módulos

```
src/
  model/types.ts       tipos, classificação primário/secundário, pontos denominados
  model/template.ts    gaiola exemplo completa (com 1 falha didática em B6.2.7.5)
  model/builder.ts     buildCage(params, upTo): geração paramétrica do assistente (§6)
  rules/geometry.ts    primitivas: dist, ângulo, plano (Newell), ponto-segmento, interpolações
  rules/b6.ts          evaluate(), removalImpact(), catálogo de regras (rules.md)
  store.ts             zustand: cage + seleção (nó/membro/ancoragem) + modo adicionar + wizard
  components/
    Viewport.tsx       cena 3D: tubos (cilindros), nós, ancoragens, Geraldão, cores de status
    RulePanel.tsx      checklist com badges e destaque de membros
    Inspector.tsx      edição (nó/membro/ancoragem), adicionar, seções, lista de ancoragens, JSON
    Wizard.tsx         assistente de 6 passos
  App.tsx              orquestra: evaluate + removalImpact via useMemo; faixa de status; abas
```

## 5. Motor de regras (`rules/b6.ts`)

### 5.1 Contrato

```ts
RuleResult {
  id: string          // ID do regulamento ("B6.2.4.2") ou interno ("SUSP.1")
  title: string       // paráfrase (nunca texto literal do regulamento)
  status: 'pass' | 'fail' | 'warn' | 'manual'
  measured?, limit?: string   // valor medido vs limite, exibidos no checklist
  members: string[]   // membros a destacar no 3D
  note?: string       // aproximações/tolerâncias adotadas pelo protótipo
  presence?: boolean  // true = falha por elemento ausente (o assistente exibe como "pendente")
}
evaluate(cage: Cage): RuleResult[]
removalImpact(cage, memberId, baseResults?): string[]  // regras que passam a falhar sem o membro
```

`warn` é usado quando a geometria foge do padrão mas há caminho regulamentar
(ex.: seção fora do padrão (A) exige cálculo de equivalência B6.3.3.2).

### 5.2 Algoritmo de vãos (B6.2.2.5.3/5.4)

1. Grafo de adjacência nó→membros.
2. De cada ponto denominado, caminha por cada membro incidente atravessando nós
   **não denominados de grau 2**, acumulando comprimento e a deflexão máxima
   (ângulo orientado entre segmentos consecutivos, 0° = colinear).
3. Para na chegada a ponto denominado, nó de grau ≠ 2 ou extremidade.
4. Deduplicação por conjunto de membros do caminho.
5. Veredito: deflexão < 3° ⇒ vão reto, limite 1016 mm; senão vão curvo, limite 838 mm
   **e** dobra ≤ 30°. Dobra sobre ponto denominado é permitida por construção
   (o ponto encerra o vão).

### 5.3 Análise de remoção

`removalImpact` reavalia a gaiola sem o membro e devolve os IDs que **passam** a falhar
(diferença contra o conjunto de falhas do estado atual). `App` calcula o mapa completo
(membro → IDs) por `useMemo`; a UI usa para o badge do membro e o destaque teal.
A honestidade da análise depende das regras de presença/continuidade (rules.md §1–2):
sem elas, remover um segmento do meio de uma cadeia pareceria inofensivo.

### 5.4 Amarração dianteira × traseira

Membros `FAB_*` são particionados por posição: atrás do plano do RRH (z < min(A.z, B.z)) ⇒
grupo traseiro; caso contrário ⇒ dianteiro. Cada grupo é validado pelo seu conjunto de
regras; B6.2.14.2 emite `pass` explícito informando o sistema detectado
("dianteiro presente — traseiro dispensado" etc.). Itens exclusivos do traseiro
(B6.2.9.5, B6.2.14.4.8) só entram no checklist quando o grupo traseiro existe.

## 6. Assistente (`model/builder.ts` + `Wizard.tsx`)

Geração **declarativa**: `buildCage(params, upTo)` reconstrói a gaiola inteira do zero a
cada edição de parâmetro — sem estado incremental, "Voltar" é trivial. Passos:

| Passo        | Gera                                                                                          | Parâmetros                                                 |
| ------------ | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 1 corta-fogo | A, B, S, H + RRH, ALC, BLC, SHC, LDB                                                          | larguras base/topo, altura, recuo Z, Geraldão, alturas S/H |
| 2 chão       | I, F + LFS, ILC, FLC, LFDB, USM                                                               | comprimento, z do ILC, largura frontal                     |
| 3 teto       | C + RHO, CLC                                                                                  | largura/altura/avanço de C                                 |
| 4 frente     | D + FBM_UP, FBM_LOW, SIM, DLC                                                                 | largura/altura/z de D                                      |
| 5 ancoragens | 20 âncoras (dianteiras interpoladas sobre tubos; traseiras nas linhas do futuro FAB — soltas) | —                                                          |
| 6 amarração  | traseira (R, FAB×6, RLC) e/ou dianteira (FU, P, Q, FAB×4)                                     | recuo/altura de R, tipo                                    |

A faixa de status usa `presence` para separar "infração real" de "pendente dos próximos
passos" enquanto o assistente está ativo. Cancelar restaura snapshot da gaiola anterior.

## 7. Interação 3D

- Cor base do tubo pela classe: primário `#b8c4d0` (aço claro), secundário `#5c6b7a`
  (aço escuro) — derivada de `PRIMARY_TYPES` (B6.2.2.2/B6.2.2.3). Sobre ela aplica-se o
  pior status entre as regras que o referenciam (`fail` vermelho > `warn` âmbar > classe);
  destaque de regra em azul; membro selecionado em roxo; redundante em teal (toggle).
  Legenda fixa no canto inferior esquerdo do viewport.
- Ancoragens: octaedro laranja (amortecedor rosa) + esfera invisível de raio 40 mm como
  alvo de clique; label só quando selecionada; seleção alternativa pela lista nomeada no painel.
- Modo "adicionar membro": clique captura nós (2) em vez de selecionar; nós ficam âmbar.
- **Arrastar para mover** (nós e ancoragens): no `pointerdown` cria-se um plano
  perpendicular à direção da câmera passando pelo ponto; `pointermove` intersecta o raio
  do ponteiro com esse plano (pointer capture no mesh) e aplica a posição arredondada a
  1 mm via `moveNode`/`moveAnchor` (espelhamento incluso). OrbitControls é desabilitado
  no início do gesto e reabilitado no `pointerup`. Limiar de ativação de 5 mm em cena
  separa clique de arrasto. O mapa de análise de remoção usa `useDeferredValue(cage)`
  para não recalcular ~40 avaliações por frame durante o gesto; o checklist principal
  (uma avaliação) permanece síncrono.

## 8. Evolução prevista

- **Ruleset versionado:** `evaluate` hoje implementa a Emenda 7; a assinatura prevista é
  `evaluate(cage, ruleset)` com os limites numéricos extraídos para tabela por emenda.
- **Persistência:** o JSON exportado é o contrato de dados; fase comunidade troca
  export manual por storage (Supabase) mantendo o mesmo shape.
- **Testes:** o motor puro aceita testes de unidade diretos (gaiola sintética → asserts
  por ID de regra); hoje a verificação é manual via browser (spec.md §4).
