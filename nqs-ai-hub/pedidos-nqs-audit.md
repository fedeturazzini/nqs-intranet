# Auditoría — pedidos NQS (panel de usuarios + solicitudes)

**Fecha**: 2026-06-28 · **Branch**: `develop` · **Read-only** (único archivo nuevo: este).
Diagnóstico de 3 puntos. **C es un bug** (prioridad).

---

## PUNTO A — Dar de baja vs. eliminar usuario

### Cómo está armado hoy
- **La "baja" es un soft-delete**: setea `public.users.is_active = false`. La fila
  **sigue en la lista** con badge BAJA; se puede reactivar (is_active=true).
- **Endpoints** (`src/app/api/admin/users/[id]/route.ts`):
  - `PATCH` → edita campos, incluido `isActive` (toggle baja/alta).
  - `DELETE` → **NO borra**: hace `update({ is_active: false })` (soft delete).
    El comentario del archivo lo dice explícito.
- **No existe hard-delete de usuarios.** El único `db.auth.admin.deleteUser(...)`
  está en el **rollback** de la creación (`src/app/api/admin/users/route.ts:151`),
  no expuesto como acción de admin.
- `public.users.id` es `UUID PRIMARY KEY DEFAULT gen_random_uuid()` — **no tiene
  FK a `auth.users`**. public.users y auth.users solo comparten el UUID (lo setea
  el flujo de alta). ⇒ borrar uno **no** cascadea al otro: un borrado real tiene
  que tocar **las dos tablas** por separado.

### Qué pasaría al "eliminar definitivamente" — las FK
Un `DELETE FROM public.users WHERE id=…` directo se comporta así según cada FK
(`REFERENCES users(id)`):

**Se borran/ajustan solas (ON DELETE CASCADE / SET NULL):**
| Tabla.columna | ON DELETE |
|---|---|
| `tool_access.user_id` | CASCADE |
| `claude_conversations.user_id` | CASCADE (→ `claude_messages.conversation_id` CASCADE) |
| `credit_allocations.user_id` | CASCADE |
| `module_sessions.user_id` | CASCADE |
| `user_active_project.user_id` | CASCADE |
| `time_windows.user_id` | CASCADE |
| `users.reports_to_id` (self) | **SET NULL** (los subordinados quedan sin jefe; no bloquea) |

**BLOQUEAN el borrado (sin ON DELETE → NO ACTION/RESTRICT):**
| Tabla.columna | Nota |
|---|---|
| `usage_logs.user_id` (NOT NULL) | **casi siempre tiene filas → bloquea seguro** |
| `access_requests.user_id` (NOT NULL) | bloquea si pidió algo |
| `credit_transactions.user_id` (NOT NULL) | bloquea si hubo movimientos |
| `security_events.user_id` (NOT NULL) | |
| `screenshots.user_id` (NOT NULL) | |
| Columnas de auditoría `*_by` (nullable): `tool_access.granted_by`, `system_prompts.created_by`, `credit_pools.purchased_by`, `credit_transactions.performed_by`, `access_requests.reviewed_by`, `screenshots.reviewed_by`, `projects.created_by`, `brain_config.updated_by` | bloquean si **ese** user hizo la acción |

⇒ **Un borrado directo HOY falla** (FK violation) — con que tenga 1 fila en
`usage_logs` ya alcanza. Quedarían huérfanos / error, no borrado limpio.

### Causa / qué tocar
Para "eliminar del todo" hay que decidir una de estas dos vías:
1. **Migración** que agregue, a las tablas de datos PROPIOS del user
   (`usage_logs`, `access_requests`, `credit_transactions`, `security_events`,
   `screenshots`), `ON DELETE CASCADE`; y a las columnas de auditoría `*_by`,
   `ON DELETE SET NULL` (preservar el registro, perder "quién"). Después un
   endpoint nuevo `DELETE` "hard" hace: `db.auth.admin.deleteUser(id)` **+**
   `delete public.users where id` (los hijos caen por cascade). Atómico y limpio.
