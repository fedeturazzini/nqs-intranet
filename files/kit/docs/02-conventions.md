# 02 — Convenciones de código

> Reglas de cómo escribir código en este proyecto. Si la IA se desvía, pegale este archivo y se realinea.

## Lenguaje y formato

- **TypeScript estricto**. Nada de `any`. Usar `unknown` si realmente no se sabe el tipo.
- **No usar `interface`, usar `type`** salvo cuando se necesite extender clases.
- **Imports absolutos** con alias `@/*` (ya configurado en `tsconfig.json`).
- **Formato**: Prettier con configuración default + 2 espacios + sin punto y coma final no se usa, usar punto y coma.

## Estructura de archivos

```
src/
├── app/                        ← Next.js App Router
│   ├── (auth)/                 ← rutas de auth (login)
│   │   └── login/page.tsx
│   ├── (dashboard)/            ← rutas autenticadas
│   │   ├── layout.tsx          ← layout con topbar + marquee
│   │   ├── hub/page.tsx        ← hub principal
│   │   ├── tool/[toolId]/page.tsx
│   │   └── admin/
│   │       ├── layout.tsx
│   │       ├── page.tsx        ← overview
│   │       ├── users/page.tsx
│   │       ├── credits/page.tsx
│   │       └── prompt/page.tsx
│   ├── api/                    ← API routes
│   │   ├── auth/
│   │   ├── tools/[toolId]/
│   │   ├── admin/
│   │   └── me/
│   └── layout.tsx              ← root layout
├── components/
│   ├── ui/                     ← primitivos
│   ├── tool/                   ← componentes de tool
│   ├── admin/                  ← componentes admin
│   └── screens/                ← pantallas completas (login, hub, etc.)
├── lib/
│   ├── adapters/               ← ToolAdapters
│   ├── middleware/             ← middlewares
│   ├── db/                     ← queries DB
│   ├── anthropic/              ← cliente Anthropic
│   └── utils/                  ← helpers
├── styles/
│   ├── globals.css             ← reset + variables CSS del cliente
│   ├── components.css          ← clases custom del cliente (.btn, .card, etc.)
│   └── screens.css             ← clases específicas de pantallas
└── types/
    └── db.ts                   ← tipos generados desde DB
```

## Server vs Client Components

**Default: Server Component**. Solo usar `"use client"` cuando se necesite:
- `useState`, `useEffect`, `useRef`
- Event handlers (`onClick`, `onChange`)
- APIs del browser (`localStorage`, `window`)
- Hooks de librerías cliente

## Naming

- **Componentes**: `PascalCase` (`ToolCard`, `LoginScreen`).
- **Hooks**: `camelCase` con prefijo `use` (`useToolAccess`).
- **Utils**: `camelCase` (`formatTokens`, `decryptPrompt`).
- **Types**: `PascalCase` (`type ToolAccess`, `type User`).
- **Constants**: `SCREAMING_SNAKE_CASE` (`TOOL_IDS`, `MAX_IMAGES_PER_REQUEST`).
- **API routes**: `kebab-case` (`/api/tools/check-credits`).
- **DB**: `snake_case` para tablas y columnas (`tool_access`, `created_at`).

## Estilos

**Tres capas convivientes**:

1. **Tailwind**: para utilities one-off (`flex`, `gap-4`, `mt-2`).
2. **CSS del cliente**: las clases custom que ya tiene (`.btn`, `.card`, `.t-eyebrow`, `.tag`) se mantienen tal cual. Se importan desde `styles/components.css`.
3. **CSS modules**: solo si una pantalla tiene estilos muy específicos y no encaja en lo anterior.

**Regla**: si el diseño del cliente usa `.btn`, usá `.btn`. No reinventés con `bg-yellow-400 px-4 py-2 ...`.

## TypeScript

```typescript
// ✅ Bien
type ToolId = 'claude' | 'weavy' | 'kling' | 'runway' | 'elevenlabs' | 'highsfield' | '3dsky';

type AccessStatus = 'active' | 'pending' | 'locked' | 'expired';

type Tool = {
  id: ToolId
  name: string
  category: string
  description: string
  color: string
  glyph: string
};

// ❌ Mal
interface Tool {
  id: any;  // no any nunca
  name: string;
  // ...
}
```

## Manejo de errores

```typescript
// ✅ Bien — Result type para operaciones que pueden fallar
type Result<T, E = Error> = 
  | { ok: true; value: T }
  | { ok: false; error: E };

async function executeClause(input: string): Promise<Result<string>> {
  try {
    const response = await anthropic.messages.create(...);
    return { ok: true, value: response.content[0].text };
  } catch (error) {
    return { ok: false, error: error as Error };
  }
}

// ❌ Mal — throw que no se sabe si está manejado
async function executeClause(input: string): Promise<string> {
  const response = await anthropic.messages.create(...);
  return response.content[0].text;
}
```

## Async/await sobre promises

```typescript
// ✅
const user = await getUser(id);

// ❌
getUser(id).then(user => {...});
```

## Queries a DB

**Siempre tipadas** con los types generados de Supabase. Generar con:

```bash
npx supabase gen types typescript --project-id <id> > src/types/db.ts
```

```typescript
// ✅
const { data: users, error } = await supabase
  .from('users')
  .select('*')
  .eq('role', 'employee');

// El type de users ya viene tipado automáticamente.
```

## Logs y debugging

**Producción**: nada de `console.log` quedando en código. Solo loggers estructurados.

```typescript
// lib/logger.ts
export const logger = {
  info: (msg: string, meta?: object) => console.log(JSON.stringify({ level: 'info', msg, ...meta })),
  error: (msg: string, error: Error, meta?: object) => console.error(JSON.stringify({ level: 'error', msg, error: error.message, stack: error.stack, ...meta })),
};
```

## Tests

**Solo en lo crítico**:
- `lib/anthropic/*` — cliente de Claude (mock de Anthropic SDK).
- `lib/middleware/permissions.ts` — middleware de permisos.
- `lib/adapters/three-dsky.ts` — manejo de créditos (no quemar plata por bug).
- API routes que descuentan créditos.

**Framework**: Vitest (más rápido que Jest, mismas APIs).

## Commits

Prefijos tipo Conventional Commits:
- `feat:` nueva funcionalidad
- `fix:` bug fix
- `refactor:` reorganización sin cambio de comportamiento
- `chore:` tareas de mantenimiento (deps, config)
- `docs:` documentación

Ejemplo:
```
feat(claude): wrapper de API con soporte multimodal
fix(credits): bug donde se descontaba el doble
```

## Reglas críticas (NO romper estas)

1. **El prompt padre NUNCA en el cliente.** No en variables JS, no en HTML, no en respuestas API. Solo en backend.

2. **Service role key NUNCA en el cliente.** Solo en API routes (server side).

3. **API key de Anthropic NUNCA en el cliente.** Solo en server side.

4. **Validación de permisos en server, no en cliente.** El cliente puede ocultar botones, pero el endpoint igual valida.

5. **RLS de Supabase siempre activado.** Defense in depth.

6. **Cada llamada a Anthropic se loguea** en `usage_logs`. Sin excepciones. Si falla el log, falla la operación entera (transacción).

7. **Nunca cambiar el schema de DB sin migrations.** Usar Supabase migrations.

8. **Nunca pushear directo a `main`.** PR + review (aunque sea uno mismo revisando).

## Próximo paso

Leer `03-checklist.md` para ver el plan completo de tareas.
