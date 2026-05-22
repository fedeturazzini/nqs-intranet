# Sesión 03 — Auth completo (login + sesiones + roles)

## Objetivo

Construir todo el sistema de autenticación: login screen replicando el diseño del cliente, manejo de sesiones, roles admin/employee, middleware que protege rutas.

**Duración**: 2-3 horas
**Output**: usuarios pueden loguearse, las rutas están protegidas, el rol determina qué se ve.

---

## PROMPT

```
Sesión 03 del proyecto NQS AI Hub.

ESTADO ACTUAL:
Leé `progress-02.md` para entender el estado.

OBJETIVO:
Sistema completo de autenticación con Supabase Auth.

PASOS:

1. Crear `src/lib/auth/server.ts`:
   - Función `getSession()` que valida el token JWT desde cookies y devuelve `{ userId, email, role } | null`.
   - Función `requireAuth()` que llama a `getSession()` y redirige a /login si no hay sesión.
   - Función `requireAdmin()` que valida rol admin y redirige a /hub si no lo es.

2. Crear `src/middleware.ts` (Next.js middleware):
   - Intercepta todas las requests.
   - Rutas públicas: `/login`, `/api/auth/*`, `/_next/*`, static assets.
   - Resto de rutas: requieren auth.
   - Rutas `/admin/*` y `/api/admin/*`: requieren rol admin.

3. Crear endpoints en `src/app/api/auth/`:
   - `login/route.ts` (POST):
     - Recibe { email, password }
     - Usa Supabase Auth: `supabase.auth.signInWithPassword()`
     - Setea cookie con el access_token
     - Devuelve { user, redirect }
   - `logout/route.ts` (POST):
     - Limpia cookies
     - Devuelve { ok: true }
   - `session/route.ts` (GET):
     - Devuelve la sesión actual o null

4. Crear `src/components/screens/LoginScreen.tsx`:
   - Adaptar el componente `LoginScreen` de `design/screens.jsx` (líneas 4-95).
   - Convertir JSX vanilla a TypeScript + componentes Next.js.
   - Mantener TODO el diseño: brackets, ticker, fields, switch user/admin.
   - El switch user/admin del cliente es solo para UX (pre-rellenar usuario), pero el rol REAL viene de la DB.
   - El form llama a POST /api/auth/login.
   - Manejo de errores: shake del card si fallan credenciales.
   - Después de login exitoso, redirect a `/hub` (si employee) o `/admin` (si admin).

5. Crear `src/components/screens/LoginTicker.tsx`:
   - Adaptar `LoginTicker` y `TickerCol` de `design/screens.jsx` (líneas 1160-1313).
   - Las 8 frases del manifesto deben estar en un array constante en el componente.
   - Animación de cube/stack/marquee (las 3 variantes).
   - Para el MVP, dejarla en variante "cube" por default.

6. Crear página `src/app/(auth)/login/page.tsx`:
   - Server Component que renderiza LoginScreen.
   - Si ya hay sesión, redirect.

7. Crear página placeholder `src/app/(dashboard)/hub/page.tsx`:
   - Server Component.
   - Requiere auth.
   - Muestra "Hola, [nombre del user]" + el rol.
   - Botón logout.

8. Crear página placeholder `src/app/(dashboard)/admin/page.tsx`:
   - Server Component.
   - Requiere auth + admin.
   - Muestra "Admin: [nombre]".
   - Botón logout.

9. Manejo de cookies:
   - Usar `cookies()` de `next/headers`.
   - Cookie name: `sb-access-token`.
   - HttpOnly, Secure (en prod), SameSite=Lax, maxAge 1 semana.

10. Testing manual:
    - Loguearse con `sofia@nqs.test` → debería ir a /hub.
    - Loguearse con `tomas@nqs.test` → debería ir a /admin.
    - Intentar entrar a /admin con sesión de Sofia → debe redirigir a /hub.
    - Intentar entrar a /hub sin sesión → debe redirigir a /login.

11. (Opcional pero recomendado) Test automatizado en `tests/auth.test.ts` con Vitest:
    - Test que valida que `getSession()` devuelve null sin cookie.
    - Test que valida que `requireAdmin()` lanza error con role employee.

12. Commit.

REGLAS:
- El password NUNCA viaja en URL ni se logea.
- Cookie httpOnly siempre.
- Si Supabase Auth falla, el error que se devuelve al cliente es genérico ("credenciales inválidas"), no específico.
- En el frontend del LoginScreen, NO se muestra qué rol tiene el user — Supabase lo maneja después del login.

ARCHIVOS A REFERENCIAR:
- `design/screens.jsx` líneas 4-95 (LoginScreen) y 1160-1313 (LoginTicker)
- `design/screens.css` (clases `.login-page`, `.login-left`, `.login-right`, `.login-card`, etc.)
- `design/styles.css` (clases base `.btn`, `.field`, `.t-eyebrow`)

AL FINAL:
`progress-03.md` con:
- Endpoints creados
- Cómo probar login (con qué credenciales)
- Cómo está manejado el rol
- Próximo paso: `prompts/mvp/04-layout.md`
```

---

## VALIDACIÓN

- [ ] Login con `sofia@nqs.test` lleva a /hub
- [ ] Login con `tomas@nqs.test` lleva a /admin
- [ ] Sin sesión, /hub redirige a /login
- [ ] Sofia no puede entrar a /admin
- [ ] El LoginScreen se ve idéntico al diseño del cliente
- [ ] El ticker funciona con animación
- [ ] Logout funciona

## Próximo paso

`prompts/mvp/04-layout.md`
