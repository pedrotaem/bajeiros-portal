# Catálogo de regras do motor — Artigo B6 (RATBSB Emenda 7)

Fonte: `src/rules/b6.ts`. Cada linha = um `RuleResult` possível no checklist.
Colunas: **ID** (item do regulamento; `SUSP.*` = regra de modelagem do portal),
**Verificação** (o que o motor mede), **Limite**, **Obs** (tolerâncias/aproximações do protótipo).

Legenda de tipo: `auto` = geométrica automática · `presença` = falha quando elemento ausente
(no assistente aparece como "pendente") · `manual` = item de checklist não automatizável ·
`cond.` = só emitida em certas configurações.

## 1. Presença e integridade estrutural

| ID                    | Tipo     | Verificação                                                                           | Obs                                                                  |
| --------------------- | -------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| B6.2.4.1              | presença | Montantes do RRH existem (nos dois lados)                                             | tipos pareados exigem L e R                                          |
| B6.2.4.7a / B6.2.4.7b | presença | Travessas ALC / BLC existem                                                           |                                                                      |
| B6.2.7.1              | presença | Membros RHO existem (L e R)                                                           |                                                                      |
| B6.2.7.3              | presença | Travessa CLC existe                                                                   |                                                                      |
| B6.2.8.1              | presença | Membros LFS existem (L e R)                                                           |                                                                      |
| B6.2.8.2              | presença | Travessa FLC existe                                                                   |                                                                      |
| B6.2.8.4              | presença | Travessa ILC existe                                                                   | medição fina em §5                                                   |
| B6.2.9.1              | presença | Diagonal LFDB existe                                                                  |                                                                      |
| B6.2.12.1             | presença | Side Impact Members existem (L e R)                                                   |                                                                      |
| B6.2.12.2             | presença | Travessa DLC existe                                                                   |                                                                      |
| B6.2.13.2 / B6.2.13.3 | presença | FBM superiores / inferiores existem (L e R)                                           |                                                                      |
| B6.2.4.5              | auto     | Cadeias RRH (A→B), LFS (A→F) e SIM (S→D) contínuas, por lado, sem lacuna de cobertura | tolerância de lacuna 1 mm; base da honestidade da análise de remoção |
| B6.2.2.4              | auto     | Todo ponto denominado apoiado em ≥ 1 tubo (nenhum solto)                              | inclui pontos promovidos pelo usuário                                |

## 2. Vãos e curvas (entre pontos denominados)

| ID         | Tipo | Verificação                                                                                                | Limite           | Obs                                                                                                                  |
| ---------- | ---- | ---------------------------------------------------------------------------------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------- |
| B6.2.2.5.3 | auto | Comprimento de vão **reto** entre pontos denominados (caminhada em grafo por nós intermediários de grau 2) | ≤ 1016 mm        | "reto" = deflexão máx < 3°                                                                                           |
| B6.2.2.5.4 | auto | Vão **com curva**: comprimento e dobra máxima fora de ponto denominado                                     | ≤ 838 mm e ≤ 30° | curva = linha de centro com nó de dobra; raio ≥ 152 mm fica em §7 (manual); dobra sobre ponto denominado é permitida |

## 3. Corta-fogo (RRH) e seu plano

| ID       | Tipo          | Verificação                                                                                                 | Limite                                         | Obs                                                                              |
| -------- | ------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------- |
| B6.2.4.2 | auto          | Inclinação do plano do RRH vs vertical                                                                      | ≤ 20°                                          | normal por Newell no quadrilátero A-A-B-B                                        |
| B6.2.4.3 | auto          | Largura do RRH medida a 686 mm acima do ponto do Geraldão (interseção dos montantes com o plano horizontal) | ≥ 737 mm                                       | falha também se os montantes não alcançam a altura de medição                    |
| B6.2.4.8 | auto          | Extensão do ALC além dos pontos A                                                                           | ≤ 25 mm                                        |                                                                                  |
| B6.2.4.9 | auto          | Coplanaridade de ALC, BLC, montantes RRH, LDB e SHC                                                         | desvio ≤ 10 mm                                 | regulamento não fixa tolerância; 10 mm é adoção do protótipo (note no resultado) |
| B6.2.5.1 | auto+presença | LDB existe e suas extremidades apoiam nos montantes do RRH                                                  | dist. ponto-segmento ≤ 30 mm                   |                                                                                  |
| B6.2.5.2 | auto          | Distância vertical das extremidades do LDB aos pontos A e B                                                 | ≤ 127 mm                                       |                                                                                  |
| B6.2.5.3 | auto          | Ângulo entre LDB e montantes do RRH                                                                         | ≥ 20°                                          |                                                                                  |
| B6.2.6.1 | auto+presença | SHC existe, horizontal, contínuo entre os montantes                                                         | Δy ≤ 10 mm; extremidades ≤ 30 mm dos montantes |                                                                                  |

