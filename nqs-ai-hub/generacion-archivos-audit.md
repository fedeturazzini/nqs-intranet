# Auditoría — Generación de archivos (PDF / Word / Excel) en el chat de Claude

**Fecha:** 2026-07-11 · **Scope:** read-only (no se modificó código). **Branch:** develop.

> **TL;DR.** Hoy el chat **solo produce texto**. Los "artifacts" descargables son un
> **hack de texto** (Claude escribe pseudo-XML `<function_calls>` que la app parsea
> client-side y baja como un `Blob`). Para un **PDF/Word/Excel real** hace falta el trío que
> ya sabés: **code execution tool** (Claude corre Python en un sandbox de Anthropic y produce
> el binario) → **Files API** (se baja por `file_id`) → **persistir en Supabase Storage** (los
> file_id son efímeros). La buena noticia: **la capa de streaming, el adapter y el storage ya
> están y se reusan casi enteros**; lo nuevo es acotado. Mapa de integración al final.

---

## 1. La ruta de ejecución de Claude

**Archivo:** `src/app/api/tools/claude/execute/route.ts` (confirmado).

- **Es un route handler thin.** Valida sesión (`getSession`) + permisos (`requireToolAccess`) +
  body con Zod (`prompt`, `imagePaths?`, `conversationId?`), y **delega** todo a
  `adapter.execute(userId, params, onDelta)` (`getAdapter("claude")`, línea 81).
- **Streaming:** devuelve un **`ReadableStream` con NDJSON** (una línea JSON por evento):
  `{"type":"delta","text"}` por fragmento, `{"type":"done", …}` al cerrar, `{"type":"error"}`
  si falla. **No es SSE** — es `application/x-ndjson` crudo. El cliente lo parsea línea por
  línea (`useClaudeChat`).
- **`maxDuration = 300` + `runtime = "nodejs"`** ✅ (confirmado, líneas 28-29). Vía Fluid Compute.
- La llamada a Anthropic **no vive acá** — vive en el client/adapter (punto 2).

## 2. El adapter / cliente de Anthropic

**Archivos:** `src/lib/anthropic/client.ts` (SDK + `streamClaude`) y `src/lib/adapters/claude.ts`
(construye el request + persiste).

- **SDK oficial `@anthropic-ai/sdk` `^0.98.0`** (no fetch directo). Cliente lazy, `maxRetries:3`.
- **Cómo llama:** `client.messages.stream({ model, max_tokens, system, messages })` en
  `streamClaude` (`client.ts:135`). **Parámetros que manda hoy:**
  - `model` — **viene de DB** (`system_prompts.model` del proyecto activo); default `claude-sonnet-4-6`.
  - `max_tokens` — **8192** confirmado (`DEFAULT_MAX_TOKENS`; Haiku 4096 vía `maxTokensFor`).
  - `system` — el cerebro del proyecto (desencriptado) + memoria + `FORMAT_INSTRUCTIONS`.
  - `messages` — historia + turno actual (texto + imágenes por URL firmada).
  - **`tools`: NINGUNO.** Hoy **no se pasa ningún tool** en la llamada. ⬅️ **acá entra `code_execution`.**
- **Cómo procesa la respuesta (CLAVE):** **solo texto.** Tanto `callClaude` como `streamClaude`
  hacen `final.content.filter(b => b.type === "text")` y **descartan todos los demás bloques**
  (comentado literal: *"los otros tipos los ignoramos"*, `client.ts:99` y `147`). Usa
  `stream.on("text", …)` para deltas y `stream.finalMessage()` para el final.
  - ⚠️ **Ésta es la limitación central.** La code execution devuelve bloques anidados
    (`server_tool_use`, **`bash_code_execution_tool_result`** con `file_id` en su `.content`)
    que hoy se tirarían a la basura. **No hay lógica de parseo de bloques: asume solo texto.**
- **El adapter (`claude.ts`)** arma el request, levanta historia de `claude_messages`, firma
  URLs de imágenes, llama a `streamClaude`, y **persiste** user+assistant en `claude_messages`
  (best-effort) + loguea uso. Devuelve `{ text, tokens…, conversationId, messageId, stopReason }`.

