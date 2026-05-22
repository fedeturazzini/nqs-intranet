# Sesión 10 — Panel admin: ABM usuarios + ABM prompt padre

## Objetivo

Construir el panel admin con dos secciones críticas: gestión de usuarios (crear, editar, dar/quitar acceso a tools) y gestión del prompt padre de Claude (el cerebro).

**Duración**: 3 horas
**Output**: Tomas (admin) puede crear empleados, asignar accesos y editar el prompt padre sin tocar la DB.

---

## PROMPT

```
Sesión 10 del NQS AI Hub.

ESTADO ACTUAL:
Leé `progress-09.md`.

OBJETIVO:
Panel admin base con dos tabs: Usuarios y Prompt padre.

PASOS:

1. Crear layout admin en `src/app/(dashboard)/admin/layout.tsx`:
   - Server Component.
   - Valida `role === 'admin'`, sino redirect a /hub.
   - Renderiza:
     - Header con título "Admin · NQS" + meta info.
     - Sidebar izquierdo con navegación entre tabs: Overview, Solicitudes, Usuarios, Prompt, Créditos, Shield, Snaps.
     - En el MVP, solo activamos: Overview (placeholder), Usuarios, Prompt, Créditos.
     - Las otras tabs aparecen en la nav pero con badge "v2 próximamente" y deshabilitadas.
   - Children renderiza la tab activa.

2. Adaptar `AdminScreen` de `design/screens.jsx` (líneas 672-713) como referencia visual del layout admin.

3. Página `src/app/(dashboard)/admin/page.tsx` (Overview):
   - Por ahora placeholder con StatTiles básicos:
     - Total usuarios activos
     - Total tools activas
     - Llamadas a Claude últimos 7 días
     - Créditos 3DSky restantes en pool
   - Datos vienen de queries simples a DB.
   - En la sesión PA01 (módulo panel admin completo) se expande con gráficos.

4. Página `src/app/(dashboard)/admin/users/page.tsx`:
   - Adaptar `AdminUsers` de `design/screens.jsx` (líneas 872-938).
   - Server Component que trae lista de usuarios.
   - Tabla con columnas: avatar+nombre, rol, dept, email, último acceso, tools activas, acciones (edit/delete).
   - Botón "+ nuevo usuario" arriba.
   - Renderiza `<UsersTable users={...} />` (client component).

5. Crear `src/components/admin/UsersTable.tsx`:
   - Client Component.
   - Recibe lista de users.
   - Click en row → abre `<UserDetailModal user={...} />` con tabs:
     - Datos básicos (nombre, email, dept, rol)
     - Accesos por tool (toggle on/off por tool)
     - Créditos asignados (solo para 3DSky por ahora)
   - Botón "guardar" actualiza vía API.

6. Crear `src/components/admin/UserDetailModal.tsx`:
   - Modal con form.
   - Tabs internos.
   - Validación con Zod en cliente y servidor.

7. Crear `src/components/admin/NewUserModal.tsx`:
   - Form para crear nuevo usuario:
     - nombre, email, dept, rol, password inicial
   - Al guardar, crea en Supabase Auth + insert en tabla `users` con el mismo UUID.

8. Endpoints admin:

   `src/app/api/admin/users/route.ts`:
   - GET: lista todos los users (con info de tools_count, last_login).
   - POST: crea user. Body validado con Zod.

   `src/app/api/admin/users/[id]/route.ts`:
   - GET: detalle de un user (incluyendo tool_access).
   - PATCH: actualiza datos del user.
   - DELETE: soft delete (is_active=false).

   `src/app/api/admin/users/[id]/access/route.ts`:
   - POST: otorga/revoca acceso a una tool.
   - Body: `{ toolId, status }`.

9. Página `src/app/(dashboard)/admin/prompt/page.tsx`:
   - Editor del prompt padre de Claude.
   - Adaptar pattern visual de un editor (tipo Notion-lite).
   - Layout:
     - Header con dropdown de tools (por ahora solo Claude, pero preparado para futuro).
     - Editor textarea grande (full width, autoexpand).
     - Sidebar derecho con historial de versiones del prompt.
     - Botones: "guardar como nueva versión", "activar esta versión", "ver diff con versión anterior".

10. Crear `src/components/admin/PromptEditor.tsx`:
    - Client Component.
    - Textarea con counter de caracteres y tokens estimados (1 token ≈ 4 chars).
    - Botón "vista previa" que muestra cómo se va a ver con un user prompt de ejemplo.
    - Confirmación antes de activar nueva versión: "Esto va a cambiar el comportamiento de Claude para TODOS los usuarios. ¿Continuar?".

11. Endpoints admin/prompt:

    `src/app/api/admin/system-prompts/route.ts`:
    - GET: lista versiones del prompt (por toolId).
    - POST: crea nueva versión. Body: `{ toolId, content }`. Encripta antes de guardar. `is_active=false`.

    `src/app/api/admin/system-prompts/[id]/route.ts`:
    - GET: devuelve el contenido desencriptado (solo admin).
    - PATCH: edita contenido.

    `src/app/api/admin/system-prompts/[id]/activate/route.ts`:
    - POST: activa esta versión (pone is_active=true en esta, false en las demás del mismo tool).

12. Tests críticos:
    - Encriptación/desencriptación funciona round-trip.
    - Solo admins pueden leer system_prompts (probar con sesión employee → 403).
    - Activar versión deactiva las anteriores correctamente.

13. Test manual:
    - Loguearse como Tomas (admin).
    - Ir a /admin/users → ver lista.
    - Crear un nuevo user de prueba.
    - Darle acceso a Claude.
    - Loguearse como ese user en otra ventana → debería tener acceso.
    - Volver a admin → /admin/prompt.
    - Editar el prompt padre, guardar nueva versión, activarla.
    - Probar Claude desde un empleado → debería usar la nueva versión.

14. Commit.

REGLAS CRÍTICAS:
- El prompt padre desencriptado NUNCA viaja al cliente como response global. Solo se devuelve cuando el admin específicamente lo solicita (`GET /api/admin/system-prompts/[id]`).
- Toda mutación de usuarios/prompts se loguea en `usage_logs` con action específica (`admin.user.create`, `admin.prompt.activate`, etc.).
- Validación server-side de que el caller es admin en CADA endpoint admin.

ARCHIVOS A REFERENCIAR:
- `design/screens.jsx` líneas 672-713 (AdminScreen), 872-938 (AdminUsers)
- `design/screens.css` (clases `.admin-shell`, `.admin-nav`, `.admin-content`, `.user-table-row`, `.av-md`)

AL FINAL:
`progress-10.md` con:
- ABM users funcional
- ABM prompt padre funcional
- Versioning del prompt funcionando
- Próximo paso: `prompts/mvp/11-admin-credits.md`
```

---

## VALIDACIÓN

- [ ] Admin puede crear, editar y desactivar usuarios
- [ ] Admin puede dar/quitar acceso a tools por usuario
- [ ] Admin puede editar el prompt padre desde la UI
- [ ] El nuevo prompt activado se aplica en las próximas llamadas a Claude
- [ ] Empleado no puede acceder a /admin (redirect)
- [ ] El contenido del prompt NUNCA aparece en respuestas del frontend a usuarios no admin

## Próximo paso

`prompts/mvp/11-admin-credits.md`
