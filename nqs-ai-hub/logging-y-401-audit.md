# Audit — 401 de upload-url + estado del logging

**Fecha:** 2026-07-28 · **Branch:** develop · **Modo:** READ-ONLY (nada modificado).
**Contexto:** (A) usuario ve "no se pudieron preparar las subidas (401)" al adjuntar imágenes; Vercel
muestra POST 401 en `/api/tools/claude/upload-url` sin detalle. (B) falta logging: cuesta diagnosticar.

## TL;DR

- **(A)** El 401 es el **mismo problema de refresh de sesión** ya diagnosticado (`sesion-unica-audit`):
  `getSession()` **no refresca** — token vencido (~1h) → `null` → 401. Y el flujo de subida
  (`images.ts`) **no refresca ni reintenta** (a diferencia del `execute`, que sí) → muestra el error
  crudo. Se "arregla volviendo a entrar" porque el re-login setea cookies nuevas.
- **(B)** **No hay logger central.** De **58 API routes, solo 7 loguean algo**; `upload-url` no loguea
  en ninguna rama. Hay un buen patrón estructurado (`JSON.stringify({level,msg,userId,…})`) pero solo
  en 3 archivos. El resto devuelve 4xx/5xx **mudo** → ceguera en Vercel.

---

# PARTE 1 — El 401 de upload-url

### 1. Archivo
[`src/app/api/tools/claude/upload-url/route.ts`](nqs-ai-hub/src/app/api/tools/claude/upload-url/route.ts).

### 2. Ramas que devuelven 401
Hay **dos** ramas 401, con cuerpos distintos, indistinguibles desde el cliente:

| # | Origen | Cuerpo | Se dispara cuando |
|---|---|---|---|
| 1 | `getSession()` null ([route:35-38](nqs-ai-hub/src/app/api/tools/claude/upload-url/route.ts:35)) | `{error:"unauthorized"}` | no hay cookie `sb-access-token`, o **`auth.getUser(token)` falla = JWT vencido/inválido/revocado**, o falla el lookup de perfil |
| 2 | `requireToolAccess` → `not_authenticated` ([permissions:46-47,133](nqs-ai-hub/src/lib/middleware/permissions.ts:46)) | `{error:"not_authenticated",message:null}` | el user de la sesión no existe en `users` o **`is_active=false`** (usuario desactivado) |

(Las otras salidas son 400 `bad_request`, 403 `no_access`/etc., y 500 `storage_error`.)

**El más probable dado "pasa cada tanto y se arregla volviendo a entrar":** la **rama 1 por JWT
vencido**. El access token dura ~1h (`jwt_expiry=3600`); si la pestaña queda abierta >1h y el user
adjunta una imagen, `getSession` ve el token vencido → 401. La rama 2 (`is_active=false`) sería
**permanente**, no intermitente → descartada como causa del síntoma.

### 3. ¿Es el problema de refresh de sesión? — SÍ, confirmado
[`getSession`](nqs-ai-hub/src/lib/auth/server.ts:45) valida el token con `db.auth.getUser(accessToken)`
y devuelve `null` si `userErr` (token expirado). **No usa el refresh token, no rota nada** — es
validación pura. Mismo cuello que `sesion-unica-audit`: cuando el JWT vence, todo endpoint que use
`getSession` da 401 hasta que el cliente llame a `/api/auth/refresh` y consiga cookies nuevas.

### 4. ¿Loguea el 401? — NO
`upload-url` **no tiene un solo `console.*`**. Ni el 401, ni el 400, ni el 500 se loguean. Desde los
logs de Vercel **no se puede saber cuál de las dos ramas** fue (unauthorized vs not_authenticated), ni
el userId, ni si fue token vencido. Ese es el hueco: Vercel muestra "POST 401" y nada más.

