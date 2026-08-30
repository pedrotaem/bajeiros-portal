-- Up Migration
-- DF-15 — Comunidade: calendário de competições, registro canônico das equipes do
-- Brasil, resultados por prova, vínculo ("claim") e solicitações de correção.
-- Contratos: contracts/competition.odcs.yaml, community-team.odcs.yaml,
-- competition-result.odcs.yaml, result-correction.odcs.yaml (ADR-006).
--
-- Restrição de marca (spec.md §1): NENHUM uso da identidade da organização. As
-- competições são nomeadas por tipo e ano ("Nacional 2026", "Regional Sudeste 2025");
-- a fonte é citada como "resultados públicos das competições".
--
-- Invariante da ingestão: dados de ENTE COLETIVO. Nenhum campo de pessoa física
-- entra aqui — o script descarta na origem (AC-DF15.8) e o schema não tem onde pôr.

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
  -- region é NULL nas nacionais; NULLS NOT DISTINCT dá a chave natural da ingestão
  UNIQUE NULLS NOT DISTINCT (season, kind, region)
);

CREATE TABLE community_teams (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name       text NOT NULL,
  university         text,
  city               text,
  uf                 text,
  region             text,
  links              jsonb NOT NULL DEFAULT '[]'::jsonb,
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
CREATE INDEX competition_results_team ON competition_results (community_team_id);

-- O portal nunca edita em silêncio: correção é pedida com fonte e aplicada por admin,
-- com registro em audit_events (§3.2 — credibilidade é o ativo central).
CREATE TABLE result_corrections (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by uuid REFERENCES users (id) ON DELETE SET NULL,
  target       jsonb NOT NULL,   -- {competitionId, communityTeamId, field}
  proposal     text NOT NULL CHECK (char_length(proposal) BETWEEN 1 AND 1000),
  source_url   text,
  status       text NOT NULL DEFAULT 'aberta'
               CHECK (status IN ('aberta', 'aplicada', 'recusada')),
  resolved_by  uuid REFERENCES users (id) ON DELETE SET NULL,
  resolved_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX result_corrections_open ON result_corrections (status, created_at);

-- Solicitação de vínculo: a capitania pede, o admin aprova com evidência (RF-2.2).
-- Uma solicitação aberta por equipe do portal.
CREATE TABLE community_claims (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id           uuid NOT NULL REFERENCES teams (id) ON DELETE CASCADE,
  community_team_id uuid NOT NULL REFERENCES community_teams (id) ON DELETE CASCADE,
  evidence          text CHECK (char_length(evidence) <= 1000),
  status            text NOT NULL DEFAULT 'aberta'
                    CHECK (status IN ('aberta', 'aprovada', 'recusada')),
  requested_by      uuid REFERENCES users (id) ON DELETE SET NULL,
  resolved_by       uuid REFERENCES users (id) ON DELETE SET NULL,
  resolved_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX community_claims_one_open ON community_claims (team_id)
  WHERE status = 'aberta';

/*
 * Coorte de desempenho (§3.1): média da pontuação total NORMALIZADA (pontos /
 * pontos do campeão da mesma competição) das últimas 3 participações; os tercis
 * definem iniciante · intermediária · alta performance.
 *
 * O produto NÃO usa números de tier: os dois documentos da pesquisa usam "Tier 1"
 * em sentidos opostos, então o nome é o único vocabulário seguro.
 *
 * SECURITY DEFINER porque cruza todas as equipes; a coorte de TERCEIROS nunca é
 * exposta na UI (§3.1) — a rota devolve só a da própria equipe.
 */
CREATE FUNCTION community_cohorts()
RETURNS TABLE (c_community_team_id uuid, c_score numeric, c_cohort text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$
  WITH champion AS (
    SELECT competition_id, max(points_total) AS best
    FROM competition_results WHERE points_total IS NOT NULL
    GROUP BY competition_id
  ),
  normalized AS (
    SELECT r.community_team_id, c.season,
           r.points_total / NULLIF(ch.best, 0) AS ratio,
           row_number() OVER (PARTITION BY r.community_team_id ORDER BY c.season DESC) AS rn
    FROM competition_results r
    JOIN competitions c ON c.id = r.competition_id
    JOIN champion ch ON ch.competition_id = r.competition_id
    WHERE r.points_total IS NOT NULL
  ),
  scored AS (
    SELECT community_team_id, avg(ratio) AS score
    FROM normalized WHERE rn <= 3 GROUP BY community_team_id
  ),
  ranked AS (
    SELECT community_team_id, score, ntile(3) OVER (ORDER BY score) AS tercile FROM scored
  )
  SELECT community_team_id, score,
         CASE tercile WHEN 1 THEN 'iniciante'
                      WHEN 2 THEN 'intermediaria'
                      ELSE 'alta-performance' END
  FROM ranked
$$;

/*
 * Mediana por prova da coorte, numa competição (RF-3.2). Devolve o tamanho da
 * coorte para a app aplicar o piso de 8 — mesmo piso do DF-13 RF-7.2.
 */
CREATE FUNCTION community_benchmark(p_competition_id uuid, p_cohort text)
RETURNS TABLE (b_event text, b_median numeric, b_teams integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$
  WITH coorte AS (
    SELECT c_community_team_id AS team FROM community_cohorts() WHERE c_cohort = p_cohort
  ),
  pontos AS (
    SELECT p.key AS event, (p.value)::numeric AS points
    FROM competition_results r
    JOIN coorte ON coorte.team = r.community_team_id,
         LATERAL jsonb_each_text(r.points) AS p(key, value)
    WHERE r.competition_id = p_competition_id
      AND jsonb_typeof(r.points -> p.key) = 'number'
  )
  SELECT event,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY points)::numeric,
         count(*)::int
  FROM pontos GROUP BY event
$$;

GRANT SELECT ON competitions, community_teams, competition_results TO bajeiros_app;
GRANT INSERT, UPDATE, DELETE ON competitions, community_teams, competition_results
  TO bajeiros_app;
GRANT SELECT, INSERT, UPDATE ON result_corrections, community_claims TO bajeiros_app;
GRANT EXECUTE ON FUNCTION community_cohorts(), community_benchmark(uuid, text)
  TO bajeiros_app;

-- ---------- RLS ----------

-- Acervo é público entre usuários autenticados (dados de entes coletivos, sem PII).
-- Escrita só admin: a ingestão roda com um usuário admin do portal.
ALTER TABLE competitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY competitions_read ON competitions FOR SELECT USING (app_user_id() IS NOT NULL);
CREATE POLICY competitions_admin ON competitions
  USING (app_is_admin()) WITH CHECK (app_is_admin());

ALTER TABLE community_teams ENABLE ROW LEVEL SECURITY;
CREATE POLICY community_teams_read ON community_teams FOR SELECT
  USING (app_user_id() IS NOT NULL);
CREATE POLICY community_teams_admin ON community_teams
  USING (app_is_admin()) WITH CHECK (app_is_admin());

ALTER TABLE competition_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY competition_results_read ON competition_results FOR SELECT
  USING (app_user_id() IS NOT NULL);
CREATE POLICY competition_results_admin ON competition_results
  USING (app_is_admin()) WITH CHECK (app_is_admin());

-- Correção: o autor lê a sua, o admin lê e resolve todas.
ALTER TABLE result_corrections ENABLE ROW LEVEL SECURITY;
CREATE POLICY result_corrections_own ON result_corrections FOR SELECT
  USING (requested_by = app_user_id() OR app_is_admin());
CREATE POLICY result_corrections_create ON result_corrections FOR INSERT
  WITH CHECK (requested_by = app_user_id());
CREATE POLICY result_corrections_admin ON result_corrections FOR UPDATE
  USING (app_is_admin()) WITH CHECK (app_is_admin());

-- Claim: membros da equipe leem a da própria equipe; admin lê e resolve todas.
ALTER TABLE community_claims ENABLE ROW LEVEL SECURITY;
CREATE POLICY community_claims_visible ON community_claims FOR SELECT
  USING (team_id IN (SELECT user_team_ids(app_user_id())) OR app_is_admin());
CREATE POLICY community_claims_create ON community_claims FOR INSERT
  WITH CHECK (team_id IN (SELECT user_team_ids(app_user_id())));
CREATE POLICY community_claims_admin ON community_claims FOR UPDATE
  USING (app_is_admin()) WITH CHECK (app_is_admin());

-- Down Migration
DROP POLICY IF EXISTS community_claims_admin ON community_claims;
DROP POLICY IF EXISTS community_claims_create ON community_claims;
DROP POLICY IF EXISTS community_claims_visible ON community_claims;
DROP POLICY IF EXISTS result_corrections_admin ON result_corrections;
DROP POLICY IF EXISTS result_corrections_create ON result_corrections;
DROP POLICY IF EXISTS result_corrections_own ON result_corrections;
DROP POLICY IF EXISTS competition_results_admin ON competition_results;
DROP POLICY IF EXISTS competition_results_read ON competition_results;
DROP POLICY IF EXISTS community_teams_admin ON community_teams;
DROP POLICY IF EXISTS community_teams_read ON community_teams;
DROP POLICY IF EXISTS competitions_admin ON competitions;
DROP POLICY IF EXISTS competitions_read ON competitions;

DROP FUNCTION IF EXISTS community_benchmark(uuid, text), community_cohorts();
DROP TABLE IF EXISTS community_claims, result_corrections, competition_results,
  community_teams, competitions CASCADE;
