# Auditoría — Sesión única por usuario (+ aprobación de dispositivos)

**Fecha:** 2026-07-16 · **Branch:** `develop` · **Read-only** (único archivo nuevo: este).
Objetivo: entender la auth/sesión actual para dimensionar "una sola compu/sesión a la
vez" y, opcionalmente, "el admin aprueba dispositivos nuevos".

> **TL;DR.** La auth es **custom sobre Supabase Auth** (cookies httpOnly propias, NO
> `@supabase/ssr`). Todo request pasa por UN único cuello: `getSession()` — ese es el
> punto de enganche natural para cualquier chequeo de sesión/dispositivo. Hoy **no hay
> nada** de dispositivos ni sesiones múltiples: no se registra el login (ni IP, ni
> user-agent, ni "último acceso"), el logout no revoca nada server-side, y el mismo
> usuario puede estar logueado en N compus a la vez sin que el sistema se entere.
> La buena noticia: el circuito de "solicitud → aviso a Slack → admin aprueba/rechaza"
> ya existe entero para las herramientas y se recicla casi 1:1 para dispositivos.

---

## 1. AUTH ACTUAL

### Cómo se maneja la sesión

```
LOGIN   POST /api/auth/login  (cliente anon de Supabase)
        signInWithPassword() → { access_token (JWT ~1h), refresh_token }
        set-cookie  sb-access-token   httpOnly, sameSite=lax, maxAge 7 DÍAS
        set-cookie  sb-refresh-token  httpOnly, sameSite=lax, maxAge 7 DÍAS
        (bloquea usuarios con is_active=false; error genérico anti-enumeración)

CADA REQUEST
        proxy.ts (edge)     → SOLO mira que la cookie EXISTA (no valida JWT, no toca DB)
        getSession()        → auth.getUser(accessToken) contra Supabase (valida firma,
                              expiración y revocación) + SELECT del perfil en
                              public.users (resuelve rol). Cacheado por-request.
        requireAuth() / requireAdmin() / requireAdminApi() / requireToolAccess()
                            → todos llaman a getSession() y deciden (redirect o 401/403).

SI EL JWT VENCIÓ (≈1h)
        el server devuelve 401 → el CHAT (useClaudeChat) llama POST /api/auth/refresh
        (rota ambas cookies con el refresh token) y reintenta UNA vez. Si el refresh
        falla → limpia cookies → "tu sesión expiró" → /login.
        ⚠️ Este refresh es REACTIVO y está cableado SOLO en el chat de Claude. Una
        navegación de página con token vencido NO refresca: requireAuth() → /login.

LOGOUT  POST /api/auth/logout → borra las 2 cookies y NADA MÁS.
        ⚠️ Comentario explícito en el código: NO invalida la sesión en Supabase
        (auth.admin.signOut quedó como TODO). O sea: "cerrar sesión" hoy es local
        a esa compu; los tokens siguen vivos server-side hasta expirar.
```

### Middleware / proxy

- **No hay `middleware.ts`** — en Next 16 se llama **`src/proxy.ts`** (misma firma).
- Qué chequea hoy: **solo presencia** de la cookie `sb-access-token`. Anónimo en ruta
  privada → páginas: redirect a `/login?next=…`; APIs: `401` JSON. Rutas públicas:
  `/login`, `/forgot-password`, `/reset-password`, `/api/auth/*`.
- **No hace round-trip a DB ni a Supabase** (decisión deliberada: edge barato). La
  fuente de verdad es `getSession()` en cada page/route handler.
- Detalle fino documentado en el propio archivo: NO bouncea `/login → /hub` con cookie
  presente, para evitar loops con cookies stale.

### Protección de rutas

| Capa | Qué protege | Dónde |
|---|---|---|
| `proxy.ts` (edge) | pre-pantalla anti-anónimos (toda la app salvo públicas) | `src/proxy.ts` |
| `requireAuth()` | páginas del hub (server components) | `src/lib/auth/server.ts` |
| `requireAdmin()` | páginas `/admin/*` (redirige a /hub si no es admin) | ídem |
| `requireAdminApi()` | endpoints `/api/admin/*` (401/403 JSON) | `src/lib/auth/admin-guard.ts` |
| `requireToolAccess()` | uso de cada tool (acceso + horario) | `src/lib/middleware/permissions.ts` |