### 5. Qué hace el cliente ante el 401 — NADA (no refresca)
[`uploadImages` (images.ts:91-102)](nqs-ai-hub/src/lib/utils/images.ts:91): hace el POST y, si
`!res.ok`, **tira el error crudo** (`body.message ?? "no se pudieron preparar las subidas (${status})"`).
**No refresca la sesión ni reintenta.**

**Asimetría clave:** el `execute` (chat) SÍ maneja el 401 —
[`useClaudeChat.ts:230-243`](nqs-ai-hub/src/lib/hooks/useClaudeChat.ts:230) detecta 401, llama a
`/api/auth/refresh` y **reintenta una vez** en silencio. El upload NO copió ese patrón. Por eso el
mismo token vencido: en el chat pasa desapercibido (se auto-refresca) y en el adjuntar-imagen explota.
**Ese es el fix de UX (Parte próxima): replicar el refresh+retry de `useClaudeChat` en `uploadImages`.**

---

# PARTE 2 — Estado del logging

### 6. Mapa de lo que se loguea hoy
- **No existe logger central** (no hay `src/lib/log*`; nada exportado tipo `logInfo/logError`).
- Es **`console.log/error` suelto**, en **16 archivos** de `src/`. Los que más loguean:

  | Archivo | # console | Patrón |
  |---|---|---|
  | `lib/adapters/claude.ts` | 5 | **estructurado** `JSON.stringify({level,msg,userId,…})` |
  | `lib/notifications/slack.ts` | 4 | estructurado |
  | `api/me/access-request/route.ts` | 4 | estructurado (observabilidad notified_at) |
  | `api/admin/users/route.ts` | 3 | mixto |
  | `lib/storage/claude-uploads.ts`, `lib/notifications/email.ts`, `lib/adapters/utils.ts` | 2 c/u | mixto |
  | resto (kling, 3dsky, crypto, ChatInput, algunos routes) | 1 c/u | suelto |

- **Cobertura de API routes: 7 de 58 route.ts loguean algo.** Los **51 restantes devuelven errores
  mudos.**

### 7. Huecos críticos (endpoints que fallan mudo)
- **`upload-url`** — 401/400/500 sin log (el del reporte).
- **`execute`** — el catch de la ruta hace `send({type:"error",message:"error inesperado"})` **sin
  `console.error`** ([execute:125-126](nqs-ai-hub/src/app/api/tools/claude/execute/route.ts:125)). El
  adapter sí loguea sus propios fallos, pero los errores del stream a nivel ruta se tragan mudos.
- **Auth** (`login`, `refresh`, `logout`) — sin logging: un login fallido (contraseña incorrecta) o un
  refresh que falla (token muerto) no dejan rastro. Importante para seguridad y para este mismo bug.
