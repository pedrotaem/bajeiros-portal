# DF-34 — Regulamento e referências: leitura íntegra, navegação por seção e ponte com o assistente

- **Status:** **implementada em 2026-09-06**, nos dois modos. O `embutido` saiu como cópia do
  PDF oficial servida pela origem do portal, com data e hora do download à vista e hash
  conferido — decisão do dono do produto em [ADR-014](../../docs/adr/014-copia-do-regulamento.md),
  que substitui o ADR-013 (autorização prévia). O que entrou e o que ficou de fora está no
  §13. Fecha no próprio draft — não vai para `spec.md`, que é do validador.
- **Pedido do dono do produto (literal):** "como no assistente já tem esse contato com o
  regulamento em si (perguntas e respostas baseadas nele), seria interessante ter uma seção onde
  o usuário consiga ler o regulamento na íntegra e consiga navegar de maneira fluida entre
  seções — talvez até linkando com o assistente: a resposta do assistente pode dar um link para
  a seção correta do regulamento."
- **Dependências:** DF-8 (assistente, chip de citação C-20 e `corpusVersion`), DF-12/DF-24
  (shell, `PageId`, sub-itens de Ferramentas), DF-33 (acervo de documentos-fonte — a lista de
  referências vem de lá), gateway `bajeiros-ai-gateway` (manifest do corpus: `sectionId` → página).
- **Documentos:** [índice de drafts](../draft-features.md) · [DF-8](df8-assistente-regras.md) ·
  [DF-33](df33-calendario-competicoes.md) · [design-system](../../docs/design-system.md) C-09,
  C-10, C-16, C-20 · canvas
  ["Calendário e Regulamento"](https://claude.ai/code/artifact/03837ff6-b954-4cf4-a13b-2a6325a4ac3b) (página
  "Regulamento").
- **Disclaimer obrigatório (pedido do dono do produto, texto fixo):** toda página desta spec
  carrega, visível sem rolar, o aviso: _"O Portal é um facilitador de acesso à informação e não
  substitui a leitura integral do material direto da fonte. O usuário deve sempre verificar o
  documento oficial vigente referente à competição que lhe afeta e tomar qualquer decisão baseada
  no documento oficial."_ Ver §4.6.

## 1. Contexto e motivação

O regulamento (RATBSB emenda 7) tem 148 páginas e 1 360 blocos numerados, em três partes
(administrativo, técnico, competitivo). O portal já o conhece **duas vezes**: o motor B6 confere
~40 regras dele, e o assistente responde citando `seção · página` a partir de um corpus que o
gateway extraiu do PDF oficial. O que não existe é o passo mais simples: **abrir a seção citada
e ler**. Hoje a citação `B6.2.4.3 · p. 42` é um chip que destaca a regra no checklist — e quem
quer o texto vai ao PDF de 148 páginas, sem índice clicável, procurar a página 42.

O pedido tem duas metades com custos muito diferentes: **navegar** (índice, seções, páginas,
ponte com o assistente) é metadado, e o portal já tem tudo o que precisa; **ler na íntegra dentro
do portal** é reproduzir a obra da organização, e isso o repositório proibiu por escrito desde
o DF-8 ("o texto do regulamento nunca entra no repo", `scripts/ingest.ts` do gateway; citações
≤ 25 palavras, FR-DF8.4). Esta spec entrega a primeira metade inteira e desenha a segunda de modo
que ela ligue por configuração quando — e se — a organização autorizar (§3.3, §10.1).

## 2. Objetivos e não-objetivos

**Objetivos**

- Página **Regulamento** com o índice completo do regulamento vigente, navegável por parte,
  capítulo e seção, com a página do PDF oficial em cada entrada.
- Toda citação do assistente vira **link para a seção** — e a seção mostra o caminho de volta.
- Versões: o regulamento que vale para cada competição do calendário, com a emenda anterior
  acessível e nunca confundida com a vigente.
- **Referências** ao lado do regulamento: templates de relatório, informativos que alteram
  regras, requisitos de participação, fórum oficial de dúvidas — todos por link, do acervo do
  DF-33.
- Leitura embutida (PDF renderizado no portal, com a seção rolada para a vista) como **modo**
  que só liga com autorização escrita da organização.

**Não-objetivos**

- **Não** re-tipografar o regulamento em HTML. O documento é o PDF oficial, sempre.
- **Não** buscar no texto integral (v1). Sem texto no portal não há busca; no modo embutido a
  busca do visualizador de PDF cobre.
- **Não** interpretar, resumir ou "explicar" seções na página — isso é o assistente, com o
  disclaimer dele. A página só aponta.
- **Não** substituir o fórum oficial de dúvidas: o link para ele está na página, e a resposta do
  assistente continua dizendo que o comitê técnico é quem decide.

## 3. Conceito

### 3.1 O índice é metadado; o texto é da organização

