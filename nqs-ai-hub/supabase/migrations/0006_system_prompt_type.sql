-- ============================================================
-- NQS AI Hub — Migration 0006
-- system_prompts.type: separa el "cerebro" (system) de la "memoria"
-- del workspace (memory). Cada llamada a Claude levanta los DOS
-- activos y los concatena con tags <system_prompt> / <workspace_memory>.
-- ============================================================
ALTER TABLE system_prompts
  ADD COLUMN IF NOT EXISTS type TEXT
  NOT NULL DEFAULT 'system';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'system_prompts_type_check'
  ) THEN
    ALTER TABLE system_prompts
      ADD CONSTRAINT system_prompts_type_check
      CHECK (type IN ('system', 'memory'));
  END IF;
END $$;

-- El registro de memoria inicial para Claude (texto vacío). Se inserta
-- solo si todavía no existe ninguno (para que re-correr la migration
-- no duplique).
INSERT INTO system_prompts (tool_id, type, name, content_encrypted, is_active, version, model)
SELECT 'claude', 'memory', 'Memoria principal', '', TRUE, 1, 'claude-sonnet-4-6'
WHERE NOT EXISTS (
  SELECT 1 FROM system_prompts
  WHERE tool_id = 'claude' AND type = 'memory'
);