## 4. Teto, frente e assoalho

| ID         | Tipo          | Verificação                                                                  | Limite                    | Obs                                                                                   |
| ---------- | ------------- | ---------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------- |
| B6.2.7.4   | auto          | Avanço dos pontos C à frente do ponto traseiro do assento                    | ≥ 305 mm                  | aproximação: Δz C→Geraldão (regulamento mede da interseção RHO × vertical do assento) |
| B6.2.7.5   | auto          | Altura dos pontos C acima do ponto traseiro do assento                       | ≥ 1041 mm                 |                                                                                       |
| B6.2.9.2/3 | auto          | Extremidades do LFDB próximas aos pontos A e I                               | ≤ 51 mm                   |                                                                                       |
| B6.2.10.3  | auto+presença | USM/ASB passa diretamente abaixo do ponto do Geraldão                        | tolerância 51 mm à frente | verificação por cobertura do intervalo z do membro                                    |
| B6.2.12.4  | auto          | Distância transversal entre SIMs não decrescente de D (frente) para S (trás) | monotônica                | amostragem em 11 estações z; tolerância 1 mm                                          |
| B6.2.12.6  | auto          | Altura de todos os pontos dos SIM acima da base do assento                   | 203–356 mm                |                                                                                       |
| B6.2.13.5  | auto          | Ângulo do FBM superior vs vertical                                           | ≤ 45°                     |                                                                                       |

## 5. Amarração Fore-Aft (B6.2.14) e suspensão

| ID          | Tipo                         | Verificação                                                                                                 | Limite                                 | Obs                                                                                                              |
| ----------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| B6.2.14.2   | auto+presença                | **Ao menos um** sistema: dianteiro OU traseiro (um dispensa o outro; ambos aceito)                          | ≥ 1 sistema                            | `pass` explícito informa o sistema detectado; partição por z vs plano do RRH                                     |
| B6.2.14.4.6 | auto · cond. traseiro        | FAB superior, intermediário e inferior presentes **em cada lado**                                           | 3 níveis × 2 lados                     |                                                                                                                  |
| B6.2.14.4.2 | auto · cond. traseiro        | Comprimento dos membros do travamento traseiro                                                              | ≤ 813 mm                               |                                                                                                                  |
| B6.2.14.4.7 | auto · cond. traseiro        | Junções do travamento aos pontos B, S e A                                                                   | ≤ 51 mm                                | extremidade mais próxima do RRH                                                                                  |
| B6.2.14.4.3 | auto · cond. traseiro        | Ângulo mínimo entre membros dos triângulos que compartilham nó                                              | ≥ 25°                                  |                                                                                                                  |
| B6.2.14.4.9 | auto · cond. traseiro        | RLC presente unindo os dois lados                                                                           | ≤ 381 mm                               | aproximação: distância aos vértices R (regulamento: ponto médio do percurso B→R→A)                               |
| B6.2.14.3.1 | auto · cond. dianteiro       | Junção do FAB dianteiro no FBM superior próxima ao ponto C (vertical)                                       | ≤ 127 mm                               |                                                                                                                  |
| B6.2.14.3.3 | auto · cond. dianteiro       | Ângulo entre FAB dianteiro e FBM superior                                                                   | ≥ 30°                                  |                                                                                                                  |
| B6.2.14.3.2 | auto · cond. dianteiro       | Cada ponto P (extremidade inferior do FAB_UP) suportado por membro descendo ao LFS                          | junção ≤ 51 mm; chegada ≤ 30 mm do LFS |                                                                                                                  |
| SUSP.1      | auto (portal)                | Cada uma das 20 ancoragens da suspensão apoiada em algum tubo                                               | ≤ 25 mm do eixo                        | regra de modelagem do portal, não do regulamento; lista as ancoragens sem suporte                                |
| STEER.1     | auto (portal) · cond. (DF-5) | Ancoragem(ns) do suporte do volante (central ou mesa L/R) apoiada em algum tubo                             | ≤ 25 mm do eixo                        | só emitida quando `Cage.steering` existe (opt-in); fixação da direção não tem item B6 (B11.5 fica com os juízes) |
| B6.2.8.4    | auto                         | ILC próximo à ancoragem **traseira** das bandejas **inferiores dianteiras** (medição real, centro a centro) | ≤ 51 mm                                | usa a ancoragem `dianteira · inf1` de cada lado                                                                  |

## 6. Materiais (seção dos tubos)