O gateway já produz, na ingestão, um **manifest** por versão do corpus: para cada bloco,
`sectionId`, `title`, `pageStart`, `pageEnd` (1 360 entradas na emenda 7). Nos níveis 0–2
(partes, capítulos `B6`, seções `B6.2`) o título é o título real ("GAIOLA DE PROTEÇÃO",
"Estrutura da gaiola de proteção"); do nível 3 para baixo o "título" é o começo do parágrafo,
ou seja, **texto do regulamento**. O índice do portal usa os 210 itens dos níveis 0–2 com título
e lista os 1 150 mais fundos **só pelo número e pela página** (`B6.2.4.3 · p. 42`). Nada de
trecho. Isso é o que mantém a página do lado certo da linha que o DF-8 traçou.

### 3.2 Uma versão por competição, escolhida pelo calendário

`regulation_versions` (uma linha por emenda) diz qual PDF, qual `corpusVersion` do gateway
(`ratbsb@emenda-07#sha256:…`) e **para quais competições vale** (`applies_to` →
`competitions.id`, DF-15/DF-33). A página abre na versão vigente para a temporada corrente do
calendário; o seletor mostra as outras rotuladas ("Emenda 6 · Baja 2025 · substituída"). A
citação do assistente carrega o `corpusVersion` da resposta (DF-8 §5) e abre **aquela** versão,
nunca "a mais nova" — uma resposta de março sobre a emenda 6 continua apontando para a emenda 6.

### 3.3 Dois modos, uma tela

| Modo                | O que a coluna do documento mostra                                                                                                          | Quando                                                                                              |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **`ponteiro`** (v1) | Cartão da seção selecionada (id, título quando há, páginas) + botão **Abrir no PDF oficial ↗**, que abre `<url-oficial>#page=N` em nova aba | Sempre; é o padrão                                                                                  |
| **`embutido`** (v2) | O PDF oficial renderizado no portal (pdf.js), rolado para `pageStart` da seção; índice e painel iguais                                      | Só com `REGULATION_READER_MODE=embutido` **e** autorização da organização arquivada no repo (§10.1) |

