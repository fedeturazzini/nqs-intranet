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
