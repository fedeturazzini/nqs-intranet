# Progress 02 — Database schema completo + seeds

**Fecha**: 2026-05-23
**Duración real**: ~1.5 horas
**Sesión anterior**: `progress-01.md`
**Próxima sesión**: `kit/prompts/mvp/03-auth.md`

## Qué se construyó

- Schema completo aplicado en Supabase Cloud (proyecto `nslliqinzpqjiysjlulm`): 13 tablas, 7 tipos enum, índices, RLS habilitado en las 13, 4 policies, 4 triggers `updated_at` y 1 view `user_credits_view`.
- Migration única `supabase/migrations/0001_initial_schema.sql` derivada de `kit/reference/db-schema.sql` con un fix de RLS recursiva (ver decisiones).
- Seed SQL (`supabase/seed.sql`) — `system_prompts` placeholder de Claude + `credit_pool` 3DSky de 100 créditos.
- Script TypeScript `scripts/create-users.ts` — crea idempotentemente 3 users (auth + `public.users` + `tool_access` + `credit_allocations`).
- Crypto util AES-256-GCM (`src/lib/utils/crypto.ts`) — formato `v1.<iv>.<ct>.<tag>` base64url. Soporta marker `PLAINTEXT::` para seeds visibles en dashboard.
- Queries server-only en `src/lib/db/queries/{users,tools,system-prompts}.ts`.
- Types hand-typed en `src/types/db.ts` compatibles con `postgrest-js` v2 (incluye `Relationships: []` en cada tabla — sin eso colapsa todo a `never`).
- Smoke test `scripts/test-db.ts` que lista users + tools, lee el system prompt desencriptado, verifica `tool_access` de Sofía. **Pasa.**
- Scripts npm: `db:seed-users`, `db:test`, `typecheck`, `format`.

## Archivos creados

```
nqs-ai-hub/
├── supabase/
│   ├── config.toml                              ← supabase init
│   ├── .gitignore                                ← supabase init
│   ├── apply-remote.sql                         ← migration + seed concatenados (paste-en-editor)
│   ├── migrations/
│   │   └── 0001_initial_schema.sql              ← schema completo (382 líneas)
│   └── seed.sql                                  ← system_prompt + credit_pool
├── scripts/
│   ├── create-users.ts                          ← crea/idempotente auth + public.users + grants
│   └── test-db.ts                               ← smoke test
├── src/
│   ├── lib/
│   │   ├── db/
│   │   │   └── queries/
│   │   │       ├── users.ts                     ← getUserById, getUserByEmail, listUsers
│   │   │       ├── tools.ts                     ← getToolById, listTools, getToolAccess
│   │   │       └── system-prompts.ts            ← getActiveSystemPrompt, updateSystemPrompt
│   │   └── utils/
│   │       └── crypto.ts                        ← AES-256-GCM encrypt/decrypt
│   └── types/
│       └── db.ts                                 ← hand-typed Database (reemplazar con gen types cuando se pueda)
└── progress-02.md                                ← este archivo
```

## Archivos modificados

- `package.json` — agregadas devDeps (`supabase`, `tsx`, `dotenv`) + 4 scripts npm (`db:seed-users`, `db:test`, `typecheck`, `format`).
- `src/lib/db/supabase.ts` — el genérico libre `Database = unknown` reemplazado por `import type { Database } from "@/types/db"`.
- `.env.local` — completado con URL + keys reales + `ENCRYPTION_KEY` generada local. **Sigue gitignored.**

## Decisiones técnicas tomadas

1. **Fix de RLS recursiva.** Las 3 policies del reference schema que hacían `EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')` provocaban `infinite recursion detected in policy for relation "users"` al aplicar la migration. La SELECT del subquery también pasa por RLS y re-entra a la misma policy. Solución estándar de Supabase: helper `public.is_admin()` con `SECURITY DEFINER` + `STABLE` que sale del contexto RLS. Las 3 policies (`users_select_own`, `tool_access_select`, `system_prompts_admin_only`) ahora la llaman. El reference schema en `files/kit/reference/db-schema.sql` queda intacto — el fix vive solo en la migration del proyecto.

