# DF-26 — Sugestões: melhoria e implementação pedidas de dentro da página

- **Status:** proposto (2026-08-31)
  - Quem usa o portal ganha um caminho para **sugerir melhoria, pedir implementação ou
    relatar problema** de qualquer página, com o **contexto da página preso
    automaticamente** ao envio.
  - O ciclo **fecha**: quem sugeriu vê o desfecho — inclusive o "não", com motivo.
  - **Sem mural público e sem voto na v1** (§5.4), por decisão apoiada em evidência,
    não por falta de tempo.
- **Dependências:** DF-12 (shell e `PageId`), DF-9 (`is_admin` e a página de
  administração), DF-16 (`GET /me/home`, onde o aviso do desfecho aparece)
- **Documentos:** [índice de drafts](../draft-features.md) · [DF-9](df9-admin.md) ·
  [DF-12](df12-shell-navegacao.md) · [DF-14](df14-conhecimento.md) (base legal do conteúdo
  pós-exclusão) · [DF-16](df16-inicio.md) · [design-system §8.4](../../docs/design-system.md)

## 1. Contexto e motivação

O portal chegou a 25 features com **zero canais de entrada**. Toda direção de produto até
aqui veio de uma pessoa: o dono do produto. Isso funcionou enquanto o usuário e o dono eram a
mesma pessoa — e deixa de funcionar no piloto de 2–3 equipes que os planos EV e o ADR-010
marcam como gate antes do GA.

O que existe hoje para quem quer pedir algo: nada. Não há e-mail de contato na interface, não
há formulário, e o repositório é público mas ninguém de equipe de Baja vai abrir issue no
GitHub. O canal real é conversa de WhatsApp com quem construiu — que não escala, não guarda
registro e não sobrevive à troca de geração das equipes, que é o problema nº 1 da pesquisa.

Três consequências concretas:

1. **A calibração dos 51 critérios não tem de onde vir.** O DF-19 §9 e o DF-20 §9 pedem uma
   temporada de uso real antes de apertar os números. Uso real produz reclamação específica —
   e hoje ela não tem onde cair.
2. **Os defeitos que aparecem só ao rodar o app dependem de uma pessoa rodar o app.** Nas
   últimas quatro sessões, 6 + 4 + 3 defeitos de apresentação escaparam de 583 testes e foram
   pegos à mão. Quem usa vê mais telas, em mais tamanhos, do que quem constrói.
3. **Pedido sem registro vira pedido esquecido.** Sem fila, o que decide o roadmap é a última
   conversa, não a soma.

O pedido do dono do produto: **a capacidade de sugerir melhorias ou implementações em cada
página.**

## 2. O que a prática do setor mostra (e o que dela vale aqui)

Pesquisa feita para esta spec. O resumo do que foi aproveitado e do que foi recusado — porque
metade das práticas comuns pressupõe um produto com escala e um time de produto, e este portal
não tem nenhum dos dois.

| Achado da pesquisa                                                                                                                                        | O que fazemos                                                                                   |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Feedback **em contexto** é mais específico e mais acionável que feedback pedido fora da tela; o pop-up de tela cheia morreu, o padrão é acesso permanente | Entrada fixa na topbar, presente em **toda** página, com o contexto preso sozinho (§4.2)        |
| Fluxos curtos respondem muito mais que formulário longo; escala/emoji/uma pergunta batem 4+ campos com texto livre                                        | Um formulário de **três campos** (tipo, título, descrição) e nada de anexo, nota ou escala      |
| **Voto público enviesa**: usuários vocais não representam a base, e o efeito manada faz o item votado receber mais voto por já ter voto                   | **Sem voto e sem mural na v1** (§5.4). O sinal de repetição sai da triagem, não da plateia      |
| Quem participa de portal de feedback tende ao extremo (muito satisfeito ou muito irritado); a maioria morna cala                                          | A leitura de triagem trata contagem como **indício**, nunca como votação (§4.4)                 |
| **Fechar o ciclo** é o que faz o canal continuar existindo: registrar quem pediu, ligar ao que foi entregue e avisar essas pessoas                        | Status na conta de quem pediu + aviso no Início (§4.5). É a metade da feature, não um extra     |
| Recusar **com motivo de uma linha** é mais respeitado que silêncio, e ensina o que o canal é                                                              | `recusado` e `duplicado` **exigem** motivo — a API recusa 400 sem ele (§4.4)                    |
| Metadado capturado sozinho pode reidentificar; capturar só o que serve a um propósito claro                                                               | Contexto **enumerado e curto** (§4.2): sem user-agent, sem captura de tela, sem console, sem IP |
| Equipe de 1–10 pessoas: capture de qualquer um, **dono nomeado** por item, revisão semanal                                                                | Triagem é do admin, na página que o DF-9 já criou — sem ferramenta nova e sem processo novo     |

