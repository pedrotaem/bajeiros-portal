-- Up Migration
-- DF-13 — Evolução da equipe: evidências, declarações, níveis, fila de passos e temporada.
-- Contratos: contracts/evolution-evidence.odcs.yaml, evolution-step.odcs.yaml,
-- team-season.odcs.yaml (ADR-006 — schema e contrato no mesmo PR).
--
-- Princípio do ADR-010: o que é crítico é computado no servidor. `evolution_evidence`
-- é append-only por GRANT (como audit_events e cage_snapshots) — nem a app pode
-- reescrever o passado; `evolution_levels` guarda só o estado vigente, e o histórico
-- de mudança de nível vive como evidência `level.changed`.

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
CREATE INDEX evolution_evidence_team ON evolution_evidence (team_id, created_at DESC);
CREATE INDEX evolution_evidence_team_kind ON evolution_evidence (team_id, kind, created_at DESC);

-- Estado vigente da declaração; o histórico (quem declarou/revogou e quando) fica
-- em audit_events — a tabela não é o diário (DF-13 §6).
CREATE TABLE evolution_declarations (
  team_id      uuid NOT NULL REFERENCES teams (id) ON DELETE CASCADE,
  criterion_id text NOT NULL,
  note         text CHECK (char_length(note) <= 500),
  link_kind    text CHECK (link_kind IN ('decision', 'guide', 'project', 'url')),
  link_ref     text CHECK (char_length(link_ref) <= 500),
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

-- UNIQUE (team_id, criterion_id) torna a geração da fila idempotente (P-3.1).
-- criterion_id NULL nos passos manuais: no Postgres NULLs são distintos, então
-- vários passos manuais convivem sem truque.
CREATE TABLE evolution_steps (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id       uuid NOT NULL REFERENCES teams (id) ON DELETE CASCADE,
  title         text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 140),
  area          text,
  origin        text NOT NULL CHECK (origin IN ('criterion', 'manual', 'meta')),
  criterion_id  text,
  link_ref      text CHECK (char_length(link_ref) <= 500),
  owner_user_id uuid REFERENCES users (id) ON DELETE SET NULL,
  position      integer NOT NULL DEFAULT 0,
  status        text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'dismissed')),
  created_by    uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  done_by       uuid REFERENCES users (id) ON DELETE SET NULL,
  done_at       timestamptz,
  UNIQUE (team_id, criterion_id)
);
CREATE INDEX evolution_steps_team ON evolution_steps (team_id, status, position);

CREATE TABLE team_season (
  team_id           uuid PRIMARY KEY REFERENCES teams (id) ON DELETE CASCADE,
  label             text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 20),
  season_project_id uuid REFERENCES projects (id) ON DELETE SET NULL,
  milestones        jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{title, date}] ≤ 12
  competition_ids   jsonb NOT NULL DEFAULT '[]'::jsonb,  -- refs DF-15
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER team_season_touch BEFORE UPDATE ON team_season
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Equipes com evolução ativa (≥ 1 evidência em 90 dias) — alvo do recálculo diário
-- (RF-2.3: critérios com janela temporal expiram sem evidência nova) e do piso de
-- coorte do benchmark (RF-7.2). SECURITY DEFINER porque roda para TODAS as equipes.
CREATE FUNCTION evolution_active_teams(p_days integer DEFAULT 90) RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$
  SELECT DISTINCT team_id FROM evolution_evidence
  WHERE created_at > now() - make_interval(days => p_days)
$$;

-- Benchmark de maturidade (RF-7.1): medianas por área e da média da equipe, sobre
-- as equipes com evolução ativa. SECURITY DEFINER porque cruza equipes — mas devolve
-- SÓ agregado: não existe (nem para admin, na UI de produto) listagem de maturidade
-- alheia (RF-7.3). O piso de 8 equipes é aplicado na app, com o total devolvido aqui.
CREATE FUNCTION evolution_benchmark(p_days integer DEFAULT 90)
RETURNS TABLE (b_area text, b_median numeric, b_teams integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$
  WITH active AS (SELECT evolution_active_teams(p_days) AS team_id),
       lv AS (SELECT l.team_id, l.area, l.level
              FROM evolution_levels l JOIN active a ON a.team_id = l.team_id)
  SELECT area,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY level)::numeric,
         count(DISTINCT team_id)::int
  FROM lv GROUP BY area
  UNION ALL
  SELECT '__media',
         percentile_cont(0.5) WITHIN GROUP (ORDER BY avg_level)::numeric,
         count(*)::int
  FROM (SELECT team_id, avg(level) AS avg_level FROM lv GROUP BY team_id) t
