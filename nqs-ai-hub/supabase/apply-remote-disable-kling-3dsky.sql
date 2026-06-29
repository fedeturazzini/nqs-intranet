-- ============================================================
-- APLICAR EN SUPABASE (SQL Editor)
-- Dejar Kling y 3DSky como "Próximamente" (TEMPORAL y REVERSIBLE).
--
-- is_active=false → el hub las muestra como "Próximamente" (no clickeables),
-- bloquea pedir acceso nuevo, y el gate de las páginas /tool/kling y
-- /tool/3dsky manda al hub (no se puede entrar por URL directa).
--
-- NO se borra nada ni se toca uses_credits / créditos / accesos: al re-activar
-- queda todo como estaba.
-- ============================================================
UPDATE tools SET is_active = false WHERE id IN ('kling', '3dsky');

-- Verificar:
-- SELECT id, name, is_active, uses_credits FROM tools WHERE id IN ('kling','3dsky');

-- ─── PARA REVERTIR (volver a habilitarlas) ───
-- UPDATE tools SET is_active = true WHERE id IN ('kling', '3dsky');
