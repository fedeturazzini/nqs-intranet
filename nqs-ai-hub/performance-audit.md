# Auditoría estructural de performance

**Fecha:** 2026-07-31
**Branch:** `develop`
**Alcance:** lectura de código e infraestructura versionada. No se midió latencia
en vivo, no se cambió código ni configuración y no se desplegó.

## Veredicto priorizado

1. **Región Vercel ↔ Supabase desalineada: candidato principal, pendiente de
   confirmación.** Vercel está fijado en São Paulo (`gru1`), pero la región cloud
   de Supabase no está en el repo. Si la DB está en US, este es el mayor
   multiplicador porque cada request hace muchas llamadas a Supabase. Impacto
   potencial: muy alto. Fix: muy barato si se mueve Vercel a la región de la DB.
2. **Demasiados round-trips seriales antes de Anthropic.** Un mensaje de una
   conversación existente, pública y sin adjuntos hace aproximadamente **9
   requests a Supabase en serie** antes de llamar a Claude; un proyecto privado
   suma otro. Hay lecturas duplicadas de `users` y `projects`, además de una
   query hecha solo para diagnóstico. Impacto: alto con DB remota, medio aun con
   regiones alineadas. Fix: bajo/medio.
3. **Historial de chat sin límite.** El listado lateral está limitado a 20, pero
   abrir y ejecutar una conversación carga todos sus mensajes. En chats largos
   crecen el payload de DB, los tokens de entrada y el tiempo al primer token.
   Impacto: alto en conversaciones largas. Fix: bajo/medio.

Fix barato adicional: conservar el logging, pero quitarle sus dos esperas de DB
del camino crítico (`getProjectSummary` antes de Claude y `usage_logs` antes de
`done`).

## 1. Región

### Vercel

`vercel.json:5` declara:

```json
"regions": ["gru1"]
```

`gru1` es São Paulo. No se está usando el default de Vercel.

### Supabase

No se puede determinar la región hosted desde el repo:

- `supabase/config.toml` es configuración local y no declara región cloud.
- `.env.local.example` no contiene una URL real.
- El project ref/URL de Supabase tampoco codifica la región de forma confiable.
- La CLI no pudo listar el proyecto hosted sin una sesión utilizable.

Por rigor, el mismatch **no queda confirmado** solo con este código.

### Recomendación sin aplicar

Verificar Supabase Dashboard → Project Settings → General → Region.

- Si es `us-east-1` / North Virginia, alinear las funciones a Vercel `iad1` y
  redeployar. Es una línea y debe probarse primero.
- La alternativa ideal para usuarios argentinos es mantener Vercel en `gru1` y
  migrar Supabase a São Paulo, pero una migración de DB es más cara y riesgosa.
- Regla práctica: priorizar cercanía función ↔ DB, porque hay muchos cruces por
  request; usuario ↔ función ocurre una vez.

## 2. Queries por request

### Índices presentes

Los filtros básicos pedidos están cubiertos:

- `tool_access`: índices de `user_id`, `tool_id` y UNIQUE
  `(user_id, tool_id)`.
- `claude_messages`: `conversation_id`.
- `claude_conversations`: `user_id` y `(user_id, project_id)`.
- `system_prompts`: `tool_id`, `project_id` y parcial de `is_active`.
- `projects.id`, `users.id`: PK; `users.reports_to_id` e `is_in_org`.
- `claude_files`: `conversation_id` y `user_id`.

No aparece un scan evidente del chat causado por ausencia total de índices. Sí
faltan compuestos que acompañen filtro + orden/rango:

- `(conversation_id, created_at)` en `claude_messages`, para historial ordenado
  (`src/lib/adapters/claude.ts:274-281`).
- `(user_id, project_id, updated_at DESC)` en `claude_conversations`, para las
  últimas 20 conversaciones.
- `(action, created_at DESC)` y `(user_id, action, created_at DESC)` en
  `usage_logs`, para resumen y detalle de costos.
- Opcionales, de menor impacto actual: prompt activo por
  `(project_id, tool_id, type, version DESC)` y `claude_files(message_id)`.

Validar estos candidatos con Query Performance / `EXPLAIN (ANALYZE, BUFFERS)`.
Con pocos registros, reducir round-trips dará más retorno que sumar índices.

### N+1 confirmados

No hay un N+1 general al listar usuarios, proyectos o accesos. Los casos
encontrados son acotados:

- `wouldCreateCycle` consulta un usuario por nivel de jerarquía dentro de un
  `while` (`src/lib/db/queries/org.ts:151-170`). Solo afecta una edición admin.
