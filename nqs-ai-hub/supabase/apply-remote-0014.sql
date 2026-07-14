-- ============================================================
-- APLICAR EN SUPABASE (SQL Editor) — Migration 0014
-- Organigrama híbrido etapa 1: cajas de área + overrides de posición.
-- Equivale a 0014_org_layout.sql. Aditivo (CREATE TABLE + ADD COLUMN IF NOT
-- EXISTS) → no afecta nada existente. Probar en develop (DB compartida dev/prod).
-- ============================================================
CREATE TABLE IF NOT EXISTS org_dept_nodes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  department       TEXT,
  parent_person_id UUID REFERENCES users(id) ON DELETE CASCADE,
  accent           TEXT,
  sort_order       INTEGER,
  org_x            INTEGER,
  org_y            INTEGER,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_org_dept_parent ON org_dept_nodes(parent_person_id);

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS org_x INTEGER,
  ADD COLUMN IF NOT EXISTS org_y INTEGER;

-- Verificar:
-- SELECT column_name FROM information_schema.columns WHERE table_name='org_dept_nodes';
-- SELECT column_name FROM information_schema.columns WHERE table_name='users' AND column_name IN ('org_x','org_y');
