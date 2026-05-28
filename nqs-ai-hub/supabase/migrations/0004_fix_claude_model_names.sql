-- ============================================================
-- NQS AI Hub — Migration 0004
-- Fix de nombres de modelos Claude vigentes en 2026.
-- ============================================================
-- La migration 0003 había usado los nombres incorrectos:
--   claude-sonnet-4-5  ← INCORRECTO (era el snapshot de Sonnet 4)
--   claude-opus-4-1    ← INCORRECTO (era un snapshot viejo)
--
-- Los modelos vigentes hoy según Anthropic:
--   claude-haiku-4-5   (oct 2025, sin cambios)
--   claude-sonnet-4-6  (feb 2026)
--   claude-opus-4-7    (abr 2026)
-- ============================================================
-- Idempotente: drop si existe, update solo si encuentra valores viejos,
-- nuevo constraint con IF NOT EXISTS pattern.
-- ============================================================

-- 1. Drop del constraint viejo (puede no existir si 0003 no se aplicó
-- o si ya pasamos por acá antes).
ALTER TABLE system_prompts
  DROP CONSTRAINT IF EXISTS system_prompts_model_check;

-- 2. Migrar filas existentes que tengan los nombres viejos. Si ya están
-- con los correctos, este UPDATE no toca nada.
UPDATE system_prompts SET model = 'claude-sonnet-4-6'
  WHERE model = 'claude-sonnet-4-5';
UPDATE system_prompts SET model = 'claude-opus-4-7'
  WHERE model = 'claude-opus-4-1';

-- 3. Actualizar el DEFAULT a Sonnet 4.6 (era 4-5 en 0003).
ALTER TABLE system_prompts
  ALTER COLUMN model SET DEFAULT 'claude-sonnet-4-6';

-- 4. Recrear el constraint con los nombres correctos.
ALTER TABLE system_prompts
  ADD CONSTRAINT system_prompts_model_check
  CHECK (model IN ('claude-haiku-4-5', 'claude-sonnet-4-6', 'claude-opus-4-7'));
