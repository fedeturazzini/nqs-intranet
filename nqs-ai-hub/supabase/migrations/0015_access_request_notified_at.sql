-- 0015 — access_requests.notified_at (observabilidad del aviso a Slack)
--
-- Contexto: aux-fix-slack-pending-fantasma. El endpoint de solicitud de acceso
-- avisa a Slack en un after() (post-respuesta). Hasta ahora no quedaba registro
-- de si ese aviso REALMENTE salió: "no hay log" era ambiguo. Esta columna guarda
-- el timestamp del envío confirmado (200 de Slack). null = nunca se confirmó
-- envío para esa solicitud.
--
-- Uso (fase 1 — solo observabilidad): se setea en el camino feliz cuando el
-- POST a Slack devuelve OK. Permite medir en prod cuántas solicitudes se crean
-- sin aviso confirmado antes de decidir la re-emisión (throttle) en fase 2.
--
-- Aditiva, nullable, idempotente. No cambia el comportamiento del guard.
-- Aplicar en el SQL Editor de Supabase (el CLI no está linkeado — ver progress-02).

ALTER TABLE access_requests
  ADD COLUMN IF NOT EXISTS notified_at TIMESTAMPTZ;

COMMENT ON COLUMN access_requests.notified_at IS
  'Cuándo se confirmó el envío del aviso a Slack (200) de esta solicitud. null = nunca confirmado. Auditoría/observabilidad; no afecta la lógica del endpoint.';
