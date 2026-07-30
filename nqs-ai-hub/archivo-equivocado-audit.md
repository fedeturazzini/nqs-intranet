# Audit — se sirve el archivo VIEJO en vez del recién generado

**Fecha:** 2026-07-30 · **Branch:** `main` (donde está el fix en prod) · **Modo:** READ-ONLY.
**Reporte:** en una conversación con varias generaciones, al pedir el segundo archivo llega el primero.
Caso 1: pidió "10 reframes" → recibió `EDIT_lobby_mama_camina_mochila_azul_v2.txt`.
Caso 2 (aportado durante el audit): recibió `VILLA_dinner_party_wide_v1.txt` → pidió otro ángulo →
**recibió el mismo v1** → se lo señaló → Claude regeneró y devolvió `DinnerPartyWide_v2.txt` (correcto).

## TL;DR — veredicto en dos líneas

Son **dos bugs encadenados**, no uno:

1. **Raíz:** Claude a veces **no regenera** el archivo (contesta "listo, acá va" sin volver a ejecutar
   código) → no hay `file_id` nuevo → el `done` llega **sin archivos**.
2. **Amplificador (regresión de `73e2153`):** ese hueco lo rellenan dos fallbacks *"último mensaje del
   assistant"* con el archivo de un **turno anterior** → parece que "sirvió el archivo viejo".

Sin el #2, el usuario habría visto *ningún archivo* (confuso pero honesto). Con el #2 ve **un archivo
viejo disfrazado de nuevo** — activamente engañoso, y encima **tapa el aviso** que ese mismo commit
había agregado para este caso.

---

## 1. Cómo quedó la asociación `files[]` ↔ mensaje tras el fix de ayer

El fix `73e2153` ("robustez de la card de archivo generado") tocó 7 archivos y agregó tres mecanismos:

| Mecanismo | Dónde | Qué hace |
|---|---|---|
| Red de seguridad (re-fetch) | `useClaudeChat.reconcileFilesFromServer` | si el mensaje quedó sin `files`, re-fetchea la conversación y reconcilia |
| Fallback de `message_id` null | `conversations/[id]/route.ts` | los archivos huérfanos se adjuntan al **último** mensaje del assistant |
| Aviso `filesPartialError` | `ChatMessages.tsx` + `filesFailed` en el adapter | avisa "generó un archivo pero no se pudo adjuntar" |

**Cómo decide a qué mensaje pertenece un archivo nuevo — la pregunta clave:**

- **Camino feliz (correcto):** los `files` que viajan en el evento `done` son **siempre de este turno**.
  Vienen de `response.generatedFiles` (capturados de los bloques de ESTA respuesta) → `persistedFiles`
  (insertados en esta vuelta). Acá no hay cruce posible. ✅
- **Camino de fallback (roto):** cuando el `done` **no** trae `files`, se usa el **id real del mensaje**
  (`serverMsgId`) *y, si eso no da resultado*, se cae a **"el último mensaje del assistant que tenga
  archivos"**. Ese último paso es el que engancha el archivo equivocado. ❌

O sea: la respuesta a "¿matchea por message_id real o por 'último mensaje'?" es **por los dos** — y el
segundo pisa cuando el primero no encuentra nada.

## 2. El re-fetch / reconciliación (Path A — se ve EN VIVO)

[`useClaudeChat.ts`](nqs-ai-hub/src/lib/hooks/useClaudeChat.ts), agregado por el fix:

```js
let found;
if (serverMsgId) {
  found = data.messages.find((m) => m.id === serverMsgId)?.files;
}
if (!found || found.length === 0) {          // ← es `if`, NO `else`
  for (let i = data.messages.length - 1; i >= 0; i--) {      // recorre HACIA ATRÁS
    const m = data.messages[i];
    if (m.role === "assistant" && m.files && m.files.length > 0) {
      found = m.files; break;                // ← puede ser de un turno ANTERIOR
    }
  }
}
if (!found || found.length === 0) return;
setMessages((prev) => prev.map((m) =>
  m.id === stateMsgId && (!m.files || m.files.length === 0)
    ? { ...m, files }                        // ← se pega al mensaje NUEVO
    : m));
```

Tres defectos concretos:

1. **El fallback no es un `else`.** Corre incluso cuando `serverMsgId` **se conoce** y ese mensaje
   legítimamente no tiene archivos. "Este mensaje no tiene archivo" es un **resultado válido**, no una
   señal para ir a pedir prestado el de otro.
2. **No filtra por turno.** El recorrido hacia atrás abarca *toda* la conversación, así que en cuanto
   hay una generación previa, la encuentra.
3. **No chequea si ese archivo ya se está mostrando en otro mensaje.** El mismo archivo termina
   duplicado: en su mensaje original y en el nuevo.

