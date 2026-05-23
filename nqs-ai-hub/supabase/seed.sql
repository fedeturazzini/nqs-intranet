-- ============================================================
-- NQS AI Hub — Seed inicial (datos NO atados a usuarios)
-- ============================================================
-- Los inserts en `tools` ya viven en la migration 0001 (vienen del schema
-- de referencia del cliente), así que acá solo va lo que depende del
-- system_prompt placeholder y el pool de créditos 3DSky.
--
-- Los datos que dependen de usuarios (tool_access, credit_allocations) se
-- siembran desde `scripts/create-users.ts`, que crea los usuarios de auth
-- + el registro en public.users + sus permisos en una sola corrida.
-- ============================================================

-- 1) System prompt placeholder para Claude.
--
-- El contenido va ENCRIPTADO con AES-256-GCM (ver lib/utils/crypto.ts).
-- Acá insertamos un texto SIN encriptar como placeholder visible para que
-- sea fácil verlo en el dashboard durante el desarrollo. Antes de pasar a
-- producción, este registro se va a reemplazar vía el ABM del panel admin
-- (que llama a `updateSystemPrompt`, el cual SÍ encripta).
--
-- Si quisieras dejarlo encriptado de entrada, corré:
--   npx tsx scripts/encrypt-string.ts "tu texto"
-- y reemplazá content_encrypted abajo por el output.
INSERT INTO system_prompts (tool_id, name, content_encrypted, is_active, version)
VALUES (
  'claude',
  'Brain principal Claude (placeholder)',
  'PLAINTEXT::Sos el asistente creativo interno de NQS. Tu rol es ayudar al equipo a optimizar prompts cortos y transformarlos en briefs detallados, claros y accionables. Mantené tono editorial, conciso, en español rioplatense.',
  TRUE,
  1
)
ON CONFLICT DO NOTHING;

-- 2) Credit pool inicial de 3DSky.
--
-- 100 créditos comprados por USD 700 (placeholder hasta que el admin cargue
-- una compra real desde el panel). `purchased_by` queda NULL porque todavía
-- no hay admin sembrado en este punto del flujo — se backfillea desde el
-- script create-users.ts si querés trazabilidad.
INSERT INTO credit_pools (tool_id, total_credits, cost_usd, purchase_note)
VALUES ('3dsky', 100, 700.00, 'Pool inicial seed — compra placeholder.')
ON CONFLICT DO NOTHING;
