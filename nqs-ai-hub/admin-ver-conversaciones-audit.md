# Auditoría: Admin ver conversaciones de empleados

**Fecha:** 2026-08-06  
**Branch:** `develop` (solo lectura)  
**Estado:** read-only — diagnóstico, sin cambios de código, sin migraciones, sin deploy.  
**Único deliverable:** este archivo.

---

## Veredicto (tl;dr)

**Mediano.** La data está lista y completa en DB: se puede reutilizar casi toda la lógica de listado/detalle y el render del chat. Lo que hay que construir es capa admin (endpoints + UI + guards cross-user) y decidir qué hacer con proyectos privados. No es “grande” (no hay que rediseñar persistencia) ni “fácil” (no se puede abrir `/api/me/conversations` a otro user sin romper el modelo de ownership).

---

## 1. Cómo está guardada la data

### 1.1 Tablas y relaciones

| Tabla | Columnas relevantes | Relación |
|---|---|---|
| `claude_conversations` | `id`, `user_id`, `title`, `project_id`, `created_at`, `updated_at` | Dueño = `user_id` → `users`. Proyecto = `project_id` → `projects` (nullable; ON DELETE SET NULL). |
| `claude_messages` | `id`, `conversation_id`, `role` (`user` \| `assistant`), `content` (TEXT), `images` (JSONB paths), `tokens_input`, `tokens_output`, `created_at` | Cascade al borrar la conversación. |
| `claude_files` | `id`, `conversation_id`, `message_id` (nullable), `user_id`, `name`, `media_type`, `storage_path`, `size_bytes`, … | Archivos generados por Claude (code execution). Binario en Storage (`claude-uploads`); en DB solo metadata + path. |

Índices útiles hoy:
- `claude_conversations(user_id)`, `(updated_at DESC)`, `(user_id, project_id)`
- `claude_messages(conversation_id)`
- `claude_files(conversation_id)`, `(user_id)`

**No hay** índice de búsqueda full-text / `ilike` sobre `claude_messages.content`.

### 1.2 ¿Se guarda TODO el contenido?

**Sí, en lo esencial para auditoría de uso:**

| Qué | ¿Persistido? | Notas |
|---|---|---|
| Prompt del usuario (texto) | Sí | `claude_messages.content` role=`user` |
| Respuesta de Claude (texto) | Sí | Incluye markdown / artifacts de texto en el `content` |
| Imágenes subidas por el user | Sí (paths) | `images` JSONB = paths en Storage; URLs firmadas on-demand (1h) |
| PDFs subidos | Sí (paths) | Mismos paths en `images`; **nombre original no se guarda** → al recargar se muestra label genérico `documento.pdf` |
| Archivos generados (PDF/Word/Excel/…) | Sí | `claude_files` + Storage; nombre real sí |
| Tokens in/out | Sí | En el mensaje assistant |
| Proyecto de la conversación | Sí | `project_id` (migration 0009) |
| Thinking / tool_use crudo de Anthropic | No como tabla aparte | Lo que queda es el texto final que se insertó en `content` |

### 1.3 ¿Completo en DB o algo vive solo en el cliente?

- **Fuente de verdad = DB.** El sidebar y el reload leen de `/api/me/conversations` y `/api/me/conversations/[id]`.
- El cliente tiene estado en memoria (`useClaudeChat` / session store) **solo mientras la pestaña está abierta**; no es un historial paralelo.
- **Caveat real:** la persistencia es *best-effort* después de cobrar tokens a Anthropic. Si el insert falla, el user ve la respuesta en esa sesión, pero **esa vuelta puede no quedar en DB** (queda log de error). Para cotizar: el admin ve lo que se persistió; no hay garantía 100% de cada turno histórico.

### 1.4 Vínculo con gasto (`usage_logs`)

Cada `claude.execute` escribe en `usage_logs.metadata`:
`projectId`, `conversationId`, `messageId`, tokens, model, etc.

Eso permite, en una variante más rica, saltar desde una fila de gasto → conversación concreta. Hoy el detalle de Gasto (`/admin/logs/[userId]`) **no** expone ese link (solo modelo/tokens/USD).

---

## 2. Lo que ya existe y se podría reusar

### 2.1 Endpoints del empleado (`/api/me/conversations`)

