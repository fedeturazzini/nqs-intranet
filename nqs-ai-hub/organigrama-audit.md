# Auditoría — Organigrama (estado actual + mejoras: orden / grupos / drag-drop)

**Fecha:** 2026-07-13 · **Scope:** read-only (solo diagnóstico). **Branch:** develop.

> **TL;DR.** El organigrama es un **árbol CSS propio** (sin librería) armado desde
> `users.reports_to_id`, editable desde un **panel-tabla** en `/admin/organigrama`
> (checkbox + dropdowns + inputs). **Ya existe orden manual** (`org_position`) y **ya se
> respeta** en el render — el gap de "orden" es solo de UX (hoy se tipea un número). **No hay
> grupos** (department solo pinta el color + leyenda, no agrupa). **No hay drag-drop**, pero el
> hub ya tiene un patrón de drag-reorder nativo (ToolCard) reusable. Dimensionamiento modular al final.

---

## 1. DATOS

**Jerarquía (migration 0010, `0010_users_org.sql`):** columnas en `users`:

| Campo | Tipo | Para qué |
|---|---|---|
| `reports_to_id` | UUID FK→users(id) **ON DELETE SET NULL** | a quién le reporta (la jerarquía). ✅ confirmado. |
| `is_in_org` | BOOLEAN default true | si aparece en el organigrama. |
| `org_position` | INTEGER (nullable) | **orden manual entre hermanos** (1,2,3…). ✅ **existe**. |
| `org_role` | TEXT (nullable) | rol DENTRO del org (puede diferir del `dept`), ej "Head of Design". |

Índices: `idx_users_reports_to`, `idx_users_in_org` (parcial where is_in_org).

- **¿Orden manual?** **SÍ** — `org_position`. Y **el render lo usa**: en `OrgChart.tsx` los
  hermanos (y las raíces) se ordenan por `orgPosition ?? 9999` y desempatan por nombre
  (`localeCompare "es"`). O sea el orden manual ya funciona de punta a punta; lo único flojo es
  **cómo se edita** (ver punto 2/4).
- **¿Concepto de "grupo"?** **NO**, más allá de `department`. `dept` es el agrupador natural
  (constante `DEPARTMENTS`: PARTNER, AD, PM, 3D ARTIST, 3D MODELING, PP ARTIST, IN ARTIST). Pero
  **hoy dept NO agrupa nada** en el organigrama: solo define el **color de accent** de cada card
  + una **leyenda** al pie. El árbol es una única jerarquía por `reports_to_id`.
- **Cómo se ordenan hoy los nodos:** la query (`getOrgNodes`) NO ordena; el orden lo hace el
  componente (`org_position` → nombre). Cada nivel de hermanos ordenado igual.

**Archivos de datos:** `src/lib/db/queries/org.ts` (`getOrgNodes`, `getAllUsersForOrg`,
`wouldCreateCycle`), `supabase/migrations/0010_users_org.sql`, tipos en `src/types/db.ts`.

## 2. EDICIÓN (CRUD actual)

**Componente:** `src/components/admin/OrgAdminPanel.tsx` en `/admin/organigrama`
(`getAllUsersForOrg()` → panel). Es un **formulario-tabla**, no visual: **una fila por user
activo**, con columnas:

| Columna | Control | Campo |
|---|---|---|
| En org | checkbox | `is_in_org` (al destildar, limpia el jefe) |
| Usuario | (read-only) name + dept | — |
| Reporta a | **`<select>` dropdown** (todos los in-org menos sí mismo; opción "— (raíz)") | `reports_to_id` |
| Rol en organigrama | input texto | `org_role` |
| Orden | **input número** | `org_position` |

