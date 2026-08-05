-- ============================================================
-- NQS AI Hub — Migration 0020
-- thinking_mode en system_prompts (off | auto)
-- ============================================================
-- Claude Sonnet 5 prende adaptive thinking ON por default. El hub necesita
-- poder apagarlo por proyecto (admin) sin hardcodear solo Sonnet 5.
--   off  → thinking: { type: "disabled" }
--   auto → no mandamos el campo (default del modelo)
-- Default de columna: 'auto'. Filas con model=claude-sonnet-5 → 'off'.
-- ============================================================

ALTER TABLE system_prompts
  ADD COLUMN IF NOT EXISTS thinking_mode TEXT NOT NULL DEFAULT 'auto';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'system_prompts_thinking_mode_check'
  ) THEN
    ALTER TABLE system_prompts
      ADD CONSTRAINT system_prompts_thinking_mode_check
      CHECK (thinking_mode IN ('off', 'auto'));
  END IF;
END $$;

UPDATE system_prompts
SET thinking_mode = 'off'
WHERE model = 'claude-sonnet-5'
  AND thinking_mode = 'auto';