| ID       | Tipo                  | Verificação                                                                                                                                                           | Limite                                      | Obs                                                                                                      |
| -------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| B6.3.3.1 | auto                  | Seção dos membros primários (%C deriva do material selecionado — DF-1)                                                                                                | Ø ≥ 25,4 mm, parede ≥ 3,05 mm, C ≥ 0,18%    | seção fora do padrão com parede ≥ 1,57 mm aprova/reprova pela equivalência B6.3.3.2 (automática)         |
| B6.3.3.2 | auto · cond.          | Equivalência de rigidez `E·I` e resistência à flexão `Sy·I/c` da combinação material+seção vs tubo de referência (SAE 1018, Ø 25,4 × 3,05; E = 205 GPa, Sy = 370 MPa) | ≥ referência em ambos                       | emitida só quando a seção primária foge do padrão com parede ≥ 1,57 mm; `I = π/64·(od⁴−id⁴)`, `c = od/2` |
| B6.3.4.1 | auto                  | Seção dos membros secundários (%C deriva do material — DF-1)                                                                                                          | dim. ≥ 25,4 mm, parede ≥ 0,89 mm, C ≥ 0,18% |                                                                                                          |
| MAT.1    | auto (portal) · cond. | Material customizado com propriedades fora de faixas plausíveis p/ aço (E 180–220 GPa, Sy 180–1200 MPa, ρ 7500–8100 kg/m³, C 0,03–1,5%)                               | `warn`                                      | regra de modelagem do portal; catálogo em `model/materials.ts`                                           |

| JOINT.X | auto (portal) · cond. (DF-7) | Tubos que se cruzam sem nó de junta (menor distância entre eixos < soma dos raios, longe de extremidades) | `warn` + distância | cruzamentos reais exigem interrupção (LFDB × USM, B6.2.9.4) ou travessia declarada (SHC × LDB, B6.2.6.2); criar nó ou afastar |
| B6.3.1 | manual · cond. (DF-6) | Emendas de topo detectadas: par de membros quase colineares (deflexão < 5°) num nó **sem** passagem contínua declarada; exige luva interna 2×Ø p/ cada lado, espessura ≥ tubos, ≥ 102 mm lineares de solda (B6.3.1.2–.5) | — | detecção automática; verificação da luva é manual; se for peça única, declarar continuidade remove o item |

## 7. Checklist manual (não automatizável)

| ID          | Item                                                                               | Condição                                                             |
| ----------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| B6.1.3      | Folga do capacete ≥ 152 mm até retas entre membros do habitáculo (com piloto real) | sempre                                                               |
| B6.1.4      | Folga do corpo ≥ 76 mm (ombros, tronco, quadril, coxas, joelhos, braços, mãos)     | sempre                                                               |
| B6.2.4.5    | Montantes do RRH são tubos contínuos, sem emendas soldadas                         | sempre (a continuidade _geométrica_ é automática; a metalúrgica não) |
| B6.2.7.2    | RHO + FBM superior de cada lado em tubo único contínuo com curva no ponto C        | sempre                                                               |
| B6.2.9.5    | Com travamento traseiro, LFDB restrito à alternativa (c) da Figura B-25            | só com FAB traseiro                                                  |
| B6.2.14.4.8 | FAB superior traseiro se estende além de todos os componentes do motor             | só com FAB traseiro                                                  |
| B6.3.2      | Amostras de soldagem (ensaio destrutivo + inspeção de penetração) documentadas     | sempre                                                               |
| B6.3.5      | Ficha de Especificação da Gaiola completa, assinada, com notas fiscais/laudos      | sempre                                                               |
| —           | Raio de curvatura de tubos dobrados ≥ 152 mm (B6.2.2.5.5)                          | nota no resultado de B6.2.2.5.4                                      |

## 8. Itens do B6 conhecidos e ainda não cobertos

- B6.2.2.5.6 — suporte adicional obrigatório para vãos acima do limite (hoje o vão apenas falha; o motor não verifica se o suporte adicionado satisfaz o item)
- B6.2.4.4 — definição formal do início/fim dos montantes nos planos superior/inferior
- B6.2.12.5 — SIM com projeção côncava (largura no meio do arco ≥ metade da distância S-S)
- B6.2.12.7/B6.2.12.8 — projetos com "bico" e plano dos pés (F-D)
- B6.2.14.3.4 — ângulos entre FAB_UP e FAB_LOW dianteiros (≤ 15°; dois FAB_LOW ≤ 90°)
- B6.2.15 — Elevated Seat Support (veículos 4x4)
- B6.3.1 / B6.3.7 / B6.3.8 — luvas de reforço, gaiolas parafusadas, membros furados (construtivo)
- B6.3.9 — furos de inspeção
