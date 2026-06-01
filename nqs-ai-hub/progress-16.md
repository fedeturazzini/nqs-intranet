# Progress 16 — Feedback NQS v2.0 (ajustes + 3 features)

**Fecha**: 2026-06-01
**Branch**: `develop` (NO mergeado a main todavía — falta validación visual)
**Sesión anterior**: `progress-15.md`
**Próxima**: `prompts/mvp/17-proyectos-brain-logs.md` (a crear)

> Primera de 3 sesiones de feedback de Chule. Cubre los ajustes que NO
> tocan arquitectura + 3 features nuevas. Sin migrations ni env vars nuevas
> (requeridas). Estrategia: **todo lo "eliminado" está COMENTADO**, no
> borrado (`// FEEDBACK NQS v2.0: hidden by request, may re-enable`).

## Verificación

```
npm run typecheck → OK
npm test          → 58/58 (7 archivos)
npm run build     → OK (+ rutas /forgot-password, /reset-password)
```

## Commits (8, en orden)

| # | Commit | Hash |
|---|---|---|
| 1 | fix(login): implementar flow de olvidé mi password | 5821b3c |
| 2 | fix(3dsky): no re-autorizar sesión activa | 52e1059 |
| 3 | style(ui): comentar elementos no usados por feedback NQS v2.0 | a171283 |
| 4 | refactor(ui): cambios texto + departamento dropdown | 8ee3964 |
| 5 | feat(slack): logo + @channel + formato simplificado | 114069c |
| 6 | feat(chat): visor de imágenes con descarga y copia | 6d666fc |
| 7 | feat(admin): defaults restrictivos al crear user (solo 3DSky activo) | 1a6e47a |
| 8 | feat(admin): quick access buttons en solicitudes | c3a18da |

## Qué se hizo

### Bugs (Parte 1)
- **1.1 "¿olvidaste tu pass?"**: el link hacía `router.refresh()` (no-op).
  Ahora flujo completo: `/forgot-password` (pide email →
  `resetPasswordForEmail` con redirect a `/reset-password`, sin
  enumeration) + `/reset-password` (procesa el token de recovery del hash →
  nueva password → `updateUser` → signOut → /login). Ambas rutas públicas
  en `proxy.ts`. Mail = el default de Supabase Auth (custom con Resend en
  prompt 18).
- **1.2 re-autorización 3DSky**: el preloader del iframe forzaba una
  animación artificial de 3 pasos ("verificando permiso…") con
  `setTimeout(1400ms)` en cada entrada. Ahora el overlay solo se muestra
  mientras el iframe carga de verdad (`onLoad`) → se entra directo.

### Texto y nombres (Parte 3)
- **3.1** Toggle "employee" → "user" visible (valor DB sigue `employee`);
  título "Crear usuario o admin".
- **3.2** Tooltip del clip en Claude: "Hasta 10MB por imagen. Mismas
  limitaciones que Claude online."
- **3.3** TODO en sidebar para renombrar "Prompt padre" → SYSTEM BRAIN
  (prompt 17).

### UX (Parte 4)
- **4.1** `/admin/access`: usuarios agrupados por departamento con header
  (`───── DISEÑO ─────`) y ordenados alfabéticamente por nombre.
- **4.2** Departamento = dropdown predefinido en NewUserModal (permite
  vacío).
- **4.3** `src/lib/constants/departments.ts`: `DEPARTMENTS` + `type
  Department` + `isKnownDepartment`.

### Slack (Parte 5)
- **5.1** Identidad del bot: `username: "NQS AI Hub"` + logo. `icon_url`
  vía `SLACK_ICON_URL` (env **opcional**, no requerida); fallback al emoji
  🟡 (`:large_yellow_circle:`).
- **5.2** `<!channel>` solo en solicitudes NUEVAS (créditos, acceso,
  excepcional). Los informativos (aprobado/rechazado) NO lo llevan.
- **5.3** Formato simplificado unificado: header "🔔 Nueva solicitud",
  campos *Empleado* / *Pide*, botón "Ver detalle". Sin el "motivo" largo.
- Bonus: kind propio `exceptional_request` (antes el flujo excepcional
  reusaba `credits_request` con un hack).

### Visor de imágenes (Parte 6, NUEVO)
- `src/components/chat/ImageLightbox.tsx`: modal con imagen grande (máx
  90vw/78vh), backdrop oscuro. Cierra con X / click afuera / Escape.
- **Descargar**: fetch → blob → `<a download>` (sirve para data URLs y
  signed URLs de Storage); fallback a abrir en pestaña.
- **Copiar**: Clipboard API con `ClipboardItem`, convirtiendo a PNG vía
  canvas (Chrome solo acepta image/png); fallback a copiar la URL.
