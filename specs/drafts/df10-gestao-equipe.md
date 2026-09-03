# DF-10 — Gestão de equipe: capitania, hierarquia de funções, organograma e página completa

> Rascunho de feature. Evolui a fase 14 (equipes e convites) de "lista de membros num modal"
> para gestão de equipe de verdade, inspirada nas práticas das equipes de elite do Baja SAE
> Brasil (ver `Pesquisa de Mercado/praticas-elite.md`, Prática 1: estrutura organizacional
> de empresa, com organograma e funções bem definidos — EESC USP, Poli, Komiketo).

- **Status:** ✅ **IMPLEMENTADA** (2026-08-26, `6b895d7` / PR #28). Não vai para `spec.md`, que
  é do validador — esta é feature de portal e o status mora aqui. O RF-5.7 (requisitos de
  maturidade) foi realizado pelo [DF-13](df13-evolucao-maturidade.md), não por esta spec.

## 1. Contexto e motivação

Hoje o portal tem equipes com três papéis técnicos (`owner`/`admin`/`member`), convite por
link, e tudo vive no `TeamsPanel` renderizado como modal (`SessionPanels`). Não existe:

- vocabulário do domínio Baja (capitão/capitã, co-capitão, líder de subsistema);
- confirmação de entrada — quem aceita o convite entra direto como membro;
- estrutura organizacional (subsistemas, responsabilidades) nem visualização dela;
- espaço de tela para a gestão crescer (o modal limita tudo a uma coluna estreita).

A pesquisa de mercado mostra que **estrutura organizacional explícita é a prática nº 1 das
equipes campeãs**: a Poli organiza 50+ membros em 10 departamentos com capitão e chefes de
subsistema; a EESC USP "funciona como uma pequena empresa, com organograma e funções bem
definidos". O portal deve tornar essa prática o caminho padrão para qualquer equipe.

## 2. Objetivos

| #   | Objetivo                                                                                  |
| --- | ----------------------------------------------------------------------------------------- |
| O1  | Capitania dupla: 1 capitão/capitã + até 2 co-capitães confirmam entradas e gerem pessoas  |
| O2  | Hierarquia de funções customizável, com descrição de responsabilidades por função         |
| O3  | Organograma dinâmico e visual da equipe                                                   |
| O4  | Página completa de gestão/configuração da equipe (fim do modal)                           |
| O5  | Incorporar requisitos derivados de `praticas-elite.md` (estrutura, trainee, continuidade) |

### Não-objetivos (desta feature)

- Gestão de tarefas/projetos ágil ou riscos PMBOK (Prática 2) — outra feature.
- Processo seletivo completo com formulário/edital (Prática 3) — aqui entra só o _status_
  trainee no ciclo de vida do membro.
- Base de conhecimento/wiki (Prática 4) — aqui entra só descrição de responsabilidades e
  histórico de ocupação de função (v2).
- Envio de e-mail de convite (continua link copiável).
- Router/URLs profundas — a SPA segue navegando por estado (`PageId`); deep-link fica para
  quando o portal ganhar router.

## 3. Conceito: papel de acesso ≠ função organizacional

Decisão central de design: **separar RBAC de organograma**.

- **Papel de acesso** (`team_members.role`): continua `owner`/`admin`/`member` no banco e na
  API — é o que a RLS e a policy layer já entendem. A UI passa a rotular:
  `owner` = **capitão/capitã**, `admin` = **co-capitão/co-capitã**, `member` = **membro**.
- **Função organizacional** (`team_positions`): árvore customizável de funções com nome,
  descrição de responsabilidades e ocupantes. Capitão e co-capitão são nós da árvore _e_
  papéis de acesso; líder de subsistema é só função (acesso de `member`, salvo promoção).

Por que: reaproveita RLS/policy/testes existentes sem migração de semântica; permite à
equipe redesenhar o organograma sem mexer em permissão; evita a armadilha de "líder de
freios" virar super-usuário por acidente.

Invariantes novos de capitania (aplicados na camada de app, dentro da transação):

- Exatamente **1 owner** por equipe não-vazia (hoje o modelo permite N owners).
- No máximo **2 admins**.
- Troca de capitania é operação atômica (`transfer-captaincy`): promove o novo e rebaixa o
  atual na mesma transação — nunca 0 nem 2 capitães.
- Equipes legadas com N owners: não quebram; a API recusa _novas_ promoções que violem os
  limites e oferece a transferência para regularizar.

## 4. Requisitos funcionais

### E1 — Capitania dupla e confirmação de entrada

- RF-1.1 Aceitar convite deixa de criar membro direto: cria **solicitação de entrada**
  (`team_join_requests`) e informa "aguardando confirmação da capitania".
- RF-1.2 Capitão e co-capitães veem a fila de solicitações e podem **aprovar** (vira membro,
  com status inicial `trainee` ou `efetivo` à escolha) ou **recusar**.
- RF-1.3 Solicitação expira em 30 dias sem ação (limpeza preguiçosa, como convites).
- RF-1.4 Fundador da equipe entra como capitão sem confirmação (equipe vazia).
- RF-1.5 Promover a co-capitão falha com erro claro se já houver 2.
- RF-1.6 `transfer-captaincy`: capitão indica sucessor; ex-capitão vira co-capitão (se
  houver vaga) ou membro.
- RF-1.7 Convidar continua restrito a capitão/co-capitães (`invite.create` já é admin+).

### E2 — Hierarquia de funções customizável

- RF-2.1 Árvore de funções por equipe: nome (≤ 60), descrição de responsabilidades (≤ 280),
  função-mãe, ordem entre irmãos. Profundidade máxima 5; máximo 40 funções.
- RF-2.2 **Seed padrão** criado com a equipe (e oferecido a equipes existentes com 1 clique):

  | Função                         | Descrição breve (seed)                                                      |
  | ------------------------------ | --------------------------------------------------------------------------- |
  | Capitão/Capitã                 | Representa a equipe, responde pelo projeto completo e pelas decisões finais |
  | Co-capitão/Co-capitã           | Apoia a capitania, coordena líderes de subsistema e substitui o capitão     |
  | Líder — Trem de Força          | Motor, CVT, transmissão e acoplamento; desempenho e confiabilidade          |
  | Líder — Estrutura e Design     | Chassi/gaiola, ergonomia, CAD e conformidade B6                             |
  | Líder — Financeiro e Marketing | Orçamento, patrocínios, viabilidade econômica e marca                       |
  | Líder — Suspensão e Direção    | Geometria, dinâmica veicular e dirigibilidade                               |
  | Líder — Eletrônica             | Aquisição de dados, telemetria, painel e chicote                            |
  | Líder — Freios                 | Sistema de freio, ensaios e conformidade de prova                           |
  | Membros                        | Executam as atividades do subsistema sob orientação do líder                |

  (Subsistemas espelham os 6 pedidos + capitania; alinhado ao organograma Poli/EESC.)

- RF-2.3 Capitão/co-capitães criam, renomeiam, movem e excluem funções. Excluir função com
  ocupantes exige reatribuição (ou os ocupantes ficam "sem função", nunca somem da equipe).
- RF-2.4 Cada membro tem **uma** função (v1). Atribuição por capitão/co-capitães.
- RF-2.5 Nós de capitania (`kind: captain|cocaptain`) são fixos na raiz: não podem ser
  excluídos nem movidos; renomear pode.

### E3 — Organograma dinâmico

- RF-3.1 Visualização em árvore (SVG/HTML próprio, sem dependência nova) na página da
  equipe: nó = função, com ocupantes (nome + avatar de iniciais) dentro do nó.
- RF-3.2 Dinâmico: reflete o estado atual sem reload (refetch após cada mutação); nós
  recolhíveis; pan/scroll horizontal quando exceder a largura.
- RF-3.3 Função sem ocupante aparece como **vaga** (destaque visual) — dá à capitania a
  visão de lacunas (prática de elite: todo subsistema tem dono).
- RF-3.4 Clique no ocupante abre o cartão do membro (função, status, papel, desde quando).
- RF-3.5 Acessível: navegável por teclado, textos reais (não só desenho), contraste ok.
- RF-3.6 Escala: 60 membros / 40 funções sem travar (medida: interação < 100 ms).

### E4 — Página completa de equipe

- RF-4.1 Novo `PageId 'team'` renderizado como página inteira (padrão `AdminPanel`/
  `AssistantPanel` + `page-body`/`page-inner`), substituindo o `TeamsPanel` modal.
- RF-4.2 Estrutura da página: lista de equipes → detalhe com abas/seções:
  **Visão geral** (nome, universidade, contagens), **Membros** (lista, status, função,
  ações), **Organograma** (E3), **Estrutura** (editor da árvore E2),
  **Entradas** (convites pendentes + solicitações E1).
- RF-4.3 O item "Equipes" do `AccountMenu` navega para a página (não abre modal). O aceite
  de convite (`inviteNotice`) também aterrissa na página.
- RF-4.4 Modal `TeamsPanel` é removido; `PanelId 'teams'` deixa de existir (login/perfil/
  projetos continuam modais).

### E5 — Requisitos derivados de `praticas-elite.md`

| ID     | Origem        | Requisito                                                                                                                                | Prioridade            |
| ------ | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| RF-5.1 | Prática 1     | Toda função exibe descrição de responsabilidades (RF-2.1/2.2)                                                                            | Must (v1)             |
| RF-5.2 | Prática 1     | Seed do organograma padrão de elite (RF-2.2)                                                                                             | Must (v1)             |
| RF-5.3 | Prática 3     | Ciclo de vida do membro: `trainee` → `efetivo` (status visível na lista e no organograma; promoção por capitania)                        | Must (v1)             |
| RF-5.4 | Prática 3     | Data de entrada + tempo de casa visíveis (base p/ avaliação de trainee)                                                                  | Should (v1)           |
| RF-5.5 | Prática 4     | Histórico de ocupação de função (quem liderou o quê, quando) — memória entre gerações                                                    | Could (v2)            |
| RF-5.6 | Prática 10    | Status `alumni` (ex-membro visível na memória da equipe, sem acesso)                                                                     | Could (v2)            |
| RF-5.7 | Práticas 1–10 | Painel "práticas de elite": checklist de maturidade da equipe (tem organograma completo? subsistemas sem líder? trainees sem avaliação?) | Could (v2+)           |
| RF-5.8 | Prática 2     | Gestão de tarefas/riscos                                                                                                                 | Won't (outra feature) |

## 5. Modelo de dados (proposta — migração `0004_team_org.sql`)

```sql
CREATE TABLE team_positions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     uuid NOT NULL REFERENCES teams (id) ON DELETE CASCADE,
  parent_id   uuid REFERENCES team_positions (id),
  kind        text NOT NULL DEFAULT 'custom'
              CHECK (kind IN ('captain', 'cocaptain', 'lead', 'custom')),
  name        text NOT NULL CHECK (char_length(name) <= 60),
  description text CHECK (char_length(description) <= 280),
  sort_order  integer NOT NULL DEFAULT 0
);

CREATE TABLE team_join_requests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id      uuid NOT NULL REFERENCES teams (id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES users (id),
  requested_at timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  UNIQUE (team_id, user_id)
);

ALTER TABLE team_members
  ADD COLUMN position_id uuid REFERENCES team_positions (id) ON DELETE SET NULL,
  ADD COLUMN status text NOT NULL DEFAULT 'efetivo'
    CHECK (status IN ('trainee', 'efetivo'));

-- Capitão único por equipe (owners legados N>1: índice criado só se backfill limpo;
-- senão, invariante fica na app até regularização — ver §7 P-1.4)
```

- RLS: `team_positions` segue o padrão `team_invites` (membro lê/escreve; RBAC fino na
  app). `team_join_requests`: membro da equipe lê; o próprio solicitante lê a sua;
  INSERT via função `SECURITY DEFINER` (o solicitante ainda não é membro — mesmo
  padrão do `accept_team_invite`).
- `accept_team_invite` muda: em vez de inserir em `team_members`, insere em
  `team_join_requests` (30 dias) e consome o convite. Nova função
  `approve_join_request` não é necessária — aprovação é feita por quem já é membro,
  passa nas policies normais de INSERT em `team_members`.
- Seed: função `seed_default_positions(team_id)` chamada no `POST /teams` e no botão
  "criar estrutura padrão".

## 6. API (módulo `teams`)

| Método/rota                                    | Ação                                            | Permissão                                                |
| ---------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------- |
| `GET    /teams/:id/positions`                  | árvore de funções                               | membro                                                   |
| `POST   /teams/:id/positions`                  | criar função                                    | `position.manage` (owner/admin)                          |
| `PATCH  /teams/:id/positions/:pid`             | renomear/mover/descrever                        | `position.manage`                                        |
| `DELETE /teams/:id/positions/:pid`             | excluir (reatribui ocupantes p/ null)           | `position.manage`                                        |
| `POST   /teams/:id/positions/seed`             | criar estrutura padrão (idempotente)            | `position.manage`                                        |
| `GET    /teams/:id/join-requests`              | fila de solicitações                            | `member.approve` (owner/admin)                           |
| `POST   /teams/:id/join-requests/:rid/approve` | aprova (body: `{status}`)                       | `member.approve`                                         |
| `DELETE /teams/:id/join-requests/:rid`         | recusa (ou o próprio desiste)                   | `member.approve` ou o próprio                            |
| `PATCH  /teams/:id/members/:uid`               | passa a aceitar `{role?, positionId?, status?}` | `member.role` p/ role; `member.assign` p/ posição/status |
| `POST   /teams/:id/transfer-captaincy`         | body `{toUserId}`; atômico                      | owner                                                    |

Policy layer ganha: `position.manage`, `member.approve`, `member.assign` (owner+admin).
`member.role` continua owner-only; passa a validar limites (1 owner / ≤2 admins).
Auditoria (padrão existente): `team.position.*`, `team.join.request/approve/reject`,
`team.captaincy.transfer`, `team.member.assign`.

Compat: `GET /teams/:id` passa a incluir `positionId`/`status` por membro e
`joinRequestCount`. Valores de `role` na API **não mudam** (`owner`/`admin`/`member`).

## 7. Pontos de falha e mitigação

| ID    | Ponto de falha                                                                         | Mitigação                                                                                                                       |
| ----- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| P-1.1 | Equipe acéfala: capitão sai/é rebaixado e ninguém confirma entradas                    | Guardas existentes de last-owner continuam; `transfer-captaincy` é o único caminho de saída do capitão em equipe com 2+ membros |
| P-1.2 | Corrida na promoção: 2 requisições simultâneas criam 3º co-capitão                     | Contagem + UPDATE na mesma transação com `SELECT … FOR UPDATE` nas linhas de `team_members` da equipe                           |
| P-1.3 | Convite aceito, solicitação esquecida → usuário no limbo                               | Badge de pendências na página; solicitação expira em 30 dias; solicitante vê o próprio estado ("aguardando confirmação")        |
| P-1.4 | Equipes legadas com N owners violam "capitão único"                                    | Invariante aplicado só a _novas_ escritas; migração não rebaixa ninguém; UI sinaliza "regularize a capitania"                   |
| P-2.1 | Ciclo na árvore de funções (mover nó para debaixo do próprio descendente)              | Validação de ancestralidade no PATCH; profundidade ≤ 5                                                                          |
| P-2.2 | Exclusão de função com ocupantes apaga vínculo silenciosamente                         | `ON DELETE SET NULL` + UI lista ocupantes afetados antes de confirmar                                                           |
| P-2.3 | Seed duplicado (POST repetido / clique duplo)                                          | Seed idempotente: no-op se a equipe já tem funções                                                                              |
| P-3.1 | Organograma ilegível com 50+ membros                                                   | Nós recolhíveis, ocupantes resumidos ("+4"), scroll horizontal; meta de performance RF-3.6                                      |
| P-3.2 | Dependência pesada de diagramação                                                      | Layout próprio (árvore = HTML/CSS/SVG); sem lib nova                                                                            |
| P-4.1 | Refresh perde a página (SPA sem router)                                                | Aceito como limitação atual (igual admin/assistente); documentado; deep-link fica p/ feature de router                          |
| P-4.2 | Remoção do modal quebra fluxo de convite (`inviteNotice` apontava p/ `panel: 'teams'`) | `acceptPendingInvite` passa a navegar `page: 'team'`; teste cobre o fluxo                                                       |
| P-5.1 | Escopo de "práticas de elite" infla a feature                                          | Tabela MoSCoW (§4 E5): v1 só Must/Should; Could vira backlog explícito                                                          |
| P-6.1 | RLS: solicitante (não-membro) precisa criar/ler a própria solicitação                  | Funções `SECURITY DEFINER` dedicadas, resposta uniforme (padrão C9 já usado no aceite)                                          |

## 8. Critérios de sucesso / aceite

**E1 — Capitania**

- [ ] Aceitar convite nunca cria membro direto; cria solicitação visível à capitania.
- [ ] Capitão e co-capitães (ambas as personas) conseguem aprovar e recusar; membro comum não.
- [ ] Impossível existir 2 capitães ou 3 co-capitães via API (testes de corrida incluídos).
- [ ] `transfer-captaincy` troca capitania sem janela de 0 capitães (teste transacional).
- [ ] Equipe legada multi-owner continua funcionando; nova promoção que viole limite → 409.

**E2 — Hierarquia**

- [ ] Equipe nova nasce com o organograma padrão (9 funções, descrições preenchidas).
- [ ] CRUD completo de funções com guardas (ciclo, profundidade, capitania fixa, limites).
- [ ] Toda função exibe descrição de responsabilidades; membro vê a sua no cartão.
- [ ] Equipe existente adota o seed com 1 clique, idempotente.

**E3 — Organograma**

- [ ] Árvore renderiza capitão > co-capitães > líderes > membros conforme dados reais.
- [ ] Mutação (aprovar membro, trocar função) reflete no organograma sem reload da página.
- [ ] Vagas destacadas; 60 membros/40 funções interativos (< 100 ms por interação).
- [ ] Navegável por teclado; texto real nos nós.

**E4 — Página**

- [ ] Gestão de equipe é página inteira (`page: 'team'`); modal de equipes não existe mais.
- [ ] Todas as capacidades antigas preservadas (convite, revogar, sair, transferir projeto).
- [ ] Fluxo de convite aterrissa na página com aviso correto.

**E5 — Elite**

- [ ] Status trainee/efetivo atribuível na aprovação e alterável depois; visível na lista
      e no organograma, com data de entrada/tempo de casa.
- [ ] Requisitos Could registrados como backlog (RF-5.5–5.7), não implementados em v1.

**Qualidade transversal**

- [ ] `teams.test.ts` e `rls.test.ts` estendidos cobrindo os novos caminhos (aprovação,
      limites de capitania, RLS de positions/join_requests).
- [ ] Toda mutação audita (padrão `audit()` existente).
- [ ] Migração 0004 com Down funcional.

## 9. Riscos e questões em aberto

1. Membro em 2 subsistemas (comum em equipe pequena) — v1 limita a 1 função; avaliar
   many-to-many na v2 junto com histórico (RF-5.5).
2. Nomenclatura de gênero na UI (capitão/capitã): usar forma dupla nos rótulos fixos e o
   nome da função editável para personalização.
3. `alumni` mexe em RLS (ex-membro sem acesso mas visível) — por isso ficou p/ v2.
4. Multi-owner legado: existe alguma equipe real com 2+ owners no ambiente atual? Verificar
   antes de decidir criar o índice único parcial já na 0004.

## 10. Plano de execução

### Fase A — Banco e policy (base de tudo)

1. Migração `0004_team_org.sql`: `team_positions`, `team_join_requests`, colunas em
   `team_members`, RLS, funções `SECURITY DEFINER` (`request_team_join` via aceite,
   `seed_default_positions`), alteração de `accept_team_invite`.
2. `policy.ts`: novas ações `position.manage`, `member.approve`, `member.assign`.
3. Testes: RLS das tabelas novas (`rls.test.ts`), invariantes de capitania em transação.
   **Gate:** migração sobe/desce limpa; testes verdes.

### Fase B — API

1. Rotas de positions (CRUD + seed) com validações de árvore (ciclo/profundidade/limites).
2. Rotas de join-requests (listar/aprovar/recusar) + mudança no aceite de convite.
3. `PATCH members/:uid` estendido (positionId/status) + limites de role; `transfer-captaincy`.
4. Auditoria em todas as mutações; `GET /teams/:id` enriquecido.
5. Testes de integração (`teams.test.ts`): fluxo convite→solicitação→aprovação; corridas de
   promoção; legado multi-owner.
   **Gate:** contrato estável documentado no spec; testes verdes.

### Fase C — Página de equipe (E4, sem organograma ainda)

1. `PageId 'team'` + navegação (`AccountMenu`, `acceptPendingInvite`, `SessionPanels`).
2. `TeamPage.tsx`: seções Visão geral / Membros / Estrutura / Entradas, portando tudo do
   `TeamsPanel` e somando solicitações, status, função, transferência de capitania.
3. Remover `TeamsPanel` modal e `PanelId 'teams'`.
   **Gate:** paridade funcional com o modal + novos fluxos operáveis ponta a ponta em dev.

### Fase D — Organograma (E3)

1. `OrgChart.tsx`: layout de árvore próprio (HTML/CSS/SVG), nós com ocupantes, vagas,
   recolher/expandir, cartão de membro.
2. Integração na página (aba Organograma) com refetch pós-mutação.
3. Verificação de performance (60 membros sintéticos) e teclado.
   **Gate:** critérios E3 todos atendidos.

### Fase E — Acabamento elite (E5) e polimento

1. Seed nas equipes existentes (botão), rótulos capitão/capitã na UI inteira, tempo de casa,
   badge de pendências.
2. Registrar backlog v2 (RF-5.5–5.7, multi-função, alumni, router/deep-link).
3. Passada final: critérios do §8 completos, `prettier`/lint, atualizar `spec.md`/
   `draft-features.md` com o DF-10.

Ordem A→B→C→D→E com gates; C pode começar em paralelo ao fim de B (mock de contrato).

## 11. Estado da implementação — 26/08/2026

Fases A–E implementadas. Suíte da API: **134 testes verdes** (eram 96 antes da feature).

- **Banco** (`migrations/0004_team_org.sql`): `team_positions` (árvore + índice único de
  capitania), `team_join_requests`, colunas `team_members.position_id` e `.status`, funções
  `team_join_request_profiles` / `my_join_requests` / `seed_default_positions`,
  `accept_team_invite` reescrita para gerar solicitação, RLS das tabelas novas. Down testado.
- **API**: `policy.ts` com `position.manage` / `member.approve` / `member.assign`;
  `modules/teams/{shared,routes,positions}.ts` com as rotas de funções, solicitações e
  transferência de capitania; auditoria em toda mutação; export LGPD ampliado.
- **Web**: `TeamPage.tsx` (página inteira, 5 abas), `OrgChart.tsx` (árvore própria, sem lib),
  estilos `org-*`/`team-*`, `PageId 'team'`; `TeamsPanel.tsx` removido.
- **Contrato**: `contracts/team.odcs.yaml` 1.1.0 (validador ODCS passa).

### Decisões tomadas durante a implementação

1. **A capitania no organograma vem do papel de acesso, não de atribuição.** O rascunho
   previa sincronizar `position_id` com o papel; na prática isso apagava em silêncio a
   função de quem era promovido (líder de Freios virava co-capitão e perdia Freios). Agora
   os nós `captain`/`cocaptain` mostram quem tem `role` owner/admin, e `position_id` fica
   livre para a função de subsistema — uma co-capitã pode liderar Freios e aparecer nos dois.
2. **Sem índice único de capitão** (P-1.4 mantido): 1 owner / ≤ 2 admins é invariante de
   app, aplicado com a linha da equipe travada; a migração não rebaixa equipe legada e a
   tela oferece o caminho de regularização.
3. **`lockTeam` serializa toda mutação de equipe** (trava a linha em `teams`). Travar só
   `team_members` deixava a saída da equipe passar por fora e apagar o capitão que uma
   transferência concorrente acabara de promover — a equipe ficava sem capitania, sem volta.
4. **Confirmar entrada usa `DELETE … RETURNING`**: sob RLS, `SELECT … FOR UPDATE` exige
   policy de UPDATE, que `team_join_requests` não tem de propósito.
5. **Toda validação antes de qualquer escrita**: retorno de erro dentro de `withUser` faz
   COMMIT (só exceção causa ROLLBACK), então validar no meio gravava mutação e respondia 4xx.
6. **Seed de 14 nós** (não 9): cada subsistema ganha o próprio nó "Membros" — com um nó
   único, o organograma não diria de qual subsistema a pessoa é.
7. **Promover a capitão por `PATCH` é 409**: a troca é só por `transfer-captaincy`.
8. **`GET /teams` é "minhas equipes"**, inclusive para admin do portal (que enxerga todas
   pela RLS do DF-9) — a visão de operação continua sendo `/admin/teams`.
9. **Sair sendo a última pessoa expurga convites e solicitações** da equipe: sem isso, quem
   abrisse o link depois ficaria esperando por uma capitania que não existe mais.
10. **Rótulos capitão/co-capitão vivem na UI e nas mensagens de erro**; os valores da API
    continuam `owner`/`admin`/`member` (compatibilidade com RLS, policy e testes).

### Verificações feitas

- Migração `up` → seed → `down` → `up` num Postgres efêmero.
- Testes cobrindo: convite → solicitação → confirmação; limites de capitania com requisições
  concorrentes; saída da equipe concorrente à transferência; CRUD e guardas da árvore
  (ciclo, profundidade, limite, capitania fixa); RLS das tabelas novas; equipe legada com
  dois capitães; expurgo ao esvaziar a equipe; helpers de árvore em teste unitário.
- Validação visual no navegador (ambiente dev, equipe com 9 pessoas e 14 funções): lista de
  equipes, visão geral com as lacunas de elite, membros, organograma e fila de entradas.

### Backlog registrado (fora desta entrega)

- RF-5.5 histórico de ocupação de função, RF-5.6 alumni, RF-5.7 painel de maturidade
  completo (a Visão geral já traz a primeira leitura de lacunas).
- Reordenar funções irmãs (`sortOrder`): existe na API, sem controle na tela.
- Mais de uma função por pessoa; router e deep-link (P-4.1).
- `rls.test.ts` segue cobrindo só projetos — a RLS nova é exercitada em `team-org.test.ts`.
