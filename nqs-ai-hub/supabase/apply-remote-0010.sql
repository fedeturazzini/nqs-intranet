-- ============================================================
-- NQS AI Hub — Migration 0010
-- Organigrama: columnas en `users` para la jerarquía del estudio.
--
--   - reports_to_id : a quién le reporta (jerarquía). FK ON DELETE SET NULL.
--   - is_in_org     : si aparece en el organigrama.
--   - org_position  : orden entre nodos hermanos (1,2,3…).
--   - org_role      : rol DENTRO del organigrama (puede diferir del dept),
--                     ej "Founder & CEO", "Head of Design".
--
-- Aplicar en Supabase SQL Editor (Run). Idempotente.
-- ============================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS reports_to_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_in_org BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS org_position INTEGER,
  ADD COLUMN IF NOT EXISTS org_role TEXT;

CREATE INDEX IF NOT EXISTS idx_users_reports_to ON users(reports_to_id);
CREATE INDEX IF NOT EXISTS idx_users_in_org ON users(is_in_org) WHERE is_in_org = true;

-- ============================================================
-- FIN migration 0010.
-- El organigrama arranca sin jerarquía (todos is_in_org=true, sin
-- reports_to). El admin lo arma desde /admin/organigrama.
-- ============================================================
