-- Combined apply for migrations 0005-0007 (paste in SQL Editor)
-- Idempotente — re-correr no rompe ni duplica.

-- ============================================================
-- NQS AI Hub — Migration 0005
-- Preferencia de tema por usuario (light / dark)
-- ============================================================
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS theme_preference TEXT
  NOT NULL DEFAULT 'light';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_theme_preference_check'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_theme_preference_check
      CHECK (theme_preference IN ('light', 'dark'));
  END IF;
END $$;

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

-- ============================================================
-- NQS AI Hub — Migration 0007
-- access_requests: soporta distintos tipos de solicitud y duración
-- temporal para "acceso excepcional" fuera de horario.
-- ============================================================
ALTER TABLE access_requests
  ADD COLUMN IF NOT EXISTS request_type TEXT
  NOT NULL DEFAULT 'credits';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'access_requests_request_type_check'
  ) THEN
    ALTER TABLE access_requests
      ADD CONSTRAINT access_requests_request_type_check
      CHECK (request_type IN ('credits', 'access', 'exceptional_access'));
  END IF;
END $$;

ALTER TABLE access_requests
  ADD COLUMN IF NOT EXISTS exceptional_duration_minutes INT;
