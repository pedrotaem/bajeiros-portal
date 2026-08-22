# Especificação — Bajeiros · Validador de Gaiola B6

- **Feature:** Validador visual e dinâmico de gaiola de proteção contra o Artigo B6 do RATBSB (Regulamento Baja SAE Brasil), Emenda 7
- **Status:** MVP implementado (protótipo local)
- **Referência normativa:** `RATBSB_emenda_07.pdf`, Artigo B6 "Gaiola de Proteção" (pág. 33–53)
- **Documentos irmãos:** [design.md](design.md) (arquitetura), [rules.md](rules.md) (catálogo de regras do motor), [draft-features.md](draft-features.md) (specs em draft — backlog detalhado)

---

## 1. Visão e propósito

Portal da comunidade Bajeiros. O produto piloto permite que um estudante de equipe Baja
modele a gaiola de proteção do veículo em 3D e receba, em tempo real, o veredito de
conformidade de cada requisito geométrico do Artigo B6 — antes de cortar o primeiro tubo
e antes da Inspeção de Conformidade Técnica e Segurança oficial.

**Não-objetivo:** substituir a inspeção oficial ou o julgamento dos Juízes Credenciados de
Segurança (B6.4). O disclaimer é permanente na interface.

**Restrição de marca:** nenhum uso do nome ou identidade "SAE"; o regulamento é
referenciado por ID de item (ex.: "B6.2.4.2") com texto parafraseado, nunca reproduzido.

## 2. Personas

| Persona                          | Necessidade                                                           |
| -------------------------------- | --------------------------------------------------------------------- |
| Projetista de chassi (estudante) | Modelar/validar a gaiola cedo, iterar geometria sem retrabalho de CAD |
| Capitão de equipe                | Visão rápida de conformidade (quantas regras OK / o que falta)        |
| Equipe nova (primeiro Baja)      | Construção guiada do zero com valores que já nascem conformes         |

## 3. Histórias de usuário e requisitos funcionais

### US-1 — Validação em tempo real

Como projetista, quero editar a geometria e ver imediatamente quais regras B6 passam ou falham.

- **FR-1.1** Toda alteração de geometria reavalia todas as regras de forma síncrona (sem botão "validar").
- **FR-1.2** Cada resultado exibe: ID do regulamento, título parafraseado, status (`OK` / `FALHA` / `ATENÇÃO` / `MANUAL`), valor medido e limite.
- **FR-1.3** Tubos que infringem regra ficam vermelhos no 3D; clicar numa regra destaca em azul os membros envolvidos.
- **FR-1.4** Faixa de status permanente no topo da barra lateral (verde sem infrações, vermelha com contagem); clique abre o checklist.
- **FR-1.5** Regras não verificáveis geometricamente aparecem como checklist `MANUAL` (nunca ocultas).
- **FR-1.6** Tubos primários (B6.2.2.2) e secundários (B6.2.2.3) têm cores distintas no 3D (aço claro vs aço escuro), com legenda permanente no viewport; cores de status (infração/atenção/destaque/seleção/redundante) prevalecem sobre a cor de classe.

### US-2 — Edição da gaiola

Como projetista, quero montar e alterar livremente a estrutura.

- **FR-2.1** Selecionar nó / tubo / ancoragem clicando no 3D; editar coordenadas (mm) em painel.
- **FR-2.2** Espelhamento L/R opcional: mover um elemento de sufixo `L`/`R` move o simétrico (x → −x).
- **FR-2.3** Adicionar membro: escolher tipo (22 tipos, ver design.md) e clicar em 2 nós; adicionar nó livre; excluir membro; excluir nó sem uso; trocar o tipo de um membro existente.
- **FR-2.4** Curvas: "+ Nó no tubo" divide o membro no ponto médio criando nó intermediário; movê-lo cria a dobra. O painel exibe o ângulo de dobra no nó.
- **FR-2.5** Pontos denominados: qualquer nó pode ser marcado/desmarcado como ponto denominado; ids padrão do regulamento (`AL`, `BR`, `CL`…) são denominados automaticamente. A marcação altera o resultado das regras de vão (B6.2.2.5.x) — o sistema identifica o efeito sozinho.
- **FR-2.6** Configuração global: ponto do Geraldão (Y/Z), base do assento (Y), seção do tubo primário e secundário (Ø, parede, material).
- **FR-2.7** Exportar/importar o projeto completo como JSON.
- **FR-2.8** Arrastar para mover: nós (denominados ou livres) e ancoragens podem ser reposicionados arrastando diretamente no 3D. O arrasto ocorre no plano paralelo à câmera que passa pelo ponto; a rotação de câmera (OrbitControls) fica suspensa durante o gesto; um limiar de 5 mm distingue clique (selecionar) de arrasto (mover); posições são arredondadas a 1 mm; o espelhamento L/R (FR-2.2) se aplica; as regras revalidam durante o arrasto. O painel numérico permanece como via de precisão.

