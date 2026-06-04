-- ============================================================
-- NQS AI Hub — Tutoriales como tool gestionable (sesión auxiliar)
--
-- `tool_access.tool_id` tiene FK a `tools(id)`, así que para gestionar el
-- acceso a Tutoriales vía tool_access necesitamos una fila en `tools`.
-- No es una migración de schema — solo un seed.
--
-- Aplicar en Supabase SQL Editor (Run). Idempotente.
-- ============================================================

-- Nota: `category` es el enum `tool_category` (text/visual/video/audio/
-- assets). NO tiene 'internal'. Como tutoriales está EXCLUIDO del hub, la
-- categoría es solo un label cosmético en /admin/access → usamos 'assets'.
INSERT INTO tools (id, name, vendor, category, description, color, glyph, is_active, uses_credits)
VALUES (
  'tutoriales',
  'Tutoriales',
  'NQS',
  'assets',
  'Material de aprendizaje del estudio — recorridos de cada herramienta.',
  '#ffcb5c',
  '📚',
  TRUE,
  FALSE
)
ON CONFLICT (id) DO NOTHING;

-- ── (OPCIONAL — NO ejecutar salvo que Chule lo pida) ──
-- Dar acceso retroactivo a Tutoriales a TODOS los users existentes:
--
-- INSERT INTO tool_access (user_id, tool_id, status, granted_at)
-- SELECT id, 'tutoriales', 'active', NOW()
-- FROM users
-- WHERE NOT EXISTS (
--   SELECT 1 FROM tool_access ta
--   WHERE ta.user_id = users.id AND ta.tool_id = 'tutoriales'
-- );
-- ============================================================