| Endpoint | Qué hace | ¿Reutilizable para admin? |
|---|---|---|
| `GET /api/me/conversations` | Últimas **20** convs del **proyecto activo** del session user; respeta gate privado | **No tal cual.** Filtra por `session.userId` + proyecto activo. |
| `GET /api/me/conversations/[id]` | Mensajes + firma de imágenes + adjuntos `claude_files`; ownership estricto (`user_id === session` → si no, **404**) | **Lógica interna sí; ruta no.** El armado de respuesta (orden, firmas, huérfanos) se puede copiar/extraer. |
| `PATCH …/[id]` | Renombrar | No aplica (feature es lectura). |

Capa de query reusable hoy:
- `listConversationsForProject(userId, projectId)` — ya recibe `userId` como parámetro; el caller decide de quién. Hoy el endpoint `/me` solo pasa el de la sesión.
- Para admin hace falta una variante **“todas las conversaciones de un user”** (sin filtrar solo por proyecto activo), o listar por `user_id` + filtros opcionales.

### 2.2 Panel admin actual — dónde encaja

Sidebar admin (`AdminSidebar`): Usuarios, Accesos, System Brain, Proyectos, Organigrama, Solicitudes, **Gasto**.

Patrones útiles:
- **Gasto** (`/admin/logs` → `UsdLogsView` → `/admin/logs/[userId]`): lista usuarios → click → detalle. Es el patrón que sugirió el cliente y ya existe.
- **Usuarios** (`/admin/users` + `UserDetailModal`): ABM; se podría agregar un link “ver conversaciones”, pero no es el flujo natural de “control de uso”.
- Layout `/admin/*` ya exige `requireAdmin()`.

**Más simple dado el código actual:** integrar desde **Gasto** (botón/link en la fila o en el detalle del user) hacia algo tipo `/admin/logs/[userId]/conversations` o `/admin/conversations?userId=…`. Una sección aparte en el sidebar es viable pero más UI + navegación sin ganancia de datos.

### 2.3 Visor de mensajes / render

- `ChatMessages` renderiza markdown, artifacts, imágenes, PDFs, `FileCard` — **no escribe**. Es reutilizable en modo lectura.
- El input (`ChatInput`) vive en `ClaudeView`; para admin basta **no montarlo**.
- `ConversationsSidebar` mezcla rename/nueva conversación: mejor un listado admin más simple (tabla o lista sin acciones de escritura), o reusar solo el layout visual.
- Descarga de archivos: `GET /api/tools/claude/files/[id]` valida **owner** (`file.user_id === session`). Si el admin abre una conversación ajena, los `FileCard` fallan con 403 salvo que ese endpoint (o uno admin) permita admin.

---

## 3. Permisos y seguridad

### 3.1 Admin vs empleado hoy

- Rol en `users.role`: `"admin" | "employee"`.
- Páginas: `requireAdmin()` (redirect a `/hub` si no).
- APIs admin: `requireAdminApi()` → 401/403.
- El backend usa `service_role` (salta RLS). La seguridad real está en **checks de aplicación**, no en RLS solo.
- RLS de conversaciones: policy `claude_conv_own` → solo `user_id = auth.uid()`. **No hay policy de admin** sobre conversaciones (irrelevante mientras se use service_role).

### 3.2 Ownership en conversaciones

Hoy:
- GET detalle: si no sos el dueño → **404** (no filtrar existencia).
- PATCH: dueño o **403**.
- Listado `/me`: solo las propias + proyecto activo + gate.

Para admin ver ajenas hace falta **endpoints nuevos** bajo `/api/admin/…` (o ampliar con `requireAdminApi` + bypass de ownership). **No** conviene “abrir” `/api/me/…` al admin: mezclaría identidades y rompería el contrato de “solo lo mío”.

Guard mínimo:
1. `requireAdminApi()` en list/detail admin.
2. Resolver conversación por `id` (y opcionalmente `userId` de URL).
3. **No** exigir `conv.user_id === session.userId`.
4. Mantener endpoints `/me` intactos (empleados sin cambio).

### 3.3 Archivos / Storage

Además del detalle de mensajes, hay que contemplar:
- Firmado de paths de `images` (ya lo hace el GET detalle; un admin endpoint puede reusar `signDownloadUrls`).
- `GET /api/tools/claude/files/[id]`: agregar excepción admin **o** endpoint admin paralelo. Sin eso, el admin ve el chat pero no descarga adjuntos generados.

### 3.4 Proyectos privados (`is_private` + gate) — decisión de diseño