### US-3 — Análise de redundância

Como projetista, quero saber se um tubo pode ser removido sem infringir regra (redução de massa).

- **FR-3.1** Para cada membro, o sistema simula a remoção total e reporta as regras que passariam a falhar.
- **FR-3.2** Membro selecionado exibe o veredito: "remoção não infringe nenhuma regra automática" (candidato a remoção) ou a lista de IDs infringidos.
- **FR-3.3** Toggle "destacar membros cuja remoção não infringe regras" pinta esses membros em teal no 3D.
- **FR-3.4** O aviso de que juízes podem exigir reforços (B6.4.1.2) acompanha o veredito positivo.

### US-4 — Ancoragens da suspensão

Como projetista, primeiro defino os pontos de ancoragem onde a dinâmica manda; depois verifico se a gaiola os suporta.

- **FR-4.1** 20 ancoragens fixas em identidade, livres em posição: {dianteira, traseira} × {L, R} × {bandeja superior ×2, bandeja inferior ×2, amortecedor}.
- **FR-4.2** Ancoragens **não** são presas a tubos: posição XYZ é independente e editável (clique no 3D — alvo ampliado — ou pela lista nomeada no painel), com espelhamento L/R.
- **FR-4.3** Cada ancoragem exibe o suporte físico: distância ao eixo do tubo mais próximo; ≤ 25 mm = apoiada; acima = "sem suporte — ajuste a gaiola ou adicione tubo/reforço".
- **FR-4.4** Regra agregada SUSP.1 lista todas as ancoragens sem suporte; B6.2.8.4 usa a ancoragem traseira das bandejas inferiores dianteiras como referência real do ILC.
- **FR-4.5** Remover um tubo que sustenta ancoragem aparece na análise de remoção (US-3) como infração de SUSP.1.

### US-5 — Criação guiada do zero

Como equipe nova, quero construir uma gaiola completa passo a passo com defaults conformes.

- **FR-5.1** Assistente em 6 passos, nesta ordem: ① corta-fogo (plano do RRH) → ② chão (LFS) → ③ teto (RHO) → ④ união frontal (FBM + SIM) → ⑤ ancoragens da suspensão (soltas) → ⑥ amarração Fore-Aft (traseira / dianteira / ambas).
- **FR-5.2** Cada passo é paramétrico (dimensões em mm) com preview 3D imediato e guia textual citando as regras B6 aplicáveis.
- **FR-5.3** Os defaults produzem gaiola 100% conforme ao concluir (zero infrações automáticas).
- **FR-5.4** Durante o assistente, a faixa de status separa "infrações reais" de "pendências dos próximos passos" (elementos ainda não construídos).
- **FR-5.5** "Cancelar" restaura a gaiola anterior ao assistente; "Concluir" entrega a gaiola no editor para ajuste fino.
- **FR-5.6** No passo ⑥, amarração dianteira e traseira são alternativas equivalentes (B6.2.14.2: "ao menos um de dois"); ambas simultâneas também é aceito e validado.

### US-6 — Material dos tubos (DF-1, implementada)

Como projetista, quero escolher o aço dos tubos primários e secundários para que as regras de seção usem propriedades reais (E, Sy, ρ, %C).

- **FR-6.1** Catálogo embutido: SAE 1010, 1018, 1020, 1026, 4130 (`model/materials.ts`), com %C, E [GPa], Sy [MPa] e densidade [kg/m³]; seleção independente por classe no painel de configuração (junto de FR-2.6), com chip somente-leitura das propriedades.
- **FR-6.2** Material "customizado" com propriedades manuais; valores fora de faixas plausíveis para aço geram `warn` (regra de portal `MAT.1`).
- **FR-6.3** O %C das regras B6.3.3.1/B6.3.4.1 deriva do material selecionado (sem campo manual).
- **FR-6.4** Equivalência B6.3.3.2 automática: quando a seção primária foge do padrão (parede ≥ 1,57 mm), `E·I` e `Sy·I/c` são comparados ao tubo de referência (SAE 1018, Ø 25,4 × 3,05) com `pass`/`fail` e valores exibidos; B6.3.3.1 aprova via equivalência quando aplicável.
- **FR-6.5** Import JSON migra projetos antigos: %C que casa o catálogo vira o aço correspondente; senão, material customizado preservando o %C (default 1018 na ausência de tudo).