**Todos convergen en `getSession()`** → cualquier regla nueva de sesión/dispositivo que
se meta ahí aplica automáticamente a TODA la app (páginas + APIs + tools). Es el punto
de enganche.

### Duración / config

| Cosa | Valor | Dónde |
|---|---|---|
| Cookies (ambas) | **7 días** (`maxAge`) | `login/route.ts` y `refresh/route.ts` (`ONE_WEEK_SECONDS`) |
| JWT (access token) | **~1 hora** (default de Supabase; no visible en el repo — se configura en el dashboard: Authentication → Settings → JWT expiry) | dashboard Supabase |
| Refresh token | rota en cada uso (Supabase); vive mientras la sesión exista | Supabase |
| Config de "Sessions" de Supabase (single session / time-box / inactividad) | **no configurada** (no hay `supabase/config.toml` en el repo; es dashboard) | dashboard Supabase |

---

## 2. MODELO DE USUARIO

### `public.users` — campos actuales

`id, email, name, initials, avatar_url, dept, job_title, role (admin|employee),
theme_preference, is_active, is_in_org, org_role, org_position, reports_to_id,
org_x, org_y, created_at, updated_at`

- **Nada de dispositivos ni sesiones.** Ni `last_login`, ni `last_seen`, ni contador
  de sesiones, ni device-id. Confirmado.

### ¿Dónde se registran logins?

- **En ningún lado.** `POST /api/auth/login` no escribe en `usage_logs`, ni en
  `security_events`, ni actualiza ningún campo del user. Cero rastro de "cuándo/desde
  dónde entró". (En `usage_logs` sí se registran acciones admin — ej. reset de
  password — pero no logins.)
- **`security_events`** existe desde la migración 0001 (user_id, rule_id, severity,
  excerpt, action_taken) pero está **dormida**: nadie escribe ni lee esa tabla desde la
  app. Serviría tal cual como bitácora de eventos de sesión (login nuevo, kick,
  dispositivo rechazado) si se quisiera.
- **`module_sessions`** (3DSky/Kling) es lo más parecido que hay a "sesiones", pero es
  **por herramienta**, no de login: `user_id, tool_id, entered_at, exited_at,
  declared_consumption, ip_address INET, user_agent TEXT`. Dato clave: **el patrón de
  capturar IP (`x-forwarded-for`) y user-agent ya está escrito** en
  `tools/3dsky/session/start/route.ts` (y Kling) — se copia tal cual para registrar
  dispositivos.

---

## 3. PUNTOS DE ENGANCHE (por nivel, sin implementar)

### Nivel 1 — Nativo de Supabase ("single session" por config)

**Qué es:** Supabase Auth tiene settings de Sessions en el dashboard (enforce single
session per user / time-box / inactivity timeout). Al loguearse en la compu B, Supabase
revoca la sesión (refresh token) de la compu A.

**Qué tocar:**
- Dashboard: activar single session + **bajar el JWT expiry** (ej. 5-10 min). Nada de
  esto vive en el repo. ⚠️ **Confirmar que el plan de Supabase del proyecto incluya los
  settings de Sessions** (suelen ser de plan Pro) — no verificable desde el código.

**El problema fino (por qué no es "gratis"):**
1. **El kick NO es instantáneo.** Revocar la sesión mata el *refresh*, pero el access
   token de la compu A sigue siendo válido hasta que expira. Con el expiry actual (~1h),
   el "te desconecté" tarda hasta 1 hora. Por eso hay que bajar el JWT a minutos.
2. **Bajar el JWT expiry rompe la UX actual**, porque el refresh hoy es reactivo y
   SOLO existe en el chat: con tokens de 10 min, cualquier persona navegando el hub se
   encontraría deslogueada a los 10 min de actividad normal. **Prerequisito real:
   refresh proactivo en `proxy.ts`** (si el token está por vencer, canjear el refresh y
   re-setear cookies en la respuesta — el "fix B" que quedó anotado como pendiente en
   el propio código del refresh). Eso es código, no config.
