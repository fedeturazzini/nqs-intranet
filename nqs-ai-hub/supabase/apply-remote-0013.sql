-- ============================================================
-- APLICAR EN SUPABASE (SQL Editor) — Migration 0013
-- Tabla claude_files: registro de archivos generados por Claude.
-- Equivale a 0013_claude_files.sql.
--
-- ⚠️ DB compartida dev/prod (Strategy A): esto crea la tabla en la base que
-- usan los dos. Es aditivo (CREATE TABLE nuevo) → no afecta nada existente.
-- ============================================================
CREATE TABLE IF NOT EXISTS claude_files (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id   UUID NOT NULL REFERENCES claude_conversations(id) ON DELETE CASCADE,
  message_id        UUID REFERENCES claude_messages(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  media_type        TEXT NOT NULL,
  storage_path      TEXT NOT NULL,
  size_bytes        BIGINT,
  anthropic_file_id TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_claude_files_conv ON claude_files(conversation_id);
CREATE INDEX IF NOT EXISTS idx_claude_files_user ON claude_files(user_id);

-- Verificar:
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'claude_files' ORDER BY ordinal_position;
