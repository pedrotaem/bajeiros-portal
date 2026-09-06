-- Up Migration
-- DF-33 — Calendário de competições: marcos (prazos, janelas, eventos, comunicados)
-- e documentos-fonte oficiais (informativos, páginas, regulamento), cada linha com
-- a URL de onde saiu e a data em que alguém do portal conferiu (`checked_at`).
-- Contratos: contracts/calendar.odcs.yaml (tabelas novas), competition.odcs.yaml
-- 1.1.0 (janela de inscrição + página oficial), team-season.odcs.yaml 1.1.0
-- (categoria de inscrição, competições de interesse, marco com origem) e
-- evolution-step.odcs.yaml 1.1.0 (origem `calendario` + `due_on`). ADR-006.
--
-- Leitura PÚBLICA de propósito (DF-33 §3.3): o calendário é informação pública sobre
-- fonte pública, e é o que o portal promete antes do cadastro (mesma lógica da
-- vitrine do DF-25). A rota pública roda sem `app.user_id` — as policies de SELECT
-- aqui são `USING (true)`. Escrita continua só do admin (DF-9), e a ingestão
-- automática NÃO existe: a fonte bloqueia cliente não-browser e a curadoria é
-- humana (§3.4).

-- Documento ou página oficial de onde um marco saiu. Compartilhado com o DF-34.
CREATE TABLE source_documents (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id uuid REFERENCES competitions (id) ON DELETE SET NULL, -- nulo: vale para todas
  kind           text NOT NULL CHECK (kind IN
                   ('informativo', 'pagina', 'regulamento', 'template', 'forum', 'canal', 'outro')),
  number         integer,                    -- "Informativo 09" → 9
  title          text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  url            text NOT NULL UNIQUE CHECK (char_length(url) <= 500),
  published_on   date,
  edition        text CHECK (char_length(edition) <= 40),  -- "emenda-07", "Ver27"
  supersedes_id  uuid REFERENCES source_documents (id) ON DELETE SET NULL,
  checked_at     timestamptz NOT NULL DEFAULT now(),
  created_by     uuid REFERENCES users (id) ON DELETE SET NULL
);
CREATE INDEX source_documents_competition ON source_documents (competition_id, kind, number);

CREATE TABLE competition_milestones (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id uuid NOT NULL REFERENCES competitions (id) ON DELETE CASCADE,
  kind           text NOT NULL CHECK (kind IN
                   ('inscricao', 'pagamento', 'pessoas', 'documento', 'logistica', 'evento', 'comunicado')),
  title          text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 140),
  summary        text CHECK (char_length(summary) <= 280),   -- paráfrase curada, nunca cópia
  starts_on      date,                       -- janela: início; prazo: nulo
  due_on         date NOT NULL,              -- prazo, fim da janela ou data do evento/comunicado
  applies_to     text[] NOT NULL DEFAULT '{}', -- {'novata','light','integral','promocional'}
  source_id      uuid REFERENCES source_documents (id) ON DELETE SET NULL,
  section_id     text CHECK (char_length(section_id) <= 40), -- seção do regulamento (DF-34)
  status         text NOT NULL DEFAULT 'previsto'
                 CHECK (status IN ('previsto', 'confirmado', 'cancelado')),
  checked_at     timestamptz NOT NULL DEFAULT now(),
  updated_by     uuid REFERENCES users (id) ON DELETE SET NULL,
  CHECK (starts_on IS NULL OR starts_on <= due_on),
  UNIQUE (competition_id, kind, title, due_on)
);
CREATE INDEX competition_milestones_due ON competition_milestones (competition_id, due_on);

-- A janela de inscrição é da competição, não um marco solto; `official_url` é a
-- página do evento (`source_url` já guarda a fonte dos RESULTADOS, DF-15).
ALTER TABLE competitions
  ADD COLUMN registration_opens_on  date,
  ADD COLUMN registration_closes_on date,
  ADD COLUMN official_url           text CHECK (char_length(official_url) <= 500),
  ADD COLUMN checked_at             timestamptz;

-- Recorte pessoal (DF-33 §4.4): categoria de inscrição e competições acompanhadas por
-- interesse. `competition_ids` (inscrita) já existia. `milestones` continua jsonb e
-- cada item ganha `kind` ('marco' | 'entrega') e `sourceMilestoneId` opcionais; o
-- teto sobe de 12 para 24 na validação da API (§10.8).
ALTER TABLE team_season
  ADD COLUMN registration_kind text
    CHECK (registration_kind IN ('novata', 'light', 'integral', 'promocional')),
  ADD COLUMN interest_competition_ids jsonb NOT NULL DEFAULT '[]'::jsonb;

-- "Transformar em passo" (FR-DF33.14): o passo nasce do calendário com a data do marco.
ALTER TABLE evolution_steps DROP CONSTRAINT evolution_steps_origin_check;
ALTER TABLE evolution_steps
  ADD CONSTRAINT evolution_steps_origin_check
    CHECK (origin IN ('criterion', 'manual', 'meta', 'calendario')),
  ADD COLUMN due_on date;

GRANT SELECT, INSERT, UPDATE, DELETE ON source_documents, competition_milestones TO bajeiros_app;

-- ---------- RLS ----------

-- Competições passam a ser públicas (antes: só autenticado). O acervo de resultados
-- e o registro das equipes continuam exigindo conta — só o calendário abre.
DROP POLICY competitions_read ON competitions;
CREATE POLICY competitions_read ON competitions FOR SELECT USING (true);

ALTER TABLE source_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY source_documents_read ON source_documents FOR SELECT USING (true);
CREATE POLICY source_documents_admin ON source_documents
  USING (app_is_admin()) WITH CHECK (app_is_admin());

ALTER TABLE competition_milestones ENABLE ROW LEVEL SECURITY;
CREATE POLICY competition_milestones_read ON competition_milestones FOR SELECT USING (true);
CREATE POLICY competition_milestones_admin ON competition_milestones
  USING (app_is_admin()) WITH CHECK (app_is_admin());

-- Down Migration
DROP POLICY IF EXISTS competition_milestones_admin ON competition_milestones;
DROP POLICY IF EXISTS competition_milestones_read ON competition_milestones;
DROP POLICY IF EXISTS source_documents_admin ON source_documents;
DROP POLICY IF EXISTS source_documents_read ON source_documents;
DROP POLICY IF EXISTS competitions_read ON competitions;
CREATE POLICY competitions_read ON competitions FOR SELECT USING (app_user_id() IS NOT NULL);

ALTER TABLE evolution_steps DROP COLUMN IF EXISTS due_on;
ALTER TABLE evolution_steps DROP CONSTRAINT IF EXISTS evolution_steps_origin_check;
ALTER TABLE evolution_steps
  ADD CONSTRAINT evolution_steps_origin_check CHECK (origin IN ('criterion', 'manual', 'meta'));
ALTER TABLE team_season
  DROP COLUMN IF EXISTS interest_competition_ids,
  DROP COLUMN IF EXISTS registration_kind;
ALTER TABLE competitions
  DROP COLUMN IF EXISTS checked_at,
  DROP COLUMN IF EXISTS official_url,
  DROP COLUMN IF EXISTS registration_closes_on,
  DROP COLUMN IF EXISTS registration_opens_on;
DROP TABLE IF EXISTS competition_milestones, source_documents CASCADE;
