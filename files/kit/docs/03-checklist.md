# 03 — Checklist completo del proyecto

> Tachá las tareas a medida que las completás. Cada sesión = un prompt en `prompts/`.

## MVP (4 semanas)

### Semana 1 — Setup y base

- [ ] **Sesión 01** — Setup del proyecto (Next.js, Tailwind, Supabase config, estructura de carpetas, importar estilos del cliente). → `prompts/mvp/01-setup.md`
- [ ] **Sesión 02** — Schema de DB completo + seeds iniciales (tools + admin de prueba). → `prompts/mvp/02-database.md`
- [ ] **Sesión 03** — Auth completo: login screen, sesiones, roles, middleware de auth. → `prompts/mvp/03-auth.md`

### Semana 2 — Hub y wrapper Claude

- [ ] **Sesión 04** — Layout del dashboard (topbar, marquee, navegación). → `prompts/mvp/04-layout.md`
- [ ] **Sesión 05** — Hub Screen completo (grid, list, filtros, drag-and-drop, búsqueda). → `prompts/mvp/05-hub.md`
- [ ] **Sesión 06** — ToolAdapter pattern + ClaudeAdapter (backend). → `prompts/mvp/06-claude-adapter.md`
- [ ] **Sesión 07** — Vista de Claude (frontend) con chat + soporte de imágenes. → `prompts/mvp/07-claude-view.md`

### Semana 3 — 3DSky y panel admin

- [ ] **Sesión 08** — ThreeDSkyAdapter + endpoints de créditos. → `prompts/mvp/08-3dsky-adapter.md`
- [ ] **Sesión 09** — Vista de 3DSky con iframe + overlay de créditos. → `prompts/mvp/09-3dsky-view.md`
- [ ] **Sesión 10** — Panel admin: ABM usuarios + ABM prompt padre. → `prompts/mvp/10-admin-base.md`
- [ ] **Sesión 11** — Panel admin: gestión de créditos 3DSky + logs básicos. → `prompts/mvp/11-admin-credits.md`

### Semana 4 — Testing y deploy

- [ ] **Sesión 12** — Tests críticos + ajustes finales + deploy a producción + documentación. → `prompts/mvp/12-deploy.md`

---

## Módulo: Control horario y caducidad (1 semana — fase 2)

> Nota: el módulo de **créditos 3DSky está en el MVP** (sesiones 08, 09, 11). No tiene fase 2 separada.



- [ ] **Sesión H01** — Activar tablas `time_windows` y extender middleware de permisos. → `prompts/module-horarios/01-backend.md`
- [ ] **Sesión H02** — UI admin: configuración de horarios por usuario. → `prompts/module-horarios/02-admin-ui.md`
- [ ] **Sesión H03** — Cron job de caducidad + notificaciones email. → `prompts/module-horarios/03-expiration.md`

---

## Módulo: Sistema de solicitud y aprobación (1.5 semanas — fase 2)

- [ ] **Sesión A01** — Activar tabla `access_requests` + endpoints. → `prompts/module-aprobaciones/01-backend.md`
- [ ] **Sesión A02** — UI empleado: solicitar acceso con motivo y duración. → `prompts/module-aprobaciones/02-user-ui.md`
- [ ] **Sesión A03** — UI admin: revisar/aprobar/rechazar solicitudes. → `prompts/module-aprobaciones/03-admin-ui.md`
- [ ] **Sesión A04** — Integración con Slack/WhatsApp para notificaciones. → `prompts/module-aprobaciones/04-notifications.md`

---

## Módulo: Panel admin completo (2 semanas — fase 2)

- [ ] **Sesión PA01** — Dashboard overview con KPIs y gráficos en tiempo real. → `prompts/module-panel-admin/01-overview.md`
- [ ] **Sesión PA02** — Gráficos avanzados: tokens por día/semana/mes, ranking. → `prompts/module-panel-admin/02-charts.md`
- [ ] **Sesión PA03** — Filtros y búsquedas en todas las tablas. → `prompts/module-panel-admin/03-filters.md`
- [ ] **Sesión PA04** — Exportación de reportes a CSV y PDF. → `prompts/module-panel-admin/04-export.md`
- [ ] **Sesión PA05** — Estimación de costos asociados al consumo. → `prompts/module-panel-admin/05-costs.md`

---

## Módulo: Integrar más herramientas (variable — fase 2+)

- [ ] **Sesión T-WEAVY** — Adapter de Weavy + vista embedded. → `prompts/module-tools/weavy.md`
- [ ] **Sesión T-KLING** — Adapter de Kling + vista. → `prompts/module-tools/kling.md`
- [ ] **Sesión T-RUNWAY** — Adapter de Runway + vista. → `prompts/module-tools/runway.md`
- [ ] **Sesión T-EL** — Adapter de ElevenLabs + vista. → `prompts/module-tools/elevenlabs.md`
- [ ] **Sesión T-HF** — Adapter de Highsfield + vista. → `prompts/module-tools/highsfield.md`

---

## Módulo: Seguridad y auditoría (1.5 semanas — fase 2+)

- [ ] **Sesión S01** — Reglas de detección (SP-PROT, IP-LEAK, OFFTOPIC). → `prompts/module-seguridad/01-rules.md`
- [ ] **Sesión S02** — Sistema de captura automática de pantalla (con consentimiento). → `prompts/module-seguridad/02-snaps.md`
- [ ] **Sesión S03** — Vista admin: shield (eventos detectados + review). → `prompts/module-seguridad/03-shield-ui.md`
- [ ] **Sesión S04** — Modo paranoid (auditoría en vivo de cada prompt). → `prompts/module-seguridad/04-paranoid.md`

---

## Módulo: Contenido interno (variable — fase 2+)

- [ ] **Sesión C01** — Tutoriales: CMS y vista. → `prompts/module-contenido/01-tutoriales.md`
- [ ] **Sesión C02** — Playbook: CMS y vista. → `prompts/module-contenido/02-playbook.md`
- [ ] **Sesión C03** — Organigrama: estructura y vista. → `prompts/module-contenido/03-organigrama.md`

---

## Total de sesiones

| Fase | Sesiones |
|------|----------|
| MVP | 12 |
| Horarios | 3 |
| Aprobaciones | 4 |
| Panel admin completo | 5 |
| Otras tools (cada una) | 1 |
| Seguridad | 4 |
| Contenido | 3 |
| **TOTAL** | **31+ (según tools que se agreguen)** |

## Notas finales

- Después de cada sesión, generar el `progress-XX.md` correspondiente.
- Si una sesión queda incompleta, dividila en dos (no fuerces meter todo en un prompt).
- Si surgen requerimientos nuevos del cliente que no están en este checklist, evaluá si los metés en una sesión existente o en una nueva.
