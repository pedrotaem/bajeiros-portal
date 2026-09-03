# DF-21 — Ficha do protótipo: os dados do carro como campos de primeira classe

> Rascunho de feature (2026-08-30). Nasce de uma lacuna encontrada ao escrever o
> [DF-19](df19-catalogo-maturidade.md): boa parte do que a avaliação de maturidade pergunta é
> **informação de projeto que o portal não tem onde guardar**. Esta spec resolve isso como
> feature própria — a ficha vale por si, e a maturidade é apenas uma das quatro coisas que ela
> alimenta.

- **Status:** ✅ **IMPLEMENTADA** (2026-08-31, `65183e2` / PR #37, EV-11.1…11.3). Catálogo de
  campos em `packages/datasheet`. Não vai para `spec.md`, que é do validador — a ficha é do
  protótipo inteiro, não da gaiola.
- **Dependências:** DF-12 (shell — a ficha precisa de uma página de projeto), DF-10 (permissões de
  equipe). O motor B6 (`packages/core`) entra como **facilitador opcional**, nunca como
  pré-requisito (§3.2).
- **Alimenta:** DF-19/DF-20 (17 critérios passam a ter lastro no portal), a ficha do Anexo B
  (destrava `EST-4.1` e `DOC-4.2`, hoje `oculto`), o relatório de projeto, o kit de passagem do
  DF-14 e o benchmark por classe de projeto (destrava o DF-20 §8.1).

## 1. Contexto: o portal conhece a gaiola e mais nada do carro

Hoje `projects` tem `name`, `description` e os `cage_snapshots`. O portal sabe a posição de cada
nó da gaiola em milímetro — e não sabe o entre-eixos, a massa alvo, o curso da suspensão, o
diâmetro do disco de freio, a mola do CVT ou qual pneu o carro calça.

Esses números existem: estão numa planilha, no CAD de alguém, num grupo de mensagens. É o padrão
que a pesquisa de mercado descreve na faixa iniciante — **o projeto vive em arquivo local de uma
pessoa** — e é a mesma causa raiz da rotatividade: quando essa pessoa se forma, o número some e a
geração seguinte remede tudo do zero.

A lacuna aparece de três formas nas specs já escritas, e nas três a resposta foi adiar:

| Onde                      | Como o assunto foi adiado                                                                 |
| ------------------------- | ----------------------------------------------------------------------------------------- |
| DF-13 §11.4               | "critérios com link externo apontam para fora do portal — guardar apenas URL, sem upload" |
| DF-19 `EST-4.1`/`DOC-4.2` | eram os dois únicos `oculto` do catálogo, dependentes de uma "ferramenta futura"          |
| DF-20 §8.1                | onda V2 do `DIN-3.x` **bloqueada** por não existir classe de projeto para comparar massa  |

**Dezessete dos 51 critérios do DF-19** se apoiam em informação de projeto sem casa no portal.
Parte dela é genuinamente externa (o arquivo da FEA, a planilha do orçamento) e vai continuar
sendo link. Mas o núcleo — parâmetros, alvos e valores medidos — é dado estruturado, curto,
numérico, que pertence ao protótipo.

### Por que a ficha vale sozinha, sem a maturidade

Esta spec só se sustenta se a resposta for boa **sem citar patente nenhuma**. São quatro razões,
em ordem de urgência para a equipe:

1. **A inspeção pede esses números.** A ficha técnica exigida na competição é preenchida à mão,
   todo ano, a partir de fontes espalhadas. Tendo os campos no portal, ela é gerada.
2. **O relatório de projeto pede os mesmos números.** Hoje eles são recopiados, e divergem entre
   a ficha, o relatório e o CAD.
3. **A geração seguinte precisa deles.** Um número sem histórico não ensina nada; com histórico,
   "por que a mola é essa?" tem resposta.
4. **Comparar com a comunidade exige campo comparável.** O acervo do DF-15 tem resultado; sem
   parâmetro de projeto não dá para perguntar "onde estamos fora da curva".

## 2. Objetivos

| #   | Objetivo                                                                                                  |
| --- | --------------------------------------------------------------------------------------------------------- |
| O1  | Cada projeto tem uma ficha com campos tipados, agrupados por subsistema, editáveis por quem trabalha nele |
| O2  | **Todo campo é preenchível à mão.** O validador facilita onde pode; nunca é condição para registrar       |
| O3  | Todo valor tem unidade explícita e histórico com autor e data                                             |
| O4  | Preenchimento parcial é normal e visível ("ficha 62%"), nunca um formulário que trava                     |
| O5  | Sugerido × projetado × medido: a ficha guarda a divergência entre o ideal e o que foi construído          |
| O6  | Catálogo de campos versionado como código, no mesmo molde do motor B6 e do catálogo de maturidade         |

### Não-objetivos

- **Tornar o validador obrigatório.** Ver §3.2 — é o princípio que mais restringe esta spec.
- **Upload de arquivo.** A v1 continua guardando URL (DF-13 §11.4). CAD, FEA e planilhas seguem
  fora; o portal guarda o link e os números que resumem.
- **Resultado de validação como campo de ficha.** Conformidade, pendências e verificações da gaiola
  são estado da versão, não parâmetro do carro: vivem na aba Validação (§3.5), não aqui.
- **Lista de materiais de compra, estoque, custo por item.** Orçamento é `GES-3.2` e continua link.
- **Substituir o CAD ou virar PDM.** A ficha resume decisões de projeto; não versiona geometria
  fora da gaiola.
- **Campo livre criado pelo usuário.** v1 tem catálogo fixo + uma observação por seção (§12.1).
- **Validação de engenharia.** O portal confere tipo e unidade, e avisa quando o valor é atípico.
  Nunca recusa um valor real por ser incomum (§4.4).

## 3. Conceito

### 3.1 Ficha, seção, campo

Uma **ficha** pertence a um projeto (protótipo). Ela é dividida em **seções** — os subsistemas —
e cada seção tem **campos** tipados. O catálogo de seções e campos vive em módulo TS puro
versionado (`packages/datasheet`), exportado com `DATASHEET_VERSION`.

Um campo é `{ id, section, label, type, unit?, range?, options?, help, dual?, suggest?, comparable? }`.

| Tipo       | Uso                              | Como é guardado                   |
| ---------- | -------------------------------- | --------------------------------- |
| `number`   | medida física                    | número + unidade fixa do catálogo |
| `enum`     | escolha de uma lista curta       | chave da opção                    |
| `boolean`  | existe / não existe              | booleano                          |
| `text`     | identificação curta (≤ 120)      | string                            |
| `longtext` | justificativa (≤ 1000)           | string                            |
| `date`     | validade, data de ensaio         | data                              |
| `link`     | ponteiro para o artefato externo | URL                               |

**Não existe tipo "derivado".** `suggest` é um atributo, não um tipo: ele diz que o portal
consegue calcular um palpite para aquele campo — e nada mais (§3.2).

### 3.2 O validador é meio, não porta de entrada

> **Princípio que restringe esta spec inteira.** A gaiola 3D existe para **facilitar** a
> construção do projeto e conversar com os outros temas do protótipo. Ela **não pode ser condição**
> para a equipe registrar informação. Uma equipe que modela no CAD, ou que ainda nem começou a
> modelar, e usa o portal só para a ficha é caso de primeira classe — não uma versão degradada.

Consequências, todas verificáveis:

- **Nenhum campo é somente leitura.** Todos os campos da ficha aceitam digitação, sempre.
- **Projeto sem nenhuma versão de gaiola salva tem a ficha 100% preenchível** e chega a 100% de
  progresso. Nenhuma seção fica bloqueada, nenhum campo fica cinza (AC-DF21.3).
- **A sugestão é oferta, não preenchimento automático.** O portal mostra o valor que calculou, com
  a origem, e um botão que copia para o campo. Quem decide é quem está editando; e o que foi
  copiado continua editável depois.
- **Nunca sobrescreve.** Salvar uma versão nova da gaiola muda a sugestão, jamais o valor que a
  equipe digitou. A tela passa a mostrar as duas coisas e a diferença (§3.3).
- **Resultado de validação não vira campo.** Conformidade, pendências e verificações são estado da
  versão da gaiola e vivem na aba Validação. Um número que a equipe não consegue preencher à mão
  não é campo de ficha — é resultado de ferramenta, e mistura os dois é o que tornaria o validador
  obrigatório pela porta dos fundos.

É o mesmo princípio que o DF-19 RF-1.3 aplica à maturidade (_pré-preenchimento sem veredito_):
o portal mostra o que mediu e deixa a decisão com quem sabe.

### 3.3 Sugerido × projetado × medido

Três valores por campo, e só dois são guardados:

| Coluna        | De onde vem                                            | Guardado?                    |
| ------------- | ------------------------------------------------------ | ---------------------------- |
| **Sugerido**  | calculado do último modelo 3D salvo, quando ele existe | não — computado na leitura   |
| **Projetado** | o que a equipe assume como projeto                     | sim                          |
| **Medido**    | o que saiu da oficina, na balança ou na trena          | sim (campos marcados `dual`) |

**A divergência é o produto, não um efeito colateral.** Fabricação e execução produzem diferença
natural: o tubo empena na solda, a bitola sai 4 mm maior, a massa fica 1,8 kg acima do calculado.
Hoje essa diferença mora na cabeça de quem soldou. A ficha é onde ela vira dado — e a leitura das
três colunas responde a três perguntas distintas:

- **sugerido × projetado** — o modelo 3D representa o que a equipe realmente decidiu? Divergência
  aqui costuma ser modelo desatualizado, e é barato de descobrir.
- **projetado × medido** — o que foi construído bate com o que foi projetado? É o as-built, e é o
  que a próxima geração precisa para calibrar o próximo projeto.
- **sugerido × medido** — quanto o processo de fabricação inteiro desviou. É a resposta que vira
  tolerância de projeto na temporada seguinte.

A ficha mostra as diferenças com sinal e percentual, e **não julga nenhuma delas**. Diferença não
tem cor de status: não é conformidade, é informação.

### 3.4 Histórico

Toda escrita gera revisão append-only com valor anterior, valor novo, autor e data. A ficha mostra
"alterado por Rafael há 3 dias" ao lado do campo, e o histórico completo em um clique.

Sem isso o campo é um post-it. Com isso, ele é a resposta para "quem mudou a relação final e por
quê" — que é exatamente o que a próxima geração precisa e nunca encontra.

### 3.5 Onde a ficha vive na navegação

`Equipe › Projetos › <projeto>` deixa de ser um item de lista e vira **página de projeto**, com
três abas:

| Aba           | Conteúdo                                                                                |
| ------------- | --------------------------------------------------------------------------------------- |
| **Ficha**     | esta spec                                                                               |
| **Versões**   | a lista de snapshots que hoje vive no modal de projetos                                 |
| **Validação** | conformidade da última versão da gaiola, quando existe — e um convite quando não existe |

A separação entre Ficha e Validação é a aplicação do §3.2 na navegação: a aba Validação pode estar
vazia a vida inteira sem afetar a Ficha em nada.

Do editor 3D, um atalho "Ficha do protótipo" abre a página sem desmontar o `<Viewport>` (a mesma
regra do ADR-009 dec. 4 que o DF-12 já respeita). E da ficha, os campos com sugestão trazem o
caminho inverso: "abrir no editor".

## 4. Requisitos funcionais

### E1 — Catálogo (`packages/datasheet`)

- **RF-1.1** Pacote TS **puro**: seções, campos, unidades, faixas típicas e `DATASHEET_VERSION`
  semântico. Sem IO, testado por fixture — mesmo molde de `packages/core` e `packages/evolution`.
- **RF-1.2** Rótulos, ajuda e unidades são **canônicos no pacote**; nenhuma tela reescreve texto de
  campo (mesma regra do DF-19 AC-9).
- **RF-1.3** `suggestFrom(cage, rulesResult)` devolve as sugestões dos campos marcados `suggest`,
  reusando o motor B6 — nunca reimplementando cálculo. **Devolve vazio sem erro** quando não há
  versão salva: ausência de gaiola é caso normal, não exceção.
- **RF-1.4** Nenhum campo do catálogo pode ser marcado como não editável. Um teste de catálogo
  falha se algum campo não aceitar escrita (AC-DF21.2) — é a guarda que impede o princípio §3.2 de
  se perder numa mudança futura.
- **RF-1.5** Catálogo novo pode **adicionar** campo a qualquer momento; **remover** ou mudar
  unidade de campo existente é mudança maior, e a migração de valores é explícita no PR.

### E2 — Preenchimento

- **RF-2.1** `PUT /projects/:id/datasheet` aceita um lote de `{fieldId, kind: 'design'|'measured',
value}`. Escrita parcial é o caso normal — a API nunca exige ficha completa.
- **RF-2.2** Validação na borda: tipo, faixa **absoluta** do campo (o que é fisicamente impossível
  ou claramente erro de unidade) e tamanho de texto. **Qualquer campo do catálogo aceita escrita**,
  inclusive os que têm sugestão.
- **RF-2.3** Faixa **típica** (§4.4) nunca bloqueia: gera aviso na resposta e chip na tela.
- **RF-2.4** Toda escrita grava revisão append-only e audita (`datasheet.update`).
- **RF-2.5** Permissão: qualquer **membro da equipe dona** do projeto edita (é trabalho de
  engenharia, não de capitania). Projeto pessoal: só o dono. Leitura segue a visibilidade do
  projeto.
- **RF-2.6** Concorrência: escrita por campo, com `updated_at` por campo. Dois membros editando
  seções diferentes não conflitam; no mesmo campo, o segundo recebe 409 com o valor vigente.
- **RF-2.7** "Usar o valor sugerido" é uma escrita normal como qualquer outra: grava em
  `design`, entra no histórico com o autor que clicou, e a origem fica anotada na revisão
  (`source: 'suggestion'`). Não é sincronização, é uma cópia consentida.

### E3 — Progresso e leitura

- **RF-3.1** `GET /projects/:id/datasheet` devolve seções, campos, valores, sugestões (quando
  houver gaiola salva), avisos de faixa e o progresso por seção e total.
- **RF-3.2** **Progresso conta todos os campos preenchíveis** — que são todos os campos do
  catálogo. Sugestão não preenchida **não** conta como preenchido: enquanto ninguém aceitar ou
  digitar, o campo está vazio. Só ficam fora do denominador as seções marcadas "não se aplica"
  (§4.5).
- **RF-3.3** Divergências (§3.3) são computadas na leitura, não guardadas.
- **RF-3.4** `GET /projects/:id/datasheet/history?field=` devolve o histórico de um campo.
- **RF-3.5** A resposta indica se há gaiola salva (`hasCage`). É o que a tela usa para escolher
  entre mostrar a coluna de sugestão ou escondê-la inteira — sem coluna vazia acusando ausência.

### E4 — Faixas típicas, e por que elas não bloqueiam

- **RF-4.1** Cada `number` pode ter faixa típica derivada do que é usual em Baja SAE. Valor fora
  dela mostra um aviso com o texto do catálogo — _"incomum para esta categoria; confira a
  unidade"_ — e **é salvo assim mesmo**.
- **RF-4.2** Faixa **absoluta** (aquela em que o valor não pode estar certo — massa de chassi de
  2 kg, disco de freio de 3 m) rejeita, com mensagem que sugere erro de unidade.
- **RF-4.3** Regra de projeto: **uma ficha que recusa o número real é uma ficha abandonada.** Se a
  equipe fez uma escolha atípica de propósito, o portal registra e pergunta; não impede.
- **RF-4.4** Divergência entre sugerido e digitado **nunca** gera aviso. É informação esperada
  (§3.3), não erro.

### E5 — Seções que não se aplicam

- **RF-5.1** A capitania marca uma seção como "não se aplica a este protótipo" (ex.: uma equipe
  sem aquisição de dados), com justificativa curta. A seção sai do denominador do progresso e fica
  visivelmente marcada, nunca escondida.
- **RF-5.2** Marcar e desmarcar audita. Não é atalho para inflar progresso: o cálculo mostra
  "62% de 9 seções (2 não se aplicam)".

### E6 — Saídas

- **RF-6.1 Relatório:** exportação da ficha em Markdown/CSV para colar no relatório da temporada,
  com as três colunas quando existirem.
- **RF-6.2 Kit de passagem (DF-14):** o kit de um cargo lista os campos da ficha sob
  responsabilidade daquele cargo, com quem os preencheu por último.
- **RF-6.3 Anexo B:** quando a ferramenta da ficha oficial nascer, ela lê **da ficha** — não do
  modelo 3D. É o que transforma `EST-4.1` e `DOC-4.2` de `oculto` em `auto` (DF-19 RF-1.4) sem
  tornar o validador obrigatório para gerar o documento.
- **RF-6.4 Comunidade:** campos marcados `comparable` no catálogo (classe, massa, entre-eixos,
  bitola, pneu) alimentam medianas por classe, com o mesmo piso de 8 do DF-13 RF-7.2 e sem nunca
  nomear equipe. A mediana usa o valor **medido** quando existe, e o projetado quando não —
  declarando qual usou.

## 5. O catálogo de campos v1

Nove seções. **S** = o portal sabe sugerir a partir do modelo 3D (e o campo continua editável à
mão) · **⇄** = tem coluna de medido · **≈** = comparável na comunidade.

### 5.1 Identificação

| Campo             | Tipo   | Nota                                                                |
| ----------------- | ------ | ------------------------------------------------------------------- |
| Nome do protótipo | `text` | como a equipe chama o carro                                         |
| Temporada         | `text` | vem da temporada da equipe quando houver                            |
| Número do carro   | `text` | quando já atribuído                                                 |
| Ocupantes ≈       | `enum` | monoposto · biposto                                                 |
| Tração ≈          | `enum` | traseira · integral                                                 |
| Estágio           | `enum` | conceito · projeto · fabricação · em testes · competiu · aposentado |

**A classe (ocupantes + tração) é o campo que destrava o DF-20 §8.1** — sem ela, comparar massa
entre carros incomparáveis é ruído.

### 5.2 Dimensões e massa

| Campo                           | Tipo     | Unid. | Nota                                            |
| ------------------------------- | -------- | ----- | ----------------------------------------------- |
| Entre-eixos ≈ ⇄                 | `number` | mm    |                                                 |
| Bitola dianteira ≈ ⇄            | `number` | mm    |                                                 |
| Bitola traseira ≈ ⇄             | `number` | mm    |                                                 |
| Altura livre do solo ⇄          | `number` | mm    |                                                 |
| Massa da gaiola **S** ⇄         | `number` | kg    | sugerida do modelo; medida na balança           |
| Massa do veículo seco ≈ ⇄       | `number` | kg    |                                                 |
| Massa com piloto ⇄              | `number` | kg    |                                                 |
| Distribuição dianteira ⇄        | `number` | %     | traseira é o complemento                        |
| Comprimento total de tubo **S** | `number` | mm    | sugerido do modelo; útil para compra            |
| Número de tubos cortados **S**  | `number` | —     | sugerido do modelo; a equipe corrige na oficina |

### 5.3 Chassi e materiais

| Campo                             | Tipo       | Nota                                    |
| --------------------------------- | ---------- | --------------------------------------- |
| Material e seção primária **S**   | `text`     | sugerido do modelo                      |
| Material e seção secundária **S** | `text`     | sugerido do modelo                      |
| Fornecedor do tubo                | `text`     |                                         |
| Lote / certificado do material    | `link`     | rastreabilidade que a inspeção pergunta |
| Tratamento térmico ou superficial | `enum`     | nenhum · pintura · zincagem · outro     |
| Observações do chassi             | `longtext` |                                         |

### 5.4 Suspensão

| Campo                                | Tipo     | Unid. | Nota                                       |
| ------------------------------------ | -------- | ----- | ------------------------------------------ |
| Tipo dianteiro                       | `enum`   | —     | duplo A · McPherson · outro                |
| Tipo traseiro                        | `enum`   | —     | duplo A · semi-trailing · trailing · outro |
| Curso dianteiro / traseiro ⇄         | `number` | mm    | dois campos                                |
| Cambagem estática diant. / tras. ⇄   | `number` | °     |                                            |
| Cáster ⇄                             | `number` | °     |                                            |
| Convergência diant. / tras. ⇄        | `number` | mm    |                                            |
| Relação de instalação diant. / tras. | `number` | —     | _motion ratio_                             |
| Rigidez de mola diant. / tras.       | `number` | N/mm  |                                            |
| Amortecedor — modelo                 | `text`   | —     |                                            |
| Memória de cálculo                   | `link`   | —     | o que hoje é só o link do `DIN-3.1`        |

### 5.5 Direção

| Campo                    | Tipo     | Unid. | Nota                               |
| ------------------------ | -------- | ----- | ---------------------------------- |
| Tipo                     | `enum`   | —     | pinhão-cremalheira · caixa · outro |
| Relação de direção       | `number` | —     |                                    |
| Voltas batente a batente | `number` | —     |                                    |
| Raio de giro ⇄           | `number` | m     | projetado × medido em pista        |
| Geometria de Ackermann   | `number` | %     |                                    |

### 5.6 Freios

| Campo                                  | Tipo      | Unid. | Nota                                  |
| -------------------------------------- | --------- | ----- | ------------------------------------- |
| Configuração                           | `enum`    | —     | 4 discos · 2 discos + inboard · outro |
| Diâmetro do disco diant. / tras.       | `number`  | mm    |                                       |
| Cilindro mestre — diâmetro             | `number`  | mm    |                                       |
| Relação do pedal                       | `number`  | —     |                                       |
| Travamento simultâneo das quatro rodas | `boolean` | —     | o ensaio que a inspeção cobra         |
| Data do ensaio de travamento           | `date`    | —     |                                       |
| Registro do ensaio                     | `link`    | —     |                                       |

### 5.7 Trem de força

| Campo                          | Tipo     | Unid. | Nota                                   |
| ------------------------------ | -------- | ----- | -------------------------------------- |
| Motor — modelo                 | `text`   | —     |                                        |
| CVT — modelo                   | `text`   | —     |                                        |
| Mola primária                  | `text`   | —     | identificação do fabricante            |
| Pesos / roletes                | `text`   | —     |                                        |
| Rampa secundária               | `text`   | —     |                                        |
| Mola secundária                | `text`   | —     |                                        |
| Redução — tipo                 | `enum`   | —     | caixa · corrente · correia · combinada |
| Relação de redução             | `number` | —     |                                        |
| Relação final total ⇄          | `number` | —     |                                        |
| Pneu — medida ≈                | `text`   | —     |                                        |
| Velocidade máxima ⇄            | `number` | km/h  | calculada × medida                     |
| Registro de setup por condição | `link`   | —     | o que hoje é só o link do `DIN-3.2`    |

### 5.8 Elétrica e segurança

| Campo                               | Tipo      | Nota                          |
| ----------------------------------- | --------- | ----------------------------- |
| Interruptores de corte — quantidade | `number`  | interno e externo             |
| Posição dos interruptores           | `text`    |                               |
| Bateria — tipo e fixação            | `text`    |                               |
| Luz de freio                        | `boolean` |                               |
| Cinto — pontos                      | `enum`    | 5 · 6                         |
| Cinto — validade                    | `date`    | a data que a inspeção confere |
| Banco e apoio de cabeça             | `text`    |                               |
| Extintor — validade                 | `date`    |                               |
| Proteção lateral / rede             | `boolean` |                               |

### 5.9 Ergonomia e testes

| Campo                              | Tipo     | Unid. | Nota                                        |
| ---------------------------------- | -------- | ----- | ------------------------------------------- |
| Percentil do piloto de referência  | `enum`   | —     | o manequim do DF-4 sugere, a equipe escolhe |
| Folga de capacete **S** ⇄          | `number` | mm    | sugerida do modelo; medida no carro pronto  |
| Protocolo de testes pré-competição | `link`   | —     | lastro do `FAB-4.1`                         |
| Horas de shakedown                 | `number` | h     |                                             |
| Sessões de aquisição de dados      | `number` | —     | lastro do `DIN-4.2` / `DIN-5.1`             |
| Última sessão de testes            | `date`   | —     |                                             |
| Controle dimensional pós-solda     | `link`   | —     | lastro do `FAB-3.2`                         |

**Total v1: 9 seções, ~70 campos individuais, 6 com sugestão do modelo 3D.** Todos editáveis à
mão, sem exceção. Nenhuma equipe preenche tudo, e tudo bem — é o que o O4 diz.

## 6. Modelo de dados (proposta — migração `0009_datasheet.sql`)

```sql
CREATE TABLE project_fields (
  project_id  uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  field_id    text NOT NULL,
  kind        text NOT NULL DEFAULT 'design' CHECK (kind IN ('design', 'measured')),
  value       jsonb NOT NULL,
  updated_by  uuid REFERENCES users (id) ON DELETE SET NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, field_id, kind)
);

CREATE TABLE project_field_revisions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  field_id    text NOT NULL,
  kind        text NOT NULL,
  old_value   jsonb,
  new_value   jsonb,
  source      text NOT NULL DEFAULT 'manual'  -- 'manual' | 'suggestion'
                CHECK (source IN ('manual', 'suggestion')),
  changed_by  uuid REFERENCES users (id) ON DELETE SET NULL,
  changed_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE project_section_waivers (
  project_id  uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  section_id  text NOT NULL,
  reason      text CHECK (char_length(reason) <= 280),
  waived_by   uuid REFERENCES users (id) ON DELETE SET NULL,
  waived_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, section_id)
);
```

- **Não há tabela nem coluna de valor sugerido.** Sugestão é computada na leitura e nunca
  persiste — é o que impede o valor da ficha de andar sozinho quando alguém salva o 3D. O que
  persiste, quando a equipe aceita, é uma escrita normal com `source = 'suggestion'` na revisão.
- **RLS:** herda a visibilidade de `projects` (padrão existente); `project_field_revisions`
  append-only por GRANT, como `audit_events`.
- **Sem coluna nova em `projects`.** A ficha é tabela lateral; projeto sem ficha continua válido,
  e ficha sem gaiola também.
- **Nada de PII nos valores.** "Piloto de referência" é percentil antropométrico, não pessoa.
  Autores (`updated_by`, `changed_by`) são a única PII: base legal execução de contrato, retenção
  pela vida do projeto, anonimização no `SET NULL` da exclusão de conta.
- **Contrato ODCS novo:** `project-datasheet.odcs.yaml`.
- **Valor em `jsonb`** e não em colunas tipadas: o catálogo muda por PR e colunas por campo seriam
  uma migração por campo novo. O tipo é imposto na borda pelo catálogo, que é a fonte de verdade.

## 7. API

| Método/rota                                   | Ação                                          | Permissão             |
| --------------------------------------------- | --------------------------------------------- | --------------------- |
| `GET   /projects/:id/datasheet`               | seções, campos, valores, sugestões, progresso | leitura do projeto    |
| `PUT   /projects/:id/datasheet`               | lote de campos (parcial)                      | membro da equipe dona |
| `GET   /projects/:id/datasheet/history`       | histórico (filtrável por campo)               | leitura do projeto    |
| `PUT   /projects/:id/datasheet/waivers/:sid`  | marcar seção como não aplicável               | `evolution.declare`   |
| `DELETE /projects/:id/datasheet/waivers/:sid` | desmarcar                                     | `evolution.declare`   |
| `GET   /projects/:id/datasheet/export?fmt=`   | Markdown ou CSV                               | leitura do projeto    |

Auditoria: `datasheet.update`, `datasheet.waiver`. `GET /me/home` **não** carrega a ficha — o
agregador tem teto de 20 KB (DF-16) e a ficha não é conteúdo de página inicial.

## 8. UI

- **Página de projeto com 3 abas** (§3.5). A aba Ficha lista as seções em acordeão, com o
  progresso de cada uma no cabeçalho e o total no topo.
- **Campo com sugestão** mostra a caixa de edição normal e, abaixo dela, uma linha discreta:
  _"modelo 3D · v14: 26,4 kg — usar"_. O botão copia; a linha some quando o valor digitado é igual
  ao sugerido. **Sem gaiola salva, a linha simplesmente não aparece** — nada de espaço vazio
  cobrando o uso do editor.
- **Sugerido × projetado × medido** ficam na mesma linha, com as diferenças calculadas à direita.
  Diferença não tem cor de status — não é conformidade, é informação (§3.3).
- **Aviso de faixa** é chip `--bj-warn` com ícone e texto (CT-3), ao lado do valor, e o valor
  permanece salvo. Divergência de sugestão **não** gera chip.
- **Seção não aplicável** fica recolhida, com o motivo à vista e um botão de reverter.
- Tokens `--bj-*`, zero hex, densidade `comfortable`, estados `'loading' | 'ok' | 'error'` (C-12).
- **Entrada numérica:** unidade sempre à direita do campo, nunca só no rótulo — é a defesa barata
  contra o erro de unidade, que é o erro mais comum em ficha técnica.

## 9. Pontos de falha e mitigação

| ID    | Ponto de falha                                                  | Mitigação                                                                                             |
| ----- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| P-1.1 | Setenta campos assustam e ninguém preenche                      | Progresso por seção; nada obrigatório; as sugestões tornam a seção de dimensões quase instantânea     |
| P-1.2 | Ficha vira formulário de burocracia, igual ao risco do DF-13    | Cada seção abre com para que serve; e as quatro saídas do §1 são reais, não promessas                 |
| P-2.1 | **O validador vira obrigatório pela porta dos fundos**          | §3.2 e a guarda RF-1.4: teste de catálogo falha se algum campo não aceitar escrita                    |
| P-2.2 | Sugestão sobrescreve o que a equipe digitou quando o 3D muda    | Sugestão nunca persiste (§6) e nunca escreve sozinha; aceitar é ato de alguém, com autor na revisão   |
| P-2.3 | Erro de unidade entra e envenena o benchmark                    | Faixa absoluta rejeita com mensagem de unidade; faixa típica avisa; unidade sempre visível na entrada |
| P-3.1 | Dois membros editando a mesma seção                             | Escrita por campo com `updated_at` próprio; 409 só no mesmo campo                                     |
| P-3.2 | Equipe usa "não se aplica" para inflar progresso                | Exige motivo, audita, e o total mostra quantas seções foram dispensadas                               |
| P-4.1 | Catálogo mal calibrado — campo que ninguém usa, campo que falta | Mesmo remédio do DF-19: piloto com 2–3 equipes, e "este campo não faz sentido" registra para revisão  |
| P-5.1 | A ficha vira fonte de verdade paralela ao CAD                   | Escopo explícito: parâmetros e alvos, não geometria. CAD segue como link; a ficha resume decisões     |

## 10. Critérios de aceite

| #          | Critério                                                                                                            |
| ---------- | ------------------------------------------------------------------------------------------------------------------- |
| AC-DF21.1  | Catálogo puro: fixtures de snapshot → sugestões esperadas; sem snapshot, `suggestFrom` devolve vazio sem erro       |
| AC-DF21.2  | **Nenhum campo do catálogo é somente leitura** — teste percorre o catálogo inteiro e falha se algum recusar escrita |
| AC-DF21.3  | **Projeto sem nenhuma versão de gaiola atinge 100% de progresso** preenchendo tudo à mão                            |
| AC-DF21.4  | Aceitar uma sugestão grava valor em `design`, gera revisão com `source = 'suggestion'` e o autor de quem clicou     |
| AC-DF21.5  | Salvar versão nova da gaiola muda a sugestão e **não altera** nenhum valor guardado                                 |
| AC-DF21.6  | Escrita parcial de um campo persiste, gera revisão e não exige nenhum outro campo                                   |
| AC-DF21.7  | Valor fora da faixa típica é salvo e devolve aviso; fora da faixa absoluta é recusado com mensagem de unidade       |
| AC-DF21.8  | Divergência entre sugerido e digitado não gera aviso nem chip de status                                             |
| AC-DF21.9  | Progresso ignora apenas seções dispensadas, e mostra a contagem de dispensas                                        |
| AC-DF21.10 | Campo `dual` com projetado e medido devolve as diferenças calculadas na leitura, e não as guarda                    |
| AC-DF21.11 | Histórico de um campo traz valor anterior, novo, origem, autor e data, em ordem                                     |
| AC-DF21.12 | Membro de outra equipe não lê nem escreve ficha (teste RLS dedicado)                                                |
| AC-DF21.13 | Duas escritas concorrentes em campos distintos passam; no mesmo campo, a segunda recebe 409 com o valor vigente     |
| AC-DF21.14 | Exportação Markdown e CSV traz seções, valores, unidades e as três colunas quando existirem                         |
| AC-DF21.15 | Excluir a conta anonimiza autoria de valores e revisões, preservando os valores                                     |
| AC-DF21.16 | Projeto sem ficha nenhuma continua funcionando em todas as telas existentes                                         |

## 11. O que isto muda nas specs de maturidade

Esta seção existe para deixar a dependência explícita — mas nada aqui é motivo para construir a
ficha. A ficha se paga pelas quatro razões do §1.

| Spec                       | Efeito                                                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------------------------- |
| DF-19 `EST-4.1`/`DOC-4.2`  | deixam de depender de "ferramenta futura": a ficha **é** a ferramenta. Viram `auto` na onda V3          |
| DF-20 §8.1 (bloqueio)      | a classe de projeto (§5.1) destrava a comparação de massa por carros comparáveis                        |
| DF-19 `EST-5.1`, `FAB-3.2` | a coluna de medido (§3.3) dá onde registrar as-built e controle dimensional — hoje não existe           |
| DF-20 onda V2              | ganha contraprovas novas: massa medida × massa projetada declarada; folga de capacete medida × sugerida |

**Nenhum critério do DF-19 muda de enunciado por causa desta spec.** O que muda é o campo "onde
registrar": onde hoje se lê "link externo", passa a se ler "ficha do protótipo" para os campos
que a ficha cobre. Isso é edição de catálogo, versão `2.1.0`, sem mexer no denominador.

**E uma regra que o princípio §3.2 impõe ao DF-20:** contraprova que lê a ficha só compara valores
que **existem**. Campo vazio, ou projeto sem gaiola modelada, **nunca** é contraprova — ausência de
dado não é prova de nada. A única exceção é o critério que afirma a existência do próprio dado
(`EST-1.1` diz que há projeto salvo; nesse caso a ausência contradiz o enunciado).

## 12. Questões em aberto

1. **Campo definido pela equipe.** Equipes têm parâmetros próprios (um sistema exclusivo, um
   ensaio que só elas fazem). A v1 tem observação por seção e nada mais. Campo customizado é
   tentador e cria dois problemas de uma vez: mata a comparabilidade na comunidade e vira base de
   dados sem esquema. Registrado, não decidido.
2. **Ficha por versão × ficha por projeto.** A gaiola é versionada por snapshot; a ficha é do
   projeto, com histórico por campo. Amarrar a ficha a uma versão de gaiola seria mais coerente e
   muito mais pesado de editar — além de reintroduzir a dependência que o §3.2 remove. A v1 fica
   no projeto; se o piloto mostrar necessidade de "congelar a ficha da entrega", isso é um
   _snapshot de ficha_, não uma mudança de modelo.
3. **Faixas típicas com que base?** Hoje seriam de gabinete, que é exatamente o defeito que o
   DF-13 P-1.1 aponta. Uma alternativa honesta é lançar **sem faixa típica** e derivá-las do
   próprio acervo depois do piso de 8 projetos — a mesma régua do benchmark.
4. **Unidades imperiais.** Alguns componentes de Baja vêm em polegada (cilindro mestre, tubo
   importado). A v1 guarda em SI e a entrada aceita só SI. Conversor na entrada é v2 — e é o tipo
   de omissão que gera erro de unidade, então vale reavaliar antes do piloto.
5. **Quem preenche o quê.** A v1 deixa qualquer membro editar qualquer campo. Amarrar seção ao
   cargo do organograma (DF-10) seria elegante e provavelmente cedo demais: equipe pequena tem
   uma pessoa fazendo três coisas.
6. **Mais campos com sugestão.** Seis é conservador; o motor B6 sabe mais coisas (vãos, ângulos,
   ancoragens). O critério para promover um campo a `suggest` é o do §3.2: **a equipe consegue
   preencher aquele campo à mão sem o validador?** Se não consegue, é resultado de ferramenta e
   pertence à aba Validação, não à ficha.

## 13. Plano

Fase **EV-11**, independente do lote das patentes. Pode ser executada **antes** do EV-10 — e é o
que destrava a onda V2 da aferição.

| Sub     | Entrega                                                                               |
| ------- | ------------------------------------------------------------------------------------- |
| EV-11.1 | `packages/datasheet` — catálogo v1, tipos, `suggestFrom()` sobre o motor B6, fixtures |
| EV-11.2 | Migração `0009`, módulo `datasheet` na API, revisões com origem, dispensas, RLS       |
| EV-11.3 | Página de projeto com 3 abas + aba Ficha (acordeão, sugestões, três colunas, avisos)  |
| EV-11.4 | Exportação Markdown/CSV, kit de passagem por cargo, catálogo de maturidade `2.1.0`    |

**Marco EV-M5:** uma equipe real preenche a ficha do protótipo até o fim de uma seção e usa a
exportação no relatório — sem que ninguém tenha mencionado maturidade, e **sem ter aberto o editor
3D**.

### Estado da implementação (2026-08-30)

EV-11.1 a EV-11.3 implementadas; da EV-11.4, só a exportação.

| Onde                                       | O que entrou                                                                                                  |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `packages/datasheet`                       | catálogo v1.0.0 (9 seções, 78 campos, 6 com sugestão), `suggestFrom()`, validação de faixa, progresso, export |
| `apps/api/migrations/0009_datasheet.sql`   | as três tabelas do §6, RLS herdada de `projects`, revisões append-only por GRANT                              |
| `apps/api/src/modules/datasheet/routes.ts` | as seis rotas do §7, lock otimista por campo, auditoria `datasheet.update` / `datasheet.waiver`               |
| `apps/web/src/components/ProjectPage.tsx`  | página de projeto com Ficha · Versões · Validação                                                             |
| `apps/web/src/components/DatasheetTab.tsx` | acordeão por seção, três colunas, linha de sugestão com "usar", avisos, histórico por campo                   |

Dois desvios conscientes, ambos a favor do §3.2:

1. **`suggestFrom(cage, ctx)` não recebe `rulesResult`** (RF-1.3 previa). Os seis palpites saem de
   geometria e massa; receber o resultado das regras só para ignorá-lo convidaria, na primeira
   manutenção, a derivar campo de veredito — o que a spec proíbe. O contexto carrega a versão do
   snapshot, que é o que a tela mostra.
2. **A faixa típica é de gabinete e está marcada como tal no código** (questão aberta §12.3). Ela
   nunca bloqueia; trocar um par é edição de catálogo.

Não implementado, com motivo:

- **RF-6.2 (kit de passagem por cargo)** — exige a amarração seção → cargo do organograma, que é
  justamente a **questão aberta §12.5**. Fica para quando a decisão de produto existir.
- **RF-6.3 (Anexo B)** e **catálogo de maturidade `2.1.0`** — dependem, respectivamente, da
  ferramenta da ficha oficial e do catálogo v2.0.0 do DF-19, que ainda não existe em código.
- **RF-6.4 (medianas por classe)** — o gancho está no catálogo (`comparable`); a agregação na
  comunidade fica para quando houver acervo acima do piso de 8.
