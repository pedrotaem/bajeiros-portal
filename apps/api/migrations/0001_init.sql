-- Up Migration
-- Schema inicial — espelha os contratos ODCS em contracts/*.odcs.yaml (v1.0.0).
-- Mudança aqui exige mudança de contrato no mesmo PR (ADR-006).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------- tabelas ----------

-- id = sub do IdP (Cognito/dev issuer emitem uuid)
CREATE TABLE users (
  id           uuid PRIMARY KEY,
  email        text NOT NULL UNIQUE,
  display_name text NOT NULL,
  university   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz
);

CREATE TABLE consents (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users (id),
  purpose      text NOT NULL,
  term_version text NOT NULL,
  granted      boolean NOT NULL,
  ip_address   text NOT NULL,
  occurred_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE teams (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  university text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE team_members (
  team_id   uuid NOT NULL REFERENCES teams (id),
  user_id   uuid NOT NULL REFERENCES users (id),
  role      text NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, user_id)
);

CREATE TABLE team_invites (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id    uuid NOT NULL REFERENCES teams (id),
  email      text NOT NULL,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL
);

CREATE TABLE projects (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid REFERENCES users (id),
  owner_team_id uuid REFERENCES teams (id),
  name          text NOT NULL,
  description   text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(owner_user_id, owner_team_id) = 1)
);

CREATE TABLE cage_snapshots (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  seq              integer NOT NULL,
  cage_json        jsonb NOT NULL,
  rules_result     jsonb,
  saved_by_user_id uuid NOT NULL REFERENCES users (id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, seq)
);

CREATE TABLE subscriptions (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id            uuid REFERENCES users (id),
  owner_team_id            uuid REFERENCES teams (id),
  plan                     text NOT NULL,
  status                   text NOT NULL,
  provider_customer_id     text,
  provider_subscription_id text,
  current_period_end       timestamptz,
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(owner_user_id, owner_team_id) = 1)
);

CREATE TABLE audit_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES users (id),
  action        text NOT NULL,
  resource_type text NOT NULL,
  resource_id   text,
  ip_address    text,
  occurred_at   timestamptz NOT NULL DEFAULT now(),
  metadata      jsonb
);

-- ---------- helpers (SECURITY DEFINER: donos das tabelas, fora do RLS) ----------

CREATE FUNCTION app_user_id() RETURNS uuid
LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;

CREATE FUNCTION user_team_ids(uid uuid) RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT team_id FROM team_members WHERE user_id = uid $$;

CREATE FUNCTION team_has_members(tid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT EXISTS (SELECT 1 FROM team_members WHERE team_id = tid) $$;

CREATE FUNCTION touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS
$$ BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER projects_touch BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER subscriptions_touch BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ---------- role da aplicação (C9: LOGIN sem BYPASSRLS; tenant via SET LOCAL) ----------

DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'bajeiros_app') THEN
    CREATE ROLE bajeiros_app LOGIN PASSWORD 'bajeiros_app' NOBYPASSRLS;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO bajeiros_app;
GRANT SELECT, INSERT, UPDATE ON users, teams, projects, subscriptions TO bajeiros_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON team_members, team_invites TO bajeiros_app;
GRANT DELETE ON projects TO bajeiros_app;
-- append-only por design (consent/snapshot/audit): sem UPDATE/DELETE
GRANT SELECT, INSERT ON consents, cage_snapshots, audit_events TO bajeiros_app;
GRANT EXECUTE ON FUNCTION app_user_id(), user_team_ids(uuid), team_has_members(uuid) TO bajeiros_app;

-- ---------- RLS (isolamento = gate do M1; RBAC fino fica na policy layer da app) ----------

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY users_self ON users
  USING (id = app_user_id())
  WITH CHECK (id = app_user_id());

ALTER TABLE consents ENABLE ROW LEVEL SECURITY;
CREATE POLICY consents_self ON consents
  USING (user_id = app_user_id())
  WITH CHECK (user_id = app_user_id());

ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
CREATE POLICY teams_member_read ON teams FOR SELECT
  USING (id IN (SELECT user_team_ids(app_user_id())));
CREATE POLICY teams_insert ON teams FOR INSERT WITH CHECK (true);
CREATE POLICY teams_member_write ON teams FOR UPDATE
  USING (id IN (SELECT user_team_ids(app_user_id())));

ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY team_members_visible ON team_members FOR SELECT
  USING (user_id = app_user_id() OR team_id IN (SELECT user_team_ids(app_user_id())));
-- 1º membro: só o próprio usuário em time ainda vazio (fundador); depois, só quem já é membro
CREATE POLICY team_members_insert ON team_members FOR INSERT
  WITH CHECK (
    (user_id = app_user_id() AND NOT team_has_members(team_id))
    OR team_id IN (SELECT user_team_ids(app_user_id()))
  );
CREATE POLICY team_members_delete ON team_members FOR DELETE
  USING (user_id = app_user_id() OR team_id IN (SELECT user_team_ids(app_user_id())));

ALTER TABLE team_invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY team_invites_member ON team_invites
  USING (team_id IN (SELECT user_team_ids(app_user_id())))
  WITH CHECK (team_id IN (SELECT user_team_ids(app_user_id())));

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY projects_owner ON projects
  USING (
    owner_user_id = app_user_id()
    OR owner_team_id IN (SELECT user_team_ids(app_user_id()))
  )
  WITH CHECK (
    owner_user_id = app_user_id()
    OR owner_team_id IN (SELECT user_team_ids(app_user_id()))
  );

ALTER TABLE cage_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY snapshots_via_project ON cage_snapshots
  USING (project_id IN (SELECT id FROM projects))
  WITH CHECK (project_id IN (SELECT id FROM projects) AND saved_by_user_id = app_user_id());

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY subscriptions_owner ON subscriptions
  USING (
    owner_user_id = app_user_id()
    OR owner_team_id IN (SELECT user_team_ids(app_user_id()))
  )
  WITH CHECK (
    owner_user_id = app_user_id()
    OR owner_team_id IN (SELECT user_team_ids(app_user_id()))
  );

ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_self ON audit_events
  USING (actor_user_id = app_user_id())
  WITH CHECK (actor_user_id = app_user_id() OR actor_user_id IS NULL);

-- Down Migration
DROP TABLE IF EXISTS audit_events, subscriptions, cage_snapshots, projects,
  team_invites, team_members, teams, consents, users CASCADE;
DROP FUNCTION IF EXISTS app_user_id(), user_team_ids(uuid), team_has_members(uuid), touch_updated_at() CASCADE;
