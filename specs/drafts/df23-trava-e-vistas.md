# DF-23 — Travar elemento no espaço e vistas canônicas da câmera

- **Status:** ✅ **IMPLEMENTADA** (2026-08-31) — promovida a US-15/US-16 em [spec.md](../spec.md).
  - `Cage.locked?: string[]` (nós, ancoragens e pontos do volante), respeitado por todas as
    ações que movem: arrasto, campo numérico, cota (DF-22), giro de plano (DF-22) e espelho.
  - Quatro botões de vista na barra do viewport (Lateral · Frontal · Topo · Iso) que também
    **enquadram** a gaiola.
- **Ordem de desenvolvimento:** 9ª do lote do validador (depois do DF-22)
- **Dependências:** DF-22 (a cota e o giro são dois dos caminhos que a trava precisa fechar)
- **Documentos:** [índice de drafts](../draft-features.md) · [spec.md](../spec.md) · [design.md](../design.md)

## 1. Contexto e motivação

**A trava.** A edição da gaiola é toda por deslocamento — arrasto, coordenada, cota, giro de
plano. Nada disso distingue o que ainda está em estudo do que já foi decidido: as ancoragens
que a dinâmica fechou, o ponto do banco que a ergonomia travou, a bitola que o pessoal de
suspensão entregou. Hoje qualquer um desses some com um arrasto errado, e o único aviso é o
checklist mudando de cor depois. Pior no DF-22: um giro de plano move oito pontos de uma vez.

**As vistas.** Medir se dois tubos estão alinhados, se o corta-fogo está aprumado ou se a
frente está simétrica exige olhar de um ângulo canônico. Hoje isso é obtido arrastando a
câmera até "quase" — e "quase" é justamente onde o erro de projeto se esconde.

## 2. Objetivos e não-objetivos

**Objetivos**

- Marcar elementos como travados; nenhuma ação de edição os move.
- Deixar a trava visível no 3D e no painel, e explicar o bloqueio **antes** da tentativa.
- Quatro vistas canônicas em um clique, com enquadramento automático.

**Não-objetivos**

- Travar tipo de membro, seção, continuidade ou qualquer atributo não posicional. Trava é
  sobre **posição no espaço** — o nome do botão diz isso.
- Permissão / bloqueio por pessoa. Não é controle de acesso; é uma decisão de projeto que
  qualquer um com o arquivo pode desfazer.
- Câmera ortográfica ou vistas de corte. As quatro vistas continuam em perspectiva.

## 3. Histórias de usuário

- **US-DF23.a** Como projetista, quero travar as ancoragens que a dinâmica já fechou para
  mexer na gaiola sem risco de arrastá-las junto.
- **US-DF23.b** Como projetista, quero que o portal me diga por que um giro não aconteceu, em
  vez de mover metade da gaiola ou não fazer nada em silêncio.
- **US-DF23.c** Como projetista, quero ver a gaiola de lado, de frente e de cima em um clique
  para julgar prumo e simetria.

## 4. Requisitos funcionais

### 4.1 Trava

- **FR-DF23.1** `Cage.locked?: string[]` guarda ids de **nós, ancoragens e pontos do volante** —
  os três tipos com posição própria. É **decisão de projeto**: vai para o JSON exportado, como
  `namedExtra` e `manikin`, e não é estado de UI.
- **FR-DF23.2** Travado bloqueia: arrasto no 3D (o gesto nem começa, e a órbita da câmera não é
  suspensa), campos X/Y/Z (desabilitados), cota (US-13), giro de plano (US-14) e exclusão do nó.
- **FR-DF23.3** **Espelho é parcial:** mover um lado com o gêmeo L/R travado move só o lado
  livre. Recusar o movimento inteiro seria pior — travar a direita porque ela já está decidida
  não pode impedir de mexer na esquerda.
- **FR-DF23.4** **Giro de plano é recusado inteiro** se qualquer ponto que viajaria estiver
  travado: girar é corpo rígido, e deixar um ponto para trás deformaria o plano em vez de
  inclinar. A cota também é recusada quando o ponto escolhido para mover está travado — deslocar
  o outro "para ajudar" entregaria uma edição que ninguém pediu.
- **FR-DF23.5** **Marca no 3D:** gaiola de arame em volta do elemento travado. Distinção por
  **forma**, não por cor: o canal de cor da cena já carrega status (infração, atenção,
  redundância) e identidade (primário/secundário) — ver a dívida de daltonismo em `tokens.test.ts`.
- **FR-DF23.6** A tela **avisa antes**: o campo de cota e o de ângulo aparecem desabilitados com
  a razão ("giro bloqueado: HL travado"), e o painel do membro oferece "travar as duas pontas".
- **FR-DF23.7** **Sem trava fantasma:** importar JSON descarta ids que não existem na gaiola;
  trocar o modo do volante (SW ↔ SWL/SWR) e remover a ancoragem do volante limpam as travas dos
  ids que deixaram de existir.

### 4.2 Vistas

- **FR-DF23.8** Quatro botões na barra do viewport, separados dos alternadores de cena:
  **Lateral** (câmera em −X, nariz à direita), **Frontal** (em +Z), **Topo** (acima, frente para
  cima) e **Iso**.
- **FR-DF23.9** O botão **enquadra**: a distância sai da caixa que envolve nós, Geraldão,
  ancoragens e volante, projetada nos dois meio-ângulos do tronco de visão. Enquadrar pela esfera
  envolvente seria uma linha a menos e desperdiçaria meia tela — a gaiola é comprida e baixa, e
  vista de lado a esfera tem o diâmetro da diagonal.
