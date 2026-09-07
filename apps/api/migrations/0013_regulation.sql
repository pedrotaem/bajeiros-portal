-- Up Migration
-- DF-34 — Regulamento: qual emenda vale para qual competição, e por onde o portal
-- aponta para o documento oficial. O ÍNDICE não mora aqui: é artefato estático gerado
-- do manifest do gateway (`apps/web/public/regulamento/indice-<edition>.json`, §5.2) —
-- o portal público não consulta banco para desenhar um índice que muda uma vez por ano.
-- O TEXTO do regulamento não mora em lugar nenhum deste repo (DF-8, DF-34 §3.1).
-- Contrato: contracts/regulation.odcs.yaml. ADR-006 (ODCS), ADR-012 (rota pública).
--
-- Leitura PÚBLICA pelo mesmo motivo do calendário (DF-33 §3.3): a página do regulamento
-- abre sem conta (FR-DF34.2), a rota roda sem `app.user_id` e as policies de SELECT são
-- `USING (true)`. Escrita continua só do admin (DF-9).

CREATE TABLE regulation_versions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  edition        text NOT NULL UNIQUE CHECK (char_length(edition) BETWEEN 1 AND 40), -- 'emenda-07'
  label          text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 120),  -- 'RATBSB Emenda 7 · Baja 2026'
  -- versão do corpus do gateway ('ratbsb@emenda-07#sha256:e4a0…'): é ela que casa a
  -- citação do assistente com ESTA emenda (§3.2). Divergiu → a citação abre pela página.
  corpus_version text NOT NULL CHECK (char_length(corpus_version) <= 120),
  pdf_sha256     text NOT NULL CHECK (pdf_sha256 ~ '^[0-9a-f]{64}$'),
  page_count     integer NOT NULL CHECK (page_count > 0),
  source_id      uuid NOT NULL REFERENCES source_documents (id),  -- o PDF oficial (DF-33)
  supersedes_id  uuid REFERENCES regulation_versions (id),
  published_on   date,
  checked_at     timestamptz NOT NULL DEFAULT now(),
  updated_by     uuid REFERENCES users (id) ON DELETE SET NULL
);

-- Para quais competições a emenda vale. Sem isso "vigente" seria opinião: o Nacional 2027
-- adotou a emenda 7 por informativo, e a emenda 6 continua valendo para o que já passou.
CREATE TABLE regulation_applicability (
  version_id     uuid NOT NULL REFERENCES regulation_versions (id) ON DELETE CASCADE,
  competition_id uuid NOT NULL REFERENCES competitions (id) ON DELETE CASCADE,
  PRIMARY KEY (version_id, competition_id)
);
CREATE INDEX regulation_applicability_competition ON regulation_applicability (competition_id);

-- Referência ligada a uma seção (Anexo B, informativo que muda uma regra) e a marca de
-- curadoria que a lista de Referências usa para destacar o que ALTERA regra (FR-DF34.14).
ALTER TABLE source_documents
  ADD COLUMN section_id   text CHECK (char_length(section_id) <= 40),
  ADD COLUMN alters_rules boolean NOT NULL DEFAULT false;

GRANT SELECT, INSERT, UPDATE, DELETE ON regulation_versions, regulation_applicability
  TO bajeiros_app;

ALTER TABLE regulation_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY regulation_versions_read ON regulation_versions FOR SELECT USING (true);
CREATE POLICY regulation_versions_admin ON regulation_versions
  USING (app_is_admin()) WITH CHECK (app_is_admin());

ALTER TABLE regulation_applicability ENABLE ROW LEVEL SECURITY;
CREATE POLICY regulation_applicability_read ON regulation_applicability FOR SELECT USING (true);
CREATE POLICY regulation_applicability_admin ON regulation_applicability
  USING (app_is_admin()) WITH CHECK (app_is_admin());

-- Down Migration
DROP POLICY IF EXISTS regulation_applicability_admin ON regulation_applicability;
DROP POLICY IF EXISTS regulation_applicability_read ON regulation_applicability;
DROP POLICY IF EXISTS regulation_versions_admin ON regulation_versions;
DROP POLICY IF EXISTS regulation_versions_read ON regulation_versions;
ALTER TABLE source_documents
  DROP COLUMN IF EXISTS alters_rules,
  DROP COLUMN IF EXISTS section_id;
DROP TABLE IF EXISTS regulation_applicability, regulation_versions CASCADE;
