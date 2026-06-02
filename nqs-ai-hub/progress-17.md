# Progress 17 — Proyectos + Brain + Logs USD + Passwords

**Fecha**: 2026-06-02
**Branch**: `develop` (NO mergeado a main — falta validación visual)
**Sesión anterior**: `progress-16.md`
**Próxima**: `prompts/mvp/18-secciones-finales.md` (a crear)

> Segunda de las 3 sesiones de feedback. La más grande: migration nueva
> (0008) + 4 grupos de features. Dividida en **Parte A** (migration +
> proyectos + brain) y **Parte B** (logs USD + passwords + nav).

## Verificación

```
npm run typecheck → OK
npm test          → 58/58 (7 archivos)
npm run build     → OK (todas las rutas nuevas presentes)
```

## Commits (9)

| # | Commit | Hash |
|---|---|---|
| A1 | feat(db): migration 0008 - projects + brain_config + user_active_project | 0cff6aa |
| A2 | feat(projects): sistema de proyectos compartidos del estudio | e8a5bee |
| A3 | feat(projects): admin CRUD de proyectos | b442040 |
| A4 | feat(brain): renombrar a System Brain y proteger con password | 35c5612 |
| B5 | feat(logs): rediseño de logs a vista USD por usuario | 8e7558e |
| B6 | feat(passwords): reset por admin + cambio propio del user | 4cc24d0 |
| B7 | feat(nav): agregar PROYECTOS al navbar principal | (este) |

## Migration 0008 (aplicada)

Tablas nuevas: `projects`, `brain_config`, `user_active_project`. Columna
nueva: `system_prompts.project_id`. Seed de 4 proyectos (Reframes, Kling,
Film, Seedance). RLS en todas. `bcryptjs` agregado. Tipos regenerados
(`src/types/db.ts`). Password del Brain seedeada con
`scripts/seed-brain-password.ts` → **"bigsteps"**.

## Features implementadas

### Sistema de Proyectos (entidad core nueva)
- `/projects`: grid de cards; click guarda el proyecto activo y entra a
  Claude. Card "+ Nuevo proyecto" para admin.
- Hub: redirige a `/projects` si el user no eligió; muestra el proyecto
  activo en el header con "cambiar".
- **ClaudeAdapter project-aware**: usa el system prompt + memoria DEL
  proyecto activo. Sin proyecto → error; proyecto sin cerebro → error que
  guía al admin.
- `/admin/projects`: CRUD (crear/editar/archivar/restaurar, soft delete).
- Endpoints: `/api/projects`, `/api/me/active-project`,
  `/api/admin/projects(/[id])`.
- Navbar: link **PROYECTOS**.

### System Brain (ex "Prompt Padre") con password
- Renombrado en sidebar; `/admin/prompt` → `/admin/brain` (redirect).
- **Gate de password**: cookie httpOnly firmada (HMAC con ENCRYPTION_KEY),
  30 min. `verify-password` (bcrypt) + `change-password` (log
  `admin.brain.password_change`).
- Editor **por proyecto**: selector arriba (`?project=<id>`) + botón
  "cambiar contraseña". System prompt + memoria escopeados por proyecto.

### Logs rediseñados en USD
- `/admin/logs` (sidebar "Gasto"): período (este mes / mes anterior / 7
  días / custom) + búsqueda + total + tabla por usuario.
- `/admin/logs/[userId]`: detalle de llamadas (fecha, modelo, tokens, USD).
- `claude-pricing.ts`: `calculateCostUSD(model, in, out)`.
- Endpoints `/api/admin/logs/usd(/[userId])`.

### Gestión de passwords
- **Reset (admin)**: en el detalle de usuario, botón "resetear password" →
  password random → modal con copiar + auto-cierre 60s. La nueva se
  devuelve una sola vez (no se persiste). Log `admin.user.password_reset`.
- **Cambio propio**: topbar `UserMenu` (dropdown) → modal. Valida la actual
  re-autenticando, actualiza vía admin API.

## Notas de arquitectura

- **Proyectos = entidad core.** Claude pasó de "un cerebro global" a "un
  cerebro + memoria por proyecto". El usuario elige un proyecto activo
  antes de chatear. Esto cambia el flujo de entrada (hub → projects).
- **system_prompts** ahora se versiona por `(tool_id, type, project_id)`.

## Heads-up / decisiones

1. **USD retroactivo: funciona.** El `model` ya estaba en
   `usage_logs.metadata` desde sesiones previas, y el split input/output
   sale del join con `claude_messages` (vía `metadata.messageId`). A futuro
   el split también va directo en metadata. Logs sin `messageId` ni split
   cuentan 0 USD (raros).
2. **Detalle de logs sin "fragmento del prompt".** El prompt del user no se
   guarda en logs (solo `promptLength`, por privacidad). El detalle muestra
   fecha/modelo/tokens/USD. Agregar el snippet queda como mejora futura.
3. **bcryptjs** instalado (10 rounds).
4. **Reset de password** usa `supabase.auth.admin.updateUserById` (service
   role, backend-only).

## ⚠️ Orden de deploy (importante — prod-safety)

La migration 0008 ya está en la DB compartida, pero **prod (main) todavía
corre el código viejo** (no project-aware). Para no romper Claude en prod:

- La migration **solo** asoció los prompts existentes de Claude a Reframes;
  **no** creó system prompts activos nuevos. Por eso el código viejo sigue
  resolviendo exactamente 1 system activo. ✅ prod intacto ahora.
- **NO cargues prompts de Kling/Film/Seedance (ni proyectos nuevos) desde
  el Brain hasta mergear `develop` → `main` y deployar.** Si activás un
  segundo system prompt de Claude mientras prod corre el código viejo, el
  query viejo (sin filtro de proyecto) podría agarrar el equivocado.
- Orden seguro: **validar develop en preview → merge a main → deploy →
  recién ahí cargar los cerebros de los demás proyectos.**

## Testing manual pendiente (32 items del prompt)

Validar en el preview de `develop` antes del merge. Los flujos clave:
proyectos (elegir, cambiar, Claude usa el prompt correcto), Brain (gate
"bigsteps", selector de proyecto, cambiar password), logs USD (períodos,
detalle), passwords (reset admin + cambio propio).

## Pendiente para prompt 18 (`18-secciones-finales.md`)
- Organigrama.
- Playbook.
- Email automático al crear user (Resend) + el mail de reset password.
- Ajuste fino del diseño del login (proporciones, brackets, ticker).

## Próximo paso
Crear `prompts/mvp/18-secciones-finales.md` y, antes, validar + mergear
esta sesión a main respetando el orden de deploy de arriba.
