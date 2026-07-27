-- ============================================================
-- NQS AI Hub — Migration 0018
-- Sumar claude-opus-4-6 al selector de modelos del cerebro.
-- ============================================================
-- La migration 0017 recreó system_prompts_model_check con haiku-4-5 /
-- sonnet-4-6 / opus-4-7 / opus-4-8 / opus-5. Este delta suma
-- claude-opus-4-6 (Active, $5/$25, 128K output — catálogo oficial Anthropic).
--
-- Va aparte de 0017 (ya commiteada, quizás ya aplicada): editar una migración
-- ya corrida no se re-aplica sola. Esta 0018 es idempotente (DROP + reCREATE con
-- el set COMPLETO) → deja el constraint correcto corra o no se haya corrido 0017,
-- y es segura de re-ejecutar.
-- ============================================================

ALTER TABLE system_prompts
  DROP CONSTRAINT IF EXISTS system_prompts_model_check;

ALTER TABLE system_prompts
  ADD CONSTRAINT system_prompts_model_check
  CHECK (model IN (
    'claude-haiku-4-5',
    'claude-sonnet-4-6',
    'claude-opus-4-6',
    'claude-opus-4-7',
    'claude-opus-4-8',
    'claude-opus-5'
  ));

-- Nota: el DEFAULT sigue siendo 'claude-sonnet-4-6' (migration 0004); no se toca.
