# Sesión 02 — Database schema completo + seeds

## ⚠️ ANTES DE EMPEZAR — PEDIRLE AL CLIENTE

### Lo que NQS tiene que aportar:

- [ ] **Lista de empleados iniciales** para los seeds (mínimo 2-3 personas):
  - Nombre completo
  - Email
  - Departamento
  - Rol (admin / employee)
  - A qué tools tendría acceso por default
- [ ] **Contenido del prompt padre actual** de Claude (lo que tienen hoy en el Project de Claude.ai)
  - Lo recibís por canal seguro (NUNCA por WhatsApp/mail común)
  - Es lo más sensible del proyecto

### Mensaje sugerido para mandarle al cliente:

> Ver template **"2.1 — Antes de sesión 02"** en `docs/05-client-comms-template.md`.

### Por qué importa:

- Sin el prompt padre, podés seedar la DB con un placeholder, pero Claude no va a funcionar como NQS espera hasta que lo cargues.
- Sin la lista de empleados, podés usar usuarios dummy, pero el cliente no va a poder testear con datos reales.

**No es bloqueante, pero ideal antes de arrancar.**

---

## Objetivo de la sesión

Crear todo el schema de DB en Supabase, configurar RLS, sembrar datos iniciales (admin de prueba, las 7 tools, un employee de prueba).

**Duración estimada**: 2-3 horas
**Output**: DB lista en Supabase con todas las tablas del roadmap, datos seed y types TypeScript generados.

---

## CONTEXTO PARA LA IA

Tener referenciados:
- `progress-01.md` (estado actual)
- `kit/reference/db-schema.sql` (schema completo)
- `kit/docs/01-architecture.md` sección "Schema de DB completo"

---

## PROMPT

```
Vamos con la sesión 02 del proyecto NQS AI Hub.

ESTADO ACTUAL:
Leé `progress-01.md` para entender qué se hizo en la sesión anterior.

OBJETIVO DE ESTA SESIÓN:
Crear toda la DB en Supabase, con todas las tablas del roadmap completo (no solo MVP), seeds iniciales y types generados.

PASOS:

1. Asumimos que ya tenés un proyecto creado en Supabase Cloud (el usuario lo crea manualmente).
   El usuario te va a dar:
   - SUPABASE_URL
   - SUPABASE_ANON_KEY
   - SUPABASE_SERVICE_ROLE_KEY
   Y los pega en .env.local.

2. Instalar Supabase CLI local:
   - `npm install -D supabase`
   - `npx supabase init` (esto crea carpeta /supabase)

3. Crear migration con el schema completo:
   - Tomar el SQL de `kit/reference/db-schema.sql`
   - Crear `supabase/migrations/0001_initial_schema.sql` con todo el SQL.

4. Verificar que el schema cubre:
   - Tablas core: users, tools, tool_access, system_prompts
   - Tablas Claude: claude_conversations, claude_messages
   - Tablas créditos: credit_pools, credit_allocations, credit_transactions
   - Tabla logs: usage_logs
   - Tablas FUTURE (vacías): access_requests, time_windows, security_events, screenshots
   - Tipos enum
   - Índices
   - RLS policies básicas
   - Triggers de updated_at

5. Crear seed file en `supabase/seed.sql`:
   - 1 admin: email `tomas@nqs.test`, password `nqs2026admin` (hash bcrypt)
   - 2 employees: 
     - `sofia@nqs.test` / `nqs2026sofia`
     - `bruno@nqs.test` / `nqs2026bruno`
   - Los 7 tools del INSERT que ya está en db-schema.sql
   - tool_access activo para los employees en claude y 3dsky
   - 1 system_prompt de prueba en claude (texto placeholder cifrado básico)
   - credit_pool inicial de 100 créditos 3DSky
   - credit_allocations: 30 a Sofía, 20 a Bruno, 0 used

   NOTA: para los passwords en seeds usamos hashes que Supabase Auth puede leer. La forma más simple:
   - Insertar directo en auth.users con la función `auth.create_user()` de Supabase, o
   - Crear los usuarios desde el dashboard de Supabase manualmente y solo sembrar nuestra tabla `users` con los IDs correspondientes.
   
   Recomendación: que el usuario los cree manualmente desde el Dashboard de Supabase Auth, y la seed solo agregue el registro en la tabla `users` con el mismo UUID.

6. Aplicar la migration:
   - El usuario ejecuta: `npx supabase db push --db-url <URL_REMOTA>`
   - O usa el SQL Editor de Supabase Cloud y pega el SQL ahí.

7. Generar tipos TypeScript:
   - `npx supabase gen types typescript --project-id <ID> > src/types/db.ts`
   - El usuario te pasa el project-id.

8. Crear helpers de DB en `src/lib/db/`:
   - `src/lib/db/supabase.ts` (ya existe, validar que está bien)
   - `src/lib/db/queries/users.ts` con funciones helper:
     - `getUserById(id: string)`
     - `getUserByEmail(email: string)`
     - `listUsers()`
   - `src/lib/db/queries/tools.ts`:
     - `getToolById(id: ToolId)`
     - `listTools()`
     - `getToolAccess(userId: string, toolId: ToolId)`
   - `src/lib/db/queries/system-prompts.ts`:
     - `getActiveSystemPrompt(toolId: ToolId)` (devuelve el content desencriptado)
     - `updateSystemPrompt(id: string, content: string)` (encripta antes de guardar)

9. Crear utilidad de encriptación en `src/lib/utils/crypto.ts`:
   - Usar Node.js crypto built-in.
   - AES-256-GCM con clave maestra en env: `ENCRYPTION_KEY`.
   - Funciones: `encrypt(plaintext: string): string` y `decrypt(ciphertext: string): string`.
   - El formato del output incluye IV + ciphertext + auth tag.

10. Agregar `ENCRYPTION_KEY` a `.env.local`:
    - Generar una key random de 32 bytes: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
    - El usuario la pega en `.env.local`.

11. Test rápido: crear un script `scripts/test-db.ts` que:
    - Conecte a la DB
    - Liste los users
    - Liste los tools
    - Lea el system_prompt activo de Claude (desencriptado)
    - Imprima todo en consola

    Ejecutarlo con `npx tsx scripts/test-db.ts` (instalar `tsx` como dev dep).

12. Commit.

REGLAS:
- TypeScript estricto. Usar los types generados de db.ts.
- Validar que los seeds funcionan (corré el script de test).
- El ENCRYPTION_KEY NUNCA se commitea.

AL FINAL:
Generá `progress-02.md` con:
- Schema aplicado a Supabase (cuál proyecto)
- Usuarios creados
- Cómo se ven los datos seeds
- Test script que pasa
- Próximo paso: `prompts/mvp/03-auth.md`
```

---

## VALIDACIÓN POST-SESIÓN

- [ ] Schema aplicado correctamente en Supabase (chequear desde el Dashboard)
- [ ] Las 13 tablas existen
- [ ] RLS está activado en todas
- [ ] Seeds cargaron correctamente
- [ ] `npx tsx scripts/test-db.ts` corre y muestra los datos
- [ ] `src/types/db.ts` generado y con todos los types
- [ ] `progress-02.md` listo

## Próximo paso

`prompts/mvp/03-auth.md`