## 3. Flujo actual de "generar archivo" (el que YA anda, para texto)

**Es 100% client-side, sin storage ni server.**

- **Cómo se arma:** `FORMAT_INSTRUCTIONS` (en `claude.ts:58-97`) le **instruye a Claude** a
  emitir pseudo-XML: `<function_calls><invoke name="artifacts">…<parameter name="content">…`.
  Eso viaja como **texto normal** en la respuesta.
- **Cómo se muestra/descarga:** el parser client-side (`parse-artifacts`, usado por
  `MarkdownRenderer` / `ChatMessages`) extrae ese bloque y lo renderiza como **`ArtifactCard`**
  con botones Ver/Copiar/Descargar. La descarga es un **Blob en memoria**:
  `ArtifactCard.tsx:215-221` → `new Blob([artifact.content])` → `URL.createObjectURL` →
  `a.download = …`. **No pasa por el server, no hay storage, no hay signed URL.**
- **Tipos soportados hoy:** `text/plain`, `text/markdown`, `application/vnd.ant.code`. Todo
  **texto**. Un pedido de PDF → Claude devuelve *un script de Python como texto* (o un artifact
  de código), nunca el binario. **Éste es exactamente el problema a resolver.**
- **Archivos del flujo:** `claude.ts` (instrucciones), `parse-artifacts` (parser client),
  `ArtifactCard.tsx` (card + descarga blob), `ChatMessages.tsx` / `MarkdownRenderer.tsx` (render).

## 4. Storage (Supabase) — estado actual

**Sí hay integración de Storage, y es reusable.**

- **1 bucket privado: `claude-uploads`.** Helper: `src/lib/storage/claude-uploads.ts`.
  - `createUploadTargets(userId, convId, mediaTypes)` → signed **upload** URLs (el backend
    fija el path `user_{userId}/{conv}/{uuid}.ext`; el cliente sube directo a Storage,
    esquivando el límite de 4.5MB de Vercel). Lo usa `POST /api/tools/claude/upload-url`.
  - `signDownloadUrls(paths, 3600)` → signed **download** URLs (1h). ⬅️ **reusable tal cual.**
  - `pathBelongsToUser(path, userId)` → guard de ownership. ⬅️ **reusable tal cual.**
- **Imágenes (estado real):** el user sube imágenes a `claude-uploads` vía signed URL; en
  `claude_messages.images` se guardan **los PATHS** (no las URLs, que expiran) y se re-firman
  on-demand al renderear. Al mandar a Anthropic se pasan como `source:{type:"url"}` (Anthropic
  las descarga server-side). El mensaje del **assistant** guarda `images: []` (vacío) —
  confirmado en `claude.ts:287`. `src/lib/utils/images.ts` también toca este bucket.
- **Lo que FALTA para archivos generados:** un **upload server-side directo** (hoy solo existe
  el flujo client-direct vía signed URL). Para archivos generados, **el server tiene los bytes**
  (los baja de la Files API) y tiene que subirlos con `db.storage.from(bucket).upload(path, buf)`
  — **helper nuevo, chico**, mismo bucket/cliente. `signDownloadUrls` + `pathBelongsToUser` se reusan.

## 5. Modelo de datos

**No hay tabla/columna para archivos generados.**

- `claude_conversations` (id, user_id, title, project_id, timestamps) y `claude_messages`
  (id, conversation_id, role, content, **`images JSONB`**, tokens_input/output, created_at) —
  `0001` + `0009`. `images` es un array de **paths de imágenes del user**. **Nada para archivos.**
