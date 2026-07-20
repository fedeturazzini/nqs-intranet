# Auditoría — Sesión/Auth y 401 intermitente en `/api/tools/claude/execute`

**Fecha:** 2026-06-29 · **Scope:** read-only (solo lectura de código; no se modificó nada).
**Ramas:** develop = main en todo lo de auth (sin cambios pendientes en estos archivos).

---

## 🎯 Veredicto / causa raíz

El access token de Supabase (JWT, **1h** por default) se guarda en una cookie httpOnly
`sb-access-token` con **`maxAge` de 7 días**, se **valida** en cada request con
`auth.getUser(token)`… pero **NUNCA se refresca**. **No hay ningún mecanismo de refresh en
todo el proyecto** — ni server-side ni client-side. El `sb-refresh-token` se guarda en el
login y se borra en el logout, pero **jamás se usa** para pedir un token nuevo (código muerto).

Entonces, en una conversación de chat larga:

1. Pasa **~1 hora** → el JWT del `sb-access-token` expira (la cookie sigue viva 7 días).
2. La próxima request a `/api/tools/claude/execute` corre `getSession()` →
   `db.auth.getUser(accessTokenExpirado)` → ese es el **`GET /auth/v1/user` (494ms)** del log →
   devuelve error → `getSession()` retorna `null`.
3. El route handler devuelve **`401 unauthorized`** (`execute/route.ts:48`) **antes** de llamar a Anthropic.
4. El frontend (`useClaudeChat`) ante `!res.ok` solo hace `setErrorOnPending("unauthorized")`
   → **"ERROR unauthorized"**, sin reintentar ni refrescar.
5. El usuario queda tirando 401 en cada mensaje hasta **re-loguearse a mano** (el POST
   `/api/auth/login` reescribe las cookies stale con tokens frescos).

La hipótesis del pedido es **correcta**: el JWT expiró y no se refrescó a tiempo. El detalle
es que **no hay “a tiempo” posible con el código actual: no existe refresh en absoluto.**

---

## Arquitectura de auth (⚠️ NO es `@supabase/ssr`)

Es **auth custom con cookies httpOnly**, no el patrón oficial de `@supabase/ssr` (que
refrescaría solo en el middleware). Flujo real:

```
LOGIN  /api/auth/login (anon client)
  signInWithPassword() → { access_token (JWT ~1h), refresh_token }
  set cookie sb-access-token   httpOnly, maxAge 7 días   ← JWT que muere en 1h
  set cookie sb-refresh-token  httpOnly, maxAge 7 días   ← nunca se lee después

CADA REQUEST
  proxy.ts (edge)      → SOLO chequea que la cookie EXISTA (no valida) → next()
  route handler        → getSession() → auth.getUser(accessToken)  [red, ~494ms]
                         └─ si expiró → null → 401   (NO intenta refresh)
```

El `createBrowserClient()` (anon) sí tiene `autoRefreshToken`/`persistSession` por default,
**pero es irrelevante**: solo se usa en el flujo de reset-password (`ResetPasswordScreen`) y
maneja su propia sesión en localStorage, **separada** de la cookie httpOnly de la app. El JS
del browser **no puede** leer ni refrescar la cookie httpOnly de la app aunque quisiera.

---

## Respuestas puntuales (con ubicación en código)

| # | Pregunta | Hallazgo | Dónde |
|---|---|---|---|
| 1 | Dónde se guarda el access token en el front | **Cookie httpOnly `sb-access-token`** (no localStorage). El browser no lo puede leer. | `login/route.ts:111`; nombre en `auth/server.ts:25` |
| 2 | Cómo se manda al backend | `fetch("/api/tools/claude/execute")` **sin `credentials`** → default `same-origin` → la cookie httpOnly viaja sola. **No hay header `Authorization`.** | `useClaudeChat.ts:175` |
| 3 | Cómo valida el backend y qué hace si falla | `getSession()` → `db.auth.getUser(accessToken)`; si falla → `null` → el route devuelve **401 directo**. **No intenta refrescar.** | `auth/server.ts:45-52`, `execute/route.ts:46-48` |
| 4 | ¿Hay lógica de refresh? (onAuthStateChange / polling / middleware SSR) | **NO.** No usa `@supabase/ssr`, no hay `middleware.ts` (es `proxy.ts`, que no refresca), no hay `refreshSession`/`setSession` en ningún lado, no hay polling que refresque. `onAuthStateChange` solo aparece en reset-password (otro flujo). | grep `refreshSession\|setSession` → 0 usos; `proxy.ts` |
| 5 | Config de expiración del JWT en Supabase | No verificable desde el código (es del dashboard). El síntoma (401 tras ~1h) es consistente con el **default de 3600s (1h)**. **Confirmar en Authentication → Settings → “Access token (JWT) expiry limit”.** | Supabase dashboard |
| 6 | Qué hace el front con el 401 | **Solo muestra el error** (`setErrorOnPending`). **No reintenta, no refresca.** El mensaje del usuario queda marcado con error. | `useClaudeChat.ts:188-197` |
| 7 | Por qué el proxy dio 200 y la función 401 | **Distinta fuente de verdad, por diseño:** el proxy solo mira que la cookie **exista** (`Boolean(cookie)`); `getSession()` valida el **JWT** contra Supabase. Cookie presente + JWT vencido = proxy 200, función 401. | `proxy.ts` (`hasSession = Boolean(...)`) vs `auth/server.ts:51` |
| 8 | Sesiones largas: ¿algo refresca en background? | **NADA.** Ningún `setInterval` toca la sesión (son countdowns/relojes de UI). No hay keepalive. La cookie vive 7 días pero el JWT adentro muere a la 1h. | grep `setInterval` (todos UI); `login/route.ts:24,116` |

