# DF-15 — Comunidade: resultados de competições, benchmark e equipes do Brasil

> Rascunho de feature (2026-08-29). Deriva do canvas
> ["Bajeiros — Experiência de Evolução"](https://claude.ai/code/artifact/0a10a019-dfc6-46bb-9b28-3f7ca7cf6f8b)
> (tela "Comunidade · Resultados"). O acervo já existe:
> `Pesquisa de Mercado/resultados-competicoes.json` (18 competições 2021–2026, pontuação por
> prova, fonte pública, nada estimado) e `equipes-brasil.json` (91 equipes, região e faixa de
> desempenho). Oportunidade registrada na pesquisa: **não existe estatística consolidada de
> competição no Brasil** — o portal vira a referência e, com isso, dá contexto à evolução
> (DF-13).

- **Dependências:** DF-12 (destino Comunidade), DF-13 (metas → fila; coorte p/ benchmark de
  maturidade). Admin (DF-9) ganha a superfície de correção de dados.
- **Restrição de marca (spec.md §1):** nenhum uso da identidade "SAE". Competições são
  nomeadas "Nacional AAAA" / "Regional <região> AAAA"; a fonte é citada como "resultados
  públicos das competições".

## 1. Contexto e motivação

Uma equipe Tier 2 não sabe, hoje, se seu enduro foi ruim ou típico — os resultados existem
espalhados, sem série histórica nem mediana por faixa. O DF-15 publica o acervo como leitura
estruturada e o transforma em **contexto acionável**: "seu enduro está abaixo da mediana da sua
faixa" vira meta de temporada com um clique (fila do DF-13, `origin: meta`).

## 2. Objetivos

| #   | Objetivo                                                                                     |
| --- | -------------------------------------------------------------------------------------------- |
| O1  | Publicar o acervo de resultados (2021–2026 + temporadas futuras) com classificação por prova |
| O2  | Registro canônico das equipes do Brasil com perfil e vínculo ("claim") à equipe do portal    |
| O3  | Benchmark por prova contra a mediana da coorte de desempenho; "transformar em meta"          |
| O4  | Calendário de competições (datas) que alimenta a faixa de temporada do DF-13                 |
| O5  | Dados corrigíveis com trilha de fonte — credibilidade acima de tudo                          |

### Não-objetivos

- Galeria e fórum (abas "em breve", desabilitadas — tokens `--bj-disabled-fg`).
- Scraping automático contínuo — ingestão é por script assistido + curadoria admin, por
  temporada.
- Página pública sem login na v1 (§8.2).
- Qualquer dado pessoal de pilotos/membros — a ingestão descarta campos de pessoa física.

## 3. Conceito

### 3.1 Vocabulário de coortes (resolvendo a ambiguidade da pesquisa)

Os dois documentos da pesquisa usam "Tier" em direções opostas (`equipes-brasil`: Tier 1 = topo;
`dificuldades-por-tier`: Tier 1 = iniciante). O produto **não usa números**: as coortes chamam-se
**iniciante · intermediária · alta performance** (a síntese comparativa da própria pesquisa).
Regra de cálculo v1: média da pontuação total normalizada (pontos/pontos do campeão) das últimas
3 participações da equipe; tercis definem as coortes, recalculadas por temporada.

**Visibilidade:** a coorte é mostrada **só para a própria equipe** (chip no contexto e linha de
benchmark). Perfis públicos e tabelas nunca rotulam a coorte de terceiros — o objetivo é
benchmark, não constrangimento. (Questão aberta §8.1.)

### 3.2 Confiança e correção

Todo número exibe a temporada da fonte; o rodapé cita "compilado de resultados públicos — achou
um erro? Solicite correção". Correção: equipe (ou qualquer logado) abre solicitação com link da
fonte; admin aplica com registro (`audit_events`). O portal nunca edita silenciosamente.

## 4. Requisitos funcionais

### E1 — Calendário e resultados

- RF-1.1 `competitions`: temporada, tipo (`nacional | regional`), região, nome de exibição sem
  marca ("Nacional 2026"), datas, local, URL da fonte. Semeado pelo script de ingestão; CRUD
  admin (aba nova no DF-9).
- RF-1.2 `competition_results`: posição, pontuação total e por prova (`points jsonb` — o rol de
  provas varia por edição; o schema não engessa), referência à equipe canônica, fonte.
- RF-1.3 Ingestão: `scripts/ingest-results.mjs` lê os JSONs do acervo da pesquisa e emite SQL/
  chamadas idempotentes (chave: competição + equipe). Roda manualmente por temporada; o script
  **descarta qualquer campo de pessoa física** se existir na origem.
- RF-1.4 Tela Resultados (canvas): seletor de competição, tabela C-12 (thead sticky, numéricos em
  mono à direita), linha da própria equipe destacada (régua ocre + chip neutro "VOCÊ"), faixa
  "campeãs nacionais" por ano.

### E2 — Equipes do Brasil e vínculo

- RF-2.1 `community_teams` (registro canônico, semeado com as 91): nome, instituição, cidade/UF,
  região, links públicos. Perfil lista participações e resultados históricos.
- RF-2.2 Claim: capitania solicita vínculo `community_team ↔ team` do portal; admin aprova
  (v1 manual — volume baixo). Vínculo dá o "VOCÊ" na tabela, o bloco "sua equipe no contexto" e
  habilita a coorte.
- RF-2.3 Um vínculo por lado (1:1); desfazer é admin. Disputa de claim (duas equipes pedem a
  mesma) resolve-se por evidência (e-mail institucional, site da equipe) — processo documentado
  no runbook.
- RF-2.4 Equipe sem vínculo vê a tabela normalmente, com convite discreto para vincular.

### E3 — Benchmark e metas

- RF-3.1 Bloco "sua equipe no contexto": posição na competição selecionada, delta vs. temporada
  anterior (ícone + texto, nunca só cor), barras por prova com marcador de mediana da coorte
  (legenda obrigatória — sua equipe · mediana).
- RF-3.2 Mediana por prova computada da coorte na competição selecionada; com < 8 equipes na
  coorte, o marcador não aparece (mesmo piso do DF-13 RF-7.2).
- RF-3.3 "Transformar em meta da temporada": cria passo na fila do DF-13 (`origin: meta`, título
  pré-preenchido "Recuperar a mediana de <prova> — <competição>"), com link de volta ao
  benchmark. Permissão: `step.manage`.
- RF-3.4 Leitura editorial mínima e honesta (ex.: "o enduro é onde a coorte intermediária mais
  perde pontos") só quando derivada do próprio acervo — nada inventado.

### E4 — Integração com a temporada (DF-13)

- RF-4.1 `team_season.competition_ids` referencia competições do calendário; a faixa de
  temporada deriva "próxima competição" e datas daqui.
- RF-4.2 Resultado novo ingerido para a equipe vinculada gera evidência
  `competition.result {position, total}` na atividade (produtor `community`, registrado no
  DF-13 RF-2.1; não afeta nível — maturidade ≠ resultado;
  ADR-010).

## 5. Modelo de dados (proposta — migração `0007_community.sql`)

```sql
CREATE TABLE competitions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season     integer NOT NULL,
  kind       text NOT NULL CHECK (kind IN ('nacional', 'regional')),
  region     text,
  name       text NOT NULL,             -- "Nacional 2026" (sem marca)
  starts_on  date,
  ends_on    date,
  location   text,
  source_url text,
  UNIQUE NULLS NOT DISTINCT (season, kind, region)  -- region NULL p/ nacional; PG ≥ 15 (Aurora 16 ok)
);

CREATE TABLE community_teams (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name      text NOT NULL,
  university        text,
  city              text,
  uf                text,
  region            text,
  links             jsonb NOT NULL DEFAULT '[]'::jsonb,
  claimed_by_team_id uuid UNIQUE REFERENCES teams (id) ON DELETE SET NULL,
  UNIQUE NULLS NOT DISTINCT (display_name, university)
);

CREATE TABLE competition_results (
  competition_id    uuid NOT NULL REFERENCES competitions (id) ON DELETE CASCADE,
  community_team_id uuid NOT NULL REFERENCES community_teams (id) ON DELETE CASCADE,
  position          integer,
  points_total      numeric,
  points            jsonb NOT NULL DEFAULT '{}'::jsonb,  -- {prova: pontos}
  source_url        text,
  ingested_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (competition_id, community_team_id)
);

CREATE TABLE result_corrections (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by uuid REFERENCES users (id) ON DELETE SET NULL,
  target       jsonb NOT NULL,   -- {competitionId, communityTeamId, field}
  proposal     text NOT NULL CHECK (char_length(proposal) <= 1000),
  source_url   text,
  status       text NOT NULL DEFAULT 'aberta'
               CHECK (status IN ('aberta', 'aplicada', 'recusada')),
  resolved_by  uuid REFERENCES users (id) ON DELETE SET NULL,
  resolved_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
```

- **RLS:** `competitions`, `community_teams`, `competition_results` são leitura para qualquer
  usuário autenticado (dados públicos); escrita só admin/ingestão. `result_corrections`: autor lê
  as suas; admin lê todas.
- **Coorte:** view/consulta derivada (sem tabela própria na v1); cache de medianas junto ao
  benchmark do DF-13.
- **Contratos ODCS:** `competition.odcs.yaml`, `community-team.odcs.yaml`,
  `competition-result.odcs.yaml`, `result-correction.odcs.yaml`. PII: `requested_by` e `resolved_by` das
  correções (contrato; retenção 12 meses após resolução). Dados de equipes são de entes
  coletivos, sem pessoa física — **invariante da ingestão** (AC-DF15.8).

## 6. API (módulo novo `community`)

| Método/rota                                | Ação                                        | Permissão             |
| ------------------------------------------ | ------------------------------------------- | --------------------- |
| `GET  /community/competitions?season=`     | calendário                                  | autenticado           |
| `GET  /community/competitions/:id/results` | classificação (+ posição da própria equipe) | autenticado           |
| `GET  /community/teams?q=&region=`         | registro canônico                           | autenticado           |
| `GET  /community/teams/:id`                | perfil + histórico                          | autenticado           |
| `POST /community/claims`                   | solicitar vínculo (capitania)               | owner/admin da equipe |
| `POST /community/corrections`              | solicitar correção                          | autenticado           |
| `GET  /community/benchmark?competitionId=` | medianas por prova da coorte da equipe      | membro c/ vínculo     |
| `POST /admin/community/*`                  | CRUD calendário/resultados/claims/correções | admin (DF-9)          |

Auditoria: `community.claim.*`, `community.correction.*`, `admin.community.*`.

## 7. Pontos de falha e mitigação

| ID    | Ponto de falha                                                        | Mitigação                                                                                           |
| ----- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| P-1.1 | Dado errado publicado corrói a credibilidade (o ativo central)        | Fonte por linha, correção com trilha, admin único aplicador, nada editado em silêncio               |
| P-1.2 | Claim indevido dá "VOCÊ" a impostor                                   | Aprovação manual admin com evidência; desfazer auditado; volume esperado baixo                      |
| P-1.3 | Provas mudam de nome/estrutura entre edições                          | `points jsonb` por prova + rol de provas por competição; nunca schema fixo por prova                |
| P-1.4 | Rotular coorte publicamente constrange (risco reputacional do portal) | Coorte privada à própria equipe (§3.1); revisão explícita antes de qualquer mudança                 |
| P-1.5 | Uso da marca/nome da organização                                      | Nomes genéricos por tipo+ano; fonte citada como "resultados públicos"; revisar textos no gate legal |
| P-1.6 | Ingestão duplica ou diverge do acervo                                 | Idempotência por chave natural; dry-run com diff antes de aplicar; contagens conferidas com o JSON  |

## 8. Riscos e questões em aberto

1. **Coorte pública?** v1: não (só a própria equipe). Reavaliar com as equipes piloto — pode
   haver demanda por "faixa" pública como orgulho (iniciante que sobe). Só com opt-in.
2. **Página pública (sem login)** — SEO e aquisição sugerem abrir Resultados; LGPD é tranquilo
   (sem PII), mas expõe a leitura editorial. v1 logado; decidir no gate de marketing.
3. **Nome das provas em pt-BR** — normalizar ("Enduro", "Dinâmicas", "Projeto") a partir do
   acervo; manter o nome original da fonte no payload para auditoria.
4. **Histórico pré-2021** — fora do acervo atual; aceitar contribuições da comunidade via fluxo
   de correção (com fonte) quando o fórum existir.

## 9. Critérios de aceite

| #         | Critério                                                                                        |
| --------- | ----------------------------------------------------------------------------------------------- |
| AC-DF15.1 | Ingestão dos JSONs do acervo popula 18 competições/91 equipes; rodar 2× não duplica nada        |
| AC-DF15.2 | Tabela de resultados confere com o acervo (amostra por competição); numéricos em mono à direita |
| AC-DF15.3 | Claim aprovado destaca a linha da equipe e habilita "sua equipe no contexto" e a coorte         |
| AC-DF15.4 | Benchmark mostra mediana só com coorte ≥ 8; barras com legenda; delta com ícone + texto         |
| AC-DF15.5 | "Transformar em meta" cria passo `origin: meta` na fila do DF-13 com link de volta              |
| AC-DF15.6 | Solicitação de correção → admin aplica → valor muda com `audit_events` e fonte registrada       |
| AC-DF15.7 | Nenhuma tela usa a identidade da organização; nomes "Nacional/Regional AAAA"                    |
| AC-DF15.8 | Teste da ingestão: payload com campo de pessoa física é descartado (fixture)                    |
| AC-DF15.9 | Faixa de temporada do DF-13 mostra a próxima competição vinda do calendário                     |