- **Qué habría que agregar** (una migración nueva). Dos opciones:
  - **(A) Columna `files JSONB DEFAULT '[]'`** en `claude_messages`, guardando
    `[{ name, mediaType, storagePath, sizeBytes, anthropicFileId?, createdAt }]`. Mínimo cambio,
    simétrico a `images`.
  - **(B) Tabla `claude_files`** (id, message_id/conversation_id, user_id, name, media_type,
    storage_path, anthropic_file_id, size_bytes, created_at). Más normalizado; mejor para listar
    "todos los archivos generados" y para permisos/limpieza. **Recomendada** si se piensa en una
    galería de archivos por proyecto (se cruza con el módulo de Storage, punto 6).
  - En ambos casos: **la url NO se persiste** (expira) — se guarda el `storage_path` y se firma
    on-demand con `signDownloadUrls`, igual que hoy con imágenes.

## 6. Puntos de integración (señalados, sin implementar)

Specs de Anthropic verificados (proyecto TS, SDK oficial):

1. **Agregar el tool `code_execution`** → en `streamClaude` / `callClaude` (`client.ts:135`,`91`).
   - Pasar a `client.beta.messages.stream({ …, betas, container, tools })`.
   - Para generar **Office/PDF de verdad** conviene el camino **Agent Skills** (skills pre-armadas
     `xlsx`/`docx`/`pptx`/`pdf`): `tools:[{ type:"code_execution_20260521", name:"code_execution" }]`
     + `container:{ skills:[{ type:"anthropic", skill_id:"pptx"|"xlsx"|"docx"|"pdf", version:"latest" }] }`
     + **betas `["code-execution-2025-08-25","skills-2025-10-02"]`**. (El sandbox ya trae
       `python-docx`, `python-pptx`, `openpyxl`, `xlsxwriter`, `pypdf`, `matplotlib`, `pillow`.)
   - **Modelo:** requiere Sonnet 4.5+/Opus 4.5+. El default actual `claude-sonnet-4-6` **cumple**
     (ojo: el modelo real sale de DB — verificar que el del proyecto lo soporte).
   - **Manejar `stop_reason:"pause_turn"`**: con server-tools el loop puede pausar a las 10
     iteraciones; hay que re-enviar para continuar. Hoy no se maneja.

2. **Parsear los `file_id` de la respuesta** → nuevo bloque en `client.ts`/`claude.ts`, sobre
   `stream.finalMessage()` (que ya se usa). Iterar `final.content`, matchear
   **`bash_code_execution_tool_result`** → dentro, los outputs de tipo
   `bash_code_execution_output` traen **`file_id`**. (Hoy ese bloque se descarta en el
   `.filter(type==="text")`.)

3. **Descargar (Files API) + subir a Supabase** → server-side, en el adapter tras el parseo.
   - **Bajar:** `client.beta.files.download(file_id)` (beta **`files-api-2025-04-14`**) →
     `Buffer.from(await resp.arrayBuffer())`; metadata (nombre) con `files.retrieveMetadata`.
     **Sanitizar el filename con `path.basename()`** (traversal).
   - **Subir:** `db.storage.from("claude-uploads").upload(path, buf, { contentType })` — **helper
     nuevo** en `storage/claude-uploads.ts` (path `user_{userId}/{conv}/{uuid}.{ext}`, reusando
     la convención existente). **Los file_id de la Files API son efímeros** (tu premisa: 24h; en
     cualquier caso el container es temporal) → **hay que copiar a storage propio sí o sí**, que
     es el punto de todo esto.
   - Guardar el `storage_path` en el modelo de datos del punto 5.

4. **Mostrarle el archivo real al usuario** → extender la ruta y el hook para que el archivo
   generado viaje en el evento `done` del NDJSON (`{ files:[{ name, mediaType, path }] }`),
   y renderizarlo como una **`ArtifactCard` "real"** cuya descarga pide una **signed URL** al
   server (nuevo `GET /api/tools/claude/files/[id]` o firmar en el `done`) en vez del Blob
   en memoria. `execute/route.ts` (evento done) + `useClaudeChat` (parsear `files`) +
   `ArtifactCard`/`ChatMessages` (card con descarga por URL firmada).

