# Módulo Aprobaciones — Sesión A02: UI usuario

## Objetivo

UI del lado empleado: modal para solicitar acceso con motivo y duración + sección "mis solicitudes" para ver estado.

**Duración**: 2 horas

---

## PROMPT

```
Sesión A02 del módulo Aprobaciones.

ESTADO ACTUAL:
Leé `progress-a01.md`.

OBJETIVO:
UI del empleado para solicitar accesos y ver sus solicitudes.

PASOS:

1. Mejorar el botón "solicitar acceso" en ToolCard (sesión 05 del MVP):
   - Click → abre `<RequestAccessModal tool={...} />`.
   - Si la card está en status 'pending', mostrar texto "Solicitud pendiente · enviada hace X horas".

2. Crear `src/components/tool/RequestAccessModal.tsx`:
   - Form:
     - Tool name (read-only header).
     - Textarea: "¿Por qué necesitás acceso?" (motivo).
     - Selector opcional: duración del acceso (none/24hs/48hs/1 semana/permanente).
   - Submit → POST `/api/me/requests`.
   - Toast: "Solicitud enviada. El admin va a revisarla pronto.".

3. Mejorar StatusPill para mostrar tiempo desde solicitud:
   - Si status='pending', mostrar "pendiente · 2hs" (relativo).

4. Crear página `src/app/(dashboard)/my-requests/page.tsx`:
   - Lista de solicitudes del user actual.
   - Tabs: Pendientes | Aprobadas | Rechazadas | Expiradas.
   - Cada solicitud: tool + motivo + fecha + estado.
   - Botón "cancelar" para las pending.

5. Crear `src/components/screens/MyRequestsScreen.tsx`:
   - Client Component.
   - Renderiza tabs y listas.

6. Link en topbar:
   - Agregar ícono de notificaciones en la topbar (campanita).
   - Badge con cantidad de solicitudes pending.
   - Click → ir a /my-requests.

7. Cuando aprueban una solicitud y el user está logueado:
   - Polling cada 60 segundos a `/api/me/requests?status=approved&since=lastCheck`.
   - Si hay nuevas aprobaciones → toast + actualizar contador.

8. Test manual:
   - Loguearse como Sofia.
   - Solicitar acceso a Weavy con motivo.
   - Loguearse como Tomas en otra ventana.
   - Aprobar la solicitud.
   - Volver a Sofia → ver toast "Tu acceso a Weavy fue aprobado".
   - Refrescar /hub → Weavy ahora aparece active.

9. Commit.

AL FINAL:
`progress-a02.md`.
Próximo: `prompts/module-aprobaciones/03-admin-ui.md`.
```

---

## VALIDACIÓN

- [ ] Modal de solicitud funciona
- [ ] Lista de "mis solicitudes" funcional
- [ ] Notificación en tiempo real al user
- [ ] Cancelar solicitud funciona
