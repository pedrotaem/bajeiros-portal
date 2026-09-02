-- Up Migration
-- DF-26 — Sugestões: melhoria, implementação ou problema pedidos de dentro de
-- qualquer página. Contrato: contracts/feedback-item.odcs.yaml (ADR-006).
--
-- Uma tabela só. O que vale saber está nas TRÊS camadas de escrita (DF-26 §6.2),
-- porque nenhuma delas basta sozinha:
--
--   1. RLS  — o autor vê e insere as próprias linhas; admin só LÊ (convenção do
--             DF-9: toda policy `*_admin_read` é SELECT-only).
--   2. GRANT de coluna — o autor recebe UPDATE só em `seen_at`. Ele marca o
--             desfecho como lido e NÃO consegue reescrever o próprio texto depois
--             de triado (RF-DF26.16). Garantido pelo grant, não por disciplina de
--             rota.
--   3. feedback_triage() SECURITY DEFINER — a única porta de escrita da triagem,
--             e ela exige app_is_admin(). Rota comprometida não vira escrita
--             indevida (RF-DF26.23).
--
-- `context` é jsonb de propósito: quando o deploy publicar um id de build, ele
-- entra ali sem migração (DF-26 §9.6).

CREATE TABLE feedback_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- anonimização na exclusão da conta, como em team_decisions (DF-26 §4.7);
  -- a base legal da permanência do texto é a MESMA pendência do DF-14 §8.3
  author_id         uuid REFERENCES users (id) ON DELETE SET NULL,
  kind              text NOT NULL CHECK (kind IN ('melhoria', 'implementacao', 'problema')),
  page              text NOT NULL CHECK (char_length(page) BETWEEN 1 AND 40),
  view              text CHECK (char_length(view) <= 40),
  title             text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  body              text NOT NULL CHECK (char_length(body) BETWEEN 20 AND 2000),
  -- { viewport: [w, h], rail: 'aberto' | 'compacto' } — e NADA além disso (RF-DF26.8)
  context           jsonb NOT NULL DEFAULT '{}'::jsonb,
  status            text NOT NULL DEFAULT 'novo'
                    CHECK (status IN ('novo', 'em_analise', 'planejado', 'entregue',
                                      'recusado', 'duplicado')),
  resolution        text CHECK (char_length(resolution) BETWEEN 1 AND 1000),
  duplicate_of      uuid REFERENCES feedback_items (id) ON DELETE SET NULL,
  status_changed_at timestamptz,
  -- quando o autor leu o desfecho; NULL depois de cada triagem = "não lido" (RF-DF26.24)
  seen_at           timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  -- recusar em silêncio ensina que o canal é decorativo (RF-DF26.19)
  CONSTRAINT feedback_motivo_obrigatorio
    CHECK (status NOT IN ('recusado', 'duplicado') OR resolution IS NOT NULL),
  CONSTRAINT feedback_duplicado_aponta
    CHECK (status <> 'duplicado' OR duplicate_of IS NOT NULL),
  CONSTRAINT feedback_nao_duplica_a_si
    CHECK (duplicate_of IS NULL OR duplicate_of <> id)
);

-- "as minhas", mais recente primeiro (RF-DF26.15)
CREATE INDEX feedback_items_author ON feedback_items (author_id, created_at DESC);
-- a fila da triagem: por status e por página (RF-DF26.17/21)
CREATE INDEX feedback_items_fila ON feedback_items (status, created_at DESC);
CREATE INDEX feedback_items_page ON feedback_items (page) WHERE status = 'novo';

/*
 * Escrita da triagem. SECURITY DEFINER porque é a ÚNICA porta: a policy de admin é
 * de leitura e o grant de coluna do autor não alcança status nem resolution.
 * Devolve o status anterior para a auditoria (AC-DF26.8) e zera `seen_at`, que é o
 * que faz o desfecho voltar a ser "não lido" para quem pediu.
 */
CREATE FUNCTION feedback_triage(
  p_id           uuid,
  p_status       text,
  p_resolution   text,
  p_duplicate_of uuid
)
RETURNS TABLE (r_previous text, r_author uuid)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS
$$
DECLARE
  v_previous text;
  v_author   uuid;
BEGIN
  IF NOT app_is_admin() THEN
    RAISE EXCEPTION 'triagem de sugestão exige administrador';
  END IF;

  SELECT status, author_id INTO v_previous, v_author
  FROM feedback_items WHERE id = p_id;
  IF v_previous IS NULL THEN RETURN; END IF;

  UPDATE feedback_items
     SET status = p_status,
         resolution = p_resolution,
         duplicate_of = p_duplicate_of,
         status_changed_at = now(),
         seen_at = NULL
   WHERE id = p_id;

  RETURN QUERY SELECT v_previous, v_author;
END;
$$;

GRANT SELECT, INSERT ON feedback_items TO bajeiros_app;
-- só `seen_at`: o autor marca como lido e nada mais (DF-26 §6.2, camada 2)
GRANT UPDATE (seen_at) ON feedback_items TO bajeiros_app;
GRANT EXECUTE ON FUNCTION feedback_triage(uuid, text, text, uuid) TO bajeiros_app;

-- ---------- RLS (isolamento; RBAC fino continua na policy layer da app) ----------

ALTER TABLE feedback_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY feedback_items_author ON feedback_items
  USING (author_id = app_user_id())
  WITH CHECK (author_id = app_user_id());
CREATE POLICY feedback_items_admin_read ON feedback_items FOR SELECT USING (app_is_admin());

-- Down Migration
DROP POLICY IF EXISTS feedback_items_admin_read ON feedback_items;
DROP POLICY IF EXISTS feedback_items_author ON feedback_items;
DROP FUNCTION IF EXISTS feedback_triage(uuid, text, text, uuid);
DROP TABLE IF EXISTS feedback_items CASCADE;
