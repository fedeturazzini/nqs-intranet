-- ============================================================
-- NQS AI Hub — Migration 0002
-- 3DSky: schedule en tool_access + module_sessions + credits_requested
-- en access_requests + RPC atómica consume_credit_atomic.
-- ============================================================
-- Idempotente (IF NOT EXISTS, CREATE OR REPLACE) — se puede re-correr
-- sin pisar la base si ya estaba aplicada.
-- ============================================================

-- ─── 1. tool_access.schedule ─────────────────────────────────
-- Schedule por día de semana. NULL = sin restricción horaria.
-- Formato:
--   {
--     "monday":    { "enabled": true,  "from": "09:00", "to": "18:00" },
--     "tuesday":   { "enabled": true,  "from": "09:00", "to": "18:00" },
--     "wednesday": { "enabled": false                                 },
--     ...
--   }
-- La aplicación valida en TZ America/Argentina/Buenos_Aires.
ALTER TABLE tool_access
  ADD COLUMN IF NOT EXISTS schedule JSONB;

-- ─── 2. access_requests.credits_requested ────────────────────
-- La columna `duration_minutes` que ya existía estaba pensada para
-- aprobaciones de tiempo (módulo futuro). Para créditos de 3DSky
-- usamos esta otra (más explícita).
ALTER TABLE access_requests
  ADD COLUMN IF NOT EXISTS credits_requested INT;

-- ─── 3. module_sessions ──────────────────────────────────────
-- Log de entradas/salidas a tools embebidas (hoy solo 3DSky).
-- `declared_consumption` es lo que el empleado declaró al salir;
-- se usa para descontar créditos y para auditar contra factura.
CREATE TABLE IF NOT EXISTS module_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tool_id TEXT NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
  entered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  exited_at TIMESTAMPTZ,
  declared_consumption INT DEFAULT 0,
  ip_address INET,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_module_sessions_user
  ON module_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_module_sessions_tool
  ON module_sessions(tool_id);
-- Sesiones abiertas (sin exited_at). Útil para auditoría y para
-- prevenir múltiples sesiones simultáneas si quisiéramos.
CREATE INDEX IF NOT EXISTS idx_module_sessions_active
  ON module_sessions(user_id, tool_id)
  WHERE exited_at IS NULL;

-- RLS (defensa en profundidad — el backend usa service_role).
ALTER TABLE module_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS module_sessions_own ON module_sessions;
CREATE POLICY module_sessions_own ON module_sessions
  FOR ALL USING (user_id = auth.uid() OR public.is_admin());

-- ─── 4. consume_credit_atomic ────────────────────────────────
-- RPC que descuenta créditos atómicamente. Bloquea la fila de
-- credit_allocations con SELECT … FOR UPDATE; si no alcanzan los
-- créditos, RAISE EXCEPTION que rolea toda la transacción.
--
-- Devuelve JSON { remaining: int }. El caller (TS) lo parsea.
--
-- IMPORTANTE: no usamos SECURITY DEFINER — se llama desde
-- service_role que ya tiene permisos sobre las tablas.
CREATE OR REPLACE FUNCTION public.consume_credit_atomic(
  p_user_id UUID,
  p_tool_id TEXT,
  p_amount INT,
  p_reason TEXT
) RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
  v_assigned INT;
  v_used INT;
  v_remaining INT;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_amount' USING ERRCODE = 'P0001';
  END IF;

  -- Bloqueamos la fila para serializar consumos concurrentes.
  SELECT credits_assigned, credits_used
    INTO v_assigned, v_used
  FROM credit_allocations
  WHERE user_id = p_user_id AND tool_id = p_tool_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'no_allocation' USING ERRCODE = 'P0002';
  END IF;

  v_remaining := v_assigned - v_used;
  IF v_remaining < p_amount THEN
    RAISE EXCEPTION 'insufficient_credits' USING ERRCODE = 'P0003';
  END IF;

  UPDATE credit_allocations
    SET credits_used = v_used + p_amount
  WHERE user_id = p_user_id AND tool_id = p_tool_id;

  INSERT INTO credit_transactions (user_id, tool_id, type, amount, reason, performed_by)
  VALUES (p_user_id, p_tool_id, 'consumption', -p_amount, p_reason, p_user_id);

  RETURN json_build_object('remaining', v_remaining - p_amount);
END;
$$;

-- Permisos: solo service_role la invoca desde el backend. Revocamos
-- de PUBLIC para no exponerla via anon ni authenticated.
REVOKE ALL ON FUNCTION public.consume_credit_atomic(UUID, TEXT, INT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_credit_atomic(UUID, TEXT, INT, TEXT) TO service_role;
