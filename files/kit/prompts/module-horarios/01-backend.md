# Módulo Horarios — Sesión H01: Backend

## ⚠️ ANTES DE EMPEZAR — PEDIRLE AL CLIENTE

### Lo que NQS tiene que definir:

- [ ] **Política horaria deseada**:
  - ¿Lun-vie 9-18hs para todos? ¿Distinto por departamento?
  - ¿Hay empleados con horarios especiales?
- [ ] **¿Quieren accesos temporales?** (ej. acceso a Weavy por 48hs para un proyecto específico)
- [ ] **¿Notificaciones automáticas?** Si sí, cómo:
  - Email cuando expira un acceso al usuario afectado
  - Aviso al admin cuando alguien intenta usar fuera de horario

### Mensaje sugerido para mandarle al cliente:

> Ver template **"4.1 — Activar módulo Horarios"** en `docs/05-client-comms-template.md`.

### Por qué importa:

- Este módulo NO tiene costos adicionales de infra.
- Pero si NQS no define la política, vas a estar adivinando reglas. Que las definan ANTES.

---

## Objetivo

Activar el módulo de control horario: validación de ventanas de tiempo en el middleware de permisos + endpoints CRUD para gestionar ventanas + cron de caducidad de accesos temporales.

**Duración**: 3 horas
**Pre-requisito**: MVP completo y deployado.

---

## PROMPT

```
Vamos con el módulo de Horarios y Caducidad. Sesión H01.

CONTEXTO:
La tabla `time_windows` ya existe (creada en sesión 02 del MVP). El middleware de permisos en `lib/middleware/permissions.ts` tiene un `[FUTURE]` comentado para esto.

OBJETIVO:
Backend del módulo horarios:
- Activar validación de ventanas de tiempo en el middleware.
- Endpoints CRUD para que el admin configure ventanas.
- Cron de caducidad para tool_access con expires_at vencido.

PASOS:

1. Implementar `checkTimeWindow(userId, toolId)` en `src/lib/middleware/permissions.ts`:
   - Buscar ventanas aplicables (user-specific OR global; tool-specific OR all-tools).
   - Para cada ventana, validar:
     - Día de la semana actual coincide (o NULL = todos los días).
     - Hora actual está dentro de start_hour - end_hour.
     - Considerar zona horaria de la ventana (default America/Argentina/Buenos_Aires).
   - Lógica: si hay ventanas configuradas y NINGUNA aplica → bloqueado. Si NO hay ventanas → libre.
   - Devolver `{ allowed: boolean, message?: string, nextWindow?: Date }`.

2. Activar el check en `canUseTool`:
   - Descomentar el bloque CHECK 3.
   - Llamar a `checkTimeWindow`.
   - Si no allowed, devolver `{ allowed: false, reason: 'outside_hours', message: ... }`.

3. Endpoints admin para time_windows:

   `src/app/api/admin/time-windows/route.ts`:
   - GET: lista ventanas con filtros (userId, toolId).
   - POST: crea ventana. Body: `{ userId?, toolId?, dayOfWeek?, startHour, endHour, timezone? }`.

   `src/app/api/admin/time-windows/[id]/route.ts`:
   - PATCH: edita.
   - DELETE: borra.

4. Endpoint para que el user vea su ventana actual:

   `src/app/api/me/schedule/route.ts` (GET):
   - Devuelve las ventanas que aplican al usuario actual.
   - Indica si está dentro de horario AHORA.
   - Indica próxima ventana si está fuera.

5. Cron job de caducidad:
   - Vercel Cron Jobs (cada 5 minutos).
   - Endpoint `src/app/api/cron/expire-access/route.ts`:
     - Valida header `Authorization: Bearer ${CRON_SECRET}`.
     - Query: `SELECT * FROM tool_access WHERE expires_at < NOW() AND status = 'active'`.
     - UPDATE: `status = 'expired'`.
     - Loguea en usage_logs.
     - Manda notificación al user (vía email o webhook a Slack — preparado pero se conecta en H03).

6. Configurar cron en `vercel.json`:
```json
{
  "crons": [
    { "path": "/api/cron/expire-access", "schedule": "*/5 * * * *" }
  ]
}
```

7. Agregar variable env `CRON_SECRET` (generar un token random).

8. Tests:
   - `time_windows.test.ts`: validar lógica de ventanas (dentro, fuera, día equivocado, sin ventanas).
   - `expire-access.test.ts`: mock de DB, validar que se actualizan los registros correctos.

9. Test manual:
   - Crear una ventana para Sofia en Claude: lun-vie 9-18hs.
   - Probar a las 20hs (mock del clock) → debería bloquearse.
   - Borrar la ventana → debería desbloquearse.

10. Commit.

AL FINAL:
`progress-h01.md`.
Próximo paso: `prompts/module-horarios/02-admin-ui.md`.
```

---

## VALIDACIÓN

- [ ] Middleware valida ventanas correctamente
- [ ] CRUD de time_windows funcional
- [ ] Cron de caducidad funciona
- [ ] Tests pasan
