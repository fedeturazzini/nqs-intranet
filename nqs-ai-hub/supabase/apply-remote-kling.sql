-- ============================================================
-- APLICAR EN SUPABASE (SQL Editor) — Habilitar Kling
-- Equivale a migration 0011_enable_kling.sql.
--
-- La fila 'kling' ya existe (seed) pero estaba apagada. Esto la activa y le
-- prende créditos. Idempotente: se puede correr varias veces sin problema.
-- ============================================================
UPDATE tools
SET is_active    = TRUE,
    uses_credits = TRUE,
    description  = 'Generación de video AI con dirección de cámara y arte.'
WHERE id = 'kling';

-- Verificación (debería devolver kling con is_active=t, uses_credits=t):
-- SELECT id, name, is_active, uses_credits, category FROM tools WHERE id = 'kling';
