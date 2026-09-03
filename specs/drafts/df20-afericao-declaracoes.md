# DF-20 — Aferição: a declaração vale até o dado dizer o contrário

> Rascunho de feature (2026-08-30). É a saída planejada do modo autodeclarativo do
> [DF-19](df19-catalogo-maturidade.md). Desenho no canvas
> ["Patentes da Estrada"](https://claude.ai/code/artifact/aca0d047-5859-43fd-9b58-5e07d3a7d921),
> prancheta "Aferição". Decisão em
> [`docs/adr/011-patentes-gamificacao.md`](../../docs/adr/011-patentes-gamificacao.md).

- **Status:** ✅ **IMPLEMENTADA** (2026-08-31, `e7df2c2` / PR #38), no lote das patentes
  DF-18…DF-20. **Onda V1**: cobre 19 dos 51 critérios, os que não exigem ferramenta nova. As
  demais ondas seguem em aberto. Não vai para `spec.md`, que é do validador.
- **Dependências:** DF-19 (o catálogo e o campo "aferição futura" de cada critério), DF-13 (motor,
  evidências), DF-14 (contadores de conhecimento), DF-10 (organograma), DF-18 (a patente é o que
  torna a aferição necessária).
- **Não depende de ferramenta nova.** A onda V1 usa exclusivamente evidência que o portal já
  produz hoje.

## 1. Contexto

O DF-19 fecha a v1 com todos os 51 critérios respondidos pela equipe. É a decisão certa para
começar — mas ela tem um teto conhecido: **uma equipe generosa consigo mesma sobe de nível e de
patente sem ter feito nada.** O ADR-010 apostava no argumento social ("declarar mentira engana só
a própria equipe"), e ele é verdadeiro; mas com a patente do DF-18 na tela, o argumento fica
sozinho contra um incentivo novo.

A saída **não é esperar que todas as ferramentas existam.** É confrontar cada declaração com o
que o portal já mede. O portal mede pouco, mas mede coisas decisivas: se existe gaiola conforme
salva, se existe organograma, se o diário anda. Três exemplos que sustentam a feature inteira:

- A equipe se dá nota alta em **Estrutura**, mas não há registro de gaiola sem não conformidade.
- A equipe se dá nota alta em **Dinâmica**, mas a gaiola pesa muito acima da mediana dos
  protótipos salvos — a massa que o próprio portal estima.
- A equipe se dá nota alta em **Gestão**, mas não usa o portal para nada e não tem organograma.

A declaração continua sendo o meio de entrada. Ela só deixa de valer sozinha.

## 2. Conceito: três mecanismos, em ordem de força da inferência

A força da inferência decide o efeito. Misturar os três num único "reprovado" seria fazer o portal
afirmar coisas que ele não sabe.

### 2.0 Regra que precede as três: ausência de dado não é contraprova

Do princípio do [DF-21](df21-ficha-prototipo.md) §3.2 e do [DF-19](df19-catalogo-maturidade.md)
RF-4.8 — **as ferramentas do portal são caminho fácil, nunca obrigação** — segue uma regra que
vale para toda contraprova:

> Contraprova compara valores que **existem**. Projeto sem gaiola modelada, ficha com o campo
> vazio, guia que a equipe mantém fora do portal: nada disso contradiz uma declaração. A
> declaração fica **vigente**, e a tela diz que não há como conferir aqui.

A única exceção é o critério cujo enunciado **afirma a existência do dado** — `EST-1.1` diz que o
projeto está registrado no portal; aí a ausência contradiz o que foi declarado, e não uma inferência
sobre o carro.

Sem esta regra, a aferição transformaria "não usei esta ferramenta" em "menti", que é o oposto do
que a feature existe para fazer — e tornaria o validador obrigatório pela porta dos fundos.

### 2.1 Contradição direta — o dado nega o critério

O portal mede exatamente aquilo que o critério afirma, e o valor medido é incompatível.

- **Efeito:** derruba na hora. A declaração fica suspensa e o nível da área recalcula.
- **Exemplo canônico:** `EST-3.1` declarado, e a última versão salva tem 3 infrações automáticas.
- **Regra de admissão:** só entra aqui a contraprova em que o dado medido e o enunciado do critério
  falam **do mesmo fato**. Se for preciso um "logo" no meio do raciocínio, é indício, não
  contradição.

### 2.2 Indício quantitativo — o número torna a declaração implausível

O portal mede algo correlacionado, forte o bastante para justificar uma pergunta e fraco demais
para justificar um veredito.

- **Efeito:** suspende **e pede justificativa**. Reafirmar é possível e exige nota, que fica no
  histórico do critério e aparece na tela ao lado dele.
- **Exemplo canônico:** `DIN-3.1`/`DIN-3.2` declarados, com massa da gaiola 55% acima da mediana
  dos protótipos salvos. A pergunta devolvida é _"a massa está 55% acima da mediana — o setup foi
  calculado com esta massa?"_.
- **Honestidade da inferência, que é requisito e não ressalva:** massa alta **não prova** dinâmica
  longitudinal ruim. Potência, relação de transmissão e pneu entram na conta e o portal não os
  conhece. Por isso este mecanismo não derruba: ele obriga a equipe a olhar o número e responder.
  Se a resposta for "o carro é pesado de propósito", a nota registra isso — e a geração seguinte lê
  a decisão em vez de repetir a dúvida.

### 2.3 Piso de atividade — sem uso do portal, declaração não sustenta nada

A equipe declarou critérios de várias áreas, mas não há nenhum rastro de operação no portal.

- **Efeito:** suspende **todas** as declarações sob **um aviso único**, e o painel volta ao caminho
  mínimo (organograma → protótipo da temporada → primeira decisão). Nunca seis barras acusatórias.
- **Regra:** nenhuma evidência de nenhum produtor nos últimos 90 dias **e** organograma inexistente.
  As duas condições juntas — só a segunda seria injusta com equipe pequena, só a primeira com
  equipe em recesso.
- **Por que existe:** é o caso em que a autoavaliação não erra por otimismo, mas por não ter lastro
  nenhum. Tratá-lo critério a critério produziria dez avisos idênticos.

## 3. Estados de uma declaração

| Estado             | Significado                                             | Conta para o nível |
| ------------------ | ------------------------------------------------------- | ------------------ |
| **vigente**        | declarada, nenhuma contraprova disparou                 | sim                |
| **em contraprova** | uma contraprova disparou; motivo visível na tela        | **não**            |
| **reafirmada**     | indício respondido com justificativa; nota no histórico | sim                |
| **revogada**       | a própria equipe desmarcou                              | não                |

- **RF-3.1** A declaração **nunca é apagada** por uma contraprova. Ela é suspensa, com autor, data
  e o motivo à vista. Só a própria equipe revoga.
- **RF-3.2** Contraprova de **contradição direta** não admite reafirmação: o caminho é consertar o
  dado (salvar versão conforme, criar o organograma). Reafirmar aqui seria pedir ao portal que
  ignorasse o que ele mesmo mediu.
- **RF-3.3** Contraprova de **indício** admite reafirmação uma vez por temporada; reafirmação
  exige nota (≤ 500) e mantém o chip "reafirmada" visível no critério, com a nota.
- **RF-3.4** Contraprova que deixa de valer (a equipe salvou versão conforme) devolve a declaração
  a **vigente** automaticamente, sem exigir nova declaração — e o nível sobe de volta.

## 4. Catálogo de contraprovas

Cada linha aponta para o critério do DF-19 §5 e para a evidência que já existe.

### Onda V1 — sem ferramenta nova, sai junto do DF-18

| Critério                  | Evidência                     | Mecanismo         | Dispara quando                                                      |
| ------------------------- | ----------------------------- | ----------------- | ------------------------------------------------------------------- |
| `EST-1.1`                 | `validation.summary` + ficha  | contradição       | não há versão salva **nem** ficha com conteúdo                      |
| `EST-2.1`                 | `validation.summary`          | contradição       | há pendências de presença na última versão salva                    |
| `EST-3.1`                 | `validation.summary`          | contradição       | há ≥ 1 infração automática na última versão salva                   |
| `DIN-1.1`                 | `org.summary`                 | contradição       | os papéis de dinâmica/powertrain não têm ocupante                   |
| `DIN-2.1`                 | `validation.summary`          | contradição       | há ancoragem de suspensão sem apoio (SUSP.1)                        |
| `DIN-2.2`                 | `validation.summary`          | contradição       | ancoragem de direção declarada e sem apoio (STEER.1)                |
| `FAB-2.1`                 | `template.generated`          | contradição¹      | nenhum gabarito gerado **e** a equipe não declarou gabarito externo |
| `FAB-3.1`                 | `knowledge.summary`           | contradição       | não há guia publicado com a etiqueta de solda                       |
| `GES-1.1`                 | `org.summary`                 | contradição       | organograma inexistente ou capitania irregular                      |
| `GES-2.1`                 | `org.summary`                 | contradição       | há cargo de liderança vago                                          |
| `GES-3.1`                 | `season.configured`           | contradição       | temporada sem marcos datados                                        |
| `CON-1.1` … `CON-4.2` (7) | `knowledge.summary` + eventos | contradição       | o contador do próprio critério não bate                             |
| `GES-2.2`                 | atividade da equipe           | indício           | zero evidência de qualquer produtor em 60 dias                      |
| **todas as declarações**  | atividade + organograma       | piso de atividade | zero evidência em 90 dias **e** organograma inexistente             |

São **19 critérios** com contraprova na V1 — 18 de contradição direta e 1 de indício (`GES-2.2`),
mais o piso de atividade, que é de equipe. Mesma contagem da coluna "com aferição em V1" da tabela
do DF-19 §6.

**Todas as linhas que leem o validador** (`EST-2.1`, `EST-3.1`, `DIN-2.1`, `DIN-2.2`, `FAB-2.1`)
carregam a precondição do §2.0: **só disparam quando existe versão salva de gaiola** para o
projeto da temporada. Sem gaiola no portal, a declaração fica vigente e a tela diz "sem como
conferir aqui — o projeto não está modelado no validador". ¹ `FAB-2.1` tem ainda a saída do
gabarito externo (DF-19 §5.4).

### Onda V2 — exige base de comparação nova

| Critério                                                         | Evidência                                      | Mecanismo | Nota                                                          |
| ---------------------------------------------------------------- | ---------------------------------------------- | --------- | ------------------------------------------------------------- |
| `DIN-3.1`, `DIN-3.2`                                             | massa estimada × mediana dos protótipos salvos | indício   | precisa do piso de 8 protótipos e da decisão de classe (§5.2) |
| `EST-2.2`                                                        | classe de material × equivalência B6.3.3.2     | indício   | o motor já faz a equivalência; falta cruzar com a declaração  |
| `EST-4.2`                                                        | autoria por versão em `snapshots`              | indício   | revisor declarado que nunca abriu o projeto                   |
| `DOC-3.1`                                                        | marco de entrega em `team_season` × data       | indício   | declaração de envio no prazo depois da data do marco          |
| `DOC-3.2`, `FAB-5.1`, `GES-4.1`, `DIN-5.1`, `EST-5.2`, `CON-5.1` | contadores e janelas                           | indício   | detalhados na implementação da onda                           |

### Onda V3 — depende de ferramenta futura

`EST-4.1` e `DOC-4.2` viram `auto` quando a ficha da gaiola (Anexo B) for gerada pelo portal.

### Sem onda — seguem só declarados

`EST-3.2`, `EST-5.1`, `DIN-4.1`, `DIN-4.2`, `DIN-5.2`, `DOC-1.1`, `DOC-2.1`, `DOC-4.1`, `DOC-5.1`,
`FAB-1.1`, `FAB-2.2`, `FAB-3.2`, `FAB-4.1`, `GES-3.2`, `GES-4.2`, `GES-5.1`, `GES-5.2`, `CON-5.2`.

FEA, orçamento, parcerias e ritos presenciais acontecem **fora** do portal. A tela diz isso, com o
mesmo rótulo do DF-13 RF-3.3 — o usuário nunca fica em dúvida sobre o que é conferido e o que é
palavra da equipe.

## 5. Requisitos

### E1 — Motor

- **RF-1.1** `CATALOG_MODE = 'aferido'`. Cada critério ganha, opcionalmente,
  `counterCheck(evidences, declaration, now): CounterCheckResult | null` — função **pura**, no
  mesmo pacote, testada por fixture.
- **RF-1.2** `CounterCheckResult` = `{ kind: 'contradiction' | 'indication', message, measured }`.
  `message` é canônica no pacote (mesma regra do DF-19 AC-9): a tela não reescreve.
- **RF-1.3** O piso de atividade é uma contraprova **de equipe**, avaliada antes das individuais;
  quando dispara, as demais não são avaliadas (um aviso, não vinte).
- **RF-1.4** Ordem do cálculo: declarações → contraprovas → estados → níveis → patente. A patente
  do DF-18 não conhece contraprova; ela lê níveis já aferidos.
- **RF-1.5** Alternar o modo não exige migração (DF-19 AC-10): é o mesmo dado, outro cálculo.

### E2 — Dados

- **RF-2.1** `evolution_declarations` ganha `reaffirmed_at`, `reaffirmed_by`, `reaffirm_note`.
  O estado **em contraprova** é derivado — não é coluna, porque depende da evidência do momento.
- **RF-2.2** Disparo e cessação de contraprova geram evidência
  `counter.raised` / `counter.cleared` `{criterionId, kind, measured}`, que alimenta a atividade.
- **RF-2.3** Reafirmação audita (`evolution.reaffirm`) com ator, data e nota.

### E3 — API

| Método/rota                                            | Ação                             | Permissão           |
| ------------------------------------------------------ | -------------------------------- | ------------------- |
| `POST /teams/:id/evolution/declarations/:cid/reaffirm` | responder a um indício, com nota | `evolution.declare` |

`GET /teams/:id/evolution` passa a devolver, por critério, `state` e a `counterCheck` quando houver.
Nenhuma rota nova além da reafirmação.

### E4 — UI

- **RF-4.1** Critério em contraprova aparece com o enunciado riscado, chip
  **EM CONTRAPROVA** (`--bj-warn`, com ícone — CT-3), autor e data da declaração original, e uma
  caixa com a mensagem da contraprova e o valor medido.
- **RF-4.2** Duas ações na caixa: **Responder** (só para indício) e o atalho que conserta o dado
  ("Abrir o protótipo", "Criar o organograma") — a ação de consertar vem sempre antes da de
  justificar.
- **RF-4.3** Piso de atividade substitui a tela inteira da aba por um único aviso e o caminho
  mínimo, com o texto do DF-13 RF-6.3 (bootstrap).
- **RF-4.4** A atividade da equipe narra disparo e cessação em uma linha, sem alarde:
  "Estrutura voltou ao nível 2 — a v14 introduziu 3 não conformidades".

## 6. Pontos de falha e mitigação

| ID    | Ponto de falha                                                  | Mitigação                                                                                              |
| ----- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| P-1.1 | Contraprova injusta destrói a confiança na feature inteira      | Só contradição derruba; indício pergunta. Toda mensagem mostra o valor medido, para a equipe conferir  |
| P-1.2 | Indício de massa vira "o portal disse que nosso carro é ruim"   | Texto é pergunta, nunca veredito (§2.2); a nota da equipe fica visível ao lado do critério para sempre |
| P-1.3 | Mediana de massa sem base suficiente                            | Piso de 8 protótipos salvos, igual ao benchmark do DF-13 RF-7.2; abaixo disso a contraprova não existe |
| P-1.4 | Comparar massa entre projetos incomparáveis (biplace, 4×4)      | **Questão aberta §8.1** — sem classe de projeto, a V2 do `DIN-3.x` não entra                           |
| P-2.1 | Equipe deixa de declarar para não arriscar contraprova          | Não declarar já não sobe nível; o custo de declarar é zero. Vigiar no piloto assim mesmo               |
| P-2.2 | Equipe para de salvar versão ruim para não disparar contradição | É o risco herdado do ADR-010 dec. 3, e a carência de 30 dias da patente (DF-18) é o amortecedor        |
| P-3.1 | Contraprova pesa no Aurora 0 ACU a cada leitura                 | Avaliada no mesmo recálculo já existente (por evidência e diário), nunca por requisição de leitura     |

## 7. Critérios de aceite

| #          | Critério                                                                                                    |
| ---------- | ----------------------------------------------------------------------------------------------------------- |
| AC-DF20.1  | `EST-3.1` declarado + versão salva com 1 infração → estado `em contraprova`, nível de Estrutura cai         |
| AC-DF20.2  | Salvar versão conforme devolve `EST-3.1` a `vigente` sem nova declaração, e o nível sobe                    |
| AC-DF20.3  | `DIN-3.1` declarado + massa 55% acima da mediana → `em contraprova` com a mensagem e o valor medido         |
| AC-DF20.4  | Reafirmar `DIN-3.1` com nota devolve ao cálculo e mostra o chip "reafirmada" com a nota                     |
| AC-DF20.5  | Reafirmar uma contradição direta é recusado (400) — só indício aceita reafirmação                           |
| AC-DF20.6  | Equipe sem evidência em 90 dias e sem organograma: um aviso, nenhuma contraprova individual, caminho mínimo |
| AC-DF20.7  | Coorte de protótipos abaixo do piso de 8: contraprova de massa não dispara                                  |
| AC-DF20.8  | Reafirmação exige `evolution.declare`; membro comum recebe 403                                              |
| AC-DF20.9  | `counter.raised`/`counter.cleared` aparecem na atividade com a causa em uma linha                           |
| AC-DF20.10 | Fixtures do motor: as 19 contraprovas da V1 disparam e cessam nos casos de borda documentados               |
| AC-DF20.11 | **Projeto sem gaiola salva: nenhuma contraprova de validador dispara**; as declarações ficam vigentes       |
| AC-DF20.12 | Campo de ficha vazio não contradiz declaração; a tela mostra "sem como conferir aqui"                       |

## 8. Questões em aberto

1. **Classe de projeto para comparar massa.** ~~Comparar por classe exige um campo que não
   existe.~~ **Resolvido pelo [DF-21](df21-ficha-prototipo.md) §5.1** (ocupantes + tração, campos
   marcados como comparáveis). A onda V2 do `DIN-3.x` passa a depender do EV-11, não de uma
   decisão em aberto — e ganha contraprovas novas de brinde: massa medida × massa alvo declarada,
   folga de capacete medida × calculada.
2. **Limiar do indício de massa.** 50% acima da mediana é o número que o product owner sugeriu e
   está no exemplo; não foi medido contra o acervo de projetos salvos, porque ele ainda é pequeno.
3. **Reafirmação e temporada.** Uma vez por temporada é o proposto; se a massa não mudar entre
   temporadas, a equipe reafirma todo ano a mesma coisa. Talvez a reafirmação deva durar enquanto
   o valor medido não piorar.
4. **Aferição × opt-out.** Equipe que desativa a avaliação e reativa depois de um ano volta com
   contraprovas disparando em bloco. Vale suprimir a narração de disparo na reativação.

## 9. Plano

Fase **EV-10**, depois do EV-9 (patentes) e **depois de ao menos uma temporada de v1
autodeclarativa** — sem esse período não há divergência acumulada para calibrar as mensagens.

| Sub     | Entrega                                                                    |
| ------- | -------------------------------------------------------------------------- |
| EV-10.1 | `counterCheck` no motor + as 19 contraprovas da onda V1 + fixtures         |
| EV-10.2 | Estados na API, reafirmação, evidências `counter.*`, narração na atividade |
| EV-10.3 | UI do critério suspenso, piso de atividade, atalhos de conserto            |
| EV-10.4 | Onda V2 — **bloqueada** pela questão §8.1 (classe de projeto)              |

**Gate:** relatório do piloto com a taxa de divergência entre declaração e medida por área
(coletada de graça pelo pré-preenchimento do DF-19 RF-1.3). Área com divergência alta é onde a
contraprova mais importa — e é onde a mensagem precisa estar mais bem escrita.
