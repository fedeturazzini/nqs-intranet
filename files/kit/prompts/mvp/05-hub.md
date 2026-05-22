# Sesión 05 — Hub Screen completo

## Objetivo

Construir el Hub: vista principal con grid/list de tools, filtros (todas/activas/pendientes/bloqueadas), búsqueda, drag-and-drop para reordenar, y estados visuales por tool.

**Duración**: 3 horas
**Output**: Sofia loguea y ve el hub completo con Claude y 3DSky activos, resto en "próximamente".

---

## PROMPT

```
Sesión 05 del NQS AI Hub.

ESTADO ACTUAL:
Leé `progress-04.md`.

OBJETIVO:
Construir el Hub Screen completo con todas las features del diseño del cliente.

PASOS:

1. Crear endpoint `src/app/api/me/access/route.ts` (GET):
   - Devuelve lista de tools + estado de acceso para el usuario actual.
   - Query: JOIN entre `tools` y `tool_access` filtrando por userId.
   - Para tools `uses_credits=true`, agregar info de créditos disponibles desde `credit_allocations`.
   - Para tools sin acceso explícito en `tool_access`, devolver `status: 'locked'`.
   - Response shape:
     ```typescript
     type ToolWithAccess = {
       id: ToolId
       name: string
       vendor: string
       category: string
       description: string
       color: string
       glyph: string
       access: {
         status: 'active' | 'pending' | 'locked' | 'expired'
         credits?: number
         creditsTotal?: number
         expiresInMin?: number
         requestedAt?: string
         expiredAt?: string
       }
     }
     ```

2. Crear `src/components/tool/StatusPill.tsx`:
   - Adaptar `StatusPill` de `design/components.jsx` (líneas 17-30).
   - Props: `status`, `expiresInMin`, `requestedAt`, `expiredAt`, `credits`, `creditsTotal`.
   - Render diferente según status.

3. Crear `src/components/tool/ToolCard.tsx`:
   - Adaptar `ToolCard` de `design/components.jsx` (líneas 32-86).
   - Props: tool, access, onOpen, onRequest, idx, drag handlers.
   - Layout: número arriba izq, handle ⋮⋮, glyph arriba der, body con nombre+desc, foot con status pill + barra de progreso + botón "abrir →" o "solicitar acceso".
   - Click en card activa → onOpen(tool).
   - Click en "solicitar acceso" (cuando locked) → onRequest(tool).

4. Crear `src/components/tool/ToolRow.tsx`:
   - Adaptar `ToolRow` de `design/components.jsx` (líneas 88-110).
   - Layout horizontal: número, glyph, nombre+vendor, categoría, status, botón.

5. Crear `src/components/screens/HubScreen.tsx`:
   - Client Component.
   - Adaptar `HubScreen` de `design/screens.jsx` (líneas 98-208).
   - Implementa:
     - Header con saludo dinámico ("Buenos días/tardes/noches, [Nombre]") y meta data (fecha, equipo online).
     - Toolbar: filtros (todas/activas/pendientes/bloqueadas con contadores), búsqueda con ⌘K, switch grid/list.
     - Grid o List según selección.
     - Drag-and-drop nativo HTML5 para reordenar (no usar librería externa).
     - Orden persistido en localStorage (`nqs-tool-order`).
   - Recibe `tools: ToolWithAccess[]` como prop.

6. Crear `src/app/(dashboard)/hub/page.tsx`:
   - Server Component.
   - Llama al endpoint `/api/me/access` (en realidad, query DB directo desde server).
   - Pasa los datos a `<HubScreen tools={...} />`.

7. Manejar clicks:
   - "abrir →" navega a `/tool/[toolId]` (next session implementa la vista).
   - "solicitar acceso" en el MVP: muestra toast "Función disponible en próxima versión". 
     (El módulo de solicitudes va en módulo aprobaciones, no en MVP.)

8. Para el MVP, esta es la matriz de estados:
   - Claude: active (sin créditos, sin expiración)
   - 3DSky: active (con créditos según allocation del seed)
   - Weavy, Kling, Runway, ElevenLabs, Highsfield: locked (próximamente)

9. La tarjeta locked tiene un botón "próximamente" deshabilitado, NO "solicitar acceso", porque las otras tools no están operativas todavía en el MVP. Adaptá el componente para tener un estado "coming_soon" además de los 4 originales.

10. Test visual:
    - Loguearse como Sofia.
    - Ver el hub con 2 tools active y 5 "próximamente".
    - Cambiar entre grid y list.
    - Filtrar por activas → solo aparecen Claude y 3DSky.
    - Arrastrar tarjetas para reordenar.
    - Buscar "claude" → solo aparece esa.

11. Commit.

REGLAS:
- `HubScreen` debe ser Client Component porque tiene state (filter, search, order, drag).
- El fetch de datos lo hace el server component padre.
- El `localStorage` solo se accede dentro de `useEffect` para evitar errores de hydration.

ARCHIVOS A REFERENCIAR:
- `design/screens.jsx` líneas 98-208 (HubScreen)
- `design/components.jsx` líneas 17-110 (StatusPill, ToolCard, ToolRow)
- `design/screens.css` (clases `.hub-toolbar`, `.hub-filters`, `.hub-search`, `.hub-grid`, `.hub-list`, `.tool-card`, `.tool-row`)
- `design/styles.css` (clases `.page`, `.page-hd`, `.page-title`, `.page-sub`, `.page-meta`)

AL FINAL:
`progress-05.md` con:
- Componentes creados
- Cómo se ve el hub
- Cómo está el drag-and-drop
- Próximo paso: `prompts/mvp/06-claude-adapter.md`
```

---

## VALIDACIÓN

- [ ] Hub se ve idéntico al diseño
- [ ] Filtros funcionan y muestran contadores correctos
- [ ] Búsqueda filtra en vivo
- [ ] Drag-and-drop funciona y persiste el orden en localStorage
- [ ] Grid y list ambos funcionan
- [ ] Las 5 tools "próximamente" se ven correctamente bloqueadas
- [ ] Claude y 3DSky se ven activas

## Próximo paso

`prompts/mvp/06-claude-adapter.md`