- **Navegación**: flechas ‹ ›, contador "n / total", teclas ←/→.
- ChatMessages: thumbnails con `cursor: zoom-in` que abren el lightbox.
- **6.5** Subida múltiple (máx 5) ya estaba soportada en `ChatInput`
  (`multiple` + `MAX_IMAGES_PER_MESSAGE = 5`).

### Defaults restrictivos (Parte 7, NUEVO)
- POST `/api/admin/users`: tras crear el user, auto-inserta `tool_access`
  SOLO para 3dsky (status active, schedule Lun-Vie 09:00-18:00, sáb/dom
  off, `granted_by` = admin). El resto de tools sin registro → el user las
  ve bloqueadas y puede solicitarlas.
- NewUserModal: nota aclaratoria del default.
- **7.3** El hub ya muestra tools sin acceso como bloqueadas con "solicitar
  acceso" (sesión 15).

### Quick access buttons (Parte 8, NUEVO)
- `src/components/admin/QuickAccessButtons.tsx`:
  - exceptional_access → `[1h][2h][3h][4h][fin del día][custom]`
  - access → `[1 día][3 días][1 semana][permanente][custom]`
  - "custom" despliega un `datetime-local` para el vencimiento manual.
- approve route: body acepta `{ note?, duration_minutes?,
  custom_expires_at? }`. exceptional/access setean `expires_at`
  (custom / NOW()+duration / null permanente).
- Créditos mantiene el botón simple. Toast "Aprobado · tool · 2h".

## Lo que se DEJÓ COMENTADO (Parte 2 — reversible)

Todo con `// FEEDBACK NQS v2.0: hidden by request, may re-enable`:

- **2.1** Hub: toolbar completa (tabs Todas/Activas/Pendientes/Bloqueadas,
  buscador ⌕, toggle Grid/Lista). Queda saludo + grid. → `HubScreen.tsx`
- **2.3** 3DSky topbar: pill "X créditos · de Y" (el sistema de créditos
  sigue activo internamente). → `ToolViewBar.tsx`
- **2.4** Modal "declarar consumo" al salir de 3DSky → cierre silencioso
  con `declaredConsumption=0`. → `ThreeDSkyView.tsx`
  (`DeclareConsumptionPrompt.tsx` queda intacto)
- **2.5 / 2.6 / 2.7** Sidebar admin: links "Logs" y "Créditos · pool" +
  sección "Próximamente" (Shield/Snaps). Páginas intactas. →
  `AdminSidebar.tsx`
- **2.8** Campo "JOB TITLE" en NewUserModal (dept ocupa la fila). →
  `NewUserModal.tsx`
- **2.9** Sub-filtro por TIPO en /admin/solicitudes (chips). Las cards
  mantienen su badge de color. → `RequestsBoard.tsx`
- **2.10** Pantalla full "Tu acceso expiró" del módulo → ahora se ve desde
  el hub: la card expirada es clickeable y abre `RequestAccessModal` en
  variante "renewal" (botón "pedir renovación"). El módulo 3DSky redirige a
  /hub si el acceso expiró. → `ToolCard.tsx`, `RequestAccessModal.tsx`,
  `HubScreen.tsx`, `tool/3dsky/page.tsx`

### 2.2 — Cards de proyectos (RUNNING / NQS Improvements)
**La sección de proyectos NO existe todavía** en el código. Se crea en el
prompt 17 (Sistema de Proyectos del estudio). Nada que comentar acá; cuando
se construya, nacerá ya con el filtro de Chule (solo Reframes, Kling, Film,
Seedance; sin RUNNING/NQS Improvements).

## Pendiente para prompt 17 (`17-proyectos-brain-logs.md`)
- Sistema de Proyectos del estudio (cards Reframes/Kling/Film/Seedance).
- Brain: renombrar "Prompt padre" → **SYSTEM BRAIN** + protección con
  password (hay un `// TODO prompt 17` en `AdminSidebar.tsx`).
- Logs rediseñados en **USD** (hoy el link está comentado).
- **Reset de password de users por el admin** (desde el panel).

## Pendiente para prompt 18
- Organigrama.
- Playbook.
- Emails customizados con **Resend** (incl. el de reset password, hoy usa
  el template default de Supabase).
- Rediseño de la pantalla de login.

## Notas de validación / deploy
- **No se mergeó `develop` → `main`.** Primero validar visualmente en el
  preview de Vercel de `develop` (checklist del prompt). Tras validar:
  merge a `main` → Vercel deploya a prod.
- Env opcional nueva (no requerida): `SLACK_ICON_URL` (si se quiere logo
  real en Slack en vez del emoji 🟡).
- Sin migrations.

## Próximo paso
Crear `prompts/mvp/17-proyectos-brain-logs.md` y arrancar esa sesión.
