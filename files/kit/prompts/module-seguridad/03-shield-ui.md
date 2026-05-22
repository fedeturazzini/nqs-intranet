# Módulo Seguridad — Sesión S03: UI Shield admin

## Objetivo

Panel admin para revisar eventos de seguridad detectados, capturas asociadas, y tomar acciones (ignorar, escalar, bloquear usuario).

**Duración**: 3 horas

---

## PROMPT

```
Sesión S03 del módulo Seguridad/Shield.

ESTADO ACTUAL:
Leé `progress-s02.md`.

OBJETIVO:
UI completa de shield para que el admin revise eventos.

PASOS:

1. Habilitar tab "Shield" en admin sidebar (estaba como v2 en el MVP).

2. Página `src/app/(dashboard)/admin/shield/page.tsx`:
   - Trae eventos de seguridad recientes.
   - Renderiza `<AdminShieldView />`.

3. Crear `src/components/admin/AdminShieldView.tsx`:
   - Adaptar `AdminShield` de `design/screens.jsx` (líneas 940-1008).
   - Estructura:
     - StatTiles arriba:
       - Eventos hoy
       - Eventos esta semana
       - High severity sin revisar
       - Snaps capturados
     - Tabla de eventos:
       - timestamp, user, tool, rule_id, severity (pill colored), excerpt, acciones.
       - Click → expand para ver detalle completo + snap si existe.
     - Filtros: severity, rule, user, fecha.

4. Vista detallada de un evento:
   - Modal con:
     - Excerpt del prompt (con resaltado del trigger).
     - Full content (mostrar/ocultar).
     - Si tiene snap asociado: thumbnail + click para ampliar.
     - Acciones: "Marcar como falso positivo" / "Escalar" / "Bloquear usuario" / "Cerrar caso".
     - Histórico del usuario: cuántos eventos previos, severity distribution.

5. Sección "Snaps" (también `src/app/(dashboard)/admin/snaps/page.tsx`):
   - Adaptar `AdminSnaps` de `design/screens.jsx` (líneas 1010-1055).
   - Grid de thumbnails de snapshots.
   - Filtros: usuario, fecha, severity del evento asociado.
   - Click → modal con imagen full + metadata.
   - Botón "marcar verdict": ok / review / flag.

6. Endpoints:
   - `GET /api/admin/security/events` con filtros.
   - `POST /api/admin/security/events/:id/review` con verdict y nota.
   - `GET /api/admin/snaps` con filtros.
   - `GET /api/admin/snaps/:id` devuelve URL firmada de la imagen.

7. Notificaciones automáticas al admin:
   - Si llega evento high severity → notif inmediata (email/Slack).
   - Resumen diario por email con eventos del día.

8. Acción "bloquear usuario":
   - UPDATE users.is_active = FALSE.
   - Loguear acción.
   - Notif al user (email).

9. Whitelist:
   - El admin puede marcar combinaciones (rule, user) como falso positivo recurrente.
   - Esto suprime futuros eventos de ese rule para ese user.
   - Tabla `security_whitelist`.

10. Test manual:
    - Trigger varios eventos.
    - Revisarlos en /admin/shield.
    - Marcar uno como falso positivo.
    - Bloquear un usuario test.

11. Commit.

AL FINAL:
`progress-s03.md`.
Próximo: `prompts/module-seguridad/04-paranoid.md`.
```

---

## VALIDACIÓN

- [ ] Eventos visibles y filtrables
- [ ] Detalle de evento útil
- [ ] Snaps accesibles
- [ ] Acciones funcionan (revisión, escalación, bloqueo)
- [ ] Whitelist funcional
