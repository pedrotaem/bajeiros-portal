# Plano de implementação — evolução das equipes (DF-12…DF-16)

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
"fase N"), com dois pontos de amarração declarados abaixo. Numeração deste plano: **EV-0…EV-8**,
uma fase = um PR mergeável.
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

## Estado da execução (2026-08-30)

**EV-0 a EV-8 implementadas**, em commits separados por fase, sobre a fase 0 do plano de
design (que entrou junto por ser pré-requisito duro de toda UI nova). O que a tabela
abaixo descreve está no código; o que falta é a parte que não é código:

| Fase | Estado | Onde                                                                      |
| ---- | ------ | ------------------------------------------------------------------------- |
| EV-0 | ✅     | `packages/evolution` — catálogo v1.0.0, `computeLevels()`, 44 testes      |
| EV-1 | ✅     | migração `0005`, módulo `evolution`, produtores em `projects` e `teams`   |
| EV-2 | ✅     | migração `0006`, módulo `knowledge`, `knowledge.summary`                  |
| EV-3 | ✅     | `Shell.tsx` + rail + hub + "Sobre" + equipe com 4 abas                    |
| EV-4 | ✅     | `EvolutionTab.tsx`                                                        |
| EV-5 | ✅     | `KnowledgeTab.tsx`                                                        |
| EV-6 | ✅     | `GET /me/home` + `HomePage.tsx`                                           |
| EV-7 | ✅     | migração `0007`, módulo `community`, ingestão em dry-run, `CommunityPage` |
| EV-8 | ✅     | benchmark por prova com piso de coorte e "transformar em meta"            |

**Pendências que continuam abertas** (nenhuma é implementação):

1. **Gate de piloto** com 2–3 equipes reais por ≥ 3 semanas — o catálogo v1 só congela
   depois dele. É o mitigador do risco nº 1 da feature (P-1.1, calibração de gabinete).
2. **ADR-010 em `proposto`** — a revisão do product owner o promove a `aceito`.
3. **Recálculo diário**: o corpo existe (`POST /admin/evolution/recompute`); falta o
   gatilho de infraestrutura (EventBridge → Lambda). Enquanto isso, o `GET` da evolução
   recompute por equipe, o que cobre quem abre a tela mas não quem não abre.
4. **Ingestão do acervo** (DF-15): rodada só em dry-run. O `--apply` exige `--admin` e a
   conferência do diff no PR.
5. **Vocabulário fail/manual** (DF-12 RF-4.2) e **base legal do conteúdo pós-exclusão**
   (DF-14 §8.3) seguem como decisões de gente.

## Tabela-resumo das fases

| Fase | Entrega                                             | Branch                   | Esforço | Marco | Gate resumido                                                                       |
| ---- | --------------------------------------------------- | ------------------------ | ------- | ----- | ----------------------------------------------------------------------------------- |
| EV-0 | Motor puro `packages/evolution` (catálogo + níveis) | `feat/df13-motor`        | M       |       | Fixtures → níveis esperados; catálogo versionado; zero IO                           |
| EV-1 | Banco + API `evolution` + produtores de evidência   | `feat/df13-api`          | G       | EV-M1 | Salvar snapshot do projeto da temporada muda nível sem UI; RLS testada              |
| EV-2 | Banco + API `knowledge` (DF-14)                     | `feat/df14-api`          | G       |       | Decisão/guia/trilha/kit geram evidência; export LGPD ampliado                       |
| EV-3 | Shell novo (DF-12 = fase 6 do design)               | `feat/df11-rail` (mesma) | G       |       | 4 destinos + Ferramentas hub; câmera preservada; paridade DF-10                     |
| EV-4 | Tela Equipe · Evolução (DF-13 UI)                   | `feat/df13-ui`           | G       |       | Ciclo completo: evidência → nível → critério → passo → conclusão, no browser        |
| EV-5 | Tela Equipe · Conhecimento (DF-14 UI) + busca       | `feat/df14-ui`           | M       | EV-M2 | Registrar decisão em ≤ 30 s a partir do editor; kits operáveis                      |
| EV-6 | Início (DF-16) + `GET /me/home`                     | `feat/df16-inicio`       | M       |       | 1 chamada alimenta a página; estados vazio/bootstrap/erro                           |
| EV-7 | Comunidade (DF-15): ingestão + resultados + claim   | `feat/df15-comunidade`   | G       | EV-M3 | Acervo 2021–2026 publicado e conferido; claim manual; correções auditadas           |
| EV-8 | Benchmark + metas → fila + polimento do ciclo       | `feat/df15-benchmark`    | M       |       | Mediana com piso de 8; "transformar em meta" cria passo; leitura editorial revisada |

Marcos: **EV-M1** = a evidência flui de ponta a ponta sem UI (fim da EV-1) · **EV-M2** = uma
equipe vive o ciclo completo no produto (Evolução + Conhecimento + Início; fim da EV-5/6) ·
**EV-M3** = Comunidade no ar com o acervo publicado (fim da EV-7).

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