- `OrgAdminPanel.saveAll()` manda un PATCH por usuario modificado, en serie
  (`src/components/admin/OrgAdminPanel.tsx:147-166`). Combinado con
  `wouldCreateCycle`, guardar N personas puede costar N requests HTTP + N ×
  profundidad de la jerarquía en queries.
- El fallback de costos consulta mensajes viejos en chunks de 200, secuenciales
  (`src/lib/db/queries/usage-costs.ts:55-85`).
- La persistencia de archivos generados itera en serie: metadata, download,
  upload e INSERT por archivo (`src/lib/adapters/claude.ts:577-628`). Afecta el
  final de respuestas con varios binarios, no navegación ni primer token.

El problema dominante es la cantidad de queries individuales serializadas, no
un N+1 masivo.

### Gate de proyectos privados

`resolveClaudeExecuteContext` trae el proyecto completo y, si es privado,
`hasProjectGate` vuelve a consultar esa misma fila para `is_private` y
`gate_version` (`claude-execute-context.ts:141-155`;
`project-gate.ts:113-118`).

También corre al listar conversaciones del proyecto y al leer/renombrar una
conversación. La query es chica e indexada por PK, pero suma un RTT por request.

Recomendación: pasar `gate_version` desde la primera lectura y resolver proyecto
y gate una sola vez por request. Cachear entre requests puede mantener una
cookie revocada hasta vencer el cache; deduplicar dentro del request es más
seguro. El gate no explica solo una plataforma muy lenta, pero amplifica una DB
remota.

## 3. Path del chat

### Antes de Anthropic

Camino normal para una conversación existente, proyecto público, empleado, sin
adjuntos ni follow-up binario:

1. `getSession`: `auth.getUser(accessToken)` + perfil de `users` — 2 requests.
2. `requireToolAccess`: vuelve a leer `users` + lee `tool_access` — 2.
3. `resolveClaudeExecuteContext`: conversación/ownership + proyecto — 2.
4. Adapter: system prompt + memoria en una query — 1.
5. Adapter: todos los mensajes previos — 1.
6. `execute.context`: resumen del proyecto solo para el log — 1.

Total aproximado: **9 requests a Supabase, secuenciales, antes de Anthropic**.

- Proyecto privado: 10.
- Follow-up potencial de archivo binario: +1 query de `claude_files`.
- Adjuntos: +1 operación de firmado en Storage.
- Conversación nueva con `projectId` explícito: aproximadamente 7.
- Un admin evita la query de `tool_access`, pero no el resto.

Antes del execute, subir adjuntos usa otro endpoint que repite sesión y permisos.
Además genera hasta 10 URLs de upload con llamadas a Storage en serie
(`src/lib/storage/claude-uploads.ts:57-69`). La firma de descarga dentro del
execute sí está batcheada.

Oportunidades, en orden:

1. Reusar el perfil de sesión para `is_active/role`; evita el segundo SELECT de
   `users`.
2. Reusar el proyecto de contexto para gate y log; evita hasta 2 queries.
3. Lanzar brain e historial en paralelo una vez fijado el proyecto.
4. Seleccionar columnas mínimas: `getProjectById` hoy usa `select("*")`.
5. Si sigue alto tras alinear regiones, evaluar una RPC/vista de preflight.

### Historial, prompt caching y modelo

- El historial se lee ordenado y sin `.limit()` (`claude.ts:274-305`) y se manda
  completo a Anthropic.
- Abrir una conversación también devuelve todos los mensajes, archivos y
  adjuntos (`api/me/conversations/[id]/route.ts:60-185`).
- El system prompt **sí tiene prompt caching** en los tres paths:
  `client.ts:418-429`, `519-527` y `599-607`. Los logs guardan cache creation y
  cache read. No corresponde señalar falta de caching como causa actual.
- El cache es ephemeral: ayuda a follow-ups cercanos, pero no limita el
  crecimiento del historial.
- El default es Sonnet 4.6; Sonnet 5 y Opus son seleccionables. El modelo real
  de cada proyecto es dato de DB. Confirmar con:

```sql
SELECT model, count(*)
FROM system_prompts
WHERE is_active AND type = 'system'
GROUP BY model
ORDER BY 2 DESC;
```

- `max_tokens` es un techo, no trabajo preasignado. No explica respuestas cortas
  lentas, aunque permite salidas largas.

