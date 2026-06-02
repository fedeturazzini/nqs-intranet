-- ============================================================
-- NQS AI Hub — Migration 0009
-- Historial de Claude por proyecto: claude_conversations.project_id.
--
-- Cada conversación pertenece a un proyecto. Las existentes se migran a
-- "Reframes" (default) para no perder data. Al borrar un proyecto, sus
-- conversaciones quedan con project_id = NULL ("Sin proyecto").
--
-- Aplicar en Supabase SQL Editor (Run). Idempotente.
-- ============================================================

ALTER TABLE claude_conversations
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_claude_conversations_user_project
  ON claude_conversations(user_id, project_id);

-- Migrar conversaciones existentes (sin proyecto) a Reframes.
UPDATE claude_conversations
SET project_id = (SELECT id FROM projects WHERE slug = 'reframes' LIMIT 1)
WHERE project_id IS NULL;

-- ============================================================
-- FIN migration 0009.
-- ============================================================
