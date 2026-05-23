# Progress 05 — Hub principal (catálogo de tools)

**Fecha**: 2026-05-23
**Duración real**: ~2 horas
**Sesión anterior**: `progress-04.md`
**Próxima sesión**: `kit/prompts/mvp/06-claude-adapter.md`

## Qué se construyó

- Query `listToolsWithAccess(userId)` (`src/lib/db/queries/access.ts`) que une `tools` + `tool_access` + `credit_allocations` en 3 queries paralelas y devuelve un array tipado `ToolWithAccess[]` con orden por status (active → pending → locked → coming_soon).
- Endpoint `GET /api/me/access` que expone esa misma query para que Client Components puedan refrescar sin recargar.
- 3 componentes de tool nuevos: `StatusPill`, `ToolCard`, `ToolRow`.
- `HubScreen` (Client) con:
  - Saludo dinámico ("Buenos días/tardes/noches, [Nombre]") + fecha en `es-AR`.
  - Toolbar con 4 filtros (Todas/Activas/Pendientes/Bloqueadas) con contadores.
  - Búsqueda case-insensitive por nombre (`⌘K` decorativo).
  - Switch Grid / List.
  - Drag-and-drop nativo HTML5 entre cards.
  - Orden persistido en `localStorage["nqs-tool-order"]`.
- Página `/hub` reescrita: Server Component que resuelve auth + query y pasa props a `HubScreen`.
- Estado **`coming_soon`** nuevo (sumado a los 4 del enum `access_status`): es lo que devuelve la query cuando `tools.is_active=false`. La UI lo renderiza con pill "próximamente" y botón disabled.

## Archivos creados

```
nqs-ai-hub/
├── src/
│   ├── app/
│   │   └── api/me/access/route.ts            ← GET tools+access del user actual
│   ├── components/
│   │   ├── screens/HubScreen.tsx             ← client, toda la UX del hub
│   │   └── tool/
│   │       ├── StatusPill.tsx                ← server, 5 estados
│   │       ├── ToolCard.tsx                  ← client, drag handlers
│   │       └── ToolRow.tsx                   ← client, vista lista
│   └── lib/db/queries/access.ts              ← listToolsWithAccess()
└── progress-05.md
```

## Archivos modificados

- `src/app/(dashboard)/hub/page.tsx` — de placeholder a página real: `requireAuth()` + `listToolsWithAccess()` + render de `HubScreen`.

## Decisiones técnicas tomadas

1. **Estado `coming_soon` además del enum DB.** El enum `access_status` en Postgres tiene 4 valores. Para tools donde `tools.is_active=false` no quiero meter rows fake en `tool_access` con un nuevo enum value — sería sucio. Solución: el dominio TypeScript de la UI tiene 5 estados (`AccessStatus | "coming_soon"`), y la query traduce `tools.is_active=false → coming_soon`. La DB queda intacta.

2. **El page hace query directa, no fetch al endpoint propio.** El `/api/me/access` existe porque el prompt lo pide (y es útil para futuras recargas client-side), pero la página `/hub` Server-side llama a `listToolsWithAccess()` directo. Saltamos 1 round-trip HTTP y evitamos serializar/deserializar.

3. **3 queries paralelas con `Promise.all`.** Tools/tool_access/credit_allocations son independientes; las disparamos juntas en vez de encadenarlas. Tarda lo que la más lenta, no la suma.

4. **Orden persistido client-side.** El prompt pidió `localStorage["nqs-tool-order"]`. Pros: no toca DB ni endpoint. Contras: no se sincroniza entre devices del mismo user. Para MVP alcanza; si en algún momento NQS quiere "mi orden en mi laptop = mi orden en el iPad", se mueve a una tabla `user_preferences`.

5. **Lectura defensiva de localStorage en `useEffect`.** Tocar `localStorage` en el render (`useState(() => localStorage.getItem(...))`) causa hydration mismatch — el server no tiene `window.localStorage`. Patrón: arrancar con `defaultOrder` (lo que dio el server), e hidratar desde storage en el primer `useEffect`. Si el storage está corrupto/inaccesible (modo privado, deshabilitado), simplemente seguimos con el default — try/catch silencioso.

6. **Cards "soon" tienen botón disabled "próximamente", no "solicitar acceso".** El prompt es explícito (paso 9): las tools que aún no están operativas no se solicitan, simplemente no existen para el usuario. Cuando entren al hub, basta con flippear `tools.is_active=true` en la DB y la card pasa automáticamente a `locked` con su botón "solicitar acceso" normal.

7. **`router.push(/tool/[id])` en "abrir →".** El tool view real se construye en sesión 06+. Hoy la ruta `/tool/[toolId]` existe como placeholder. Si el user clickea Claude, va a esa página vacía — esperado para esta sesión.

8. **"Solicitar acceso" en MVP = toast.** El módulo de aprobaciones es post-MVP. La acción `onRequest()` dispara un toast informativo: "Se habilita en una próxima sesión del roadmap." Cuando el módulo entre, se cablea a `POST /api/me/access-requests`.

