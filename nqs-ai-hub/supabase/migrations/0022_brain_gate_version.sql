-- ============================================================
-- NQS AI Hub — Migration 0022
-- gate_version en brain_config (mismo patrón que gastos_gate_config /
-- proyectos privados). Al cambiar la password del Brain → gate_version++
-- → cookies brain_session viejas dejan de validar.
--
-- Aplicar en Supabase SQL Editor (Run). Idempotente.
-- ============================================================

ALTER TABLE brain_config
  ADD COLUMN IF NOT EXISTS gate_version INTEGER NOT NULL DEFAULT 1;

COMMENT ON COLUMN brain_config.gate_version IS
  'Bump al cambiar password del Brain → invalida cookies brain_session vigentes.';

-- ============================================================
-- FIN migration 0022.
-- ============================================================
