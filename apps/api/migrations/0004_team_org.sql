-- Up Migration
-- DF-10 — Gestão de equipe: hierarquia de funções (organograma), confirmação de
-- entrada pela capitania e ciclo de vida do membro (trainee/efetivo).
-- Contrato: contracts/team.odcs.yaml 1.1.0 (ADR-006 — schema e contrato no mesmo PR).
--
-- Decisão central (spec §3): papel de acesso ≠ função organizacional.
--   - team_members.role continua 'owner'/'admin'/'member' — é o que a RLS e a
--     policy layer entendem; a UI rotula owner=capitão/capitã, admin=co-capitão.
--   - a função organizacional é OUTRA coisa: árvore customizável em team_positions,
--     com descrição de responsabilidades (prática nº 1 das equipes de elite).
-- Invariantes de capitania (1 capitão, ≤ 2 co-capitães) ficam na camada de app,
-- dentro da transação e com SELECT ... FOR UPDATE: equipes legadas com N owners
-- não podem ser rebaixadas por migração (spec §7, P-1.4).

CREATE TABLE team_positions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     uuid NOT NULL REFERENCES teams (id) ON DELETE CASCADE,
  parent_id   uuid REFERENCES team_positions (id) ON DELETE SET NULL,
  kind        text NOT NULL DEFAULT 'custom'
              CHECK (kind IN ('captain', 'cocaptain', 'lead', 'custom')),
  name        text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  description text CHECK (char_length(description) <= 280),
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX team_positions_team ON team_positions (team_id, sort_order);
-- capitania é nó único por equipe: a app impede excluir/mover, o índice impede duplicar
CREATE UNIQUE INDEX team_positions_captaincy ON team_positions (team_id, kind)
  WHERE kind IN ('captain', 'cocaptain');

-- Aceitar convite NÃO entra mais direto na equipe: cria solicitação que a
-- capitania confirma (spec RF-1.1). Expira em 30 dias (limpeza preguiçosa).
CREATE TABLE team_join_requests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id      uuid NOT NULL REFERENCES teams (id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES users (id),
  requested_at timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  UNIQUE (team_id, user_id)
);
CREATE INDEX team_join_requests_team ON team_join_requests (team_id, requested_at);

-- position_id: função no organograma (a app garante que é da MESMA equipe).
-- status: ciclo de vida do membro — trainee vira efetivo por decisão da capitania
-- (prática nº 3: programa de trainee estruturado).
ALTER TABLE team_members
  ADD COLUMN position_id uuid REFERENCES team_positions (id) ON DELETE SET NULL,
  ADD COLUMN status      text NOT NULL DEFAULT 'efetivo'
             CHECK (status IN ('trainee', 'efetivo'));

-- ---------- helpers SECURITY DEFINER (o que a RLS impede de fazer direto) ----------

