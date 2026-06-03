# Progress 18 — Secciones finales + cierre de feedback NQS v2.0

**Fecha**: 2026-06-03
**Branch**: `develop` (validar en preview → merge a main → **entrega final**)
**Sesión anterior**: `progress-17.5.md`
**Estado**: 🎉 **Feedback v2.0 de Chule CERRADO. MVP completo.**

> Última sesión del feedback v2.0. Cierra las secciones que faltaban del
> navbar del cliente + email + ajustes finales.

## Verificación

```
npm run typecheck → OK
npm test          → 58/58 (7 archivos)
npm run build     → OK (todas las rutas nuevas + public/tutorials)
```

## Commits (10)

| Commit | Hash |
|---|---|
| refactor(ui): toggle Grid/Lista en hub + comentar equipo online | 274a97c |
| feat(admin): eliminar proyectos definitivamente (hard delete) | db35c1d |
| feat(email): setup Resend (key pendiente) | 6130f21 |
| feat(db): migration 0010 - users org columns | dc36e49 |
| feat(organigrama): pantalla pública + admin CRUD | 8766883 |
| feat(tutoriales): replicar tutoriales del cliente (UI) | 25582cb |
| feat(tutoriales): assets estáticos de los 6 tutoriales | 7a2a1e5 |
| feat(nav): navbar final — Tutoriales + Organigrama activos | 43233cc |

## Migration 0010 (aplicada)
`users`: `reports_to_id` (FK ON DELETE SET NULL), `is_in_org` (default true),
`org_position`, `org_role` + indexes. Tipos regenerados.

## Features cerradas en esta sesión

### Organigrama (Parte 1+2)
- `/organigrama` (público, read-only): árbol dinámico armado desde
  `reports_to_id`, con la estética del cliente (card con barra de accent,
  nombre, rol, dept) + conectores CSS + panel de detalle + leyenda.
- `/admin/organigrama`: CRUD por user (toggle in_org, reporta a, rol,
  orden) + preview en vivo.
- Endpoints: GET `/api/organigrama`, PATCH `/api/admin/users/[id]/org`
  (valida: jefe existe + in_org, sin ciclos, no self-report).
- **Nota de diseño**: el organigrama del cliente es un canvas
  hand-positioned con la estructura de NQS hardcodeada (incompatible con
  datos dinámicos editables). Se replicó la **estética** con layout
  dinámico desde la DB.

### Tutoriales (Parte 3)
- `/tutoriales`: grid de los 6 recorridos (Weavy, Reframes, In Motion,
  Ground Up, Mock Up, Maquette), cards `.tut-card` del diseño del cliente.
- `/tutoriales/[id]`: header + iframe con el HTML estático.
- Los 6 HTML del cliente copiados a `public/tutorials/` (~89MB; Reframes y
  Weavy traen media embebida inline). Visible para todos los users.

### Email con Resend (Parte 4)
- `lib/notifications/email.ts`: `sendWelcomeEmail` (best-effort). Sin
  `RESEND_API_KEY` → log `[EMAIL SKIPPED]`, no rompe.
- Se manda al crear user (POST /api/admin/users). Nota en el modal.
- `.env.local.example`: `RESEND_API_KEY` (+ `SLACK_ICON_URL`) opcionales.

### Login (Parte 5)
- **Ya estaba replicado** fiel al diseño del cliente desde la sesión 16
  (brackets, ticker, "v 2.04", "Hola de nuevo", toggle COMO USUARIO/ADMIN
  con autofill, footer, "somos" en accent dorado, forgot-pass funcional).
  Verificado contra `screens.jsx` del cliente: coincide. Sin cambios.

### Ajustes extras (Parte 6)
- **Toggle Grid/Lista** del hub re-habilitado (persistido en localStorage).
- **"Equipo Online"** comentado en el header del hub.
- **Hard delete** de proyectos: botón "eliminar" → modal que exige tipear
  el nombre. Borra proyecto + conversaciones + prompts (cascade). El
  "archivar" (soft delete) sigue disponible.

### Navbar (Parte 7)
- WORKSPACE | HUB | PROYECTOS | TUTORIALES | ORGANIGRAMA (+ Admin). Todos
  activos. Playbook eliminado (lo absorbió Tutoriales).

## Resumen del MVP completo (feedback v2.0 cerrado)

Todo el feedback de Chule quedó implementado a lo largo de las sesiones
16 → 18:
- **16**: bugs (forgot-pass, re-auth 3DSky), eliminaciones visuales,
  renombres, dept dropdown, Slack (logo/@channel/formato), visor de
  imágenes, defaults restrictivos, quick access buttons.
- **17**: sistema de Proyectos, System Brain con password, Logs en USD,
  gestión de passwords.
- **17.5**: flow login→hub, historial por proyecto, toggle grid/lista
  proyectos.
- **18**: Organigrama, Tutoriales, Email Resend, hard delete, navbar final.

## Pendientes post-MVP (acción de Chule / NQS)

- **Cuenta de Resend**: crear cuenta → verificar dominio `nqs.com.ar`
  (DNS) → ajustar `FROM_EMAIL` en `email.ts` a la dirección verificada →
  cargar `RESEND_API_KEY` en Vercel. Hasta entonces, pasar credenciales a
  mano (el sistema no rompe).
- **Organigrama**: arrancar vacío de jerarquía. Chule arma la estructura
  desde `/admin/organigrama` (quién reporta a quién, roles). Las **fotos
  reales** de las personas serían un plus (hoy se muestran iniciales/datos).
- **Tutoriales**: si Chule quiere editarlos, son HTML en
  `public/tutorials/` (editar directo o migrar a DB post-MVP).
- **"Sin proyecto"** (de 17.5): vista para recuperar conversaciones
  huérfanas — TODO post-MVP.
- **`SLACK_ICON_URL`**: opcional, para el logo real en Slack.

## ⚠️ Orden de deploy (sigue valiendo)
Mergear `develop` → `main` y deployar **antes** de cargar cerebros de
proyectos nuevos en el Brain (el código viejo de prod no es project-aware).

## Próximo paso: **ENTREGA FINAL**
1. Validar el checklist de 21 ítems en el preview de `develop`.
2. Merge `develop` → `main` → Vercel deploya a producción.
3. Validar TODO en prod (login, proyectos, Claude, 3DSky, organigrama,
   tutoriales, admin).
4. Reunión de entrega con Chule (capacitación + handoff).
5. Pasar credenciales por canal seguro. Cerrar facturación.

🎉 **MVP completo y listo para entrega.**
