# Módulo Aprobaciones — Sesión A03: UI admin

## Objetivo

UI admin para revisar y aprobar/rechazar solicitudes con contexto (historial del user, motivo, info de la tool).

**Duración**: 2 horas

---

## PROMPT

```
Sesión A03 del módulo Aprobaciones.

ESTADO ACTUAL:
Leé `progress-a02.md`.

OBJETIVO:
UI admin completa para gestionar solicitudes.

PASOS:

1. Habilitar tab "Solicitudes" en admin sidebar (sesión 10 del MVP la dejó con badge "v2").

2. Página `src/app/(dashboard)/admin/requests/page.tsx`:
   - Server Component.
   - Trae solicitudes pendientes.
   - Renderiza `<AdminRequestsView />`.

3. Crear `src/components/admin/AdminRequestsView.tsx`:
   - Adaptar `AdminRequests` de `design/screens.jsx` (líneas 826-870).
   - Tabs: Pendientes | Aprobadas | Rechazadas | Expiradas.
   - Lista de cards de solicitud, cada una con:
     - Avatar + nombre del solicitante
     - Tool solicitado (con glyph y color)
     - Motivo (truncado, expandible al click)
     - Duración solicitada
     - Tiempo desde solicitud
     - Botones: "aprobar" / "rechazar" / "ver perfil"
   - Filtros laterales: tool, urgencia (hace más de 24hs sin responder).

4. Crear `src/components/admin/RequestCard.tsx`:
   - Componente reutilizable para una solicitud.
   - Acción rápida: aprobar con un click (sin modal si la duración es válida).
   - Botón "rechazar" abre modal con textarea de motivo.

5. Crear `src/components/admin/ApprovalConfirmModal.tsx`:
   - Si el admin quiere ajustar duración antes de aprobar.
   - Si quiere agregar nota al usuario.

6. Bulk actions:
   - Checkbox por solicitud.
   - "Aprobar X seleccionadas" en batch.
   - "Rechazar X seleccionadas" (con motivo común).

7. Vista de "Perfil del solicitante":
   - Click en "ver perfil" abre side panel con:
     - Datos del user.
     - Tools que ya tiene activas.
     - Solicitudes pasadas (aprobadas y rechazadas).
     - Logs de uso reciente.
   - Útil para tomar decisión informada.

8. Notifs al admin cuando llega nueva solicitud:
   - Badge en sidebar admin (ya estaba parcialmente del MVP).
   - Email (vía Resend, si está configurado).
   - Slack notif si está configurado.

9. Test manual:
   - Sofia hace 3 solicitudes.
   - Tomas las ve en /admin/requests.
   - Aprueba 2, rechaza 1.
   - Sofia recibe notif de cada una.

10. Commit.

AL FINAL:
`progress-a03.md`.
Próximo: `prompts/module-aprobaciones/04-notifications.md`.
```

---

## VALIDACIÓN

- [ ] Vista de pendientes funciona
- [ ] Aprobar/rechazar funcional
- [ ] Bulk actions funcional
- [ ] Perfil del solicitante visible
- [ ] Notifs al admin funcionan