### US-7 — Estimativa de massa (DF-2 v1, implementada)

Como projetista, quero ver a massa estimada da gaiola em tempo real para equilibrar rigidez × massa.

- **FR-7.1** Massa por membro = comprimento × área da seção × densidade do material da classe (`model/mass.ts`, função pura `estimateMass`); exibida no painel do membro selecionado.
- **FR-7.2** Junta soldada (v1): nó com grau g ≥ 2 conta (g − 1) juntas; acréscimo por junta parametrizável (default 30 g, campo no painel de configuração; persiste no JSON via `Cage.weightParams`).
- **FR-7.3** Bloco permanente "Massa estimada" sob a faixa de status: total [kg], breakdown primário/secundário/solda e nº de juntas, atualização síncrona, com aviso "estimativa geométrica — não substitui pesagem".
- **FR-7.4** Análise de redundância inclui a economia de massa da remoção (tubo + juntas desfeitas, `removalMassDelta`).
- **FR-7.5** (v2, aguarda DF-6/DF-7) nós de passagem contínua não contam junta; massa de solda por mm de cordão (`weightParams.weldPerMmG` já reservado).

### US-8 — Geraldão no cockpit (DF-3, implementada)

Como projetista, quero ver o gabarito Geraldão dentro da gaiola para julgar o habitáculo visualmente.

- **FR-8.1** Malha própria do gabarito (`components/Geraldao.tsx`), derivada das medidas que o regulamento verifica com ele: círculo R102 tangente assento/encosto, travessa de 737 mm a 686 mm (B6.2.4.3), mastro até 1041 mm com braço de 305 mm (B6.2.7.4/7.5); parametrizada pelo ponto do Geraldão da configuração global.
- **FR-8.2** Toggle "Geraldão" na barra do viewport (junto do toggle "Redundância"); estado de UI, fora do JSON do projeto.
- **FR-8.3** Renderização translúcida (opacidade 0,35, cinza-azulado) com `raycast` desabilitado — nunca captura cliques nem interfere na seleção/arrasto.
- **FR-8.4** O gabarito acompanha em tempo real o ponto do Geraldão; nenhum `RuleResult` depende da visibilidade.

### US-9 — Continuidade de tubos (DF-6, implementada)

Como projetista, quero declarar quais membros formam um tubo físico único através de um nó, para que juntas, massa e futuras verificações de emenda reflitam a fabricação real.

- **FR-9.1** `Cage.continuity: {node, pair}[]` — passagem contínua declarada por nó; cada membro participa de no máximo uma passagem por extremidade; consultas puras em `model/continuity.ts` (`isContinuousAt`, `continuityPartner`, `physicalChains`, `chainOf`).
- **FR-9.2** Defaults: "+ Nó no tubo" cria a passagem automaticamente (e migra declarações das pontas); template/assistente declaram as passagens óbvias via `inferContinuity` (2 membros do mesmo tipo num nó; RHO+FBM_UP no ponto C, B6.2.7.2); tipos diferentes nascem descontínuos.
- **FR-9.3** Painel do nó: seção "Continuidade" com passagens existentes (desfazer) e pareamento por 2 seletores; extremidade já usada é bloqueada com explicação. Painel do membro mostra "parte de tubo físico contínuo: N segmentos, X mm"; a cadeia inteira é destacada em roxo claro no 3D.
- **FR-9.4** Consistência: excluir membro remove declarações; import JSON saneia (`sanitizeContinuity`); projetos antigos importam tudo descontínuo (conservador, documentado).
- **FR-9.5** Regra B6.3.1 (checklist `manual`, condicional): pares quase colineares (< 5°) sem passagem declarada são emendas de topo detectadas — exige luva interna (2×Ø p/ lado, ≥ 102 mm de solda, B6.3.1.2–.5).
- **FR-9.6** DF-2 v2 (parte 1): nó com passagem contínua desconta 1 junta soldada na estimativa de massa.

### US-10 — Juntas e boca de lobo (DF-7, implementada)

Como projetista, quero ver as juntas da gaiola caracterizadas e baixar o gabarito de corte de cada boca de lobo em escala 1:1.