2. **Sin migración**: endpoint que borra los hijos en orden (o los re-asigna) y
   recién después el user + el auth user. Más código y más frágil.
- **Recomendación**: opción 1 (cascade en DB) + endpoint hard-delete separado del
  soft-delete actual, con confirmación fuerte en la UI ("esto es irreversible").
  Mantener el soft-delete (baja) como acción distinta.
- **Archivos**: `src/app/api/admin/users/[id]/route.ts` (nuevo método o flag),
  `src/components/admin/UsersTable.tsx` (botón "eliminar" + modal de confirmación),
  + una migración nueva para las FK.

---

## PUNTO B — Orden de la tabla de usuarios

### Cómo está armado hoy
- **Fuente y orden**: tanto `GET /api/admin/users` (`route.ts:53`) como la página
  `src/app/(dashboard)/admin/users/page.tsx:39` traen los users
  **`.order("created_at", { ascending: true })`** → se muestran en **orden de
  creación**, no alfabético/rol/dept.
- **`UsersTable.tsx`**: hace `users.map(...)` directo (línea 126). **No ordena ni
  tiene headers clickeables** — renderiza tal cual llega. Es client component con
  TODOS los users en memoria (`initialUsers`).
- **Departamentos (lista fija + orden)**: `src/lib/constants/departments.ts` →
  `DEPARTMENTS = [PARTNER, AD, PM, 3D ARTIST, 3D MODELING, PP ARTIST, IN ARTIST]`.
  Para ordenar "por menú" se usa `DEPARTMENTS.indexOf(dept)`, no alfabético.
- **`AccessPanel.tsx` (Horarios & Accesos)**: la columna de usuarios **agrupa por
  dept** (`groupedUsers`, línea 79) y dentro de cada grupo ordena por
  `name.localeCompare(…, "es")` (línea 89). PERO el **orden de los grupos** es el
  de aparición (≈ created_at), **no** el orden del menú de departamentos. Distinto
  de `UsersTable` (lista plana por created_at).

### Causa / qué tocar
- No hay ninguna lógica de orden por Usuario / Rol / Dept ni en la query ni en la
  tabla. Como ambos componentes tienen todos los users client-side, **se ordena en
  el cliente** (sin tocar queries).
- Para "Dept en orden del menú": comparador por `DEPARTMENTS.indexOf(dept)` (los
  desconocidos / vacíos al final).
- Para que **coincida** en Usuarios y en Horarios/Accesos: reusar el mismo
  comparador y, en `AccessPanel`, ordenar también los **grupos** por
  `DEPARTMENTS.indexOf`.
- **Recomendación**: **ambos** — un orden por default (sugerido: Usuario
  alfabético) **+ headers clickeables** (Usuario / Rol / Dept) que togglean
  asc/desc. Es la mejor UX y es barato (client-side).
- **Archivos**: `src/components/admin/UsersTable.tsx` (estado de sort + headers
  clickeables + comparadores), `src/components/admin/AccessPanel.tsx` (orden de
  grupos por `DEPARTMENTS.indexOf`), reusando `src/lib/constants/departments.ts`.

---

## PUNTO C — La solicitud de acceso "no se envía" / queda colgada (BUG)

### Cómo está armado hoy
**Disparador (cliente)**: `src/components/tool/RequestAccessModal.tsx` (desde el
hub / card bloqueada; misma familia: `CreditRequestModal`, `ExceptionalAccessForm`,
`TutorialesGate`).

`handleSubmit` (líneas 90–124):
- `setSubmitting(true)` → `fetch("/api/me/access-request", …)`.
- **NO tiene `finally`**. El reset de `submitting` solo está en la rama de error de
  API (línea 111) y en el `catch` de red (línea 122). En el **path de éxito**
  llama `onSubmitted(...)` **sin** `setSubmitting(false)`.
- **NO tiene timeout / AbortController** en el fetch.
- ⇒ **Es exactamente el mismo defecto que tenía "crear usuario"**: si la respuesta
  tarda mucho o nunca llega, el botón queda en **"enviando…"** para siempre, sin
  forma de resetear salvo cerrar/reabrir.

