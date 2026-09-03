# DF-18 — Patentes do protótipo: a maturidade vira emblema

> Rascunho de feature (2026-08-30). Deriva do canvas de design
> ["Patentes da Estrada"](https://claude.ai/code/artifact/aca0d047-5859-43fd-9b58-5e07d3a7d921).
> Decisão de arquitetura em [`docs/adr/011-patentes-gamificacao.md`](../../docs/adr/011-patentes-gamificacao.md),
> que **emenda a decisão 1 do [ADR-010](../../docs/adr/010-evolucao-maturidade.md)**.

- **Status:** ✅ **IMPLEMENTADA** (2026-08-31, `e7df2c2` / PR #38), no lote das patentes
  DF-18…DF-20. Decisão de arquitetura no
  [ADR-011](../../docs/adr/011-patentes-gamificacao.md). Não vai para `spec.md`, que é do
  validador.
- **Dependências:** DF-13 (níveis por área — implementado), DF-19 (catálogo autodeclarativo v2 —
  define o que alimenta os níveis na v1), DF-15 (vínculo com o registro canônico e resultados de
  competição — implementado em ingestão), DF-10 (capitania, para a permissão de ativar).
- **Alimenta:** DF-16 (Início mostra a patente e a distância até a próxima), DF-20 (aferição usa a
  mesma superfície de critérios).

## 1. Contexto e motivação

O DF-13 entregou um modelo correto e frio: seis áreas, níveis de 1 a 5, média com uma casa
decimal. "2,2 / 5" é preciso e não se conta para ninguém. Nenhum estudante manda no grupo da
equipe uma captura de tela dizendo "subimos de 2,1 para 2,2".

O que a pesquisa de mercado mostra é que a motivação das equipes é **concreta e comparativa**:
elas se descrevem pelo carro que conseguiram construir, e a referência é sempre outra equipe.
Falta ao modelo um **nome** — algo que a equipe queira alcançar e consiga dizer em voz alta.

A proposta é uma escada de oito patentes, batizadas pelos veículos de _Mad Max: Fury Road_, do
mais improvisado ao mais refinado. A ordem carrega a leitura de maturidade sem precisar de
legenda: começa sem carro e com energia; depois há carro, pesado demais para o que precisa
fazer; depois há potência sem eficiência; e assim por diante até o carro que compete e vence.

**A patente não é uma métrica nova.** É uma leitura do que o motor do DF-13 já calcula, mais uma
coisa que o modelo não tinha: validação por **resultado de competição oficial**.

## 2. Objetivos

| #   | Objetivo                                                                                       |
| --- | ---------------------------------------------------------------------------------------------- |
| O1  | Patente 1–8 do protótipo da temporada, derivada dos níveis do DF-13 — nunca um placar paralelo |
| O2  | As quatro patentes superiores exigem resultado em competição oficial (acervo público do DF-15) |
| O3  | Avaliação só existe para a equipe que **pediu** para ser avaliada (opt-in da capitania)        |
| O4  | Alvo nomeado: a tela diz exatamente quais critérios faltam para a próxima patente              |
| O5  | A conquista sobrevive à turma: histórico por temporada, com a capitania da época               |
| O6  | Emblema privado por padrão, com vitrine opcional — nunca uma listagem ordenada de equipes      |

### Não-objetivos

- **Pontos, moedas, sequências de dias (_streaks_), níveis de usuário individual.** A rejeição do
  ADR-010 continua valendo para tudo isso; ver ADR-011.
- **Ranking público de maturidade.** A dec. 4 do ADR-010 sobrevive inteira (§7.3).
- **Patente de pessoa.** A unidade é o protótipo de uma equipe. Membro não tem patente.
- **Notificação por e-mail ou push.** A promoção aparece na próxima visita, e só.
- **Mudar o cálculo dos níveis das áreas.** Isso é do DF-13/DF-19; aqui só se lê.

## 3. Conceito

### 3.1 A unidade avaliada é o protótipo, não a equipe

A patente pertence ao **protótipo da temporada** (`team_season.season_project_id`, já existente no
DF-13 §3.4). Consequências que a UI precisa respeitar:

- O emblema é sempre exibido junto da temporada e do projeto: _"The Gigahorse · patente 6 ·
  protótipo da temporada 2027"_.
- **Usuário sem equipe não tem protótipo avaliado nem patente.** A tela mostra "crie ou entre numa
  equipe", nunca um emblema cinza ou barras vazias.
- **Equipe sem projeto designado** que ativou a avaliação vê um único passo na fila — "designe o
  protótipo da temporada" — e nenhuma área é penalizada antes disso (revoga a penalização
  silenciosa do DF-13 P-4.1: continua havendo aviso, mas o nível não é calculado).
- Virada de temporada: novo protótipo designado, **níveis continuam acumulando** (DF-13 O5) e a
  patente da temporada anterior fica no histórico com o rótulo daquela temporada.

### 3.2 Opt-in: a capitania ativa

Nada disto existe até a capitania ativar. Antes da ativação, a aba Evolução mostra um painel único
explicando o que a avaliação faz, e o botão só funciona para quem tem a permissão.

**Por que opt-in e não padrão.** Medir sem pedir transforma ferramenta em auditoria — que é
exatamente o risco nº 1 registrado no ADR-010 ("o portal ganha a cara de auditoria que afasta em
vez de atrair"). Pedindo, a equipe que entra **quis** ser medida, e a taxa de ativação vira o
primeiro sinal honesto de que o modelo serve para alguém.

**A ativação é retroativa.** No instante em que a capitania ativa, o motor lê o que a equipe já
produziu — projeto salvo, organograma, decisões — e devolve nível e patente na hora. Ninguém
encara um painel zerado pedindo formulário. Isso é requisito, não otimização (RF-2.4).

**Desativar é simétrico e reversível.** Patente e níveis somem da interface e param de recomputar;
declarações e histórico ficam dormentes e voltam intactos na reativação. Nada é apagado.

### 3.3 A escada das oito patentes

Ordem fixa, do menos maduro para o mais maduro. A leitura é o que vira texto de produto.

| #   | Patente             | Leitura                                                                                          |
| --- | ------------------- | ------------------------------------------------------------------------------------------------ |
| 8   | **Motorats**        | Sem carro e com pouco registro — mas com gente e vontade. Ponto de partida, não castigo.         |
| 7   | **The Peacemaker**  | O carro existe e é pesado demais para o que precisa fazer. Bruto, superdimensionado.             |
| 6   | **The Gigahorse**   | Potência mal aproveitada: há ferramenta e cerimônia, falta disciplina que converta em resultado. |
| 5   | **Elvis**           | Rústico, mas cada sistema tem função e dono. Teto de quem ainda não competiu.                    |
| 4   | **The Nux Car**     | Leve, feito para correr — e correu. O ciclo fechou, do regulamento à inspeção.                   |
| 3   | **Plymouth Rock**   | Aguentou o pior: terminou o enduro com pontuação. Divisa entre "competiu" e "compete".           |
| 2   | **Buggy #9**        | Nada além do necessário. Pontua acima da mediana da coorte — virou referência.                   |
| 1   | **The Interceptor** | Pódio ou 10% superior, com as seis áreas fortes ao mesmo tempo.                                  |

Grafia: a arte grafa **PEACEMAKER** (nome canônico do veículo). Não usar "Piecemaker".

**Nomes livres de marca**, reserva do §8: Enxame · Aríete · Colosso · Marreta · Ligeiro · Brasa ·
Gaiola 9 · Ponta de Lança. A escada é o produto; os nomes são pele e trocam sem tocar no motor.

### 3.4 As duas travas

A patente é **a maior cujas duas travas estão cumpridas** — cumulativa, como os níveis das áreas.

| #   | Patente         | Trava 1 · maturidade       | Trava 2 · competição oficial                           |
| --- | --------------- | -------------------------- | ------------------------------------------------------ |
| 8   | Motorats        | ativou a avaliação         | —                                                      |
| 7   | The Peacemaker  | `média ≥ 1,0` · `piso ≥ 1` | —                                                      |
| 6   | The Gigahorse   | `média ≥ 1,8` · `piso ≥ 1` | —                                                      |
| 5   | Elvis           | `média ≥ 2,5` · `piso ≥ 2` | —                                                      |
| 4   | The Nux Car     | `média ≥ 3,0` · `piso ≥ 2` | ≥ 1 participação nas últimas 2 temporadas              |
| 3   | Plymouth Rock   | `média ≥ 3,5` · `piso ≥ 3` | enduro concluído com pontuação na participação recente |
| 2   | Buggy #9        | `média ≥ 4,0` · `piso ≥ 3` | pontuação total ≥ mediana da coorte                    |
| 1   | The Interceptor | `média ≥ 4,5` · `piso ≥ 4` | pódio (top 3) ou 10% superior da geral                 |

- **Média** = aritmética dos 6 níveis, uma casa decimal (DF-13 §3.2).
- **Piso** = menor nível entre as 6 áreas. É o que impede a patente torta: sem ele, a equipe subiria
  só salvando versões da gaiola — a área que sobe com menos esforço — e ignorando Conhecimento, que
  é justamente onde mora o problema nº 1 da pesquisa (rotatividade).
- **Sem vínculo aprovado** ao registro canônico do DF-15, a trava 2 é falsa da patente 4 para cima e
  o teto é 5. Efeito colateral desejado: passar de 5 exige o _claim_ que o DF-15 não tinha como
  estimular.
- **Coorte com menos de 8 equipes ativas** (mesmo piso do DF-13 RF-7.2): a trava da patente 2 usa a
  mediana geral da competição, e a tela diz qual régua foi usada.
- Os limiares são **primeira calibração**, feita sobre a escada iniciante → intermediária → alta
  performance da pesquisa. São dados de catálogo versionado, não constantes espalhadas (§5).

### 3.5 Subida imediata, queda com carência, marca histórica permanente

Assimetria deliberada, e é onde esta feature se afasta do DF-13:

- **Sobe na hora.** A evidência entra, o nível recomputa na mesma transação, a patente sobe junto.
- **Cai com 30 dias de carência.** O nível da área continua caindo imediatamente e honestamente
  (ADR-010 dec. 3 — não muda). A **patente** guarda `broken_since` e só desce se a trava ainda
  estiver rompida 30 dias depois. Consertou antes, nunca desceu.
  - Razão: o ADR-010 já registrava o risco de a queda ensinar o comportamento errado ("não salve a
    versão com problema"). Com barra e emblema caindo juntos e na hora, o incentivo perverso
    dobra. A carência dá à equipe a janela para consertar sem perder o rosto.
- **A maior patente alcançada nunca cai.** Fica no histórico com a temporada e a capitania da
  época. O emblema vigente mede hoje; o histórico registra o que a equipe já foi capaz de fazer —
  e é isso que sobrevive à formatura da turma.

## 4. Requisitos funcionais

### E1 — Motor (`packages/evolution`)

- **RF-1.1** `computeRank(input): RankResult` puro, no mesmo pacote e no mesmo `catalogVersion` do
  catálogo de critérios. Sem IO, testado por fixture.

  ```ts
  computeRank({ optIn, seasonProjectId, levels, competition, now })
  // 1. sem optIn ou sem seasonProjectId → { rank: null, reason: 'sem-avaliacao' | 'sem-prototipo' }
  // 2. media = média dos 6 níveis; piso = menor dos 6
  // 3. para n de 1 até 8: se travaMaturidade(n) && travaCompeticao(n) → devolve n
  // 4. devolve 8
  ```

- **RF-1.2** `RANKS` é tabela de dados no catálogo: `{ n, id, nome, nomeLivre, leitura, mediaMin,
pisoMin, competicao }`. Trocar limiar ou nome é mudar dado, nunca código de fluxo.
- **RF-1.3** A patente vigente é **derivada** — jamais gravada como número de verdade paralelo.
  Some o modelo de maturidade e a patente some junto; é o que garante que ela não pode ser farmada
  por fora.
- **RF-1.4** Strings de UI (nome da patente, leitura, motivo de bloqueio) canônicas no pacote —
  mesma regra do DF-13 RF-1.3.
- **RF-1.5** `nextRank(result)` devolve a patente seguinte e a lista de critérios pendentes que a
  destravam, separando "falta maturidade" de "falta competição".

### E2 — Opt-in

- **RF-2.1** `POST /teams/:id/evolution/optin` e `DELETE` — permissão `evolution.optin`
  (owner/admin, mesma faixa de `evolution.season`). Body registra a versão do texto aceito.
- **RF-2.2** Toda ativação e desativação audita (`evolution.optin` / `evolution.optout`) com ator,
  data e versão do texto. Aparece na atividade da equipe.
- **RF-2.3** O painel pré-ativação lista, com as palavras do §3.2 da tela, **o que será lido**:
  última versão salva do protótipo; organograma e capitania; contadores do diário e guias;
  resultados públicos de competição, se e quando houver vínculo. Nada de conteúdo de decisão sai
  da equipe.
- **RF-2.4** A ativação **recomputa retroativamente** níveis e patente a partir das evidências já
  existentes, na mesma requisição. O primeiro carregamento pós-ativação nunca mostra zeros
  quando há dado.
- **RF-2.5** Desativar não apaga: `evolution_declarations`, `evolution_evidence` e o histórico de
  patentes ficam intactos e voltam a valer na reativação. Todas as superfícies de evolução somem
  do shell enquanto estiver desativado.
- **RF-2.6** Quem não tem a permissão vê o mesmo painel com o botão desabilitado
  (`--bj-disabled-fg`) e a linha "peça à capitania para ativar" — nunca um convite que a pessoa
  não pode aceitar.

### E3 — Travas de competição

- **RF-3.1** A trava lê `competition_results` (DF-15) da equipe **vinculada**. Sem vínculo
  aprovado, `travaCompeticao(n ≤ 4)` é falsa, e o motivo devolvido é `sem-vinculo` — a UI o
  converte no passo "vincular a equipe ao registro do Brasil".
- **RF-3.2** "Participação nas últimas 2 temporadas" usa a temporada da competição, não a data —
  um ano sem competir não derruba.
- **RF-3.3** "Enduro concluído com pontuação" = existe pontuação de enduro > 0 na participação mais
  recente. O rol de provas varia por edição (DF-15 RF-1.2): a chave da prova é resolvida por
  normalização de nome, e quando ela não existe na edição a trava devolve `prova-ausente` e a
  patente 3 fica bloqueada com essa explicação, nunca com um falso negativo silencioso.
- **RF-3.4** Mediana da coorte com piso de 8 equipes ativas; abaixo disso, mediana geral da
  competição, com a régua declarada na tela.
- **RF-3.5** Resultado novo ingerido para a equipe vinculada recomputa a patente. Isto **não**
  contradiz o ADR-010 dec. 4 ("resultado não afeta nível"): o **nível** continua sem ser afetado;
  a patente é outra coisa, e a diferença é explícita na tela.

### E4 — Carência, histórico e recomputação

- **RF-4.1** `team_rank_state` guarda `rank`, `broken_since`, `broken_target`. Quando o cálculo
  devolve patente pior que a vigente, grava-se `broken_since` na primeira vez e mantém-se a patente
  vigente; a queda efetiva ocorre no recálculo diário quando `now - broken_since ≥ 30 dias`.
- **RF-4.2** Cálculo que volta a atingir a patente vigente limpa `broken_since` — sem evento, sem
  ruído.
- **RF-4.3** Toda mudança efetiva grava `team_rank_history` (append-only) e emite evidência
  `rank.changed {from, to, reason, catalogVersion, seasonLabel}`.
- **RF-4.4** `team_rank_history` é a fonte da "maior patente alcançada" e do histórico por
  temporada. Nunca é apagado por desativação, queda ou virada de temporada.
- **RF-4.5** O recálculo diário do DF-13 RF-2.3 passa a resolver também a carência. Nenhum
  agendador novo.

### E5 — Promoção

- **RF-5.1** Subir de patente gera um aviso em tela cheia mostrado **uma vez por membro**, na
  primeira visita depois da promoção (controle por `last_seen_rank` no lado do usuário).
- **RF-5.2** O aviso mostra o emblema anterior e o novo, o nome, a patente, a média e **o que
  fechou a patente**: os critérios que mudaram de estado desde a patente anterior, com autor e
  quando.
- **RF-5.3** Ações: baixar o cartaz (RF-7.1), ver o que falta para a próxima, fechar.
- **RF-5.4** **Queda nunca abre este aviso.** Vira linha discreta na atividade, com causa e o passo
  que reverte. Comemorar em tela cheia e cobrar no rodapé é decisão de produto, não descuido.

### E6 — Vitrine

- **RF-6.1** Duas preferências de equipe, ambas `false` por padrão, ambas `evolution.optin`:
  `rank_public` (emblema no perfil público) e `rank_history_public` (histórico por temporada).
- **RF-6.2** Com `rank_public`, o perfil da equipe em Comunidade mostra **apenas** emblema, número,
  nome e temporada. Níveis por área, critérios, declarações e fila **nunca** são publicáveis.
- **RF-6.3** Não existe, e não é pendência: listagem ordenada de equipes por patente ou por
  maturidade, filtro por patente na Comunidade, ou exibição da patente de terceiros em qualquer
  agregado de produto.
- **RF-6.4** Desligar a vitrine é imediato e não notifica ninguém.

### E7 — Cartaz

- **RF-7.1** "Baixar o cartaz da equipe": PNG 1080×1080 gerado **no cliente** (canvas), com
  emblema, nome da equipe, patente, temporada e o domínio. Sem serviço novo, sem upload.
- **RF-7.2** O cartaz é o único canal pelo qual a patente sai do portal sem a capitania mandar —
  e sai por ato explícito de um membro, para o grupo da equipe.
- **RF-7.3** O crédito da arte (§8) acompanha o cartaz em texto pequeno no rodapé da imagem.

## 5. Modelo de dados (proposta — migração `0008_ranks.sql`)

```sql
-- opt-in: quem ativou, quando, e qual texto foi aceito
CREATE TABLE evolution_optin (
  team_id       uuid PRIMARY KEY REFERENCES teams (id) ON DELETE CASCADE,
  enabled       boolean     NOT NULL DEFAULT true,
  notice_version text       NOT NULL,
  enabled_by    uuid REFERENCES users (id) ON DELETE SET NULL,
  enabled_at    timestamptz NOT NULL DEFAULT now(),
  disabled_by   uuid REFERENCES users (id) ON DELETE SET NULL,
  disabled_at   timestamptz
);

-- estado vigente da patente + carência (derivado, mas materializado p/ a carência)
CREATE TABLE team_rank_state (
  team_id        uuid PRIMARY KEY REFERENCES teams (id) ON DELETE CASCADE,
  rank           integer CHECK (rank BETWEEN 1 AND 8),
  season_label   text,
  broken_since   timestamptz,
  broken_target  integer CHECK (broken_target BETWEEN 1 AND 8),
  catalog_version text NOT NULL,
  computed_at    timestamptz NOT NULL DEFAULT now()
);

-- histórico append-only: a marca que sobrevive à turma
CREATE TABLE team_rank_history (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id       uuid NOT NULL REFERENCES teams (id) ON DELETE CASCADE,
  rank          integer NOT NULL CHECK (rank BETWEEN 1 AND 8),
  previous_rank integer CHECK (previous_rank BETWEEN 1 AND 8),
  season_label  text,
  project_id    uuid REFERENCES projects (id) ON DELETE SET NULL,
  reason        text NOT NULL,          -- 'promocao' | 'queda' | 'catalogo' | 'reativacao'
  catalog_version text NOT NULL,
  changed_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE teams
  ADD COLUMN rank_public         boolean NOT NULL DEFAULT false,
  ADD COLUMN rank_history_public boolean NOT NULL DEFAULT false;
```

- **RLS:** team-scoped no padrão existente. `team_rank_history` append-only por GRANT, como
  `audit_events`. Leitura pública do perfil (RF-6.2) passa por _view_ que expõe só
  `rank`/`season_label` e só quando `teams.rank_public`.
- **Contrato ODCS novo:** `team-rank.odcs.yaml`. PII: `enabled_by`/`disabled_by` — base legal
  execução de contrato; retenção: vida da equipe; exclusão de conta anonimiza o ator (`SET NULL`)
  preservando o fato.
- Nenhuma coluna nova em `projects` ou `evolution_levels`: a patente lê, não escreve.

## 6. API

| Método/rota                         | Ação                                                | Permissão         |
| ----------------------------------- | --------------------------------------------------- | ----------------- |
| `POST   /teams/:id/evolution/optin` | ativar (recomputa retroativo e devolve o resultado) | `evolution.optin` |
| `DELETE /teams/:id/evolution/optin` | desativar                                           | `evolution.optin` |
| `GET    /teams/:id/rank`            | patente vigente, próxima, pendências e carência     | membro            |
| `GET    /teams/:id/rank/history`    | histórico por temporada                             | membro            |
| `PATCH  /teams/:id/rank/visibility` | `rank_public`, `rank_history_public`                | `evolution.optin` |
| `POST   /teams/:id/rank/seen`       | marca a promoção como vista por este usuário        | membro            |

`GET /teams/:id/evolution` (DF-13) e `GET /me/home` (DF-16) passam a carregar o bloco de patente;
`/me/home` continua com o teto de 20 KB — a patente cabe em ~400 bytes. Policy layer ganha
`evolution.optin`. Auditoria: `evolution.optin`, `evolution.optout`, `rank.visibility`.

## 7. UI

Todas as telas estão desenhadas no canvas; o que a implementação precisa preservar:

- **Faixa da patente** no topo de Equipe · Evolução: emblema, nome em serifa
  (`--bj-font-display`), "patente N de 8" em mono, média, a mediana da coorte **em emblema**
  ("a mediana da sua coorte é _The Peacemaker_"), e a próxima patente com a contagem de critérios
  faltantes. A linha "Protótipo da temporada 2027 · gaiola v14" vem antes do nome — a unidade
  avaliada nunca fica implícita.
- **Painel "para chegar em …"** na coluna direita, com os critérios pendentes do próximo nível e o
  botão "colocar os N na fila". Quando a próxima patente exige competição, a linha aparece separada
  e sem prometer que critérios resolvem.
- **Início (DF-16):** emblema, barra de progresso até a próxima patente e a frase "um deles é
  seu" quando o membro é dono de um passo pendente.
- **Emblema em miniatura** na topbar da equipe e na atividade — recorte do veículo, sem o título
  da arte, com o nome em texto ao lado.
- Densidade `comfortable`, tokens `--bj-*`, zero hex (guarda `check-tokens`). Progresso em
  `--bj-accent`; **ocre segue sendo acento**: a placa ocre da arte fica confinada ao emblema, que
  ocupa ~1% da tela.
- **CT-3 (nunca só cor):** patente sempre acompanhada do número e do nome. Emblema bloqueado usa
  dessaturação **e** o rótulo "faltam N critérios".

## 8. Arte, licença e créditos

Os nove GIFs vivem em `apps/web/public/patentes/`, numerados pela patente
(`patente-8-motorats.gif` … `patente-1-interceptor.gif`), mais
`patente-modulo-logo.gif` — recorte circular do Interceptor animado, usado como logo do módulo.

| Papel      | Autor                              |
| ---------- | ---------------------------------- |
| Ilustração | **Evgeniy Yudin** — _Mazok Pixels_ |
| Animação   | **Misha Petrick**                  |

Obra "MAD MAX Fury Road" — <https://www.behance.net/gallery/26428843/MAD-MAX-Fury-Road> —
licenciada em **CC BY-NC 4.0** (<https://creativecommons.org/licenses/by-nc/4.0/deed.pt-br>).

- **RF-8.1** O crédito aparece **na tela**: rodapé da tela de patentes e do cartaz exportado.
  Diferente dos ícones do Lucide (que não creditam na interface), a licença aqui exige atribuição
  de forma razoável — e este é o lugar razoável. Registrado em `/THIRD-PARTY-NOTICES.md`.
- **RF-8.2** Fora do design system: são ativos coloridos e não recoloríveis, servidos como imagem
  (`img-src 'self'`, pelo precedente de `google.svg`). Não passam por `check-icons` nem por
  `check-tokens`.
- **RF-8.3** **A cláusula NC tem prazo.** Vale enquanto o portal for gratuito. O marco M3 do
  `docs/plano-producao-v2.md` prevê assinaturas: antes de qualquer cobrança é preciso obter
  permissão direta dos dois autores **ou** substituir por arte original. A escada de nomes livres
  do §3.3 existe para esse caso e não custa nada manter no catálogo desde já.
- **RF-8.4** Os veículos são do filme homônimo; a marca é de terceiro e o portal não a reivindica.
  Nenhum uso da identidade "SAE" está envolvido (`specs/spec.md` §1).

## 9. Pontos de falha e mitigação

| ID    | Ponto de falha                                            | Mitigação                                                                                                    |
| ----- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| P-1.1 | Quase ninguém ativa e não há dado para calibrar           | Ativação retroativa (RF-2.4) devolve resultado na hora; taxa de ativação é o sinal, e baixa é resposta       |
| P-1.2 | O emblema vira o objetivo e o modelo vira teatro          | Piso por área; maioria dos critérios com evidência; aferição do DF-20; sem ranking que pague a trapaça       |
| P-2.1 | Trava de competição exclui quem não tem verba para viajar | Janela de 2 temporadas; texto "ainda não competiu", nunca "é fraca"; patente 5 é teto alto. **Risco aceito** |
| P-2.2 | Prova de enduro ausente na edição gera falso negativo     | RF-3.3: devolve `prova-ausente` e explica; nunca reprova em silêncio                                         |
| P-3.1 | Cair em público com a vitrine ligada                      | Carência de 30 dias; perfil mostra também a maior patente alcançada; desligar é 1 clique sem notificar       |
| P-3.2 | Oito degraus são régua mais fina que os dados suportam    | Limiares em catálogo versionado; piloto de 2–3 equipes antes do GA; ajusta-se o limiar, não a escada         |
| P-4.1 | O portal virar fã-clube em vez de ferramenta              | Estética confinada ao emblema: nada de tipografia de cartaz ou vocabulário de filme no resto do produto      |
| P-5.1 | Mudança de catálogo mexe em patente sem aviso             | `catalog_version` no histórico; delta explicado na atividade, como o DF-13 P-1.3 já faz para níveis          |

## 10. Critérios de aceite

| #          | Critério                                                                                                              |
| ---------- | --------------------------------------------------------------------------------------------------------------------- |
| AC-DF18.1  | Motor: fixtures de níveis + participações → patente esperada nas 8 faixas, incluindo bordas de média e de piso        |
| AC-DF18.2  | Equipe sem opt-in não tem patente nem níveis em nenhuma resposta de API; usuário sem equipe idem                      |
| AC-DF18.3  | Ativar com dados preexistentes devolve patente > 8 na mesma resposta (retroatividade)                                 |
| AC-DF18.4  | Desativar e reativar preserva declarações, evidências e histórico; a patente volta ao mesmo valor                     |
| AC-DF18.5  | Ativar exige `evolution.optin`; membro comum recebe 403 e a UI mostra o botão desabilitado                            |
| AC-DF18.6  | Piso: equipe com média 3,2 e uma área em 1 não passa da patente 6                                                     |
| AC-DF18.7  | Sem vínculo aprovado, a patente não passa de 5 mesmo com média 4,8; motivo devolvido é `sem-vinculo`                  |
| AC-DF18.8  | Queda: trava rompida hoje mantém a patente; no recálculo do 31º dia a patente cai e grava histórico com a causa       |
| AC-DF18.9  | Trava restaurada no 20º dia limpa `broken_since` e não gera evento                                                    |
| AC-DF18.10 | Promoção aparece uma vez por membro; `POST /rank/seen` a silencia sem afetar os outros membros                        |
| AC-DF18.11 | Com `rank_public = false`, o perfil público não expõe patente em nenhum campo; com `true`, expõe só emblema/temporada |
| AC-DF18.12 | Nenhuma rota devolve patente de outra equipe fora do perfil público consentido (teste RLS dedicado)                   |
| AC-DF18.13 | Cartaz PNG é gerado no cliente, traz o crédito da arte e não depende de rede                                          |
| AC-DF18.14 | Export LGPD do titular inclui os atos de opt-in/opt-out em que ele foi o ator                                         |

## 11. Questões em aberto

1. **Limiares.** Os oito pares (média, piso) são calibração informada, não medida. Só o piloto diz
   se o 6 está fácil demais. Registrado, não decidido.
2. **Patente por protótipo × equipe com dois carros** (mula + competição, prática 7 da pesquisa).
   A v1 tem um protótipo da temporada; equipe de elite escolhe o de competição. Herdado do DF-13
   §11.5.
3. **Entitlements.** Se histórico e vitrine viram recurso de plano pago no M3 — o que colide com a
   cláusula NC da arte (RF-8.3). As duas decisões precisam ser tomadas juntas.
4. **Nome do módulo na UI.** "Patentes" é o termo desta spec. Alternativas descartadas por ambiguidade
   com o vocabulário de propriedade industrial: "Patente" é de uso corrente em português para
   graduação militar, e o contexto de emblema desfaz a ambiguidade — mas vale confirmar com equipe
   real no piloto.
5. **Promoção com múltiplos saltos.** Fechar vários critérios de uma vez pode pular duas patentes.
   A v1 mostra só o aviso da patente final; mostrar a escalada inteira é v2.

## 12. Plano

Fase **EV-9** do `docs/plano-implementacao-evolucao.md`, depois do lote DF-12…DF-16:

| Sub    | Entrega                                                                                     |
| ------ | ------------------------------------------------------------------------------------------- |
| EV-9.1 | `computeRank()`, tabela `RANKS` e fixtures no motor puro                                    |
| EV-9.2 | Migração `0008`, opt-in, carência no recálculo diário, patente em `/evolution` e `/me/home` |
| EV-9.3 | Painel de ativação, faixa da patente, painel "para chegar em …", aviso de promoção          |
| EV-9.4 | Cartaz PNG, chave de vitrine e emblema no perfil público                                    |

**Gates:** RF-8.3 (licença) resolvido antes de EV-9.4 se o M3 estiver no horizonte; e o mesmo
piloto de 2–3 equipes do DF-13 antes de abrir para todos.
