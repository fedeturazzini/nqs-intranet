# Auditoría del doc del cliente vs. implementación real

**Fecha**: 2026-06-17 · **Branch**: `develop` · **Read-only** (único archivo nuevo: este).
Verifica cada afirmación del documento contra el código real.

**Resumen de veredictos**

| # | Funcionalidad | Veredicto |
|---|---------------|-----------|
| 1 | Organigrama autoadministrable | ✅ OK (con matiz: vive en la tabla `users`) |
| 2 | Tutoriales con acceso por usuario | ✅ OK |
| 3a | 3DSky créditos manuales (asigna/declara) | ⚠️ **Parcial** (la "declaración" del user está oculta hoy) |
| 3b | 3DSky control de acceso | ✅ OK |
| 3c | 3DSky avisos a Slack | ✅ OK |
| 3d | 3DSky muestra contador de créditos | ❌ **No coincide** (ya está oculto) |
| 3e | 3DSky login embebido / sin autocompletar | ✅ OK |
| 4a | Proyectos compartidos (sin acceso por user) | ✅ OK |
| 4b | Cada proyecto con cerebro + memoria | ✅ OK |
| 4c | No hay "privado" ni password por proyecto | ✅ OK (es pedido nuevo) |
| 5 | System Brain protegido con password | ✅ OK |
| 6 | Widget de saldo de la API Anthropic | ✅ OK (no existe; es pedido nuevo) |

---

## 1) ORGANIGRAMA — "autoadministrable desde el admin"

**Cómo está armado**
- **Datos en DB**, en la tabla **`users`** (no hay tabla aparte de "personas"). Migration `0010_users_org.sql` agregó: `reports_to_id` (FK a users, ON DELETE SET NULL), `is_in_org` (bool, default true), `org_position` (int, orden entre hermanos), `org_role` (text).
- **CRUD desde el admin**: `/admin/organigrama` → `OrgAdminPanel.tsx`. El endpoint es **`PATCH /api/admin/users/[id]/org`** (setea `is_in_org` / `reports_to_id` / `org_role` / `org_position`), con validaciones: no auto-reporte, el jefe debe estar en el org, y `wouldCreateCycle()` evita ciclos.
- **Vista para el equipo**: `/organigrama` (`OrgChart.tsx`) arma el árbol desde `reports_to_id`, leyendo `getOrgNodes()` (users con `is_in_org=true`). Se refleja para todos.
- **Departamentos**: lista fija (`src/lib/constants/departments.ts`: PARTNER, AD, PM, 3D ARTIST, 3D MODELING, PP ARTIST, IN ARTIST) — dropdown, puede quedar vacío.

**Coincide con el doc**: ✅ **OK**, con un matiz a aclarar:
- "agregar / editar / sacar gente" se cumple, pero ojo con la semántica:
  - **Editar** y **sacar** son sobre el árbol: editar = cambiar jefe/rol/orden; "sacar" = `is_in_org=false` (la persona **sigue existiendo como usuario**, solo sale del organigrama).
  - **Agregar** a una persona al organigrama = marcar `is_in_org=true`. Crear una **persona nueva** (un usuario nuevo) se hace en **`/admin/users`**, no en la pantalla del organigrama.
- "Los datos se guardan y se reflejan para todo el equipo": ✅ correcto (DB + vista `/organigrama`).

---

## 2) TUTORIALES — "acceso por usuario, restringido por defecto, se habilita desde el panel"

**Cómo está armado**
- **Rutas**: `/tutoriales` (catálogo) y `/tutoriales/[id]` (un tutorial). **Siempre visible en el navbar** (`TopbarNav.tsx`) para todos.
- **Control de acceso**: es una **tool** más, con fila en `tools` (`id='tutoriales'`) y permiso en **`tool_access`** (`tool_id='tutoriales'`). Si el user no tiene acceso, `/tutoriales` muestra **`TutorialesGate.tsx`** (pantalla de "solicitar acceso" → `POST /api/me/access-request`).
- **Default**: **restringido**. Al crear un usuario (`POST /api/admin/users`) **solo se otorga `3dsky`** por default; tutoriales NO → el user lo ve bloqueado y lo pide. Se habilita desde **`/admin/access`** (toggle por usuario).
- **Contenido**: **estático**. Catálogo en `src/lib/constants/tutorials.ts` (`TUTORIALS`); cada tutorial es un **HTML estático en `/public/tutorials/*.html`** servido por `<iframe src={tu.file}>`. No hay DB de contenido.

