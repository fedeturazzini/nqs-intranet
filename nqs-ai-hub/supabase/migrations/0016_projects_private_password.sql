-- 0016 — Proyectos privados con contraseña
--
-- Contexto: aux-proyectos-privados-password. Un proyecto puede ser PRIVADO
-- (con contraseña, visible solo el nombre) o ABIERTO (como hoy). Reusa el
-- patrón del System Brain (bcrypt + cookie httpOnly firmada, 30 min), pero la
-- cookie lleva { projectId, gateVersion } firmado y el server valida que
-- gateVersion coincida con projects.gate_version. Al cambiar la contraseña o
-- pasar a abierto → gate_version++ → las cookies viejas dejan de validar solas
-- (una cookie httpOnly no se puede borrar desde el server).
--
-- Aditiva, nullable/con default, idempotente. Los proyectos existentes quedan
-- is_private=false → nada cambia para ellos. NO toca brain_config.
-- Aplicar en el SQL Editor de Supabase (el CLI no está linkeado — ver progress-02).

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS is_private    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS password_hash TEXT,
  ADD COLUMN IF NOT EXISTS gate_version  INTEGER NOT NULL DEFAULT 1;

COMMENT ON COLUMN projects.is_private IS
  'true = proyecto privado (contenido protegido por contraseña; el nombre sigue visible).';
COMMENT ON COLUMN projects.password_hash IS
  'bcrypt de la contraseña del proyecto (rounds 10). null si is_private=false.';
COMMENT ON COLUMN projects.gate_version IS
  'Se incrementa al cambiar la contraseña o pasar a abierto; invalida las cookies de gate vigentes.';