Hoy el gate (`hasProjectGate`):
- Cookie httpOnly firmada, TTL 15 min, atada a `gate_version`.
- **“Los admins NO están exentos”** (comentario explícito en `project-gate.ts`). El admin que usa Claude en un proyecto privado también necesita la contraseña.
- Los endpoints `/me/conversations` respetan el gate: sin cookie → lista vacía / `403 project_locked` en el detalle.

Para **admin viendo conversaciones ajenas**, el gate del proyecto del empleado **no debería bloquear** si la decisión es “compliance/supervisión”: el admin no tiene la cookie del proyecto privado del empleado, y pedirle la contraseña del proyecto no escala (puede no conocerla / el empleado la cambió).

**Opciones a presentar a NQS:**

| Opción | Comportamiento | Pros | Contras |
|---|---|---|---|
| **A. Admin ve todo** (incl. proyectos privados) | Endpoints admin **no** llaman `hasProjectGate` | Cumple el objetivo de supervisión; simple | Confidencialidad de proyectos “privados” deja de ser absoluta frente a admin |
| **B. Admin no ve convs de proyectos privados** | Filtrar `project.is_private = true` en list/detail | Respeta el candado | Agujero grande: lo “sensible” se esconde justo donde más interesa auditar |
| **C. Admin ve + se registra el acceso** | Como A, más `usage_logs` / audit trail (`admin.conversation.view`) | Transparencia interna; disuade fisgoneo | Un poco más de trabajo; hay que definir retención/quién ve el log |

**Recomendación técnica para cotizar el MVP:** **A o C**. B contradice el motivo de la feature. C es el sweet spot si NQS quiere formalizar supervisión.

Nota: ver conversaciones de un proyecto privado **no** implica poder editar el cerebro ni cambiar la password del proyecto; es solo lectura del historial de chat.

---

## 4. Alcance de la feature (variantes)

### 4.1 Solo LECTURA vs BÚSQUEDA / FILTROS

| Variante | Qué incluye | Esfuerzo relativo | Dependencias |
|---|---|---|---|
| **V1 — Solo lectura** | Elegir usuario → listar sus conversaciones (título, fecha, proyecto) → abrir detalle read-only (mensajes + media) | **Base (mediano chico)** | Endpoints admin + UI + guards + files para admin |
| **V1.1 — Filtros estructurales** | Filtro por proyecto, rango de fechas, orden | **+ pequeño** | Queries con `eq`/`gte`/`lte` sobre columnas ya indexadas |
| **V2 — Búsqueda por texto** | Buscar en `content` de mensajes | **+ mediano** | Hoy no hay FTS/`pg_trgm`. Con pocos users un `ilike` puede andar; a escala hace falta índice (migración) |

### 4.2 Integración UI: desde Gasto vs sección aparte

| Enfoque | Esfuerzo | Encaje |
|---|---|---|
| **Desde Gasto** (click usuario → conversaciones) | Más simple | Reusa el funnel mental “cuánto gastó → qué escribió”. Link desde `UsdLogsView` / detalle. |
| **Sección admin nueva** (“Conversaciones”) | Un poco más | Útil si quieren buscar sin pasar por gasto; duplica picker de usuarios. |
| **Híbrido** | Medio | Entrada desde Gasto + item de sidebar opcional después. |

**Más simple hoy:** desde Gasto. El listado de usuarios ya está; el detalle ya navega por `userId`.

Bonus opcional (no MVP): en el detalle de gasto, cada call tiene `conversationId` en metadata → link directo a esa conversación (hoy la UI de detalle no lo muestra).

### 4.3 Volumen y paginación

| Superficie | Hoy | Para admin |
|---|---|---|
| Lista de convs (empleado) | Hard-limit **20**, por proyecto activo | Admin debería ver **todas** (o muchas) → **paginación o cursor** recomendable desde el día 1 si el user es heavy |
| Mensajes de una conv | Se cargan **todos** de una vez | Conversaciones largas = payload grande + firmado de muchas imágenes. MVP viable; si duele, paginar mensajes después |
| Búsqueda texto | N/A | Sin índice = riesgo de scans caros |

No hace falta paginación para cotizar V1 si se limita lista a p.ej. 50–100 con “cargar más”, pero **sí** hay que diseñarla: el hard-limit 20 del empleado no sirve para auditoría.

---

## 5. Veredicto y dimensionamiento

### 5.1 Clasificación

