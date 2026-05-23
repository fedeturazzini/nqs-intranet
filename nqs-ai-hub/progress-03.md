# Progress 03 — Auth con Supabase + login screen

**Fecha**: 2026-05-23
**Duración real**: ~2 horas
**Sesión anterior**: `progress-02.md`
**Próxima sesión**: `kit/prompts/mvp/04-layout.md`

## Qué se construyó

- Auth helpers server-only (`src/lib/auth/server.ts`): `getSession()`, `requireAuth()`, `requireAdmin()`. Cacheo por request con `React.cache()`.
- 3 endpoints en `/api/auth`: `login` (POST), `logout` (POST), `session` (GET).
- Edge proxy (`src/proxy.ts` — el ex-middleware en Next 16) que redirige anónimos a `/login` y logueados que pisan `/login` a `/hub`.
- `LoginScreen` (Client Component) adaptado del diseño del cliente: brackets, ticker cube, switch user/admin, shake en error, redirect basado en rol.
- `LoginTicker` con las 3 variantes (`cube`/`stack`/`marquee`) y las 8 frases del manifesto.
- `LogoutButton` reusable.
- Páginas `/hub`, `/admin`, `/login` y `/` actualizadas con los guards y placeholders post-login.
- Tests vitest en `tests/auth.test.ts` con mocks de `next/headers`, `next/navigation` y `@/lib/db/supabase`. **6/6 pasan.**

## Archivos creados

```
nqs-ai-hub/
├── src/
│   ├── proxy.ts                                  ← Next 16 (antes middleware.ts)
│   ├── app/
│   │   ├── api/auth/
│   │   │   ├── login/route.ts                    ← POST {email,password} → cookies + redirect
│   │   │   ├── logout/route.ts                   ← POST → limpia cookies
│   │   │   └── session/route.ts                  ← GET → sesión actual o null
│   │   └── (dashboard)/admin/page.tsx            ← placeholder admin protegido
│   ├── components/
│   │   ├── screens/
│   │   │   ├── LoginScreen.tsx                   ← client component
│   │   │   └── LoginTicker.tsx                   ← cube/stack/marquee
│   │   └── ui/LogoutButton.tsx
│   └── lib/auth/server.ts                        ← getSession + requireAuth + requireAdmin
├── tests/auth.test.ts                            ← 6 tests con vitest
├── vitest.config.ts
└── progress-03.md
```

## Archivos modificados

- `src/app/page.tsx` — root redirect: anónimo→/login, employee→/hub, admin→/admin.
- `src/app/(auth)/login/page.tsx` — renderea `LoginScreen` envuelto en Suspense (`useSearchParams` lo exige en Next 16).
- `src/app/(dashboard)/hub/page.tsx` — placeholder con `requireAuth()` + LogoutButton.
- `package.json` — devDeps `vitest`, `@vitest/ui` + scripts `test`, `test:watch`.

## Decisiones técnicas tomadas

1. **`proxy.ts`, no `middleware.ts`.** Next 16 deprecó `middleware` y lo renombró a `proxy` (la motivación es "Express-like middleware causaba confusión"). La firma y `config.matcher` son idénticos. Path: `src/proxy.ts`.

2. **El proxy NO valida el JWT.** Solo chequea si existe la cookie `sb-access-token`. Validar contra Supabase en cada hit de edge es caro y serializa el render. La validación real (firma, expiración, perfil activo) la hace `getSession()` en cada Server Component / Route Handler. El proxy es una pre-pantalla para evitar render de páginas privadas a anónimos.

3. **Admin se protege a nivel page, no proxy.** Para resolver el rol el proxy necesitaría un round-trip a la DB — caro en edge y serializa todo. `requireAdmin()` en la página alcanza, y se ejecuta con `cache()` así que un mismo render no paga el costo más de una vez.

4. **Cookies manuales, sin `@supabase/ssr`.** El paquete `@supabase/ssr` simplifica el cookie sync (refresh automático del access token, sincronización entre Client/Server Components), pero suma complejidad y dependencias para el MVP. Estamos seteando 2 cookies (`sb-access-token` + `sb-refresh-token`), `httpOnly + SameSite=Lax + Secure-en-prod + maxAge 1 semana`. Cuando el access token expire (1h por default de Supabase), el user se relogea. Si el MVP crece y la fricción molesta, migramos a `@supabase/ssr` y aprovechamos el refresh automático.

5. **Rol resuelto desde `public.users`, NO desde JWT metadata.** Aunque Supabase guarda `user_metadata.role` (lo poblamos en `create-users.ts`), no confiamos en metadata para autorizar — un admin con acceso al panel auth podría modificarla. La fuente de verdad es la tabla `public.users` que solo se modifica via API admin propia.

6. **Error genérico `"credenciales inválidas"`.** El endpoint no distingue entre "email no existe" vs "password incorrecta" para no facilitar enumeración de usuarios. Casos especiales que sí se reportan distinto: perfil inexistente en `public.users` (estado inconsistente), usuario `is_active=false`. Esos no afectan a un atacante porque requieren credentials válidas para llegar ahí.

7. **`LoginScreen` cliente, página servidor.** El form requiere `useState`/`useEffect`/`fetch` → Client Component. La página (`app/(auth)/login/page.tsx`) es Server Component que ya chequea sesión (evita render del client si el user ya está logueado) y calcula `displayDate` del lado servidor (evita mismatch SSR/CSR por horarios).

8. **Tests con mocks, sin red.** Mockeamos `next/headers#cookies`, `next/navigation#redirect`, y `@/lib/db/supabase#createServerClient`. Los tests no requieren `.env.local` ni proyecto Supabase vivo — pasan en CI fría. 6 casos: sesión nula sin cookie, sesión nula con token expirado, sesión OK con token válido, `requireAuth` redirige sin sesión, `requireAdmin` redirige a /hub con employee, `requireAdmin` pasa con admin.

