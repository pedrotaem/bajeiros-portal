# DF-14 — Conhecimento da equipe: diário de decisões, guias e kits de passagem

> Rascunho de feature (2026-08-29). Deriva do canvas
> ["Bajeiros — Experiência de Evolução"](https://claude.ai/code/artifact/0a10a019-dfc6-46bb-9b28-3f7ca7cf6f8b)
> (tela "Equipe · Conhecimento"). Ataca diretamente o problema nº 1 mapeado na pesquisa de mercado:
> **rotatividade** — "não tinha uma base… tem que começar o projeto todo do zero" (MountainBaja,
> em `Pesquisa de Mercado/dificuldades-por-tier.md` §1.3/1.4; 12 de 22 membros saíram em 18 meses).
> Elite documenta e não publica o processo (praticas-elite.md, Prática 4) — o portal transforma a
> prática em caminho padrão.

- **Dependências:** DF-10 (página de equipe, papéis, trainee — implementado). Alimenta o DF-13
  (área `conhecimento` é toda computada daqui) e o DF-16 (atividade e passos no Início).
- **Relação com DF-10 v2:** kits de passagem antecipam parte do valor de RF-5.5 (histórico de
  ocupação) e RF-5.6 (alumni) sem mexer em RLS de ex-membro — o kit congela o conhecimento antes
  da saída, enquanto a pessoa ainda é membro.

## 1. Contexto e motivação

O ciclo geracional de 2–3 anos não muda; o que muda entre uma equipe iniciante e uma campeã é o
custo do esquecimento. Hoje o portal não tem lugar para registrar **por que** uma escolha foi
feita (a decisão morre no WhatsApp), **como** a equipe faz as coisas (o guia mora na cabeça de uma
pessoa) e **o que sai pela porta** quando alguém se forma. Três objetos, um princípio: o que se
aprende, fica.

## 2. Objetivos

| #   | Objetivo                                                                                   |
| --- | ------------------------------------------------------------------------------------------ |
| O1  | Diário de decisões: registro numerado, com "por quê", área e links — barato de escrever    |
| O2  | Guias da equipe: procedimentos vivos com dono, incluindo a trilha de integração de novatos |
| O3  | Kits de passagem: checklist estruturado para cada saída anunciada                          |
| O4  | Busca única sobre decisões e guias (e regras B6, via índice existente do checklist)        |
| O5  | Tudo vira evidência para a área Conhecimento & continuidade do DF-13                       |

### Não-objetivos

- Wiki livre com páginas arbitrárias e hierarquia — guia é um documento simples com dono.
- Upload de arquivos — v1 referencia por link (Drive/repositório da equipe); armazenar binário é
  decisão de custo/LGPD separada.
- Histórico de versões de decisão/guia — v1 guarda só o estado atual (+ `updated_at`); risco
  registrado em §8.
- Comentários/threads — o fórum da comunidade (futuro) cobre conversa; aqui é registro.

## 3. Conceito

### 3.1 Decisão ≠ guia ≠ kit

- **Decisão** — um fato datado: "escolhemos X e não Y, porque Z". Imutável na essência (editável
  pelo autor para corrigir texto; substituível por decisão nova via `substitui nº N`), numerada
  por equipe (`nº 96`) para virar vocabulário interno.
- **Guia** — um procedimento vivo: "como fazemos X". Tem **dono** (responsável por manter),
  `kind` (`guia` | `trilha` | `checklist`) e envelhece — guia sem atualização há 6 meses aparece
  como "verificar" e derruba CON-4.2.
- **Kit de passagem** — um checklist por pessoa que sai: cargo e responsabilidades, decisões e
  guias da área, pendências, contatos/fornecedores. Concluído = evidência `kit.completed`.
  **Nunca** armazenar credenciais/senhas no kit (aviso fixo na UI).

### 3.2 Registrar precisa ser barato

O formulário de decisão tem 4 campos (título, área, por quê, links) e nasce pré-preenchido quando
vem de contexto: "registrar decisão" a partir do editor preenche o link do projeto/versão; a
partir de um item do checklist B6, o link da regra. Fricção é o inimigo — o concorrente é o
WhatsApp.

## 4. Requisitos funcionais

### E1 — Diário de decisões

- RF-1.1 Criar: qualquer membro. Campos: título (≤ 120), área (`estrutura|dinamica|documentacao|
fabricacao|gestao|conhecimento|geral`), por quê (≤ 2 000), links (≤ 8: `project|snapshot|rule|
guide|decision|url`). Número sequencial por equipe atribuído na criação.
- RF-1.2 Editar: só o autor (corrigir texto); `updated_at` visível ("editada em…"). Excluir: só
  capitania (soft delete, auditado) — o diário é memória, não mural.
- RF-1.3 Substituição: decisão pode marcar `substitui nº N`; a antiga exibe "substituída pela
  nº M" e sai das listagens padrão (filtro "incluir substituídas").
- RF-1.4 Listagem: cronológica inversa, filtro por área e por autor, paginada.
- RF-1.5 Atalhos de contexto: botão "registrar decisão" na tela Conhecimento (primário) e ação
  secundária no editor (item de checklist e painel do projeto) com links pré-preenchidos.
- RF-1.6 Evidência: `decision.created {area}` (DF-13 CON-1.1, CON-2.1, CON-3.2).

### E2 — Guias da equipe

- RF-2.1 Criar/editar: qualquer membro; **dono** obrigatório (default: quem criou; capitania
  reatribui). Campos: título (≤ 120), `kind`, corpo em markdown restrito (≤ 20 000) renderizado
  pelo mini-renderer existente do assistente (sem `dangerouslySetInnerHTML`), links (≤ 8).
- RF-2.2 Envelhecimento: `updated_at` > 6 meses ⇒ chip VERIFICAR na listagem (ícone + texto,
  CT-3); "revisei, está válido" atualiza a data sem editar o corpo.
- RF-2.3 Trilha de integração (`kind: trilha`, máx. 1 ativa por equipe): lista de etapas
  (markdown com checkboxes); membro marca a própria conclusão (`guide_completions`) — evidência
  `trail.completed` (DF-13 CON-3.1). Trainee vê a trilha com destaque no Início.
- RF-2.4 Excluir: capitania (soft delete, auditado). Guia referenciado por kit aberto não pode
  ser excluído (409 com explicação).
- RF-2.5 Evidência: `guide.published {kind}` na criação; recomputação do DF-13 na edição de dono
  ou data (CON-2.2, CON-4.2, FAB-3.1 — guia com tag `solda`).

### E3 — Kits de passagem

- RF-3.1 Abrir kit: capitania ou o próprio membro que sai. Campos: membro, cargo (snapshot do
  organograma no momento), data prevista de saída, checklist.
- RF-3.2 Checklist padrão (template no código, editável por kit): ① responsabilidades do cargo
  descritas; ② decisões da área revisadas/vinculadas; ③ guias da área atualizados; ④ pendências
  listadas com dono novo; ⑤ contatos e fornecedores registrados; ⑥ sucessor indicado (opcional).
- RF-3.3 Estados: `aberto → em andamento → concluído` (percentual = itens marcados). Concluir
  exige todos os itens marcados; gera evidência `kit.completed` (DF-13 CON-4.1).
- RF-3.4 O painel de kits mostra saídas anunciadas sem kit (cruzando formaturas informadas) com
  chip VERIFICAR — é o gatilho visual do canvas ("3 membros se formam em dezembro").
- RF-3.5 Kit é da equipe: a saída efetiva do membro não apaga o kit.

### E4 — Busca

- RF-4.1 Campo único na tela Conhecimento (e no rail, quando o shell DF-12 ligar): busca por
  título/corpo de decisões e guias da equipe (ILIKE + `pg_trgm` se necessário; v1 sem FTS
  completo) e por ID/título de regra B6 (índice do checklist já existente, client-side).
- RF-4.2 Resultado agrupado por tipo (Decisões · Guias · Regras B6), ≤ 10 por grupo.

### E5 — Tela Equipe · Conhecimento

- RF-5.1 Conforme o canvas: barra de ações (busca + contadores + "Registrar decisão" primário),
  diário à esquerda com filtros por área, coluna direita com Guias e Kits.
- RF-5.2 Contadores honestos ("96 decisões · 12 guias · nenhum kit iniciado") — nunca métrica
  inventada.
- RF-5.3 Estado vazio com ação (C-16): "registre a primeira decisão da equipe" com o formulário a
  um clique — nunca tela em branco.

## 5. Modelo de dados (proposta — migração `0006_knowledge.sql`)

```sql
CREATE TABLE team_decisions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id       uuid NOT NULL REFERENCES teams (id) ON DELETE CASCADE,
  seq           integer NOT NULL,                    -- por equipe; UNIQUE (team_id, seq)
  title         text NOT NULL CHECK (char_length(title) <= 120),
  area          text NOT NULL,
  why           text NOT NULL CHECK (char_length(why) <= 2000),
  links         jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{kind, ref, label}] ≤ 8
  supersedes_id uuid REFERENCES team_decisions (id),
  author_id     uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz,
  deleted_at    timestamptz,
  UNIQUE (team_id, seq)
);

CREATE TABLE team_guides (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id    uuid NOT NULL REFERENCES teams (id) ON DELETE CASCADE,
  kind       text NOT NULL DEFAULT 'guia' CHECK (kind IN ('guia', 'trilha', 'checklist')),
  title      text NOT NULL CHECK (char_length(title) <= 120),
  body_md    text NOT NULL CHECK (char_length(body_md) <= 20000),
  tags       jsonb NOT NULL DEFAULT '[]'::jsonb,
  owner_id   uuid REFERENCES users (id) ON DELETE SET NULL,
  author_id  uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE guide_completions (
  guide_id     uuid NOT NULL REFERENCES team_guides (id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  completed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (guide_id, user_id)
);

CREATE TABLE team_handover_kits (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id        uuid NOT NULL REFERENCES teams (id) ON DELETE CASCADE,
  member_id      uuid REFERENCES users (id) ON DELETE SET NULL,
  member_name    text NOT NULL,          -- snapshot (sobrevive à saída/exclusão)
  position_label text,
  due_date       date,
  checklist      jsonb NOT NULL,         -- [{id, label, done, note?}]
  status         text NOT NULL DEFAULT 'aberto'
                 CHECK (status IN ('aberto', 'em_andamento', 'concluido')),
  created_by     uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  completed_at   timestamptz
);
```

- **Caps anti-abuso** (validação de app): 2 000 decisões, 200 guias, 50 kits por equipe.
- **RLS:** team-scoped padrão; soft delete filtrado nas policies de SELECT.
- **`seq` por equipe:** atribuído com a linha da equipe travada (`lockTeam` já existe no módulo
  teams — reusar o padrão) para não duplicar número sob concorrência.
- **Contratos ODCS:** `team-decision.odcs.yaml`, `team-guide.odcs.yaml`,
  `team-handover-kit.odcs.yaml`. PII: autor/dono/membro — base **execução de contrato**;
  retenção: vida da equipe; conteúdo é **da equipe** — exclusão de conta anonimiza a autoria
  ("ex-membro", `SET NULL` + `member_name` congelado no kit), o texto permanece. Registrar essa
  regra na política de privacidade (§7).

## 6. API (módulo novo `knowledge`)

| Método/rota                                    | Ação                                 | Permissão                           |
| ---------------------------------------------- | ------------------------------------ | ----------------------------------- |
| `GET    /teams/:id/decisions?area=&author=&q=` | listar/buscar (paginado)             | membro                              |
| `POST   /teams/:id/decisions`                  | criar (seq atômico)                  | membro                              |
| `PATCH  /teams/:id/decisions/:did`             | editar texto/links                   | autor                               |
| `DELETE /teams/:id/decisions/:did`             | soft delete                          | `knowledge.moderate` (owner/admin)  |
| `GET    /teams/:id/guides` · `POST` · `PATCH`  | CRUD de guias (dono/corpo/kind/tags) | membro; reatribuir dono = capitania |
| `POST   /teams/:id/guides/:gid/complete`       | concluir trilha (o próprio)          | membro                              |
| `POST   /teams/:id/guides/:gid/still-valid`    | "revisei, está válido"               | dono ou capitania                   |
| `GET    /teams/:id/kits` · `POST` · `PATCH`    | kits (checklist, status)             | capitania ou o membro do kit        |
| `GET    /teams/:id/knowledge/search?q=`        | busca agrupada decisões+guias        | membro                              |

Policy layer ganha `knowledge.moderate` (owner/admin). Toda mutação audita
(`knowledge.decision.*`, `knowledge.guide.*`, `knowledge.kit.*`). Evidências do DF-13 gravadas na
mesma transação da mutação.

## 7. LGPD

- **Titularidade:** decisões/guias/kits são registro da equipe com autoria pessoal. Export LGPD
  do titular inclui suas decisões, guias (autor/dono), conclusões de trilha e kits.
- **Exclusão de conta:** autoria anonimizada (`SET NULL`; UI mostra "ex-membro"); texto permanece
  com a equipe (base: execução do contrato com a equipe; regra declarada na política de
  privacidade e no aviso da tela na primeira publicação). **Questão aberta §8.3** — validar a
  base legal na revisão jurídica antes do GA.
- **Minimização:** kits proíbem credenciais (aviso fixo); links externos são URL, nunca conteúdo
  espelhado.

## 8. Riscos e questões em aberto

1. **Adoção fria** — diário vazio não vira hábito sozinho. Mitigação: atalhos de contexto
   (RF-1.5), estado vazio com ação, trilha de novato que já nasce apontando para o diário, e o
   DF-13 tornando o registro visível como evolução (CON-\*).
2. **Sem histórico de versões** — edição de guia perde o texto anterior. Aceito na v1; se o
   piloto sentir falta, v2 adiciona tabela de revisões (append-only).
3. **Base legal da permanência pós-exclusão** — "conteúdo é da equipe" precisa de validação
   jurídica (contrato × legítimo interesse) antes do GA. Alternativa conservadora: excluir
   conteúdo autoral junto com a conta mediante aviso — destruiria o propósito anti-rotatividade;
   por isso a validação vem antes.
4. **Markdown restrito** — o mini-renderer do assistente cobre negrito/títulos/listas; guias
   podem pedir tabelas e imagens. v1 sem imagem (link externo); reavaliar com uso real.
5. **Busca simples** — ILIKE não acha "amortecedor" por "Fox". Aceito na v1; FTS/pg_trgm quando
   houver volume real.

## 9. Critérios de aceite

| #          | Critério                                                                                       |
| ---------- | ---------------------------------------------------------------------------------------------- |
| AC-DF14.1  | Membro cria decisão com links; numeração sequencial por equipe sem furo sob concorrência       |
| AC-DF14.2  | Autor edita a própria decisão; outro membro recebe 403; capitania exclui (soft) com auditoria  |
| AC-DF14.3  | Decisão substituída sai da listagem padrão e referencia a substituta                           |
| AC-DF14.4  | Guia sem atualização > 6 meses exibe VERIFICAR; "revisei" limpa sem editar corpo               |
| AC-DF14.5  | Trilha concluída pelo novato gera `trail.completed` e satisfaz CON-3.1 no DF-13                |
| AC-DF14.6  | Kit concluído exige checklist completo e gera `kit.completed`; kit sobrevive à saída do membro |
| AC-DF14.7  | Busca retorna decisões + guias agrupados; regra B6 aparece via índice do checklist             |
| AC-DF14.8  | Export LGPD inclui conteúdo autoral do titular; exclusão de conta anonimiza autoria            |
| AC-DF14.9  | RLS: nada de outra equipe é legível/gravável (teste dedicado)                                  |
| AC-DF14.10 | Caps de volume aplicados com erro claro (409/422), nunca silêncio                              |
