# Audit — `user_active_project` y trabajo paralelo por proyecto

**Fecha:** 2026-07-30  
**Modo:** READ-ONLY; único archivo nuevo: este reporte. Sin cambios de código, migraciones ni deploy.  
**Branches revisadas:** `develop`, `main`, `origin/develop`, `origin/main`.

## Estado de branches

Las cuatro referencias apuntan al mismo commit:

```text
ffff2e4 Fix convs claude
```

Por lo tanto, no hay diferencia entre `develop` y `main/prod` en el diseño de
`user_active_project` ni en los riesgos descritos abajo.

El commit `ffff2e4` mejoró la continuidad cliente de conversaciones dentro de la SPA y mantiene
sesiones visuales separadas por `projectId`, pero **no manda ese `projectId` al endpoint de
`execute`**. La autoridad server-side sigue siendo la fila global de `user_active_project`.

## Veredicto ejecutivo

El proyecto activo actual es **un singleton global por usuario**:

```sql
user_active_project (
  user_id UUID PRIMARY KEY,
  project_id UUID NOT NULL,
  updated_at TIMESTAMPTZ
)
```

Dos pestañas del mismo usuario comparten sesión y DB. La última que hace
`POST /api/me/active-project` pisa la fila para ambas.

La mezcla de cerebros queda confirmada:

1. la pestaña A muestra proyecto/conversación A;
2. la pestaña B hace activo el proyecto B;
3. A manda un mensaje sin `projectId` en el request;
4. el adapter consulta `user_active_project` y obtiene B;
5. carga System Brain, memoria y modelo de B;
6. si A envió `conversationId`, solo se valida que la conversación pertenezca al usuario, **no que
   pertenezca a B**;
7. se manda a Anthropic historia de A + cerebro de B y se guardan los nuevos mensajes dentro de la
   conversación A;
8. la respuesta termina normalmente, sin aviso.

Esto es **corrupción semántica silenciosa de datos**, además de bloquear la feature de trabajo
paralelo.

**Recomendación:** **Opción A — proyecto explícito en URL/request, con la conversación como autoridad
cuando ya existe.** Dimensionamiento: **mediano** (sin migración obligatoria, porque
`claude_conversations.project_id` y los índices ya existen), pero de riesgo alto por tocar el camino
central del chat.

`user_active_project` puede conservarse como preferencia de “último proyecto usado” para
compatibilidad, pero debe dejar de autorizar/decidir qué cerebro usa cada request.

---

# 1. Dónde vive el “proyecto activo”

## 1.1 Tabla y cardinalidad

Definida en `supabase/migrations/0008_projects_brain.sql`:

```sql
CREATE TABLE user_active_project (
  user_id    UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Propiedades:

- `user_id` es la **PRIMARY KEY**: hay como máximo **una fila por usuario**.
- No existe `tab_id`, `session_id`, `conversation_id` ni clave compuesta.
- `project_id` referencia `projects(id)` con `ON DELETE CASCADE`.
- Borrar físicamente un proyecto elimina las filas activas que lo referencian.
- El admin hace soft-delete (`projects.is_active=false`), no hard-delete; en ese caso la fila de
  `user_active_project` **queda apuntando al proyecto archivado**.
- RLS `user_active_project_own`: el usuario autenticado solo opera su propia fila.
- Los helpers normales usan el cliente server-side/service role y aplican el `userId` explícitamente.

Los tipos generados (`src/types/db.ts`) confirman relación one-to-one desde `users`:
`user_active_project_user_id_fkey` tiene `isOneToOne: true`.

## 1.2 Lecturas completas

Todas las lecturas pasan por dos helpers en `src/lib/db/queries/projects.ts`:

### `getActiveProjectId(userId)`

Lee la fila cruda:

```text
user_active_project
  .select("project_id")
  .eq("user_id", userId)
  .maybeSingle()