-- Solicitações pendentes com nome/e-mail de quem pediu — users tem RLS "só a
-- própria linha", como em team_member_profiles. Só devolve p/ quem é membro.
CREATE FUNCTION team_join_request_profiles(tid uuid)
RETURNS TABLE (
  r_id uuid, r_user_id uuid, r_display_name text, r_email text,
  r_requested_at timestamptz, r_expires_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$
  SELECT r.id, u.id, u.display_name, u.email, r.requested_at, r.expires_at
  FROM team_join_requests r
  JOIN users u ON u.id = r.user_id
  WHERE r.team_id = tid
    AND r.expires_at > now()
    AND u.deleted_at IS NULL
    AND tid IN (SELECT user_team_ids(app_user_id()))
  ORDER BY r.requested_at
$$;

-- "Aguardando confirmação da capitania" p/ o próprio solicitante — ele ainda não
-- é membro, logo não enxerga teams pela RLS (spec §7, P-1.3).
CREATE FUNCTION my_join_requests()
RETURNS TABLE (
  r_id uuid, r_team_id uuid, r_team_name text,
  r_requested_at timestamptz, r_expires_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$
  SELECT r.id, t.id, t.name, r.requested_at, r.expires_at
  FROM team_join_requests r
  JOIN teams t ON t.id = r.team_id
  WHERE r.user_id = app_user_id()
    AND r.expires_at > now()
  ORDER BY r.requested_at
$$;

-- Organograma padrão das equipes de elite (spec RF-2.2): capitania + 6 subsistemas,
-- cada um com líder e um nó de membros. Idempotente: no-op se já houver funções.
-- SECURITY INVOKER de propósito — a RLS de team_positions é quem autoriza.
CREATE FUNCTION seed_default_positions(tid uuid) RETURNS integer
LANGUAGE plpgsql SET search_path = public AS
$$
DECLARE
  v_captain uuid;
  v_co      uuid;
  v_lead_id uuid;
  v_lead    record;
  v_n       integer := 2;
BEGIN
  IF EXISTS (SELECT 1 FROM team_positions p WHERE p.team_id = tid) THEN RETURN 0; END IF;

  INSERT INTO team_positions (team_id, parent_id, kind, name, description, sort_order)
  VALUES (tid, NULL, 'captain', 'Capitão/Capitã',
          'Representa a equipe, responde pelo projeto completo e dá a palavra final nas decisões.', 0)
  RETURNING id INTO v_captain;

  INSERT INTO team_positions (team_id, parent_id, kind, name, description, sort_order)
  VALUES (tid, v_captain, 'cocaptain', 'Co-capitão/Co-capitã',
          'Apoia a capitania, coordena os líderes de subsistema e substitui o capitão quando necessário.', 0)
  RETURNING id INTO v_co;

  FOR v_lead IN
    SELECT * FROM (VALUES
      ('Líder — Trem de Força', 'Motor, CVT, transmissão e acoplamento: desempenho, confiabilidade e integração com o chassi.', 'trem de força', 0),
      ('Líder — Estrutura e Design', 'Gaiola, ergonomia, CAD e conformidade com o regulamento B6; análise estrutural do chassi.', 'estrutura e design', 1),
      ('Líder — Financeiro e Marketing', 'Orçamento, captação de patrocínio, viabilidade econômica, marca e relacionamento com parceiros.', 'financeiro e marketing', 2),
      ('Líder — Suspensão e Direção', 'Geometria, dinâmica veicular, dirigibilidade e ensaios de suspensão e direção.', 'suspensão e direção', 3),
      ('Líder — Eletrônica', 'Aquisição de dados, telemetria, painel e chicote elétrico do protótipo.', 'eletrônica', 4),
      ('Líder — Freios', 'Projeto e dimensionamento do sistema de freio, ensaios e conformidade na prova de frenagem.', 'freios', 5)
    ) AS t(nome, descricao, area, ord)
  LOOP
    INSERT INTO team_positions (team_id, parent_id, kind, name, description, sort_order)
    VALUES (tid, v_co, 'lead', v_lead.nome, v_lead.descricao, v_lead.ord)
    RETURNING id INTO v_lead_id;

    INSERT INTO team_positions (team_id, parent_id, kind, name, description, sort_order)
    VALUES (tid, v_lead_id, 'custom', 'Membros',
            'Executam as atividades de ' || v_lead.area || ' sob orientação do líder.', 0);
    v_n := v_n + 2;
  END LOOP;

  RETURN v_n;
END
$$;

-- Aceite de convite (reescrito): valida hash + expiração + vínculo do e-mail e,
-- em vez de virar membro, registra solicitação p/ a capitania confirmar.
-- Resposta uniforme (0 linhas) p/ QUALQUER falha — sem enumeração (C9).
-- outcome: 'pending' (solicitação criada/renovada) | 'member' (já era membro).
DROP FUNCTION IF EXISTS accept_team_invite(text);

CREATE FUNCTION accept_team_invite(p_token_hash text)
RETURNS TABLE (r_team_id uuid, r_team_name text, r_outcome text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS
$$
DECLARE
  v_uid    uuid := app_user_id();
  v_email  text;
  v_invite team_invites%ROWTYPE;
  v_team   teams%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;
  SELECT u.email INTO v_email FROM users u WHERE u.id = v_uid AND u.deleted_at IS NULL;
  IF v_email IS NULL THEN RETURN; END IF;

  SELECT * INTO v_invite
  FROM team_invites i
  WHERE i.token_hash = p_token_hash
    AND i.expires_at > now()
    AND lower(i.email) = lower(v_email)
  FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT * INTO v_team FROM teams t WHERE t.id = v_invite.team_id;

  IF EXISTS (
    SELECT 1 FROM team_members m WHERE m.team_id = v_invite.team_id AND m.user_id = v_uid
  ) THEN
    DELETE FROM team_invites i WHERE i.id = v_invite.id;
    RETURN QUERY SELECT v_team.id, v_team.name, 'member'::text;
    RETURN;
  END IF;

  INSERT INTO team_join_requests AS j (team_id, user_id, expires_at)
  VALUES (v_invite.team_id, v_uid, now() + make_interval(days => 30))
  ON CONFLICT (team_id, user_id) DO UPDATE
    SET requested_at = now(), expires_at = now() + make_interval(days => 30);

  DELETE FROM team_invites i WHERE i.id = v_invite.id;
  RETURN QUERY SELECT v_team.id, v_team.name, 'pending'::text;
END
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON team_positions, team_join_requests TO bajeiros_app;
GRANT EXECUTE ON FUNCTION
  team_join_request_profiles(uuid), my_join_requests(),
  seed_default_positions(uuid), accept_team_invite(text) TO bajeiros_app;

-- ---------- RLS (isolamento; RBAC fino continua na policy layer da app) ----------

ALTER TABLE team_positions ENABLE ROW LEVEL SECURITY;
CREATE POLICY team_positions_member ON team_positions
  USING (team_id IN (SELECT user_team_ids(app_user_id())))
  WITH CHECK (team_id IN (SELECT user_team_ids(app_user_id())));
CREATE POLICY team_positions_admin_read ON team_positions FOR SELECT USING (app_is_admin());

-- INSERT sem policy de propósito: solicitação só nasce por accept_team_invite
-- (SECURITY DEFINER) — ninguém "pede para entrar" sem convite válido.
ALTER TABLE team_join_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY team_join_requests_visible ON team_join_requests FOR SELECT
  USING (user_id = app_user_id() OR team_id IN (SELECT user_team_ids(app_user_id())));
CREATE POLICY team_join_requests_delete ON team_join_requests FOR DELETE
  USING (user_id = app_user_id() OR team_id IN (SELECT user_team_ids(app_user_id())));
CREATE POLICY team_join_requests_admin_read ON team_join_requests FOR SELECT
  USING (app_is_admin());

-- Down Migration
DROP POLICY IF EXISTS team_join_requests_admin_read ON team_join_requests;
DROP POLICY IF EXISTS team_join_requests_delete ON team_join_requests;
DROP POLICY IF EXISTS team_join_requests_visible ON team_join_requests;
DROP POLICY IF EXISTS team_positions_admin_read ON team_positions;
DROP POLICY IF EXISTS team_positions_member ON team_positions;

DROP FUNCTION IF EXISTS accept_team_invite(text);

-- restaura a versão da 0002 (entrada direta como member)
CREATE FUNCTION accept_team_invite(p_token_hash text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS
$$
DECLARE
  v_uid    uuid := app_user_id();
  v_email  text;
  v_invite team_invites%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RETURN NULL; END IF;
  SELECT u.email INTO v_email FROM users u WHERE u.id = v_uid AND u.deleted_at IS NULL;
  IF v_email IS NULL THEN RETURN NULL; END IF;

  SELECT * INTO v_invite
  FROM team_invites i
  WHERE i.token_hash = p_token_hash
    AND i.expires_at > now()
    AND lower(i.email) = lower(v_email)
  FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;

  INSERT INTO team_members (team_id, user_id, role)
  VALUES (v_invite.team_id, v_uid, 'member')
  ON CONFLICT (team_id, user_id) DO NOTHING;

  DELETE FROM team_invites WHERE id = v_invite.id;
  RETURN v_invite.team_id;
END
$$;
GRANT EXECUTE ON FUNCTION accept_team_invite(text) TO bajeiros_app;

ALTER TABLE team_members DROP COLUMN IF EXISTS position_id, DROP COLUMN IF EXISTS status;
DROP TABLE IF EXISTS team_join_requests CASCADE;
DROP TABLE IF EXISTS team_positions CASCADE;
DROP FUNCTION IF EXISTS team_join_request_profiles(uuid), my_join_requests(), seed_default_positions(uuid);