9. **HTML5 drag nativo, sin librería.** El prompt lo exige y es lo correcto: 7 tarjetas con reorder simple no justifica `react-dnd` o `dnd-kit`. Implementación: cada card pasa `draggable + onDragStart/Over/Drop`; el state `dragId` / `dragOverId` controla las clases `.is-dragging` / `.is-drag-over` (ambas ya estaban en `screens.css` del cliente).

10. **Saludo y fecha calculados client-side.** Si los renderizo server-side, la hora podría no coincidir con la del user (server en UTC, user en Buenos Aires). Solución: arrancamos con `"Hola"` y `"—"` en SSR, reemplazamos en `useEffect`. Trade-off aceptado: un flash mínimo de "Hola" a "Buenos días" en el primer mount.

11. **`Set<string>` para validar IDs de localStorage.** El cast `as ToolId` viene después de pasar por un filter contra el Set de tool ids actuales — runtime check + compile-time type. Si en algún momento se agrega una tool nueva al catálogo, el order viejo se mantiene válido y la tool nueva se appendea al final.

## Cosas pendientes (TODO en código)

- [ ] Atajo de teclado real para `⌘K` (hoy es solo visual). Cuando lo implementemos, también enfocar el input.
- [ ] "EQUIPO ONLINE" del header muestra `counts.active + 1` como placeholder (no hay sistema de presence todavía). Cuando exista, reemplazar por count real.
- [ ] Cuando entre el módulo de aprobaciones, cambiar `onRequest` para llamar al endpoint real en lugar del toast.
- [ ] Skeleton/loading state para cuando el `/api/me/access` se llame desde client side (hoy todo es SSR, no hace falta).
- [ ] `expiresInMin` / `requestedAt` / `expiredAt` están en el tipo `ToolWithAccess` pero la query no los popula (el MVP no tiene módulo de horarios ni aprobaciones). El pill ya los maneja para cuando entren.

## Cosas a tener en cuenta para la próxima sesión

- La página `/tool/[toolId]` ya existe como placeholder. La sesión 06 (Claude adapter) la convierte en la primera tool view operativa.
- El `HubScreen` espera `tools: ToolWithAccess[]` ya pre-ordenado por status. Si en futuras sesiones agregamos sorting custom, hacerlo en `listToolsWithAccess` o pasar `sortFn` como prop, no en el componente.
- El `coming_soon` se calcula 100% server-side (en `listToolsWithAccess`). Los Client Components reciben el status ya resuelto — no replican lógica.
- Tomas (admin) hoy NO tiene `tool_access` rows en seeds (solo employees), así que ve todo como `locked` o `coming_soon`. Si querés que los admins también vean tools activas en su Hub, agregá rows manualmente o ampliá `scripts/create-users.ts`. Para MVP no es bloqueante porque los admins trabajan desde `/admin`.

## Cómo probar lo que se construyó

```bash
npm run dev
```

Flujo manual como **sofia@nqs.test / nqs2026sofia**:

1. Después de loguear, caes en `/hub` con:
   - Saludo "Buenos días/tardes/noches, Sofía." (según hora local).
   - Fecha en español: "23 de mayo de 2026".
   - Eyebrow "↳ TU WORKSPACE".
   - Toolbar: 4 filtros (Todas · 7 / Activas · 2 / Pendientes · 0 / Bloqueadas · 0) + búsqueda + Grid/Lista.
   - Grid con 7 cards. Claude y 3DSky en la fila de arriba (status `active`), el resto con opacity reducida (status `coming_soon`).
2. **Claude**: pill "activa" verde, botón "abrir →".
3. **3DSky**: pill "30 / 30 créditos", barra de progreso turquesa al 100%, botón "abrir →".
4. **Weavy/Kling/Runway/ElevenLabs/Highsfield**: pill "próximamente", botón "próximamente" disabled.
5. Filtrar **Activas** → solo aparecen Claude y 3DSky.
6. Filtrar **Bloqueadas** → "no hay herramientas que coincidan con el filtro".
7. Buscar **"claude"** → solo la card de Claude.
8. Cambiar a **Lista** → mismas tools en vista horizontal con vendor, categoría y status.
9. Volver a **Grid** y arrastrar una card a otra posición — el orden se persiste; recargar página y mantiene el orden.
10. Click en card Claude (o "abrir →") → navega a `/tool/claude` (placeholder hasta sesión 06).
11. Click en card de Weavy → no pasa nada (no clickeable). Click en "próximamente" → tampoco (disabled).
12. Click en "solicitar acceso" en una card locked (no aparece en MVP porque todas las tools que la sofía no tiene son `coming_soon`; lo testeás cuando agregues una tool con `is_active=true` y sin `tool_access` row).

Como **tomas@nqs.test / nqs2026admin**:
- Mismo Hub pero con todas las cards en `locked` (Claude/3DSky) o `coming_soon` — sin tool_access en seeds. Ver "Cosas a tener en cuenta" arriba.