```

Devuelve el UUID aunque el proyecto esté archivado.

Lo usan:

1. `src/lib/adapters/claude.ts`
   - decide cerebro, memoria, modelo y `project_id` de conversaciones nuevas.
2. `src/app/api/me/conversations/route.ts`
   - filtra el sidebar/historial por proyecto global.
3. `src/app/api/me/conversations/[id]/route.ts`
   - exige que `conversation.project_id` coincida con el global.
4. `src/app/(dashboard)/projects/page.tsx`
   - marca visualmente qué card es “activa”.

### `getActiveProjectForUser(userId)`

Primero llama `getActiveProjectId`, luego carga `projects` y devuelve `null` si no existe o
`is_active=false`.

Lo usan:

5. `src/app/(dashboard)/tool/[toolId]/page.tsx`
   - decide el proyecto inicial que recibe `ClaudeView`.
6. `GET /api/me/active-project`
   - devuelve el proyecto global resuelto; no tiene callers cliente en el código actual.
7. `POST /api/me/active-project`
   - lee el proyecto anterior para limpiar su cookie de gate si era privado.

No hay otras lecturas directas de `user_active_project` en `src`.

## 1.3 Escrituras completas

El único helper de escritura es `setActiveProject(userId, projectId)` en
`src/lib/db/queries/projects.ts`:

```text
upsert({ user_id, project_id, updated_at }, { onConflict: "user_id" })
```

El `onConflict: "user_id"` confirma la semántica de singleton: seleccionar otro proyecto reemplaza
el anterior.

El único caller es `POST /api/me/active-project`, disparado desde:

1. `src/components/screens/ProjectsScreen.tsx`
   - click en card → POST global → hard navigation a `/tool/claude`.
2. `src/components/screens/ClaudeView.tsx`
   - selector dentro del chat → POST global → cambia estado local y resetea/refetchea chat.

No hay escritura por mensaje ni por conversación.

## 1.4 Estado cliente, cookies y storage

### Proyecto visible en memoria

`ClaudeView` mantiene `activeProject` en React:

- arranca con el valor resuelto server-side desde la DB;
- cambia después de un POST exitoso a `/api/me/active-project`.

Desde `ffff2e4`, `useClaudeChat(projectId)` conserva sesiones efímeras por proyecto durante
navegaciones dentro de la SPA. Esto separa la UI/pending por proyecto en **esa pestaña**, pero no
cambia la fuente server-side del cerebro.

### Lo que no existe

No hay para la selección del proyecto:

- cookie de active project;
- `localStorage`;
- `sessionStorage`;
- Context/Zustand persistido;
- `projectId` en URL;
- `projectId` en el body de `execute`.

### Cookies de proyectos privados

Sí existen cookies `pg_{projectId}`, pero son **autorización del gate**, no selección activa:

- una cookie por proyecto;
- httpOnly, firmada con `{ projectId, gateVersion}`;
- TTL 15 minutos;
- `hasProjectGate(projectId)` valida la cookie correspondiente.

El POST de active-project borra la cookie del proyecto privado anterior. Ese comportamiento también
es incompatible con dos pestañas privadas en paralelo: una pestaña puede invalidar la autorización
que necesita la otra.

---

# 2. Cómo se usa en el flujo del chat

## 2.1 Camino exacto cliente → Anthropic

### Cliente

`ClaudeView` conoce un `activeProject.id` local y se lo pasa a:

```text
useClaudeChat(activeProject?.id ?? null)
```

Ese id se usa para separar sesiones visuales del store efímero, pero `sendMessage` arma:

```json
{
  "prompt": "...",
  "imagePaths": ["..."],
  "conversationId": "..."
}
```

**No incluye `projectId`.**

### API route

`POST /api/tools/claude/execute` valida con Zod:

```text
prompt
imagePaths?
conversationId?
```

`ExecuteParams` en `src/lib/adapters/types.ts` tiene la misma forma. No existe un campo de proyecto.

### Adapter

`src/lib/adapters/claude.ts` hace al inicio:

```text
projectId = getActiveProjectId(userId)
```

Ese valor global decide:

- `hasProjectGate(projectId)`;
- `getActiveSystemAndMemoryForProject("claude", projectId)`;
- el System Brain;
- la workspace memory;
- el modelo (`systemPrompt.model`);
- si el modelo admite code execution;
- los metadatos/logs;
- `project_id` de una conversación nueva.

### Conversación existente

Si llega `conversationId`, el adapter consulta:

```text
select("id, user_id")
```

Valida:

- que exista;
- que pertenezca al usuario.

**No selecciona `project_id` y no compara la conversación con el proyecto global o esperado.**

Luego carga todos sus mensajes y los combina con el Brain/modelo resuelto desde
`user_active_project`.

### Persistencia

- Conversación nueva: nace con `project_id = projectId` global.
- Conversación existente: mantiene su `project_id`, pero recibe mensajes producidos con el Brain
  global actual, aunque sea otro proyecto.

## 2.2 Causa confirmada de mezcla entre pestañas

Ejemplo:

```text
Pestaña A: UI = Reframes, conversación.project_id = Reframes
Pestaña B: POST active-project = Kling
DB global: user_active_project = Kling
Pestaña A: POST execute(conversationId de Reframes, sin projectId)
Adapter: Brain/modelo/memoria = Kling
Historia/persistencia = conversación Reframes
```

Resultado:

- la respuesta usa instrucciones/formato/modelo de Kling;
- se guarda dentro de la conversación de Reframes;
- la UI de A sigue rotulada Reframes;
- no hay error ni warning para el usuario.

Esto confirma el reporte “a Kling/Reframes le sale un prompt con formato de otro proyecto”.

Nota: el proyecto llamado **Kling dentro de Claude** no es lo mismo que la tool standalone
`/tool/kling`. Los endpoints de la tool Kling, 3DSky y Organigrama no leen
`user_active_project`; el cruce ocurre en Claude al elegir el proyecto/Brain “Kling”.

## 2.3 Carreras adicionales

- Dos tabs que cambian proyecto casi al mismo tiempo: gana el último upsert.
- La UI de la pestaña perdedora no recibe notificación y conserva su label anterior.
- Una request lenta puede resolver el global en un momento distinto del que el usuario cree.
- Una conversación nueva abierta visualmente en A puede terminar persistida con `project_id=B`.
- El log `execute.context` registra el proyecto realmente usado y permite diagnosticar después, pero
  no evita el error ni informa al usuario.

Hay además una asimetría en `src/app/api/me/conversations/[id]/route.ts`:

- `GET` valida ownership, proyecto global y gate;
- `PATCH` (renombrar) valida únicamente ownership y no `project_id`/gate.

No causa mezcla de Brain, pero al desacoplar el global conviene unificar ambas operaciones alrededor
del `project_id` canónico de la conversación.

---

# 3. Rebote `/tool/claude` → `/hub`

## 3.1 Guard real de la ruta

En `src/app/(dashboard)/tool/[toolId]/page.tsx` hay solo dos redirects a `/hub`:

1. `toolId !== "claude"`;
2. `canUseTool(...).allowed === false`.

El proyecto activo se resuelve **después** de esos guards.

Casos de proyecto:

- Sin fila active-project → `ClaudeView` muestra picker.
- Proyecto hard-deleted → el FK cascade elimina la fila → picker.
- Proyecto soft-deleted/inactivo → `getActiveProjectForUser` devuelve `null` → picker.
- Proyecto privado sin gate → se pasa `activeProject=null` → picker; al elegirlo aparece modal.

Ninguno redirige a `/hub`.

## 3.2 Estado del rebote previamente auditado

`rebote-claude-audit.md` encontró otra causa: acceso temporal con `status="active"` pero
`expires_at` vencido. El hub lo mostraba activo, mientras `canUseTool` lo rechazaba.

El código actual de `src/lib/db/queries/access.ts` ya deriva `expired` cuando `expires_at` pasó, por
lo que la card del hub y el guard server están alineados.

## 3.3 ¿Proyecto por pestaña resuelve el rebote?

**No resuelve el rebote conocido de permisos**, porque ocurre antes de leer proyecto.

Sí elimina otra familia de estados confusos que no son redirect:

- historial vacío porque otra pestaña cambió el global;
- `GET conversation/[id]` con `wrong_project`;
- picker inesperado por global inactivo;
- execute con Brain equivocado;
- gate del proyecto incorrecto.

### Bug de proyecto archivado

El soft-delete mueve sus conversaciones a `project_id=NULL` y marca `projects.is_active=false`, pero
no limpia `user_active_project`.

Consecuencias actuales:

- la page resuelta muestra picker (porque filtra `is_active`);
- el listado usa el UUID crudo y queda vacío;
- el detalle rechaza conversaciones ahora huérfanas;
- **el adapter también usa el UUID crudo** y puede seguir cargando el Brain de un proyecto archivado,
  porque no revalida `projects.is_active`.

La Opción A, con validación explícita de proyecto activo en cada request, sí cierra este bug de
estado inválido, aunque no el redirect de permisos.

---

# 4. Impacto: qué depende de `user_active_project`

| Superficie | Dependencia actual | Riesgo al cambiar |
|---|---|---|
| Entrada `/tool/claude` | Proyecto inicial SSR; picker si null/inactivo/bloqueado | Medio: hay que resolver desde URL/contexto explícito |
| Selector dentro de Claude | Escribe la fila global | Alto: debe navegar/cambiar contexto de tab, no pisar a otras |
| `/projects` | Lee active para badge y escribe al abrir | Bajo/medio: puede pasar a “último usado” + URL |
| `execute` | Fuente autoritativa de projectId | **Crítico**: Brain/modelo/memoria/gate/persistencia |
| System Brain + memory | Query por projectId global | Crítico, aunque el helper ya acepta projectId explícito |
| Modelo | Sale de la fila `system_prompts` del proyecto global | Crítico: puede usar modelo/config equivocados |
| Conversación nueva | `project_id` = global | Crítico para separación de historial |
| Conversación existente | No valida su project contra el Brain usado | Crítico: corrupción silenciosa |
| Sidebar `/api/me/conversations` | Filtra por global | Alto: tabs se vacían/pisan |
| Detalle GET `/api/me/conversations/[id]` | Compara conv con global | Alto: `wrong_project` entre tabs |
| Rename PATCH `/api/me/conversations/[id]` | Solo ownership; no valida project/gate | Bajo: autorización asimétrica |
| Archivos generados | Heredan `conversation_id`/`message_id` | Indirecto: deben seguir ligados al mensaje exacto |
| Imágenes/PDF subidos | Ligados a user/conversation path, no al global | Bajo; validar conversación/proyecto aguas arriba |
| Gate privado | Valida cookie del project global; POST limpia gate anterior | Alto para privados paralelos |
| Logs/usage | Metadata `projectId` global | Medio: hoy registra el proyecto usado, aunque sea incorrecto |
| Admin System Brain | Usa `projectId` explícito propio | Bajo: ya está desacoplado del active user |
| Tool Kling standalone | No usa active project | Ninguno directo |
| 3DSky | No usa active project | Ninguno directo |
| Organigrama | No usa active project | Ninguno directo |

## Qué ya se puede reutilizar

- `claude_conversations.project_id` (migration 0009).
- Índice `(user_id, project_id)`.
- Helpers `getProjectById`, `getActiveSystemAndMemoryForProject`, `hasProjectGate`.
- Cookies privadas ya namespaced por project id.
- Lista/picker/selector existentes.
- Store efímero de `useClaudeChat` agregado en `ffff2e4`, que ya separa sesiones visuales por
  `projectId`.
- Endpoint de detalle, firma de adjuntos y asociación exacta files↔message.
- Logs `execute.context` con projectId, nombre, prompt id, modelo/hash.

## Qué es nuevo

- Contexto explícito de proyecto en URL/vista.
- `projectId` en requests de historial y execute.
- Resolución canónica desde `conversation.project_id`.
- Guards de consistencia request↔conversation.
- Validación de proyecto existente, activo y gateado en cada endpoint.
- Semántica nueva de `user_active_project`: preferencia, no autoridad.
- Ajuste del lifecycle de cookies privadas para no invalidar otra pestaña.
- Tests de concurrencia entre tabs/proyectos.

---

# 5. Opciones de solución

## Opción A — proyecto explícito por URL/request

### Diseño recomendado

Ejemplos posibles:

```text
/tool/claude?projectId=<uuid>
```

o una ruta dedicada:

```text
/tool/claude/project/<projectId>
```

Reglas server-side:

1. **Conversación nueva**
   - request incluye `projectId`;
   - server valida proyecto existente + `is_active` + gate;
   - carga Brain/modelo/memoria con ese id;
   - crea conversación con ese mismo id.
2. **Conversación existente**
   - server trae `id,user_id,project_id`;
   - ownership obligatorio;
   - `conversation.project_id` es la autoridad canónica;
   - si además llega `projectId` y no coincide, rechaza antes de Anthropic;
   - gate y Brain se resuelven con `conversation.project_id`.
3. **Historial**
   - `GET /api/me/conversations?projectId=...`;
   - valida proyecto/gate y filtra por ese id.
4. **Detalle**
   - valida ownership y gate de `conv.project_id`;
   - deja de compararlo con el singleton global.
   - aplica el mismo contexto canónico en GET y PATCH.

### Qué se reutiliza

- columna `claude_conversations.project_id`;
- queries de Brain por project id;
- gate por project id;
- selector, cards y store cliente;
- active-project como default/último usado opcional.

### Qué cambia

- `ClaudeView`/`ProjectSelector` navegan actualizando URL/contexto.
- `ProjectsScreen` navega con project id explícito.
- `useClaudeChat` manda project id.
- `ExecuteSchema` y `ExecuteParams` incorporan project id.
- adapter deja de llamar `getActiveProjectId` como autoridad.
- endpoints de conversaciones reciben/derivan proyecto.
- SSR de `/tool/claude` resuelve el id de URL.
- active-project POST deja de limpiar autorización necesaria por otra pestaña, o se rediseña la
  política de gate.

### Ventajas

- Determinista y visible.
- Deep links, back/forward y refresh correctos.
- Cada tab tiene URL propia.
- Server puede auditar y rechazar mismatch.
- Conversaciones existentes se autocontienen por `project_id`.
- Resuelve mezcla de Brain/modelo y la mayoría de estados raros de historial.

### Riesgos

- Hay que validar todo input: un UUID del cliente nunca es confiable por sí solo.
- Privados requieren conservar el gate por proyecto sin que otro tab lo borre.
- Hay que decidir UX de conversaciones `project_id=NULL`.
- Cambia varias interfaces centrales, por lo que necesita tests integrales.

### Dimensionamiento

**Mediano**, riesgo alto. No requiere migración obligatoria.

## Opción B — proyecto tab-scoped en memoria/sessionStorage

### Diseño posible

- cada tab guarda su project id en `sessionStorage` o store de memoria;
- no escribe el singleton global en cada switch;
- el cliente manda ese id en execute/list/history;
- al recargar, `sessionStorage` intenta restaurarlo.

El store de `ffff2e4` ya aporta parte del estado en memoria por proyecto.

### Limitación fundamental

Un estado solo cliente **no alcanza**:

- el server no puede leer `sessionStorage`;
- SSR no conoce el proyecto de esa tab;
- execute debe recibir igualmente un `projectId`;
- el server debe validar igualmente conversation↔project;
- sin URL no hay deep link reproducible;
- memoria se pierde en reload;
- `sessionStorage` sobrevive reload en la misma tab, pero duplicar/restaurar tabs y navegación puede
  producir contexto implícito difícil de inspeccionar.

En cuanto B se hace seguro, termina necesitando casi los mismos cambios de API/adapter que A, pero
con peor observabilidad y navegación.

### Qué reutiliza

- store efímero actual;
- selector;
- helpers server por project id.

### Qué es nuevo

- key/versionado de sessionStorage;
- hidratación cliente y manejo del mismatch SSR;
- fallback si storage está bloqueado/corrupto;
- projectId explícito y validaciones server de todas formas.

### Qué resuelve

- Puede evitar que tabs pisen la selección visible/global.
- Si manda y valida project id, evita mezcla.
- No resuelve por sí sola el guard SSR ni el rebote de permisos.

### Fragilidad

- Contexto oculto.
- Difícil de compartir/depurar.
- Flash/picker incorrecto antes de hidratar.
- Más edge cases de reload/duplicación.
- Si se implementa solo del lado cliente, **el bug de datos sigue vivo**.

### Dimensionamiento

**Mediano** también, con mayor deuda y menor robustez.

## Recomendación

Elegir **A**.

La URL/request explícita es el único contrato claro entre:

```text
lo que la pestaña muestra
  = lo que la conversación declara
  = lo que el server valida
  = el Brain/modelo que recibe Anthropic
  = dónde se persiste la respuesta
