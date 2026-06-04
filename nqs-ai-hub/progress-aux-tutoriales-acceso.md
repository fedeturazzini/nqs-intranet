# Progress aux — Acceso a Tutoriales + comentar Overview

**Fecha**: 2026-06-03
**Branch**: `develop`
**Tipo**: sesión auxiliar corta (post-18).

## Verificación
```
npm run typecheck → OK
npm test          → 58/58
npm run build     → OK
```

## Cambios aplicados

### 1. Tutoriales gestionable desde /admin/access (`6d7547e`)
Tutoriales pasa a ser una "tool" del sistema de `tool_access` existente:
- **SQL** (`supabase/apply-remote-tutoriales-tool.sql`): seed de la fila
  `tutoriales` en la tabla `tools`. **Necesario** porque
  `tool_access.tool_id` tiene FK a `tools(id)` — sin la fila no se puede
  dar acceso. (El prompt asumía que no hacía falta; la FK lo exige.)
- `ToolId` += `tutoriales`. El registry de adapters pasó a `Partial`
  (tutoriales no tiene adapter — es contenido gestionado por acceso).
- `/admin/access`: aparece la card de **Tutoriales** con toggle ON/OFF,
  **sin sección de horarios** (`ToolAccessCard` la trata especial →
  "acceso 24/7"). Usa el endpoint de toggle existente (`PATCH
  /api/admin/tools/access`), no hizo falta uno nuevo.
- `/tutoriales` + `/tutoriales/[id]`: **gate** por
  `canUseTool('tutoriales')`. Sin acceso → pantalla "no habilitado" +
  botón "solicitar acceso" (reusa `RequestAccessModal`).
- **Navbar**: el item `TUTORIALES` solo aparece si el user tiene acceso
  (layout → Topbar → TopbarNav). **Los admins lo ven siempre** (bypass de
  `canUseTool`).
- **Hub**: tutoriales excluido del catálogo (no es una card del hub, es una
  sección del navbar).

### 2. Overview del sidebar admin (`6565e74`)
- Link "Overview" **comentado** en el sidebar (may re-enable).
- La pantalla se movió a `/admin/overview` (sigue funcional por URL).
- `/admin` ahora **redirige a `/admin/users`** (landing default del admin).

## Default OFF al crear user
Los users nuevos **NO** reciben acceso a Tutoriales por default (no se
inserta `tool_access` para tutoriales en el POST de creación) — consistente
con la lógica restrictiva del prompt 16. El admin lo habilita desde
`/admin/access`.

## ⚠️ Aplicar el SQL
Antes de que funcione end-to-end, aplicar en Supabase SQL Editor:
**`supabase/apply-remote-tutoriales-tool.sql`** (seed de la fila
`tutoriales` en `tools`). Sin esto:
- La card de Tutoriales NO aparece en `/admin/access`.
- Todos quedan sin acceso (gate), salvo admins (que ven el navbar igual).

El archivo incluye, comentado, el INSERT opcional para dar acceso
retroactivo a TODOS los users (solo si Chule lo pide).

## Pendiente / cotizable aparte
- **Acceso granular por tutorial** (Weavy sí, In Motion no, etc.): requiere
  tabla nueva `tutorial_access` + UI más compleja. Es un módulo aparte.

## Próximo paso
Aplicar el SQL → validar en preview → merge `develop` → `main`.
