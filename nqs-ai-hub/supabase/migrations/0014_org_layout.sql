-- ============================================================
-- NQS AI Hub — Migration 0014
-- Organigrama híbrido (etapa 1): cajas de área + overrides de posición.
--
--   - org_dept_nodes: las "cajas" de área (People, Production, Modeling…) que
--     NO son personas. Cuelgan de una persona (parent_person_id) y agrupan a sus
--     reportes por department. Antes no existían en el modelo.
--   - override de posición: org_x / org_y (nullable) en users y en org_dept_nodes.
--     NULL = usar la posición CALCULADA por el auto-layout. Con valor = pisa el
--     cálculo (posición = override ?? auto). Ésta es la clave del híbrido.
--
-- No toca nada de lo existente (reports_to_id, org_position, etc. siguen igual).
-- ============================================================

-- Cajas de área (no-personas).
CREATE TABLE org_dept_nodes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,             -- "People", "Production", "3D"…
  department       TEXT,                      -- opcional; linkea con DEPARTMENTS
                                              -- (para agrupar reportes por dept)
  parent_person_id UUID REFERENCES users(id) ON DELETE CASCADE, -- de quién cuelga
  accent           TEXT,                      -- color hex de la caja
  sort_order       INTEGER,                   -- orden entre cajas del mismo padre
  org_x            INTEGER,                   -- override manual (null = auto)
  org_y            INTEGER,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_org_dept_parent ON org_dept_nodes(parent_person_id);

-- Overrides de posición para las personas.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS org_x INTEGER,
  ADD COLUMN IF NOT EXISTS org_y INTEGER;