5. **Cruce con el módulo de Storage pendiente y con Kling:**
   - **"Sesión 12" = deploy** (no es storage). El **módulo de Storage pendiente real** es
     **SNAPS** (screenshots — la tabla `screenshots` ya existe en `0001`, feature "Próximamente").
     SNAPS necesitaría **el mismo patrón**: bucket + upload server-side + signed download +
     registro en DB. ⇒ **el helper de upload/download y el patrón de "archivo en DB + signed
     URL" que se cree acá se comparte con SNAPS.** Conviene diseñarlo genérico (no atado a Claude).
   - **Kling/3DSky NO tocan storage hoy** (son iframes embebidos; outputs viven en Kling/3dsky).
     Si en el futuro NQS quisiera **guardar los videos de Kling**, reusaría exactamente esta
     misma infra (bucket + upload + signed URL + tabla de archivos). Hoy no hay solape real.

---

## Mapa de integración (archivos a tocar)

| Archivo | Qué se agrega | Reusa / Nuevo |
|---|---|---|
| `src/lib/anthropic/client.ts` | `beta.messages.stream` con `tools:[code_execution]` + `container.skills` + `betas`; parsear `final.content` para `bash_code_execution_tool_result` → `file_id`; manejar `pause_turn` | **Modificar** (hoy text-only) |
| `src/lib/adapters/claude.ts` | orquestar: tras la respuesta, por cada `file_id` → download Files API → upload a Storage → persistir `storage_path`; devolver `files[]` en el `ExecuteResult` | **Modificar** |
| `src/lib/storage/claude-uploads.ts` | `uploadBuffer(userId, convId, bytes, contentType)` (upload server-side directo) | **Nuevo helper** (reusa bucket/cliente/convención; `signDownloadUrls`/`pathBelongsToUser` se reusan tal cual) |
| `supabase/migrations/00NN_*.sql` | columna `claude_messages.files JSONB` **o** tabla `claude_files` (recomendada) | **Nuevo** (+ `apply-remote`) |
| `src/app/api/tools/claude/execute/route.ts` | incluir `files` en el evento NDJSON `done` | **Modificar** (mínimo) |
| `src/app/api/tools/claude/files/[id]/route.ts` | (opcional) endpoint que devuelve signed URL de descarga con guard de ownership | **Nuevo** (o firmar en el `done`) |
| `src/lib/hooks/useClaudeChat.ts` | parsear `files` del `done` y colgarlos del mensaje | **Modificar** |
| `src/components/chat/ArtifactCard.tsx` + `ChatMessages.tsx` | card de "archivo real": descarga por **signed URL** (no Blob) según `mediaType` | **Modificar** |
| `src/lib/adapters/types.ts` | agregar `files?` a `ExecuteResult` | **Modificar** (tipos) |
| `.env.local` / Anthropic | confirmar plan/limits de code execution (1.550 hs gratis/mes por org, después $0.05/h) | **Config** |

**Se reusa mucho:** streaming NDJSON, adapter, bucket `claude-uploads`, `signDownloadUrls`,
`pathBelongsToUser`, `ArtifactCard`, persistencia de mensajes, `maxDuration=300`.
**Es nuevo y acotado:** el tool `code_execution` + parseo de bloques, el `uploadBuffer`
server-side, la tabla/columna de archivos, y la card de descarga por URL firmada.

## Dimensionamiento rápido (para cotizar a Chule)

- **Backend (el grueso):** tools+skills en el request, parseo de bloques, download Files API,
  upload server-side, migración + persistencia. Riesgo medio (feature beta de Anthropic, hay que
  manejar `pause_turn` y errores de sandbox). **Es el 60-70% del esfuerzo.**
- **Frontend:** card de archivo real + descarga por signed URL + `done` con `files[]`. Bajo-medio.
- **Infra/datos:** 1 migración + (quizás) bucket nuevo o reuso de `claude-uploads`. Bajo.
- **Costo operativo nuevo:** horas de code execution de Anthropic (1.550 gratis/mes por org;
  después $0.05/h de container) — a tener en cuenta para el pricing.
- **Sinergia:** el patrón "archivo → Storage → tabla → signed URL" **se reusa para SNAPS** (y a
  futuro Kling), así que conviene venderlo/diseñarlo como **infra de archivos genérica**, no
  solo "PDF en Claude".
