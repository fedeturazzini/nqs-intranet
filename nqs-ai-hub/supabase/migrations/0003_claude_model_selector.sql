-- ============================================================
-- NQS AI Hub — Migration 0003
-- Selector de modelo de Claude por system_prompt.
-- ============================================================
-- Cada versión del prompt padre lleva el modelo a usar (Haiku, Sonnet,
-- Opus). El cliente Anthropic lo lee dinámicamente en cada execute.
-- ============================================================

ALTER TABLE system_prompts
  ADD COLUMN IF NOT EXISTS model TEXT NOT NULL
  DEFAULT 'claude-sonnet-4-5';

-- CHECK constraint con los 3 modelos del MVP. Si Anthropic publica
-- variantes nuevas, sumarlos acá + actualizar el dropdown del admin.
--
-- Nota: cuando Anthropic publique claude-sonnet-4-6, agregar al CHECK
-- y bumpear el default. Hoy 4-6 todavía no resuelve en la API.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'system_prompts_model_check'
  ) THEN
    ALTER TABLE system_prompts
      ADD CONSTRAINT system_prompts_model_check
      CHECK (model IN ('claude-haiku-4-5', 'claude-sonnet-4-5', 'claude-opus-4-1'));
  END IF;
END $$;