3. **UX del kickeado:** ya existe la mitad — el flujo 401 → intento de refresh → "tu
   sesión expiró" → /login (en el chat). Faltaría: mensaje diferenciado ("alguien entró
   con tu cuenta en otro dispositivo") — hoy no se puede distinguir "expiró" de
   "te kickearon" sin tocar nada.

**Qué NO da este nivel:** ver quién está conectado y desde dónde, elegir la política
("gana el último" es fija — el nuevo login siempre desplaza al viejo), aprobar
dispositivos, ni bitácora. Es la opción mínima.

### Nivel 2 — Custom "instant" (sesión única propia, kick inmediato)

**Idea:** una tabla propia de sesiones + un id de sesión en cookie + el chequeo dentro
de `getSession()`. Como TODA la app pasa por `getSession()` en cada request, el kick es
efectivo en la request siguiente del desplazado (en la práctica: al toque).

**Piezas nuevas:**
| Pieza | Detalle |
|---|---|
| Migración: tabla `user_sessions` | `id, user_id FK, session_key (uuid de la cookie), user_agent, ip_address INET, created_at, last_seen_at, revoked_at, revoked_reason` |
| Cookie nueva `nqs-session-id` | httpOnly, se setea en el login junto a las otras dos |
| Login | inserta la sesión (con IP/UA — patrón ya escrito en module_sessions) y, según política: **(a) revoca las demás** ("gana el último") o **(b) rechaza el login** ("ya hay una sesión activa") — decisión de producto a cerrar con NQS |
| Chequeo por request | en **`getSession()`** (`src/lib/auth/server.ts`): tras validar el JWT, verificar que la `nqs-session-id` esté viva (revoked_at IS NULL). Es 1 query más por request (o se combina con el SELECT del perfil en una RPC para no sumar round-trip). **NO va en `proxy.ts`**: el edge hoy no toca DB y conviene que siga así (latencia) |
| Logout | marcar `revoked_at` + borrar cookies (de paso cierra el TODO actual de "logout no revoca nada") |
| UX del kickeado | pantalla/toast "te desconectaste porque tu cuenta entró desde otra compu" (redirect a `/login?reason=kicked`); el manejo 401→login del chat ya existe y se generaliza |
| (Opcional) presencia | con `last_seen_at` el admin puede ver "conectado hace 2 min, desde tal navegador" en el panel |

**Ventajas sobre Nivel 1:** kick inmediato (no depende del expiry del JWT), política a
elección, bitácora propia, visibilidad para el admin, cero dependencia del plan de
Supabase. **No requiere** bajar el JWT ni el refresh proactivo (aunque el refresh
proactivo sigue siendo deseable como mejora general).

### Nivel 3 — Aprobación del admin para dispositivos nuevos

Se monta encima del Nivel 2 (o directo, compartiendo la infraestructura):

| Pieza | Detalle | Reusa |
|---|---|---|
| Cookie `nqs-device-id` de larga vida (~1 año) | identifica la compu/navegador entre logins | — |
| Tabla `user_devices` | `id, user_id, device_id, label (UA parseado: "Chrome en Mac"), user_agent, ip_first, status, reviewed_by, reviewed_at, first_seen_at, last_seen_at` | enum **`request_status`** (`pending/approved/rejected/expired`) ya existe |
| Flujo de login | password OK → ¿device conocido y aprobado? → entra. ¿Desconocido? → se registra `pending`, **NO** se setean cookies de sesión, pantalla "tu dispositivo espera aprobación del admin" | espejo del gate de tools (`TutorialesGate` como referencia de pantalla de espera) |
| Aviso a Slack | "🔔 {nombre} quiere entrar desde un dispositivo nuevo (Chrome en Mac)" con @channel + botón al panel | `newRequestPayload` de `src/lib/notifications/slack.ts`, tal cual |
| Panel admin | lista de dispositivos pendientes + aprobar/rechazar (+ revocar uno ya aprobado = kick de esa compu) | patrón completo de `/admin/requests` + `requireAdminApi` + notifs de resolución sin @channel |
| Bootstrap | qué pasa el día 1: recomendación = auto-aprobar el primer dispositivo de cada usuario existente (si no, el lunes siguiente hay 15 personas bloqueadas y un admin apagando incendios) | — |
| Bitácora | registrar altas/aprobaciones/rechazos | `usage_logs` (patrón `admin.user.password_reset`) o `security_events` (dormida, lista para esto) |