O `#page=N` é parâmetro padrão de abertura de PDF e funciona nos visualizadores dos navegadores
de mesa; em celular, abre o PDF do começo (limite aceito, dito na tela: "no celular o PDF abre
na primeira página — a seção está na p. 42").

O índice, o painel lateral, a ponte com o assistente e o disclaimer são os mesmos nos dois modos.
Trocar o modo é uma variável de ambiente + o PDF servido pela própria origem do portal (§5.3),
sem tocar em tela nenhuma — o mesmo padrão de `comingSoon` (DF-27) e `EVOLUTION_MODE` (DF-20).

### 3.4 Ponte com o assistente, nos dois sentidos

- **Do assistente para a seção:** o chip C-20 ganha ação primária "Abrir no regulamento" (a
  atual — destacar a regra no checklist — continua quando há checklist aberto, como ação
  secundária no mesmo menu). Abre a página Regulamento na versão da resposta, com a seção
  selecionada e o painel mostrando "Citado na sua conversa · voltar ao assistente".
- **Da seção para o assistente:** o painel de toda seção tem "Perguntar ao assistente sobre
  B6.2.4.3" (abre o DF-8 com o contexto visível como chip removível, DS C-20 já pede isso).
- **A conversa sobrevive à ida e volta.** O histórico do chat vive no store da aba (DF-8
  FR-DF8.2); a troca de `PageId` não pode desmontá-lo. Requisito, não suposição (FR-DF34.16).

## 4. Requisitos funcionais

### 4.1 Página e navegação

- **FR-DF34.1** Novo `PageId` `regulamento`, terceiro sub-item de **Ferramentas** no rail
  (depois de Validador e Assistente). **Sem marca de produto**: é acervo de referência, não
  ferramenta que produz coisa; usa texto + `IconFiles`. A quarta marca continua livre.
- **FR-DF34.2** Abre **sem sessão** (índice e links são metadado público). O que exige conta é a
  ponte com o assistente (o DF-28 fechou o assistente sem conta) e "Registrar decisão"
  (DF-14) — ambos ficam visíveis com o `PrecisaDeConta` do DF-25.
- **FR-DF34.3** Cabeçalho: seletor de **versão** (§3.2) com o rótulo "vigente para: Nacional 2027
  · Regionais 2026" derivado de `applies_to`; link "PDF oficial ↗" (a URL de `source_documents`);
  "conferido em <data>"; campo **Ir para** que aceita id (`B6.2.4.3`), página (`p. 42`) ou
  palavra de título dos níveis 0–2 ("gaiola") — filtra o índice conforme digita.
- **FR-DF34.4** Estado da página em `session.ts`: `regulationVersion`, `regulationSection`,
  `regulationQuery`. Nada de `useState` de navegação (DF-12 P-1.4).
- **FR-DF34.5** **Link de entrada por hash**, no mesmo mecanismo do `#convite=` do DF-10:
  `#regulamento=B6.2.4.3` (opcional `@emenda-07`) ao carregar abre a página na seção. É o que o
  chip do assistente, o diário de decisões (DF-14, link `kind: 'rule'`) e o botão "Copiar link da
  seção" usam. Sem router (ADR-009 dec. 4); o hash é lido uma vez no boot e limpo.

### 4.2 Índice

- **FR-DF34.6** Coluna esquerda (`--bj-panel-w-sm`, 320px): árvore com Preâmbulo, Parte A, B, C;
  cada parte expande em capítulos (`A1`…`C6`) e cada capítulo em seções (`B6.1`…`B6.5`) com
  título. Seções expandem numa lista de **números** com página (`B6.2.4.3 · p. 42`), sem texto
  (§3.1). Painel colapsável C-10 por nível; ARIA `tree`/`treeitem`, setas navegam, Home/End.
- **FR-DF34.7** Item selecionado ganha a régua ocre (C-02) e o `aria-current`. Ao selecionar, a
  coluna central e o painel direito atualizam; a URL não muda (sem router) — "Copiar link"
  fornece o hash.
- **FR-DF34.8** Capítulos com regras no motor B6 (`rules.md`) mostram contador discreto
  ("12 regras conferidas pelo validador") vindo de um mapa estático `sectionId → ruleId[]`
  gerado de `rules.md` no build — medido, não digitado.

### 4.3 Coluna do documento

- **FR-DF34.9 (modo `ponteiro`)** Cartão da seção: id em mono grande (`--bj-text-2xl`,
  `--bj-font-display` para o número — é "leitura numérica", DS §3.1), título quando nível ≤ 2,
  "páginas 34–41 do PDF oficial", botão primário **Abrir no PDF oficial ↗** (`<url>#page=N`,
  `rel="noopener"`), botão **Copiar link da seção**, e a nota de limitação em celular (§3.3).
  Abaixo, os **irmãos** (seções do mesmo nível) como lista de atalhos — é a "navegação fluida"
  do pedido: de `B6.2` para `B6.3` sem voltar ao índice.
- **FR-DF34.10 (modo `embutido`)** Visualizador pdf.js (chunk carregado sob demanda; worker
  via `worker-src 'self'` na CSP) renderizando o PDF servido pela origem do portal, rolado para
  `pageStart`; selecionar no índice rola o documento; rolar o documento **não** muda o índice
  (evita o efeito de dois controles brigando). Barra do visualizador: página atual / total,
  zoom, busca do pdf.js. A camada de texto fica ativa (copiar é do visualizador, não do portal).
- **FR-DF34.11** Verificação de integridade no modo embutido: o portal só renderiza se o
  `sha256` do arquivo servido bater com `regulation_versions.pdf_sha256` (o mesmo que o manifest
  do gateway registra). Divergiu → cai para `ponteiro` e mostra "o PDF do portal difere do
  conferido; abra o oficial".

### 4.4 Painel "Nesta seção"

- **FR-DF34.12** Coluna direita (`--bj-panel-w`, 360px), colapsável em < 1200px: caminho
  (Parte B › B6 › B6.2 › B6.2.4 › B6.2.4.3), páginas, e blocos: **Validador** (regras do motor
  ligadas à seção, com "ver no checklist" se há projeto aberto — FR-DF34.8), **Assistente**
  ("Perguntar sobre esta seção"; se veio de uma resposta: "Citado na sua conversa · voltar"),
  **Referências** (documentos-fonte do DF-33 marcados com `section_id` desta seção ou do
  capítulo: informativo que altera a regra, template do relatório, Anexo B), **Equipe**
  ("Registrar decisão com link a esta seção", DF-14).
- **FR-DF34.13** Rodapé do painel repete o disclaimer (§4.6) em `--bj-text-sm`.

### 4.5 Referências (seção da página)

- **FR-DF34.14** Abaixo do índice (ou aba própria em celular), **Referências oficiais** do
  ciclo: regulamento vigente e anterior, templates de relatório, informativos do tipo "altera
  regra" (curadoria do DF-33 marca `alters_rules = true`), requisitos de participação, fórum de
  dúvidas do regulamento. Cada item: título como a organização nomeia, tipo (chip neutro),
  edição, data, "conferido em", link ↗. Vem de `source_documents` (DF-33) filtrado por
  `kind IN ('regulamento','template','pagina','forum')` — nenhuma lista estática em código.
- **FR-DF34.15** Referência do tipo `regulamento` que **não** é a vigente exibe chip
  `SUBSTITUÍDA` e o link para a que a substituiu (`supersedes_id` invertido).

### 4.6 Disclaimer e versão

- **FR-DF34.16** Faixa C-09 variante `fonte` (definida no DF-33 §7.2) fixa no topo da página com
  o texto integral do disclaimer; repetida no rodapé do painel. No modo embutido, uma segunda
  linha na faixa: "Cópia do PDF oficial de <data>, conferida por hash — o oficial é o da
  organização".
- **FR-DF34.17** O chip do assistente que abre uma versão **substituída** mostra faixa `warn`
  na página: "Esta resposta cita a emenda 6, substituída pela 7 para o Nacional 2027". Nunca
  redireciona sozinho para a nova — a numeração muda entre emendas.
- **FR-DF34.18** A conversa do assistente sobrevive à navegação para o regulamento e de volta:
  mensagens, streaming em curso (parado) e quota exibida continuam como estavam.

### 4.7 Ponte a partir do checklist e do calendário

- **FR-DF34.19** Item do checklist B6 (C-08) ganha ação "Ler no regulamento" ao lado de
  "Perguntar ao assistente", abrindo a seção da regra (`ruleId → sectionId` do mesmo mapa
  estático).
- **FR-DF34.20** Marco do calendário com `section_id` (DF-33) mostra "Ler a regra" no painel.

## 5. Modelo de dados e artefatos

### 5.1 Tabela (migração `0012_regulation.sql`, depois da `0011` do DF-33)

```sql
CREATE TABLE regulation_versions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  edition         text NOT NULL UNIQUE,          -- 'emenda-07'
  label           text NOT NULL,                 -- 'RATBSB Emenda 7 · Baja 2026'
  corpus_version  text NOT NULL,                 -- 'ratbsb@emenda-07#sha256:e4a0…' (gateway)
  pdf_sha256      text NOT NULL,                 -- do manifest do gateway
  page_count      integer NOT NULL,
  source_id       uuid NOT NULL REFERENCES source_documents (id), -- o PDF oficial (DF-33)
  supersedes_id   uuid REFERENCES regulation_versions (id),
  published_on    date,
  checked_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE regulation_applicability (         -- para quais competições a versão vale
  version_id      uuid NOT NULL REFERENCES regulation_versions (id) ON DELETE CASCADE,
  competition_id  uuid NOT NULL REFERENCES competitions (id) ON DELETE CASCADE,
  PRIMARY KEY (version_id, competition_id)
);

ALTER TABLE source_documents ADD COLUMN section_id text;      -- referência ligada a uma seção
ALTER TABLE source_documents ADD COLUMN alters_rules boolean NOT NULL DEFAULT false;
GRANT SELECT ON regulation_versions, regulation_applicability TO bajeiros_app;
```

### 5.2 Índice por versão — artefato estático no front

`apps/web/public/regulamento/indice-<edition>.json`, gerado por
`scripts/build-regulamento-indice.mjs` a partir do manifest do gateway
(`.local/corpus/<edition>.manifest.json` ou o objeto em S3), contendo **só**: `edition`,
`corpusVersion`, `pdfSha256`, `pageCount`, `generatedAt` e `blocks[] = {id, title?, pageStart,
pageEnd, depth}` — `title` presente apenas em `depth ≤ 2`. O script **recusa** gerar se algum
`title` de `depth ≥ 3` sobreviver (é texto do regulamento). Commitado: é metadado, muda uma vez
por emenda, ~60 KB, e o portal público não deve consultar banco para desenhar um índice.

### 5.3 PDF no modo embutido

Bucket privado do portal (`infra/`, mesmo padrão dos assets de marca) com o PDF oficial
espelhado, servido em `/regulamento/<edition>.pdf` pelo CloudFront (behavior com cache longo,
`Content-Disposition: inline`). O `deploy.yml` **não** baixa da organização: o arquivo entra por
operação (runbook), com o hash conferido contra `regulation_versions.pdf_sha256` antes de
publicar. Sem o arquivo, o modo cai para `ponteiro` sozinho (FR-DF34.11).

### 5.4 Mapa regra ↔ seção

`packages/core` já nomeia as regras por id B6 (`rules.md`). `scripts/build-rule-sections.mjs`
extrai `ruleId → sectionId` do próprio catálogo de regras (o id da regra **é** a seção,
`B6.2.4.3`, ou a carrega no campo `ref`) e escreve `apps/web/src/regulamento/rule-sections.ts`.
Teste de paridade como o dos tokens: divergiu, falha.

## 6. API

| Rota                                          | Uso                                                | Auth               |
| --------------------------------------------- | -------------------------------------------------- | ------------------ |
| `GET /public/regulation/versions`             | versões, aplicabilidade, URL oficial, `checked_at` | pública, cache 1 h |
| `GET /public/regulation/references?season=`   | `source_documents` filtrados (§4.5)                | pública, cache 1 h |
| `GET /regulamento/indice-<edition>.json`      | índice (estático, §5.2)                            | pública            |
| `GET /regulamento/<edition>.pdf`              | PDF espelhado (modo embutido, §5.3)                | pública, cache     |
| `POST/PATCH /admin/regulation/versions[/:id]` | cadastro de versão e aplicabilidade                | admin (DF-9)       |

O assistente **não muda de contrato**: o evento `citation` já traz `sectionId`, `pageStart`,
`pageEnd`; o `corpusVersion` já vem em toda resposta (gateway §5). O chip só passa a usar os dois.

## 7. UI

### 7.1 Canvas

Página **Regulamento** do canvas
["Calendário e Regulamento"](https://claude.ai/code/artifact/03837ff6-b954-4cf4-a13b-2a6325a4ac3b): leitor em
modo `ponteiro` (v1, desktop 1440×900), leitor em modo `embutido` (v2, mesma tela com o PDF na
coluna central), o chip de citação do assistente com o menu "Abrir no regulamento", e o celular
(390) com índice em acordeão. Shell, tokens e componentes reproduzidos do código
(`shell.css`, `tokens.css`, C-02, C-07, C-09, C-10, C-20).

### 7.2 Emendas ao design-system (no PR desta spec)

- **C-20 — Chip de citação:** ganha estado `menu` (clique abre menu de duas ações: "Abrir no
  regulamento · p. 42" primária, "Destacar no checklist" quando há checklist) e o atributo
  `data-version` (edição citada). `aria-label` passa a incluir a versão quando não é a vigente.
- **C-27 — Índice em árvore (novo):** `tree`/`treeitem` com três níveis, régua ocre no
  selecionado, contador discreto à direita (FR-DF34.8), números em `--bj-font-mono`
  `--bj-text-sm`, títulos em `--bj-text-base`. Tokens já existentes.
- Nenhum glifo novo; `IconFiles` para o sub-item e o cabeçalho. Marca de produto: não.

### 7.3 Voz

"Abrir no PDF oficial", nunca "baixar o regulamento" (não é o portal que entrega o documento).
"Seção" para qualquer nível; "capítulo" para `B6`; "parte" para A/B/C. Números sempre em mono.
Versões pelo nome da organização ("Emenda 7"), com o ciclo ao lado ("Baja 2026"), sem marca.

## 8. LGPD, direito autoral e marca

- **Sem dado pessoal novo.** Rotas públicas não recebem sessão; a ponte com o assistente segue
  o regime do DF-8 (aviso de transparência, quota, `assistant_log`).
- **Direito autoral é o risco desta spec.** O modo `ponteiro` não reproduz nada (metadado +
  link). O modo `embutido` **redistribui o PDF** a partir da origem do portal — só com
  autorização escrita da organização, arquivada em `docs/legal/` e referenciada no ADR que ligar
  o modo (§10.1). O índice de níveis ≥ 3 sem título é condição de build (§5.2), não convenção.
- **Marca:** nome da organização só no link da fonte e no rótulo do documento; nenhum logotipo.

## 9. Critérios de aceite

| #          | Critério                                                                                                                                         |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| AC-DF34.1  | Sem conta, a página abre na versão vigente com índice completo (Preâmbulo, A1–A4, B1–B16, C1–C6), disclaimer visível sem rolar (1366×768 e 390)  |
| AC-DF34.2  | Selecionar `B6.2` no índice mostra o cartão com páginas 34–41 e irmãos `B6.1`…`B6.5`; "Abrir no PDF oficial" abre `<url>#page=34` em nova aba    |
| AC-DF34.3  | Índice não contém nenhum título em `depth ≥ 3`; o script de geração falha se contiver                                                            |
| AC-DF34.4  | "Ir para" aceita `B6.2.4.3`, `p. 42` e `gaiola`, e seleciona/filtra em < 100 ms com o índice inteiro carregado                                   |
| AC-DF34.5  | No assistente, o chip `B6.2.4.3 · p. 42` abre o regulamento na seção e na versão da resposta; "voltar ao assistente" devolve a conversa intacta  |
| AC-DF34.6  | Resposta que cita a emenda 6 abre a emenda 6 com faixa `warn` "substituída pela 7"; nunca redireciona                                            |
| AC-DF34.7  | `#regulamento=B6.2.4.3` na URL de entrada abre a seção; o hash é limpo após o boot; fluxo `#convite=` do DF-10 continua funcionando              |
| AC-DF34.8  | Referências listam regulamento vigente e anterior (com `SUBSTITUÍDA`), templates e fórum, todos vindos de `source_documents`, cada um com link ↗ |
| AC-DF34.9  | Modo `embutido` com hash divergente cai para `ponteiro` e avisa; com hash correto renderiza e rola para a página da seção                        |
| AC-DF34.10 | Checklist B6: "Ler no regulamento" em cada item abre a seção certa (`rule-sections.ts` em paridade com `rules.md`; teste falha se divergir)      |
| AC-DF34.11 | Setas, Home/End e Enter navegam a árvore; `aria-current` e régua ocre no item selecionado; leitor de tela anuncia nível e página                 |
| AC-DF34.12 | Zero hex fora de tokens; `check-icons` sem glifo novo; C-20 `menu` e C-27 documentados no DS no mesmo PR                                         |

## 10. Riscos e questões em aberto

1. **Autorização para o modo embutido.** Sem ela, o portal fica no `ponteiro` — que já entrega
   índice, navegação, versões e a ponte com o assistente. Proposta: o dono do produto pede à
   organização autorização para **espelhar o PDF inalterado, com atribuição e link para o
   original**; a resposta (ou o silêncio) define se o §5.3 é construído. ADR próprio
   ("Regulamento embutido") com a condição de promoção escrita.
2. **`#page=N` em celular** abre na primeira página na maioria dos visualizadores móveis. A tela
   avisa; a alternativa (modo embutido) depende do item 1.
3. **Numeração muda entre emendas.** `B6.2.4.3` da emenda 6 pode não ser a mesma regra na 7. Por
   isso a versão viaja com a citação (FR-DF34.17) e nenhum link é "traduzido" entre emendas.
   Um "de-para" curado entre emendas seria útil na troca de ano — v2, se alguém pedir.
4. **Manifest do gateway é a única origem do índice.** Se a ingestão mudar a segmentação
   (`splitSections`), o índice muda junto — o `corpusVersion` inclui o hash do corpus, então a
   divergência é detectável. O portal grava o `corpusVersion` que usou no JSON e compara com o da
   resposta do assistente: diferentes → a citação abre pela **página**, não pelo id, e avisa.
5. **Tamanho do pdf.js** (~1 MB) só no modo embutido, como chunk sob demanda; nada muda no
   bundle do modo ponteiro. Medir no PR que ligar o modo.
6. **Quem cadastra versão nova.** Uma vez por ano, administração: URL do PDF (documento-fonte do
   DF-33), rodar a ingestão no gateway, gerar o índice, registrar `regulation_versions` com
   aplicabilidade. Runbook.

## 11. Plano de implementação (quando aprovada)

1. `scripts/build-regulamento-indice.mjs` + JSON da emenda 7 + teste "sem título em depth ≥ 3".
2. `scripts/build-rule-sections.mjs` + teste de paridade com `rules.md`.
3. Migração `0012` + rotas públicas + admin de versões (depende do `0011` do DF-33).
4. DS: C-20 `menu`, C-27 árvore.
5. Página Regulamento em modo `ponteiro`: índice, cartão da seção, painel, referências,
   disclaimer, hash de entrada.
6. Ponte: chip do assistente, "Ler no regulamento" no checklist, "Ler a regra" no calendário.
7. ADR "Regulamento embutido" (proposto) + infra do espelho + pdf.js atrás de
   `REGULATION_READER_MODE` — só após o item 1 do §10.

## 12. Levantamento (2026-09-06)

- **Estrutura da emenda 7 (manifest do gateway, 148 páginas, 1 360 blocos):** Preâmbulo (p. 1–3)
  · Parte A — Regulamento administrativo (A1 Aplicabilidade, A2 Histórico, A3 Definições, A4
  Competição; p. 4–12) · Parte B — Regulamento técnico (B1 Requisitos gerais, B2 Motor, B3
  Sistema elétrico, B4 Ponto de reboque, B5 Identificação, **B6 Gaiola de proteção p. 33–52**,
  B7 Habitáculo, B8 Equipamento de segurança do piloto e assento, B9 Freio, B10 Combustível, B11
  Suspensão e direção, B12 Fixadores, B13 Anteparos, B14 Equipamento de piloto, B15 Nível
  equivalente de segurança, B16 Tração 4x4; p. 13–92) · Parte C — Regulamento competitivo (C1
  Procedimentos, C2 Pontuação, C3 Inspeção de conformidade técnica e segurança, C4 Avaliação de
  projeto, C5 Eventos dinâmicos, C6 Enduro; p. 93–148). Profundidade: 4 itens de nível 0, 26 de
  nível 1, 180 de nível 2, 661 de nível 3, 394 de nível 4, 95 de nível 5.
- **Fontes oficiais** (página "Regras e Templates" do Nacional): RATBSB emenda 07 (Baja 2026,
  adotado para o Nacional 2027 pelo Informativo 01/2027), RATBSB emenda 06 (Baja 2025), template
  de Relatório de Desafio Técnico Ver27 (.docx), template de Relatório de Projeto Ver26 (.docx),
  e o aviso "para perguntas somente sobre o regulamento" apontando para
  `https://forum.bajasaebrasil.net/`. URLs no DF-33 §12.5.
- **Assistente hoje:** evento SSE `citation = {sectionId, pageStart, pageEnd, quote?}`;
  `corpusVersion` em toda resposta; chip C-20 com ação "destacar no checklist";
  `AssistantPanel.tsx` trata `event === 'citation' && d.sectionId`.

## 13. O que foi implementado (2026-09-06)

Modo `ponteiro` inteiro, mais as duas pontes e o cadastro. Migração `0013_regulation.sql` (a
`0012` ficou com o DF-33), contrato [`regulation.odcs.yaml`](../../contracts/regulation.odcs.yaml)
e `calendar.odcs.yaml` 1.1.0 (as duas colunas novas de `source_documents`).

| FR               | Situação                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------ |
| FR-DF34.1 a .9   | ✅ página, rail, hash de entrada, índice, cartão da seção, irmãos, "Ir para", contador de regras |
| FR-DF34.10 e .11 | ❌ modo `embutido` (pdf.js e verificação de hash na tela) — ADR-013, não construído              |
| FR-DF34.12 a .20 | ✅ painel "Nesta seção", referências, disclaimer, faixa de emenda substituída, pontes            |

**Três desvios do que a spec supunha, todos com o motivo escrito no código:**

1. **Título raso nem sempre é título.** §3.1 dizia que os 210 itens de nível 0–2 têm título real.
   No manifest da emenda 7, **30 deles são prosa** (A1.1, B15.x, C4.x…): a seção não tem cabeçalho
   no PDF e o `splitSections` do gateway pega o começo do parágrafo. O gerador do índice só aceita
   título que PAREÇA título (`ehTitulo`: sem vírgula, sem ponto final, sem corte no meio da frase,
   ≤ 8 palavras) — 180 sobrevivem, e o resto entra só com número e página. Prosa é texto do
   regulamento em qualquer profundidade, e a guarda vale para o artefato commitado, não só para a
   geração (é o que o teste percorre).
2. **`0012` já era do DF-33** — a migração desta spec é a `0013`.
3. **Decisão com link à seção (FR-DF34.12)** não criou modelo de links no DF-14: o botão leva o
   diário da equipe com título e "por quê" **já escritos** (seção, páginas e link), visíveis antes
   de salvar. Sem coluna nova e sem gravar nada que ninguém leu.

### 13.1 Leitura dentro do portal (2026-09-06, mesma sessão)

O §10.1 supunha autorização escrita antes de servir o PDF. O dono do produto decidiu com
outro fato — **a organização distribui o arquivo em download aberto** — e pediu a cópia no
portal com o rastro do download. Virou o
[ADR-014](../../docs/adr/014-copia-do-regulamento.md), que substitui o ADR-013.

Como ficou, com três desvios do §3.3/§5.3:

1. **Visualizador do navegador, não pdf.js.** `<iframe>` de mesma origem em
   `/regulamento/<edition>.pdf#page=N`: busca, zoom e paginação vêm do navegador, e o bundle
   não cresce 1 MB (§10.5 deixa de ser risco). `key` por página, porque `#page=` num iframe
   já montado não pula em navegador nenhum.
2. **Sem `REGULATION_READER_MODE`.** Quem liga o modo é o ARQUIVO: existindo
   `copia-<edition>.json` cujo `sha256` bate com `regulation_versions.pdf_sha256`, a leitura
   aparece; faltando ou divergindo, a página volta ao `ponteiro` e diz por quê (FR-DF34.11).
   Uma variável a menos para alguém esquecer ligada num ambiente sem o arquivo.
3. **Sem bucket separado** (§5.3): o PDF é `apps/web/public/regulamento/<edition>.pdf`,
   publicado pelo mesmo caminho do resto do site. ~5 MB por emenda, uma por ano.

A procedência (`scripts/baixar-regulamento.mjs`) grava url de origem, `downloadedAt` com
hora, `sha256`, tamanho e o `Last-Modified` da fonte; a faixa da fonte e o rodapé do leitor
mostram isso em toda tela, junto do link para o documento oficial. Teste garante que o PDF
commitado tem o hash que a procedência declara e que ele é o mesmo do índice e do corpus do
assistente.

**Fora do escopo:** espelho em bucket próprio com invalidação separada (§5.3) — se o
repositório pesar, é para lá que vai.

Carga: `apps/api/scripts/seed-regulation.mjs` (dry-run por padrão; exige que o
`seed-calendar.mjs` já tenha criado o documento-fonte do PDF). A emenda 6 não foi cadastrada:
não temos o arquivo em mãos para conferir o hash, e hash não se inventa.

### 13.2 Correção pós-deploy (2026-09-06)

Primeiro deploy em produção: índice e PDF no ar (`/regulamento/*` respondendo 200), e a
página mostrando "nenhuma emenda cadastrada" — `regulation_versions` estava vazia nos dois
ambientes, e TUDO na tela pendia dessa linha (o índice e a cópia só carregavam depois de a
emenda existir no banco).

A correção não foi cadastrar e seguir: um artefato que o deploy publicou não pode sumir por
falta de uma linha em tabela. `scripts/build-regulamento-indice.mjs` passou a escrever
`edicoes.json` (que emendas o portal tem em arquivo) e a página monta a emenda a partir do
índice + procedência quando o banco não tem cadastro — com o chip **"vigência não declarada
pela curadoria"**, porque o arquivo sabe qual emenda é, não para quais competições ela vale.
Cadastro no banco continua tendo precedência e é o que traz "vigente para", substituição e
o vínculo com o calendário.

### 13.3 Celular: uma vista por vez (2026-09-06)

Relato depois do deploy: no celular só aparecia o índice. Não era o visor — era a ordem.
Abaixo de 1200px as três colunas viravam uma pilha na ordem do DOM (painel `order: -1`,
índice, documento), e o documento ficava ~1 500px abaixo, com a árvore (`max-height: 60vh`,
rolagem própria) roubando a rolagem do dedo no caminho.

Desenho conferido no canvas
["Regulamento no celular"](https://claude.ai/code/artifact/cce28eb6-7154-49e8-af8a-7d8bc9f75ffa)
(390×844: estado atual + as três vistas). O que entrou, abaixo de **1024px**:

- **Três vistas, uma por vez** — Documento · Índice · Nesta seção — numa barra `tablist`
  com alvos de **44px**. `regulation.vista` mora no store (DF-12 P-1.4), então ir ao
  assistente e voltar devolve a mesma vista. Sem seção escolhida, a vista é o índice e as
  outras duas ficam desabilitadas: abrir vista vazia seria mentir sobre o que há ali.
- **Quem chega por citação, link ou checklist cai no Documento** (`goToRegulation`), na
  página da seção — ler era o pedido; procurar no índice, não.
- **Barra `‹ B6.2.4.3 ›`** anda na ORDEM DO DOCUMENTO (não entre irmãos: de `B6.2.4.1`
  para trás vem `B6.2.4`, o cabeçalho logo acima), sem voltar ao índice.
- **Um scroller só**: a árvore perde `max-height`/`overflow` e quem rola é a página; as
  linhas do índice sobem para 44px de alvo.
- **Índice leva à leitura**: com seção escolhida, um botão "Ler B6.2.4.3 no documento"
  fecha o ciclo em vez de devolver a pessoa ao topo.
- O aviso da fonte continua **inteiro** (é obrigação de tela), em `--bj-text-xs`/1,45.

Entre 1024px e 1199px nada muda em relação ao que já estava no ar: uma coluna, painel
antes do índice. É a largura de tablet, onde a rolagem até o documento é curta — se
alguém reclamar dali, o mesmo corte serve.

### 13.4 O que o §13.3 quebrou, e como foi medido (2026-09-07)

Relato de staging: "a barra de rolagem do site todo está quebrada, o menu lateral não expande
e o PDF não aparece". Três defeitos, dois deles anteriores ao §13.3 e escondidos até esta
página existir. Medidos em Chrome headless por CDP (`document.scrollWidth`, caixas dos
elementos, quem rola), não por dedução:

1. **Nada rolava.** A página nasceu dentro de `page-body`/`page-inner`, invólucro da era do
   editor: `overflow: hidden` e altura travada. Em 390px o documento ficava em `y = 5752`,
   fora de qualquer vista, e `scrollers` vinha **vazio**. Página de conteúdo usa `bj-page`
   dentro do `.bj-content`, que é quem rola — como Comunidade, Equipe e Ferramentas.
2. **Rail estreito por dois caminhos.** A media query de 1199px copiava metade das regras do
   `.bj-shell-compacto`: escondia o rótulo dos destinos, mas não o texto da marca nem o
   chevron da conta, e não recentrava os itens — o "Bajeiros / portal das equipes" vazava dos
   56px por cima do conteúdo. Agora o `Shell` acrescenta a classe quando a janela é estreita
   (`railCompact || !largo`) e a media query saiu: **um caminho só**. O botão de expandir some
   abaixo de 1200px, onde ele não teria o que fazer.
3. **O PDF nascia fora da tela.** A URL da fonte, sem quebra, esticava a coluna para 421px
   numa janela de 390 (rolagem horizontal); a faixa por extenso comia ~460px; o cartão com as
   seções vizinhas somava outros ~300px antes do visor. Correções: `overflow-wrap: anywhere`
   na procedência (que virou chip com o detalhe a um toque), cabeçalho só na vista Índice,
   abas `sticky`, e **as seções vizinhas foram para depois do visor** — no celular e no
   desktop. Link `#regulamento=` no boot também passa a abrir na vista Documento, como a
   citação já fazia.

Depois: em 390×844 o visor começa em `y = 477` (523px de altura) e a página tem um scroller
só; em 1440×900, `y = 536`. Sem rolagem horizontal em nenhum dos dois.
