# DF-19 — Catálogo de maturidade v2.0.0: modo autodeclarativo

> Rascunho de feature (2026-08-30). Detalha o catálogo que o [DF-13](df13-evolucao-maturidade.md)
> criou e que o [DF-18](df18-patentes-prototipo.md) consome. Decisão de modo em
> [`docs/adr/011-patentes-gamificacao.md`](../../docs/adr/011-patentes-gamificacao.md).
> A saída do modo autodeclarativo é o [DF-20](df20-afericao-declaracoes.md).

- **Dependências:** DF-13 (motor, áreas, escada de níveis — implementado com o catálogo v1.0.0),
  DF-18 (a patente lê estes níveis), DF-10 (capitania responde).
- **Lacuna conhecida, endereçada fora daqui:** 17 destes 51 critérios se apoiam em informação de
  projeto que o portal não tem onde guardar — geometria de suspensão, setup de CVT, massa alvo,
  medidas as-built. Na v1 o campo "Onde registrar" desses critérios diz "link externo". O
  [DF-21](df21-ficha-prototipo.md) dá casa a esses dados; quando ele existir, o catálogo sobe para
  `2.1.0` **trocando só o campo "onde registrar"** — nenhum enunciado muda, o denominador não se
  mexe.
- **Estado do que existe:** `packages/evolution/src/catalog.ts` já tem os **51 critérios** com
  `id`, `area`, `level`, `type`, `label`, `source` e `research`. Esta spec **não inventa critérios
  novos**: ela dá a cada um o texto que faltava — o enunciado que a equipe responde, o que conta
  como cumprido, o que não conta, e por qual dado ele será aferido depois.

## 1. Contexto: por que a v1 é autodeclarativa

O catálogo v1.0.0 nasceu misto: 18 critérios `auto` (satisfeitos por evidência do servidor),
31 `declarado` e 2 `oculto`. Isso tem duas consequências ruins para uma primeira versão:

1. **Assimetria entre áreas** — já registrada como argumento contra a decisão 2 do ADR-010.
   Estrutura sobe quase sozinha quando alguém salva o projeto; Documentação exige cerimônia de
   declaração. O nível deixa de ser comparável entre áreas justamente quando a equipe está
   aprendendo a ler a tela.
2. **Cobertura desigual do que a equipe faz de verdade** — as áreas com ferramenta instrumentada
   (Estrutura, Conhecimento) medem bem; Documentação e Fabricação quase não medem, e o modelo
   passa a dizer mais sobre o que o portal construiu do que sobre a equipe.

**Decisão do product owner (2026-08-30): a primeira versão da avaliação de maturidade é
autodeclarativa.** A equipe responde a todos os critérios; o portal registra, calcula e não
discute. A evidência automática continua sendo produzida e gravada — ela só não decide ainda.

Isto é um **começo deliberado, com saída desenhada**: o DF-20 (aferição) usa exatamente a
evidência que já está sendo acumulada para confrontar as declarações, área por área, em ondas. A
declaração continua sendo o meio de entrada; ela deixa de valer sozinha.

O modelo de confiança da v1 é o mesmo do DF-13 §3.3, dito com todas as letras na tela: **quem
declara mentindo engana a própria equipe.** Não há ranking público que pague a trapaça, a patente
é privada por padrão e o histórico guarda quem respondeu o quê.

## 2. O que muda no motor

- **RF-1.1** `Criterion` ganha `mode` derivado, não um campo novo por critério: o catálogo passa a
  exportar `CATALOG_MODE: 'declarado' | 'aferido'`. Em `'declarado'`, `computeLevels()` considera
  **todo critério visível** satisfeito pela declaração, ignorando a avaliação de evidência.
- **RF-1.2** O campo `type` do critério **não some** — ele continua descrevendo a natureza da
  fonte e vira o rótulo da tela:
  - `auto` → chip **"o portal também mede"** com o valor medido ao lado da resposta;
  - `declarado` → chip **"só a equipe sabe"**;
  - `oculto` → deixa de existir na v2.0.0 (RF-1.4).
- **RF-1.3 — Pré-preenchimento sem veredito.** Onde o portal mede (`type: 'auto'`), a resposta
  vem **sugerida** com o valor medido visível, e a equipe pode discordar. A divergência é gravada
  (`declaration.divergent = true`) e é o gancho do DF-20 — mas na v1 **não muda o nível**.
  _É a única concessão desta spec ao automático, e ela existe para dois motivos: pouparia a equipe
  de responder 18 perguntas cuja resposta o portal já sabe, e produz, de graça, o conjunto de
  divergências que calibra a aferição antes de ela existir._
- **RF-1.4 — Não existe critério oculto na v2.0.0.** Os dois `oculto` do v1.0.0 viram `declarado`,
  reescritos como afirmação sobre o mundo real (o carro tem a ficha) em vez de sobre a ferramenta
  (o portal gerou a ficha). Quando a ferramenta nascer, eles migram para `auto` e o enunciado
  estreita — mudança de versão de catálogo, com o delta explicado na atividade (DF-13 P-1.3).
  Denominador da v2.0.0: **51 critérios, todos visíveis, todos respondíveis**.
- **RF-1.5** `CATALOG_VERSION` sobe para `2.0.0`. Maior, porque o denominador mudou e níveis
  existentes podem se mover — publicação recalcula tudo e registra o delta por equipe.

## 3. Anatomia de um critério

Cada linha do §5 traz cinco campos. Os três primeiros são o contrato com a equipe; os dois
últimos são o contrato com quem implementa.

| Campo               | Para que serve                                                                                                        |
| ------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **Pergunta**        | O enunciado exato mostrado à capitania. Fechada, respondível com sim/não, sem adjetivo de valor.                      |
| **Cumprido quando** | A régua. Descreve um fato verificável, não uma intenção. É o texto do "saiba mais" do critério.                       |
| **Não vale**        | O contra-exemplo mais provável. Existe para desarmar a leitura generosa, que é o modo de falha nº 1 da autoavaliação. |
| **Onde registrar**  | O artefato do portal que sustenta a resposta — decisão, guia, projeto ou link externo.                                |
| **Aferição futura** | O dado do portal que vai confrontar esta declaração, e em qual onda do DF-20.                                         |

