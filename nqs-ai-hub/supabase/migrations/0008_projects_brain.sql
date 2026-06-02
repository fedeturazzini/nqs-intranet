-- ============================================================
-- NQS AI Hub — Migration 0008
-- Sistema de Proyectos + Brain config + proyecto activo por usuario.
--
--   - projects: proyectos COMPARTIDOS del estudio (Reframes, Kling, …).
--   - system_prompts.project_id: cada proyecto tiene su system + memoria.
--   - brain_config: password (bcrypt) que protege el "System Brain".
--   - user_active_project: el proyecto activo de cada usuario.
--
-- Aplicar en Supabase SQL Editor (Run). Idempotente: se puede re-correr.
--
-- ⚠️ El hash de la password del Brain ("bigsteps") NO se siembra acá; se
-- inserta con el script TS `scripts/seed-brain-password.ts` (bcrypt) DESPUÉS
-- de aplicar esta migration.
--
-- Nota de prod-safety: NO se crean system_prompts activos nuevos. Solo se
-- asocia el system/memoria EXISTENTE de Claude a "Reframes". Los demás
-- proyectos seed arrancan sin prompt y se llenan desde el editor del Brain.
-- ============================================================

-- ─── a) projects ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  description TEXT,
  icon        TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projects_slug   ON projects(slug);
CREATE INDEX IF NOT EXISTS idx_projects_active ON projects(is_active);

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'projects' AND policyname = 'projects_read_all'
  ) THEN
    CREATE POLICY projects_read_all ON projects FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'projects' AND policyname = 'projects_admin_write'
  ) THEN
    CREATE POLICY projects_admin_write ON projects FOR ALL USING (public.is_admin());
  END IF;
END $$;

-- ─── b) system_prompts.project_id ────────────────────────────
ALTER TABLE system_prompts
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_system_prompts_project ON system_prompts(project_id);

-- ─── c) brain_config ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS brain_config (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  password_hash TEXT NOT NULL,
  updated_by    UUID REFERENCES users(id),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE brain_config ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'brain_config' AND policyname = 'brain_config_admin_only'
  ) THEN
    CREATE POLICY brain_config_admin_only ON brain_config FOR ALL USING (public.is_admin());
  END IF;
END $$;

-- ─── e) user_active_project ──────────────────────────────────
CREATE TABLE IF NOT EXISTS user_active_project (
  user_id    UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE user_active_project ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'user_active_project' AND policyname = 'user_active_project_own'
  ) THEN
    CREATE POLICY user_active_project_own ON user_active_project
      FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

-- ─── d) seed de proyectos iniciales ──────────────────────────
INSERT INTO projects (name, slug, description, icon, is_active)
VALUES
  ('Reframes', 'reframes', 'Análisis y reformulación de renders arquitectónicos', '🎬', true),
  ('Kling',    'kling',    'Generación de video AI con dirección de arte',        '🎥', true),
  ('Film',     'film',     'Producción de contenido cinematográfico',            '🎞️', true),
  ('Seedance', 'seedance', 'Animaciones y motion graphics',                      '💫', true)
ON CONFLICT (slug) DO NOTHING;

-- ─── 1.4) asociar el system/memoria EXISTENTE de Claude a Reframes ──
-- Los system_prompts que ya existían (sin project_id) pasan a ser los de
-- Reframes (proyecto default). NO creamos prompts nuevos: así el código
-- viejo en prod sigue resolviendo exactamente 1 system activo de Claude.
UPDATE system_prompts
SET project_id = (SELECT id FROM projects WHERE slug = 'reframes')
WHERE tool_id = 'claude' AND project_id IS NULL;

-- ============================================================
-- FIN migration 0008.
-- Próximo paso (fuera de SQL):
--   npx tsx scripts/seed-brain-password.ts   → siembra el hash de "bigsteps"
-- ============================================================
