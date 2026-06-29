-- ============================================================
-- APLICAR EN SUPABASE (SQL Editor) — Migration 0012
-- FK para poder eliminar un usuario definitivamente (hard delete).
-- Equivale a 0012_user_hard_delete_fks.sql. Idempotente (se puede correr
-- varias veces). No cambia columnas → NO hace falta regenerar types.
--
-- Es backward-compatible: solo cambia QUÉ pasa al borrar un user. El código
-- viejo nunca hace hard-delete, así que no afecta nada existente.
-- ============================================================
DO $$
DECLARE
  rec   RECORD;
  fk_nm TEXT;
BEGIN
  FOR rec IN
    SELECT * FROM (VALUES
      ('usage_logs',          'user_id',      'CASCADE'),
      ('access_requests',     'user_id',      'CASCADE'),
      ('credit_transactions', 'user_id',      'CASCADE'),
      ('security_events',     'user_id',      'CASCADE'),
      ('screenshots',         'user_id',      'CASCADE'),
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

-- Verificación (todas deben mostrar el ON DELETE esperado):
-- SELECT con.conname, rel.relname AS tabla, con.confdeltype
-- FROM pg_constraint con JOIN pg_class rel ON rel.oid = con.conrelid
-- WHERE con.contype='f' AND con.confrelid='public.users'::regclass
-- ORDER BY rel.relname;
-- (confdeltype: c=CASCADE, n=SET NULL, a=NO ACTION)