**Endpoint** `src/app/api/me/access-request/route.ts`:
1. Valida sesión / body / tool existe / no coming_soon / no duplicada.
2. **Inserta la solicitud** en `access_requests` (línea 113) — *antes* de Slack.
3. **`await notifySlack({...})`** (línea **136**) — **BLOQUEANTE**, igual que el
   `await sendWelcomeEmail` del bug de crear usuario.
4. Recién después `return { ok, requestId }`.

**¿Cuelga el Slack la respuesta?** `notifySlack` (en `slack.ts`) tiene un
`AbortController` con **timeout de 5s** y **nunca lanza excepción** (catch
silencioso). ⇒ el `await` se banca **hasta ~5s** y resuelve igual. No cuelga
*infinito* por Slack, pero **sí demora la respuesta hasta 5s** en cada solicitud
(y más si el webhook se comporta raro). Anti-patrón idéntico al de
`sendWelcomeEmail`, aunque más defensivo.

**¿La solicitud se guarda aunque falle Slack?** **Sí.** El insert ocurre en el
paso 2, antes del Slack, y `notifySlack` no rompe. La fila queda creada pase lo
que pase con Slack.

### Causa más probable
Es **el mismo patrón del bug de crear usuario**, en dos capas que se potencian:
- **Cliente sin `finally` ni timeout** → si la respuesta se demora (los ~5s del
  Slack bloqueante) o se cae la red, el botón queda en "enviando…" sin resetear.
- **Server con `await notifySlack` bloqueante** → suma hasta ~5s de latencia a
  cada solicitud y la hace "sentir colgada".
- Dato fino: como la solicitud **sí se inserta** antes del Slack, es muy probable
  que **ya quedó creada** aunque el usuario crea que "no se mandó" (el botón nunca
  confirmó). En un reintento, el guard `already_pending` le diría "ya tenés una
  solicitud pendiente" — síntoma típico de este bug.

### Qué tocar (mismo fix que crear-usuario)
- **Cliente** (`RequestAccessModal.tsx`, y replicar en `CreditRequestModal`,
  `ExceptionalAccessForm`, `TutorialesGate`): `try/catch/finally` con
  `setSubmitting(false)` en `finally` + `AbortController` con timeout (ej. 30s) y
  mensaje claro ("La solicitud tardó demasiado, probá de nuevo").
- **Server** (`access-request/route.ts`, y los otros que mandan Slack:
  `exceptional-access`, `tools/*/request-credits`): pasar `await notifySlack(...)`
  a **fire-and-forget** (`void notifySlack(...).catch(console.error)`). La
  solicitud ya está guardada → la respuesta sale al toque y el Slack viaja en
  paralelo.
- **Nota**: este patrón (await de notif best-effort + cliente sin finally/timeout)
  está en **todas** las modales de solicitud, no solo acceso. Conviene arreglarlo
  de forma consistente en las 4.

---

## Resumen

| Punto | Estado hoy | Acción |
|---|---|---|
| **A** Eliminar usuario | Solo soft-delete (`is_active=false`); no hay hard-delete; FK mixtas (varias bloquean el borrado real) | Migración (cascade en datos propios + set-null en `*_by`) + endpoint hard-delete (auth + public) + confirmación en UI |
| **B** Orden de tabla | Sin orden (created_at); `UsersTable` no sortea; `AccessPanel` agrupa por dept pero no en orden del menú | Sort client-side: default + headers clickeables; dept por `DEPARTMENTS.indexOf`; mismo comparador en ambos |
| **C** Solicitud colgada (BUG) | Cliente sin `finally`/timeout + server con `await notifySlack` bloqueante (≤5s). La solicitud igual se guarda | Mismo fix que crear-usuario: `finally`+timeout en el cliente; `notifySlack` fire-and-forget en el server. Aplicar a las 4 modales |

**Próximo paso**: arrancar por **C** (es el bug). A y B son mejoras.
