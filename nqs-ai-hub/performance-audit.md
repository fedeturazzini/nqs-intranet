# Audit — Performance ("recontra lenta")

**Fecha**: 2026-07-28
**Modo**: READ-ONLY (no se tocó código, no se deployó).
**Branch**: `develop`.
**Síntoma**: usuarios reportan la plataforma muy lenta. Se busca separar causas
estructurales: infra/región, base de datos, API de Claude, y overhead de los
merges recientes. Más un plan de medición.

---

## VEREDICTO (las 3 causas más probables, por impacto × barato de arreglar)

| # | Causa | Impacto | Costo de fix | Dónde |
|---|-------|---------|--------------|-------|
| **1** | **Región cruzada Vercel ↔ Supabase** — funciones en `gru1` (São Paulo) y la DB (probablemente) en `us-east` (Washington). CADA query cruza el continente (~110–140ms RTT), y cada página/endpoint hace **varias**. | 🔴 Altísimo (afecta TODO: navegación + Claude + admin) | 🟢 Barato (1 línea en `vercel.json` o migrar región de Supabase) | infra |
| **2** | **Sin prompt caching del cerebro + historial sin límite** — el system prompt (cerebro del proyecto, largo) se re-procesa entero en CADA mensaje, y el historial se manda completo sin tope. | 🔴 Alto (en las respuestas de Claude: TTFT + costo) | 🟢 Barato (`cache_control` + cap de historial) | Claude |
| **3** | **Queries secuenciales en el path de execute** — ~5–6 round-trips a la DB **en serie** antes de siquiera llamar a Anthropic. Con la región cruzada (#1) se suman ~600–800ms de puro ida-y-vuelta. | 🟡 Medio (se multiplica con #1) | 🟢🟡 Barato/medio (`Promise.all` donde son independientes) | DB |

> **#1 es el sospechoso número uno y el más barato**: explica que TODO esté
> lento (no solo Claude). Confirmar la región de Supabase es el primer paso.
> **Descartados por lectura de código**: falta de índices, streaming, y el
> logging nuevo (ver detalle abajo).

---

## 1. REGIÓN (sospecha barata y gorda) — **CAUSA PRINCIPAL CANDIDATA**

**Vercel** — [`vercel.json`](nqs-ai-hub/vercel.json):
```json
{ "regions": ["gru1"], "fluid": true, ... }
```
- `gru1` = **São Paulo**. Está fijado así desde el commit inicial (`11dcfbc`),
  no es un cambio reciente. `fluid: true` (Fluid Compute) no perjudica latencia.

**Supabase** — **no es determinable desde el repo**: `supabase/config.toml`
es config local (`project_id = "nqs-ai-hub"`, sin región cloud), y
`NEXT_PUBLIC_SUPABASE_URL` está vacío en `.env.local.example`. La región real
vive en el dashboard de Supabase.

**El dato clave (logs de Vercel: un request en São Paulo, otro en Washington)**
apunta fuerte a que **la DB está en `us-east-1` (N. Virginia ≈ Washington)**
mientras las funciones corren en `gru1` (São Paulo). Es el escenario clásico de
**región cruzada**: cada query viaja SP↔Virginia (~110–140ms ida y vuelta), y
como cada página/endpoint hace **varias queries en serie**, se acumula rápido.

> ⚠️ **Verificar (1 min):** Supabase Dashboard → Project Settings → General →
> *Region*. O resolver el host de la DB (`db.<ref>.supabase.co`). Si dice
> `East US (North Virginia)` / `us-east-1` → **mismatch confirmado = causa #1**.

**Recomendación (sin aplicar):**
- **Fix barato:** alinear la región de las **funciones** a la de la **DB** (lo
  que domina es el ida-y-vuelta Vercel↔DB, que se repite muchas veces por
  request). Si Supabase está en `us-east-1`, cambiar `vercel.json` →
  `"regions": ["iad1"]` y redeploy. Una línea.
- **Fix ideal (usuarios en Argentina):** tener **ambos** cerca de Argentina —
  Vercel `gru1` (ya está) **+** migrar Supabase a `sa-east-1` (São Paulo). Así
  se minimiza tanto el hop usuario↔Vercel como Vercel↔DB. Es más pesado (implica
  migrar/restaurar el proyecto de Supabase, con downtime), por eso va como
  segunda opción.
- Regla: **las funciones tienen que estar en la misma región que la DB.** El
  costo dominante son los round-trips a la DB (muchos por request), no el hop
  del usuario (uno solo).

---

## 2. BASE DE DATOS — queries por request

### 2.1 Índices — ✅ **NO es el problema** (descartado)
Todas las columnas calientes por las que se filtra tienen índice
(`supabase/migrations/0001` + deltas):

| Columna / filtro | Índice |
|---|---|
| `tool_access(user_id)` / `(tool_id)` | `idx_tool_access_user` / `idx_tool_access_tool` (+ UNIQUE `user_id,tool_id` por el `onConflict` del upsert) |
| `claude_messages(conversation_id)` | `idx_claude_msg_conv` |
| `claude_conversations(user_id)` / `(user_id, project_id)` | `idx_claude_conv_user` / `idx_claude_conversations_user_project` |
| `system_prompts(project_id)` / `(tool_id)` / `is_active` | `idx_system_prompts_project` / `_tool` / `_active` (parcial) |
| `users(reports_to_id)` / `is_in_org` | `idx_users_reports_to` / `idx_users_in_org` |
| `projects(slug)` / `is_active` | `idx_projects_slug` / `_active` |
| `claude_files(conversation_id)` / `(user_id)` | `idx_claude_files_conv` / `_user` |

No hay que agregar índices. La lentitud de DB **no** es por falta de índices,
es por **latencia de red × cantidad de queries** (ver #1 y 2.2).

### 2.2 N+1 y queries secuenciales — el verdadero costo de DB
- **No hay N+1 clásico** (no se encontraron `await` dentro de loops ni
  `.map(async)` que peguen una query por iteración). ✅
- **Sí hay una cadena secuencial larga en el execute de Claude**
  ([`src/lib/adapters/claude.ts`](nqs-ai-hub/src/lib/adapters/claude.ts)), todo
  en serie ANTES de llamar a Anthropic:
  1. `getActiveProjectId(userId)` — [claude.ts:179](nqs-ai-hub/src/lib/adapters/claude.ts:179)
  2. `hasProjectGate(projectId)` → 1 query (`getProjectGateFields`) — [claude.ts:191](nqs-ai-hub/src/lib/adapters/claude.ts:191)
  3. `getActiveSystemAndMemoryForProject(projectId)` — [claude.ts:203](nqs-ai-hub/src/lib/adapters/claude.ts:203)
  4. ownership de la conversación — [claude.ts:240](nqs-ai-hub/src/lib/adapters/claude.ts:240)
  5. historial de mensajes — [claude.ts:260](nqs-ai-hub/src/lib/adapters/claude.ts:260)

  Son **5–6 round-trips en serie**. En región cruzada (#1) eso es **~600–800ms
  de pura red** apilados antes de que el modelo empiece a responder. Varios son
  **independientes** una vez que se tiene `projectId` (el gate, el cerebro y la
  ownership de la conv no dependen entre sí) → se pueden lanzar en `Promise.all`.
  **Recomendación (sin aplicar):** paralelizar 2–4 con `Promise.all`. Ahorra
  3–4 round-trips por mensaje; el ahorro es proporcional a la latencia de red,
  así que **#3 y #1 se potencian** (paralelizar rinde muchísimo más si la DB
  está lejos).

### 2.3 Gate de proyectos privados (merge reciente)
- `hasProjectGate(projectId)` corre **1 query** (`getProjectGateFields` → SELECT
  `gate_version` de `projects` por PK) cada vez que se toca un proyecto:
  [project-gate.ts:113-118](nqs-ai-hub/src/lib/auth/project-gate.ts:113). Es
  **liviana** (una fila por PK, indexada), pero **es un round-trip extra por
  request** que antes no existía → en región cruzada, otro cruce de continente.
- Corre en el page load de `/tool/claude` y **otra vez** en cada `execute`
  (revalida el gate). No se cachea. Como el `gate_version` cambia poco, es
  **candidato a cachear** por request (o incluir en un `Promise.all` con el
  fetch del cerebro, ya que ambos parten de `projectId`).
- Veredicto: **no es la causa principal**, pero suma. Barato de mitigar.

---

## 3. API DE CLAUDE

### 3.1 Modelo por defecto y por proyecto
- **Default = `claude-sonnet-4-6`** ([client.ts:23](nqs-ai-hub/src/lib/anthropic/client.ts:23)
  y `system_prompts.model DEFAULT` migration 0004). ✅ No es Opus.
- Las migraciones recientes de Opus (**0017 / 0018**) **solo amplían el CHECK
  constraint** para *permitir* elegir Opus; **no flipean** ningún proyecto
  existente y **no cambian el DEFAULT**. Opus es **opt-in por proyecto** (el
  admin lo elige en `/admin/prompt`).
- ⚠️ **Cuántos proyectos quedaron en Opus es dato de DB** (no se ve en el repo).
  Opus es el más lento de la familia; si varios cerebros están en Opus, explica
  respuestas lentas. **Confirmar con:**
  ```sql
  SELECT model, count(*) FROM system_prompts GROUP BY model ORDER BY 2 DESC;
  ```
  Los que estén en `claude-opus-*` son candidatos a bajar a `claude-sonnet-4-6`
  salvo que necesiten Opus de verdad.

### 3.2 max_tokens (tras el "Tokens fix")
- Es un **techo de salida**, no un piso: se paga/tarda solo lo realmente
  generado. Valores ([client.ts:33-42](nqs-ai-hub/src/lib/anthropic/client.ts:33)):
  - Sonnet 4.6: target **32K** (ceiling 128K)
  - Opus 4.6/4.7/4.8/5: target **64K** (ceiling 128K)
  - Haiku 4.5: target 32K (ceiling 64K)
- **No enlentece respuestas cortas.** Sí **habilita** respuestas largas (hasta
  32K/64K tokens), que tardan más — pero eso es correcto para el caso de uso.
  No es una causa a "arreglar"; es un techo. (El path no-streaming se clampea a
  16K por límite del SDK, pero solo lo usan tests/scripts.)

### 3.3 Streaming — ✅ **usado en todo el chat** (descartado como causa)
- El chat usa `streamClaude` → `client.messages.stream()`
  ([client.ts:263](nqs-ai-hub/src/lib/anthropic/client.ts:263)).
- El endpoint devuelve un `ReadableStream` NDJSON, haciendo `enqueue` por cada
  delta ([execute/route.ts:105](nqs-ai-hub/src/app/api/tools/claude/execute/route.ts:105)),
  y el cliente lo consume con `res.body.getReader()`
  ([useClaudeChat.ts:265](nqs-ai-hub/src/lib/hooks/useClaudeChat.ts:265)).
- Streaming real de punta a punta: el user ve tokens a medida que se generan.
  `callClaude` (no-streaming) solo lo usan tests/scripts. **No es el problema.**

### 3.4 Prompt caching — 🔴 **NO se usa. Es el mayor lever de latencia en Claude.**
- **No hay `cache_control` en ningún lado** (grep vacío en `src/`). El system
  prompt se manda como `system: fullSystem` en cada call
  ([client.ts:266](nqs-ai-hub/src/lib/anthropic/client.ts:266)) sin marca de
  caché.
- `fullSystem` = **cerebro del proyecto** (`<system_prompt>` + `<workspace_memory>`)
  + instrucciones de formato ([claude.ts:214-231](nqs-ai-hub/src/lib/adapters/claude.ts:214)).
  Es **largo y se repite idéntico** en cada mensaje de la conversación.
- **Sin caching, cada mensaje re-procesa TODO el cerebro desde cero** → más TTFT
  (time-to-first-token) y más costo de input en cada turno.
- **Agravante — historial sin tope:** los mensajes previos se cargan con
  `.order("created_at")` **sin `.limit`**
  ([claude.ts:261-264](nqs-ai-hub/src/lib/adapters/claude.ts:261)) y se mandan
  **completos**. A medida que la conversación crece, el contexto crece → cada
  turno es más lento y más caro. Se compone con la falta de caching.
- **Recomendación (sin aplicar):**
  1. Marcar el bloque `system` (cerebro) con `cache_control: { type: "ephemeral" }`
     (prompt caching de Anthropic). El cerebro es el candidato ideal: largo,
     estable, repetido. Baja TTFT y costo de input notablemente.
  2. Opcional: cachear también el tramo estable del historial.
  3. Poner un **tope al historial** (ej. últimos N turnos, o un budget de
     tokens) para que las conversaciones largas no se degraden sin techo.

---

## 4. OVERHEAD DE LOS MERGES RECIENTES

- **Logging nuevo (`src/lib/log.ts`) — ✅ despreciable (descartado).** Es
  `console.error/warn/log` + `JSON.stringify` con forma fija
  ([log.ts:emit](nqs-ai-hub/src/lib/log.ts)). **No** escribe a DB ni a un
  servicio externo; no hay I/O bloqueante. En Vercel, `console` va a stdout
  (buffered). El costo es un `JSON.stringify` por llamada → nanosegundos. No
  agrega latencia perceptible salvo que se llamara miles de veces en un loop
  caliente (no es el caso). **No es causa.**
- **Organigrama (auto-layout d3-hierarchy) — 🟢 bajo.** `computeOrgLayout`
  ([lib/org/layout.ts](nqs-ai-hub/src/lib/org/layout.ts)) es **puro y
  server-side**, Reingold-Tilford (`tree()`) O(n) sobre decenas de nodos →
  microsegundos de CPU. No se cachea, pero **no hace falta** (es barato) y
  **solo corre cuando alguien abre `/organigrama`** (no es hot path). No mueve la
  aguja. Si el org creciera a cientos de nodos, revisar; hoy no.
- **Gate de privados — 🟡 bajo/medio.** Ya cubierto en 2.3: +1 query liviana por
  endpoint que toca un proyecto. Suma en región cruzada.
- **Sin middleware nuevo por request:** no existe `middleware.ts` de Next a
  nivel root; no hay un check global corriendo en cada request en el edge.

---

## 5. FRONTEND (secundario)

- **`/admin/users`** ([admin/users/page.tsx:36](nqs-ai-hub/src/app/(dashboard)/admin/users/page.tsx:36)):
  trae **todos** los usuarios + `tool_access` activos, sin paginar. A escala de
  la empresa (decenas de users) es fine; si crece a cientos, paginar.
- **`/admin/logs/[userId]`**: agrega llamadas por período (admin-only,
  infrecuente). Bajo.
- **Historial de conversaciones** (`/api/me/conversations`): lista sin `.limit`,
  pero acotado por conversaciones-por-user. Bajo; poner límite/paginar si crece.
- **Veredicto:** el frontend **no** es la causa del "recontra lenta"
  generalizado. Los volúmenes hoy son chicos. Es higiene para más adelante.

---

## 6. PLAN DE MEDICIÓN (para dejar de suponer)

**A. Logs de Vercel (duración por endpoint):**
- Filtrar por función y mirar **Execution Duration** (p50/p95). Ordenar los
  endpoints por duración. Sospechosos: `/api/tools/claude/execute` (esperable
  alto por el modelo) vs. **páginas server** (`/hub`, `/tool/claude`, `/admin/*`)
  y `/api/me/*`. Si las **páginas** (que no llaman a Claude) también tardan
  cientos de ms → confirma que el costo es **DB/región**, no el modelo.
- Anotar la **región** que reporta cada ejecución (el dato SP vs Washington ya
  visto). Confirmar que las funciones estén realmente en `gru1`.

**B. Network del navegador (separar navegación vs Claude):**
- Abrir DevTools → Network, navegar hub → proyecto → admin. Mirar el **TTFB** de
  los documentos (navegación entre páginas) por separado del de
  `/api/tools/claude/execute`.
  - Si la **navegación** (TTFB de las páginas) ya es lenta → es **infra/región/DB**
    (#1/#3), no Claude.
  - Si **solo** `execute` es lento y la navegación es rápida → es **Claude**
    (#2/#3.1): caching + modelo.
- En `execute`, medir **time-to-first-chunk** (cuándo llega el primer byte del
  stream) vs. duración total. TTFT alto con generación normal ⇒ falta caching
  (#3.4) y/o cerebro grande; total alto ⇒ respuesta larga / Opus.

**C. Dónde agregar timing/logging (3–5 puntos, sin aplicar):**
1. **En `execute`**, envolver cada await del pre-Anthropic (proyecto, gate,
   cerebro, ownership, historial) con `Date.now()` y loguear `ms` por paso vía
   `logInfo` — muestra cuánto es red-DB vs modelo. (Ideal para validar #1/#3.)
2. **Time-to-first-chunk** de Anthropic: `ms` entre el inicio de `streamClaude`
   y el primer `onText`. Aísla TTFT del modelo (impacto de #3.4).
3. **Duración total del stream** + `usage` (input/output tokens) por mensaje: si
   los input tokens son altos y estables ⇒ cerebro sin cachear + historial largo
   (#3.4).
4. **En un page load server** (ej. `/hub` → `listToolsWithAccess`, o el layout
   → `requireAuth`), loguear `ms` de las queries → mide el costo de DB/región
   fuera de Claude (#1).
5. **En `hasProjectGate`**, loguear `ms` de `getProjectGateFields` → cuantifica
   el round-trip extra del gate (#2.3).

Con A+B ya se decide el orden real de los fixes; C confirma números.

---

## Resumen ejecutivo

- **Lo más probable y más barato: región cruzada Vercel↔Supabase (#1).** Explica
  que TODO esté lento, no solo Claude. Confirmar la región de Supabase en el
  dashboard; si es `us-east`, alinear `vercel.json` (o migrar la DB a São Paulo).
- **En Claude: falta prompt caching del cerebro + historial sin tope (#2).**
  Cada mensaje re-procesa todo el cerebro. Fix barato (`cache_control` + cap).
- **Queries secuenciales en execute (#3):** paralelizar con `Promise.all`; rinde
  el doble si además se arregla la región.
- **Descartados como causa:** falta de índices (están todos), streaming (anda
  end-to-end), y el logging nuevo (es solo `console`).
- **Bajo impacto:** organigrama (cálculo barato, no hot path), gate (query
  liviana pero suma en región cruzada), frontend sin paginar (volúmenes chicos).
- **Confirmar por dato:** región de Supabase, y `SELECT model, count(*) FROM
  system_prompts GROUP BY model` (cuántos cerebros en Opus).
