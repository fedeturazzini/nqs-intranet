-- ============================================================
-- NQS AI Hub — Migration 0013
-- Registro de archivos generados por Claude (code execution → Files API →
-- Supabase Storage). Etapa 2 de la generación de archivos reales.
--
-- El binario vive en el bucket `claude-uploads` (mismo que las imágenes); acá
-- guardamos solo el metadata + el `storage_path` (la URL se firma on-demand).
-- FKs con ON DELETE CASCADE (consistente con el resto del esquema): si se borra
-- la conversación / el mensaje / el user, sus archivos caen.
-- ============================================================
CREATE TABLE claude_files (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id   UUID NOT NULL REFERENCES claude_conversations(id) ON DELETE CASCADE,
  message_id        UUID REFERENCES claude_messages(id) ON DELETE CASCADE, -- nullable
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,          -- nombre original del archivo
  media_type        TEXT NOT NULL,          -- mime (application/pdf, ...)
  storage_path      TEXT NOT NULL,          -- path dentro de claude-uploads
  size_bytes        BIGINT,
  anthropic_file_id TEXT,                   -- file_id de la Files API (efímero, 24h)
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_claude_files_conv ON claude_files(conversation_id);
CREATE INDEX idx_claude_files_user ON claude_files(user_id);
