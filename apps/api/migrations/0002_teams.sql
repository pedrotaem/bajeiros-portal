-- Up Migration
-- Fase 14 — Equipes e convites. Tabelas já existem (0001); aqui entram:
-- 1) policy de UPDATE em team_members (troca de papel — RBAC fino fica na app);
-- 2) helpers SECURITY DEFINER que a RLS impede de fazer via query direta:
--    - team_member_profiles: nomes/e-mails dos colegas (users tem RLS "só a própria linha");
--    - accept_team_invite: quem aceita ainda NÃO é membro, então não passa nas
--      policies de SELECT em team_invites nem de INSERT em team_members.

CREATE POLICY team_members_update ON team_members FOR UPDATE
  USING (team_id IN (SELECT user_team_ids(app_user_id())))
  WITH CHECK (team_id IN (SELECT user_team_ids(app_user_id())));

-- Perfis dos membros de uma equipe — só devolve linhas se o requisitante é membro.
CREATE FUNCTION team_member_profiles(tid uuid)
RETURNS TABLE (user_id uuid, display_name text, email text, role text, joined_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$
  SELECT u.id, u.display_name, u.email, m.role, m.joined_at
  FROM team_members m
  JOIN users u ON u.id = m.user_id
  WHERE m.team_id = tid
    AND tid IN (SELECT user_team_ids(app_user_id()))
  ORDER BY m.joined_at
$$;

-- Aceite de convite: valida hash + expiração + vínculo do e-mail (o convite só vale
-- p/ a conta com o e-mail convidado), insere como member e consome o convite.
-- Retorna o team_id, ou NULL p/ QUALQUER falha (resposta uniforme — sem enumeração, C9).
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

GRANT EXECUTE ON FUNCTION team_member_profiles(uuid), accept_team_invite(text) TO bajeiros_app;

-- Down Migration
DROP FUNCTION IF EXISTS accept_team_invite(text), team_member_profiles(uuid);
DROP POLICY IF EXISTS team_members_update ON team_members;
