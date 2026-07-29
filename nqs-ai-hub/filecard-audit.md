# Audit — la card de archivo generado no aparece (intermitente)

**Fecha**: 2026-07-28
**Modo**: READ-ONLY (no se tocó código, sin migraciones, sin deploy).
**Branch**: `develop`.
**Síntoma**: Claude genera un archivo real (por code execution, no artifact de
texto), el archivo se genera y se persiste (logs: `fileIds:1`,
`artifactDetected:false`, y un `GET /api/tools/claude/files/{id}`), pero **a
veces la card de descarga NO aparece**. Claude contesta un texto corto ("Listo,
5 prompts…") y nada más. Pasa en conversaciones nuevas **y** existentes.

---

## VEREDICTO (arriba de todo)

- **Es, sobre todo, un bug de RENDER EN VIVO (timing/entrega), no de generación.**
  El archivo se genera bien; el problema es que **el `files[]` llega a la UI por
  UN SOLO evento (`done`) y ese canal es frágil**: si algo falla o se corta
  entre que el modelo termina y el `done` llega completo al cliente, el texto se
  muestra pero la card no. Por eso es intermitente y no depende de conv nueva.
- **Hay además un segundo bug latente, de PERSISTENCIA/lectura**: si la fila del
  mensaje del assistant no se guardó (o `messageId` quedó ""), el archivo se
  registra en `claude_files` con `message_id = null`, y **al recargar el
  endpoint lo saltea** → en ese caso la card **tampoco** aparece refrescando.
- **El test que desempata** (pedírselo al usuario): **¿al REFRESCAR aparece
  SIEMPRE la card?**
  - Sí siempre → el archivo quedó bien en DB con `message_id` válido; el bug es
    **solo de entrega en vivo** (el `done` se perdió o vino sin `files`).
  - A veces ni refrescando → además está el bug de **persistencia-asociación**
    (`message_id` null / mensaje no guardado).

Las 3 causas candidatas, por probabilidad:
1. **El `files[]` viaja solo en el `done` y la persistencia (etapa 2) es
   best-effort con errores tragados** → si un download/upload/insert falla
   transitoriamente, o el stream se corta antes del `done` completo, el `done`
   llega sin `files` (o no llega) → sin card. **Intermitente por naturaleza.**
2. **Reload saltea `claude_files` con `message_id` null** → card no aparece ni
   refrescando cuando el mensaje del assistant no se persistió.
3. **Captura de `file_id` estrecha** (solo `bash_code_execution_*`) → fragilidad
   estructural: si el resultado del code execution viene con otra forma de
   bloque, el `file_id` no se captura y no hay card.

---

## 1. El camino del `file_id` hasta la UI

Traza completa (todos los pasos confirmados en código):

1. **Captura** — [`client.ts` streamWithFileGeneration:352-364](nqs-ai-hub/src/lib/anthropic/client.ts:352):
   recorre `final.content` de cada turno y, para bloques
   `bash_code_execution_tool_result` → `bash_code_execution_result` →
   `bash_code_execution_output`, hace `generatedFiles.push({ fileId })`.
   Devuelve `generatedFiles`.
2. **Log etapa 1** — [`claude.ts:306-316`](nqs-ai-hub/src/lib/adapters/claude.ts:306):
   loguea `fileIds:[…]` (es el `fileIds:1` que se ve en Vercel).
3. **Persistencia del mensaje** — [`claude.ts:320-360`](nqs-ai-hub/src/lib/adapters/claude.ts:320):
   inserta `claude_messages` (user + assistant) y toma
   `messageId = assistantRow?.id ?? ""`. **Todo dentro de un `try/catch`
   best-effort** (si falla, `messageId` queda `""` y sigue).
4. **Etapa 2 (bajar/subir/registrar)** — [`claude.ts:391-445`](nqs-ai-hub/src/lib/adapters/claude.ts:391):
   por cada `fileId`: `downloadGeneratedFile` (Files API) → `uploadBuffer`
   (Storage) → `insert claude_files` con `message_id: messageId || null` →
   `persistedFiles.push({ id: row.id, name, mediaType, storagePath })`.
   **Best-effort POR ARCHIVO**: cualquier excepción se loguea y se sigue → ese
   archivo NO entra en `persistedFiles`.
5. **Return** — [`claude.ts:471-484`](nqs-ai-hub/src/lib/adapters/claude.ts:483):
   `value.files = persistedFiles`.
6. **Evento `done`** — [`execute/route.ts:118-130`](nqs-ai-hub/src/app/api/tools/claude/execute/route.ts:119):
   manda `{ type:"done", …, files: result.value.files }`. **Es el ÚNICO evento
   que transporta `files`.** No hay un evento de archivo separado.
7. **Cliente lee el `done`** — [`useClaudeChat.ts:327-350`](nqs-ai-hub/src/lib/hooks/useClaudeChat.ts:327):
   reemplaza el mensaje pendiente y setea
   `files: ev.files && ev.files.length > 0 ? ev.files : undefined`.
8. **Render** — [`ChatMessages.tsx:203-216`](nqs-ai-hub/src/components/tool/ChatMessages.tsx:203):
   `{isAi && msg.files && msg.files.length > 0 && (…<FileCard/>…)}`.

**Conclusión del camino:** la card existe **si y solo si** el mensaje en el
estado del cliente tiene `files.length > 0`, y ese `files` **solo** puede
llegar por el `done`. Punto único de falla.

---

## 2. Intermitencia (la pista: "a veces, no solo en conv nueva")

**Cómo se asocia el `files[]` al mensaje (¿hay mismatch de messageId?)**
En vivo, el `done` se asocia por el **id LOCAL del placeholder** (`pendingMsgId`),
no por el id del server:
[`useClaudeChat.ts:331-335`](nqs-ai-hub/src/lib/hooks/useClaudeChat.ts:331)
`prev.map(m => m.id === pendingMsgId ? {...} : m)`. El placeholder se agrega de
forma síncrona al enviar ([:176-191](nqs-ai-hub/src/lib/hooks/useClaudeChat.ts:176)),
así que **el mensaje SIEMPRE existe cuando llega el `done`** y los handlers de
`delta`/`status` mantienen `id === pendingMsgId` (hacen `...m`). ⇒ **El matcheo
en vivo NO se pierde por messageId**; no es un problema de "llega antes de que el
mensaje exista" ni de id temporal vs real. Esa parte está bien.

**Entonces, ¿de dónde sale la intermitencia?** De que **`ev.files` llegue vacío
o de que el `done` no llegue completo**. Tres mecanismos, todos intermitentes:

- **(a) Etapa 2 falla transitoriamente y se traga el error.** Cada archivo se
  baja de la Files API + se sube a Storage + se inserta, con `try/catch` que solo
  loguea ([claude.ts:431-443](nqs-ai-hub/src/lib/adapters/claude.ts:431)). Un
  timeout/blip contra la Files API o Storage → `persistedFiles` queda `[]` →
  `done` con `files:[]` → sin card. Es I/O de red → **falla "a veces"**, igual en
  conv nueva o existente.
- **(b) El stream se corta antes de recibir el `done` completo.** El cliente lee
  NDJSON en un `while` ([:269-353](nqs-ai-hub/src/lib/hooks/useClaudeChat.ts:269));
  si el stream cierra sin un `done` parseado, cae en **"Stream terminó sin 'done'
  explícito"** y hace `if (started) return { ok:true }`
  ([:355-356](nqs-ai-hub/src/lib/hooks/useClaudeChat.ts:355)) — **el mensaje
  conserva el texto de los `delta` pero NUNCA recibe `files`**. Como la etapa 2
  (bajar/subir/insertar el archivo) corre **entre** el fin del modelo y el envío
  del `done`, agrega latencia justo antes del `done`; cualquier corte/reintento/
  timeout en esa ventana deja "texto sí, card no". Encaja con el síntoma exacto
  ("texto corto y nada más").
- **(c) Captura estrecha del `file_id` (fragilidad estructural).** La captura
  solo maneja `bash_code_execution_tool_result`
  ([client.ts:355-364](nqs-ai-hub/src/lib/anthropic/client.ts:355)), pero el tool
  configurado es `BetaCodeExecutionTool20250825`
  ([client.ts:93](nqs-ai-hub/src/lib/anthropic/client.ts:93)) con
  **skills** pdf/docx/xlsx/pptx. Si en algún run el resultado del code execution
  viene con otra forma de bloque/salida, el `file_id` no se captura →
  `generatedFiles` vacío → sin persistencia → sin card. Varía run-a-run según
  cómo el modelo arma el archivo → **intermitente**. (En el caso reportado sí se
  capturó — `fileIds:1` — así que este mecanismo explicaría OTROS casos, no ese.)

**El caso "conv nueva"** no es un bug distinto: es el mismo canal único (`done`)
más expuesto, porque en conv nueva el `done` **también** trae el `conversationId`
que recién se crea ([:328-329](nqs-ai-hub/src/lib/hooks/useClaudeChat.ts:328)); si
el `done` se pierde, además de la card se pierde el `conversationId`. Mismo
mecanismo de fondo, consecuencia más visible.

---

## 3. Persistencia vs en vivo

**Al recargar (`loadConversation`)** — [`useClaudeChat.ts:126-157`](nqs-ai-hub/src/lib/hooks/useClaudeChat.ts:126)
pega a `GET /api/me/conversations/[id]`, que **sí** trae los `claude_files`:
[`conversations/[id]/route.ts`](nqs-ai-hub/src/app/api/me/conversations/[id]/route.ts)
los lee por `conversation_id` y los agrupa por `message_id`
(`filesByMessage`), mapeando `files: filesByMessage.get(m.id)`.

**PERO** hay un salto crítico:
```ts
for (const f of files ?? []) {
  if (!f.message_id) continue;   // ← archivos con message_id null se PIERDEN
  ...
}
```
- Si el mensaje del assistant **no se persistió** (catch en
  [claude.ts:368](nqs-ai-hub/src/lib/adapters/claude.ts:368)) →
  `messageId = ""` → el `insert claude_files` guarda `message_id: null`
  ([claude.ts:414](nqs-ai-hub/src/lib/adapters/claude.ts:414)) → **al recargar
  ese archivo NO se adjunta a ningún mensaje** → card ausente **incluso
  refrescando**. Ese es el **bug de persistencia/lectura (B)**, distinto del de
  timing en vivo (A).
- Nota fina extra: en el `done`, `id: ev.messageId ?? pendingMsgId`
  ([:335](nqs-ai-hub/src/lib/hooks/useClaudeChat.ts:335)) usa `??`, que **no
  atrapa `""`** (solo null/undefined). Con `messageId=""` el mensaje del cliente
  queda con `id: ""` — inofensivo para la card en vivo (los `files` igual se
  setean), pero es señal del mismo problema de `messageId` vacío.

**Distinción clara:**
- **(A) Render en vivo (timing):** el archivo está (o va a estar) en
  `claude_files` con `message_id` válido, pero el `done` no entregó `files` →
  card ausente en vivo, **aparece al refrescar**.
- **(B) Persistencia-asociación:** el archivo quedó en `claude_files` con
  `message_id` null (o no se guardó el mensaje) → **no aparece ni refrescando**.

El test de refresco del usuario dice cuál(es) está(n) activo(s).

---

## 4. Render de la card

- La card se renderiza **solo si `msg.files.length > 0`**
  ([ChatMessages.tsx:203](nqs-ai-hub/src/components/tool/ChatMessages.tsx:203)).
  Si el mensaje no tiene `files` en el estado del cliente, no se dibuja nada
  (no hay fallback).
- **`FileCard` se renderiza de forma SÍNCRONA desde el prop `file`** — título,
  tipo y botones salen al instante; **NO hace fetch al montar**
  ([FileCard.tsx:37-75](nqs-ai-hub/src/components/chat/FileCard.tsx:37)). El
  `GET /api/tools/claude/files/{id}` **solo** ocurre cuando el user aprieta
  "descargar" ([:131-133](nqs-ai-hub/src/components/chat/FileCard.tsx:131)) o
  abre el preview de PDF ([:93](nqs-ai-hub/src/components/chat/FileCard.tsx:93)).
- ⇒ **El `GET /files/{id}` de los logs implica que la card SÍ se mostró y el user
  la usó** (en ese request). No es la causa de la card faltante, y su fallo (403/
  404) solo afecta la descarga/preview (muestra un toast de error), no la
  aparición de la card. **La card faltante ⇒ `msg.files` vacío, aguas arriba del
  render**, nunca por un fallo de `FileCard`.

---

## 5. ¿Un bug o dos?

**Lo más probable: un mecanismo primario (A) + un bug latente secundario (B).**

- **Primario (A) — entrega en vivo por canal único.** Explica la intermitencia
  independiente del tipo de conversación: los `files` viajan solo en el `done`,
  después de una etapa 2 best-effort que se traga fallos, y el cliente tiene un
  camino de "sin done" que devuelve OK sin aplicar `files`. Es UN mecanismo con
  varias superficies de falla (2a/2b/2c). "Siempre en conv nueva" es la versión
  más severa del mismo canal (el `done` también trae el `conversationId`).
- **Secundario (B) — persistencia-asociación.** Es un bug **distinto** que solo
  se manifiesta al recargar (o cuando el mensaje no se guardó): `message_id`
  null → el reload lo saltea. No causa la falla en vivo por sí mismo, pero
  elimina la red de seguridad del refresco.

No parecen "dos bugs independientes al azar": (A) es la causa dominante del
síntoma reportado; (B) es lo que evita que el refresco lo tape siempre. El test
de refresco confirma si (B) también está activo.

---

## 6. Veredicto y recomendación (sin implementar)

**Causa más probable:** el `files[]` depende de un **único evento `done`** que
llega después de una persistencia **best-effort con errores silenciados**; una
falla transitoria en etapa 2, o un corte antes del `done` completo, deja "texto
sí / card no". Es **render en vivo (timing/entrega)**, con un **bug de
persistencia (message_id null)** que además rompe la red de seguridad del
refresco.

**Archivos/puntos a tocar (para el fix, sin tocarlos ahora):**
- [`src/lib/adapters/claude.ts`](nqs-ai-hub/src/lib/adapters/claude.ts) —
  orden de persistencia y `message_id`.
- [`src/lib/hooks/useClaudeChat.ts`](nqs-ai-hub/src/lib/hooks/useClaudeChat.ts) —
  red de seguridad al cerrar el stream.
- [`src/app/api/me/conversations/[id]/route.ts`](nqs-ai-hub/src/app/api/me/conversations/[id]/route.ts) —
  archivos con `message_id` null.
- [`src/lib/anthropic/client.ts`](nqs-ai-hub/src/lib/anthropic/client.ts) —
  captura del `file_id`.

**Cómo hacerlo ROBUSTO ante el timing (opciones, de más a menos impacto):**
1. **Red de seguridad en el cliente:** después de un `done` **o** al cerrar el
   stream sin `done` (la rama "started" de
   [:355-356](nqs-ai-hub/src/lib/hooks/useClaudeChat.ts:355)), **re-fetchear la
   conversación** (o un endpoint liviano de "files de este mensaje/conv") y
   reconciliar `files` por el id real del server. Así la card aparece aunque el
   `done` haya venido sin `files` o se haya cortado — sin depender del refresh
   manual. Es el fix que mata la intermitencia de raíz.
2. **Garantizar `message_id` siempre asociado:** que la etapa 2 no dependa de un
   `messageId` que puede quedar `""`. O bien (a) hacer el insert del mensaje del
   assistant **no** best-effort para file-gen (si falla, no seguir con
   `message_id` null), o (b) en el reload, **adjuntar los `claude_files` con
   `message_id` null al último mensaje del assistant de la conv** como fallback,
   en vez de saltearlos ([route.ts](nqs-ai-hub/src/app/api/me/conversations/[id]/route.ts)
   `if (!f.message_id) continue`).
3. **No tragar la etapa 2 en silencio:** si un archivo capturado no se pudo
   bajar/subir/registrar, emitir un evento/estado al cliente (ej. "el archivo se
   generó pero no se pudo adjuntar, reintentá") en vez de un `done` con `files`
   vacío y sin señal. Distingue "no hubo archivo" de "hubo archivo y se perdió".
4. **Ampliar la captura del `file_id`** para cubrir las variantes de resultado
   del code execution (no solo `bash_code_execution_output`), y loguear cuando
   haya un `*_tool_result` con archivo que la captura NO reconoció — para medir
   cuán seguido pasa (2c).
5. **Corregir `?? ""`:** tratar `messageId === ""` como ausente
   ([useClaudeChat.ts:335](nqs-ai-hub/src/lib/hooks/useClaudeChat.ts:335) y
   [claude.ts:360](nqs-ai-hub/src/lib/adapters/claude.ts:360)).

**Dato que acota todo (pedir al usuario):** **¿al refrescar aparece SIEMPRE la
card?** Sí → basta el fix de entrega en vivo (1) + robustez de `message_id` (2).
A veces no → hay además bug de persistencia (2b/5) que hay que atacar sí o sí.

---

## Resumen

- La card falta porque **`msg.files` llega vacío al estado del cliente**, y
  `files` viaja **solo** en el evento `done`.
- **Intermitencia = entrega frágil**: etapa 2 best-effort con errores tragados +
  camino "sin done" que devuelve OK sin `files` + captura de `file_id` estrecha.
  Independiente de conv nueva/existente.
- **Bug secundario de persistencia**: `claude_files.message_id = null` cuando el
  mensaje no se guardó → el reload lo saltea → no aparece ni refrescando.
- **`FileCard` no es culpable**: renderiza síncrono; el `GET /files/{id}` es la
  descarga que dispara el user, prueba de que la card estaba.
- **Fix robusto**: reconciliar `files` desde el server tras el `done`/cierre del
  stream (red de seguridad), y no dejar nunca `message_id` null huérfano.