---

## El mismatch de fondo

| Cosa | Vida | Realidad |
|---|---|---|
| Cookie `sb-access-token` (`maxAge`) | **7 días** (`ONE_WEEK_SECONDS`) | La cookie “existe” 7 días → el proxy la deja pasar 7 días |
| JWT **adentro** del access token | **~1 hora** (default Supabase) | A la hora `auth.getUser()` la rechaza → 401 |
| Cookie `sb-refresh-token` | 7 días | Guardada pero **nunca leída** → no sirve de nada |

El refresh token está ahí para exactamente este caso (canjearlo por un access token nuevo),
pero **no hay código que lo canjee**.

---

## Observación secundaria (latencia, no es la causa)

`getSession()` hace un `auth.getUser()` = **round-trip de red a Supabase en CADA request**
(los 494ms del log). Está cacheado por-request con React `cache()` (`auth/server.ts:45`), así
que dentro de un mismo render se llama una vez — pero cada request de API es una invocación
nueva → un getUser nuevo. Es el precio de chequear revocación de forma segura; se podría
verificar la firma del JWT localmente (más rápido) a costa de perder el check de revocación.
No es la causa del 401, solo latencia.

---

## Recomendaciones de fix (por esfuerzo)

> Restricción de diseño clave: como el token está en cookie **httpOnly**, el refresh tiene que
> ser **server-side**. Y ojo: `getSession()` corre también en Server Components, donde las
> cookies son **read-only** — no se pueden re-setear ahí. El refresh tiene que vivir donde SÍ
> se pueden escribir cookies: el **proxy/middleware** o un **route handler**.
> Además, Supabase **rota** el refresh token en cada uso → hay que re-guardar **ambas** cookies.

**A) Rápido — desbloquea el chat (reactivo):**
- Nuevo route `POST /api/auth/refresh`: lee `sb-refresh-token`, hace
  `anonClient.auth.refreshSession({ refresh_token })`, y re-setea `sb-access-token` +
  `sb-refresh-token` con los tokens nuevos.
- En `useClaudeChat`, ante un **401**: llamar a `/api/auth/refresh` y **reintentar el POST una vez**;
  si el refresh falla, ahí sí mandar a `/login`. Cubre el síntoma exacto reportado.

**B) Correcto — arregla TODA la app (proactivo/sistémico):**
- Refrescar en el **`proxy` (middleware)**: si el access token está por vencer/vencido, canjear
  el refresh token y escribir las cookies rotadas en la respuesta. Así **toda** request
  (no solo el chat) sale con token fresco — es justo lo que hace el patrón `@supabase/ssr`.
- Alternativa idiomática: **migrar a `@supabase/ssr`** (server client con manejo de cookies +
  `getUser()` en el middleware que auto-refresca y rota cookies). Es el estándar mantenido;
  refactor más grande pero elimina toda esta plomería custom.

**C) Band-aid (no recomendado como fix real):**
- Subir el “JWT expiry” en el dashboard (ej. varias horas). Solo corre el problema más lejos,
  no lo resuelve, y JWTs de vida larga son menos seguros.

**Sugerencia:** **A** ahora (destraba el chat en el día), **B** después (el arreglo de verdad;
idealmente el refresh proactivo en el proxy o `@supabase/ssr`).

---

## Índice de archivos/funciones clave

- `src/lib/auth/server.ts` — `getSession()` (valida, **no refresca**), `requireAuth`, constantes de cookies.
- `src/proxy.ts` — guard de edge; **solo presencia** de cookie, sin validar JWT.
- `src/app/api/auth/login/route.ts` — `signInWithPassword` + set de ambas cookies (`maxAge` 7 días).
- `src/app/api/auth/logout/route.ts` — borra ambas cookies.
- `src/app/api/auth/session/route.ts` — GET read-only (devuelve `getSession()`), no refresca.
- `src/app/api/tools/claude/execute/route.ts:46-48` — `getSession()` → 401 si null.
- `src/lib/hooks/useClaudeChat.ts:175,188-197` — POST al execute; ante error solo muestra el mensaje.
- `src/lib/db/supabase.ts` — factorías server (service role, `autoRefreshToken:false`) y browser (anon).

**Nada de esto está mergeado a medias ni pendiente**: el código de auth es idéntico en `develop`
y `main`. El bug es de diseño (falta el refresh), no de un PR colgado.
