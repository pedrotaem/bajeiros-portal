-- Up Migration
-- DF-9 — Administração: flag admin + último login, log de acesso (páginas/recursos)
-- e log do assistente de IA (pergunta/resposta/tokens). Contratos:
-- contracts/access-log.odcs.yaml, contracts/assistant-log.odcs.yaml, user 1.1.0.
-- Promoção a admin é manual (conexão owner): UPDATE users SET is_admin=true WHERE email='…';

ALTER TABLE users ADD COLUMN is_admin boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN last_login_at timestamptz;

CREATE TABLE access_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users (id),
  method      text NOT NULL, -- GET/POST/… ou 'PAGE' (pageview da SPA)
  route       text NOT NULL, -- padrão da rota (ex.: /api/v1/projects/:id) ou nome da página
  path        text NOT NULL, -- caminho real acessado
  status      integer,
  duration_ms integer,
  ip_address  text,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX access_log_user_time ON access_log (user_id, occurred_at DESC);
CREATE INDEX access_log_time ON access_log (occurred_at DESC);

CREATE TABLE assistant_log (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES users (id),
  question          text NOT NULL,
  answer            text,
  status            text NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'error', 'refused')),
  model             text,
  corpus_version    text,
  input_tokens      integer,
  output_tokens     integer,
  cache_read_tokens integer,
  duration_ms       integer,
  occurred_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX assistant_log_user_time ON assistant_log (user_id, occurred_at DESC);
CREATE INDEX assistant_log_time ON assistant_log (occurred_at DESC);

-- admin? (SECURITY DEFINER: consulta users fora da RLS "só a própria linha")
CREATE FUNCTION app_is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$
  SELECT COALESCE(
    (SELECT is_admin FROM users WHERE id = app_user_id() AND deleted_at IS NULL),
    false
  )
$$;

GRANT EXECUTE ON FUNCTION app_is_admin() TO bajeiros_app;
-- append-only por design (como consents/audit): sem UPDATE/DELETE
GRANT SELECT, INSERT ON access_log, assistant_log TO bajeiros_app;

-- ---------- RLS ----------

ALTER TABLE access_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY access_log_read ON access_log FOR SELECT
  USING (user_id = app_user_id() OR app_is_admin());
CREATE POLICY access_log_insert ON access_log FOR INSERT
  WITH CHECK (user_id = app_user_id());

ALTER TABLE assistant_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY assistant_log_read ON assistant_log FOR SELECT
  USING (user_id = app_user_id() OR app_is_admin());
CREATE POLICY assistant_log_insert ON assistant_log FOR INSERT
  WITH CHECK (user_id = app_user_id());

-- Admin enxerga tudo (SELECT apenas — escrita continua pelas policies existentes)
CREATE POLICY users_admin_read ON users FOR SELECT USING (app_is_admin());
CREATE POLICY teams_admin_read ON teams FOR SELECT USING (app_is_admin());
CREATE POLICY team_members_admin_read ON team_members FOR SELECT USING (app_is_admin());
CREATE POLICY projects_admin_read ON projects FOR SELECT USING (app_is_admin());
CREATE POLICY audit_admin_read ON audit_events FOR SELECT USING (app_is_admin());

-- Down Migration
DROP POLICY IF EXISTS users_admin_read ON users;
DROP POLICY IF EXISTS teams_admin_read ON teams;
DROP POLICY IF EXISTS team_members_admin_read ON team_members;
DROP POLICY IF EXISTS projects_admin_read ON projects;
DROP POLICY IF EXISTS audit_admin_read ON audit_events;
DROP TABLE IF EXISTS assistant_log, access_log CASCADE;
DROP FUNCTION IF EXISTS app_is_admin() CASCADE;
ALTER TABLE users DROP COLUMN IF EXISTS is_admin, DROP COLUMN IF EXISTS last_login_at;
