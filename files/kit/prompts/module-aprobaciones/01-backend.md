# Módulo Aprobaciones — Sesión A01: Backend

## Objetivo

Activar el sistema de solicitudes de acceso: empleado pide → admin recibe → admin aprueba/rechaza → empleado recibe el acceso (o no).

**Duración**: 2.5 horas

---

## PROMPT

```
Sesión A01 del módulo Aprobaciones.

ESTADO ACTUAL:
La tabla `access_requests` ya existe del MVP. Ahora la activamos.

OBJETIVO:
Backend del flujo de solicitudes.

PASOS:

1. Endpoints user:

   `src/app/api/me/requests/route.ts`:
   - GET: lista solicitudes del user actual (todas: pending/approved/rejected/expired).
   - POST: crea nueva solicitud. Body: `{ toolId, reason, durationMinutes? }`.

   `src/app/api/me/requests/[id]/route.ts`:
   - DELETE: cancelar solicitud (solo si está pending).

2. Endpoints admin:

   `src/app/api/admin/requests/route.ts`:
   - GET: lista pendientes (con filtros: status, toolId, userId).
   - Estructura por defecto: ordenar por created_at desc.

   `src/app/api/admin/requests/[id]/approve/route.ts`:
   - POST: aprueba solicitud.
     - UPDATE access_requests: status='approved', reviewed_by, reviewed_at, review_note.
     - Si la solicitud incluye durationMinutes, calcular expires_at.
     - UPSERT en tool_access con status='active' y expires_at.
     - Mandar email al user "tu acceso fue aprobado".
     - Loguear en usage_logs.

   `src/app/api/admin/requests/[id]/reject/route.ts`:
   - POST: rechaza. Body: `{ note?: string }`.
   - UPDATE status='rejected', reviewed_by, review_note.
   - Email al user.

3. Mejorar el flujo del MVP de "solicitar acceso":
   - En sesión 05 (MVP), el botón "solicitar acceso" mostraba un toast. Ahora abre un modal real.
   - El modal pide: motivo + (opcional) duración (en horas/días).
   - Submit → POST `/api/me/requests`.
   - Si ya hay solicitud pending para ese toolId, mostrar "ya tenés solicitud pendiente, esperá respuesta".

4. Auto-expiración de solicitudes:
   - Cron diario `/api/cron/expire-requests`.
   - Solicitudes con más de 7 días sin respuesta → status='expired'.

5. Validaciones:
   - Un user no puede tener 2 solicitudes pending para el mismo tool.
   - No puede solicitar acceso a una tool que ya tiene activa.

6. Updates en `me/access` (sesión 05 del MVP):
   - El endpoint ya devolvía status. Ahora si hay solicitud pending para una tool sin acceso, devolver status='pending' y `requestedAt`.

7. Tests:
   - Test flujo completo: crear solicitud → aprobar → user tiene acceso.
   - Test: solicitud duplicada rechazada.
   - Test: rechazo no otorga acceso.
   - Test: solicitud expira a los 7 días.

8. Commit.

AL FINAL:
`progress-a01.md`.
Próximo: `prompts/module-aprobaciones/02-user-ui.md`.
```

---

## VALIDACIÓN

- [ ] Endpoints funcionan
- [ ] No se pueden duplicar solicitudes
- [ ] Aprobar otorga acceso automáticamente
- [ ] Email al user funciona