- **FR-10.1** `model/joints.ts` (puro): detecção por nó (destino = membro contínuo DF-6 > maior Ø > classe primária > id estável; demais recebem boca de lobo) e por extremidade encostada no corpo de outro tubo (junta T/Y em meio de tubo, ex.: LDB nos montantes, USM nas travessas).
- **FR-10.2** Classificação: topo (deflexão < 5° sem continuidade; cordão = perímetro), T (θ ≥ 60°), Y (θ < 60°), K/N (≥ 2 cortados no mesmo destino), cruzamento (eixos a < ra+rb sem nó — regra `warn` JOINT.X com distância medida).
- **FR-10.3** Curva de contato pela fórmula clássica de cope p/ eixos concorrentes (`t(φ) = (√(ra²−rb²sin²φ) − rb·cosθ·cosφ)/sinθ`, 96 amostras); comprimento por soma de cordas; total de cordão exposto (`totalWeldLength`) e exibido na seção "Juntas & solda".
- **FR-10.4** Gabarito SVG 1:1 (unidades mm) por extremidade cortada: curva do desenvolvimento, linha de dorso φ = 0, identificação (membro, nó, Ø, θ) e barra de escala de 100 mm; download no painel do membro selecionado.
- **FR-10.5** Avisos de fabricação: θ < 30° (recorte cresce com 1/sin θ) e cruzamentos, na seção de juntas.
- **FR-10.6** DF-2 v2 completo: `weightParams.weldPerMmG` definido ⇒ massa de solda = cordão total × g/mm (campo na configuração; 0 volta ao g/junta).

### US-11 — Manequim ergonômico (DF-4 v1, implementada)

Como projetista, quero um piloto paramétrico por percentil dentro da gaiola para projetar o habitáculo para a faixa real de pilotos.

- **FR-11.1** Tabela antropométrica própria (`model/manikin.ts`): perfis F-P5, F-P50, M-P50, M-P95 (estatura e massa exibidas); segmentos proporcionais à estatura (Drillis & Contini, 1966 — fonte citada na UI).
- **FR-11.2** Cadeia cinemática 2D no plano x = 0 ancorada no H-point (`seatBottomY` + espessura de assento; z = ponto do Geraldão + 90 mm): pé–tornozelo–joelho–quadril–tronco–ombro–cotovelo–punho + cabeça/capacete.
- **FR-11.3** Modo faixa: dois manequins simultâneos (percentil mínimo ocre, máximo verde-acinzentado), translúcidos, `raycast` nulo; toggle "Piloto" na barra do viewport, independente do Geraldão.
- **FR-11.4** Ângulos por slider com faixa recomendada; fora da faixa mostra aviso âmbar sem bloquear (ergonomia é recomendação); tooltip com o racional de cada faixa.
- **FR-11.5** `Cage.manikin` vai para o JSON (decisão de projeto); toggle é UI. Projetos antigos importam sem manequim (defaults ao ativar).
- **FR-11.6** Leituras derivadas no painel: H-point→calcanhar, altura do topo do capacete, posição do punho (entrada do DF-5). Nenhuma regra B6 muda de resultado (v1 informativa).

### US-12 — Ancoragem do volante (DF-5, implementada)

Como projetista, quero modelar a ancoragem do suporte do volante e saber se a gaiola a sustenta.

- **FR-12.1** `Cage.steering` opt-in: modo `central` (1 ponto SW) ou `mesa` (par SWL/SWR espelhado, FR-2.2); posição livre editável por arrasto no 3D (alvo ampliado, octaedro ciano) e painel numérico; conversão de modo preserva a posição média.
- **FR-12.2** Regra `STEER.1` (contrato de SUSP.1): ponto a ≤ 25 mm do eixo de algum membro = apoiada; senão `fail` "sem suporte — ajuste a gaiola ou adicione tubo" com distância; só emitida quando steering existe.
- **FR-12.3** Integração com a análise de remoção: remover tubo de apoio acusa STEER.1 (o tubo sai do destaque teal automaticamente); tubos de suporte são membros normais (`FREE`) e entram na massa (DF-2).
- **FR-12.4** Zona recomendada do punho (DF-4): esfera ciano translúcida no punho do percentil maior (raio parametrizável, default 50 mm) quando o toggle "Piloto" está ativo; ponto fora da zona gera aviso âmbar informativo no painel.
- **FR-12.5** Default de criação: ponto nasce no punho do manequim configurado. Projetos sem o campo importam e validam sem menção a STEER.1. Levantamento normativo: fixação da direção não tem item B6; B11.5 (geometria do volante) permanece com os juízes — regra segue interna do portal.

