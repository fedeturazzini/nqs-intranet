# INDEX — Mapa completo del kit

Vista rápida de todo lo que hay en este kit.

## ⭐ EMPEZÁ ACÁ

**[GETTING_STARTED.md](./GETTING_STARTED.md)** — Tu guía paso a paso operativa. Te dice literalmente qué hacer cada día.

## 📚 Documentación (leer en orden)

1. [README.md](./README.md) — Cómo usar el kit (overview)
2. [docs/00-project-context.md](./docs/00-project-context.md) — Qué estamos construyendo
3. [docs/01-architecture.md](./docs/01-architecture.md) — Cómo está armado para escalar
4. [docs/02-conventions.md](./docs/02-conventions.md) — Reglas de código
5. [docs/03-checklist.md](./docs/03-checklist.md) — Plan de tareas
6. [docs/04-client-dependencies.md](./docs/04-client-dependencies.md) — Qué pedirle a NQS, cuándo y costos
7. [docs/05-client-comms-template.md](./docs/05-client-comms-template.md) — Templates de emails/mensajes
8. [docs/progress-template.md](./docs/progress-template.md) — Template de avance

## 🔧 Referencias técnicas

- [reference/db-schema.sql](./reference/db-schema.sql) — Schema completo de DB
- [reference/tool-adapter-pattern.ts](./reference/tool-adapter-pattern.ts) — Patrón de adapters
- [reference/middleware-permissions.ts](./reference/middleware-permissions.ts) — Middleware extensible
- [reference/api-routes.md](./reference/api-routes.md) — Estructura de endpoints

## 🚀 Prompts MVP (4 semanas)

### Semana 1
- [01-setup.md](./prompts/mvp/01-setup.md) — Setup inicial Next.js + Tailwind + Supabase
- [02-database.md](./prompts/mvp/02-database.md) — Schema completo + seeds
- [03-auth.md](./prompts/mvp/03-auth.md) — Login + sesiones + roles

### Semana 2
- [04-layout.md](./prompts/mvp/04-layout.md) — Topbar + marquee + toast
- [05-hub.md](./prompts/mvp/05-hub.md) — Hub screen con drag-and-drop
- [06-claude-adapter.md](./prompts/mvp/06-claude-adapter.md) — Backend Claude
- [07-claude-view.md](./prompts/mvp/07-claude-view.md) — UI chat con imágenes

### Semana 3
- [08-3dsky-adapter.md](./prompts/mvp/08-3dsky-adapter.md) — Backend 3DSky + créditos
- [09-3dsky-view.md](./prompts/mvp/09-3dsky-view.md) — UI 3DSky con iframe
- [10-admin-base.md](./prompts/mvp/10-admin-base.md) — Admin: users + prompt padre
- [11-admin-credits.md](./prompts/mvp/11-admin-credits.md) — Admin: créditos + logs

### Semana 4
- [12-deploy.md](./prompts/mvp/12-deploy.md) — Tests + deploy + docs

## 📦 Módulos futuros (v2)

### Horarios (1 semana)
- [01-backend.md](./prompts/module-horarios/01-backend.md)
- [02-admin-ui.md](./prompts/module-horarios/02-admin-ui.md)
- [03-expiration.md](./prompts/module-horarios/03-expiration.md)

### Aprobaciones (1.5 semanas)
- [01-backend.md](./prompts/module-aprobaciones/01-backend.md)
- [02-user-ui.md](./prompts/module-aprobaciones/02-user-ui.md)
- [03-admin-ui.md](./prompts/module-aprobaciones/03-admin-ui.md)
- [04-notifications.md](./prompts/module-aprobaciones/04-notifications.md)

### Panel Admin Completo (2 semanas)
- [01-overview.md](./prompts/module-panel-admin/01-overview.md)
- [02-charts.md](./prompts/module-panel-admin/02-charts.md)
- [03-filters.md](./prompts/module-panel-admin/03-filters.md)
- [04-export.md](./prompts/module-panel-admin/04-export.md)
- [05-costs.md](./prompts/module-panel-admin/05-costs.md)

### Más Tools (2-3 hs por tool)
- [_template.md](./prompts/module-tools/_template.md) — Template genérico
- [weavy.md](./prompts/module-tools/weavy.md)
- [kling.md](./prompts/module-tools/kling.md)
- [runway.md](./prompts/module-tools/runway.md)
- [elevenlabs.md](./prompts/module-tools/elevenlabs.md)
- [highsfield.md](./prompts/module-tools/highsfield.md)

### Seguridad / Shield (1.5 semanas)
- [01-rules.md](./prompts/module-seguridad/01-rules.md)
- [02-snaps.md](./prompts/module-seguridad/02-snaps.md)
- [03-shield-ui.md](./prompts/module-seguridad/03-shield-ui.md)
- [04-paranoid.md](./prompts/module-seguridad/04-paranoid.md)

### Contenido (1 semana)
- [01-tutoriales.md](./prompts/module-contenido/01-tutoriales.md)
- [02-playbook.md](./prompts/module-contenido/02-playbook.md)
- [03-organigrama.md](./prompts/module-contenido/03-organigrama.md)

## 🎨 Diseño del cliente

- [assets/client-design/](./assets/client-design/) — Todo el código del diseño NQS
  - `screens.jsx` — Pantallas principales
  - `components.jsx` — Componentes
  - `styles.css` + `screens.css` — Estilos
  - `data.jsx` — Mock data
  - `tutorials/` — 6 tutoriales completos
  - `assets/nqs-logo.gif` — Logo animado

---

## 📊 Resumen numérico

| Item | Cantidad |
|------|----------|
| Sesiones MVP | 12 |
| Sesiones futuras | ~25+ |
| Archivos de docs | 6 |
| Referencias técnicas | 4 |
| Prompts totales | 36 |
| Días estimados MVP | ~28 (4 sem) |
| Días estimados todo el roadmap | ~70 (10-12 sem) |

---

**Empezá por [README.md](./README.md)**
