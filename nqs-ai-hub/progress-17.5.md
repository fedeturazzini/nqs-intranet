# Progress 17.5 — Ajustes al sistema de proyectos

**Fecha**: 2026-06-02
**Branch**: `develop` (NO mergeado a main — falta validación visual)
**Sesión anterior**: `progress-17.md`
**Próxima**: `prompts/mvp/18-secciones-finales.md`

> Prompt corto post-17. Corrige 2 issues de UX/funcionalidad del sistema de
> proyectos detectados en testing + un pedido extra (toggle grid/lista).

## Verificación

```
npm run typecheck → OK
npm test          → 58/58
npm run build     → OK
```

## Commits (6)

| Commit | Hash |
|---|---|
| feat(db): migration 0009 - claude_conversations.project_id | 9af9afe |
| refactor(flow): login redirige directo al hub (no a projects) | 294fc0b |
| feat(claude): historial de conversaciones filtrado por proyecto | 4909266 |
| feat(claude): selector de proyecto integrado en el chat | 53edb6e |
| fix(projects): mover conversaciones a sin proyecto al eliminar + vista lista | 76d1569 |
| docs: progress-17.5 | (este) |

## Migration 0009 (aplicada)

`claude_conversations.project_id` (FK `ON DELETE SET NULL`) + index
`(user_id, project_id)` + migración de las conversaciones existentes a
Reframes. Tipos regenerados.

## Qué se cambió

### 1. Flow de entrada: hub sin obligación de proyecto
- El hub **ya no redirige a `/projects`** si no hay proyecto activo.
- Se quitó el indicador "Proyecto activo · [cambiar]" del header del hub.
- El login ya iba a `/hub`; ahora entra directo y no fuerza nada. Si el
  user solo quiere 3DSky, no tiene que elegir proyecto.

### 2. Selección de proyecto integrada en Claude
- `/tool/claude` sin proyecto activo → **pantalla intermedia** con los
  cards de proyectos ("Elegí un proyecto para arrancar").
- Con proyecto activo → chat con un **selector de proyecto siempre
  visible** en el header (dropdown 🎬 REFRAMES ▾).
- Cambiar de proyecto → `POST /api/me/active-project` → resetea el chat
  abierto + refetcha el historial del proyecto nuevo + toast "Proyecto
  cambiado a X".

### 3. Historial filtrado por proyecto
- `GET /api/me/conversations` filtra por proyecto activo (sin proyecto →
  vacío).
- La conversación nueva nace con `project_id` = proyecto activo (en el
  adapter).
- `GET /api/me/conversations/[id]` valida que la conv sea del proyecto
  activo (además del ownership) → 404 si no (no se puede abrir una conv de
  otro proyecto por URL).
- Sidebar: título "CONVERSACIONES · [PROYECTO]" + refetch al cambiar.

### 4. Borrar proyecto → conversaciones huérfanas
- `DELETE /api/admin/projects/[id]`: antes del soft-delete, sus
  conversaciones pasan a `project_id = NULL`. No se borran.

### 5. Extra pedido: toggle Grid / Lista en /projects
- Volvió el toggle para ver los proyectos en grid o en lista.

## Nota: conversaciones "Sin proyecto" (TODO post-MVP)

Las conversaciones que quedan con `project_id = NULL` (porque se archivó su
proyecto) **siguen en la DB** pero no aparecen en ningún sidebar (el filtro
es por proyecto activo). Queda como **TODO post-MVP**: agregar una opción
"🗂️ Sin proyecto" en el selector para recuperarlas. Hoy son recuperables
solo por query directa:

```sql
SELECT * FROM claude_conversations WHERE project_id IS NULL;
```

## Testing manual (26 items del prompt)

Validar en el preview de `develop`. Clave:
- Login → hub directo (no /projects); hub sin "Proyecto activo".
- 3DSky entra directo (no pide proyecto); Claude SÍ pide proyecto si no
  elegiste.
- Selector visible en el chat; cambiar de proyecto recarga historial.
- Historial separado por proyecto **y** por usuario.
- Borrar proyecto deja conversaciones huérfanas (no las borra).

## ⚠️ Orden de deploy

Sigue valiendo lo de progress-17: **mergeá develop → main y deployá antes
de cargar los cerebros de proyectos nuevos** (el código viejo de prod no es
project-aware). Esta sesión no cambia eso.

## Próximo paso
`prompts/mvp/18-secciones-finales.md` — Organigrama + Playbook + Email
automático con Resend + ajuste fino del diseño del login.