Recomendación: aplicar ventana por budget de tokens y resumir lo que quede
afuera. Un límite fijo por cantidad de mensajes puede cortar mal conversaciones
con adjuntos o turnos muy desparejos.

### Streaming

Hay streaming real Anthropic → NDJSON → `getReader()`. No es una causa
estructural. La ruta no emite un chunk inicial antes del primer delta; por eso el
`Waiting/TTFB` de Network para `execute` mezcla preflight DB + TTFT de Claude.
Hace falta timing server-side para separarlos.

### Logging en el hot path

- `src/lib/log.ts` solo hace `JSON.stringify` + `console.*`; no bloquea contra DB
  ni servicios externos.
- `execute.context` sí espera `getProjectSummary` antes de Anthropic
  (`claude.ts:342-389`). El `try/catch` evita que un error rompa el chat, pero el
  caso exitoso igualmente paga el RTT.
- `logToolUsage` inserta en `usage_logs` y está await'eado antes de devolver
  `done` (`claude.ts:675-697`). No afecta primer token, pero demora el cierre.
- El UPDATE de `claude_conversations` se comenta como “no-bloqueante”, aunque
  está await'eado (`claude.ts:500-505`).

## 4. Frontend

- `/api/me/conversations` limita el listado a 20. La carga de una conversación
  concreta no pagina mensajes ni archivos.
- Al montar Claude, el sidebar vuelve a pedir ese listado. La página SSR ya
  resolvió proyectos/proyecto activo y el endpoint repite proyecto activo +
  gate; es trabajo duplicado en cada entrada a `/tool/claude`.
- `/admin/users` trae todos los perfiles, todos los accesos activos y hasta 200
  usuarios de Supabase Auth. Las tres consultas van en `Promise.all`; con
  decenas de personas es aceptable, pero necesita paginación para escala.
- `/admin/logs` trae todos los `claude.execute` del período y agrega costos en
  Node (`usage-costs.ts:97-131`). El detalle también devuelve todas las
  llamadas. Puede ser lento si `usage_logs` ya creció; conviene agregación SQL y
  paginación.
- Los tutoriales incluyen HTML/media pesados: progress 18 documenta ~89 MB
  totales, sobre todo Reframes/Weavy. Puede volver lenta una pantalla de tutorial
  concreta, no la plataforma general.
- No se encontró un componente global que al montar descargue usuarios, logs,
  proyectos y organigrama juntos. La lentitud general encaja mejor con auth/DB
  por navegación.

### Organigrama

- La página valida sesión y carga personas/cajas con dos queries en paralelo.
- `computeOrgLayout` está memoizado por `persons/deptNodes`
  (`OrgCanvas.tsx:78-81`): zoom, búsqueda y selección no lo recalculan.
- Es `force-dynamic`, por lo que no hay cache entre navegaciones.
- `teamCount` recorre descendientes por nodo y puede ser O(n²) en el peor árbol,
  pero con decenas de personas es despreciable. Revisar recién con cientos.

El organigrama no es una causa probable de lentitud general.

## 5. Plan de medición

### Vercel

1. Comparar p50/p95, cold starts y región de `/hub`, `/projects`,
   `/tool/claude`, `/organigrama`, `/api/me/conversations` y
   `/api/tools/claude/execute`.
2. Si páginas que no llaman a Anthropic ya tienen TTFB alto, priorizar
   región/auth/DB.
3. Separar duración hasta primer byte y duración total de `execute`.
4. Agregar temporalmente timings por fases, no por cada helper:
   `session`, `permission`, `context+gate`, `brain+history`, `diagnostic`,
   `anthropic_first_delta`, `anthropic_total`, `persist+usage_log`.
5. Correlacionar con input/output tokens, cache creation/read y modelo.

### Network del navegador

1. Con “Disable cache”, medir documento/RSC al navegar
   Hub → Proyectos → Claude → Organigrama.
2. Medir por separado `/api/tools/claude/execute`.
3. Interpretación:
   - navegación lenta + execute lento: región/auth/DB;
   - navegación rápida + preflight lento: queries seriales del execute;
   - preflight rápido + primer delta lento: modelo/contexto/Anthropic;
   - primer delta rápido + total alto: salida larga, tools, Opus o persistencia.
4. Probar una conversación nueva y una larga: si solo la larga empeora, confirma
   el historial sin budget.

No se inspeccionó Network en vivo en esta auditoría: el alcance pedido fue
diagnóstico estructural. El próximo paso necesita el preview/producción y una
sesión del cliente para aportar navegación vs Claude.
