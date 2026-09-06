# DF-33 — Calendário de competições: marcos, prazos, informativos e links oficiais

- **Status:** proposto em 2026-09-06; **implementada em 2026-09-06** (branch
  `feat/df33-calendario`) com a decisão do §10.2 tomada pela rota pública cacheada na borda
  (§6). Fecha no próprio draft — não vai para `spec.md`, que é do validador. Ficaram para v2:
  vista Mês (§10.6) e lista de revisões (§10.5); `seasonLabel` do DF-13 continua texto livre
  (§10.4 — a raia da equipe usa o rótulo como está).
- **Pedido do dono do produto (literal):** "uma seção do portal onde mostre o calendário de
  competições com marcos importantes como prazos que as equipes têm que cumprir e lançamentos de
  informativos. Siga a referência do site saebrasil.org.br, coletando da seção Programas
  Estudantis tudo o que for relacionado a Baja. Esse calendário deve ser visual e interativo,
  priorizando a usabilidade e a visibilidade do usuário."
- **Dependências:** DF-15 (tabela `competitions` e a aba Comunidade), DF-12/DF-24 (shell, rail e
  `communityTab`), DF-9 (administração — a curadoria mora lá), DF-13 (`team_season`: marcos da temporada, competições, fila de passos; aba **Equipe › Projetos**, onde a temporada é configurada), DF-16 (Início consome "próximo prazo"), DF-25 (padrão de página sem conta).
