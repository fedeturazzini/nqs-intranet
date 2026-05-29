-- ============================================================
-- NQS AI Hub — Storage bucket para uploads de Claude
-- ============================================================
-- Bucket PRIVADO. Las imágenes que el empleado adjunta en el chat de
-- Claude se suben acá vía signed upload URLs (generadas por el backend),
-- y se leen vía signed download URLs (1h de expiración).
--
-- Estructura de paths: user_{userId}/{conversationId|new}/{uuid}.{ext}
--
-- El backend usa service_role (bypasea RLS), así que las policies de
-- abajo son defense-in-depth: si alguien tuviera la anon key e intentara
-- subir/leer directo, solo puede tocar su propio subfolder.
-- ============================================================

-- 1) Bucket privado (idempotente)
INSERT INTO storage.buckets (id, name, public)
VALUES ('claude-uploads', 'claude-uploads', false)
ON CONFLICT (id) DO NOTHING;

-- 2) RLS policies sobre storage.objects para el rol `authenticated`.
--    El primer segmento del path debe ser 'user_{auth.uid()}'.
--    (storage.foldername(name) devuelve el array de carpetas del path.)

DROP POLICY IF EXISTS claude_uploads_insert_own ON storage.objects;
CREATE POLICY claude_uploads_insert_own ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'claude-uploads'
    AND (storage.foldername(name))[1] = 'user_' || auth.uid()::text
  );

DROP POLICY IF EXISTS claude_uploads_select_own ON storage.objects;
CREATE POLICY claude_uploads_select_own ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'claude-uploads'
    AND (storage.foldername(name))[1] = 'user_' || auth.uid()::text
  );

DROP POLICY IF EXISTS claude_uploads_update_own ON storage.objects;
CREATE POLICY claude_uploads_update_own ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'claude-uploads'
    AND (storage.foldername(name))[1] = 'user_' || auth.uid()::text
  );

DROP POLICY IF EXISTS claude_uploads_delete_own ON storage.objects;
CREATE POLICY claude_uploads_delete_own ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'claude-uploads'
    AND (storage.foldername(name))[1] = 'user_' || auth.uid()::text
  );