- **Agregar/sacar gente:** la gente sale de la tabla `users` (se crea en el modal "nuevo
  usuario"). En el organigrama se **suma/saca tildando "En org"** (`is_in_org`). No se crea una
  persona desde el organigrama.
- **"Reporta a":** dropdown (`<select>`).
- **Guardar:** trackea un set `dirty`; "guardar cambios (N)" hace un **PATCH secuencial por
  fila** editada. Abajo, **preview en vivo** del árbol (`<OrgChart>`).
- **Endpoint:** `PATCH /api/admin/users/[id]/org` (confirmado). Toca `is_in_org`,
  `reports_to_id`, `org_role`, `org_position` (partial — solo lo que viene). **Valida**: el jefe
  existe y está in-org, no auto-reporte, y **no ciclos** (`wouldCreateCycle` camina hacia arriba).

## 3. RENDER

**Componente:** `src/components/screens/OrgChart.tsx` — **árbol CSS propio, sin librería.**

- Arma `childrenMap` desde `reports_to_id` y renderea `<ul><li>` recursivo con clases
  `.org-tree` / `.org-card` (46 reglas `.org-*` en `src/styles/screens.css`); los conectores son
  CSS. Hermanos ordenados por `org_position` → nombre.
- **Department → color de accent** (hash estable del dept → paleta) + **leyenda** al pie. No agrupa.
- Click en un nodo → **panel lateral read-only** (dept, reporta a, reportes directos). Sin edición.
- Se usa en 2 lados: público (`/organigrama`, `requireAuth`, read-only) y como **preview** dentro
  del panel admin.
- **Sin librerías** de org-chart / DnD (chequeado `package.json`). El render es propio y limpio.
- ⚠️ **Dato reusable:** el hub **ya hace drag-to-reorder nativo** (HTML5 DnD) en las tool-cards
  (`ToolCard.tsx` con `onDragStart/onDragOver/onDrop` + clases `.tool-card.is-dragging` /
  `.is-drag-over` en el CSS). O sea, **el patrón de arrastrar-para-ordenar ya existe en el
  código** y se puede tomar como base (no hace falta una librería para el reorder simple).

## 4. GAPS vs. LO PEDIDO

### 4.1 Orden manual
- **Ya existe** (datos `org_position` + render lo respeta + endpoint lo persiste). El único gap
  es **la UX de edición**: hoy es un **input número** que hay que tipear a mano (y coordinar
  entre hermanos). Mejora natural: **arrastrar para ordenar** o **flechas ↑/↓** en vez del número.
- **Reusa:** `org_position`, el sorting del render, el endpoint. **Nuevo:** solo la UI de reorder.

### 4.2 Grupos
- Hoy **no hay agrupación**; `dept` es solo color. Dos caminos:
  - **(a) Agrupar por department** (reusa `DEPARTMENTS` + el helper `deptOrder` que ya existe en
    `lib/constants/departments.ts`): renderizar el árbol/panel en **secciones o carriles por
    dept**, en el orden del menú. No toca el modelo de datos.
  - **(b) Grupos custom** (concepto nuevo, ej. "equipos" que cruzan departamentos): requiere
    **modelo de datos nuevo** (tabla `org_groups` + FK/asignación) + CRUD + asignar gente + render.
- **Reusa (a):** dept, DEPARTMENTS, deptOrder. **Nuevo (a):** lógica de agrupar en el render (y
  quizás separar el panel admin por grupo). **(b) es todo nuevo.**

### 4.3 Edición más fácil / drag-drop
- **Reordenar hermanos con DnD:** factible con el árbol CSS actual + el patrón DnD nativo del hub.
  Arrastrar una card sobre otra del mismo nivel → recalcular `org_position`. **Reusa:** patrón
  ToolCard, `org_position`, endpoint. **Nuevo:** DnD en el árbol + recompute de posiciones + guardado.
- **Reasignar jefe (re-parent) con DnD:** arrastrar un nodo y soltarlo sobre otro → cambiar
  `reports_to_id`. El backend ya valida ciclos (`wouldCreateCycle`) y jefe válido. Pero visualmente
  es más complejo que el reorder plano: hace falta **drop-target en cada nodo**, feedback visual, y
  el árbol se **re-relayoutea** al soltar. **Reusa:** `wouldCreateCycle`, endpoint. **Nuevo:** drop
  targets + feedback + manejo de casos borde.

---

## Mapa: reusa vs. nuevo + dimensionamiento (modular, para cotizar por separado)

| Mejora | Reusa | Nuevo | Tamaño |
|---|---|---|---|
| **Orden manual — mejor UX** (flechas ↑/↓ o drag entre hermanos) | `org_position`, sorting del render, endpoint PATCH | UI de reorder (reemplaza el input número) | **CHICO** |
| **Grupos por department** (secciones/carriles por dept) | `dept`, `DEPARTMENTS`, `deptOrder`, OrgChart | agrupar en el render + (opcional) panel admin por grupo | **MEDIANO** |
| **Grupos custom** (equipos que cruzan depts) | poco | migración (tabla grupos) + CRUD + asignación + render | **GRANDE** |
| **Drag-drop: reordenar hermanos** | patrón DnD del hub (ToolCard), `org_position`, endpoint | DnD en el árbol + recompute de posiciones | **MEDIANO** |
| **Drag-drop: reasignar jefe (re-parent)** | `wouldCreateCycle`, endpoint | drop-targets por nodo + feedback + relayout + edge cases | **GRANDE** |

**Nota de arquitectura:** el render propio (CSS, sin librería) es un arma de doble filo. Para
orden/grupos/DnD-simple **alcanza y sobra** (se extiende bien). Para un DnD de re-parent fluido y
pulido, hay dos opciones: (1) seguir con el árbol propio + DnD nativo (más laburo de layout/feedback
a mano) o (2) migrar el render a una librería de org-chart/flow (ej. React Flow) — más potente para
DnD/zoom/pan, pero es **reescribir el render** (GRANDE) y sumar dependencia. Para lo que pide NQS hoy
(orden + grupos + reorder cómodo), **conviene el camino propio**: orden-UX (chico) + grupos por dept
(mediano) + DnD de hermanos (mediano) cubren el 80% sin reescribir nada ni sumar librerías.

## Recomendación de secuencia (si se hace por etapas)
1. **Orden-UX (chico)** — flechas ↑/↓ o drag entre hermanos: máximo impacto, mínimo riesgo, todo el
   backend ya está.
2. **Grupos por department (mediano)** — "separarlo en grupos" reusando dept.
3. **DnD de hermanos (mediano)** — "reordenar de forma más cómoda" sobre lo de #1.
4. (Opcional, si Chule lo pide) **re-parent por DnD (grande)** o **grupos custom (grande)**.