- **Documentos:** [índice de drafts](../draft-features.md) · [DF-15](df15-comunidade-resultados.md)
  · [DF-34](df34-regulamento-leitor.md) (irmã: usa o mesmo acervo de fontes oficiais) ·
  [design-system](../../docs/design-system.md) C-07, C-09, C-11, C-12, C-16 ·
  canvas ["Calendário e Regulamento"](https://claude.ai/code/artifact/03837ff6-b954-4cf4-a13b-2a6325a4ac3b)
  (página "Calendário").
- **Disclaimer obrigatório (pedido do dono do produto, texto fixo):** toda página desta spec
  carrega, visível sem rolar, o aviso: _"O Portal é um facilitador de acesso à informação e não
  substitui a leitura integral do material direto da fonte. O usuário deve sempre verificar o
  documento oficial vigente referente à competição que lhe afeta e tomar qualquer decisão baseada
  no documento oficial."_ Ver §4.6.

## 1. Contexto e motivação

A organização publica o que a equipe precisa cumprir em **quatro lugares diferentes**, um por
competição, cada um com sub-páginas próprias (Informações e Local, Inscrições, Regras, Mensagens e
Informativos, Requisitos). Os prazos ficam numa tabela na página de Informações, os valores e os
lotes na página de Inscrições, e as datas que mudam ao longo da temporada chegam por **informativo
numerado em PDF** — 28 em 2026, 42 em 2025 — mais um grupo de Telegram e um fórum. Não há RSS,
nem API, nem calendário exportável. O levantamento completo está no §12.

O que isso custa para a equipe é o que a pesquisa de mercado já mediu como problema nº 1
(rotatividade): quem entrou este ano não sabe que a inscrição de integrantes fecha em janeiro,
que a associação precisa estar vigente antes disso, e que perder um lote muda o valor da
inscrição. A capitania descobre pelo grupo, quando descobre.

O portal já tem a metade estrutural: `competitions` (DF-15) guarda temporada, tipo, região,
datas, local e URL da fonte, e o DF-13/DF-16 já prometem "próximo prazo · próxima competição" na
faixa de temporada — só que hoje não existe **prazo** nenhum no banco, só a competição. Esta spec
dá o dado que falta (marcos e informativos, cada um com a fonte) e uma superfície para ele.

## 2. Objetivos e não-objetivos

**Objetivos**

- Um lugar só para ver, por temporada, **todas** as competições Baja (Nacional + três regionais),
  seus marcos (prazos, janelas, eventos) e os informativos publicados, cada item com o link da
  fonte oficial e a data em que o portal conferiu.
- Leitura em duas velocidades: **linha do tempo** (a temporada inteira num olhar) e **lista** (o
  que vence, em ordem, com contagem regressiva).
- Recorte pessoal: a equipe marca no portal em quais competições está **inscrita** e quais
  **acompanha por interesse**, e o calendário dela mostra só o que é relevante — mais a categoria
  de inscrição, para os lotes.
- **Um calendário só, para a equipe:** os marcos e entregas que a equipe configura na própria
  temporada (Equipe › Projetos, DF-13) aparecem na mesma linha do tempo e na mesma lista que os
  prazos oficiais — o plano da equipe lido contra o calendário da organização.
- Alimentar o que já existe: a faixa de temporada (DF-13), o Início (DF-16) e a fila de passos
  (DF-13) passam a ter um prazo real de onde puxar.
- Exportar para o calendário que a equipe já usa (`.ics`) — o portal não manda e-mail (decisão do
  DF-26) e não vai virar o lembrete de ninguém.

**Não-objetivos**

- **Não** raspar o site da organização automaticamente em produção (§10.1: o site respondeu
  `403` a cliente não-browser e mudou URL de sub-página entre 2025 e 2026). A curadoria é
  humana, com ferramenta de apoio.
- **Não** reproduzir o conteúdo dos informativos — o portal guarda título, número, data e link.
  O PDF é lido na fonte.
- **Não** usar identidade visual da organização (restrição do DF-15). A fonte é citada por URL.
- **Não** notificar por e-mail, push ou Telegram.
- **Não** guardar calendário interno da equipe (reunião, teste de pista): isso é a fila de passos
  do DF-13, e um marco daqui pode virar um passo lá (FR-DF33.14).

## 3. Conceito

### 3.1 Três entidades, uma fonte por linha

| Entidade                   | O que é                                                                                                  | Exemplo                                                          |
| -------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| **Competição** (DF-15)     | Edição de uma etapa, com datas e local                                                                   | Nacional 2027 · 31 mar–4 abr · São José dos Campos               |
| **Marco** (novo)           | Algo com data que a equipe precisa cumprir ou saber: prazo, janela, evento, comunicado                   | "Inscrição de integrantes e orientadores" · até 25 jan · Inf. 09 |
| **Documento-fonte** (novo) | Página ou arquivo oficial de onde o marco saiu: informativo, página de inscrições, regulamento, template | Informativo 09 – Inscrição de Integrantes e Associação (PDF)     |

Todo marco aponta para **um documento-fonte** (o informativo que o instituiu ou a página que o
lista) e carrega `checked_at` — a data em que alguém do portal conferiu a fonte. Isso segue o
padrão do DF-15 ("fonte citada em cada linha") e é o que torna o disclaimer honesto: o portal
mostra de onde tirou e quando olhou.

### 3.2 Ciclo, não ano civil

A temporada Baja atravessa o ano: a inscrição do Nacional 2027 abre em **julho de 2026**, as
regionais de 2026 correm entre setembro e novembro, e o Nacional acontece em março/abril de 2027.
O calendário mostra um **ciclo** — do 1º de julho ao Nacional — rotulado pelo ano do Nacional
("Temporada 2027"), com as regionais do ano anterior dentro. Os nomes das competições continuam
os do DF-15 (ano em que ocorrem: "Regional Sul 2026"). Alinhamento com o `seasonLabel` do DF-13 é
questão aberta (§10.4).

### 3.3 Quem pode ver

O calendário é informação pública sobre fonte pública. **Quem não tem conta vê tudo** (mesma
lógica da vitrine do DF-25: é o que o portal promete antes do cadastro). O que exige conta é o
recorte pessoal (§4.4), o `.ics` com filtro da equipe e "transformar em passo".

### 3.4 Curadoria assistida, não raspagem

A fonte muda de forma irregular (a página de Informações do Nacional 2027 ainda listava os prazos
de 2026 em 6 set 2026) e bloqueia cliente automatizado. O dado entra pela **administração**
(DF-9, aba nova "Calendário") com um assistente de colagem: a pessoa cola a tabela "ATIVIDADE ·
LOCAL · PRAZO · INFORMATIVO" da página oficial, o portal propõe os marcos, a pessoa confere e
salva com `checked_at`. Um script local de conferência (`scripts/check-calendar.mjs`) pode
apontar divergência entre o que está no banco e o que a página mostra, **rodado por uma pessoa,
em dry-run** — nunca em produção, nunca escrevendo sozinho.

### 3.5 Dois calendários, uma tela

A equipe já tem um calendário no portal: a **temporada** do DF-13 (`team_season`), configurada
em Equipe › Projetos com rótulo, projeto da temporada e até 12 marcos datados (`{title, date}`),
que alimenta a faixa de temporada, a contagem regressiva do Início e o critério GES-3.1. Ela
também sabe, em `competition_ids`, em que competições a equipe está — só que hoje nenhuma tela
deixa marcar isso.

Esta spec junta os dois lados numa vista só, **para quem é da equipe**: a linha do tempo ganha a
raia **"Sua temporada"** no topo, com os marcos e entregas da equipe, acima das raias oficiais; a
lista intercala os dois por data, com o marco da equipe identificado. A leitura que isso compra é
a que nenhum dos lados dá sozinho: "o relatório que a gente prometeu para 10 de dezembro está a
duas semanas do vencimento do 3º lote" — e o que está fora do interesse da equipe some.

Os dois calendários **não se misturam no dado**: marco oficial mora em `competition_milestones`
(curadoria, fonte, `checked_at`); marco da equipe mora em `team_season.milestones` (privado,
RLS da equipe, editado na aba Projetos). O que os liga é opcional e explícito: um marco oficial
pode ser **adicionado à temporada** da equipe (FR-DF33.29), e a cópia guarda de onde veio.

## 4. Requisitos funcionais

### 4.1 Página e navegação

- **FR-DF33.1** Nova aba **Calendário** na página Comunidade (`communityTab: 'calendario'`),
  terceira depois de Resultados e Equipes do Brasil; aparece também como sub-item do rail sob
  Comunidade (DF-24). Sem marca de produto e sem glifo novo: sub-item de aba não ganha ícone
  (Shell.tsx, `SubItem.Mark` é só para ferramenta).
- **FR-DF33.2** A aba abre **sem sessão**. Os sub-itens de Comunidade hoje exigem conta
  (`subsExigemConta`); esta aba é exceção declarada, com o mesmo `PrecisaDeConta` do DF-25 só nos
  controles pessoais (§4.4).
- **FR-DF33.3** Cabeçalho da aba: seletor de **temporada** (ciclo, §3.2; padrão = ciclo corrente),
  filtro por competição em chips alternáveis (Nacional · Nordeste · Sudeste · Sul), alternador
  de vista (**Linha do tempo · Lista**; "Mês" fica para v2, §10.6) e o alternador pessoal (§4.4).
  Estado dos filtros vive em `session.ts` (regra P-1.4 do DF-12: nada de `useState` órfão de
  navegação) e sobrevive à troca de página.

### 4.2 Vista Linha do tempo

- **FR-DF33.4** Eixo horizontal por mês, do 1º de julho ao fim do Nacional; uma **raia por
  competição** (ordenadas por data do evento). Na raia: a **faixa** do evento (datas da
  competição), a **janela** de inscrição (faixa mais clara) e os **marcos** como pontos com
  rótulo curto. Linha vertical **"hoje"** e a região passada em tom rebaixado.
- **FR-DF33.5** Cada marco tem redundância não-cromática (DS §9.3 vale para 2D também): forma do
  ponto por tipo (prazo = losango, janela = barra, evento = faixa, comunicado = círculo vazado, marco da equipe = quadrado vazado) e
  rótulo textual; cor só reforça. Estados: futuro (`--bj-fg-primary`), vence em ≤ 7 dias
  (`--bj-warn` + chip "EM 5 DIAS"), passado (`--bj-fg-muted`), vence hoje (`--bj-warn` + "HOJE").
- **FR-DF33.6** Marco e faixa são focáveis por teclado (botões), com `aria-label` completo
  ("Inscrição de integrantes, até 25 de janeiro de 2027, Nacional 2027, fonte Informativo 09").
  Setas ←/→ percorrem os marcos da raia; Enter abre o painel (§4.5).
- **FR-DF33.7** Abaixo da linha do tempo, bloco **"Próximos 30 dias"**: até cinco marcos em lista
  compacta com contagem regressiva ("faltam 9 dias") — é a leitura de quem só quer saber o que
  vence.
- **FR-DF33.8** Em largura < 1024px a linha do tempo **não é desenhada**: a aba abre direto na
  Lista. Linha do tempo com rolagem horizontal em celular esconde o que importa.

### 4.3 Vista Lista

- **FR-DF33.9** Marcos agrupados por mês, em ordem de data, uma linha por marco: data em mono
  (`--bj-font-mono`, dia + mês), título, chip neutro da competição, fonte ("Informativo 09"),
  estado (chip C-07). Passados ficam sob "Já passou" colapsado (C-10), abertos sob demanda.
- **FR-DF33.10** Cada linha é um botão que abre o painel de detalhe (§4.5). Nada de link direto
  para fora a partir da lista: o portal explica antes de mandar para a fonte.
- **FR-DF33.11** Informativos aparecem na lista como marcos do tipo `comunicado` na data de
  publicação (é "lançamento de informativo" no pedido do dono do produto) — e o informativo que
  cria um prazo aparece também como fonte do marco do prazo. Filtro rápido no cabeçalho da lista:
  "Só prazos · Tudo".

### 4.4 Recorte pessoal e a temporada da equipe (exige conta e equipe)

- **FR-DF33.12** A equipe declara, por competição do ciclo, se está **inscrita** ou se
  **acompanha por interesse** — e em qual **categoria de inscrição** (novata · light · integral ·
  promocional, as quatro da página de Inscrições). Onde: no formulário **Configurar temporada**
  da aba Equipe › Projetos (DF-13), que hoje só tem rótulo e marcos, e também pelo cabeçalho de
  cada raia do calendário ("Estamos inscritos" · "Acompanhar"), que faz a mesma gravação.
  Persistência: `team_season.competition_ids` (inscrita, campo que já existe e o DF-13/DF-15
  já leem), `team_season.interest_competition_ids` (novo) e `team_season.registration_kind`
  (novo; nulo = mostra todos os lotes). Permissão: `evolution.season` (capitania).
- **FR-DF33.13** Alternador **"Só o que afeta minha equipe"**: mostra as competições inscritas e
  as de interesse, e esconde as demais; marco com `applies_to` (lista de categorias) só aparece
  se a categoria da equipe estiver nele. Sem recorte, tudo aparece e o marco de categoria leva o
  chip da categoria ("INTEGRAL · 2º LOTE"). **Padrão:** o alternador nasce **ligado** quando a
  equipe tem ao menos uma competição marcada, e **desligado** (com a explicação e o link para
  Configurar temporada) quando não tem — nunca uma lista vazia em silêncio.
- **FR-DF33.14** Ação **"Transformar em passo"** no painel do marco: cria passo na fila do DF-13
  com `origin: 'calendario'`, título pré-preenchido e `due_on` = data do marco, com link de volta.
  Permissão `step.manage`. Mesmo mecanismo do "Transformar em meta" do DF-15 RF-3.3.
- **FR-DF33.26** Cabeçalho de cada raia (e da linha da competição na lista) mostra o vínculo da
  equipe como chip: `INSCRITA` (brand) ou `INTERESSE` (tracejado). Sem vínculo, sem chip. Só
  quem é da equipe vê isso; sem conta, o calendário é o público.
- **FR-DF33.27** **Raia "Sua temporada · <rótulo>"** no topo da linha do tempo, fundo
  `--bj-selected`, com os marcos de `team_season.milestones` como marcos do tipo `equipe`
  (quadrado vazado, cor `--bj-accent`); o rótulo mostra o `kind` quando há ("Entrega:
  relatório de projeto"). Sem marco configurado, a raia mostra uma linha só: "Configure a
  temporada em Equipe › Projetos" com o link. A raia **não existe** sem sessão da equipe.
- **FR-DF33.28** Na lista, os marcos da equipe entram **intercalados por data** com os oficiais,
  com chip `EQUIPE` no lugar da competição e "Temporada <rótulo>" no lugar da fonte. O filtro
  rápido ganha a terceira opção: "Tudo · Só prazos oficiais · Só minha equipe". O "Próximos 30
  dias" e o "próximo prazo" do Início (DF-16) passam a considerar as duas origens.
- **FR-DF33.29** **"Adicionar à minha temporada"** no painel de um marco oficial (permissão
  `evolution.season`): copia título e data para `team_season.milestones` com
  `sourceMilestoneId`, pelo mesmo `PUT /teams/:id/season` que a aba Projetos usa. A cópia
  aparece na faixa de temporada e na contagem regressiva do DF-13 como qualquer outro marco. Se a
  organização mudar a data do original (novo `checked_at`), a cópia **não muda sozinha**: o
  painel do marco da equipe mostra "a fonte agora diz <data> — atualizar?" com um botão.
- **FR-DF33.30** Painel do marco da equipe: título, data e contagem, `kind`, quem configurou e
  quando (`team_season.updated_at`), origem quando copiado (link ao marco oficial), ações
  **Editar na aba Projetos** (abre Equipe › Projetos com o formulário aberto), **Transformar em
  passo**, **Remover** (`evolution.season`). Sem "fonte oficial" — o rodapé do painel diz que é
  marco interno da equipe e mantém o disclaimer (§4.6).
- **FR-DF33.31** Marco da equipe é **privado**: nunca sai na rota pública, no `.ics` público
  nem na vitrine; entra no `.ics` com `teamId` (sessão da equipe) com `CATEGORIES:Equipe`.

### 4.5 Painel de detalhe do marco

- **FR-DF33.15** Painel lateral (`--bj-panel-w`, C-10/C-13 padrão do DF-21 para ficha) com:
  título, data e contagem ("até 15 set 2026 · faltam 9 dias"), competição, tipo, categorias a
  que se aplica, **descrição curta curada** (≤ 280 caracteres, escrita pela administração —
  paráfrase, nunca cópia do informativo), **fonte**: nome do documento + link + "conferido em
  <data>", e ações: **Abrir a fonte oficial ↗** (nova aba), **Adicionar ao calendário (.ics)**,
  Transformar em passo (§4.4), **Perguntar ao assistente** (só se o marco tiver `section_id` do
  regulamento — ex.: prazos de documentação do C3 — abre o DF-8 com contexto).
- **FR-DF33.16** O rodapé do painel repete o disclaimer (§4.6) em `--bj-text-sm`. É onde a pessoa
  está prestes a agir; é onde o aviso paga.

### 4.6 Disclaimer e frescor

- **FR-DF33.17** Faixa fixa no topo do conteúdo da aba (nova variante `fonte` da C-09, §7.2), com
  ícone `IconInfoCircle` + o texto integral do disclaimer (cabeçalho desta spec). Não fecha, não
  colapsa, não some ao rolar a lista (é `position: sticky` abaixo das abas). Renderizada também
  no `PrecisaDeConta` da aba e no rodapé do painel (FR-DF33.16).
- **FR-DF33.18** Cada competição mostra "Fonte conferida em <data> · página oficial ↗". Se
  `checked_at` tiver mais de **30 dias** e houver marco futuro naquela competição, a linha ganha
  chip `VERIFICAR` (C-07 `warn`) e o texto "pode estar desatualizado — confira a fonte". O portal
  prefere dizer que não sabe a parecer atualizado.
- **FR-DF33.19** Estado vazio (C-16) por temporada sem dado: "A temporada 2028 ainda não foi
  publicada pela organização" + link para a página oficial da agenda.

### 4.7 Exportação

- **FR-DF33.20** `GET /community/calendar.ics?season=2027[&teamId=]` devolve um iCalendar com um
  `VEVENT` por marco (dia inteiro; `UID` estável = id do marco; `URL` = fonte; `DESCRIPTION` = a
  descrição curta + "Fonte: <nome> — confira o documento oficial") e um por competição (multi-dia).
  Com `teamId`, aplica o recorte pessoal (exige sessão da equipe). Sem `teamId`, é público e
  cacheável.
- **FR-DF33.21** O botão do painel gera `.ics` de **um** marco no cliente (blob) — sem chamada à
  API; o da aba inteira chama o endpoint acima.

### 4.8 Administração (DF-9)

- **FR-DF33.22** Aba **Calendário** na administração: lista de competições da temporada (CRUD do
  DF-15 RF-1.1, que hoje só existe por script) e, por competição, seus marcos, documentos-fonte
  e links úteis. Todo salvar carimba `checked_at` = agora e registra em `audit_events`
  (`calendar.milestone_upsert`, `calendar.source_upsert`).
- **FR-DF33.23** **Colar tabela**: campo de texto onde a pessoa cola a tabela "ATIVIDADE · LOCAL ·
  PRAZO · INFORMATIVO" copiada da página oficial; o portal separa por linha/tabulação, reconhece
  `dd/mm/aaaa` e "Informativo NN", e propõe marcos em rascunho para conferência antes de salvar.
  Regex simples, sem IA — o formato da tabela é estável desde 2023 (§12.3).
- **FR-DF33.24** Documento-fonte é único por URL. Informativo novo entra com número, título, data
  de publicação (a que consta no PDF ou a do dia em que apareceu na página) e competição.
- **FR-DF33.25** Links úteis por competição (inscrições, regras, informativos, requisitos,
  resultados, fórum do regulamento, canal oficial de comunicação) são documentos-fonte do tipo
  `pagina`/`canal` e aparecem no cabeçalho da raia e na lista, seção "Links oficiais".

## 5. Modelo de dados (proposta — migração `0011_calendar.sql`)

```sql
-- Documento ou página oficial de onde um marco saiu. Compartilhado com o DF-34.
CREATE TABLE source_documents (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id uuid REFERENCES competitions (id) ON DELETE SET NULL, -- nulo: vale para todas
  kind           text NOT NULL CHECK (kind IN
                   ('informativo','pagina','regulamento','template','forum','canal','outro')),
  number         integer,                    -- "Informativo 09" → 9
  title          text NOT NULL,              -- como a organização nomeia
  url            text NOT NULL UNIQUE,
  published_on   date,
  edition        text,                       -- "emenda-07", "Ver27"
  supersedes_id  uuid REFERENCES source_documents (id),
  checked_at     timestamptz NOT NULL DEFAULT now(),
  created_by     uuid REFERENCES users (id)
);

CREATE TABLE competition_milestones (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id uuid NOT NULL REFERENCES competitions (id) ON DELETE CASCADE,
  kind           text NOT NULL CHECK (kind IN
                   ('inscricao','pagamento','pessoas','documento','logistica','evento','comunicado')),
  title          text NOT NULL,
  summary        text CHECK (char_length(summary) <= 280),   -- paráfrase curada
  starts_on      date,                       -- janela: início; prazo: nulo
  due_on         date NOT NULL,              -- prazo, fim da janela ou data do evento/comunicado
  applies_to     text[] NOT NULL DEFAULT '{}', -- {'novata','light','integral','promocional'}
  source_id      uuid REFERENCES source_documents (id),
  section_id     text,                       -- seção do regulamento relacionada (DF-34), opcional
  status         text NOT NULL DEFAULT 'previsto' CHECK (status IN ('previsto','confirmado','cancelado')),
  checked_at     timestamptz NOT NULL DEFAULT now(),
  updated_by     uuid REFERENCES users (id),
  UNIQUE (competition_id, kind, title, due_on)
);

ALTER TABLE team_season ADD COLUMN registration_kind text
  CHECK (registration_kind IN ('novata','light','integral','promocional'));
ALTER TABLE team_season ADD COLUMN interest_competition_ids jsonb NOT NULL DEFAULT '[]'::jsonb;
-- team_season.milestones continua jsonb; cada item ganha dois campos opcionais:
--   kind: 'marco' | 'entrega'          (rótulo na raia e na lista)
--   sourceMilestoneId: uuid             (competition_milestones.id, quando copiado — FR-DF33.29)
-- O teto de 12 itens sobe para 24 (validação zod do PUT /teams/:id/season; §10.8).

-- Leitura pública das tabelas novas; escrita só pelo papel da API (admin via DF-9).
GRANT SELECT ON source_documents, competition_milestones TO bajeiros_app;
```

- Sem dado pessoal nas tabelas novas além de `created_by`/`updated_by` (pseudônimo, já coberto
  pelo contrato de `users`). Contrato ODCS novo `calendar.odcs.yaml` cobrindo as duas tabelas
  (classificação: público; retenção: indefinida — é acervo histórico, como `competitions`).
- `competitions` ganha `registration_opens_on` e `registration_closes_on` (a janela é da
  competição, não um marco solto) e `official_url` (a página do evento, hoje `source_url` guarda
  a fonte de resultados).

## 6. API

| Rota                                                 | Uso                                                                                                 | Auth               |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------ |
| `GET  /public/calendar?season=2027`                  | competições + marcos + fontes + links do ciclo                                                      | **pública**, cache |
| `GET  /public/calendar.ics?season=2027`              | iCalendar público                                                                                   | pública, cache     |
| `GET  /community/calendar?season=&teamId=`           | idem, com recorte pessoal e os marcos da equipe (`kind: 'equipe'`) intercalados                     | sessão da equipe   |
| `GET  /community/calendar.ics?season=&teamId=`       | iCalendar com recorte                                                                               | sessão da equipe   |
| `POST /teams/:id/steps` (existe, DF-13)              | "transformar em passo" com `origin: 'calendario'`                                                   | `step.manage`      |
| `PUT /teams/:id/season` (existe, DF-13)              | `registrationKind`, `interestCompetitionIds`, marcos com `kind`/`sourceMilestoneId` — sem rota nova | `evolution.season` |
| `POST/PATCH/DELETE /admin/calendar/milestones[/:id]` | curadoria                                                                                           | admin (DF-9)       |
| `POST/PATCH/DELETE /admin/calendar/sources[/:id]`    | curadoria                                                                                           | admin (DF-9)       |
| `POST /admin/calendar/parse-table`                   | colar tabela → rascunho de marcos (não persiste)                                                    | admin (DF-9)       |

**Rota pública fora do `requireAuth`.** O DF-28 acabou de tirar a única exceção que existia
(`/assistant`), e esta spec cria outra — com uma diferença: a rota pública lê dado público,
não gasta LLM e não tem quota. Para não acordar a Aurora a cada visitante, a resposta sai com
`Cache-Control: public, max-age=3600` e o behavior do CloudFront cacheia `/api/v1/public/*`
(TTL 1 h). Alternativa é o padrão do DF-25 (instantâneo estático datado no front, gerado no
deploy) — que não serve aqui porque a curadoria muda o dado sem deploy. Decisão do dono do
produto em §10.2.

## 7. UI

### 7.1 Canvas

Desenho no canvas ["Calendário e Regulamento"](https://claude.ai/code/artifact/03837ff6-b954-4cf4-a13b-2a6325a4ac3b),
página **Calendário**: linha do tempo (desktop, 1440×900), lista com painel de detalhe aberto e
a versão de celular (390). O desenho reproduz o shell real (`shell.css`, tokens de
`tokens.css`, tema escuro padrão) — a régua ocre, o rail com sub-itens do DF-24, a topbar com o
disclaimer do DF-12 e a página em `--bj-page-w`. A linha do tempo traz a raia **Sua temporada** no
topo (marcos e entregas da equipe — exemplos) e os chips `INSCRITA`/`INTERESSE` nos cabeçalhos das
raias; a lista está com o recorte ligado, com os marcos da equipe intercalados (chip `EQUIPE`).

### 7.2 Emendas ao design-system (entram no PR desta spec)

- **C-09 ganha a variante `fonte`** — faixa informativa fixa com `IconInfoCircle`, fundo
  `--bj-info-bg`, borda `--bj-info-border`, texto `--bj-fg-secondary` em `--bj-text-sm`,
  `position: sticky` abaixo das abas, sem botão de fechar. É a faixa do disclaimer nos DF-33 e
  DF-34; nasce no DS antes de nascer na tela.
- **C-26 — Linha do tempo (novo)**: raia, faixa de evento, janela, marco (cinco formas do FR-DF33.5, a quinta é o marco da equipe), raia da equipe (fundo `--bj-selected`), linha "hoje", cabeçalho de meses em `--bj-text-xs` maiúsculas com
  `--bj-tracking-wide`. Tokens: `--bj-bg-base` (raia), `--bj-brand-bg`/`--bj-brand-border`
  (faixa de evento), `--bj-accent-bg` (janela), `--bj-fg-primary`/`--bj-warn`/`--bj-fg-muted`
  (estados do marco). Altura da raia 56px; alvo mínimo de marco 32px (`--bj-target-min`) mesmo
  que o desenho seja menor.
- **Iconografia:** nenhum glifo novo. O inventário é medido pelo `check-icons` no PR, não citado
  aqui.

### 7.3 Voz

Rótulos no vocabulário do DS §11: "Inscrição de integrantes" e não "Deadline de membros"; datas
por extenso curto ("até 25 jan 2027"); contagem em dias inteiros ("faltam 9 dias", "vence hoje",
"passou há 3 dias"). Nome das competições como no DF-15 ("Nacional 2027", "Regional Sul 2026");
o texto nunca chama a organização pelo nome fora do link da fonte.

## 8. LGPD e licenciamento

- Sem dado pessoal novo. O recorte pessoal usa `team_season` (já contratado). `.ics` público não
  carrega nada da equipe.
- Títulos e datas de documentos públicos são fato, não obra; **o portal não copia o conteúdo dos
  informativos** (FR-DF33.15 exige paráfrase ≤ 280 caracteres). Link é link.
- Marca: nenhum logotipo, nome de programa ou identidade da organização fora do texto do link
  (restrição do DF-15 mantida). O disclaimer da topbar ("Sem vínculo com a organização da
  competição") continua em toda página.

## 9. Critérios de aceite

| #          | Critério                                                                                                                                                                                                                                        |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-DF33.1  | Sem conta, a aba Calendário abre com a temporada corrente, todas as competições e o disclaimer visível sem rolar (1366×768 e 390×844)                                                                                                           |
| AC-DF33.2  | Linha do tempo mostra faixa, janela e marcos de quatro competições; Tab e ←/→ percorrem marcos; Enter abre o painel com o `aria-label` completo                                                                                                 |
| AC-DF33.3  | Marco a ≤ 7 dias ganha chip "EM N DIAS" e cor `warn`; passado fica rebaixado e sob "Já passou" na lista                                                                                                                                         |
| AC-DF33.4  | Painel do marco mostra fonte com link, "conferido em", descrição curada e as ações; "Abrir a fonte" abre em nova aba a URL exata do banco                                                                                                       |
| AC-DF33.5  | Com equipe vinculada a uma competição e `registration_kind = 'integral'`, o recorte esconde os lotes novata/light e as outras competições                                                                                                       |
| AC-DF33.6  | "Transformar em passo" cria passo com `due_on` do marco e link de volta; sem `step.manage` o botão não aparece                                                                                                                                  |
| AC-DF33.7  | `.ics` abre no Google Calendar e no Outlook com um evento por marco, `URL` da fonte e `UID` estável em duas exportações seguidas                                                                                                                |
| AC-DF33.8  | Competição com `checked_at` > 30 dias e marco futuro exibe `VERIFICAR` + texto "pode estar desatualizado"                                                                                                                                       |
| AC-DF33.9  | Colar a tabela oficial de 2026 (§12.3) na administração propõe 8 marcos com data e número de informativo corretos                                                                                                                               |
| AC-DF33.10 | `GET /public/calendar` responde sem `Authorization`, com `Cache-Control` público; segunda chamada em 1 h não toca o banco (log da Data API)                                                                                                     |
| AC-DF33.11 | Início (DF-16) mostra "próximo prazo" vindo de `competition_milestones`; faixa de temporada (DF-13) mostra a próxima competição do calendário                                                                                                   |
| AC-DF33.12 | Zero hex fora de tokens; `check-icons` sem glifo novo; C-09 `fonte` e C-26 documentados no DS no mesmo PR                                                                                                                                       |
| AC-DF33.13 | Em Equipe › Projetos › Configurar temporada, a capitania marca Nacional 2027 como inscrita (integral) e Regional Sudeste 2026 como interesse; o calendário abre com o recorte ligado mostrando só as duas                                       |
| AC-DF33.14 | Marcos configurados na temporada aparecem na raia "Sua temporada" e intercalados na lista com chip EQUIPE; sem sessão da equipe, nem a raia nem os marcos existem na resposta da API                                                            |
| AC-DF33.15 | "Adicionar à minha temporada" num marco oficial cria o item em `team_season.milestones` com `sourceMilestoneId`; a faixa de temporada (DF-13) passa a contar para ele; mudar a data do original não altera a cópia e o painel oferece atualizar |
| AC-DF33.16 | "Só minha equipe" na lista mostra apenas os marcos da temporada; "Só prazos oficiais" esconde-os; o `.ics` público não contém nenhum item da equipe                                                                                             |

## 10. Riscos e questões em aberto

1. **Raspagem.** `WebFetch` recebeu `403` do site em 2026-09-06 (bloqueio a cliente não-browser)
   e as URLs de sub-página mudaram de `/programas-estudantis/baja-sae-brasil/...` para
   `/baja-nacional-...` sem redirecionamento. Automatizar é frágil e pode ferir termos de uso.
   **Decisão desta spec:** curadoria humana + colagem assistida (FR-DF33.23); script de
   conferência só local e só leitura. Reavaliar se a organização publicar feed.
2. **Rota pública × instantâneo estático.** §6 propõe rota pública cacheada na borda. Se o dono do
   produto preferir zero exceção ao `requireAuth` (linha do DF-28), a alternativa é o padrão do
   DF-25 com um job que regenera o instantâneo a cada salvar da administração (S3 + invalidação).
   Mais peças, mesmo resultado. **Decisão do dono do produto.**
3. **Quem cura.** Hoje "admin" é uma pessoa. Uma temporada tem ~30 informativos por competição;
   quatro competições dão ~100 entradas/ano, cada uma em 1–2 minutos com a colagem. Cabe. Se não
   couber, a próxima onda é permitir que **capitania de equipe vinculada** proponha marco
   (fila de sugestão do DF-26, triada pela administração) — não entra na v1.
4. **`seasonLabel` do DF-13** hoje é o ano ("2026"). O ciclo desta spec é rotulado pelo ano do
   Nacional. Regional 2026 pertence à "Temporada 2027" aqui e possivelmente à "2026" lá. Alinhar
   antes de ligar o FR-DF33.11 (AC-DF33.11) — proposta: `team_season` passa a apontar o ciclo.
5. **Datas que a organização muda depois de publicar.** O informativo 05 de 2026 foi uma "pesquisa
   de inversão de calendário"; cronogramas saem em Rev 1/Rev 2/Rev 3. O modelo trata isso como
   novo `checked_at` + `status` e o histórico fica em `audit_events`; a tela mostra só o vigente.
   Se o público pedir "o que mudou", vira lista de revisões — v2.
6. **Vista Mês.** Pedida implicitamente por "calendário". Fica para v2 porque a temporada tem
   ~10 marcos por competição espalhados em dez meses — uma grade mensal ficaria quase vazia. A
   linha do tempo e a lista cobrem o uso; a grade entra se o piloto mostrar que a pessoa procura
   "o dia".
7. **Categoria promocional** depende de a equipe ter pago a regional na categoria integral — o
   portal não sabe disso; é declaração da capitania. Aceito: é o mesmo regime autodeclarativo do
   DF-19.
8. **Teto de 12 marcos** em `team_season.milestones` (DF-13 RF-5.1) fica curto quando a equipe
   copia prazos oficiais para a temporada. Proposta: 24. É um número na validação zod e no
   formulário; o ODCS de `team_season` registra a mudança.
9. **Dois lugares para o mesmo dado** (competições da equipe editáveis na aba Projetos e no
   cabeçalho da raia). Aceito de propósito: a aba é a casa, o calendário é o atalho, e os dois
   fazem o mesmo `PUT` — não há segunda fonte de verdade. Se confundir no piloto, o atalho sai.

## 11. Plano de implementação (quando aprovada)

1. Migração `0011_calendar.sql` + contrato ODCS + `registration_kind` em `team_season`.
2. Módulo `calendar` na API (rotas públicas e de equipe, `.ics`, admin, `parse-table`) com testes
   da colagem contra a tabela real do §12.3.
3. DS: C-09 `fonte` + C-26 documentados; tokens já bastam.
4. Aba Calendário: lista + painel primeiro (é o que o celular usa), depois a linha do tempo.
5. Temporada da equipe: inscrita/interesse/categoria em Equipe › Projetos e no cabeçalho da raia,
   raia "Sua temporada", marcos intercalados na lista, "adicionar à minha temporada",
   "transformar em passo" e `.ics`.
6. Administração: aba Calendário com colagem.
7. Ligar DF-16 ("próximo prazo") e DF-13 (faixa de temporada) na fonte nova.
8. Carga inicial: temporada 2027 a partir do levantamento do §12, conferida na fonte no dia da
   carga; temporadas 2025 e 2026 só com competições + informativos (histórico), sem marcos.

## 12. Levantamento da fonte (2026-09-06, leitura manual no browser)

Registro do que existia no site da organização na data. **Isso é levantamento, não dado do
portal**: a carga inicial (§11.8) reconfere tudo na fonte.

### 12.1 Estrutura do site (Programas Estudantis › Baja)

| Página                          | URL                                                                |
| ------------------------------- | ------------------------------------------------------------------ |
| Agenda dos programas estudantis | `https://saebrasil.org.br/programas-estudantis/`                   |
| Baja Nacional (evento)          | `https://saebrasil.org.br/eventos/baja-nacional/`                  |
| · Informações e Local (prazos)  | `https://saebrasil.org.br/baja-nacional-informacoes/`              |
| · Inscrições (lotes e valores)  | `https://saebrasil.org.br/baja-nacional-inscricoes/`               |
| · Regras e Templates            | `https://saebrasil.org.br/baja-nacional-regras-e-templates/`       |
| · Mensagens e Informativos      | `https://saebrasil.org.br/baja-nacional-mensagens-e-informativos/` |
| · Requisitos para participação  | `https://saebrasil.org.br/requisitos-para-participacao/`           |
| · Equipes inscritas             | `https://saebrasil.org.br/baja-nacional-equipes-inscritas/`        |
| · Resultados                    | `https://saebrasil.org.br/baja-nacional-resultados/`               |
| · Certificados                  | `https://saebrasil.org.br/certificado/`                            |
| Baja Nordeste (evento)          | `https://saebrasil.org.br/eventos/baja-nordeste/`                  |
| Baja Sudeste (evento)           | `https://saebrasil.org.br/eventos/baja-sudeste/`                   |
| Baja Sul (evento)               | `https://saebrasil.org.br/eventos/baja-sul/`                       |
| Fórum de dúvidas do regulamento | `https://forum.bajasaebrasil.net/`                                 |
| Arquivos (PDF/DOCX)             | `https://arquivos.saebrasil.org.br/<ano>/BajaNacional/...`         |

As regionais têm as mesmas sub-páginas do Nacional (com "Regras e Relatórios" no lugar de "Regras
e Templates"). Os caminhos antigos `/programas-estudantis/baja-sae-brasil/...` e
`/programas-estudantis/baja-sul/informacoes/` (ainda indexados em buscadores) respondem 404.

### 12.2 Competições do ciclo 2027

| Competição             | Edição | Datas               | Local                                         | Inscrições               |
| ---------------------- | ------ | ------------------- | --------------------------------------------- | ------------------------ |
| Nacional 2027          | 32ª    | 31 mar – 4 abr 2027 | FATEC São José dos Campos – SP                | 15 jul – 15 set 2026     |
| Regional Nordeste 2026 | 19ª    | 25 – 27 set 2026    | Senai Cimatec Park, Camaçari – BA             | abertas em 6 set 2026    |
| Regional Sudeste 2026  | 19ª    | 14 – 18 out 2026    | EEP – Escola de Engenharia de Piracicaba – SP | encerradas em 6 set 2026 |
| Regional Sul 2026      | 23ª    | 20 – 22 nov 2026    | UniSATC, Criciúma – SC                        | abertas em 6 set 2026    |

Lotes do Nacional 2027 (página de Inscrições): Novata R$ 1.765 e Light R$ 2.945 (lote único,
vencimento 28/10/2026); Integral R$ 5.670 (28/09), R$ 5.885 (28/10), R$ 6.740 (26/11);
Promocional R$ 5.300 / 5.500 / 6.300 nas mesmas datas, para quem pagou a regional 2026 na
integral. Até 20 estudantes + 2 orientadores por equipe; 2 equipes por instituição/campus.

### 12.3 Tabela de prazos publicada (página Informações do Nacional, ciclo 2026 — ainda no ar)

| Atividade                                            | Prazo            | Fonte          |
| ---------------------------------------------------- | ---------------- | -------------- |
| Inscrição de equipe                                  | até 15/09/2025   | Informativo 01 |
| Inscrição dos integrantes e professores orientadores | até 25/01/2026   | Informativo 09 |
| Associação dos integrantes                           | até a competição | Informativo 09 |
| Envio de atestado de matrícula                       | até 08/03/2026   | Informativo 13 |
| Representante de imprensa                            | até 08/03/2026   | Informativo 14 |
| Apresentação em escolas de ensino médio              | até 15/03/2026   | Informativo 10 |
| Pesquisa sobre hospedagem                            | até 15/03/2026   | Informativo 15 |
| Agendamento para credenciamento                      | até 15/03/2026   | (em breve)     |

Credenciamento presencial só até o sábado da competição, 12h. Dúvidas administrativas por
e-mail; do regulamento, pelo fórum; comunicação corrente por grupo no Telegram (link na página).
Este é o formato que o FR-DF33.23 reconhece.

### 12.4 Informativos

- **Ciclo 2027 (até 6 set 2026):** 01 Adoção do RATBSB Emenda 7 · 02 Prova de Relatório de
  Desafio Técnico (Parte 1) · 03 Treinamento complementar – Desafio Técnico TV. Padrão de URL:
  `https://arquivos.saebrasil.org.br/2027/BajaNacional/Informativo0N-<titulo-sem-espacos>.pdf`.
- **Ciclo 2026:** 28 informativos + Almanaque (temas recorrentes: inscrições, datas de envio de
  documentos, provas de apresentação e relatório, numeração das equipes, inscrição de integrantes
  e associação, atestado de matrícula, imprensa, hospedagem, comissários, cronograma da
  competição, box e oficina, credenciamento, termo de participação, briefing).
- **Ciclos 2025 (42), 2024 (28) e 2023 (34)** seguem o mesmo padrão; cronogramas saem em revisões
  (Rev 1…Rev 3).

### 12.5 Regras e templates (fonte do DF-34)

- RATBSB emenda 07 (Baja 2026, adotado para o Nacional 2027 pelo Informativo 01/2027):
  `https://arquivos.saebrasil.org.br/2026/BajaNacional/RATBSB_emenda_07.pdf`
- RATBSB emenda 06 (Baja 2025): `http://arquivos.saebrasil.org.br/2025/Baja%20Nacional/RATBSB_emenda_06.pdf`
- Template Relatório Desafio Técnico (Ver27, 2027, .docx) e Template Relatório de Projeto
  (Ver26, 2026, .docx) na página Regras e Templates.
