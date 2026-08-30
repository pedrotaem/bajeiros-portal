-- Up Migration
-- DF-14 — Conhecimento da equipe: diário de decisões, guias (incluindo a trilha de
-- integração) e kits de passagem. Contratos: contracts/team-decision.odcs.yaml,
-- team-guide.odcs.yaml, team-handover-kit.odcs.yaml (ADR-006).
--
-- Ataca o problema nº 1 da pesquisa (rotatividade): o conteúdo é DA EQUIPE. A saída
-- da pessoa — e até a exclusão da conta — anonimiza a autoria (SET NULL / snapshot
-- de nome no kit) e o texto permanece. Base legal em revisão jurídica (DF-14 §8.3).
--
-- Soft delete (`deleted_at`) em decisões e guias: o diário é memória, não mural.
-- As policies de SELECT filtram o excluído; a exclusão é da capitania e auditada.

CREATE TABLE team_decisions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id       uuid NOT NULL REFERENCES teams (id) ON DELETE CASCADE,
  seq           integer NOT NULL,                    -- numeração por equipe ("nº 96")
  title         text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  area          text NOT NULL,
  why           text NOT NULL CHECK (char_length(why) BETWEEN 1 AND 2000),
  links         jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{kind, ref, label}] ≤ 8
  supersedes_id uuid REFERENCES team_decisions (id) ON DELETE SET NULL,
  author_id     uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz,
  deleted_at    timestamptz,
  UNIQUE (team_id, seq)
);
CREATE INDEX team_decisions_team ON team_decisions (team_id, created_at DESC);

CREATE TABLE team_guides (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id    uuid NOT NULL REFERENCES teams (id) ON DELETE CASCADE,
  kind       text NOT NULL DEFAULT 'guia' CHECK (kind IN ('guia', 'trilha', 'checklist')),
  title      text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  body_md    text NOT NULL CHECK (char_length(body_md) <= 20000),
  tags       jsonb NOT NULL DEFAULT '[]'::jsonb,
  owner_id   uuid REFERENCES users (id) ON DELETE SET NULL,
  author_id  uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX team_guides_team ON team_guides (team_id, updated_at DESC);
-- no máximo UMA trilha de integração viva por equipe (DF-14 RF-2.3)
CREATE UNIQUE INDEX team_guides_one_trail ON team_guides (team_id)
  WHERE kind = 'trilha' AND deleted_at IS NULL;

CREATE TABLE guide_completions (
  guide_id     uuid NOT NULL REFERENCES team_guides (id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  completed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (guide_id, user_id)
);

-- `member_name` é SNAPSHOT: o kit sobrevive à saída do membro e à exclusão da conta
-- (RF-3.5). `due_date` é o registro da saída anunciada — não existe outro cadastro
-- de formaturas no portal (RF-3.1).
CREATE TABLE team_handover_kits (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id        uuid NOT NULL REFERENCES teams (id) ON DELETE CASCADE,
  member_id      uuid REFERENCES users (id) ON DELETE SET NULL,
  member_name    text NOT NULL CHECK (char_length(member_name) BETWEEN 1 AND 120),
  position_label text CHECK (char_length(position_label) <= 120),
  due_date       date,
  checklist      jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{id, label, done, note?}]
  status         text NOT NULL DEFAULT 'aberto'
                 CHECK (status IN ('aberto', 'em_andamento', 'concluido')),
  created_by     uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  completed_at   timestamptz
);
CREATE INDEX team_handover_kits_team ON team_handover_kits (team_id, status, due_date);

CREATE TRIGGER team_guides_touch BEFORE UPDATE ON team_guides
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

GRANT SELECT, INSERT, UPDATE ON team_decisions, team_guides, team_handover_kits
  TO bajeiros_app;
GRANT SELECT, INSERT, DELETE ON guide_completions TO bajeiros_app;
-- DELETE de decisão/guia não é concedido: exclusão é soft (UPDATE deleted_at) por
-- design — o que a equipe aprendeu não some do banco por acidente de rota.

-- ---------- RLS (isolamento; RBAC fino continua na policy layer da app) ----------

ALTER TABLE team_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY team_decisions_member ON team_decisions
  USING (team_id IN (SELECT user_team_ids(app_user_id())))
  WITH CHECK (team_id IN (SELECT user_team_ids(app_user_id())));
CREATE POLICY team_decisions_admin_read ON team_decisions FOR SELECT USING (app_is_admin());

ALTER TABLE team_guides ENABLE ROW LEVEL SECURITY;
CREATE POLICY team_guides_member ON team_guides
  USING (team_id IN (SELECT user_team_ids(app_user_id())))
  WITH CHECK (team_id IN (SELECT user_team_ids(app_user_id())));
CREATE POLICY team_guides_admin_read ON team_guides FOR SELECT USING (app_is_admin());

-- Conclusão de trilha é do próprio: ninguém marca a trilha de outra pessoa.
ALTER TABLE guide_completions ENABLE ROW LEVEL SECURITY;
CREATE POLICY guide_completions_visible ON guide_completions FOR SELECT
  USING (guide_id IN (SELECT id FROM team_guides));
CREATE POLICY guide_completions_self ON guide_completions FOR INSERT
  WITH CHECK (user_id = app_user_id() AND guide_id IN (SELECT id FROM team_guides));
CREATE POLICY guide_completions_self_delete ON guide_completions FOR DELETE
  USING (user_id = app_user_id());

ALTER TABLE team_handover_kits ENABLE ROW LEVEL SECURITY;
CREATE POLICY team_handover_kits_member ON team_handover_kits
  USING (team_id IN (SELECT user_team_ids(app_user_id())))
  WITH CHECK (team_id IN (SELECT user_team_ids(app_user_id())));
CREATE POLICY team_handover_kits_admin_read ON team_handover_kits FOR SELECT
  USING (app_is_admin());

-- Down Migration
DROP POLICY IF EXISTS team_handover_kits_admin_read ON team_handover_kits;
DROP POLICY IF EXISTS team_handover_kits_member ON team_handover_kits;
DROP POLICY IF EXISTS guide_completions_self_delete ON guide_completions;
DROP POLICY IF EXISTS guide_completions_self ON guide_completions;
DROP POLICY IF EXISTS guide_completions_visible ON guide_completions;
DROP POLICY IF EXISTS team_guides_admin_read ON team_guides;
DROP POLICY IF EXISTS team_guides_member ON team_guides;
DROP POLICY IF EXISTS team_decisions_admin_read ON team_decisions;
DROP POLICY IF EXISTS team_decisions_member ON team_decisions;

DROP TABLE IF EXISTS team_handover_kits, guide_completions, team_guides,
  team_decisions CASCADE;
