# Dev handoff — NQS AI Hub

Documentación técnica para quien retome el código.

## Stack

| Capa | Tech |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) + React 19 + TypeScript estricto |
| Backend | Next.js API Routes (Node runtime) |
| DB | PostgreSQL via Supabase |
| Auth | Supabase Auth (email/password) + cookies httpOnly |
| Storage | Supabase Storage (bucket privado `claude-uploads`) |
| LLM | Anthropic SDK (`@anthropic-ai/sdk`) |
| Estilos | CSS del cliente (`components.css` + `screens.css`) + Tailwind v4 para utilities |
| Estado UI | Zustand (solo toasts) + hooks locales |
| Tests | Vitest |
| Deploy | Vercel (región gru1) |

## Correr local

```bash
cd nqs-ai-hub
npm install
# completar .env.local (ver más abajo)
npm run dev          # http://localhost:3000
npm test             # 57 tests
npm run typecheck
npm run build
```

> **OJO con `ANTHROPIC_API_KEY`**: si corrés `npm run dev` desde un shell que ya tiene esa variable exportada (vacía o no), Next NO la sobreescribe con la del `.env.local`. Verificá con `echo "${ANTHROPIC_API_KEY:-VACIA}"` — debería decir VACIA en tu terminal. Si no, removela de tu `~/.zshrc`.

