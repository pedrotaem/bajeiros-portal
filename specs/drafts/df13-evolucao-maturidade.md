# DF-13 — Evolução da equipe: maturidade por área, evidências e próximos passos

> Rascunho de feature (2026-08-29). Deriva do canvas de design aprovado
> ["Bajeiros — Experiência de Evolução"](https://claude.ai/code/artifact/0a10a019-dfc6-46bb-9b28-3f7ca7cf6f8b)
> (tela "Equipe · Evolução" + página 2, opção B). É a realização do backlog RF-5.7 do
> [DF-10](df10-gestao-equipe.md) ("painel de maturidade da equipe"), generalizado para o portal
> inteiro. Decisão de arquitetura registrada em
> [`docs/adr/010-evolucao-maturidade.md`](../../docs/adr/010-evolucao-maturidade.md).

- **Direção de produto (2026-08-29):** a gaiola não é o core do portal — a evolução das equipes é.
  Importa mais equipe usando o portal e subindo a maturidade do projeto do que qualquer feature
  pontual. Ferramentas são meios que produzem evidência.
- **Base de pesquisa:** `Pesquisa de Mercado/praticas-elite.md` (10 práticas documentadas com fonte)
  e `Pesquisa de Mercado/dificuldades-por-tier.md` (síntese iniciante → intermediária → alta
  performance). Rotatividade é o problema nº 1 mapeado; a escada de níveis é calibrada por esses
  dois documentos, não por gosto.
- **Dependências:** DF-10 (organograma, capitania, trainee — implementado), DF-14 (conhecimento —
  produtor de evidência), DF-15 (calendário de competições p/ a faixa de temporada; benchmark),
  validação server-side de snapshot já existente (`evaluate()` do core roda na API).

## 1. Contexto e motivação

O portal já mede coisas valiosas — ~40 verificações automáticas da gaiola, massa, ancoragens,
organograma com vagas — mas cada medição morre na tela da própria ferramenta. Não existe resposta
para as perguntas que a capitania faz de verdade: **onde estamos fracos? o que fazemos agora? o que
já conquistamos que não pode se perder quando a turma se formar?**

A pesquisa de mercado dá o contorno: equipes iniciantes "começam do zero" a cada geração por falta
de registro; intermediárias adotam ferramentas de gestão mas falham na disciplina de execução; a
elite opera como pequena empresa e trata documentação como entregável. O DF-13 transforma esse
diagnóstico em produto: um modelo de maturidade **por área**, com **critérios verificáveis**,
alimentado por **evidências** das ferramentas e traduzido numa **fila de próximos passos** com dono.

## 2. Objetivos

| #   | Objetivo                                                                                     |
| --- | -------------------------------------------------------------------------------------------- |
| O1  | Nível de maturidade 1–5 por área, computado de critérios verificáveis (motor puro e testado) |
| O2  | Evidência automática onde a ferramenta mede; declaração auditável onde só a equipe sabe      |
| O3  | Fila de próximos passos derivada dos critérios pendentes, com dono, ordem e conclusão        |
| O4  | Faixa de temporada (marcos e contagem regressiva) como contexto, nunca como modelo           |
| O5  | Nível acumula entre temporadas — nada zera na virada do ano                                  |
| O6  | Benchmark de maturidade por coorte (mediana), sem ranking público de equipes                 |

### Não-objetivos (desta feature)

- Gamificação por pontos, badges ou ranking público de maturidade — rejeitada no ADR-010: o
  incentivo vira farmar métrica e o rótulo público constrange quem mais precisa do portal.
- Gestão de tarefas genérica (kanban, sprints) — a fila é derivada de critérios, não um Trello.
- Marcação item a item do checklist manual B6 como "verificado" — v2; na v1 a revisão dos itens
  presenciais é **um** critério declarado (EST-3.2).
- Benchmark de resultados de competição (é do DF-15; aqui entra só a mediana de maturidade).

## 3. Conceito

### 3.1 As seis áreas

| id             | Área                        | Fonte primária de evidência                  |
| -------------- | --------------------------- | -------------------------------------------- |
| `estrutura`    | Estrutura & segurança       | Validador de gaiola (snapshots avaliados)    |
| `dinamica`     | Dinâmica & powertrain       | Validador (SUSP/STEER) + declarações         |
| `documentacao` | Documentação & relatórios   | Declarações + ficha Anexo B (quando existir) |
| `fabricacao`   | Fabricação & testes         | Gabaritos do validador + guias + declarações |
| `gestao`       | Gestão & pessoas            | DF-10 (organograma, capitania, trainee)      |
| `conhecimento` | Conhecimento & continuidade | DF-14 (decisões, guias, trilha, kits)        |

### 3.2 A escada semântica dos níveis

Calibrada pela síntese comparativa da pesquisa (iniciante → intermediária → alta performance):

| Nível | Nome       | Significado                                             | Tier típico      |
| ----- | ---------- | ------------------------------------------------------- | ---------------- |
| 1     | Fundação   | Existe e está registrado no portal                      | iniciante        |
| 2     | Prática    | O básico é feito com as ferramentas e registros mínimos | iniciante        |
| 3     | Disciplina | Processo regular, com responsáveis e prazo              | intermediária    |
| 4     | Validação  | Verificado por evidência, revisão ou teste              | intermediária+   |
| 5     | Excelência | Melhoria contínua e resiliência geracional              | alta performance |

**Nível da área = maior N tal que todos os critérios de nível ≤ N estão satisfeitos** (cumulativo).
Maturidade média da equipe = média aritmética das 6 áreas, uma casa decimal, sempre acompanhada do
link "como calculamos".

### 3.3 Critério: automático, declarado ou oculto

- **Automático** — satisfeito por evidência produzida no servidor (nunca por afirmação do cliente
  quando o dado é crítico: a avaliação da gaiola usa o `evaluate()` que já roda na API ao salvar
  snapshot). Reavaliado a cada evidência nova.
- **Declarado** — marcado pela capitania (`evolution.declare`, owner/admin), com nota opcional
  (≤ 500) e link opcional (decisão, guia, projeto ou URL externa). Fica com autor + data, é
  auditado (`audit_events`) e pode ser desfeito (auditado). Modelo de confiança explícito: quem
  declara mentindo engana a própria equipe — não há ranking público que recompense a mentira.
- **Oculto** — critério cuja fonte ainda não existe no produto (ex.: ficha Anexo B gerada). Fica
  fora do denominador até a ferramenta nascer; quando entrar, o catálogo sobe de versão (§3.5).

### 3.4 Projeto da temporada

Os critérios automáticos do validador avaliam **a última versão salva do projeto designado como
"projeto da temporada"** (`team_season.season_project_id`, escolhido pela capitania; o chip de
marca "projeto atual" do design system marca esse projeto nas listagens). Rascunho aberto no editor
não conta; salvou, conta. Equipe sem projeto designado tem os critérios de validador tratados como
não satisfeitos, com aviso na tela ("designe o projeto da temporada").

### 3.5 Recomputação, quedas e versionamento do catálogo

- O nível recomputa a cada evidência ou declaração. **Queda é possível e é sinal**: salvar uma
  versão com não conformidades derruba EST de 3 para 2 — e gera evento explicativo na atividade
  ("Estrutura voltou ao nível 2 — v15 introduziu 2 infrações").
- O catálogo de critérios vive em módulo TS puro versionado (`packages/evolution`,
  `catalogVersion` semântico). Mudar catálogo pode mudar níveis: toda publicação de versão nova
  recalcula tudo e registra o delta por equipe com a explicação ("o critério X entrou no nível 3").
  Mudanças agrupadas por temporada sempre que possível (governança em §9).

## 4. Catálogo de critérios v1

Formato: `ID · [auto|declarado|oculto] · critério · fonte`. Cumulativo por nível. Os números de
piso (ex.: "≥ 10 decisões") são pisos de existência, não metas — anti-gaming em §8 (P-5.x).

### `estrutura` — Estrutura & segurança

| Nível | ID      | Tipo      | Critério                                                            | Fonte                      |
| ----- | ------- | --------- | ------------------------------------------------------------------- | -------------------------- |
| 1     | EST-1.1 | auto      | Projeto de gaiola da equipe salvo na nuvem (≥ 1 versão)             | `projects`                 |
| 2     | EST-2.1 | auto      | Gaiola completa: zero pendências de presença na última versão salva | `validation.summary`       |
| 2     | EST-2.2 | declarado | Seções e materiais conferidos com o que a equipe pretende fabricar  | capitania                  |
| 3     | EST-3.1 | auto      | Zero infrações automáticas (`fail`) na última versão salva          | `validation.summary`       |
| 3     | EST-3.2 | declarado | Itens presenciais (`manual`) revisados em reunião (com registro)    | capitania + link a decisão |
| 4     | EST-4.1 | oculto    | Ficha da gaiola (Anexo B) gerada a partir do projeto validado       | ferramenta futura          |
| 4     | EST-4.2 | declarado | Revisão do projeto da gaiola por outro membro, registrada           | capitania + link a decisão |
| 4     | EST-4.3 | declarado | Análise estrutural (FEA) do chassi realizada e arquivada            | capitania + link           |
| 5     | EST-5.1 | declarado | Gaiola fabricada conferida contra o projeto (as-built)              | capitania + link           |
| 5     | EST-5.2 | declarado | Lições da inspeção técnica registradas no diário pós-competição     | capitania + link a decisão |

### `dinamica` — Dinâmica & powertrain

| Nível | ID      | Tipo      | Critério                                                                      | Fonte                |
| ----- | ------- | --------- | ----------------------------------------------------------------------------- | -------------------- |
| 1     | DIN-1.1 | declarado | Responsáveis de suspensão/direção e de trem de força definidos no organograma | capitania            |
| 2     | DIN-2.1 | auto      | 20 ancoragens de suspensão apoiadas (SUSP.1 sem falha) na última versão       | `validation.summary` |
| 2     | DIN-2.2 | auto      | Ancoragem da direção apoiada (STEER.1) quando declarada no projeto            | `validation.summary` |
| 3     | DIN-3.1 | declarado | Geometria de suspensão documentada (memória de cálculo arquivada)             | capitania + link     |
| 3     | DIN-3.2 | declarado | Setup de transmissão/CVT registrado por condição de uso                       | capitania + link     |
| 4     | DIN-4.1 | declarado | Teste de bancada de ≥ 1 subsistema com resultado registrado                   | capitania + link     |
| 4     | DIN-4.2 | declarado | Coleta de dados em pista (aquisição/telemetria) realizada ≥ 1 vez             | capitania + link     |
| 5     | DIN-5.1 | declarado | Aquisição de dados recorrente com análise pós-teste registrada                | capitania + link     |
| 5     | DIN-5.2 | declarado | Validação cruzada simulação × ensaio para ≥ 1 sistema                         | capitania + link     |

### `documentacao` — Documentação & relatórios

| Nível | ID      | Tipo      | Critério                                                              | Fonte             |
| ----- | ------- | --------- | --------------------------------------------------------------------- | ----------------- |
| 1     | DOC-1.1 | declarado | Modelo dos relatórios da temporada definido (template SAE ou próprio) | capitania         |
| 2     | DOC-2.1 | declarado | Relatório de projeto em escrita, com responsável por seção            | capitania         |
| 3     | DOC-3.1 | declarado | Relatório enviado no prazo da temporada                               | capitania         |
| 3     | DOC-3.2 | declarado | Memórias de cálculo arquivadas por subsistema (link para o acervo)    | capitania + link  |
| 4     | DOC-4.1 | declarado | Revisão por pares de todas as seções antes do envio                   | capitania         |
| 4     | DOC-4.2 | oculto    | Ficha da gaiola (Anexo B) anexada ao pacote de documentos             | ferramenta futura |
| 5     | DOC-5.1 | declarado | Relatórios e memórias de temporadas anteriores acessíveis e indexados | capitania + link  |

### `fabricacao` — Fabricação & testes

| Nível | ID      | Tipo      | Critério                                                                     | Fonte                |
| ----- | ------- | --------- | ---------------------------------------------------------------------------- | -------------------- |
| 1     | FAB-1.1 | declarado | Acesso a oficina e processo de solda definidos (onde e quem)                 | capitania            |
| 2     | FAB-2.1 | auto      | Gabaritos de boca de lobo gerados para o projeto da temporada                | `template.generated` |
| 2     | FAB-2.2 | declarado | Plano de solda (sequência e fixação no gabarito) definido                    | capitania + link     |
| 3     | FAB-3.1 | auto      | Sequência de solda publicada como guia da equipe                             | DF-14 `guide` (tag)  |
| 3     | FAB-3.2 | declarado | Controle dimensional pós-solda registrado                                    | capitania + link     |
| 4     | FAB-4.1 | declarado | Protocolo de testes pré-competição executado e registrado (freio, shakedown) | capitania + link     |
| 5     | FAB-5.1 | declarado | Carro anterior usado como mula de testes ou bancada própria em operação      | capitania + link     |

### `gestao` — Gestão & pessoas

| Nível | ID      | Tipo      | Critério                                                       | Fonte               |
| ----- | ------- | --------- | -------------------------------------------------------------- | ------------------- |
| 1     | GES-1.1 | auto      | Capitania regular (1 capitão, ≤ 2 co) e organograma criado     | DF-10 `org.summary` |
| 2     | GES-2.1 | auto      | Todos os nós de liderança (`lead`) do organograma com ocupante | DF-10 `org.summary` |
| 2     | GES-2.2 | declarado | Rotina de reunião da equipe definida (frequência e formato)    | capitania           |
| 3     | GES-3.1 | auto      | Temporada configurada no portal (marcos com data)              | `season.configured` |
| 3     | GES-3.2 | declarado | Orçamento da temporada elaborado                               | capitania + link    |
| 4     | GES-4.1 | declarado | Trainees avaliados formalmente antes da efetivação             | capitania           |
| 4     | GES-4.2 | declarado | Carteira de apoiadores ativa (≥ 2 parcerias) registrada        | capitania + link    |
| 5     | GES-5.1 | declarado | Processo seletivo estruturado (edital/funil) praticado         | capitania + link    |
| 5     | GES-5.2 | declarado | Prestação de contas da temporada apresentada à equipe          | capitania + link    |

### `conhecimento` — Conhecimento & continuidade

| Nível | ID      | Tipo      | Critério                                                                    | Fonte                              |
| ----- | ------- | --------- | --------------------------------------------------------------------------- | ---------------------------------- |
| 1     | CON-1.1 | auto      | ≥ 1 decisão registrada no diário                                            | DF-14 `decision.created`           |
| 2     | CON-2.1 | auto      | ≥ 10 decisões e ≥ 2 guias publicados                                        | DF-14                              |
| 2     | CON-2.2 | auto      | Trilha de integração de novatos publicada (guia `kind: trilha`)             | DF-14                              |
| 3     | CON-3.1 | auto      | Último novato aprovado concluiu a trilha de integração                      | DF-14 `trail.completed`            |
| 3     | CON-3.2 | auto      | Decisões registradas em ≥ 3 áreas distintas nos últimos 6 meses             | DF-14                              |
| 4     | CON-4.1 | auto      | ≥ 1 kit de passagem concluído e nenhum kit aberto com data de saída vencida | DF-14 `kit.opened`/`kit.completed` |
| 4     | CON-4.2 | auto      | Nenhum guia órfão: todos com dono e atualização < 6 meses                   | DF-14                              |
| 5     | CON-5.1 | declarado | Ritual de lições aprendidas pós-competição realizado, com registro          | capitania + link                   |
| 5     | CON-5.2 | declarado | Memória de gerações mantida (histórico de funções/alumni — DF-10 v2)        | capitania                          |

## 5. Requisitos funcionais

### E1 — Motor de maturidade (`packages/evolution`)

- RF-1.1 Pacote TS **puro** (mesmo padrão do motor B6): catálogo v1 (§4) + `computeLevels(
evidences, declarations, now, catalogVersion)` determinístico, sem IO, 100% testável — `now` é
  injetado (necessário para os critérios com janela temporal CON-3.2/CON-4.2 e prazo CON-4.1).
- RF-1.2 Critério oculto fora do denominador; catálogo exporta `catalogVersion` e changelog.
- RF-1.3 Strings de UI (nomes de área, escada de níveis) canônicas no pacote — mesma regra do
  vocabulário de status (design-system §11.3).

### E2 — Evidências

- RF-2.1 Tabela `evolution_evidence` (append-only). Produtores v1:
  - `projects`: ao salvar snapshot do projeto da temporada, a API grava `validation.summary`
    (contagens `pass`/`fail`/`warn`/`manual`, pendências de presença, massa kg,
    `snapshotSeq`) — computado no servidor pelo `evaluate()` existente, nunca aceito do cliente.
  - `teams` (DF-10): mutações de organograma/membros gravam `org.summary` (líderes ocupados,
    vagas, contagem, trainees).
  - `evolution`: `season.configured`, `criterion.declared`, `level.changed`.
  - `web → api`: `template.generated` quando o usuário baixa gabarito de corte do projeto da
    temporada (declarativo por natureza; aceito — ver modelo de confiança §3.3).
  - DF-14: `decision.created`, `guide.published`, `trail.completed`, `kit.opened {dueDate}`,
    `kit.completed`.
  - `community` (DF-15): `competition.result {position, total}` na ingestão, para a equipe
    vinculada (contexto na atividade; **não** afeta nível — maturidade ≠ resultado, ADR-010).
- RF-2.2 Toda evidência referencia a origem (`project_id`+`snapshot_seq`, `ref_kind`+`ref_id`) e o
  ator quando houver (`actor_user_id`).
- RF-2.3 Gravação de evidência dispara recomputação dos níveis da equipe na mesma transação;
  mudança de nível grava `level.changed {area, from, to, catalogVersion}`. Como escrita não é o
  único gatilho possível de mudança, um **recálculo periódico** (1×/dia, por equipe com evolução
  ativa — mesmo agendador do cache de benchmark) cobre os critérios com janela temporal
  (CON-3.2, CON-4.2) e com prazo (CON-4.1), que expiram sem evidência nova.

### E3 — Declarações

- RF-3.1 `POST/DELETE /teams/:id/evolution/declarations/:criterionId` — policy
  `evolution.declare` (owner/admin); nota ≤ 500; link opcional (`decision|guide|project|url`).
- RF-3.2 Toda declaração/revogação audita (`evolution.declare`/`evolution.revoke`) e aparece na
  atividade da equipe.
- RF-3.3 A UI de critérios mostra sempre: estado, tipo (`automático · validador` /
  `declarado · fica no histórico`), quem declarou e quando.

### E4 — Fila de próximos passos

- RF-4.1 Passos automáticos: para cada área, cada critério **pendente do próximo nível** gera um
  passo (`origin: criterion`, dedup por `criterion_id` — idempotente). Critério satisfeito conclui
  o passo automaticamente; declarar um critério pelo passo é a mesma ação (um clique).
- RF-4.2 Passos manuais: qualquer membro cria (`origin: manual`, título ≤ 140, área opcional).
  Metas vindas do benchmark (DF-15) entram como `origin: meta`.
- RF-4.3 Dono, ordem e descarte: `step.manage` (owner/admin) atribui `owner_user_id`, reordena
  (`position`) e descarta; o dono do passo (qualquer membro) pode concluí-lo.
- RF-4.4 Exibição: 7 primeiros no painel da tela Evolução e 3 primeiros no Início (DF-16);
  "ver todos" lista completa.
- RF-4.5 Estados sem loading eterno: `'loading' | 'ok' | 'error'` (regra do design-system C-12).

### E5 — Temporada

- RF-5.1 `team_season`: rótulo (ex.: "2027"), projeto da temporada, até 12 marcos
  `{title, date}`, vínculo com competições do calendário do DF-15.
- RF-5.2 Faixa de temporada na tela Evolução: etapas Regulamento → Projeto → Relatórios →
  Fabricação e testes → Competição, com "agora" derivado por data; concluído ganha ícone de
  check (nunca só cor — CT-3).
- RF-5.3 Contagem regressiva = próximo marco futuro ("faltam N dias para X") — consumida pelo
  Início (DF-16).

### E6 — Tela Equipe · Evolução

- RF-6.1 Conforme o canvas: faixa de escore (C-09, número em serifa) com média + mediana da
  coorte (quando disponível — RF-7.2) + faixa de temporada; lista das 6 áreas com nível
  "nível N de 5" em texto + barra segmentada (`--bj-accent`, nunca só cor); linha de evidência
  com chips canônicos; "Próximo: …" por área; painel lateral com critérios do próximo nível da
  área em foco e a fila de passos.
- RF-6.2 Nasce tokenizada (`bj-*`, zero hex — guarda do plano de design); densidade
  `comfortable`; acessível conforme design-system §10 (abas ARIA, foco, aria-live no escore).
- RF-6.3 Estado de bootstrap: equipe recém-criada vê o caminho mínimo ("designe o projeto da
  temporada · registre a primeira decisão · configure a temporada") em vez de seis barras vazias.

### E7 — Benchmark de maturidade

- RF-7.1 Mediana dos níveis por área e da média, por coorte de desempenho (coorte definida no
  DF-15), recomputada no máximo 1×/dia (cache).
- RF-7.2 Só exibida quando a coorte tem **≥ 8 equipes com evolução ativa** (≥ 1 evidência em 90
  dias); abaixo disso a linha simplesmente não aparece.
- RF-7.3 Nunca existe listagem pública de maturidade de outras equipes — nem para admin na UI de
  produto (admin vê agregados no DF-9 se precisar).

## 6. Modelo de dados (proposta — migração `0005_evolution.sql`)

```sql
CREATE TABLE evolution_evidence (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id       uuid NOT NULL REFERENCES teams (id) ON DELETE CASCADE,
  source        text NOT NULL,   -- 'projects' | 'teams' | 'knowledge' | 'evolution' | 'community' | 'web'
  kind          text NOT NULL,   -- 'validation.summary' | 'org.summary' | ...
  payload       jsonb NOT NULL DEFAULT '{}'::jsonb,
  project_id    uuid REFERENCES projects (id) ON DELETE SET NULL,
  snapshot_seq  integer,
  ref_kind      text,
  ref_id        uuid,
  actor_user_id uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE evolution_declarations (
  team_id      uuid NOT NULL REFERENCES teams (id) ON DELETE CASCADE,
  criterion_id text NOT NULL,
  note         text CHECK (char_length(note) <= 500),
  link_kind    text,
  link_ref     text,
  declared_by  uuid REFERENCES users (id) ON DELETE SET NULL,
  declared_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, criterion_id)
);

CREATE TABLE evolution_levels (
  team_id         uuid NOT NULL REFERENCES teams (id) ON DELETE CASCADE,
  area            text NOT NULL,
  level           integer NOT NULL CHECK (level BETWEEN 0 AND 5),
  catalog_version text NOT NULL,
  computed_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, area)
);

CREATE TABLE evolution_steps (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id       uuid NOT NULL REFERENCES teams (id) ON DELETE CASCADE,
  title         text NOT NULL CHECK (char_length(title) <= 140),
  area          text,
  origin        text NOT NULL CHECK (origin IN ('criterion', 'manual', 'meta')),
  criterion_id  text,
  owner_user_id uuid REFERENCES users (id) ON DELETE SET NULL,
  position      integer NOT NULL DEFAULT 0,
  status        text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'dismissed')),
  created_by    uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  done_by       uuid REFERENCES users (id) ON DELETE SET NULL,
  done_at       timestamptz,
  UNIQUE (team_id, criterion_id)
);

CREATE TABLE team_season (
  team_id           uuid PRIMARY KEY REFERENCES teams (id) ON DELETE CASCADE,
  label             text NOT NULL CHECK (char_length(label) <= 20),
  season_project_id uuid REFERENCES projects (id) ON DELETE SET NULL,
  milestones        jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{title, date}] ≤ 12
  competition_ids   jsonb NOT NULL DEFAULT '[]'::jsonb,  -- refs DF-15
  updated_at        timestamptz NOT NULL DEFAULT now()
);
```

- **RLS:** todas team-scoped no padrão existente (membro lê; escrita passa pela app com policy
  layer). `evolution_evidence` é append-only por GRANT (como `audit_events`). Histórico de
  declarações fica em `audit_events` (a tabela guarda só o estado vigente).
- **Contratos ODCS novos:** `evolution-evidence.odcs.yaml`, `evolution-step.odcs.yaml`,
  `team-season.odcs.yaml` (declarations/levels documentadas no de evidence ou próprias — decidir
  na implementação). PII: `actor_user_id`/`declared_by`/`owner_user_id` — base legal **execução
  de contrato**; retenção: vida da equipe; exclusão de conta anonimiza o ator (`SET NULL`),
  preservando o fato da equipe.

## 7. API (módulo novo `evolution`)

| Método/rota                                             | Ação                                     | Permissão                      |
| ------------------------------------------------------- | ---------------------------------------- | ------------------------------ |
| `GET    /teams/:id/evolution`                           | níveis + critérios (estado) + média      | membro                         |
| `POST   /teams/:id/evolution/declarations/:cid`         | declarar critério (nota + link)          | `evolution.declare`            |
| `DELETE /teams/:id/evolution/declarations/:cid`         | revogar declaração                       | `evolution.declare`            |
| `GET    /teams/:id/evolution/steps?status=`             | fila (ordenada)                          | membro                         |
| `POST   /teams/:id/evolution/steps`                     | passo manual                             | membro                         |
| `PATCH  /teams/:id/evolution/steps/:sid`                | dono/ordem/status                        | `step.manage` ou dono (status) |
| `GET    /teams/:id/season`                              | temporada (rótulo, marcos, projeto)      | membro                         |
| `PUT    /teams/:id/season`                              | configurar temporada                     | `evolution.season`             |
| `GET    /teams/:id/activity?limit=&before=`             | feed (evidências + eventos, paginado)    | membro                         |
| `POST   /teams/:id/evolution/events/template-generated` | evidência de gabarito gerado             | membro                         |
| `GET    /evolution/benchmark?cohort=`                   | medianas da coorte (cacheado, piso de 8) | membro c/ equipe               |

Policy layer ganha `evolution.declare`, `evolution.season`, `step.manage` (owner/admin).
Auditoria: `evolution.declare/revoke`, `evolution.season.update`, `evolution.step.*`.

## 8. Pontos de falha e mitigação

| ID    | Ponto de falha                                                                  | Mitigação                                                                                                                     |
| ----- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| P-1.1 | Catálogo mal calibrado vira burocracia (risco nº 1, apontado no próprio canvas) | v1 enxuta (51 critérios), revisão por temporada, piloto com 2–3 equipes reais antes de abrir (plano, gate entre EV-M2 e o GA) |
| P-1.2 | Nível flutua durante edição e frustra                                           | Avaliação só sobre **versão salva** do projeto da temporada (§3.4); queda gera evento explicativo                             |
| P-1.3 | Mudança de catálogo derruba nível sem aviso                                     | `catalogVersion` + recomputação com delta explicado na atividade; agrupar mudanças por temporada                              |
| P-2.1 | Evidência forjada pelo cliente                                                  | Tudo que é crítico é server-side (`evaluate()` na API); o resto é declarativo por design (§3.3)                               |
| P-2.2 | Recomputação a cada evidência pesa no Aurora 0 ACU                              | Recomputar só a equipe afetada, na mesma transação; benchmark agregado com cache diário                                       |
| P-3.1 | Fila auto-gerada duplica passos                                                 | `UNIQUE (team_id, criterion_id)` + upsert idempotente                                                                         |
| P-3.2 | Fila vira lista infinita de cobrança                                            | Só critérios do **próximo** nível geram passo; exibição limitada (7/3); descarte auditado                                     |
| P-4.1 | Equipe sem projeto designado "zera" Estrutura sem entender                      | Aviso persistente na área + passo automático "Designar o projeto da temporada"                                                |
| P-5.1 | Gaming de contadores (10 decisões vazias p/ subir CON)                          | Pisos baixos (existência, não volume), capitania revoga, sem ranking público — o ganho de trapacear é zero                    |
| P-5.2 | Benchmark constrange equipes fracas                                             | Mediana anônima da coorte, piso de 8 equipes, nunca lista nominal (RF-7.3)                                                    |
| P-6.1 | RLS: evidência gravada por membro em equipe alheia                              | Escrita só pela app após checagem de membership (padrão existente); testes RLS dedicados                                      |

## 9. Governança do catálogo

- O catálogo é código (`packages/evolution`), revisado por PR como qualquer regra do motor B6.
- Cadência: revisão a cada virada de temporada (com o regulamento novo) + correções pontuais.
- Todo critério novo nasce `oculto` se a fonte não existe; promover a `auto`/`declarado` é
  mudança de versão.
- Feedback de calibração: a tela de critérios ganha (v2) "este critério não faz sentido para
  nós" → registro para revisão; na v1, o canal é o contato da equipe piloto.

## 10. Critérios de aceite

| #          | Critério                                                                                                                                          |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-DF13.1  | Motor puro: fixtures de evidências/declarações → níveis esperados (todas as 6 áreas, casos de borda)                                              |
| AC-DF13.2  | Com EST-2.2/3.2 declarados, salvar o projeto da temporada sem infração automática sobe EST para 3; salvar com infração derruba para 2, com evento |
| AC-DF13.3  | Snapshot de projeto que NÃO é o da temporada não gera evidência nem muda nível                                                                    |
| AC-DF13.4  | Declarar critério exige owner/admin; membro comum recebe 403; declaração aparece auditada                                                         |
| AC-DF13.5  | Critério pendente do próximo nível gera exatamente 1 passo; satisfazer o critério conclui o passo                                                 |
| AC-DF13.6  | Critério `oculto` não aparece na UI nem conta no denominador                                                                                      |
| AC-DF13.7  | Temporada configurada → GES-3.1 satisfeito; contagem regressiva correta no Início                                                                 |
| AC-DF13.8  | Benchmark oculto com coorte < 8; visível e correto com ≥ 8 (fixture)                                                                              |
| AC-DF13.9  | Export LGPD inclui declarações/passos/evidências do titular; exclusão de conta anonimiza o ator                                                   |
| AC-DF13.10 | RLS: membro de outra equipe não lê nem escreve evidência/declaração/passo (teste dedicado)                                                        |

## 11. Riscos e questões em aberto

1. **Média com casa decimal** ("2,2 / 5") pode virar número-fetiche; alternativa: mostrar só os 6
   níveis. Manter a média na v1 (o canvas a usa como âncora) e observar no piloto.
2. **Peso das áreas** — média simples trata Conhecimento como igual a Estrutura. Deliberado
   (rotatividade é o problema nº 1); revisitar se o piloto mostrar distorção.
3. **Entitlements** — v1 sem gate de plano; decidir no M3 (billing) se benchmark/histórico viram
   recurso pago. Registrado, não decidido.
4. **Critérios com link externo** (FEA, orçamento) apontam para fora do portal (Drive etc.) — o
   portal não valida o conteúdo; é o modelo de confiança declarado. Guardar apenas URL (sem
   upload de arquivo na v1).
5. **Múltiplos projetos/carros** (mula + competição, prática 7): v1 tem 1 projeto da temporada;
   equipe de elite com 2 carros escolhe o de competição. Reavaliar na v2.