9. **El switch user/admin del login es solo UX.** Pre-rellena el email según el botón apretado (sofia o tomas), pero NO se envía al backend. El rol lo decide el server después del login leyendo la DB. Solo pisamos el campo si estaba con uno de los pre-fills (no destruimos lo que el user tipeó).

10. **`?next=/ruta-original` para deep-links.** Si un anónimo entra a `/admin/users/123`, el proxy lo redirige a `/login?next=/admin/users/123` y después del login va directo ahí. Validamos en el client que el `next` empiece con `/` (no URLs absolutas) para evitar open redirects.

## Cosas pendientes (TODO en código)

- [ ] Refresh automático de tokens: cuando el access token expira, hoy el user vuelve al login. Opciones futuras: migrar a `@supabase/ssr` (lo hace solo) o un endpoint propio `/api/auth/refresh` que use el `sb-refresh-token` para mintear uno nuevo.
- [ ] `auth.admin.signOut(token)` para invalidar el JWT server-side en logout (hoy solo borramos cookies). No urgente porque los tokens son cortos.
- [ ] El link "¿olvidaste tu pass?" hoy no hace nada (solo refresca). Cuando exista el flow de reset password, se cablea.

## Cosas a tener en cuenta para la próxima sesión

- El layout `(dashboard)` hoy es un passthrough (`<>{children}</>`). En la sesión 04 se le agrega topbar + marquee + user chip + nav. El `LogoutButton` se va a mover ahí.
- Las páginas `/hub` y `/admin` son placeholders mínimos — el contenido real arranca en sesión 05 (Hub) y sesión 10 (Admin overview).
- La sesión de Sofia ya tiene `tool_access` a `claude` + `3dsky` y 30 créditos (sembrados en sesión 02). Tomas no tiene `tool_access` porque es admin (puede ver todo desde el panel, no consume en el Hub).
- `getSession()` usa `React.cache()`. Funciona en producción pero en tests no se resetea entre casos — por suerte la firma de `getSession()` no toma args, así que mientras la cookie + stub se cambien antes de cada test el cache no se gatilla. Si en algún momento tira test flaky, agregar `vi.resetModules()` en beforeEach.

## Cómo probar lo que se construyó

```bash
cd nqs-ai-hub
npm run dev
```

Abrí http://localhost:3000 (o el puerto que use Next). El flujo manual:

1. Sin sesión, entrá a `/hub` → te manda a `/login?next=/hub`.
2. Loguéate como `sofia@nqs.test` / `nqs2026sofia` → te lleva a `/hub`, ves "Hola, Sofía Galván" y el rol `employee`.
3. Intentá entrar a `/admin` → te manda a `/hub` (forbidden por rol).
4. Logout (botón salir) → vuelve a `/login`.
5. Loguéate como `tomas@nqs.test` / `nqs2026admin` → te lleva a `/admin`, ves "Admin: Tomás Pérez".
6. Con sesión de Tomas, entrá manualmente a `/login` → te manda a `/hub` (proxy detecta cookie).
7. Probá un password incorrecto → el card hace shake y aparece "↳ credenciales inválidas".

Tests automáticos:
```bash
npm test          # 6 tests, todos verdes
npm run typecheck # tsc --noEmit
npm run build     # next build (compila + analiza rutas)
```

Smoke E2E con curl (con dev server en 3003):
```
GET  /hub anónimo               → 307 /login?next=/hub
POST /api/auth/login (sofia)    → 200 {ok:true, redirect:/hub}
GET  /hub con cookie sofia      → 200
GET  /admin con cookie sofia    → 307 /hub
POST /api/auth/login (tomas)    → 200 {ok:true, redirect:/admin}
GET  /admin con cookie tomas    → 200
POST /api/auth/login (pwd mal)  → 401 {ok:false, error:"credenciales inválidas"}
GET  /login con cookie tomas    → 307 /hub
POST /api/auth/logout           → 200; luego /hub vuelve a 307
GET  / con cookie tomas         → 307 /admin
```

## Endpoints creados

| Método | Path | Body | Respuesta |
|---|---|---|---|
| POST | `/api/auth/login` | `{email, password}` | `{ok:true, redirect, user}` ó `{ok:false, error}` |
| POST | `/api/auth/logout` | — | `{ok:true}` (limpia cookies) |
| GET  | `/api/auth/session` | — | `{session: {email,name,role}}` ó `{session:null}` |

## Cómo está manejado el rol

1. **Login**: el server lee `public.users.role` por el `id` que devolvió `signInWithPassword`. Decide redirect (`/admin` vs `/hub`) y lo manda al cliente.
2. **Cualquier render protegido**: `getSession()` hace `auth.getUser(token)` para validar firma+expiración, después query `public.users` para resolver rol. Cacheado por request.
3. **Frontend NO conoce el rol antes del login** — solo pre-rellena un email según botón apretado. El switch es UX.
4. **JWT metadata se ignora.** Solo `public.users.role` decide.

## Errores conocidos

- (ninguno bloqueante)
- `next dev` puede usar puertos alternos si 3000 está tomado por otro proyecto en tu máquina (en mi entorno corrió en 3003). No afecta funcionalidad.

## Variables de entorno agregadas

(ninguna nueva — reutiliza `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` de sesión 02.)

## Commits sugeridos

```
feat(auth): login con Supabase Auth + proxy guard + tests
```

(Sesión 03 chica, un commit alcanza.)

## Próximo paso

`kit/prompts/mvp/04-layout.md` — topbar + marquee + nav + user chip en el grupo `(dashboard)`.
