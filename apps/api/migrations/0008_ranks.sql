-- Up Migration
-- DF-18 — Patentes do protótipo (opt-in, estado com carência, histórico e vitrine),
-- mais as duas colunas que o DF-19 acrescenta à declaração (validade por temporada e
-- divergência). A aferição do DF-20 entra no 0010, depois da ficha do 0009: a
-- mediana de massa por classe depende de `project_fields`.
-- Contrato: contracts/team-rank.odcs.yaml (ADR-006 — schema e contrato no mesmo PR).
--
-- O 0008 estava RESERVADO a esta feature desde o 0009 (ficha do protótipo), que
-- entrou antes por outro PR. A ordem de aplicação é lexicográfica: em banco novo o
-- 0008 roda antes do 0009; em banco de desenvolvimento que já aplicou o 0009, o
-- node-pg-migrate reclama de ordem — apagar o `.dev/pgdata` local resolve, e nenhum
-- ambiente compartilhado passou do 0007.
--
-- Três decisões da spec que este arquivo executa:
--
--  1. **A patente é DERIVADA** (RF-1.3): `team_rank_state` NÃO é um placar paralelo,
--     é o materializado que a CARÊNCIA exige. Some o modelo de maturidade e a patente
--     some junto — é o que garante que ela não pode ser farmada por fora.
--  2. **Nada é apagado ao desativar** (RF-2.5): declarações, evidências e histórico
--     ficam dormentes e voltam intactos na reativação. Por isso `evolution_optin`
--     guarda um booleano, e não se apaga a linha.
--  3. **A maior patente alcançada nunca cai** (§3.5): `team_rank_history` é
--     append-only por GRANT, como `audit_events` — é a marca que sobrevive à
--     formatura da turma.

-- ---------- opt-in (E2) ----------

-- Medir sem pedir transforma ferramenta em auditoria — o risco nº 1 do ADR-010.
-- `notice_version` guarda QUAL texto foi aceito: mudar o que a avaliação lê exige
-- pedir de novo, e sem esta coluna não haveria como saber quem aceitou o quê.
CREATE TABLE evolution_optin (
  team_id        uuid PRIMARY KEY REFERENCES teams (id) ON DELETE CASCADE,
  enabled        boolean     NOT NULL DEFAULT true,
  notice_version text        NOT NULL,
  enabled_by     uuid REFERENCES users (id) ON DELETE SET NULL,
  enabled_at     timestamptz NOT NULL DEFAULT now(),
  disabled_by    uuid REFERENCES users (id) ON DELETE SET NULL,
  disabled_at    timestamptz
);

-- ---------- estado vigente + carência (E4) ----------

-- `broken_since` é a única razão de esta tabela existir: a queda espera 30 dias
-- (§3.5) e sem carimbo não há como saber quando a trava rompeu. `broken_target` é a
-- patente para onde ela cairia — some quando a equipe conserta antes do prazo.
CREATE TABLE team_rank_state (
  team_id         uuid PRIMARY KEY REFERENCES teams (id) ON DELETE CASCADE,
  rank            integer CHECK (rank BETWEEN 1 AND 8),
  season_label    text,
  broken_since    timestamptz,
  broken_target   integer CHECK (broken_target BETWEEN 1 AND 8),
  catalog_version text NOT NULL,
  computed_at     timestamptz NOT NULL DEFAULT now()
);

-- Append-only: a maior patente alcançada sai daqui (min(rank), porque 1 é a melhor)
-- e nunca é apagada por desativação, queda ou virada de temporada (RF-4.4).
CREATE TABLE team_rank_history (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id         uuid NOT NULL REFERENCES teams (id) ON DELETE CASCADE,
  rank            integer NOT NULL CHECK (rank BETWEEN 1 AND 8),
  previous_rank   integer CHECK (previous_rank BETWEEN 1 AND 8),
  season_label    text,
  project_id      uuid REFERENCES projects (id) ON DELETE SET NULL,
  reason          text NOT NULL
                  CHECK (reason IN ('promocao', 'queda', 'catalogo', 'reativacao')),
  catalog_version text NOT NULL,
  changed_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX team_rank_history_team ON team_rank_history (team_id, changed_at DESC);

-- RF-5.1 — o aviso de promoção é POR MEMBRO: quem já viu não vê de novo, e silenciar
-- para si não silencia para os outros (AC-DF18.10).
CREATE TABLE team_rank_seen (
  team_id  uuid NOT NULL REFERENCES teams (id) ON DELETE CASCADE,
  user_id  uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  rank     integer NOT NULL CHECK (rank BETWEEN 1 AND 8),
  seen_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, user_id)
);

-- ---------- vitrine (E6): privada por padrão, sempre ----------

ALTER TABLE teams
  ADD COLUMN rank_public         boolean NOT NULL DEFAULT false,
  ADD COLUMN rank_history_public boolean NOT NULL DEFAULT false;

-- ---------- o que o DF-19 acrescenta à declaração ----------