2. **Keys de Supabase con el formato nuevo (`sb_publishable_*` / `sb_secret_*`).** El SDK los acepta sin distinción, así que mantuve los nombres de variable convenidos en doc 00 (`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) y pegué los nuevos valores ahí. No agregué naming extra para no propagar dos convenciones.

3. **Users seedeados via script TS, no via `seed.sql`.** El prompt sugería crearlos manualmente desde el Dashboard. Hice un script porque es idempotente, atómico, y deja `auth.users` + `public.users` + `tool_access` + `credit_allocations` sincronizados con un solo comando. Si rotan los UUIDs o se borra el proyecto, `npm run db:seed-users` reconstruye todo en 4 segundos.

4. **Marker `PLAINTEXT::` para system_prompts seed.** El placeholder del cerebro de Claude va sin encriptar (con el prefijo `PLAINTEXT::`) para que el admin lo lea cómodo desde el SQL editor durante el desarrollo. La función `decrypt()` lo detecta y devuelve plaintext. Cualquier escritura desde el panel admin pasa por `updateSystemPrompt` que SÍ encripta — el marker es solo para el seed inicial, no es un escape hatch usable desde la UI.

5. **Types hand-typed por ahora.** `npx supabase gen types --project-id <id>` necesita Personal Access Token (PAT, distinto del service role), que no tenía. Escribí `src/types/db.ts` a mano siguiendo exactamente el schema aplicado. Cuando haya PAT, se regenera con un comando y reemplaza el archivo.

6. **`Relationships: []` en cada tabla.** `postgrest-js` v2 requiere ese campo en cada `GenericTable`. Sin él, las llamadas a `.from(...).upsert/update` se tipan como `never[]` y rompen el typecheck. Usé un alias `TableDef<R, I, U>` para mantenerlo conciso.

7. **`apply-remote.sql` único en vez de pasos separados.** El CLI no podía pushear sin PAT, así que generé un archivo concatenado (migration + seed) que se pega de una sola vez en el SQL Editor. 1 paste, no 2.

## Cosas pendientes (TODO en código)

- [ ] Reemplazar `src/types/db.ts` por el autogen: `npx supabase login` (interactivo) + `npx supabase gen types typescript --project-id nslliqinzpqjiysjlulm > src/types/db.ts`. El hand-typed es funcionalmente equivalente pero el autogen suma `CompositeTypes` y relations.
- [ ] Cuando exista el ABM admin del system prompt (sesión 10), reemplazar el placeholder `PLAINTEXT::…` por el contenido real encriptado.
- [ ] Las tablas FUTURE (`access_requests`, `time_windows`, `security_events`, `screenshots`) están creadas pero no tienen policies — se agregan cuando los módulos respectivos entren en roadmap.
- [ ] Considerar agregar `bcrypt` u otro hash a nivel `public.users` si en algún momento queremos guardar tokens de API por user (no en MVP).

## Cosas a tener en cuenta para la próxima sesión

- La sesión 03 (auth) ya tiene 3 users de Supabase Auth listos para loguear: `tomas@nqs.test / nqs2026admin`, `sofia@nqs.test / nqs2026sofia`, `bruno@nqs.test / nqs2026bruno`. UUIDs reales:
  - `tomas` → `71ab6ec3-cad7-4d7e-81e2-e24702e8fd3b` (admin)
  - `sofia` → `db8f7018-c612-43f1-9da9-bfce00d12301` (employee)
  - `bruno` → `b1dc14a8-4226-46cf-8413-e29fec3ec2fe` (employee)
- Para Server Components que lean la sesión hace falta migrar a `@supabase/ssr` (cookies). Hoy `lib/db/supabase.ts` solo expone clientes "raw" (sin cookie sync). En la sesión 03 se incorpora.
- El middleware de permisos (`lib/middleware/permissions.ts`) todavía no existe — pendiente para sesión 06 (cuando arranca Claude adapter).
- RLS está activado en todo, pero las API routes usan `service_role` que la saltea. La RLS es defense-in-depth.

## Cómo probar lo que se construyó

```bash
cd nqs-ai-hub

# Si necesitás regenerar los users desde cero (idempotente):
npm run db:seed-users

# Smoke test (lo que más importa):
npm run db:test
```

Lo que debería imprimir `db:test`:
- 3 users (tomas admin, sofia y bruno employees).
- 7 tools (claude y 3dsky activos, los otros 5 inactivos).
- System prompt activo de Claude desencriptado.
- Acceso activo de Sofía a Claude, con `granted_by` apuntando al UUID del admin.

Para inspeccionar en Supabase Dashboard:
- Auth → Users: tienen que aparecer los 3 con `email_confirmed_at` no nulo.
- Table Editor → public.users: 3 filas con UUIDs que matchean los de auth.
- Table Editor → tool_access: 4 filas (2 employees × 2 tools).
- Table Editor → credit_allocations: 2 filas (sofia 30, bruno 20).
- Table Editor → system_prompts: 1 fila activa.

## Errores conocidos

- (ninguno bloqueante para sesión 03)
- Aviso: el CLI de Supabase no está linkeado al proyecto (`npx supabase link` falla por falta de PAT). Esto solo afecta a comandos del CLI tipo `db push`, `gen types`, `db diff`. El acceso por SDK (`@supabase/supabase-js`) funciona perfecto.

## Variables de entorno agregadas

```env
ENCRYPTION_KEY=<64 hex chars — generada local, gitignored>
```

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` ya estaban declaradas vacías desde sesión 01 — ahora con valores reales.

## Commits sugeridos

```
feat(db): schema completo + seeds + queries + crypto + smoke test
```

(Sesión chica, un commit alcanza.)

## Próximo paso

`kit/prompts/mvp/03-auth.md` — login con Supabase Auth, sesiones, middleware de redirección por rol.