Fontes:
[Userpilot](https://userpilot.com/blog/in-app-feedback-guide/) ·
[Gleap](https://www.gleap.io/blog/in-app-feedback-widgets-guide) ·
[ProdPad — viés do voto](https://www.prodpad.com/blog/feedback-voting-bias-in-product-decisions/) ·
[Quackback — voto sem concurso de popularidade](https://quackback.io/blog/feature-voting) ·
[Survicate — benchmarks de resposta](https://survicate.com/reports/survey-response-rate-benchmarks/) ·
[Gainsight — ciclo fechado](https://www.gainsight.com/essential-guide/product-led-growth/closed-loop-feedback/) ·
[Pendo — recusar com motivo](https://support.pendo.io/hc/en-us/articles/12993802729883-Review-and-manage-requests) ·
[Triagely — triagem em time pequeno](https://www.triagely.net/blog/feedback-triage-process-small-team-workflow) ·
[Mopinion — LGPD/GDPR em feedback](https://mopinion.com/how-to-ensure-gdpr-compliance-in-digital-feedback/)

## 3. Objetivos e não-objetivos

**Objetivos**

- Dar a quem usa um caminho de uma tela para pedir melhoria, implementação ou relatar
  problema, **de qualquer página**, sem sair do que estava fazendo.
- Prender o contexto da página **sozinho**, para que o pedido chegue específico sem exigir
  que a pessoa descreva onde estava.
- Fechar o ciclo: quem pediu vê o que aconteceu com o pedido, inclusive quando a resposta é
  não.
- Dar ao dono do produto uma fila triável, com o essencial e nada mais.

**Não-objetivos**

- **Não** é mural público nem votação (§5.4).
- **Não** é suporte. Não há promessa de prazo, não há conversa em ida e volta, não há anexo.
  Uma resposta por item, do dono do produto, e ela encerra.
- **Não** é telemetria. Nada é capturado sem a pessoa apertar enviar, e o que vai junto está
  escrito na tela antes do envio (§4.2).
- **Não** captura tela, console, rede nem user-agent (§5.3).
- **Não** manda e-mail. O portal não envia e-mail em lugar nenhum — nem convite — e esta
  feature não abre essa porta (§5.5).
- **Não** vale sem conta na v1 (§5.2).

## 4. Requisitos funcionais

### 4.1 Entrada — uma, em toda página

- **FR-DF26.1** A topbar do shell ganha **um** botão de texto, "Sugerir melhoria", visível em
  todas as páginas — com sessão ou sem. É o único ponto de entrada; nenhuma página desenha o
  seu.
- **FR-DF26.2** Ele é **texto, sem glifo**. O padrão do design system é sem ícone (§8.4), o
  teto de 24 formas tem uma vaga só e o DF-24 a deixou aberta de propósito. Um botão de texto
  na topbar não precisa dela.
- **FR-DF26.3** Sem sessão, o botão abre o painel de login com o motivo escrito ("para
  sugerir é preciso ter conta — assim dá para te avisar do que aconteceu com o pedido"), não
  um formulário que falha no envio.
- **FR-DF26.4** O painel abre por cima da página, **sem trocar de página**: o editor não
  desmonta e ninguém perde o que estava fazendo (ADR-009 dec. 4).
- **FR-DF26.5** O painel tem duas partes: **enviar** e **as minhas** (§4.3). Ele abre em
  "enviar" quando não há nada pendente de leitura, e em "as minhas" quando há desfecho novo
  (§4.5).

### 4.2 O que vai junto, e o que a pessoa vê antes de enviar

- **FR-DF26.6** O envio carrega, além do que foi escrito: `page` (o `PageId` ativo) e `view`
  (a aba ativa dentro da página, quando existe — aba da equipe, da comunidade ou do projeto).
- **FR-DF26.7** Carrega também um contexto técnico **enumerado**: largura × altura da janela
  e se o rail está recolhido. É o mínimo que separa "está quebrado" de "está quebrado nesta
  largura" — a classe de defeito que mais escapou dos testes até aqui.
- **FR-DF26.8** **Nada além disso.** Sem user-agent, sem captura de tela, sem console, sem
  rede, sem URL, sem IP na linha. §5.3 explica por quê.
- **FR-DF26.9** O painel **mostra na tela** o que vai junto, em uma linha legível ("Vai junto:
  Equipe · Conhecimento · janela 1440×900 · menu aberto"), antes do botão de enviar. Contexto
  capturado que a pessoa não vê é telemetria, mesmo quando é inofensivo.
- **FR-DF26.10** A página vai como **identificador**, nunca como texto livre: um `PageId`
  conhecido. Página desconhecida é recusada na borda (400) em vez de virar linha suja no banco.

### 4.3 O formulário e "as minhas"

- **FR-DF26.11** Três campos: **tipo** (`melhoria` · `implementacao` · `problema`), **título**
  (≤ 120 caracteres) e **descrição** (20 a 2000). Mais nada — sem anexo, sem prioridade, sem
  nota, sem categoria.
- **FR-DF26.12** Os três tipos, com a diferença dita na tela: `melhoria` muda algo que já
  existe; `implementacao` é o que ainda não existe; `problema` é o que está errado. Separar
  defeito de pedido é o que permite triar por urgência sem campo de prioridade.
- **FR-DF26.13** A descrição tem **piso de 20 caracteres**. "Não funciona" não é pedido, e
  recusar na hora custa menos que uma ida e volta que este canal não tem.
- **FR-DF26.14** Um aviso curto e permanente no formulário: **não escreva dado pessoal seu ou
  de terceiros** — o texto é lido por quem administra o portal.
- **FR-DF26.15** "As minhas" lista o que a pessoa mandou (mais recente primeiro) com tipo,
  página, data, status e a resposta quando houver. Sem paginação: o teto por pessoa (§4.6)
  cabe numa lista.
- **FR-DF26.16** A pessoa **não edita nem apaga** o que enviou. Editar depois de triado
  invalidaria a resposta já escrita. A exclusão da conta continua valendo e anonimiza (§4.7).

### 4.4 Triagem

- **FR-DF26.17** A administração (DF-9) ganha a aba **Sugestões**: fila filtrável por status,
  tipo e página, mais recente primeiro.
- **FR-DF26.18** Status: `novo` → `em_analise` → `planejado` → `entregue`, mais `recusado` e
  `duplicado` como saídas. É a escada mínima que ainda distingue "vi" de "vou fazer" de
  "fiz".
- **FR-DF26.19** `recusado` e `duplicado` **exigem** motivo (1 a 1000 caracteres); a API
  responde 400 sem ele. Recusar em silêncio ensina que o canal é decorativo.
- **FR-DF26.20** `duplicado` aponta para o item original (`duplicateOf`), que precisa existir
  e não pode ser ele mesmo.
- **FR-DF26.21** A fila mostra, por página, **quantos itens abertos** ela tem. É indício de
  onde dói — nunca contagem de votos, e a tela nomeia isso.
- **FR-DF26.22** Toda mudança de status é auditada (`feedback.triaged`), com o status
  anterior e o novo.
- **FR-DF26.23** Só admin triaga, e **o banco é quem garante**: a escrita de triagem passa por
  função `SECURITY DEFINER` que exige `app_is_admin()` (§6.2). Rota comprometida não vira
  escrita indevida.

### 4.5 Fechar o ciclo

- **FR-DF26.24** Mudou o status de um item, quem o enviou tem **desfecho não lido** até abrir
  "as minhas". A marca de lido é do autor e só ela ele pode escrever (§6.2).
- **FR-DF26.25** `GET /me/home` (DF-16) passa a trazer `feedback: { respondidas: n }` quando
  n > 0 — um número, ~30 bytes, dentro do teto de 20 KB do agregador.
- **FR-DF26.26** O Início mostra uma linha quando há desfecho novo, que abre o painel em "as
  minhas". Sem desfecho novo, **nada aparece** — Início não ganha bloco vazio.
- **FR-DF26.27** O aviso **não** classifica o desfecho pelo humor ("boa notícia!"): a mesma
  linha serve para entregue e para recusado, porque as duas coisas são o canal funcionando.

### 4.6 Limites e abuso

- **FR-DF26.28** **10 envios por dia** e **200 no total** por pessoa. Estourar devolve erro
  claro dizendo qual dos dois foi (nunca silêncio — mesma regra do DF-14 AC-DF14.10).
- **FR-DF26.29** O teto do dia conta as últimas 24 h por `created_at`, não por data civil:
  fila que zera à meia-noite convida a esperar a meia-noite.
- **FR-DF26.30** Sem anexo, sem HTML, sem markdown renderizado. O texto é exibido como texto
  — a triagem lê o que foi escrito, não o que foi renderizado.

### 4.7 Privacidade e LGPD

- **FR-DF26.31** Contrato ODCS novo (`feedback-item.odcs.yaml`), com `author_id` classificado
  como `pii`, base legal **execução de contrato** (art. 7º V) e retenção escrita.
- **FR-DF26.32** A exportação do titular (`GET /me/export`) passa a incluir `feedback` — o que
  a pessoa mandou e o desfecho de cada item.
- **FR-DF26.33** Excluir a conta **anonimiza a autoria** (`author_id` vira nulo) e mantém o
  texto, pelo mesmo motivo e com a mesma pendência jurídica do DF-14 §8.3: o pedido já mudou o
  produto e some da fila sem ter sido lido de novo. Fica **cruzado** com aquela questão para
  que as duas sejam decididas juntas.
- **FR-DF26.34** A resposta da triagem é escrita por quem administra e fica visível para o
  autor. Ela **não** é lugar de dado pessoal; o aviso do §4.3 vale nos dois sentidos.

## 5. Decisões que valem para quem mexer nisso

### 5.1 Uma entrada, contexto automático — não uma entrada por página

"Sugerir em cada página" tem duas leituras. A literal põe um botão em cada tela: 9 pontos de
manutenção, 9 chances de esquecer um, e chrome repetido numa interface que acabou de reduzir
chrome (DF-24). A outra põe **um** botão onde o shell já mora e deixa ele **saber** de onde
foi apertado.

A segunda entrega o mesmo resultado — o pedido chega dizendo a página — e é a que a prática do
setor descreve: acesso permanente, contexto anexado sozinho. Se um dia uma tela precisar de
formulário próprio (o editor, com estado de gaiola no contexto, é o candidato), ela **acrescenta**
campo ao mesmo painel; não cria outro caminho.

### 5.2 Exige conta, e o motivo é o ciclo — não a moderação

Recusar anônimo tem uma razão boa e uma razão preguiçosa. A preguiçosa é moderação. A boa:
**sem conta não há como fechar o ciclo**, e fechar o ciclo é o que a pesquisa aponta como o
que faz o canal continuar existindo. Um pedido anônimo é uma caixa de correio sem remetente —
some do lado de quem pediu no segundo em que é enviado.

Isto tem custo real e ele fica registrado: quem chega pela vitrine (DF-25) e quem abre o
validador sem conta são justamente as primeiras impressões, e elas ficam de fora. Mitigação
hoje: o botão existe para eles e abre o login **dizendo o porquê**, em vez de sumir. Se o
custo se mostrar maior que o benefício, o caminho de volta está em §9.2 — e envolve
`assistant`, que já tem cota anônima por IP e é o precedente do repo.

### 5.3 O contexto é enumerado, e é isso que o separa de telemetria

Captura de tela, console e rede são o padrão das ferramentas comerciais e são as três coisas
que mais aumentam a qualidade do relato de defeito. Ficam de fora, e não por dificuldade:

- **Captura de tela** de um portal com sessão pega nome, e-mail, nome de equipe e o que
  estiver aberto ao lado. Vira dado pessoal de terceiro num campo que ninguém revisa.
- **Console e rede** carregam token e corpo de requisição. O portal manda `Authorization` em
  toda chamada.
- **User-agent** não muda a resposta a nada aqui e ajuda a reidentificar.

Fica o que serve a um propósito nomeado: página, aba, tamanho da janela e estado do rail. Os
dois últimos existem porque a classe de defeito que mais escapou dos testes neste repo é
**apresentação em uma largura específica** — 13 casos nas últimas quatro sessões, todos
achados à mão.

E o que vai junto **aparece na tela antes do envio** (FR-DF26.9). A diferença entre contexto e
telemetria não está no tamanho do que se coleta; está em quem sabe.

### 5.4 Sem voto e sem mural — e isso é continuidade, não timidez

Mural público com voto é o padrão do setor (Canny e afins) e resolve dedupe de graça. Três
razões para não, na ordem em que pesam:

1. **O voto enviesa de um jeito conhecido.** Quem participa não representa a base — a maioria
   morna cala —, e mostrar a contagem produz efeito manada: o item que já tem voto recebe mais
   voto por já ter voto. Numa base de dezenas de equipes, dez votos de uma equipe grande
   pautariam o roadmap inteiro.
2. **O portal já decidiu isso em outro lugar.** O DF-15 e o ADR-010 fecharam que benchmark
   **nunca vira ranking público**. Uma feature que ordena pedidos por popularidade contradiz o
   produto na semana seguinte.
3. **Mural exige moderação contínua** — de uma pessoa. Fila privada com resposta é o que um
   time de um sustenta sem quebrar promessa.

O que se perde: o sinal de "muita gente quer isto". Ele volta pela triagem (FR-DF26.21) como
**indício**, com o nome certo na tela. E o caminho para o mural continua aberto em §9.1, com a
ordem de execução escrita — publicação é do dono do produto, item a item, nunca automática.

### 5.5 O ciclo fecha dentro do app, porque não existe e-mail

O portal não envia e-mail em lugar nenhum: convite de equipe é **link copiável** justamente
por isso. Então o aviso de desfecho é in-app — marca de não lido em "as minhas" e uma linha no
Início.

Isso tem uma consequência honesta: **quem não voltar não fica sabendo.** É aceitável porque o
público é de equipes que usam o portal na temporada, e inaceitável no dia em que houver e-mail
— e nesse dia esta é a **primeira** fila a usar, porque a lista de quem pediu já está no banco,
que é a parte cara de ter.

### 5.6 Status de sugestão não é status de regra

O portal já tem cinco papéis de status com cor e forma reservadas (CT-3: aprovado, infração,
atenção, presencial, informação), e eles significam **conformidade da gaiola**. Sugestão usa
vocabulário próprio, com os chips neutros. Reusar o verde de "aprovado" para "entregue" faria
o mesmo signo dizer duas coisas em duas telas — exatamente o que o §8.4 do design system
proíbe para glifo, pela mesma razão.

## 6. Modelo de dados

### 6.1 Tabela

Migração `0011_feedback.sql`, uma tabela:

| Coluna              | Tipo          | Notas                                                          |
| ------------------- | ------------- | -------------------------------------------------------------- |
| `id`                | `uuid`        | PK                                                             |
| `author_id`         | `uuid`        | `REFERENCES users ON DELETE SET NULL` — anonimização (§4.7)    |
| `kind`              | `text`        | `melhoria` · `implementacao` · `problema`                      |
| `page`              | `text`        | `PageId` conhecido, validado na borda                          |
| `view`              | `text`        | aba dentro da página; nulo quando a página não tem abas        |
| `title`             | `text`        | 1–120                                                          |
| `body`              | `text`        | 20–2000                                                        |
| `context`           | `jsonb`       | `{ viewport: [w, h], rail: 'aberto' \| 'compacto' }`           |
| `status`            | `text`        | `novo` (default) e os cinco de FR-DF26.18                      |
| `resolution`        | `text`        | resposta da triagem, ≤ 1000; obrigatória em recusado/duplicado |
| `duplicate_of`      | `uuid`        | auto-referência, `ON DELETE SET NULL`                          |
| `status_changed_at` | `timestamptz` | quando a triagem mexeu                                         |
| `seen_at`           | `timestamptz` | quando o autor leu o desfecho — é o "não lido" do §4.5         |
| `created_at`        | `timestamptz` | default `now()`                                                |

### 6.2 Quem pode escrever o quê — no banco, não na rota

Três camadas, e cada uma existe porque a de cima não basta:

- **RLS**: o autor vê e insere as próprias linhas; admin lê todas (`feedback_admin_read`,
  SELECT-only, como todo `*_admin_read` desde o DF-9).
- **GRANT de coluna**: `GRANT UPDATE (seen_at)` — o autor consegue marcar como lido e **não
  consegue** reescrever o próprio texto depois de triado, nem mudar o próprio status. Isso é
  garantido pelo grant, não por disciplina de rota (FR-DF26.16).
- **Função `SECURITY DEFINER`**: `feedback_triage(id, status, resolution, duplicate_of)`
  levanta exceção se `app_is_admin()` for falso. Mantém intacta a convenção de que política de
  admin é só de leitura, e é o mesmo padrão de `accept_team_invite` e `team_rank_showcase`.

## 7. Módulos afetados

| Módulo                                      | Mudança                                                           |
| ------------------------------------------- | ----------------------------------------------------------------- |
| `apps/api/migrations/0011_feedback.sql`     | **nova**: tabela, RLS, grant de coluna e a função de triagem      |
| `contracts/feedback-item.odcs.yaml`         | **novo**: 22º contrato, com PII, base legal e retenção            |
| `apps/api/src/modules/feedback/`            | **novo**: enviar, listar as minhas, marcar lido, triagem do admin |
| `apps/api/src/app.ts`                       | monta `/api/v1/feedback`                                          |
| `apps/api/src/modules/identity`             | `GET /me/export` passa a incluir `feedback` (FR-DF26.32)          |
| `apps/api/src/modules/home`                 | `feedback: { respondidas }` quando > 0                            |
| `apps/api/src/modules/admin`                | `GET /admin/feedback` (fila + contagem por página)                |
| `apps/web/src/session.ts`                   | `PanelId` ganha `feedback`; `contextoDaPagina()` puro e testável  |
| `apps/web/src/components/Shell.tsx`         | botão de texto na topbar                                          |
| `apps/web/src/components/FeedbackPanel.tsx` | **novo**: enviar + as minhas                                      |
| `apps/web/src/components/AdminPanel.tsx`    | aba Sugestões                                                     |
| `apps/web/src/components/HomePage.tsx`      | a linha de desfecho novo                                          |
| `apps/web/src/shell.css`                    | painel, lista, chips de status (sem hex novo)                     |

Nada em `packages/` — não há regra de domínio aqui. Nada de infraestrutura nova.

## 8. Critérios de aceite

| #          | Critério                                                                                                          | Verificação     |
| ---------- | ----------------------------------------------------------------------------------------------------------------- | --------------- |
| AC-DF26.1  | Envio guarda `page` e `view` do estado da sessão; `page` fora do conjunto conhecido dá 400                        | vitest ✔        |
| AC-DF26.2  | O contexto gravado tem só viewport e rail — nenhuma outra chave passa                                             | vitest ✔        |
| AC-DF26.3  | Descrição < 20 caracteres é recusada com mensagem, não gravada                                                    | vitest ✔        |
| AC-DF26.4  | 11º envio em 24 h é recusado dizendo que é o teto do dia; o 201º diz que é o teto total                           | vitest ✔        |
| AC-DF26.5  | Pessoa A não vê nem por rota nem por RLS a sugestão da pessoa B                                                   | vitest ✔ (gate) |
| AC-DF26.6  | Não-admin recebe 403 na triagem; e a função do banco recusa mesmo chamada direta                                  | vitest ✔        |
| AC-DF26.7  | `recusado` e `duplicado` sem motivo dão 400; `duplicado` apontando para si mesmo também                           | vitest ✔        |
| AC-DF26.8  | Triagem carimba `status_changed_at`, zera `seen_at` e escreve `feedback.triaged` na auditoria                     | vitest ✔        |
| AC-DF26.9  | O autor consegue marcar como lido e **não** consegue alterar título, texto ou status                              | vitest ✔        |
| AC-DF26.10 | `GET /me/export` traz as sugestões do titular com desfecho                                                        | vitest ✔        |
| AC-DF26.11 | `/me/home` traz `feedback.respondidas` só quando > 0                                                              | vitest ✔        |
| AC-DF26.12 | Sem sessão o botão da topbar abre o login com o motivo; não existe formulário anônimo                             | vitest ✔        |
| AC-DF26.13 | Zero hex novo em `apps/web/src`; inventário de ícones intocado em 23/24 e marcas em 3/4                           | guards ✔        |
| AC-DF26.14 | No navegador: enviar de três páginas diferentes grava a página certa; triagem muda status e o autor vê o desfecho | manual/browser  |

## 9. Riscos e o que fica em aberto

### 9.1 O mural continua sendo o caminho provável, e a ordem importa

Se o volume crescer, duplicata vira o custo dominante da triagem e o mural passa a se pagar. A
ordem que preserva as decisões desta spec: **primeiro** publicar item a item (o dono do produto
marca "público" no que já triou), **depois** deixar as pessoas se acharem nos itens públicos, e
**só então** — se ainda fizer falta — voto. Nunca o inverso: mural aberto com voto desde o
primeiro dia é o que a pesquisa descreve como enviesado, e não tem volta fácil.

### 9.2 Anônimo pode ter sido a escolha errada

Quem chega pela vitrine tem a impressão mais valiosa e é quem a v1 exclui (§5.2). Se em duas
temporadas a fila for pequena e as conversas de WhatsApp continuarem, a hipótese a testar é
esta. O caminho de volta: cota por IP com sal diário e HMAC, exatamente como o `assistant` já
faz, com o item anônimo em balde separado na triagem — e o ciclo, para ele, fecha só se a
pessoa criar conta com o mesmo dispositivo. Essa perda é o motivo de não ser o padrão.

### 9.3 O canal cria expectativa que uma pessoa não sustenta

Fila com status promete leitura. Se a triagem parar, o efeito é pior que não ter canal: o
silêncio passa a ser visível e datado. Mitigações: os textos não prometem prazo em lugar
nenhum; `em_analise` existe para dizer "vi" sem dizer "vou fazer"; e a aba de administração
mostra o mais antigo em `novo`, que é o número que denuncia o abandono cedo.

### 9.4 Texto livre é o campo mais arriscado da LGPD no portal

Nenhum outro campo do portal convida tanto a escrever nome, telefone e conta de outra pessoa
("fulano da equipe X não consegue entrar, o e-mail dele é…"). Mitigação hoje é o aviso e a
falta de anexo. Não há varredura automática, e inventar uma daria falsa segurança. Se o volume
crescer, a decisão a tomar é retenção mais curta para itens fechados — não filtro por regex.

### 9.5 O piloto vai medir a feature errada se ela nascer vazia

Uma fila sem nada dentro parece um canal morto e recebe menos ainda. Na entrada do piloto vale
semear com o que já se sabe (as pendências herdadas que são pedido de usuário), marcadas
honestamente como registradas pelo dono do produto — nunca como se fossem de terceiros.

### 9.6 Rodar o app pegou 4 defeitos que os testes não pegariam

Conferido no navegador com a pilha local (Postgres dev, API em `AUTH_MODE=dev`, vite), o ciclo
inteiro percorrido: botão sem conta → login com o motivo → envio do Início → fila da
administração → triagem → linha no Início → leitura do desfecho → marcar como lida. **Zero
erro e zero aviso no console.** No caminho:

1. **O motivo do login não aparecia.** `authNotice` só é renderizado no ramo **cognito** do
   `LoginPanel`, então em dev a explicação sumia — e no cognito ela sairia com a classe de
   **erro**, acusando quem não fez nada errado. Virou campo próprio (`loginReason`), renderizado
   nos dois ramos, com estilo informativo. A AC-DF26.12 passava no teste e falhava na tela.
2. **As abas do painel saíam sem estilo nenhum.** `.toggle` só tem regra dentro de
   `.viewport-toolbar` e `.team-tabs` (`styles.css` L1477 registra isso). Num modal ele é
   `<button>` cru. O painel ganhou classe própria com tokens.
3. **"Enviar" ficava cortado na borda do modal.** Formulário inteiro num só bloco rolável
   empurra a ação primária para fora da vista. Só os **campos** rolam; a ação é rodapé fixo.
4. **A lista mostrava o identificador cru da página** (`inicio` em vez de "Início") — em "as
   minhas", na fila da administração e na linha do indício. `PageId` é vocabulário do código.

**Achado que NÃO é do DF-26 e fica registrado:** as seis abas da administração usam a mesma
`.toggle` sem regra e estão sem estilo desde o DF-9 — a aba Sugestões apenas acompanha as
irmãs. Corrigir é uma regra de CSS, mas mexe em tela que esta spec não abre.

### 9.7 Versão publicada fica de fora, e é uma lacuna consciente

"Está quebrado" sem saber **qual build** é meia informação. O front não sabe a versão hoje —
não há id de build em `config.json` nem em variável do Vite —, e inventar uma string seria
pior que não ter. Quando o deploy publicar essa informação, ela entra em `context` sem
migração: a coluna é `jsonb` por isso.

## 10. Plano

| Passo | Entrega                                                              |
| ----- | -------------------------------------------------------------------- |
| 1     | Migração `0011`, contrato ODCS e os testes de RLS/permissão (o gate) |
| 2     | Módulo `feedback` na API: enviar, as minhas, marcar lido, triagem    |
| 3     | Export do titular e o número no `/me/home`                           |
| 4     | Painel na web + botão na topbar + `contextoDaPagina()` puro          |
| 5     | Aba Sugestões na administração                                       |
| 6     | Rodar o app e percorrer o ciclo inteiro em três páginas diferentes   |