Tests + build:
```bash
npm test          # 6/6 pasa
npm run typecheck # OK
npm run build     # 9 rutas + Proxy (sumó /api/me/access)
```

Smoke E2E verificado:
- `/api/me/access` devuelve 7 tools con orden y status correctos.
- `/hub` renderiza el markup esperado: `.page`, `.page-title`, `.hub-toolbar`, `.hub-filters`, `.hub-search`, `.hub-grid`, 2 cards `data-status="active"`, 5 cards `data-status="coming_soon"`, 2 botones "abrir →", 5 botones disabled "próximamente".
- Contadores en filtros: "Todas · 7", "Activas · 2".

## Cómo se ve el Hub

```
┌─────────────────────────────────────────────────────────────┐
│ topbar: NqsLogo WORKSPACE • | Hub Tut Pla Org | TP · salir │
├─────────────────────────────────────────────────────────────┤
│ marquee: ONE KEY · EVERY TOOL ✦ DIRIGIDO ✦ …               │
├─────────────────────────────────────────────────────────────┤
│ ↳ TU WORKSPACE                            HOY               │
│ Buenos días, Sofía.                       23 de mayo de 2026│
│ Tu suite del día. Arrastrá las cards…    EQUIPO ONLINE      │
│                                           3 personas        │
│                                                             │
│ [Todas·7] [Activas·2] [Pend·0] [Block·0]  [⌕ buscar… ⌘K]   │
│                                            [Grid·] [Lista]  │
│                                                             │
│ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐                │
│ │ 01  ⋮⋮ │ │ 02  ⋮⋮ │ │ 03  ⋮⋮ │ │ 04  ⋮⋮ │                │
│ │ TEXT  ✦│ │ ASSETS◈│ │ AUDIO ◐│ │ VIDEO ▶│ …              │
│ │ Claude │ │ 3DSky  │ │ Eleven │ │ Runway │                │
│ │ Razon…│ │ Modelos│ │ Síntes│ │ Edición│                │
│ │•activa │ │•30/30  │ │•próx.. │ │•próx.. │                │
│ │[abrir→]│ │[abrir→]│ │[próx.] │ │[próx.] │                │
│ └────────┘ └────────┘ └────────┘ └────────┘                │
└─────────────────────────────────────────────────────────────┘
```

(Las tools coming_soon van con opacity 0.78 según el CSS del cliente.)

## Cómo está el drag-and-drop

- **API**: HTML5 nativo (`draggable + onDragStart/Over/Drop`), sin librería externa.
- **Estado**: 2 useState: `dragId` (la que estás arrastrando) y `dragOverId` (sobre la que estás hovering).
- **Mientras arrastrás**:
  - La card origen recibe class `.is-dragging` (opacity 0.4, cursor grabbing).
  - La card destino recibe class `.is-drag-over` (border accent + translateY -3px).
- **Drop**: actualiza `order` (state `ToolId[]`), persiste en localStorage en el siguiente effect.
- **Tools nuevas**: si en una migration futura aparece una tool nueva, el storage viejo no la tiene; la lógica appendea automáticamente las missing al final del array.
- **Compatibilidad**: HTML5 drag-and-drop funciona en Chrome/Firefox/Safari desktop. En mobile/touch no funciona (es una limitación del estándar). Para mobile habría que sumar `@dnd-kit/core` o similar — fuera de scope MVP.
- **Solo la vista Grid permite reordenar**. La vista Lista no es drag-and-drop (no lo pedía el prompt y el design del cliente tampoco).

## Componentes creados

| Componente | Tipo | Responsabilidad |
|---|---|---|
| `StatusPill` | Server | Pill de estado, 5 variantes (active/pending/locked/expired/coming_soon). Soporta credits / expires / requested / expired metadata. |
| `ToolCard` | Client | Tarjeta de tool en vista grid. Drag handlers, click-to-open en active, botón "solicitar acceso" en locked, "próximamente" disabled en coming_soon. |
| `ToolRow` | Client | Misma info que ToolCard pero en layout horizontal. |
| `HubScreen` | Client | Toda la UX del hub: header, filtros, search, switch grid/list, drag-and-drop, persistencia en localStorage. |
| `listToolsWithAccess(userId)` | Server query | 3 queries paralelas + JOIN en memoria. Devuelve `ToolWithAccess[]` ordenado por status. |

## Errores conocidos

- (ninguno bloqueante)
- Drag-and-drop **no funciona en mobile** (limitación nativa de HTML5 drag). Esperado para MVP.

## Variables de entorno agregadas

(ninguna nueva)

## Commits sugeridos

```
feat(hub): catálogo de tools con filtros, búsqueda, grid/list y drag-and-drop
```

## Próximo paso

`kit/prompts/mvp/06-claude-adapter.md` — implementar el ClaudeAdapter (wrapper sobre Anthropic API) que el botón "abrir →" del Hub va a usar.
