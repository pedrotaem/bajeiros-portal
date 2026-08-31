# Plano de implementação — evolução das equipes (DF-12…DF-16, DF-18…DF-21)

**Data:** 2026-08-29 · **Versão:** 1.0 (rascunho para revisão)
**Escopo:** as cinco specs do lote evolução — [DF-12 shell/navegação](../specs/drafts/df12-shell-navegacao.md),
[DF-13 evolução/maturidade](../specs/drafts/df13-evolucao-maturidade.md),
[DF-14 conhecimento](../specs/drafts/df14-conhecimento.md),
[DF-15 comunidade/resultados](../specs/drafts/df15-comunidade-resultados.md),
[DF-16 início](../specs/drafts/df16-inicio.md) — decididas em
[`docs/adr/010-evolucao-maturidade.md`](adr/010-evolucao-maturidade.md), desenhadas no canvas
["Bajeiros — Experiência de Evolução"](https://claude.ai/code/artifact/0a10a019-dfc6-46bb-9b28-3f7ca7cf6f8b).
**Não supersede nada.** Corre em paralelo ao
[`plano-implementacao-design.md`](plano-implementacao-design.md) (13 fases, numeração canônica
"fase N"), com dois pontos de amarração declarados abaixo. Numeração deste plano: **EV-0…EV-11**,
uma fase = um PR mergeável. **EV-9…EV-11** entraram em 2026-08-30 com o lote das patentes
([ADR-011](adr/011-patentes-gamificacao.md)) e a ficha do protótipo (DF-21).
**Premissa de execução:** uma pessoa, incremental, sem congelar o produto. Backend primeiro
(evidência fluindo sem UI), depois as superfícies — cada tela nasce tokenizada (`bj-*`, zero hex
novo), o que **reduz** a dívida que o plano de design está pagando, em vez de aumentá-la.

## Amarração com o plano de design

1. **Fase 0 (tokens) é pré-requisito de toda UI nova deste plano.** As telas EV-4…EV-8 consomem
   `tokens.css`/`tokens.ts` e os 5 glifos de status; sem a fase 0, cada tela nova nasceria com
   hex literal e entraria na catraca errada.
2. **Fase 6 (rail) e EV-3 (shell DF-12) são o MESMO PR** — o conteúdo de produto da fase 6 é o
   DF-12. O gate da fase 6 (câmera preservada, reflow a 200%) vale integralmente. As fases 2–5 e
   7–12 do plano de design seguem no próprio ritmo, sem dependência daqui (exceto onde marcado).

## Estado da execução (2026-08-31)

**EV-0 a EV-11 implementadas**, em commits separados por fase, sobre a fase 0 do plano de
design (que entrou junto por ser pré-requisito duro de toda UI nova). O que a tabela
abaixo descreve está no código; o que falta é a parte que não é código:

| Fase  | Estado | Onde                                                                                         |
| ----- | ------ | -------------------------------------------------------------------------------------------- |
| EV-0  | ✅     | `packages/evolution` — catálogo, `computeLevels()`                                           |
| EV-1  | ✅     | migração `0005`, módulo `evolution`, produtores em `projects` e `teams`                      |
| EV-2  | ✅     | migração `0006`, módulo `knowledge`, `knowledge.summary`                                     |
| EV-3  | ✅     | `Shell.tsx` + rail + hub + "Sobre" + equipe com 4 abas                                       |
| EV-4  | ✅     | `EvolutionTab.tsx`                                                                           |
| EV-5  | ✅     | `KnowledgeTab.tsx`                                                                           |
| EV-6  | ✅     | `GET /me/home` + `HomePage.tsx`                                                              |
| EV-7  | ✅     | migração `0007`, módulo `community`, ingestão em dry-run, `CommunityPage`                    |
| EV-8  | ✅     | benchmark por prova com piso de coorte e "transformar em meta"                               |
| EV-9  | ✅     | catálogo **v2.0.0** (DF-19), `ranks.ts`, migração `0008`, opt-in, carência, faixa e cartaz   |
| EV-10 | ✅     | `counter.ts` (DF-20), migração `0010`, reafirmação, `counter.*` na atividade, UI do suspenso |
| EV-11 | ✅     | `packages/datasheet`, migração `0009`, módulo `datasheet`, `DatasheetTab`                    |

### O que a virada do DF-19 mudou em tudo que veio antes

O catálogo `2.0.0` é **autodeclarativo** (`CATALOG_MODE = 'declarado'`): o critério `auto`
**deixou de ser satisfeito pela evidência**. Quem satisfaz é a resposta da capitania; a
evidência virou a MEDIDA exibida ao lado (`measured`), e a discordância vira `divergent` —
o conjunto que vai calibrar a aferição antes de ela existir (DF-19 RF-1.3).

Consequência prática para quem lê a suíte antiga: o que se afirmava em `satisfied` passou a
ser afirmado em `measured`. Nenhum critério sumiu — os dois `oculto` do v1.0.0 viraram
declarados e o denominador é **51 visíveis**.

E a virada do DF-18: **sem opt-in da capitania, nenhuma resposta de API traz nível ou
patente** (AC-DF18.2). `GET /teams/:id/evolution` devolve o painel de ativação no lugar, e
`/me/home` devolve `evolution: null`. Medir sem pedir transforma ferramenta em auditoria.

**Pendências que continuam abertas** (nenhuma é implementação):

1. **Gate de piloto** com 2–3 equipes reais por ≥ 3 semanas — o catálogo só congela
   depois dele. É o mitigador do risco nº 1 da feature (P-1.1, calibração de gabinete).
2. **ADR-010 e ADR-011 em `proposto`** — a revisão do product owner os promove a `aceito`.
3. **Recálculo diário**: o corpo existe (`POST /admin/evolution/recompute`); falta o
   gatilho de infraestrutura (EventBridge → Lambda). Enquanto isso, o `GET` da evolução
   recompute por equipe, o que cobre quem abre a tela mas não quem não abre. **Isto agora
   pesa mais**: é o mesmo caminho que resolve a carência da patente (DF-18 RF-4.5) — a queda
   de quem nunca abre a tela fica pendurada até alguém abrir.
4. **Ingestão do acervo** (DF-15): rodada só em dry-run. O `--apply` exige `--admin` e a
   conferência do diff no PR. Sem ele, nenhuma equipe passa da patente 5 (trava 2).
5. **Calibração numérica**, toda marcada como gabinete nas specs: os 8 pares (média, piso)
   do DF-18 §3.4; os pisos do DF-19 (`CON-2.1` 10 decisões e 2 guias, `GES-4.2` 2 parcerias,
   `CON-3.2` 3 áreas em 6 meses); o limiar de 50% do indício de massa (DF-20 §8.2).
6. **Licença da arte** (DF-18 RF-8.3): CC BY-NC vale enquanto o portal for gratuito. O marco
   M3 prevê assinaturas — antes de cobrar, permissão dos dois autores **ou** a escada de nomes
   livres, que já vive no catálogo (`RankDef.nomeLivre`) e é trocar uma coluna.
7. **Vocabulário fail/manual** (DF-12 RF-4.2) e **base legal do conteúdo pós-exclusão**
   (DF-14 §8.3) seguem como decisões de gente.

## Tabela-resumo das fases

| Fase  | Entrega                                             | Branch                   | Esforço | Marco | Gate resumido                                                                          |
| ----- | --------------------------------------------------- | ------------------------ | ------- | ----- | -------------------------------------------------------------------------------------- |
| EV-0  | Motor puro `packages/evolution` (catálogo + níveis) | `feat/df13-motor`        | M       |       | Fixtures → níveis esperados; catálogo versionado; zero IO                              |
| EV-1  | Banco + API `evolution` + produtores de evidência   | `feat/df13-api`          | G       | EV-M1 | Salvar snapshot do projeto da temporada muda nível sem UI; RLS testada                 |
| EV-2  | Banco + API `knowledge` (DF-14)                     | `feat/df14-api`          | G       |       | Decisão/guia/trilha/kit geram evidência; export LGPD ampliado                          |
| EV-3  | Shell novo (DF-12 = fase 6 do design)               | `feat/df11-rail` (mesma) | G       |       | 4 destinos + Ferramentas hub; câmera preservada; paridade DF-10                        |
| EV-4  | Tela Equipe · Evolução (DF-13 UI)                   | `feat/df13-ui`           | G       |       | Ciclo completo: evidência → nível → critério → passo → conclusão, no browser           |
| EV-5  | Tela Equipe · Conhecimento (DF-14 UI) + busca       | `feat/df14-ui`           | M       | EV-M2 | Registrar decisão em ≤ 30 s a partir do editor; kits operáveis                         |
| EV-6  | Início (DF-16) + `GET /me/home`                     | `feat/df16-inicio`       | M       |       | 1 chamada alimenta a página; estados vazio/bootstrap/erro                              |
| EV-7  | Comunidade (DF-15): ingestão + resultados + claim   | `feat/df15-comunidade`   | G       | EV-M3 | Acervo 2021–2026 publicado e conferido; claim manual; correções auditadas              |
| EV-8  | Benchmark + metas → fila + polimento do ciclo       | `feat/df15-benchmark`    | M       |       | Mediana com piso de 8; "transformar em meta" cria passo; leitura editorial revisada    |
| EV-9  | **Patentes do protótipo** (DF-18 + catálogo DF-19)  | `feat/df18-patentes`     | G       | EV-M4 | Opt-in retroativo; patente derivada; carência de 30 dias; vitrine desligada por padrão |
| EV-10 | **Aferição** das declarações (DF-20)                | `feat/df20-afericao`     | M       |       | Onda V1 (19 contraprovas) sem ferramenta nova; indício pergunta, não derruba           |
| EV-11 | **Ficha do protótipo** (DF-21)                      | `feat/df21-ficha`        | G       | EV-M5 | Campos tipados por subsistema; ficha 100% preenchível sem gaiola; usada no relatório   |

Marcos: **EV-M1** = a evidência flui de ponta a ponta sem UI (fim da EV-1) · **EV-M2** = uma
equipe vive o ciclo completo no produto (Evolução + Conhecimento + Início; fim da EV-5/6) ·
**EV-M3** = Comunidade no ar com o acervo publicado (fim da EV-7) · **EV-M4** = uma equipe real
ativa a avaliação e recebe uma patente que faz sentido para ela (fim da EV-9) · **EV-M5** = uma
equipe preenche a ficha do protótipo e usa a exportação no relatório, sem que ninguém tenha
mencionado maturidade (fim da EV-11).

**Gate de produto (entre EV-M2 e o GA):** piloto com 2–3 equipes reais convidadas (uma iniciante,
uma intermediária) por ≥ 3 semanas, com os itens de observação listados nas specs (calibração do
catálogo, adoção do diário, percepção da fila). O catálogo v1 só congela depois do piloto.

## Fases

### EV-0 — Motor puro

`packages/evolution`: catálogo v1 (51 critérios, DF-13 §4), `computeLevels()`, strings canônicas
das áreas/escada, `catalogVersion` + changelog. Testes por fixture cobrindo: cumulatividade,
critério oculto fora do denominador, queda de nível, mudança de versão de catálogo com delta.
**Nada é consumido ainda** (mesmo padrão da fase 0 do design).

- **Aceite:** vitest verde; catálogo revisado contra as fontes da pesquisa (cada critério cita a
  prática/dificuldade de origem em comentário).
- **Risco:** calibração de gabinete. Mitigação: revisão do product owner critério a critério
  antes do merge — é a lista mais barata de mudar agora e a mais cara depois.

### EV-1 — Banco + API evolution + produtores

Migração `0005_evolution.sql` (5 tabelas, RLS, append-only de evidência), módulo `evolution`
(rotas do DF-13 §7), policy (`evolution.declare/season`, `step.manage`), produtores:
`projects` (validation.summary no save do projeto da temporada), `teams` (org.summary),
`evolution` (season/declaration/level.changed) + recálculo periódico agendado (1×/dia, cobre
critérios com janela temporal). Contratos ODCS novos; export LGPD ampliado.

- **Aceite:** teste de integração: criar equipe → designar projeto → declarar EST-2.2/3.2 →
  salvar versão sem infração → EST=3; salvar com infração → EST=2 + evento; RLS de terceiros
  negada.
- **Risco:** recomputação na transação do save aumenta a latência do salvar. Medir; se passar de
  ~100 ms adicionais, mover para pós-commit com consistência eventual **declarada**.

### EV-2 — Banco + API knowledge

Migração `0006_knowledge.sql`, módulo `knowledge` (DF-14 §6), `knowledge.moderate`, evidências
para o DF-13 na mesma transação, busca ILIKE, caps. Export LGPD e anonimização de autoria.

- **Aceite:** ACs DF-14.1–14.6/14.8–14.10 via testes de API; CON-\* do motor satisfeitos por
  fixtures reais de decisão/guia/trilha/kit.

### EV-3 — Shell novo (com a fase 6 do design)

PageIds novos, rail C-01/C-02 com os 3 glifos novos (processo §8.9), Ferramentas hub, rótulos
§9.4, "Sobre" como página, `track()` atualizado. Paridade funcional com DF-10 (as 5 abas viram
Pessoas + contêiner). Toast único de transição ("Editor agora vive em Ferramentas").

- **Aceite:** ACs DF-12.1–12.9; roteiro de captura da fase 6 (câmera, 200%, 1024×768).
- **Risco:** o maior PR visual do lote. Mitigação: EV-3 não redesenha o **conteúdo** de nenhuma
  página existente — só o chrome; conteúdos novos vêm nas fases seguintes.

### EV-4 — Tela Equipe · Evolução

Tela do canvas: faixa C-09, 6 áreas, critérios com tipo visível, fila com dono/ordem, faixa de
temporada, configuração da temporada (PUT season). Estados de bootstrap.

- **Aceite:** ciclo completo no browser (AC-DF13.2/13.4/13.5/13.7); zero hex novo; abas/foco/
  aria-live conforme design-system §10.

### EV-5 — Tela Equipe · Conhecimento

Tela do canvas + atalhos de contexto no editor ("registrar decisão" com links pré-preenchidos),
busca agrupada, kits com aviso de credenciais.

- **Aceite:** registrar decisão a partir de um item do checklist em ≤ 30 s (medido no roteiro);
  ACs DF-14.4–14.7.

### EV-6 — Início

`GET /me/home` agregador + a página do canvas com os 6 módulos e os 4 estados (normal, sem
equipe, bootstrap, erro).

- **Aceite:** ACs DF-16.1–16.8; teste de payload; skeleton em cold start real (staging).

### EV-7 — Comunidade

Migração `0007_community.sql`, módulo `community`, `scripts/ingest-results.mjs` (idempotente,
descarta PII), telas Resultados/Equipes do Brasil, claim manual (aba admin no DF-9), correções.

- **Aceite:** ACs DF-15.1–15.3/15.6–15.8; conferência amostral do acervo publicada no PR.
- **Risco:** credibilidade do dado. O PR inclui o diff dry-run da ingestão como artefato de
  revisão.

### EV-8 — Benchmark e metas

Coortes (tercis por resultados), medianas com piso de 8, bloco "sua equipe no contexto",
"transformar em meta" → fila, mediana de maturidade na tela Evolução, textos editoriais
revisados (gate legal de marca junto).

- **Aceite:** ACs DF-15.4/15.5/15.9, DF-13.8; revisão dos textos contra a restrição de marca.

### EV-9 — Patentes do protótipo

Lote do [ADR-011](adr/011-patentes-gamificacao.md). Entra **depois** do lote DF-12…DF-16 estar
mergeado, porque lê os níveis que ele calcula.

| Sub    | Entrega                                                                                                      | Estado          |
| ------ | ------------------------------------------------------------------------------------------------------------ | --------------- |
| EV-9.1 | Catálogo **v2.0.0** (DF-19: enunciados, `CATALOG_MODE`, fim dos `oculto`) + `computeRank()` + tabela `RANKS` | ✅ implementada |
| EV-9.2 | Migração `0008`, opt-in retroativo, carência de 30 dias no recálculo, patente em `/evolution` e `/me/home`   | ✅ implementada |
| EV-9.3 | Painel de ativação, faixa da patente, painel "para chegar em …", aviso de promoção                           | ✅ implementada |
| EV-9.4 | Cartaz PNG no cliente, chave de vitrine, vitrine do perfil público (`team_rank_showcase`)                    | ⚠️ ver nota     |

- **Aceite:** ACs DF-18.1–18.14 e DF-19.1–19.10, cobertos por
  `packages/evolution/src/{catalog,ranks}.test.ts`, `apps/api/src/test/patentes.test.ts` e
  `apps/api/src/test/evolution.test.ts`.
- **Ordem obrigatória:** EV-9.1 antes de tudo — publicar o catálogo v2.0.0 recalcula níveis
  existentes e o delta precisa aparecer na atividade antes de a patente entrar em cena.
- **Gate de licença:** a arte é CC BY-NC (DF-18 §8). Se o marco M3 de assinaturas estiver no
  horizonte quando a EV-9.4 começar, resolver permissão ou arte original **antes** de publicar a
  vitrine — é a superfície que leva o emblema para fora do portal.
- **Risco próprio:** ninguém ativar. Mitigado pela retroatividade (RF-2.4) e medido como sinal.

**Nota da EV-9.4.** O cartaz e a chave de vitrine estão prontos, e o back da vitrine também
(`GET /community/teams/:id` devolve o bloco `rank` quando `teams.rank_public` está ligada,
por `team_rank_showcase()`). O que **não** foi feito é o emblema na tela da Comunidade: a web
só tem a LISTA de equipes do acervo, e a RF-6.3 proíbe exibir patente de terceiro em qualquer
agregado — listagem inclusa. O emblema entra quando existir a tela de PERFIL da equipe, que é
outra superfície e não está nesta spec. Preferi deixar a rota pronta e a tela de fora a furar
a RF-6.3 por conveniência.

**Duas decisões de implementação que a spec não fixou:**

1. **"Colocar os N na fila" virou "ver os N na fila".** O §7 pede o botão, mas passo de
   critério é DERIVADO (DF-13 RF-4.1): ele já nasce na fila quando o critério fica pendente.
   O botão que "coloca" seria um no-op com nome de ação. O painel rola até a fila e mostra os
   passos que já estão lá.
2. **A mediana da coorte em emblema é só de MATURIDADE** e para no teto da patente 5. O
   benchmark do DF-13 devolve a mediana das médias, não os resultados de competição das outras
   equipes — que o produto não pode cruzar por equipe (RF-6.3/RF-7.3). Chamar o resultado de
   "patente da coorte" sem esse recorte seria inventar um número que ninguém mediu; a tela diz
   "pela maturidade".

### EV-10 — Aferição das declarações

O CÓDIGO está pronto; o que espera é o **gate de produto**: ao menos uma temporada de v1
autodeclarativa, porque sem esse período não há divergência acumulada para calibrar as
mensagens. O gate mora numa variável de ambiente, não num deploy.

| Sub     | Entrega                                                                     | Estado          |
| ------- | --------------------------------------------------------------------------- | --------------- |
| EV-10.1 | `counterCheck` no motor + as 19 contraprovas da onda V1 + fixtures          | ✅ implementada |
| EV-10.2 | Estados na API, reafirmação, evidências `counter.*`, narração na atividade  | ✅ implementada |
| EV-10.3 | UI do critério suspenso, piso de atividade, atalhos de conserto             | ✅ implementada |
| EV-10.4 | Onda V2 do `DIN-3.x` — massa × mediana da MESMA CLASSE (destravada pelo 11) | ✅ implementada |

- **O gate é `EVOLUTION_MODE`.** Default `declarado` (a v1 do produto). Virar para `aferido`
  liga as contraprovas e **não exige migração** (AC-DF19.10): é o mesmo dado, outro cálculo.
  `apps/api/src/test/afericao.test.ts` roda a suíte inteira com o modo ligado, de ponta a ponta.
- **Aceite:** ACs DF-20.1–20.12. AC-DF20.6 (piso de atividade) é coberta no motor
  (`counter.test.ts`) e não pela API: toda equipe do portal nasce com organograma semeado, e a
  segunda condição do piso — organograma inexistente — não acontece por caminho de produto.
- **Entrada:** relatório do piloto com a taxa de divergência declaração × medida por área,
  coletada de graça pelo pré-preenchimento do DF-19 RF-1.3, e agora gravada em
  `evolution_declarations.divergent`.
- **A onda V2 do `DIN-3.x` deixou de estar bloqueada.** A questão aberta §8.1 — comparar massa
  entre projetos incomparáveis — foi resolvida pela ficha (DF-21 §5.1: ocupantes + tração são
  campos comparáveis). `evolution_mass_median(classe)` (migração `0010`) cruza só protótipos da
  MESMA classe, com piso de 8; sem classe declarada não há comparação e a contraprova não
  existe. O limiar de 50% acima da mediana segue sendo o número do §8.2 — proposto, não medido.

### EV-11 — Ficha do protótipo

Feature **independente do lote das patentes** — a ficha se paga por inspeção, relatório, sucessão
e comparação de comunidade, sem citar maturidade. Executável **antes** da EV-10, e é o que
destrava a onda V2 da aferição.

| Sub     | Entrega                                                                               | Estado                        |
| ------- | ------------------------------------------------------------------------------------- | ----------------------------- |
| EV-11.1 | `packages/datasheet` — catálogo v1, tipos, `suggestFrom()` sobre o motor B6, fixtures | ✅ implementada               |
| EV-11.2 | Migração `0009`, módulo `datasheet` na API, revisões com origem, dispensas, RLS       | ✅ implementada               |
| EV-11.3 | Página de projeto com 3 abas + aba Ficha (sugestões, três colunas, avisos)            | ✅ implementada               |
| EV-11.4 | Exportação Markdown/CSV, kit de passagem por cargo, catálogo de maturidade `2.1.0`    | ⚠️ só a exportação — ver nota |

- **Aceite:** ACs DF-21.1–21.12.
- **O que ficou de fora da EV-11.4, e por quê** (registrado na implementação de 2026-08-30):
  - **Kit de passagem por cargo (RF-6.2)** depende de uma amarração seção → cargo do organograma
    que a própria spec deixa **em aberto** (DF-21 §12.5: "amarrar seção ao cargo seria elegante e
    provavelmente cedo demais"). Implementar exigiria inventar o mapa que a decisão de produto
    ainda não tomou. `COMPARABLE_FIELDS` e o catálogo já expõem o que o kit precisaria consumir.
  - **Catálogo de maturidade `2.1.0`** não se aplica ainda: o catálogo em código é o **v1.0.0** do
    DF-13 — o v2.0.0 do DF-19 não foi implementado. A edição do campo "onde registrar" acontece
    quando o DF-19 entrar.
  - **Medianas por classe na comunidade (RF-6.4)** ficam para quando houver acervo: o gancho já
    existe (`comparable` no catálogo), a agregação não.
- **Ordem interna:** EV-11.3 exige a página de projeto, que é a primeira tela de detalhe de
  projeto do produto — hoje projetos vivem num modal. Vale conferir com o plano de design antes de
  abrir o PR de UI.
- **Guarda de conceito:** o validador é meio, não porta de entrada (DF-21 §3.2). A EV-11.1 inclui o
  teste que percorre o catálogo e falha se algum campo não aceitar escrita, e a EV-11.3 só é aceita
  com um projeto **sem nenhuma gaiola salva** chegando a 100% de preenchimento.
- **Risco próprio:** 70 campos assustam. Mitigado pelas sugestões e por nada ser obrigatório.

## Riscos transversais

1. **Adoção** — o modelo só vale com equipe dentro. O gate de piloto entre EV-M2 e o GA existe
   para isso; convites diretos às equipes mapeadas na pesquisa (relação já levantada em
   `relacao-equipes-organizacao.md`).
2. **Aurora 0 ACU** — Início e Evolução são as novas primeiras telas; ambos os endpoints são
   agregadores únicos com skeleton e "tentar de novo". Medir cold start no staging antes do GA.
3. **Duas frentes de UI simultâneas** (este plano + fases 2–12 do design) — mesma pessoa, risco
   de contexto. Regra prática: nunca dois PRs de UI abertos ao mesmo tempo; backend (EV-1/2/7)
   pode intercalar com fases de design.
4. **Escopo dos "Could"** — popstate mínimo, histórico de versões de guia, coorte pública
   opt-in, FTS: todos registrados nas specs como v2; nenhum entra neste plano.
