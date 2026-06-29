-- ============================================================
-- NQS AI Hub — Migration 0012
-- Permitir ELIMINAR un usuario definitivamente (hard delete).
--
-- Hoy varias FK a users(id) no tienen ON DELETE, así que un
-- `DELETE FROM users` falla por FK violation (ej. usage_logs). Acá:
--   - datos PROPIOS del user        → ON DELETE CASCADE (se borran con él).
--   - columnas de auditoría `*_by`   → ON DELETE SET NULL (se preserva el
--     registro, se pierde solo "quién" lo hizo).
-- Las que ya cascadeaban (tool_access.user_id, claude_conversations,
-- credit_allocations, module_sessions, user_active_project, time_windows,
-- reports_to_id) NO se tocan.
--
-- Robusto + idempotente: busca el nombre REAL de cada FK, la dropea y la
-- recrea con el ON DELETE deseado (nombre convencional `tbl_col_fkey`).
-- No cambia columnas → NO hace falta regenerar types.
-- ============================================================
DO $$
DECLARE
  rec   RECORD;
  fk_nm TEXT;
BEGIN
  FOR rec IN
    SELECT * FROM (VALUES
      -- datos propios del user → CASCADE
      ('usage_logs',          'user_id',      'CASCADE'),
      ('access_requests',     'user_id',      'CASCADE'),
      ('credit_transactions', 'user_id',      'CASCADE'),
      ('security_events',     'user_id',      'CASCADE'),
      ('screenshots',         'user_id',      'CASCADE'),
      -- auditoría (quién hizo la acción) → SET NULL
      ('tool_access',         'granted_by',   'SET NULL'),
      ('system_prompts',      'created_by',   'SET NULL'),
      ('credit_pools',        'purchased_by', 'SET NULL'),
      ('credit_transactions', 'performed_by', 'SET NULL'),
      ('access_requests',     'reviewed_by',  'SET NULL'),
      ('screenshots',         'reviewed_by',  'SET NULL'),
      ('projects',            'created_by',   'SET NULL'),
      ('brain_config',        'updated_by',   'SET NULL')
    ) AS t(tbl, col, act)
  LOOP
    -- Nombre real de la FK (tbl.col) → users
    SELECT con.conname INTO fk_nm
    FROM pg_constraint con
    JOIN pg_class rel     ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    JOIN pg_attribute att ON att.attrelid = con.conrelid
                         AND att.attnum = ANY (con.conkey)
    WHERE con.contype = 'f'
      AND nsp.nspname = 'public'
      AND rel.relname = rec.tbl
      AND att.attname = rec.col
      AND con.confrelid = 'public.users'::regclass
    LIMIT 1;

    IF fk_nm IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', rec.tbl, fk_nm);
    END IF;

    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) '
      || 'REFERENCES public.users(id) ON DELETE %s',
      rec.tbl, rec.tbl || '_' || rec.col || '_fkey', rec.col, rec.act
    );
  END LOOP;
END $$;