$$;

GRANT SELECT, INSERT ON evolution_evidence TO bajeiros_app;  -- append-only por design
GRANT SELECT, INSERT, UPDATE, DELETE ON evolution_declarations, evolution_steps TO bajeiros_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON evolution_levels, team_season TO bajeiros_app;
GRANT EXECUTE ON FUNCTION evolution_active_teams(integer), evolution_benchmark(integer)
  TO bajeiros_app;

-- ---------- RLS (isolamento; RBAC fino continua na policy layer da app) ----------

ALTER TABLE evolution_evidence ENABLE ROW LEVEL SECURITY;
CREATE POLICY evolution_evidence_member ON evolution_evidence
  USING (team_id IN (SELECT user_team_ids(app_user_id())))
  WITH CHECK (team_id IN (SELECT user_team_ids(app_user_id())));
CREATE POLICY evolution_evidence_admin_read ON evolution_evidence FOR SELECT
  USING (app_is_admin());
-- o recálculo diário roda como admin do portal e precisa gravar `level.changed`
CREATE POLICY evolution_evidence_admin_write ON evolution_evidence FOR INSERT
  WITH CHECK (app_is_admin());

ALTER TABLE evolution_declarations ENABLE ROW LEVEL SECURITY;
CREATE POLICY evolution_declarations_member ON evolution_declarations
  USING (team_id IN (SELECT user_team_ids(app_user_id())))
  WITH CHECK (team_id IN (SELECT user_team_ids(app_user_id())));
CREATE POLICY evolution_declarations_admin_read ON evolution_declarations FOR SELECT
  USING (app_is_admin());

-- Níveis: o admin do portal ESCREVE (recálculo diário e republicação de catálogo
-- rodam fora de qualquer equipe); o produto nunca lista maturidade alheia (RF-7.3).
ALTER TABLE evolution_levels ENABLE ROW LEVEL SECURITY;
CREATE POLICY evolution_levels_member ON evolution_levels
  USING (team_id IN (SELECT user_team_ids(app_user_id())))
  WITH CHECK (team_id IN (SELECT user_team_ids(app_user_id())));
CREATE POLICY evolution_levels_admin ON evolution_levels
  USING (app_is_admin()) WITH CHECK (app_is_admin());

ALTER TABLE evolution_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY evolution_steps_member ON evolution_steps
  USING (team_id IN (SELECT user_team_ids(app_user_id())))
  WITH CHECK (team_id IN (SELECT user_team_ids(app_user_id())));
CREATE POLICY evolution_steps_admin ON evolution_steps
  USING (app_is_admin()) WITH CHECK (app_is_admin());

ALTER TABLE team_season ENABLE ROW LEVEL SECURITY;
CREATE POLICY team_season_member ON team_season
  USING (team_id IN (SELECT user_team_ids(app_user_id())))
  WITH CHECK (team_id IN (SELECT user_team_ids(app_user_id())));
CREATE POLICY team_season_admin_read ON team_season FOR SELECT USING (app_is_admin());

-- Down Migration
DROP POLICY IF EXISTS team_season_admin_read ON team_season;
DROP POLICY IF EXISTS team_season_member ON team_season;
DROP POLICY IF EXISTS evolution_steps_admin ON evolution_steps;
DROP POLICY IF EXISTS evolution_steps_member ON evolution_steps;
DROP POLICY IF EXISTS evolution_levels_admin ON evolution_levels;
DROP POLICY IF EXISTS evolution_levels_member ON evolution_levels;
DROP POLICY IF EXISTS evolution_declarations_admin_read ON evolution_declarations;
DROP POLICY IF EXISTS evolution_declarations_member ON evolution_declarations;
DROP POLICY IF EXISTS evolution_evidence_admin_write ON evolution_evidence;
DROP POLICY IF EXISTS evolution_evidence_admin_read ON evolution_evidence;
DROP POLICY IF EXISTS evolution_evidence_member ON evolution_evidence;

DROP FUNCTION IF EXISTS evolution_benchmark(integer), evolution_active_teams(integer);
DROP TABLE IF EXISTS team_season, evolution_steps, evolution_levels,
  evolution_declarations, evolution_evidence CASCADE;