**Se filtra por el mensaje correcto?** El primer intento sí (`serverMsgId`). El fallback **no** —
agarra "lo último que haya en la conversación".

**Disparador:** el `done` llega sin `files` en una conversación que ya tenía archivos. Dos formas de
llegar ahí:
- **(a)** Claude no regeneró → no hay `file_id` nuevo (§3, el caso VILLA — el más frecuente).
- **(b)** se capturó el `file_id` pero la etapa 2 no lo pudo persistir (`filesFailed` > 0).

## 3. La persistencia del archivo nuevo

**El insert está bien** ([`claude.ts`](nqs-ai-hub/src/lib/adapters/claude.ts)):
```js
.from("claude_files").insert({
  conversation_id: conversationId,
  message_id: messageId || null,   // el id del mensaje del assistant de ESTE turno
  ...
```
El `messageId` es el del assistant recién insertado en esta vuelta, así que **cuando hay archivo, se
guarda con su `message_id` correcto**. No hay cruce en la escritura.

**Pero en el caso reportado no hubo insert en absoluto.** La captura del `file_id` lee **solo los
bloques de ESTA respuesta** ([`client.ts`](nqs-ai-hub/src/lib/anthropic/client.ts), rama
`bash_code_execution_tool_result`). Si Claude responde "listo, acá va" **sin volver a ejecutar código**:

```
sin ejecución → sin file_id nuevo → generatedFiles = []  →  persistedFiles = []  →  done SIN files
```

**Evidencia de que esto es lo que pasó** (caso VILLA): al reintentar, el archivo salió con **otro
nombre** (`DinnerPartyWide_v2.txt`). Si el problema fuera solo la UI sirviendo lo viejo, el reintento
habría mostrado el nombre viejo otra vez. El pipeline **sí sabe** servir el archivo nuevo — en el turno
fallido **no había archivo nuevo que servir**.
*(La disculpa de Claude — "te mandé el mismo .txt sin regenerarlo" — por sí sola no prueba nada: los
modelos le dan la razón al usuario por reflejo. Lo que sostiene la conclusión es el nombre distinto.)*

**Dos cosas del hub empujan a Claude a no regenerar:**
- **El historial se manda solo como texto.** El adapter reconstruye
  `messages.push({ role: m.role, content: m.content })` desde `claude_messages`, así que los bloques
  `server_tool_use` / `bash_code_execution_tool_result` de turnos previos **no se replayean**. Claude ve
  su propio *"Listo, va el archivo"* en el historial y puede concluir que ya está entregado.
- **`FILE_GEN_INSTRUCTIONS` lo habilita:** *"Una frase breve alcanza ('Listo, te armé el PDF.'); el
  archivo es la entrega."* → contestar una frase corta sin ejecutar nada es, para el modelo, un final
  válido.

**Y no hay ninguna señal:** `filesFailed = fileIds.length > 0 ? fileIds.length - persisted : 0`. Si no
se capturó nada, `fileIds.length` es 0 → `filesFailed` = **0** → el aviso "no se pudo adjuntar"
**tampoco se dispara**. El turno queda como un hueco muerto… que el fallback del §2 rellena mal.

## 4. Orden / "último" vs "el de este mensaje"

**Buscado explícitamente: NO hay ninguna query que tome "el último archivo".** Los únicos tres lugares
que tocan `claude_files` son:

| Lugar | Query | Riesgo |
|---|---|---|
| `files/[id]/route.ts` | por `id` (+ guard de ownership) | ninguno |
| `conversations/[id]/route.ts` | `select … .eq("conversation_id", id)` — **sin `order`, sin `limit`** | ninguno |
| `claude.ts` (insert) | insert con `message_id` | ninguno |

Los dos `order("created_at", { ascending: true })` que existen son sobre **mensajes**, no archivos.

**Conclusión del punto:** el archivo equivocado **no viene de una query mal ordenada** — viene de las
**dos heurísticas "último mensaje del assistant" en memoria** (JS), agregadas por el fix:

**Path B — server, se ve AL RECARGAR**
[`conversations/[id]/route.ts:114-136`](nqs-ai-hub/src/app/api/me/conversations/[id]/route.ts:114):
los archivos con `message_id` null se juntan como huérfanos y se adjuntan **todos** al último mensaje
del assistant. Consecuencias: un huérfano de un turno **anterior** aterriza en el mensaje **más nuevo**,
y varios huérfanos de turnos distintos **se apilan todos** en el mismo mensaje.
`claude_files.created_at` **existe** (migración 0013) pero **no se usa** para desambiguar.

## 5. Efecto colateral: el fix tapa su propio aviso