**Coincide con el doc**: ✅ **OK**. (Aclaración: el contenido es HTML estático del cliente, no editable desde la app.)

---

## 3) 3DSKY

### 3a) "Créditos manuales: el admin asigna y el usuario declara consumo"

**Cómo está armado**
- **Tablas** (migration `0001`): `credit_pools` (pool del estudio por tool), `credit_allocations` (asignado/usado por user+tool), `credit_transactions` (historial); y `module_sessions` (migration `0002`: entradas/salidas + `declared_consumption`).
- **Admin asigna**: `/admin/credits` (`AdminCreditsView`) → `POST /api/admin/credits/allocations` (+/-) y `credits/pools` (registrar compra al pool).
- **Descuento**: RPC Postgres **`consume_credit_atomic(p_user_id, p_tool_id, p_amount, …)`** (bloquea la fila, descuenta atómico, inserta `credit_transactions`). Se llama desde **`POST /api/tools/3dsky/session/end`** SOLO si `declaredConsumption > 0`.

**Coincide con el doc**: ⚠️ **PARCIAL / desactualizado**.
- "El admin asigna": ✅ correcto.
- "El usuario declara consumo": **hoy NO ocurre**. El modal de declaración (`DeclareConsumptionPrompt`) está **comentado** en `ThreeDSkyView.tsx` (decisión feedback v2.0). Al salir, `leaveToHub → declareAndEnd(0)` envía **siempre 0** → **no se descuenta nada**. El mecanismo existe en el backend, pero el usuario **no declara** y los créditos **no se consumen** en la práctica.
- Contexto adicional: en un cambio reciente, **tener 0 créditos ya NO bloquea la entrada** (solo acceso + horario bloquean; `canUseTool` CHECK 4 desactivado). O sea, hoy los créditos son **informativos/tracking manual**, no se enforzan.

### 3b) "Control de acceso por usuario: prender/apagar, horarios, excepcional, solicitudes"

**Cómo está armado**
- **Tabla `tool_access`** (status active/pending/locked/expired, `schedule` JSON, `expires_at`).
- **Middleware central** `canUseTool()` en `src/lib/middleware/permissions.ts`: valida user activo → acceso → horario (`checkSchedule`, TZ Argentina).
- **Admin UI**: `/admin/access` (`AccessPanel.tsx` + `ToolAccessCard.tsx`) → toggle + editor de horarios.
- **Acceso excepcional**: `POST /api/me/exceptional-access` → crea `access_requests` (request_type) con duración; el admin aprueba con quick-access [1h/2h/…].
- **Solicitudes**: tabla `access_requests` + panel `/admin/requests` (aprobar/rechazar).

**Coincide con el doc**: ✅ **OK**.

### 3c) "Avisos a Slack"

**Cómo está armado**: helper `src/lib/notifications/slack.ts` (Incoming Webhook, `SLACK_WEBHOOK_URL`). Call sites relevantes a 3DSky: `POST /api/tools/3dsky/request-credits` (créditos), y las resoluciones del admin en `approve`/`reject`. (Detalle completo en `slack-audit.md`.)

**Coincide con el doc**: ✅ **OK**.

### 3d) "Se muestra un contador de créditos en la vista de 3DSky"

**Cómo está armado**: el contador vivía en **`src/components/tool/ToolViewBar.tsx`** (el pill `{credits.left} créditos · de {credits.total}`, ~líneas 92–106). **Está COMENTADO** (oculto por feedback v2.0). Lo único que se renderiza a la derecha de la barra es el botón **"pedir más créditos"**.

**Coincide con el doc**: ❌ **NO COINCIDE**. El doc dice "se muestra", pero el contador **ya está oculto**. Para tu objetivo ("lo voy a ocultar después"): **no hay nada que ocultar, ya lo está**. (Nota: en un cambio reciente también oculté el contador "X/Y créditos" de las **cards del hub** — ver `StatusPill.tsx` / `ToolCard.tsx`.)

### 3e) "Login de 3DSky: cómo está embebido + ¿autocompleta usuario/contraseña?"

**Cómo está armado**: **iframe directo** (`src/components/tool/EmbeddedSite.tsx`), sin proxy. La URL la da el adapter (`getEmbedUrl → https://3dsky.org/es/`). El `sandbox` permite `scripts/forms/same-origin/popups` para que **el usuario se loguee con sus propias credenciales** en el sitio. Si 3DSky bloquea el iframe (X-Frame-Options), a los 9s aparece un fallback "abrir en nueva pestaña".

**Coincide con el doc**: ✅ **OK**. **NO hay ningún autocompletado de usuario/contraseña** — la app no toca ni guarda credenciales de 3DSky; solo embebe la URL.