- **FR-DF23.10** `up` fica **sempre em +Y**, inclusive no Topo (que usa uma direção com ε em −Z
  para não ficar paralela ao `up`). Trocar o `up` viraria o eixo de órbita do OrbitControls
  debaixo da mão de quem arrasta em seguida.
- **FR-DF23.11** São **ações, não estados**: nenhum botão fica "ativo", porque depois do primeiro
  arrasto de câmera a vista já não é mais aquela. Clicar de novo no mesmo botão reenquadra — é o
  que serve depois de recolher um painel ou crescer a gaiola.
- **FR-DF23.12** O enquadramento espera **um quadro** (`requestAnimationFrame`): recolher uma
  lateral muda o tamanho do canvas e o `camera.aspect` só é atualizado no frame seguinte; medir
  antes disso usaria a largura antiga.

## 5. Modelo de dados

```ts
// Cage (packages/core/src/model/types.ts)
locked?: string[] // ids de nós, ancoragens e pontos do volante

isLocked(cage, id): boolean
sanitizeLocked(cage): string[] // ids travados que ainda existem
```

```ts
// store.ts — estado de UI
cameraView: { view: 'lateral' | 'frontal' | 'superior' | 'iso'; seq: number } | null
// `seq` incrementa a cada clique: é o que faz o MESMO botão reenquadrar
```

Contrato `cage-snapshot` **não muda**: `cage_json` é `jsonb` opaco, descrito como "formato de
export atual do editor".

## 6. Módulos afetados

| Módulo                     | Mudança                                                                           |
| -------------------------- | --------------------------------------------------------------------------------- |
| `model/types.ts`           | `Cage.locked`, `isLocked`, `sanitizeLocked`                                       |
| `store.ts`                 | `toggleLock`, `setLocked`, `cameraView`/`setCameraView`; guarda de trava em       |
|                            | `moveNode`, `moveAnchor`, `moveSteeringPoint`, `setDistance`, `setPlaneAngle`,    |
|                            | `deleteNode`; `withMirror` passa a receber a gaiola e pular gêmeo travado         |
| `components/Viewport.tsx`  | `LockMark`, guarda no início do arrasto, `CameraRig` + `cageBounds`/`fitDistance` |
| `components/Inspector.tsx` | `LockField`, `disabled` em `NumField`/`CommitField`, aviso de bloqueio na cota e  |
|                            | no ângulo, "travar as duas pontas" no membro                                      |
| `App.tsx` · `styles.css`   | grupo de botões de vista + separador (por token)                                  |

## 7. UI/UX

- Caixa "travar posição no espaço" no nó, na ancoragem e no ponto do volante; no membro, "travar
  as duas pontas no espaço" (marcada quando as duas já estão).
- Campo bloqueado nunca fica mudo: a linha embaixo diz quem está travado e o que fazer
  ("🔒 SML travado — escolha outro lado ou destrave").
- Barra do viewport: `Geraldão · Piloto · Planos · Redundância │ Lateral · Frontal · Topo · Iso`.

## 8. Critérios de aceite

| #         | Critério                                                                                               | Verificação      |
| --------- | ------------------------------------------------------------------------------------------------------ | ---------------- |
| AC-DF23.1 | Nó travado não se move por campo nem por arrasto; destravar devolve o movimento                        | vitest ✔         |
| AC-DF23.2 | Gêmeo travado não acompanha o espelho — o lado livre continua livre                                    | vitest ✔         |
| AC-DF23.3 | Cota é recusada quando o ponto escolhido está travado, e aceita quando se escolhe o outro lado         | vitest ✔         |
| AC-DF23.4 | Giro de plano é recusado inteiro se um ponto que viajaria está travado (nenhum nó se move)             | vitest ✔         |
| AC-DF23.5 | Ancoragem e ponto do volante travados não se movem                                                     | vitest ✔         |
| AC-DF23.6 | A trava vai para o JSON; ids fantasmas caem na importação e ao trocar o modo do volante                | vitest ✔         |
| AC-DF23.7 | Travar mostra a gaiola de arame no 3D e desabilita X/Y/Z do elemento                                   | manual/browser ✔ |
| AC-DF23.8 | Os quatro botões põem a câmera na vista certa e enquadram a gaiola inteira, com o painel aberto ou não | manual/browser ✔ |

## 9. Riscos e questões em aberto

- **A trava não protege de exclusão de membro.** Excluir um tubo ligado a nós travados é
  permitido: a trava é sobre posição, e os nós continuam onde estão. Se aparecer o pedido de
  "congelar a topologia" também, é outra feature.
- **Nó travado ainda pode ser promovido a ponto denominado** (`namedExtra`) e entrar/sair de
  planos — atributo não posicional, deliberadamente fora do escopo (§2).
- **A vista não é ortográfica.** Para julgar prumo e simetria com rigor, a perspectiva ainda
  distorce; a câmera ortográfica é a evolução óbvia e cabe no mesmo `CameraRig`.
- **O assistente (US-5) reconstrói a gaiola e perde as travas** — é gaiola nova, e o
  `buildCage` não devolve `locked`. Consistente, mas vale lembrar antes de mandar um projeto
  travado para o assistente.

## 10. Plano de implementação (executado)

1. `Cage.locked` + `isLocked`/`sanitizeLocked` no core.
2. Guarda nas cinco ações do store que movem, com o espelho parcial num lugar só (`withMirror`).
3. `LockMark`, `LockField`, `disabled` nos campos e os avisos de bloqueio.
4. `CameraRig` + botões; o app rodando pegou as duas correções de enquadramento (esfera →
   caixa projetada, e o quadro de espera pelo `aspect`).
5. Testes de store (10) e promoção para `spec.md` (US-15/US-16).