El aviso `filesPartialError` que agregó **ese mismo commit** solo se renderiza cuando el mensaje **no
tiene** archivos ([`ChatMessages.tsx`](nqs-ai-hub/src/components/tool/ChatMessages.tsx)):
```jsx
{isAi && msg.filesPartialError && (!msg.files || msg.files.length === 0) && ( … )}
```
El Path A **llena** `msg.files` con el archivo equivocado → la condición se vuelve falsa → **el aviso
honesto desaparece y lo reemplaza una card engañosa**. El commit creó el bug del archivo cruzado *y*
silenció la advertencia que él mismo había puesto para este escenario.

## 6. Veredicto

**¿Por qué se sirve el archivo viejo?** Porque el turno **no produjo ningún archivo** (Claude no
regeneró) y el fallback de la reconciliación, en vez de dejar el mensaje sin card, va a buscar "el
último archivo de la conversación" y lo presenta como si fuera el de este turno.

**¿El fix de ayer lo causó o lo dejó vivo?** **Lo causó** — es una **regresión** de `73e2153`. El
síntoma "me llega el archivo anterior" no existía antes: antes el síntoma era "no aparece la card"
(el bug que ese fix venía a resolver). El fix cambió *no mostrar nada* por *mostrar lo incorrecto*, que
es peor porque es indistinguible de un acierto. **La causa raíz (Claude no regenera) es preexistente y
sobrevivió.**

### Qué tocar

**Prioridad: primero la Capa 2 (corta el engaño), después la Capa 1 (la raíz).** Arreglar solo la Capa 2
convierte el bug en *"no aparece ningún archivo, sin explicación"* — mejor, pero todavía malo. Hacen
falta las dos.

**Capa 2 — que cada mensaje muestre EXCLUSIVAMENTE su propio archivo (chico, alto impacto)**
1. **Cliente** (`reconcileFilesFromServer`): que el fallback sea `else` (solo si `serverMsgId` es
   desconocido) y que **nunca adopte archivos que ya se muestran en otro mensaje del estado**. Lo más
   limpio: eliminar la heurística "último assistant" y confiar en `serverMsgId`; si no se conoce, **no
   adivinar**. Esto **no rompe** la red de seguridad: el caso que el fix quería cubrir (se persistió con
   su `message_id` pero el `done` se cortó) se resuelve igual por el match exacto.
2. **Server** (`conversations/[id]`): no pegar huérfanos al "último assistant" a ciegas. Usar
   `claude_files.created_at` para asociarlos al mensaje del assistant más cercano en el tiempo, o no
   adjuntarlos y atacar la causa del `message_id` null.
3. **Nunca dejar que un fallback tape un aviso honesto** (§5): mejor "no se pudo adjuntar" que una card
   con el archivo de otro mensaje.

**Capa 1 — que Claude regenere de verdad**
4. **Señal honesta cuando el turno no trae archivo:** distinguir "no se pidió archivo" de **"se esperaba
   archivo y no vino"** y avisarlo, en vez de dejar el hueco muerto que el fallback rellena mal.
5. **Ajustar `FILE_GEN_INSTRUCTIONS`:** dejar explícito que **cada pedido de archivo requiere ejecutar
   código y producir un archivo NUEVO**, y que no vale referirse a uno entregado antes. Hoy el "una frase
   breve alcanza" habilita exactamente lo contrario.
6. **Evaluar el historial text-only** (`adapters/claude.ts`): Claude no ve sus bloques de tool-use
   previos, solo su "Listo, va el archivo". Cambiarlo es más grande (hay que persistir y replayear
   bloques) — solo si 4 y 5 no alcanzan.

### Cómo confirmar cuál capa pegó en un caso puntual
Con los logs que ya existen, filtrando `execute.summary` de ese turno:
- **`fileIds: 0`** → Capa 1 (Claude no generó nada; el fallback inventó la card).
- **`fileIds: 1` + `filesFailed: 1`** → se generó pero no se persistió (el otro disparador).

### Archivos revisados
[`useClaudeChat.ts`](nqs-ai-hub/src/lib/hooks/useClaudeChat.ts) ·
[`conversations/[id]/route.ts`](nqs-ai-hub/src/app/api/me/conversations/[id]/route.ts) ·
[`adapters/claude.ts`](nqs-ai-hub/src/lib/adapters/claude.ts) ·
[`anthropic/client.ts`](nqs-ai-hub/src/lib/anthropic/client.ts) ·
[`ChatMessages.tsx`](nqs-ai-hub/src/components/tool/ChatMessages.tsx) ·
[`files/[id]/route.ts`](nqs-ai-hub/src/app/api/tools/claude/files/[id]/route.ts) ·
migración 0013 (`claude_files`) · `git show 73e2153`.