## 4. Critérios de aceite (estado verificado)

| #     | Critério                                                                                                                                                                                                                              | Verificação                                            |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| AC-1  | Template abre com 27/28 verificações automáticas OK; a única falha é didática (pontos C a 990 mm < 1041 mm, B6.2.7.5)                                                                                                                 | manual/browser ✔                                       |
| AC-2  | Corrigir a geometria no editor leva a 28/28 sem recarregar                                                                                                                                                                            | ✔                                                      |
| AC-3  | Curvar um tubo além de 30° fora de ponto denominado gera falha B6.2.2.5.4; marcar o nó de dobra como denominado remove a falha                                                                                                        | ✔                                                      |
| AC-4  | Assistente com defaults: 28/28 (traseira), 30/30 (ambas as amarrações)                                                                                                                                                                | ✔                                                      |
| AC-5  | Gaiola só com amarração dianteira: nenhuma regra de traseira é cobrada; B6.2.14.2 reporta "dianteiro presente — traseiro dispensado"                                                                                                  | ✔                                                      |
| AC-6  | Mover ancoragem para fora de qualquer tubo dispara SUSP.1 e o badge individual "sem suporte" com a distância                                                                                                                          | ✔                                                      |
| AC-7  | Remover (simulado) um FAB de um lado acusa B6.2.14.4.6; tubo genérico extra é reportado como removível                                                                                                                                | ✔                                                      |
| AC-8  | Arrastar um nó no 3D move o ponto (e o espelho L/R) com as regras revalidando durante o gesto; clique simples apenas seleciona, sem deslocar                                                                                          | ✔                                                      |
| AC-9  | DF-1: seção primária fora do padrão (Ø 31,75 × 1,57) com 4130 passa a equivalência B6.3.3.2; com 1010 falha com valores exibidos; %C deriva do material; JSON antigo importa migrado                                                  | vitest ✔ (`materials.test.ts`, `b6-materials.test.ts`) |
| AC-10 | DF-2: massa bate cálculo manual (±1%); troca de material muda massa pela razão de densidades; membro novo soma 2 juntas; economia de remoção = tubo + juntas                                                                          | vitest ✔ (`mass.test.ts`)                              |
| AC-11 | DF-6: split cria passagem e migra declarações; extremidade dupla bloqueada; delete limpa; JSON antigo importa descontínuo; passagem desconta junta; emenda < 5° sem declaração vira item B6.3.1                                       | vitest ✔ (`continuity.test.ts`)                        |
| AC-12 | DF-7: T 90° tubos iguais reproduz a sela t(φ)=r·\|cosφ\| e cordão bate referência analítica (±1%); contínuo nunca é cortado; cruzamento < ra+rb avisa com distância; SVG 1:1 com barra de 100 mm; total = soma; g/mm alimenta a massa | vitest ✔ (`joints.test.ts`)                            |
| AC-13 | DF-4: alcances escalam com a estatura; segmentos batem as frações da fonte; mover `seatBottomY` translada o manequim; manequim no JSON não altera nenhum resultado B6                                                                 | vitest ✔ (`manikin.test.ts`)                           |
| AC-14 | DF-5: ponto sobre tubo passa STEER.1 com distância; > 25 mm falha com ação; mesa espelha L/R; remoção do tubo de apoio acusa STEER.1; sem steering não há menção à regra                                                              | vitest ✔ (`steering.test.ts`)                          |

## 5. Fora de escopo do MVP (backlog)

Features especificadas em draft em [draft-features.md](draft-features.md):
estimativa de peso c/ juntas soldadas (DF-2), Geraldão no cockpit (DF-3), manequim
ergonômico (DF-4), ancoragem do volante (DF-5), continuidade de tubos (DF-6) e detecção
de juntas / boca de lobo (DF-7). DF-1 (materiais) foi promovida a US-6 (implementada).

- Import de CAD (STEP/IGES) com extração de linha de centro
- Manequim de piloto (percentil 95) para folgas B6.1.3/B6.1.4 — ver DF-4
- Raio de curvatura real do tubo (hoje: linha de centro com nó de dobra; raio ≥ 152 mm é item manual)
- Relatório PDF anexável à Ficha de Especificação da Gaiola (Anexo B)
- Autenticação, perfis de equipe/universidade, galeria e fórum (fase comunidade)
- Versionamento de regulamento (`ruleset` por emenda) — arquitetura já prevê, ver design.md