Regra de redação, válida para todo critério novo: **a pergunta descreve um fato do passado, nunca
uma intenção**. "Vocês definiram a rotina de reunião?" e não "vocês pretendem se reunir com
regularidade?".

## 4. Regras transversais

- **RF-4.1 Quem responde.** Só `evolution.declare` (owner/admin — DF-13 RF-3.1). Qualquer membro
  vê as respostas e quem respondeu.
- **RF-4.2 O que fica registrado.** Autor, data, nota opcional (≤ 500) e link opcional. Toda
  declaração e revogação audita e aparece na atividade (DF-13 RF-3.2).
- **RF-4.3 Revogar é normal.** Desmarcar um critério é ato comum, não confissão — a UI não pede
  confirmação dramática. Fica no histórico com autor e data, e o nível cai na hora.
- **RF-4.4 Validade por temporada.** Critérios cujo enunciado é ligado ao ciclo — todo DOC,
  `GES-3.2`, `GES-5.2`, `FAB-4.1`, `EST-5.2`, `CON-5.1` — **expiram na virada de temporada** e
  precisam ser reafirmados. A tela avisa antes ("6 critérios vencem com a temporada 2027"). O nível
  cai só depois da virada, e a queda é narrada. Os demais persistem (DF-13 O5: nada zera).
- **RF-4.5 Sem meio-termo.** Não existe "parcialmente cumprido", nem escala de 0 a 10 por critério.
  A granularidade do modelo é o nível da área; dentro do critério a resposta é binária. Um critério
  que não dá para responder com sim/não está mal escrito e é bug de catálogo.
- **RF-4.6 Ordem de resposta.** A UI oferece os critérios do **próximo nível** de cada área
  primeiro — nunca uma lista de 51 itens. Responder tudo de uma vez é possível, mas não é o
  caminho oferecido: a fila do DF-13 E4 continua sendo a superfície principal.
- **RF-4.7 Cumulativo.** Nível da área = maior N tal que **todos** os critérios de nível ≤ N estão
  satisfeitos (DF-13 §3.2). Responder um critério de nível 5 sem ter os de nível 2 não sobe nada —
  e a tela mostra isso, para a equipe não achar que a resposta se perdeu.
