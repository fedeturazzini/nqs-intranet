# Audit — rebote /tool/claude → /hub (loop en un solo user)

**Fecha**: 2026-07-28
**Modo**: READ-ONLY (no se tocó código, no se deployó).
**Síntoma**: un único usuario entra a `/tool/claude` y es rebotado a `/hub`
inmediatamente, en loop (nunca logra entrar). En Vercel todos los requests dan
**200** (no hay 401 → no es sesión), el user **tiene la tool Claude "activa"** y
supuestamente con acceso 24/7, y **le pasa solo a él**.

---

## TL;DR — causa raíz

El rebote lo dispara **`canUseTool()` devolviendo `expired`** en
[`src/lib/middleware/permissions.ts:84`](src/lib/middleware/permissions.ts:84):

```ts
// permissions.ts:84 — status puede seguir "active", pero si expires_at ya pasó, es expired
if (access.expires_at && new Date(access.expires_at) < new Date()) {
  return { allowed: false, reason: "expired" };
}
```

La row `tool_access` de ese user para `claude` quedó con
**`status = "active"` pero `expires_at` en el pasado** (típico de un acceso
temporal — quick access 1h/2h o "excepcional" del flujo de aprobación — que
venció sin que nadie re-toggleara el acceso permanente).

Por qué se ve como **loop silencioso** (y no como un modal de "acceso vencido"):

- El **hub** ([`listToolsWithAccess`](src/lib/db/queries/access.ts)) calcula el
  estado de la card usando **solo la columna `status`**, **ignora `expires_at`**.
  Entonces la card de Claude se ve **`active` → clickeable → botón "abrir →"**.
- Al clickear, `HubScreen.onOpen` hace `router.push('/tool/claude')`
  ([HubScreen.tsx:230](src/components/screens/HubScreen.tsx:230)). `onOpen` solo
  chequea `schedule` (no chequea `expires_at` ni `status`).
- En el server, `/tool/claude` corre `canUseTool`, que **sí** enforce
  `expires_at` (línea 84) → `!allowed` → `redirect('/hub')`
  ([tool/[toolId]/page.tsx:46](src/app/(dashboard)/tool/[toolId]/page.tsx:46)).
- Vuelve al hub, la card sigue viéndose `active`, el user vuelve a clickear →
  **hub → claude → hub → claude…** Es exactamente el loop reportado.

**Es un solo user** porque es el único cuya row tiene `expires_at` vencido con
`status` todavía en `active`. Todo el resto tiene `expires_at = null` (permanente).

> **La sospecha #1 (proyecto activo privado sin gate) queda DESCARTADA por
> código** — ver sección 2. El camino de proyecto privado **nunca** hace
> `redirect('/hub')`.

---

## 1. TODOS los puntos que redirigen `/tool/claude` → `/hub`

Archivo: [`src/app/(dashboard)/tool/[toolId]/page.tsx`](src/app/(dashboard)/tool/[toolId]/page.tsx)
(Server Component, `force-dynamic`). Hay **exactamente 2** `redirect('/hub')`:

| # | Línea | Condición exacta | ¿Aplica a este caso? |
|---|-------|------------------|----------------------|
| R1 | `page.tsx:41` | `toolId !== "claude"` | ❌ No — el toolId ES `claude`. |
| R2 | `page.tsx:46` | `!perm.allowed` donde `perm = await canUseTool(session.userId, "claude")` | ✅ **SÍ — este es el rebote.** |

**No hay más redirects a `/hub`** en el flujo de entrada a Claude:
- El `layout` del dashboard ([layout.tsx](src/app/(dashboard)/layout.tsx)) solo
  hace `requireAuth()` → redirige a **`/login`** (no a `/hub`) si no hay sesión.
- `ClaudeView` (client) **no** tiene ningún `router.push`/`redirect`/`replace` a
  `/hub` — solo un `<Link href="/hub">` ("← VOLVER AL HUB"), que es acción manual.
- El bloque de **proyecto privado** (page.tsx:57-76) **no redirige** (ver §2).
- No existe `middleware.ts` a nivel root ni un middleware Next que intercepte la
  ruta. `src/lib/middleware/permissions.ts` es una librería, no un middleware de
  Next.

### Desglose de R2 — todas las condiciones dentro de `canUseTool`

Archivo: [`src/lib/middleware/permissions.ts`](src/lib/middleware/permissions.ts).
Cada una devuelve `!allowed` → dispara R2 → `redirect('/hub')`:

| Check | Línea | Condición | ¿Puede ser este caso? |
|-------|-------|-----------|------------------------|
| Admin bypass | `:52` | `user.role === "admin"` → **allowed** (saltea todo) | El user no es admin (si lo fuera, no rebotaría). |
| C1 user | `:47` | `userErr \|\| !user \|\| !user.is_active` → `not_authenticated` | Improbable: si `is_active=false`, **rebotarían TODAS** las tools, no solo Claude. Descartable salvo que solo pruebe Claude. |
| C2 sin acceso | `:64` | `!access \|\| status === "locked"` → `no_access` | ❌ No: el hub mostraría la card como `locked` (botón "solicitar acceso"), no como `active`. No hay bounce silencioso. |
| C2 pending | `:68` | `status === "pending"` → `pending_approval` | ❌ No: la card se vería `pending` ("esperando confirmación"), no clickeable a abrir. |
| C2 expired (status) | `:72` | `status === "expired"` → `expired` | ❌ No: la card se vería `expired` (flujo "solicitar acceso"). |
| **C2 expired (fecha)** | **`:84`** | **`access.expires_at && new Date(access.expires_at) < now`** con `status` aún `"active"` | ✅ **SÍ — match exacto.** El hub muestra `active` (ignora `expires_at`), pero el server niega. |
| C3 schedule | `:92` | `access.schedule` fuera de ventana → `outside_hours` | ❌ Improbable como causa del *loop*: el hub **sí** chequea `schedule` en `onOpen` y muestra el **`OutsideHoursModal`** en vez de navegar → no habría rebote silencioso. (Ver nota abajo.) |
| C4 créditos | `:103` | DESACTIVADO (0 créditos no bloquea) | ❌ No aplica. |

**Nota sobre C3 (schedule):** aunque el user dice tener "24/7", si tuviera un
`schedule` mal configurado (día `enabled:false` o ventana `from/to` que no cubre
el ahora — ver [schedule.ts:75-89](src/lib/utils/schedule.ts:75)), `canUseTool`
lo negaría. **Pero** el hub replica ese check client-side en
[`HubScreen.onOpen`](src/components/screens/HubScreen.tsx:221) y abre un **modal**
("fuera de horario") en lugar de hacer `router.push`. Por eso un bloqueo por
horario se vería como *modal*, no como *loop*. Si el user reporta loop puro (sin
modal), **el schedule NO es la causa** y el `expires_at` vencido (C2 fecha) es la
única condición que produce ese comportamiento exacto.

---

## 2. Cruce con la sospecha #1 (proyecto activo privado) — DESCARTADA

Revisados los commits recientes:

- **`e91dbae` "Fix claude flow"** — tocó **solo**
  `tool/[toolId]/page.tsx`. El diff **eliminó** el `return <ProjectPasswordGate>`
  que antes se mostraba cuando el proyecto activo era privado y sin gate. Ahora
  ese caso se trata como *"sin proyecto activo"*:

  ```ts
  // page.tsx:63 (post-fix)
  const activeLocked =
    !!activeProject?.is_private && !(await hasProjectGate(activeProject.id));
  // …
  activeProject={ activeProject && !activeLocked ? {…} : null }   // page.tsx:88
  ```

  Con `activeProject=null`, `ClaudeView` renderiza el **picker** de proyectos
  ([ClaudeView.tsx:159](src/components/screens/ClaudeView.tsx:159)). La
  contraseña se pide en un **modal** solo si el user elige ese proyecto privado.

- **`e803f8a` "Project private fix"** — tocó `project-gate.ts`, `active-project`
  API, `logout`, `verify-password`, `ClaudeView`, `ProjectsScreen`. Es lógica de
  cookies de gate y verificación de password. **Ninguno** de esos archivos hace
  `redirect('/hub')` en el flujo de carga de `/tool/claude`.

**Conclusión:** en el código actual (y también en la versión anterior a
`e91dbae`, que mostraba un `<ProjectPasswordGate>`), el camino de proyecto
privado **nunca** redirige a `/hub` — muestra gate o picker. Por lo tanto un
proyecto activo privado sin gate **no puede** ser el origen del rebote. La
sospecha #1 queda descartada por lectura de código.

---

## 3. Cómo llegó la row a ese estado (`status=active` + `expires_at` pasado)

- El **toggle del panel admin**
  ([`admin/tools/access/route.ts:54`](src/app/api/admin/tools/access/route.ts:54))
  otorga acceso **permanente** y **explícitamente limpia `expires_at: null`**. El
  comentario del propio código describe este bug al pie de la letra:

  > *"…si no, el user queda `active` pero con expires_at vencido → canUseTool lo
  > trata como `expired` y no puede entrar."*