| | |
|---|---|
| **Tamaño** | **Mediano** |
| ¿Data lista? | **Sí** — texto, imágenes (paths), archivos, proyecto, tokens en DB |
| ¿Se reusa casi todo? | Lógica de lectura + render **sí**; rutas `/me` **no** (hay que clonar con guard admin) |
| ¿Bloqueante? | Solo la **decisión de proyectos privados** y el bypass de ownership en files |

### 5.2 Reusar vs nuevo

**Se reusa**
- Esquema `claude_conversations` / `claude_messages` / `claude_files`
- `listConversationsForProject` (o evolución a “list by user”)
- Armado de detalle: orden de mensajes, firmas Storage, asociación de archivos/huérfanos
- `ChatMessages` (+ `MarkdownRenderer`, cards) en read-only
- Layout admin + patrón Gasto → detalle por `userId`
- `requireAdmin` / `requireAdminApi`
- Metadata de `usage_logs` (para deep-links opcionales)

**Es nuevo**
- `GET /api/admin/users/[id]/conversations` (lista; filtros opcionales)
- `GET /api/admin/conversations/[id]` (detalle; sin ownership de empleado; política de gate según decisión)
- Bypass admin en descarga de files (o endpoint admin)
- UI: lista + visor read-only (sin `ChatInput`, sin rename)
- Entrada desde Gasto (link)
- (Opcional) audit log de “admin abrió conversación X”
- (V2) búsqueda full-text + índice

**No hace falta**
- Migración de datos / backfill
- Cambiar cómo el empleado chatea
- Reimplementar el parser de artifacts

### 5.3 Decisiones que tiene que tomar NQS

1. **Proyectos privados:** A (ve todo) / B (no ve privados) / C (ve + registra acceso). *Recomendado: A o C.*
2. **Entrada UX:** ¿solo desde Gasto, o también sección en sidebar?
3. **Alcance V1:** ¿solo lectura, o ya filtros por proyecto/fecha?
4. **¿Puede el admin descargar adjuntos** de conversaciones ajenas? (técnicamente casi obligatorio si quieren “ver” de verdad)
5. **¿Avisar a empleados** que las conversaciones pueden ser revisadas? (producto/legal; fuera de código, pero afecta el pitch)

### 5.4 Riesgo principal

**Abrir acceso cross-user sin romper el aislamiento que ya existe.**

Mitigaciones concretas:
- Endpoints **nuevos** `/api/admin/…`, no relajar `/api/me/…`.
- Guard `requireAdminApi` en todos.
- Tests: empleado no puede leer conv ajena; admin sí; no-admin 403.
- Decidir gate de proyectos privados **antes** de implementar (si se olvida, el admin verá `project_locked` / listas vacías y parecerá un bug).
- No loguear contenido completo de mensajes en audit trails (IDs + metadata alcanza).

### 5.5 Estimación orientativa (para cotizar)

Asumiendo 1 dev familiarizado con el repo, sin FTS:

| Paquete | Orden de magnitud |
|---|---|
| **V1 lectura** desde Gasto + endpoints admin + visor + files admin + política A/C | **~2–4 días** |
| + filtros proyecto / fecha / paginación lista | **+0.5–1.5 días** |
| + audit log de accesos admin (opción C) | **+0.5–1 día** |
| + búsqueda por texto (V2, con índice) | **+2–3 días** |

No es un rediseño de persistencia: el número grande no está en “¿tenemos los mensajes?”, sino en UI admin + seguridad cross-user + decisión de privados.

---

## Apéndice — Archivos clave revisados

- Schema: `supabase/migrations/0001_initial_schema.sql`, `0009_conversations_project.sql`, `0013_claude_files.sql`, `0016_projects_private_password.sql`
- Queries: `src/lib/db/queries/conversations.ts`, `usage-costs.ts`
- APIs me: `src/app/api/me/conversations/route.ts`, `[id]/route.ts`
- Persistencia: `src/lib/adapters/claude.ts`
- Gate: `src/lib/auth/project-gate.ts`, `admin-guard.ts`, `server.ts` (`requireAdmin`)
- UI chat: `ChatMessages.tsx`, `ClaudeView.tsx`, `ConversationsSidebar.tsx`
- Admin gasto: `UsdLogsView.tsx`, `admin/logs/page.tsx`, `admin/logs/[userId]/page.tsx`
- Files: `src/app/api/tools/claude/files/[id]/route.ts`
