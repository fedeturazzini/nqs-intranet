-- ============================================================
-- NQS AI Hub — Migration 0021
-- Gate de contraseña para el panel de Gastos (admin).
--
-- Misma idea que brain_config (password bcrypt) + gate_version de
-- proyectos privados: al cambiar la clave → gate_version++ → las cookies
-- firmadas viejas dejan de validar.
--
-- Aplicar en Supabase SQL Editor (Run). Idempotente.
-- ============================================================

CREATE TABLE IF NOT EXISTS gastos_gate_config (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  password_hash TEXT NOT NULL,
  gate_version  INTEGER NOT NULL DEFAULT 1,
  updated_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE gastos_gate_config IS
  'Password (bcrypt) que protege /admin/logs y las conversaciones admin. Una fila.';
COMMENT ON COLUMN gastos_gate_config.gate_version IS
  'Bump al cambiar password → invalida cookies gastos_gate vigentes.';

ALTER TABLE gastos_gate_config ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'gastos_gate_config'
      AND policyname = 'gastos_gate_config_admin_only'
  ) THEN
    CREATE POLICY gastos_gate_config_admin_only ON gastos_gate_config
      FOR ALL USING (public.is_admin());
  END IF;
END $$;

-- ============================================================
-- FIN migration 0021.
-- ============================================================