- Los accesos con vencimiento se setean **solo** desde el flujo de aprobación de
  solicitudes ([`admin/requests/[id]/approve/route.ts`](src/app/api/admin/requests/[id]/approve/route.ts)):
  `quick access` (1h/2h/3h/4h) y `exceptional_access` escriben
  `status='active'` + `expires_at = futuro`.

- **No hay** ningún job/cron que, al vencer `expires_at`, cambie
  `status` de `active` → `expired`. La columna `status` queda "congelada" en
  `active`. Solo `canUseTool` (server) evalúa la fecha en runtime; el hub no.

**Escenario de este user:** en algún momento recibió acceso **temporal** a Claude
(aprobación de solicitud con `expires_at` futuro). Venció. Nadie le re-otorgó el
acceso permanente vía el toggle (que habría puesto `expires_at=null`). Resultado:
`status='active'` + `expires_at` en el pasado → rebote perpetuo, solo para él.

---

## 4. Verificación sugerida (no ejecutada — READ-ONLY)

Para **confirmar** sin tocar código, consultar la DB (Supabase) la row del user:

```sql
select user_id, tool_id, status, expires_at, schedule, granted_by
from tool_access
where tool_id = 'claude'
  and user_id = '<UUID-del-user-afectado>';
```

Confirmación esperada de esta hipótesis:
- `status = 'active'`  **y**  `expires_at < now()`  →  **causa confirmada (C2 fecha)**.
- Adicionalmente chequear `users.is_active = true` (para descartar C1) y
  `schedule is null` (para descartar C3). Si `schedule` no es null, verificar si
  la ventana cubre el ahora en TZ `America/Argentina/Buenos_Aires`.

**Logs**: `requireToolAccess` loguea `logWarn("acceso a tool denegado", { reason })`
([permissions.ts:135](src/lib/middleware/permissions.ts:135)) — **pero** ese
helper lo usan los **API routes**, no la page server-side (`ToolPage` llama
`canUseTool` directo y hace `redirect`, sin loguear el `reason`). En los logs de
Vercel, cuando el user reintenta mandar un mensaje, el endpoint de execute sí
dejaría un warn con `reason:"expired"`. Ese warn es la confirmación en runtime.

---

## 5. Fix recomendado (para una sesión de escritura futura — NO aplicado acá)

Ordenados por robustez:

1. **Dato (inmediato, sin deploy):** desde `/admin/access` (o el panel de tools),
   **re-otorgar** el acceso permanente a Claude para ese user con el toggle. Eso
   ejecuta el upsert que setea `expires_at: null`
   ([access/route.ts:54](src/app/api/admin/tools/access/route.ts:54)) y lo
   desbloquea. Alternativa DB directa: `update tool_access set expires_at = null
   where user_id = '<uuid>' and tool_id = 'claude';`.

2. **Código (que el hub no muestre "active" un acceso vencido):** en
   [`listToolsWithAccess`](src/lib/db/queries/access.ts) derivar el status
   considerando `expires_at` (si `status==='active' && expires_at && expires_at <
   now` → tratar como `expired`). Así la card refleja la realidad y el user ve el
   flujo de "solicitar acceso" en vez de un loop mudo. Hoy el hub y `canUseTool`
   están **desincronizados** justo en este punto.

3. **UX (que R2 no sea un rebote ciego):** en `ToolPage`, en vez de
   `redirect('/hub')` a secas cuando `reason==='expired'`/`'no_access'`, pasar el
   motivo al hub (query param / toast) para que el user entienda por qué rebotó,
   en lugar de percibir un loop.

---

## Resumen ejecutivo

- Redirects `/tool/claude`→`/hub`: **2** (R1 `toolId!=='claude'`, R2
  `!canUseTool.allowed`). Solo **R2** aplica.
- Dentro de R2, la condición disparada es **`expires_at` vencido con
  `status` aún `active`** (`permissions.ts:84`).
- Se ve como **loop** porque el **hub ignora `expires_at`** y muestra la card
  como `active`/clickeable, mientras el **server la enforce** y rebota.
- Es **un solo user** = única row con `expires_at` pasado sobre `status=active`
  (acceso temporal vencido nunca convertido a permanente).
- **Sospecha #1 (proyecto privado) descartada por código**: ese camino muestra
  picker/gate, **nunca** `redirect('/hub')`.
