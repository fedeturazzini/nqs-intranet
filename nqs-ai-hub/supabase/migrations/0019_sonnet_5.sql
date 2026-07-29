-- ============================================================
-- NQS AI Hub — Migration 0019
-- Sumar claude-sonnet-5 al selector de modelos del cerebro.
-- ============================================================
-- Sonnet 5 (Active, $3/$15, 128K output, soporta code execution). Va aparte de
-- 0017/0018 (ya commiteadas / quizás aplicadas): editar una migración ya corrida
-- no se re-aplica sola. Idempotente: DROP + reCREATE con el set COMPLETO → deja el
-- constraint correcto corran o no las anteriores, y es seguro re-ejecutar.
-- ============================================================

ALTER TABLE system_prompts
  DROP CONSTRAINT IF EXISTS system_prompts_model_check;

ALTER TABLE system_prompts
  ADD CONSTRAINT system_prompts_model_check
  CHECK (model IN (
    'claude-haiku-4-5',
    'claude-sonnet-4-6',
    'claude-sonnet-5',
    'claude-opus-4-6',
    'claude-opus-4-7',
    'claude-opus-4-8',
    'claude-opus-5'
  ));

-- Nota: el DEFAULT sigue siendo 'claude-sonnet-4-6' (migration 0004); no se toca.