-- season_label: RF-4.4 — critério sazonal vale enquanto o rótulo bater com o da
--   temporada vigente. NULL é declaração anterior a esta regra e NÃO expira:
--   expirar retroativamente seria punir a equipe por uma mudança de catálogo.
-- divergent: RF-1.3 — a equipe respondeu "sim" onde o portal mede "não". Na v1 não
--   muda o nível; é, de graça, o conjunto de divergências que calibra a aferição
--   do DF-20 antes de ela existir.
ALTER TABLE evolution_declarations
  ADD COLUMN season_label text,
  ADD COLUMN divergent    boolean NOT NULL DEFAULT false;

-- ---------- funções ----------

/*
 * Vitrine do perfil público (RF-6.2). SECURITY DEFINER porque o perfil da Comunidade
 * é lido por quem NÃO é da equipe — e devolve SÓ emblema, número e temporada, mais a
 * maior patente alcançada. Níveis por área, critérios, declarações e fila nunca são
 * publicáveis, e não existe (nem é pendência) listagem ordenada por patente (RF-6.3).
 * Com `rank_public = false` todas as colunas voltam NULL: o consentimento é a porta.
 */
CREATE FUNCTION team_rank_showcase(p_team_id uuid)
RETURNS TABLE (r_rank integer, r_season text, r_best integer, r_history_public boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$
  SELECT CASE WHEN t.rank_public THEN s.rank END,
         CASE WHEN t.rank_public THEN s.season_label END,
         CASE WHEN t.rank_public
              THEN (SELECT min(h.rank) FROM team_rank_history h WHERE h.team_id = t.id) END,
         t.rank_public AND t.rank_history_public
  FROM teams t LEFT JOIN team_rank_state s ON s.team_id = t.id
  WHERE t.id = p_team_id
$$;

GRANT SELECT, INSERT, UPDATE ON evolution_optin TO bajeiros_app;
GRANT SELECT, INSERT, UPDATE ON team_rank_state TO bajeiros_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON team_rank_seen TO bajeiros_app;
GRANT SELECT, INSERT ON team_rank_history TO bajeiros_app;  -- append-only por design
GRANT EXECUTE ON FUNCTION team_rank_showcase(uuid) TO bajeiros_app;

-- ---------- RLS (isolamento; RBAC fino continua na policy layer da app) ----------

ALTER TABLE evolution_optin ENABLE ROW LEVEL SECURITY;
CREATE POLICY evolution_optin_member ON evolution_optin
  USING (team_id IN (SELECT user_team_ids(app_user_id())))
  WITH CHECK (team_id IN (SELECT user_team_ids(app_user_id())));
CREATE POLICY evolution_optin_admin_read ON evolution_optin FOR SELECT USING (app_is_admin());

-- Estado: o admin do portal ESCREVE, porque o recálculo diário (que resolve a
-- carência — RF-4.5) roda fora de qualquer equipe.
ALTER TABLE team_rank_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY team_rank_state_member ON team_rank_state
  USING (team_id IN (SELECT user_team_ids(app_user_id())))
  WITH CHECK (team_id IN (SELECT user_team_ids(app_user_id())));
CREATE POLICY team_rank_state_admin ON team_rank_state
  USING (app_is_admin()) WITH CHECK (app_is_admin());

ALTER TABLE team_rank_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY team_rank_history_member ON team_rank_history
  USING (team_id IN (SELECT user_team_ids(app_user_id())))
  WITH CHECK (team_id IN (SELECT user_team_ids(app_user_id())));
CREATE POLICY team_rank_history_admin ON team_rank_history
  USING (app_is_admin()) WITH CHECK (app_is_admin());

-- Cada pessoa marca o SEU aviso como visto; ninguém silencia o dos outros.
ALTER TABLE team_rank_seen ENABLE ROW LEVEL SECURITY;
CREATE POLICY team_rank_seen_own ON team_rank_seen
  USING (user_id = app_user_id() AND team_id IN (SELECT user_team_ids(app_user_id())))
  WITH CHECK (user_id = app_user_id() AND team_id IN (SELECT user_team_ids(app_user_id())));

-- Down Migration
DROP POLICY IF EXISTS team_rank_seen_own ON team_rank_seen;
DROP POLICY IF EXISTS team_rank_history_admin ON team_rank_history;
DROP POLICY IF EXISTS team_rank_history_member ON team_rank_history;
DROP POLICY IF EXISTS team_rank_state_admin ON team_rank_state;
DROP POLICY IF EXISTS team_rank_state_member ON team_rank_state;
DROP POLICY IF EXISTS evolution_optin_admin_read ON evolution_optin;
DROP POLICY IF EXISTS evolution_optin_member ON evolution_optin;

DROP FUNCTION IF EXISTS team_rank_showcase(uuid);

ALTER TABLE evolution_declarations
  DROP COLUMN IF EXISTS divergent,
  DROP COLUMN IF EXISTS season_label;

ALTER TABLE teams
  DROP COLUMN IF EXISTS rank_history_public,
  DROP COLUMN IF EXISTS rank_public;

DROP TABLE IF EXISTS team_rank_seen, team_rank_history, team_rank_state,
  evolution_optin CASCADE;
