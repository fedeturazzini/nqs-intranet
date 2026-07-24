-- ============================================================
-- NQS AI Hub — Migration 0017
-- Sumar los modelos Opus vigentes al selector del cerebro.
-- ============================================================
-- Bug: cambiar una versión a Opus no persistía (revertía al anterior),
-- mientras Haiku/Sonnet sí guardaban. Las tres listas blancas de código
-- (Zod x2, arrays de UI, pricing) YA permitían claude-opus-4-7, así que
-- el bloqueo estaba en el CHECK constraint de la base
-- (system_prompts_model_check), desincronizado de la migration 0004.
--
-- Esta migration recrea el constraint con TODOS los Opus vigentes:
--   claude-opus-4-7 / claude-opus-4-8 / claude-opus-5   ($5/$25 por 1M)
-- además de los ya existentes:
--   claude-haiku-4-5 / claude-sonnet-4-6
-- ============================================================
-- Idempotente: drop si existe, normaliza valores viejos, recrea el CHECK.
-- ============================================================

-- 1. Drop del constraint actual (cualquiera sea su estado vivo).
ALTER TABLE system_prompts
  DROP CONSTRAINT IF EXISTS system_prompts_model_check;

-- 2. Normalizar filas con nombres viejos, por si la base quedó atrás (no
-- toca nada si ya están con los nombres correctos). Necesario porque el
-- ADD CONSTRAINT de abajo valida las filas existentes.
UPDATE system_prompts SET model = 'claude-sonnet-4-6'
  WHERE model = 'claude-sonnet-4-5';
UPDATE system_prompts SET model = 'claude-opus-4-7'
  WHERE model = 'claude-opus-4-1';

-- 3. Recrear el constraint con el set completo de modelos vigentes.
ALTER TABLE system_prompts
  ADD CONSTRAINT system_prompts_model_check
  CHECK (model IN (
    'claude-haiku-4-5',
    'claude-sonnet-4-6',
    'claude-opus-4-7',
    'claude-opus-4-8',
    'claude-opus-5'
  ));

-- Nota: el DEFAULT sigue siendo 'claude-sonnet-4-6' (migration 0004); no se toca.
-- Si el ADD CONSTRAINT falla por una fila con un modelo inesperado, ver cuáles
-- hay con:  SELECT model, count(*) FROM system_prompts GROUP BY model;
-- y normalizar esa fila antes de reintentar.