## Variables de entorno

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
ENCRYPTION_KEY=          # 32 bytes hex — NO cambiar sin re-encriptar system_prompts
NEXT_PUBLIC_APP_URL=
SLACK_WEBHOOK_URL=       # opcional; sin esto las notifs se loguean "skipped"
```

`ENCRYPTION_KEY` se genera con:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Arquitectura

```
src/
├── app/
│   ├── (auth)/login          ← login (público)
│   ├── (dashboard)/           ← rutas autenticadas (layout con topbar+marquee+toast)
│   │   ├── hub                ← grid de tools
│   │   ├── tool/[toolId]      ← dispatcher (claude); /tool/3dsky es ruta dedicada
│   │   └── admin/*            ← panel admin (layout valida rol)
│   └── api/
│       ├── auth/*             ← login/logout/session
│       ├── me/*               ← endpoints del user actual
│       ├── tools/*            ← claude/execute, claude/upload-url, 3dsky/*
│       └── admin/*            ← todo lo de admin (gated por requireAdminApi)
├── components/{ui,tool,admin,screens}
├── lib/
│   ├── adapters/              ← ToolAdapter pattern (claude, three-dsky, placeholders)
│   ├── anthropic/             ← cliente + callClaude
│   ├── auth/                  ← getSession/requireAuth/requireAdmin + admin-guard
│   ├── db/                    ← supabase clients + queries
│   ├── middleware/            ← canUseTool (permisos centralizados)
│   ├── notifications/         ← slack
│   ├── storage/               ← claude-uploads (signed URLs)
│   ├── store/                 ← zustand (toast)
│   └── utils/                 ← crypto, images, schedule
├── proxy.ts                   ← Next 16 "proxy" (ex-middleware): gate de auth
└── types/                     ← db.ts (autogen) + db-aliases.ts (semánticos)
```

### Piezas clave

**ToolAdapter pattern** (`lib/adapters/`). Cada tool implementa la interfaz de `types.ts`. Agregar una tool = crear el adapter + registrarlo en `index.ts`. Ver `kit/reference/tool-adapter-pattern.ts`.

```ts
// Para sumar Weavy, por ejemplo:
// 1. crear src/lib/adapters/weavy.ts implementando ToolAdapter
// 2. en src/lib/adapters/index.ts: reemplazar createPlaceholderAdapter("weavy", "visual")
//    por el weavyAdapter real
// 3. UPDATE tools SET is_active = true WHERE id = 'weavy'
// El Hub, permisos, logs, etc. ya lo soportan sin cambios.
```

**Middleware de permisos** (`lib/middleware/permissions.ts`). UN solo `canUseTool(userId, toolId)`. Checks secuenciales: auth → access → expired → horario → créditos. Para sumar una regla nueva: agregá un check más en orden. Todos los endpoints pasan por `requireToolAccess()`.

**Auth**. Cookies httpOnly `sb-access-token` + `sb-refresh-token`. `getSession()` valida el JWT contra Supabase y resuelve rol desde `public.users` (no confía en JWT metadata). Cacheado por request con `React.cache()`. El `proxy.ts` solo chequea presencia de cookie (gate barato); la validación real es por página/endpoint.

**System prompt + memoria**. `system_prompts` con columna `type` (`system`|`memory`). El adapter de Claude levanta ambos activos y los concatena con tags `<system_prompt>` / `<workspace_memory>`. Encriptados at-rest (AES-256-GCM).

**Imágenes**. Cliente → Storage directo (signed upload URLs), manda paths al execute, el backend firma download URLs (1h) para Anthropic. Esto esquiva el límite de 4.5MB de Vercel. Ver `lib/storage/claude-uploads.ts`.

## DB / migrations

Migrations en `supabase/migrations/` (0001 → 0007). Se aplican pegando el SQL en el Supabase SQL Editor (no usamos el CLI linkeado — falta PAT). Los archivos `apply-remote-*.sql` son copias listas para pegar.

```
0001 schema base (13 tablas, RLS, is_admin())
0002 3dsky: schedule, module_sessions, consume_credit_atomic (RPC)
0003 system_prompts.model     ← nombres de modelo INCORRECTOS
0004 fix nombres de modelo     ← corrige 0003 (Sonnet 4.6, Opus 4.7)
0005 users.theme_preference
0006 system_prompts.type (system|memory)
0007 access_requests.request_type + exceptional_duration_minutes
apply-remote-storage.sql  bucket claude-uploads + RLS
```

Types: `src/types/db.ts` es output de `supabase gen types` (editado a mano cuando no había PAT). `db-aliases.ts` tiene los nombres semánticos (`UserRow`, `ToolId`, `ToolSchedule`, etc.). Regenerar:
```bash
npx supabase login
npx supabase gen types typescript --project-id nslliqinzpqjiysjlulm > src/types/db.ts
# después revisar db-aliases.ts por si sumaste tablas/enums
```

## Decisiones técnicas

- **TS estricto, `type` sobre `interface`, imports `@/*`.** Sin `any`.
- **Server Components por default**, `"use client"` solo donde hay interactividad.
- **Result<T,E>** en operaciones que pueden fallar (adapters), en vez de throws sueltos.
- **No transacciones reales en Supabase JS**: el consumo de créditos usa el RPC `consume_credit_atomic` (Postgres, `SELECT … FOR UPDATE`). La persistencia de mensajes de Claude es best-effort (si falla post-API, el user igual recibe la respuesta — ya pagamos los tokens).
- **service_role solo en backend.** El cliente del browser usa anon key (y casi no se usa — todo va por API routes).

## Rollback

- Vercel: Deployments → Promote to Production de un deploy anterior (instantáneo).
- Código: `git revert <sha>` + push.
- Prompt de Claude: `/admin/prompt` → activar una versión anterior del historial.

## Tests

```bash
npm test               # 57 tests, 7 archivos
npm run test:coverage  # coverage (críticos > 70%)
npm run db:race-test   # race condition del RPC de créditos (contra DB real)
```

Cobertura: crypto 93% · anthropic/client 96% · permissions 91% · auth 95% · slack 90% · schedule 100%.

## Scripts útiles

```bash
npm run db:seed-users   # crea/idempotente los 3 seed users (auth + public + accesos)
npm run db:test         # smoke contra la DB (lista users, tools, prompt, access)
npm run db:race-test    # 15 consumos paralelos sobre el RPC atómico
```
