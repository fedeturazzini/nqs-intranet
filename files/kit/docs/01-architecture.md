# 01 — Arquitectura escalable

> **Esta es la pieza más importante del proyecto.** Construir bien el MVP con esta arquitectura permite que sumar módulos después sea barato y rápido. Construir mal acá implica reescribir todo cuando llegue la v2.

## Principio rector

> **Todo en el MVP se diseña para los 7 módulos del roadmap, no solo para Claude.**

## Las 4 piezas críticas

### 1. Schema de DB completo

La DB se modela pensando en TODO el roadmap. Tablas que el MVP no usa, se crean igual con sus columnas básicas. Agregar una columna después es 10x más caro que dejarla vacía ahora.

Tablas que el MVP usa activamente:
- `users` — usuarios y roles
- `tools` — catálogo de herramientas (Claude, Weavy, etc.)
- `tool_access` — qué usuario tiene acceso a qué herramienta
- `system_prompts` — el cerebro de Claude (y futuros cerebros de otras tools)
- `usage_logs` — log polimórfico de cualquier acción sobre cualquier tool
- `credit_pools` — pool de créditos por tool (hoy solo 3DSky)
- `credit_allocations` — créditos asignados a cada user por tool
- `credit_transactions` — historial de movimientos de créditos
- `claude_conversations` — historial del wrapper de Claude por usuario
- `claude_messages` — mensajes de cada conversación

Tablas que se crean pero quedan inactivas para el MVP (se usan en módulos futuros):
- `access_requests` — solicitudes de acceso (módulo aprobaciones)
- `time_windows` — ventanas horarias (módulo horarios)
- `security_events` — eventos de seguridad (módulo shield)
- `screenshots` — capturas automáticas (módulo snaps)

Ver `reference/db-schema.sql` para el SQL completo.

### 2. Patrón ToolAdapter

Cada herramienta del stack (Claude, Weavy, Kling, etc.) implementa una interfaz común:

```typescript
interface ToolAdapter {
  id: string;
  name: string;
  category: 'text' | 'visual' | 'video' | 'audio' | 'assets';
  
  // Lifecycle
  checkAccess(userId: string): Promise<AccessState>;
  
  // Si la tool usa créditos
  consumeCredit?(userId: string, amount: number): Promise<void>;
  getRemainingCredits?(userId: string): Promise<number>;
  
  // Si la tool tiene API directa (Claude, futuro 3DSky con scraping)
  execute?(userId: string, params: any): Promise<any>;
  
  // Si la tool se embeber (3DSky vía iframe)
  getEmbedUrl?(userId: string): Promise<string>;
  
  // Logging
  logUsage(userId: string, action: string, metadata: any): Promise<void>;
}
```

En el MVP implementamos:
- `ClaudeAdapter` (con execute para llamar a la API)
- `ThreeDSkyAdapter` (con consumeCredit + getEmbedUrl para el proxy/iframe)
- `GenericPlaceholderAdapter` (para las 5 tools que dicen "próximamente")

Cuando hagamos Weavy, Kling, etc. en futuros módulos, solo se agrega un adapter nuevo. **El resto del sistema no cambia.**

Ver `reference/tool-adapter-pattern.ts` para el código completo.

### 3. Middleware de permisos centralizado

Hay UN solo lugar donde se valida si un usuario puede usar una herramienta. Todos los endpoints pasan por ahí.

```typescript
// middleware/permissions.ts
async function canUseTool(userId: string, toolId: string): Promise<{
  allowed: boolean;
  reason?: 'no_access' | 'no_credits' | 'outside_hours' | 'expired' | 'pending_approval';
}>
```

En el MVP, esto valida:
- ✅ Usuario tiene acceso a la herramienta (`tool_access.status === 'active'`)
- ✅ Si la tool usa créditos: tiene créditos disponibles

En módulos futuros, se agrega:
- ⏳ Validación de horario (módulo horarios)
- ⏳ Validación de solicitud aprobada (módulo aprobaciones)
- ⏳ Validación de no expirado (módulo horarios/caducidad)

**Crítico**: cada nueva regla se agrega como un check secuencial. No hay que tocar los endpoints, solo el middleware.

Ver `reference/middleware-permissions.ts` para el código completo.

### 4. Componentes UI 100% reutilizables

El diseño del cliente ya tiene componentes bien separados. Los respetamos y los hacemos genéricos:

| Componente | Uso MVP | Uso futuro |
|------------|---------|------------|
| `ToolCard` | Hub muestra Claude + 3DSky activos, otros "próximamente" | Habilita Weavy/Kling/etc cambiando un flag |
| `StatusPill` | Active/locked/pending en MVP | Suma "outside_hours" en módulo horarios |
| `StatTile` | KPIs del admin | Cualquier métrica futura |
| `BarChart` | (no se usa en MVP) | Listo para usar en panel admin completo |
| `Modal` | Solicitud de créditos, ABM usuarios | Cualquier flujo modal futuro |
| `Toast` | Notificaciones del sistema | Igual |
| `Marquee` | Frases del manifesto en topbar | Igual |

**Regla**: nunca hardcodear "Claude" o "3DSky" en un componente. Siempre recibe `tool` como prop.

## Flujo de una request (ejemplo: empleado usa Claude)

```
1. Empleado escribe prompt y aprieta enviar.

2. Frontend → POST /api/tools/claude/execute
   { prompt: "...", images: [...] }

3. API route:
   a. Verifica auth (Supabase Auth).
   b. Llama a middleware: canUseTool(userId, 'claude').
      - Si MVP: chequea tool_access.
      - Si v2 con horarios: chequea horario también.
   c. Si OK, ejecuta:
      - Obtiene system_prompt de DB (encriptado).
      - Llama a ClaudeAdapter.execute(userId, { prompt, images }).
      - El adapter llama a Anthropic API con system_prompt + user prompt.
      - Loguea uso en usage_logs.
   d. Devuelve respuesta al frontend.

4. Frontend muestra respuesta y actualiza historial.
```

**Importante**: el `system_prompt` se carga ANTES de llamar a la API, y NUNCA se devuelve al cliente. Solo se devuelve la respuesta de Claude.

## Flujo de una request (ejemplo: empleado descarga modelo en 3DSky)

```
1. Empleado entra a la vista de 3DSky en el Hub.

2. Frontend pide embed URL: GET /api/tools/3dsky/embed-url
   - Backend devuelve URL del proxy nqs (https://3dsky.nqs.com.ar/...)

3. Frontend renderiza iframe con esa URL.

4. Cuando el empleado intenta descargar un modelo dentro del iframe:
   a. El proxy NQS intercepta la request a /buy o /checkout de 3dsky.org.
   b. El proxy llama a /api/tools/3dsky/check-credits.
   c. Si tiene créditos:
      - Llama a ThreeDSkyAdapter.consumeCredit(userId, 1).
      - Resta de credit_allocations.
      - Registra credit_transaction.
      - Loguea en usage_logs.
      - Deja pasar la request al upstream (3dsky.org).
   d. Si NO tiene créditos:
      - Devuelve 402 Payment Required al iframe.
      - El frontend del iframe (que nosotros controlamos) recibe el 402.
      - Muestra el overlay de "sin créditos" + botón "solicitar más".
```

**Nota importante sobre el proxy 3DSky**: el cliente menciona en el código (líneas 211-234 de `screens.jsx`) que ya tiene embebido el sistema con un proxy `3dsky.nqs.com`. **Vos no construís el proxy** — eso ya existe del lado del cliente. Vos construís la API que el proxy consulta (`/api/tools/3dsky/check-credits`, `/api/tools/3dsky/consume-credit`) y el panel admin de gestión.

## Conventions de naming

```
Endpoints API:
  /api/auth/*                  → autenticación
  /api/tools/:toolId/*         → operaciones sobre una tool
  /api/admin/*                 → endpoints solo admin
  /api/me/*                    → endpoints del usuario actual

Componentes:
  components/ui/*              → primitivos reutilizables (Button, Card, etc.)
  components/tool/*            → componentes de tool (ToolCard, StatusPill)
  components/admin/*           → componentes solo del panel admin
  components/screens/*         → pantallas completas

Lógica de negocio:
  lib/adapters/*               → ToolAdapters
  lib/middleware/*             → middlewares
  lib/db/*                     → queries y types de DB
  lib/anthropic/*              → cliente de Anthropic API
```

## Decisiones técnicas tomadas

| Decisión | Razón |
|----------|-------|
| App Router de Next.js 15 | Server Components reducen JS al cliente y mejoran perf |
| TypeScript estricto | El proyecto va a crecer mucho, tipos te salvan |
| Supabase en vez de Postgres + Auth0 | Todo en uno, más barato, menos config |
| Service role key solo en backend | Las API routes pueden saltarse RLS cuando hace falta |
| RLS de Supabase activado | Defense in depth, aunque el backend valide |
| Imágenes vía base64 a Anthropic | No hay que persistirlas en la API call |
| Imágenes guardadas en Supabase Storage | Para el historial del empleado |
| Encriptación del prompt padre at-rest | En DB, columna `content_encrypted` |

## Próximo paso

Leer `02-conventions.md`.