- **~51 routes** (admin/*, me/*, tools/*) que devuelven `db_error`/`bad_request`/401/403 sin loguear
  el motivo ni el userId.

### 8. ¿Contexto útil?
- Los **3 spots estructurados** (adapter, slack, access-request) sí tienen buen contexto: `level`,
  `msg`, `userId`, `error`, ids relevantes. Es el patrón a estandarizar.
- El resto: mensajes sueltos sin userId/ruta/requestId, o directamente **ausentes**. No hay `requestId`
  en ningún lado → imposible correlacionar un error del user con una línea de Vercel.

### 9. ¿Los errores del cliente llegan a algún lado? — NO
Mueren en el navegador: se muestran como toast (o texto en el bubble) y nada se reporta al server. El
"no se pudieron preparar las subidas (401)" que ve el user **no genera ninguna línea con detalle** — lo
único en Vercel es el access-log "POST 401" sin cuerpo. Cero telemetría de cliente.

---

# PARTE 3 — Recomendación (proponer, no implementar)

### 10. Esquema de logging mínimo y consistente
Un helper central, ej. `src/lib/log.ts`, que estandarice el patrón que ya usa el adapter:
```ts
logError({ route: "tools/claude/upload-url", userId, status: 401,
           reason: "session_invalid", requestId, err })
// → console.error(JSON.stringify({ ts, level:"error", route, userId, status, reason, requestId, err }))
logInfo({ route, userId, action })   // acciones clave (login OK, envío de solicitud, etc.)
```
- **Campos fijos:** `ts`, `level`, `route`, `userId` (o "anon"), `status`, `reason`, `requestId`, `err`.
- **`requestId`:** generar uno por request (o leer el header de Vercel `x-vercel-id`) y devolverlo en
  el cuerpo de error → el user reporta "salió error X" con un id que se busca en Vercel.
- **Niveles:** `error` para 5xx y 4xx inesperados; `warn` para 4xx esperados (401/403/validación);
  `info` para acciones clave (login, solicitudes, cambios de admin).
- Salida a `console` (JSON de una línea) → Vercel lo indexa y es grepeable. Sin dependencia externa.

### 11. Los 5-10 puntos donde meter logging primero (los que hoy fallan mudo)
1. **`upload-url`** — loguear la rama exacta del 401 (unauthorized vs not_authenticated) + userId.
2. **`getSession` / auth** — `login` fallido, `refresh` fallido (con motivo), sesión inválida.
3. **`execute` (ruta)** — el catch mudo del stream (hoy "error inesperado" sin traza).
4. **`requireToolAccess`** — loguear las denegaciones (reason: no_access/pending/expired/outside_hours).
5. **`notifySlack`** — ya tiene algo; unificar al helper (los avisos que no salen).
6. **`access-request`** — ya tiene observabilidad; migrar al helper.
7. **`createUploadTargets` / storage** — fallos de signed URL (el 500 de upload-url).
8. **Rutas admin de mutación** (users, credits, projects) — hoy devuelven `db_error` mudo.

### 12. Server-side (Vercel) vs. cliente
- **Server (cubre el 80%):** el helper de #10 en las rutas → structured logs en Vercel, grepeables por
  `userId`/`route`/`requestId`. Resuelve la ceguera de "POST 401 sin detalle".
- **Cliente (complemento):** dos cosas distintas:
  - **Fix directo del síntoma (no es logging):** replicar en `uploadImages` el **refresh+retry** del
    `execute` → el 401 por token vencido deja de mostrarse. Esto mata el reporte (A) sin logging.
  - **Telemetría de cliente (fase 2, opcional):** un beacon `POST /api/client-error` que registre los
    errores que ve el user (con el `requestId` del server cuando exista) → cierra el gap #9. Menor
    prioridad que el server-side.

---

## Próximo paso sugerido
1. **Parche de UX del 401:** `uploadImages` → refresh+retry (patrón de `useClaudeChat`). Cambio chico,
   mata el síntoma reportado.
2. **Logging por etapas:** (a) helper central `src/lib/log.ts`; (b) instrumentar los puntos #11.1-4
   (upload-url, auth, execute, permisos); (c) migrar los 3 spots estructurados al helper; (d) evaluar
   el beacon de cliente.

### Archivos revisados
- [`upload-url/route.ts`](nqs-ai-hub/src/app/api/tools/claude/upload-url/route.ts) · [`auth/server.ts`](nqs-ai-hub/src/lib/auth/server.ts) (`getSession`) · [`middleware/permissions.ts`](nqs-ai-hub/src/lib/middleware/permissions.ts) (`requireToolAccess`)
- [`lib/utils/images.ts`](nqs-ai-hub/src/lib/utils/images.ts) (`uploadImages`, cliente) · [`hooks/useClaudeChat.ts`](nqs-ai-hub/src/lib/hooks/useClaudeChat.ts) (refresh+retry del execute)
- [`execute/route.ts`](nqs-ai-hub/src/app/api/tools/claude/execute/route.ts) · [`adapters/claude.ts`](nqs-ai-hub/src/lib/adapters/claude.ts) (patrón de log estructurado)