- **RF-4.8 Nenhum critério exige uma ferramenta específica do portal.** Todo enunciado pergunta
  por uma prática de engenharia ou um fato do carro — nunca por "você usou o editor 3D". Onde o
  portal tem ferramenta, ela é **o caminho fácil**, e a tela diz isso ("o validador responde este
  em um clique"); a equipe que faz por fora responde igual e sobe igual. É o mesmo princípio que o
  [DF-21](df21-ficha-prototipo.md) §3.2 aplica à ficha do protótipo.
  **Consequência para a aferição (DF-20):** contraprova compara valores que existem. Projeto sem
  gaiola modelada, ou campo de ficha vazio, **nunca** contradiz uma declaração — ausência de dado
  não é prova de nada. A única exceção é o critério que afirma a existência do próprio dado.

### A escada semântica (recapitulada do DF-13 §3.2)

| Nível | Nome           | Significado                                              |
| ----- | -------------- | -------------------------------------------------------- |
| 1     | **Fundação**   | Existe e está registrado no portal                       |
| 2     | **Prática**    | O básico é feito, com as ferramentas e registros mínimos |
| 3     | **Disciplina** | Processo regular, com responsável e prazo                |
| 4     | **Validação**  | Verificado por evidência, revisão ou teste               |
| 5     | **Excelência** | Melhoria contínua e resiliência geracional               |

## 5. O catálogo v2.0.0

---

### 5.1 `estrutura` — Estrutura & segurança

O que a área mede: se o projeto do chassi é conforme, conferido e reproduzível — e se o que sai da
oficina é o que estava desenhado. É a área mais instrumentada do portal, e por isso a que mais
divergência vai gerar entre declaração e medida.

#### `EST-1.1` · nível 1 — Projeto do protótipo registrado no portal

- **Pergunta:** o projeto do protótipo desta temporada está registrado no portal?
- **Cumprido quando:** existe um projeto designado como o da temporada **e** ele tem conteúdo —
  gaiola modelada com ao menos uma versão salva **ou** ficha do protótipo com a seção de
  identificação e dimensões preenchida (DF-21). Os dois caminhos valem igual.
- **Não vale:** arquivo no computador de alguém, no Drive da equipe ou aberto no editor sem salvar;
  projeto criado com nome e mais nada. O ponto do critério é tirar o projeto da máquina de uma
  pessoa — a dificuldade nº 1 mapeada nas equipes iniciantes —, não obrigar a usar o editor 3D.
- **Onde registrar:** o próprio projeto, designado em Equipe · Projetos.
- **Aferição futura:** existe `validation.summary` **ou** ficha com conteúdo — **onda V1**.

#### `EST-2.1` · nível 2 — Gaiola completa, sem pendências de presença

- **Pergunta:** o projeto da gaiola está completo — todos os membros obrigatórios previstos?
- **Cumprido quando:** o projeto contempla todos os membros obrigatórios. **Caminho fácil:** a
  última versão salva no validador sem nenhuma pendência de presença. Quem projeta em CAD confere
  contra o regulamento e responde igual.
- **Não vale:** gaiola em que falta o arco traseiro, a proteção lateral ou a amarração, mesmo que
  "a equipe sabe que vai fazer". Presença é diferente de conformidade: aqui só se pergunta se a
  peça existe no modelo.
- **Onde registrar:** o projeto da temporada.
- **Aferição futura:** contagem de pendências de presença em `validation.summary` — **V1**.

#### `EST-2.2` · nível 2 — Seções e materiais conferidos com o que será fabricado

- **Pergunta:** as seções e o material dos tubos do projeto conferem com o que a equipe vai comprar
  e soldar?
- **Cumprido quando:** alguém confrontou a lista de tubos do projeto (diâmetro, parede, aço) com o
  que está disponível/comprado, e a divergência ou foi corrigida no projeto ou está registrada.
- **Não vale:** ter escolhido o material no dropdown do editor sem conferir com o fornecedor. O
  modo de falha clássico da faixa iniciante é o tubo comprado divergir do projetado e a
  não conformidade só aparecer na inspeção.
- **Onde registrar:** decisão no diário ("tubo primário: 1020 Ø31,75×1,5 porque…"), com link.
- **Aferição futura:** classe de material do projeto × equivalência B6.3.3.2 — parcial, **V2**.

#### `EST-3.1` · nível 3 — Zero infrações automáticas na versão salva

- **Pergunta:** o projeto do protótipo atende a todas as regras verificáveis em desenho?
- **Cumprido quando:** nenhuma regra que se confere sobre a geometria está violada. **Caminho
  fácil:** o validador não aponta infração automática na última versão salva. Quem confere à mão
  contra o regulamento responde igual — e aceita o custo de conferir ~40 verificações a cada
  mudança. Itens presenciais não contam aqui: são o `EST-3.2`.
- **Não vale:** "está quase", "só falta um ângulo", ou zerar as infrações num rascunho não salvo.
  Rascunho aberto no editor não conta em nenhum critério (DF-13 §3.4).
- **Onde registrar:** o projeto da temporada.
- **Aferição futura:** contagem de `fail` em `validation.summary` — **V1**, e é o exemplo
  canônico de contradição direta do DF-20.
- **O validador é o caminho fácil, não o único** (RF-4.8). A diferença prática é o custo: manter
  ~40 verificações conferidas à mão a cada alteração de geometria é o trabalho que a ferramenta
  existe para poupar.

#### `EST-3.2` · nível 3 — Itens presenciais revisados em reunião, com registro

- **Pergunta:** a equipe revisou em reunião os itens do checklist que só dá para verificar
  presencialmente?
- **Cumprido quando:** houve uma reunião dedicada em que os itens presenciais foram percorridos um
  a um, com o resultado registrado — inclusive os que ficaram pendentes.
- **Não vale:** ter lido o regulamento; ter conversado no grupo; um único membro ter conferido
  sozinho sem registro. O critério é sobre o **rito**, que é o que a prática de elite descreve.
- **Onde registrar:** decisão no diário com a ata da revisão (link obrigatório na prática).
- **Aferição futura:** só existe se a marcação item a item do checklist manual for implementada
  (v2 do DF-13, hoje fora de escopo) — **sem onda**.

#### `EST-4.1` · nível 4 — Ficha da gaiola (Anexo B) preenchida e conferida

- **Pergunta:** a ficha técnica da gaiola exigida pela inspeção está preenchida e confere com o
  projeto?
- **Cumprido quando:** a ficha existe, está preenchida com as medidas e materiais do protótipo
  desta temporada, e alguém a conferiu contra o projeto salvo.
- **Não vale:** ficha do ano passado; ficha preenchida "de cabeça" sem confrontar com o modelo.
- **Onde registrar:** link para o documento onde a ficha vive.
- **Aferição futura:** era `oculto` no v1.0.0. Quando a ferramenta "Ficha da gaiola" nascer, este
  critério vira `auto` e o enunciado estreita para "gerada a partir do projeto validado" —
  **onda V3**.

#### `EST-4.2` · nível 4 — Revisão do projeto por outro membro, registrada

- **Pergunta:** o projeto da gaiola foi revisado por alguém que não o desenhou, com o resultado
  registrado?
- **Cumprido quando:** um segundo membro percorreu o projeto e registrou o que encontrou —
  inclusive "nada a apontar", desde que fique claro quem revisou e quando.
- **Não vale:** o próprio autor revisando; aprovação verbal na oficina; "o capitão viu".
- **Onde registrar:** decisão no diário, com o nome do revisor.
- **Aferição futura:** exigiria autoria por versão de projeto (existe: `snapshots` guarda autor) —
  possível como indício em **V2**.

#### `EST-4.3` · nível 4 — Análise estrutural (FEA) realizada e arquivada

- **Pergunta:** a equipe fez análise estrutural do chassi nesta temporada e guardou o resultado?
- **Cumprido quando:** existe uma simulação estrutural do chassi desta temporada — com os casos de
  carga usados anotados — e o arquivo/relatório está acessível para a próxima geração.
- **Não vale:** FEA de um chassi de temporada anterior; imagem colorida sem casos de carga
  declarados; simulação que ninguém consegue mais abrir ou encontrar.
- **Onde registrar:** link externo (Drive, repositório) — o portal não hospeda o arquivo.
- **Aferição futura:** acontece fora do portal — **segue só declarado**, e a tela diz isso.

#### `EST-5.1` · nível 5 — Gaiola fabricada conferida contra o projeto (as-built)

- **Pergunta:** depois de soldada, a gaiola foi medida e comparada com o projeto?
- **Cumprido quando:** houve medição do quadro real (pontos denominados, vãos críticos, altura do
  arco) comparada com o projeto, e os desvios foram registrados — corrigidos ou aceitos.
- **Não vale:** conferência visual; "encaixou, então está certo"; medir só o que era fácil.
- **Onde registrar:** decisão no diário com a tabela de desvios, ou link para a planilha.
- **Aferição futura:** exigiria entrada de medidas as-built no portal — **sem onda na v2**.

#### `EST-5.2` · nível 5 — Lições da inspeção técnica registradas

- **Pergunta:** o que a inspeção técnica apontou na última competição está registrado no diário?
- **Cumprido quando:** existe registro do que a inspeção pediu, do que foi ajustado no local e do
  que precisa mudar no projeto do ano seguinte.
- **Não vale:** "passamos de primeira" sem registro; lembrança na cabeça do capitão que se forma.
  É exatamente o conhecimento que a rotatividade apaga.
- **Onde registrar:** decisão no diário, marcada como pós-competição.
- **Aferição futura:** existência de decisão em janela pós-competição do calendário do DF-15 —
  indício fraco, **V2**.

---

### 5.2 `dinamica` — Dinâmica & powertrain

O que a área mede: se as escolhas de suspensão, direção e trem de força são calculadas,
registradas e testadas — em vez de copiadas ou herdadas sem entendimento.

#### `DIN-1.1` · nível 1 — Responsáveis definidos no organograma

- **Pergunta:** existe alguém nomeado como responsável por suspensão/direção e por trem de força?
- **Cumprido quando:** os dois papéis têm ocupante no organograma da equipe.
- **Não vale:** "todo mundo mexe em tudo"; um nome que a pessoa não sabe que é dela.
- **Onde registrar:** organograma, em Equipe · Pessoas.
- **Aferição futura:** `org.summary` traz os nós de liderança ocupados — **V1**.

#### `DIN-2.1` · nível 2 — Ancoragens de suspensão apoiadas em tubo

- **Pergunta:** todos os pontos de ancoragem da suspensão do projeto estão apoiados em tubo?
- **Cumprido quando:** as 20 ancoragens (bandejas superior/inferior e amortecedor, dianteira e
  traseira, dos dois lados) estão posicionadas sobre membros do quadro. **Caminho fácil:** a
  verificação SUSP.1 do validador, que aplica a tolerância. Quem projeta em CAD confere lá.
- **Não vale:** ancoragem "flutuando" perto do tubo; ancoragem que a equipe pretende reposicionar.
- **Onde registrar:** o projeto da temporada.
- **Aferição futura:** verificação SUSP.1 em `validation.summary` — **V1**.

#### `DIN-2.2` · nível 2 — Ancoragem da direção apoiada

- **Pergunta:** o ponto de fixação da caixa/coluna de direção está apoiado em tubo no projeto?
- **Cumprido quando:** o ponto de fixação da direção está definido e apoiado em tubo. **Caminho
  fácil:** a verificação STEER.1 do validador. Equipe que ainda não definiu a fixação responde
  "não" — o critério não é dispensável por omissão.
- **Não vale:** direção resolvida "na hora da montagem".
- **Onde registrar:** o projeto da temporada.
- **Aferição futura:** verificação STEER.1 em `validation.summary` — **V1**.

#### `DIN-3.1` · nível 3 — Geometria de suspensão documentada

- **Pergunta:** a geometria de suspensão do protótipo tem memória de cálculo arquivada?
- **Cumprido quando:** existe documento com os parâmetros escolhidos (curso, cambagem, cáster,
  convergência, centro de rolagem, relação de instalação) **e o porquê** de cada um — mesmo que o
  cálculo seja simples.
- **Não vale:** planilha com números sem justificativa; geometria copiada de outra equipe sem
  adaptação registrada; "está no CAD".
- **Onde registrar:** link para a memória de cálculo + decisão no diário resumindo a escolha.
- **Aferição futura:** **massa do protótipo × mediana da comunidade** — indício quantitativo,
  **V2**. É o segundo exemplo canônico do DF-20: massa muito acima da mediana torna implausível
  que a geometria tenha sido calculada com a massa real.

#### `DIN-3.2` · nível 3 — Setup de transmissão registrado por condição de uso

- **Pergunta:** o ajuste do CVT/transmissão está registrado, com a condição de uso de cada ajuste?
- **Cumprido quando:** existe registro de qual configuração é usada em que prova (aceleração,
  tração, enduro) e o que muda entre elas.
- **Não vale:** um único ajuste "que funciona"; ajuste na memória do responsável.
- **Onde registrar:** guia da equipe (o formato certo — é procedimento repetível), com link.
- **Aferição futura:** mesmo indício de massa do `DIN-3.1` — **V2**.

#### `DIN-4.1` · nível 4 — Teste de bancada com resultado registrado

- **Pergunta:** ao menos um subsistema foi testado em bancada, com o resultado anotado?
- **Cumprido quando:** houve um ensaio controlado — amortecedor, freio, transmissão, o que for —
  com procedimento e resultado registrados, incluindo o que não deu certo.
- **Não vale:** "rodamos o carro e pareceu bom"; teste sem número anotado.
- **Onde registrar:** decisão ou guia com o procedimento e o resultado.
- **Aferição futura:** fora do portal — **segue declarado**.

#### `DIN-4.2` · nível 4 — Coleta de dados em pista realizada

- **Pergunta:** a equipe já coletou dados instrumentados do carro em pista nesta temporada?
- **Cumprido quando:** houve ao menos uma sessão com aquisição — mesmo simples (acelerômetro,
  GPS, célula de carga) — com os dados guardados.
- **Não vale:** cronometrar com celular; impressão do piloto sem dado.
- **Onde registrar:** link para o conjunto de dados + decisão descrevendo a sessão.
- **Aferição futura:** fora do portal — **segue declarado**.

#### `DIN-5.1` · nível 5 — Aquisição recorrente com análise pós-teste

- **Pergunta:** a coleta de dados virou rotina, com análise registrada depois de cada sessão?
- **Cumprido quando:** há mais de uma sessão na temporada **e** cada uma tem análise registrada
  que levou a alguma decisão de projeto ou de setup.
- **Não vale:** coletar sempre e nunca analisar; analisar sem que nada mude.
- **Onde registrar:** decisões no diário, uma por sessão analisada.
- **Aferição futura:** contagem de decisões da área `dinamica` na temporada — indício, **V2**.

#### `DIN-5.2` · nível 5 — Validação cruzada simulação × ensaio

- **Pergunta:** para ao menos um sistema, o resultado simulado foi comparado com o medido?
- **Cumprido quando:** existe comparação explícita entre o que a simulação previu e o que o ensaio
  mediu, com a divergência discutida — inclusive quando a simulação errou.
- **Não vale:** simular e testar sem comparar; comparar e só registrar quando bate.
- **Onde registrar:** link para o relatório de correlação + decisão.
- **Aferição futura:** fora do portal — **segue declarado**.

---

### 5.3 `documentacao` — Documentação & relatórios

O que a área mede: se a equipe trata documento como entregável de engenharia — a marca que a
pesquisa aponta como divisor entre a faixa intermediária e a de alta performance.

#### `DOC-1.1` · nível 1 — Modelo dos relatórios definido

- **Pergunta:** a equipe já definiu qual modelo vai usar nos relatórios desta temporada?
- **Cumprido quando:** existe um template escolhido — o oficial da competição ou um próprio — e
  todo mundo sabe qual é.
- **Não vale:** "vamos usar o do ano passado" sem que alguém saiba onde ele está.
- **Onde registrar:** decisão no diário com link para o template.
- **Aferição futura:** fora do portal — **segue declarado**.
- **Validade:** expira na virada de temporada (RF-4.4).

#### `DOC-2.1` · nível 2 — Relatório em escrita, com responsável por seção

- **Pergunta:** o relatório de projeto está sendo escrito, com um responsável nomeado por seção?
- **Cumprido quando:** o documento existe, está dividido em seções e cada seção tem um nome ao
  lado. Não precisa estar pronto — precisa ter dono.
- **Não vale:** documento em branco com títulos; "o capitão escreve tudo no fim".
- **Onde registrar:** link para o documento + decisão com a divisão de seções.
- **Aferição futura:** fora do portal — **segue declarado**. **Validade:** expira na temporada.

#### `DOC-3.1` · nível 3 — Relatório enviado no prazo

- **Pergunta:** o relatório foi enviado dentro do prazo da temporada?
- **Cumprido quando:** o envio ocorreu antes do prazo. Enviado com atraso aceito pela organização
  **não** cumpre: o critério é sobre disciplina de prazo, que é a dificuldade descrita na faixa
  intermediária.
- **Não vale:** enviar incompleto para bater o prazo.
- **Onde registrar:** decisão no diário com a data de envio.
- **Aferição futura:** data do marco de entrega em `team_season.milestones` × data da declaração —
  indício, **V2**. **Validade:** expira na temporada.

#### `DOC-3.2` · nível 3 — Memórias de cálculo arquivadas por subsistema

- **Pergunta:** cada subsistema tem memória de cálculo arquivada e encontrável?
- **Cumprido quando:** existe um acervo organizado por subsistema, e um membro novo consegue achar
  a memória de um sistema sem perguntar a ninguém.
- **Não vale:** arquivos espalhados em conversas; pasta que só uma pessoa sabe navegar.
- **Onde registrar:** link para o acervo + guia da equipe explicando a organização.
- **Aferição futura:** existência de guia com etiqueta de acervo — indício fraco, **V2**.

#### `DOC-4.1` · nível 4 — Revisão por pares de todas as seções

- **Pergunta:** todas as seções do relatório foram revisadas por alguém que não as escreveu?
- **Cumprido quando:** cada seção teve um revisor distinto do autor, antes do envio.
- **Não vale:** revisão só das seções "importantes"; revisão de português sem leitura técnica.
- **Onde registrar:** decisão com a matriz autor × revisor.
- **Aferição futura:** fora do portal — **segue declarado**. **Validade:** expira na temporada.

#### `DOC-4.2` · nível 4 — Ficha da gaiola anexada ao pacote de documentos

- **Pergunta:** a ficha técnica da gaiola foi anexada ao pacote entregue?
- **Cumprido quando:** a ficha do `EST-4.1` acompanhou a entrega documental da temporada.
- **Não vale:** ficha levada impressa só para a inspeção, sem constar do pacote.
- **Onde registrar:** decisão no diário com a lista do que foi entregue.
- **Aferição futura:** era `oculto` no v1.0.0; vira `auto` junto com o `EST-4.1` — **onda V3**.
- **Validade:** expira na temporada.

#### `DOC-5.1` · nível 5 — Acervo de temporadas anteriores acessível e indexado

- **Pergunta:** os relatórios e memórias das temporadas anteriores estão acessíveis e indexados?
- **Cumprido quando:** existe índice — por ano e por subsistema — e um membro novo abre o material
  de duas temporadas atrás sem pedir ajuda.
- **Não vale:** ter os arquivos em algum lugar; acervo que depende de um veterano para navegar.
  É o critério que separa "a equipe guarda" de "a equipe consegue usar o que guardou".
- **Onde registrar:** guia da equipe com o índice + link para o acervo.
- **Aferição futura:** fora do portal — **segue declarado**.

---

### 5.4 `fabricacao` — Fabricação & testes

O que a área mede: se o caminho do desenho até o carro rodando é planejado e verificado — e não
descoberto na hora, que é a marca da faixa iniciante.

#### `FAB-1.1` · nível 1 — Acesso a oficina e processo de solda definidos

- **Pergunta:** a equipe sabe onde vai fabricar e quem vai soldar?
- **Cumprido quando:** o local está garantido para a temporada e o soldador (membro treinado ou
  terceiro) está definido, com o processo escolhido (TIG, MIG).
- **Não vale:** "a gente dá um jeito"; oficina disponível "provavelmente".
- **Onde registrar:** decisão no diário.
- **Aferição futura:** fora do portal — **segue declarado**.

#### `FAB-2.1` · nível 2 — Gabaritos de boca de lobo gerados

- **Pergunta:** a equipe tem gabaritos de corte 1:1 das juntas deste protótipo?
- **Cumprido quando:** existem gabaritos 1:1 das juntas, prontos para levar à bancada. **Caminho
  fácil:** gerar e baixar pelo validador (produz `template.generated`). Gabarito saído do CAD da
  equipe vale igual.
- **Não vale:** cortar "no olho" e ajustar na bancada; gabarito de outro projeto.
- **Onde registrar:** o validador gera; gabarito externo entra como link na ficha do protótipo.
- **Aferição futura:** existência de `template.generated` — **V1**, e **só dispara contraprova
  quando existe** (RF-4.8): quem gerou por fora não é contradito pela ausência.

#### `FAB-2.2` · nível 2 — Plano de solda definido

- **Pergunta:** existe uma sequência de solda e um plano de fixação no gabarito?
- **Cumprido quando:** está escrito em que ordem as peças serão soldadas e como o conjunto fica
  fixado — a ordem que controla distorção térmica.
- **Não vale:** "solda de baixo para cima"; plano na cabeça do soldador.
- **Onde registrar:** guia da equipe (procedimento repetível) — vira o `FAB-3.1` quando publicado.
- **Aferição futura:** ver `FAB-3.1` — **V1**.

#### `FAB-3.1` · nível 3 — Sequência de solda publicada como guia

- **Pergunta:** a sequência de solda está publicada como guia da equipe, e não só combinada?
- **Cumprido quando:** existe guia publicado, com dono, descrevendo a sequência — de forma que a
  próxima geração consiga repetir sem o autor.
- **Não vale:** foto do quadro branco; mensagem no grupo; documento sem dono.
- **Onde registrar:** guia em Equipe · Conhecimento, com a etiqueta de solda.
- **Aferição futura:** existência do guia com a etiqueta em `knowledge.summary` — **V1**.

#### `FAB-3.2` · nível 3 — Controle dimensional pós-solda registrado

- **Pergunta:** as medidas do quadro foram conferidas depois da solda, com registro?
- **Cumprido quando:** houve medição das cotas críticas pós-solda com os valores anotados —
  independentemente de terem ficado dentro ou fora do previsto.
- **Não vale:** conferência visual; medir só depois de perceber que algo ficou torto.
- **Onde registrar:** decisão com a tabela de medidas.
- **Aferição futura:** ver `EST-5.1` — **sem onda na v2**.

#### `FAB-4.1` · nível 4 — Protocolo de testes pré-competição executado

- **Pergunta:** existe um protocolo de testes pré-competição e ele foi executado nesta temporada?
- **Cumprido quando:** há uma lista de verificações (freio, direção, cintos, extintor, shakedown de
  duração) e o registro de que foi percorrida com o carro montado, com o que reprovou anotado.
- **Não vale:** dar uma volta no estacionamento; testar só o que deu tempo.
- **Onde registrar:** guia com o protocolo + decisão com o resultado da execução.
- **Aferição futura:** fora do portal — **segue declarado**. **Validade:** expira na temporada.

#### `FAB-5.1` · nível 5 — Mula de testes ou bancada própria em operação

- **Pergunta:** a equipe tem um carro anterior rodando como mula de testes, ou bancada própria?
- **Cumprido quando:** existe um segundo veículo ou uma bancada em condição de uso, sendo usado
  para testar antes de o carro novo estar pronto — a prática que separa a alta performance.
- **Não vale:** carro antigo parado no galpão; bancada emprestada uma vez.
- **Onde registrar:** decisão descrevendo o ativo e como está sendo usado.
- **Aferição futura:** múltiplos projetos ativos da equipe — indício fraco, **V2** (ver questão
  aberta do DF-18 §11.2).

---

### 5.5 `gestao` — Gestão & pessoas

O que a área mede: se a equipe é conduzida como organização — papéis, ritmo, dinheiro e sucessão.
É a área onde a faixa de alta performance mais se distancia, segundo a pesquisa.

#### `GES-1.1` · nível 1 — Capitania regular e organograma criado

- **Pergunta:** a equipe tem capitania definida e organograma criado no portal?
- **Cumprido quando:** existe um capitão (e no máximo dois co-capitães) e o organograma foi
  montado, mesmo com vagas abertas.
- **Não vale:** capitania informal; organograma desenhado fora do portal.
- **Onde registrar:** Equipe · Pessoas.
- **Aferição futura:** `org.summary` — **V1**, e é o terceiro exemplo canônico do DF-20 (piso de
  atividade).

#### `GES-2.1` · nível 2 — Todos os cargos de liderança com ocupante

- **Pergunta:** todos os cargos de liderança do organograma têm alguém?
- **Cumprido quando:** nenhum nó marcado como liderança está vago.
- **Não vale:** apagar o cargo vago do organograma para "fechar" o critério — o que a área mede é
  cobertura, e um organograma que esconde a vaga mente para a própria equipe.
- **Onde registrar:** Equipe · Pessoas.
- **Aferição futura:** contagem de vagas de liderança em `org.summary` — **V1**.

#### `GES-2.2` · nível 2 — Rotina de reunião definida

- **Pergunta:** a equipe tem uma rotina de reunião definida — frequência e formato?
- **Cumprido quando:** existe combinação explícita (quando, onde, quanto tempo, o que se decide
  ali) e ela está sendo seguida.
- **Não vale:** "a gente se fala todo dia"; reunião que acontece quando dá.
- **Onde registrar:** decisão no diário com a rotina.
- **Aferição futura:** piso de atividade da equipe no portal — indício, **V1**.

#### `GES-3.1` · nível 3 — Temporada configurada com marcos datados

- **Pergunta:** a temporada está configurada no portal, com os marcos e suas datas?
- **Cumprido quando:** existe temporada com rótulo, protótipo designado e ao menos os marcos de
  entrega de documentos e de competição, com data.
- **Não vale:** datas na cabeça de alguém; calendário em outra ferramenta que a equipe não abre.
- **Onde registrar:** Equipe · Evolução, configuração da temporada.
- **Aferição futura:** `season.configured` — **V1**.

#### `GES-3.2` · nível 3 — Orçamento da temporada elaborado

- **Pergunta:** existe orçamento da temporada, com previsto e realizado acompanhados?
- **Cumprido quando:** há uma planilha (ou equivalente) com as linhas de custo previstas e algum
  acompanhamento do que já foi gasto.
- **Não vale:** lista de desejos sem valores; controle só das notas fiscais.
- **Onde registrar:** link para a planilha + decisão com o total previsto.
- **Aferição futura:** fora do portal — **segue declarado**. **Validade:** expira na temporada.

#### `GES-4.1` · nível 4 — Trainees avaliados antes da efetivação

- **Pergunta:** os trainees passam por avaliação formal antes de virarem membros efetivos?
- **Cumprido quando:** existe um critério escrito de efetivação e ele foi aplicado ao último grupo,
  com resultado registrado.
- **Não vale:** efetivar quem "apareceu bastante"; avaliação combinada verbalmente.
- **Onde registrar:** guia com o critério + decisão com o resultado da última rodada.
- **Aferição futura:** trainees promovidos em `org.summary` × existência de guia — indício, **V2**.

#### `GES-4.2` · nível 4 — Carteira de apoiadores ativa

- **Pergunta:** a equipe tem ao menos duas parcerias ativas registradas nesta temporada?
- **Cumprido quando:** existem duas ou mais parcerias vigentes (dinheiro, material ou serviço) com
  contrapartida acordada e registrada.
- **Não vale:** patrocinador de temporadas passadas; contato que "demonstrou interesse".
- **Onde registrar:** decisão com a lista e a contrapartida de cada um.
- **Aferição futura:** fora do portal — **segue declarado**. **Validade:** expira na temporada.

#### `GES-5.1` · nível 5 — Processo seletivo estruturado praticado

- **Pergunta:** a entrada de novos membros passa por um processo seletivo estruturado?
- **Cumprido quando:** existe edital ou funil documentado (divulgação → inscrição → avaliação →
  resultado) e ele foi praticado na última entrada.
- **Não vale:** convidar conhecidos; processo escrito mas não aplicado.
- **Onde registrar:** guia com o processo + decisão com o resultado da última seleção.
- **Aferição futura:** fora do portal — **segue declarado**.

#### `GES-5.2` · nível 5 — Prestação de contas apresentada à equipe

- **Pergunta:** a capitania apresentou a prestação de contas da temporada à equipe?
- **Cumprido quando:** houve apresentação do previsto × realizado para o time inteiro, com registro
  de que aconteceu.
- **Não vale:** planilha compartilhada sem apresentação; prestação só para a capitania.
- **Onde registrar:** decisão no diário com a data e o material apresentado.
- **Aferição futura:** fora do portal — **segue declarado**. **Validade:** expira na temporada.

---

### 5.6 `conhecimento` — Conhecimento & continuidade

O que a área mede: se o que a equipe aprende sobrevive à turma que aprendeu. **Rotatividade é o
problema nº 1 mapeado nas 91 equipes** — e é por isso que esta área pesa igual às outras cinco na
média, mesmo sendo a menos "de engenharia" das seis (DF-13 §11.2, decisão deliberada).

#### `CON-1.1` · nível 1 — Ao menos uma decisão registrada no diário

- **Pergunta:** a equipe já registrou ao menos uma decisão no diário?
- **Cumprido quando:** existe uma decisão registrada, com o contexto e a alternativa descartada.
- **Não vale:** anotação sem o porquê. Uma decisão sem alternativa descartada é um comunicado, não
  uma decisão — e é o registro do porquê que serve à geração seguinte.
- **Onde registrar:** Equipe · Conhecimento.
- **Aferição futura:** `decision.created` — **V1**.

#### `CON-2.1` · nível 2 — Ao menos 10 decisões e 2 guias publicados

- **Pergunta:** o diário já tem 10 decisões e a equipe publicou 2 guias?
- **Cumprido quando:** os dois contadores foram atingidos. São **pisos de existência, não metas**:
  o número existe para marcar que o hábito começou, não para ser perseguido.
- **Não vale:** dez decisões registradas na mesma tarde para fechar o critério — é o caso de
  _gaming_ previsto no DF-13 P-5.1, e o ganho de fazê-lo é zero, porque quem lê o diário vazio
  depois é a própria equipe.
- **Onde registrar:** Equipe · Conhecimento.
- **Aferição futura:** contadores em `knowledge.summary` — **V1**.

#### `CON-2.2` · nível 2 — Trilha de integração de novatos publicada

- **Pergunta:** existe uma trilha publicada que um novato percorre para se integrar?
- **Cumprido quando:** existe guia do tipo trilha, com a sequência do que o novato precisa ler,
  fazer e com quem falar nas primeiras semanas.
- **Não vale:** "o veterano explica"; lista de links sem ordem nem responsável.
- **Onde registrar:** guia do tipo trilha, em Equipe · Conhecimento.
- **Aferição futura:** existência de guia `kind: trilha` — **V1**.

#### `CON-3.1` · nível 3 — Último novato aprovado concluiu a trilha

- **Pergunta:** o novato mais recente concluiu a trilha de integração?
- **Cumprido quando:** a conclusão está marcada para a última pessoa que entrou.
- **Não vale:** marcar como concluído para fechar o critério; trilha "concluída" por quem já era
  veterano. O critério mede se a trilha funciona, não se ela existe.
- **Onde registrar:** Equipe · Conhecimento, conclusão da trilha.
- **Aferição futura:** `trail.completed` cruzado com a entrada mais recente em `org.summary` —
  **V1**.

#### `CON-3.2` · nível 3 — Decisões em ao menos 3 áreas distintas nos últimos 6 meses

- **Pergunta:** o diário tem decisões de pelo menos três áreas diferentes nos últimos seis meses?
- **Cumprido quando:** as decisões da janela cobrem três das seis áreas — sinal de que o registro é
  hábito da equipe, e não de uma pessoa que documenta o próprio subsistema.
- **Não vale:** vinte decisões, todas de chassi.
- **Onde registrar:** Equipe · Conhecimento, com a área marcada em cada decisão.
- **Aferição futura:** janela temporal em `knowledge.summary` — **V1**. Este critério **expira
  sozinho** com o tempo: é um dos que o recálculo diário do DF-13 RF-2.3 existe para cobrir.

#### `CON-4.1` · nível 4 — Um kit de passagem concluído, nenhum vencido

- **Pergunta:** já houve uma passagem de cargo concluída com kit, e nenhum kit aberto está com
  data de saída vencida?
- **Cumprido quando:** ao menos um kit foi concluído **e** nenhum kit em aberto passou da data de
  saída anunciada de quem está saindo.
- **Não vale:** kit aberto e abandonado; passagem feita "de boca" no último dia.
- **Onde registrar:** Equipe · Conhecimento, kits de passagem.
- **Aferição futura:** `kit.opened {dueDate}` e `kit.completed` — **V1**.

#### `CON-4.2` · nível 4 — Nenhum guia órfão

- **Pergunta:** todos os guias publicados têm dono e foram atualizados nos últimos seis meses?
- **Cumprido quando:** não existe guia sem responsável nem guia parado há mais de seis meses.
- **Não vale:** atribuir todos os guias a uma pessoa só para zerar os órfãos; "atualizar" mudando
  uma vírgula.
- **Onde registrar:** Equipe · Conhecimento.
- **Aferição futura:** dono e data em `knowledge.summary` — **V1**.

#### `CON-5.1` · nível 5 — Ritual de lições aprendidas pós-competição

- **Pergunta:** a equipe fez uma reunião de lições aprendidas depois da última competição, com
  registro?
- **Cumprido quando:** houve um encontro dedicado, com o time presente, e o resultado virou
  registro — inclusive o que deu errado.
- **Não vale:** conversa na viagem de volta; retrospectiva só entre a capitania.
- **Onde registrar:** decisão no diário com as lições e os responsáveis por cada ação.
- **Aferição futura:** decisão em janela pós-competição do calendário do DF-15 — indício, **V2**.
- **Validade:** expira na virada de temporada.

#### `CON-5.2` · nível 5 — Memória de gerações mantida

- **Pergunta:** a equipe mantém o histórico de quem ocupou cada função ao longo dos anos?
- **Cumprido quando:** existe registro de gerações — quem foi capitão, quem cuidou de cada
  subsistema, e como encontrar essas pessoas depois de formadas.
- **Não vale:** lista de nomes sem função nem ano; grupo de mensagens como "acervo".
- **Onde registrar:** guia da equipe com o histórico (o organograma histórico é DF-10 v2).
- **Aferição futura:** organograma histórico, quando existir — **sem onda na v2**.

---

## 6. Distribuição resultante

| Área           | Nível 1 | 2   | 3   | 4   | 5   | Total  | Com aferição em V1 |
| -------------- | ------- | --- | --- | --- | --- | ------ | ------------------ |
| `estrutura`    | 1       | 2   | 2   | 3   | 2   | 10     | 3                  |
| `dinamica`     | 1       | 2   | 2   | 2   | 2   | 9      | 3                  |
| `documentacao` | 1       | 1   | 2   | 2   | 1   | 7      | 0                  |
| `fabricacao`   | 1       | 2   | 2   | 1   | 1   | 7      | 2                  |
| `gestao`       | 1       | 2   | 2   | 2   | 2   | 9      | 4                  |
| `conhecimento` | 1       | 2   | 2   | 2   | 2   | 9      | 7                  |
| **Total**      | 6       | 11  | 12  | 12  | 10  | **51** | **19**             |

Duas leituras que a tabela entrega e que importam para o piloto:

1. **Documentação não tem nenhuma aferição possível na V1.** É a área que mais depende de
   confiança, e a que mais vai divergir se a equipe for generosa consigo mesma. Vale observá-la em
   separado no piloto.
2. **Conhecimento é a área mais instrumentável** (7 de 9), porque o DF-14 foi construído para
   produzir esse dado. Quando a aferição entrar, ela será a área mais honesta do modelo — e é
   também a que ataca o problema nº 1. Não é coincidência; é o desenho.

## 7. Governança e versionamento

- Catálogo é código (`packages/evolution/src/catalog.ts`), revisado por PR como qualquer regra do
  motor B6. O campo `research` de cada critério continua obrigatório: sem âncora na pesquisa, o
  critério é calibração de gabinete — o risco nº 1 da feature (DF-13 P-1.1).
- **Publicar versão nova recalcula tudo** e registra o delta por equipe na atividade, com a
  explicação ("o critério X entrou no nível 3"). Mudanças agrupadas por temporada sempre que
  possível.
- `2.0.0` é maior porque o denominador mudou (dois `oculto` viraram visíveis) e níveis existentes
  podem se mover.
- **Feedback de calibração:** a tela de critérios ganha "este critério não faz sentido para nós",
  que grava a reclamação com a equipe e o critério. Na v1 do DF-13 isso era backlog; com o modelo
  autodeclarativo é **requisito**, porque a única fonte de calibração que existe são as equipes.

## 8. Critérios de aceite

| #          | Critério                                                                                                   |
| ---------- | ---------------------------------------------------------------------------------------------------------- |
| AC-DF19.1  | `CATALOG_MODE = 'declarado'`: critério `auto` não satisfeito por evidência sobe o nível quando declarado   |
| AC-DF19.2  | Nenhum critério `oculto` no catálogo v2.0.0; denominador é 51 em todas as áreas somadas                    |
| AC-DF19.3  | Critério `auto` mostra o valor medido ao lado da resposta; discordar grava `divergent` sem mudar o nível   |
| AC-DF19.4  | Cumulatividade: declarar um critério de nível 5 com o nível 2 incompleto não altera o nível da área        |
| AC-DF19.5  | Critérios com validade de temporada expiram na virada; o nível cai e a queda é narrada na atividade        |
| AC-DF19.6  | Revogar uma declaração derruba o nível na hora e fica no histórico com autor e data                        |
| AC-DF19.7  | Publicar `2.0.0` sobre uma equipe em `1.0.0` recalcula e grava o delta explicado                           |
| AC-DF19.8  | Todo critério tem `research` preenchido — teste de catálogo falha se algum estiver vazio                   |
| AC-DF19.9  | Enunciado, "cumprido quando" e "não vale" são canônicos no pacote; nenhuma tela reescreve o texto          |
| AC-DF19.10 | Alternar `CATALOG_MODE` para `'aferido'` não exige migração de dados — só muda o cálculo (prepara o DF-20) |

## 9. Questões em aberto

1. **O pré-preenchimento (RF-1.3) é uma concessão ao automático dentro de um modo declarado.**
   Se o product owner preferir pureza — a equipe responde tudo do zero, sem ver a medida —, é uma
   linha de código a menos e perde-se o conjunto de divergências que calibraria o DF-20. Fica
   registrado como escolha explícita, não como detalhe de implementação.
2. **Pisos numéricos** (`CON-2.1`: 10 decisões, 2 guias; `GES-4.2`: 2 parcerias; `CON-3.2`: 3 áreas
   em 6 meses) são os únicos números do catálogo e os mais arbitrários. Piloto decide.
3. **Validade por temporada (RF-4.4)** cria a primeira queda previsível do modelo, em bloco, na
   virada do ano. Com a carência de 30 dias da patente (DF-18 RF-4.1) o emblema aguenta o
   solavanco, mas a experiência da virada precisa ser desenhada antes do primeiro janeiro em
   produção.
4. **Peso das áreas.** Média simples trata Conhecimento como igual a Estrutura. Deliberado
   (DF-13 §11.2); revisitar se o piloto mostrar distorção.
5. **Idioma dos enunciados.** Estão em português do Brasil, com o vocabulário da comunidade
   ("gaiola", "bajeiro", "enduro"). Se um dia houver outra língua, o catálogo precisa de chaves de
   tradução — hoje o texto **é** o dado.