```

Se puede conservar B únicamente como cache/UX complementaria, nunca como fuente de verdad.

---

# 6. El bug de datos, separado de la feature

## 6.1 Confirmación

Hoy el sistema puede responder con un Brain equivocado **sin ningún aviso**.

No es solo una posibilidad teórica:

- el request no lleva project id;
- el adapter lee el singleton global;
- la conversación existente no selecciona ni valida `project_id`;
- la llamada a Anthropic se hace con esa combinación;
- la persistencia acepta la conversación original;
- el evento `done` es normal;
- la UI no conoce el project id realmente usado.

La única evidencia queda en logs (`execute.context` / usage metadata), útil después del daño.

## 6.2 Mínimo de seguridad aunque se postergue el paralelo

Antes de la feature completa, el guard mínimo debería ser:

### Para conversación existente

1. consultar `id,user_id,project_id`;
2. validar ownership;
3. rechazar si `project_id` es null;
4. usar **ese `project_id`** para gate + Brain + memoria + modelo;
5. si el request trae un contexto esperado distinto, devolver conflicto y no llamar a Anthropic.

Esto evita mezclar aunque `user_active_project` cambie entre tabs.

### Para conversación nueva

1. exigir project id explícito;
2. validar que existe y está activo;
3. validar gate privado;
4. usarlo para Brain y para el insert de conversación.

Si temporalmente se mantiene el global como fallback para clientes viejos, debe quedar acotado a
conversaciones nuevas y con telemetría; no debe prevalecer sobre `conversation.project_id`.

## 6.3 Error esperado

Ante mismatch, es preferible:

```text
409 project_context_mismatch
```

con mensaje para recargar/reabrir el proyecto, antes que devolver contenido válido sintácticamente
pero producido por el cerebro incorrecto.

---

# Plan de impacto y archivos probables

## Núcleo

- `src/components/screens/ClaudeView.tsx`
- `src/components/screens/ProjectsScreen.tsx`
- `src/lib/hooks/useClaudeChat.ts`
- `src/app/(dashboard)/tool/[toolId]/page.tsx` o nueva ruta project-aware
- `src/app/api/tools/claude/execute/route.ts`
- `src/lib/adapters/types.ts`
- `src/lib/adapters/claude.ts`
- `src/app/api/me/conversations/route.ts`
- `src/app/api/me/conversations/[id]/route.ts`

## Soporte

- `src/lib/db/queries/projects.ts`
- `src/types/db.ts`
- `src/types/db-aliases.ts`
- `src/lib/auth/project-gate.ts`
- `src/app/api/me/active-project/route.ts`
- tests de adapter, endpoints, selector y concurrencia.

## DB

No hay migración obligatoria para el diseño recomendado:

- conversations ya tiene `project_id`;
- FK `ON DELETE SET NULL`;
- índice `(user_id, project_id)`;
- system prompts ya están por project.

Solo haría falta migración si se decide:

- volver `claude_conversations.project_id` NOT NULL;
- modelar explícitamente tabs/sesiones server-side;
- eliminar/deprecar físicamente `user_active_project`.

No se recomienda modelar tabs en DB para esta feature.

---

# Qué bugs resuelve de arrastre

| Problema | Opción A | Opción B segura | Nota |
|---|---|---|---|
| Dos tabs pisan proyecto | Sí | Sí | B solo si deja de depender del global |
| Brain/memoria/modelo cruzados | Sí | Sí | Requiere validación server |
| Respuesta B guardada en conv A | Sí | Sí | Conversación debe ser autoridad |
| Historial desaparece/cambia entre tabs | Sí | Sí | List endpoint por project id |
| `wrong_project` por otra tab | Sí | Sí | Detail valida conv, no global |
| Proyecto archivado todavía usable por execute | Sí | Sí | Validar `is_active` |
| Privado A pierde gate al elegir B | Sí, con ajuste | Sí, con ajuste | No limpiar cookie de otro tab |
| Rebote conocido por acceso vencido | No | No | Es permissions, y el hub actual ya alinea expired |
| Redirect por proyecto inválido | No existe hoy | No existe hoy | Actualmente muestra picker/error, no `/hub` |

# Cierre

- `user_active_project` es global y one-to-one por diseño.
- El cliente conoce un proyecto por tab, pero no lo transmite al server.
- El adapter usa el global para Brain, memoria, modelo, gate y conversaciones nuevas.
- En conversaciones existentes falta la validación más importante:
  `conversation.project_id === project usado`.
- La mezcla reportada es corrupción silenciosa confirmada.
- El rebote conocido `/tool/claude→/hub` es de permisos, no de proyecto.
- La base de datos ya tiene casi todo lo necesario para desacoplar.
- Recomendación: **Opción A, proyecto explícito en URL/request y conversación como autoridad**.
- Tamaño: **mediano**, con alto cuidado y pruebas de concurrencia; no requiere migración inicial.