**Limitación honesta a avisarle a NQS:** la identidad del dispositivo es una cookie.
Borrar cookies / modo incógnito / otro navegador en la misma compu = "dispositivo
nuevo" que vuelve a pedir aprobación. Es el estándar de este tipo de feature (el
fingerprinting "real" es frágil e invasivo); conviene enmarcarlo como "aprobás
navegadores, no fierros".

---

## 4. REUSO (qué ya está vs. qué es nuevo)

| Ya existe y se reusa | Para qué |
|---|---|
| `getSession()` como cuello único de validación | el chequeo de sesión/dispositivo se agrega UNA vez y cubre toda la app |
| Patrón captura IP + user-agent (`module_sessions` start) | registrar sesiones/dispositivos |
| Enum `request_status` + forma de `access_requests` (pending/reviewed_by/review_note) | estados de aprobación de dispositivos |
| Circuito Slack completo (solicitud con @channel, resolución sin @channel, botón al panel) | avisos de dispositivo nuevo / aprobado / rechazado |
| Panel `/admin/requests` + endpoints approve/reject + `requireAdminApi` | UI y API de aprobación (se clona, no se inventa) |
| Flujo 401 → refresh → "sesión expirada" → /login (chat) | base de la UX del kickeado |
| `usage_logs` / `security_events` (dormida) | bitácora de eventos de sesión |
| Toasts, modales con confirm fuerte, `UserDetailModal` | UI admin (ej. "revocar dispositivo") |

| Es nuevo (no hay nada hoy) | Nivel |
|---|---|
| Registro de logins (hoy: cero rastro) | 2-3 |
| Tabla `user_sessions` + cookie de sesión + chequeo en `getSession()` | 2 |
| Revocación server-side en el logout (hoy es un TODO explícito) | 2 |
| Refresh proactivo en `proxy.ts` (prerequisito real del Nivel 1; deseable siempre) | 1 |
| Tabla `user_devices` + cookie device + flujo de login con estado pendiente + panel | 3 |
| Pantallas: "esperando aprobación" y "te desconectaron de esta compu" | 2-3 |

---

## Dimensionamiento

| Nivel | Qué da | Tamaño | Nota de esfuerzo |
|---|---|---|---|
| **1 — Supabase nativo** | sesión única "gana el último", kick diferido (minutos), sin visibilidad ni aprobación | **CHICO** (con asterisco) | La config es un rato en el dashboard, PERO usable de verdad exige el **refresh proactivo en el proxy** (código) + confirmar que el plan de Supabase tenga los settings de Sessions. Sin el refresh proactivo, bajar el JWT desloguea a todo el mundo cada N minutos navegando. |
| **2 — Custom instant** | sesión única con kick inmediato, política a elección (desplaza o bloquea), bitácora, "conectado desde…", logout que revoca de verdad | **MEDIANO** | 1 migración + login/logout + 1 query en getSession + 2 pantallas de UX. Sin dependencia del plan de Supabase. Es el que recomiendo cotizar como base. |
| **3 — Aprobación admin** | además: dispositivos registrados, alta pendiente, aprobar/rechazar/revocar desde el panel, Slack | **MEDIANO-GRANDE** (sumado al 2) | El grueso es flujo de login con estados + panel; la mitad del trabajo es reciclaje directo del circuito de solicitudes existente. Decidir bootstrap (auto-aprobar el primer dispositivo) y comunicar la limitación de "dispositivo = navegador". |

**Recomendación de camino:** si NQS quiere "una sola compu a la vez" en serio, ir
directo al **Nivel 2** (el Nivel 1 tiene kick diferido, política fija y dependencia del
plan de Supabase — y su prerequisito de código se solapa con el trabajo del 2). El
**Nivel 3** se vende como módulo aparte arriba del 2, reciclando el circuito de
aprobaciones que ya conocen del panel de solicitudes.

**Decisiones de producto a cerrar con NQS antes de arrancar:**
1. Política del segundo login: ¿desplaza al anterior ("gana el último") o se bloquea
   hasta cerrar la otra sesión?
2. ¿Aplica también a admins, o los admins pueden multi-sesión?
3. Nivel 3: ¿auto-aprobar el primer dispositivo de cada usuario existente?