---

## 4) PROYECTOS

### 4a) "Hoy los proyectos los ve todo el estudio (compartidos)"

**Cómo está armado**: tabla **`projects`** (migration `0008`). RLS **`projects_read_all` = `FOR SELECT USING (true)`** → todos los usuarios leen todos los proyectos. **No existe** control de acceso por usuario sobre proyectos (no hay tabla project_access ni filtro por user).

**Coincide con el doc**: ✅ **OK** — confirmado: proyectos compartidos, sin acceso por usuario.

### 4b) "Cada proyecto tiene su propio cerebro (prompt) y memoria"

**Cómo está armado**: la tabla **`system_prompts`** tiene `project_id` (FK a `projects`, migration `0008`) y `type` (separa **`system`** = cerebro de **`memory`** = memoria, migration `0006`). Versionado por `(tool_id, type, project_id)`. El adapter de Claude arma el prompt del proyecto activo del user (`user_active_project`).

**Coincide con el doc**: ✅ **OK**.

### 4c) "No existe hoy flag de 'privado' ni contraseña por proyecto"

**Cómo está armado**: confirmado por grep — **no hay** ninguna columna `is_private`/`private` ni password por proyecto. `brain_config` (la password) protege el **System Brain global**, no proyectos individuales.

**Coincide con el doc**: ✅ **OK** — es un pedido nuevo.

---

## 5) SYSTEM BRAIN — "ya está protegido con contraseña"

**Cómo está armado** (este es el patrón a reusar para proyectos privados):
- **Hash bcrypt** en la tabla **`brain_config.password_hash`** (migration `0008`; RLS admin-only). La password inicial se siembra con `scripts/seed-brain-password.ts` (bcrypt), no en el SQL.
- **Validación al entrar**: `POST /api/admin/brain/verify-password` → `bcrypt.compare(password, brain_config.password_hash)`. Si OK, setea una **cookie httpOnly `brain_session`** de corta duración (**~30 min**, `mintBrainToken` / `BRAIN_TTL_SECONDS`).
- **Gate UI**: `BrainPasswordGate.tsx` (pide la password antes de mostrar `BrainContent.tsx`). Cambio de password: `POST /api/admin/brain/change-password`. Todo detrás de `requireAdminApi`.

**Coincide con el doc**: ✅ **OK**. **Patrón reusable** para "proyectos privados": hash bcrypt en una tabla de config + endpoint `verify-password` + cookie httpOnly de sesión corta + guard. (Para proyectos sería por-proyecto en vez de global.)

---

## 6) WIDGET DE CRÉDITOS DE LA API (Anthropic) — pedido NUEVO

**Cómo está armado**: **NO existe** ningún widget ni endpoint que muestre el **saldo de la cuenta de Anthropic** (la API de Anthropic no expone el balance, y no hay código que lo consulte).

Lo que **sí** existe es la pantalla **"Gasto"** (`/admin/logs`): muestra **costo en USD por usuario**, pero es **costo computado por uso**, no el saldo de la cuenta. Se calcula en `src/lib/costs/claude-pricing.ts` como `tokensIn × precio_input + tokensOut × precio_output` (precio por modelo), sumando los `usage_logs` de cada `claude.execute`. O sea: **cuánto gastó cada usuario** (estimado de tokens), **no cuánto le queda a la cuenta de Anthropic**.

**Coincide con el doc**: ✅ **OK** — el widget de saldo de la API **no existe hoy** (es pedido nuevo). Aclaración importante para el doc: los "logs en USD" son **costo declarado/estimado por uso**, una cosa distinta del **saldo** de la cuenta Anthropic.

---

## Diferencias a corregir en el documento del cliente (resumen)

1. **3DSky — "el usuario declara consumo"** (3a): hoy esa declaración está **desactivada** (modal oculto; al salir envía 0; no se descuenta). Reformular como "el sistema soporta declaración de consumo, pero hoy está deshabilitada / los créditos son tracking manual".
2. **3DSky — "se muestra un contador de créditos"** (3d): **ya no se muestra** (está oculto). Sacar esa frase o cambiarla a "el contador está oculto".
3. **Organigrama** (1): aclarar que es sobre los **usuarios** del sistema (agregar persona nueva = crear usuario; "sacar" = quitar del árbol, no borra al usuario).
4. Lo demás (Tutoriales, acceso 3DSky, Slack, login iframe, Proyectos compartidos/cerebro/sin-private, Brain con password, no-widget-Anthropic): **coincide**.
