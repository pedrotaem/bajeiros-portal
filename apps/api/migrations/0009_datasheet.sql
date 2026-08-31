-- Up Migration
-- DF-21 — Ficha do protótipo: os dados do carro como campos de primeira classe.
-- Contrato: contracts/project-datasheet.odcs.yaml (ADR-006).
--
-- O número 0009 é o da spec §6: o 0008 fica reservado às patentes (DF-18), que
-- entram por outro PR. Buraco na sequência é inofensivo — a ordem é lexicográfica.
--
-- Três decisões que a spec fixa e este arquivo executa:
--
--  1. NÃO existe tabela nem coluna de valor sugerido (§6). Sugestão é computada na
--     leitura a partir do último snapshot de gaiola e nunca persiste — é o que impede
--     o valor da ficha de andar sozinho quando alguém salva o 3D (AC-DF21.5). O que
--     persiste, quando a equipe aceita, é escrita normal com `source = 'suggestion'`
--     na revisão.
--  2. Valor em `jsonb`, não em colunas tipadas: o catálogo muda por PR e uma coluna
--     por campo seria uma migração por campo novo. O tipo é imposto na borda pelo
--     catálogo (`packages/datasheet`), que é a fonte de verdade.
--  3. Sem coluna nova em `projects`. A ficha é tabela lateral: projeto sem ficha
--     continua válido, e ficha sem gaiola também (AC-DF21.16).
--
-- LGPD: nada de PII nos valores ("piloto de referência" é percentil antropométrico,
-- não pessoa). Autoria (`updated_by`, `changed_by`) é a única PII — base legal
-- execução de contrato, retenção pela vida do projeto, anonimização no SET NULL da
-- exclusão de conta (AC-DF21.15).

CREATE TABLE project_fields (
  project_id  uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  field_id    text NOT NULL,
  kind        text NOT NULL DEFAULT 'design' CHECK (kind IN ('design', 'measured')),
  value       jsonb NOT NULL,
  updated_by  uuid REFERENCES users (id) ON DELETE SET NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, field_id, kind)
);

-- Append-only: é o histórico que transforma o campo de post-it em resposta para
-- "quem mudou a relação final, e por quê" (§3.4).
CREATE TABLE project_field_revisions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  field_id    text NOT NULL,
  kind        text NOT NULL,
  old_value   jsonb,
  new_value   jsonb,
  source      text NOT NULL DEFAULT 'manual'
              CHECK (source IN ('manual', 'suggestion')),
  changed_by  uuid REFERENCES users (id) ON DELETE SET NULL,
  changed_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX project_field_revisions_field
  ON project_field_revisions (project_id, field_id, changed_at DESC);

-- "Não se aplica a este protótipo" exige motivo e é auditado: não é atalho para
-- inflar progresso (RF-5.2 / P-3.2).
CREATE TABLE project_section_waivers (
  project_id  uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  section_id  text NOT NULL,
  reason      text CHECK (char_length(reason) <= 280),
  waived_by   uuid REFERENCES users (id) ON DELETE SET NULL,
  waived_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, section_id)
);

CREATE TRIGGER project_fields_touch BEFORE UPDATE ON project_fields
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON project_fields TO bajeiros_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON project_section_waivers TO bajeiros_app;
-- append-only por design (como audit_events e cage_snapshots): sem UPDATE/DELETE
GRANT SELECT, INSERT ON project_field_revisions TO bajeiros_app;

-- ---------- RLS: herda a visibilidade de `projects` (padrão de cage_snapshots) ----------

ALTER TABLE project_fields ENABLE ROW LEVEL SECURITY;
CREATE POLICY project_fields_via_project ON project_fields
  USING (project_id IN (SELECT id FROM projects))
  WITH CHECK (project_id IN (SELECT id FROM projects));

ALTER TABLE project_field_revisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY project_field_revisions_via_project ON project_field_revisions
  USING (project_id IN (SELECT id FROM projects))
  WITH CHECK (project_id IN (SELECT id FROM projects) AND changed_by = app_user_id());

ALTER TABLE project_section_waivers ENABLE ROW LEVEL SECURITY;
CREATE POLICY project_section_waivers_via_project ON project_section_waivers
  USING (project_id IN (SELECT id FROM projects))
  WITH CHECK (project_id IN (SELECT id FROM projects));

-- Down Migration
DROP POLICY IF EXISTS project_section_waivers_via_project ON project_section_waivers;
DROP POLICY IF EXISTS project_field_revisions_via_project ON project_field_revisions;
DROP POLICY IF EXISTS project_fields_via_project ON project_fields;

DROP TABLE IF EXISTS project_section_waivers, project_field_revisions,
  project_fields CASCADE;
