-- Up Migration
-- DF-20 — Aferição: a declaração vale até o dado dizer o contrário.
--
-- Vem DEPOIS do 0009 (ficha do protótipo) porque a mediana de massa por classe lê
-- `project_fields`: é a ficha que resolve a questão aberta §8.1 do DF-20 (comparar
-- massa entre projetos incomparáveis) e destrava o indício do `DIN-3.x`.
--
-- **O estado "em contraprova" NÃO é coluna** (RF-2.1). Ele depende da evidência do
-- momento e é derivado no motor: gravá-lo criaria duas fontes de verdade e um
-- trabalho de sincronização que a primeira versão salva já invalidaria. O que
-- persiste é só a RESPOSTA da equipe a um indício.
--
-- E a declaração **nunca é apagada** por uma contraprova (RF-3.1): ela é suspensa,
-- com autor, data e motivo à vista. Só a própria equipe revoga.

ALTER TABLE evolution_declarations
  ADD COLUMN reaffirmed_at     timestamptz,
  ADD COLUMN reaffirmed_by     uuid REFERENCES users (id) ON DELETE SET NULL,
  -- RF-3.3: reafirmação vale UMA VEZ POR TEMPORADA; sem o rótulo não há como saber
  -- se a resposta é desta temporada ou da anterior
  ADD COLUMN reaffirmed_season text,
  ADD COLUMN reaffirm_note     text CHECK (char_length(reaffirm_note) <= 500);

/*
 * §2.2 — mediana de massa da gaiola entre protótipos da MESMA CLASSE.
 *
 * A classe sai da ficha do protótipo (DF-21 §5.1: ocupantes + tração são os campos
 * marcados como comparáveis). Comparar a massa de um biplace 4×4 com a de um
 * monoposto 4×2 produziria uma acusação sem sentido — e é exatamente o ponto de
 * falha P-1.4. Sem classe declarada não há linha para comparar, e a contraprova
 * simplesmente não existe: é o comportamento certo, não uma lacuna.
 *
 * Devolve também a CONTAGEM, para a app aplicar o piso de 8 protótipos (P-1.3, mesmo
 * piso do benchmark do DF-13 RF-7.2). SECURITY DEFINER porque cruza equipes; devolve
 * só agregado — a massa de um protótipo alheio nunca sai daqui.
 */
CREATE FUNCTION evolution_mass_median(p_class text)
RETURNS TABLE (m_median numeric, m_projects integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$
  WITH ultima AS (
    SELECT DISTINCT ON (e.team_id)
           e.team_id, e.project_id, (e.payload ->> 'massKg')::numeric AS mass
    FROM evolution_evidence e
    WHERE e.kind = 'validation.summary'
      AND jsonb_typeof(e.payload -> 'massKg') = 'number'
    ORDER BY e.team_id, e.created_at DESC
  ),
  classificada AS (
    SELECT u.mass,
           coalesce(o.value #>> '{}', '?') || '/' || coalesce(t.value #>> '{}', '?') AS classe
    FROM ultima u
    LEFT JOIN project_fields o
      ON o.project_id = u.project_id AND o.field_id = 'id.ocupantes' AND o.kind = 'design'
    LEFT JOIN project_fields t
      ON t.project_id = u.project_id AND t.field_id = 'id.tracao' AND t.kind = 'design'
  )
  SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY mass)::numeric, count(*)::int
  FROM classificada
  WHERE classe = p_class
$$;

GRANT EXECUTE ON FUNCTION evolution_mass_median(text) TO bajeiros_app;

-- Down Migration
DROP FUNCTION IF EXISTS evolution_mass_median(text);

ALTER TABLE evolution_declarations
  DROP COLUMN IF EXISTS reaffirm_note,
  DROP COLUMN IF EXISTS reaffirmed_season,
  DROP COLUMN IF EXISTS reaffirmed_by,
  DROP COLUMN IF EXISTS reaffirmed_at;
