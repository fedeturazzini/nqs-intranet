# Audit — el .txt no respeta el formato del System Brain

**Fecha:** 2026-07-29 · **Branch:** develop · **Modo:** READ-ONLY (nada modificado).
**Reporte:** en Claude.ai (Opus 4.7) el mismo prompt sale bien formateado; en el hub el
`.txt` sale mal. Hipótesis a verificar: el hub altera el texto al armar el `.txt`.

## TL;DR — veredicto

**El hub NO transforma el contenido del `.txt` de forma que rompa el formato.** Rastreado
el string completo desde la respuesta de Anthropic hasta el archivo descargado: la única
operación que se le aplica al contenido del artifact es un `.trim()` (saca espacios/saltos
al principio y final — no toca el interior). **No hay strip de markdown, no hay
normalización de saltos de línea, no hay reescritura.**

**El problema está aguas arriba, y hay un sospechoso concreto y fuerte:** las
`FORMAT_INSTRUCTIONS` que el hub le agrega al system prompt de TODOS los proyectos, al
final (con prioridad deliberada, según el propio comentario del código), imponen una
regla de formato ("títulos SIEMPRE con `## Título`, NUNCA con `**Título:**`") que puede
pisar el estilo que pide el System Brain del proyecto (ej. si el proyecto arma prompts
con títulos en negrita tipo `**HOOK:**`). Además, la convención `type="text/plain"` que
el hub le pide a Claude para los prompts largos puede estar empujando al modelo a evitar
sintaxis markdown que el System Brain sí espera. Esto explica el contraste con Claude.ai:
ahí el user no compite con estas instrucciones extra del hub.

---

## 1. Cómo se genera el .txt — DOS caminos posibles, distinguidos

### a) Vía CODE EXECUTION (Claude escribe el archivo de verdad en el sandbox)
Solo si `ENABLE_FILE_GENERATION=true` **y** el modelo del proyecto soporta code
execution (`modelSupportsCodeExecution`, [`client.ts:72`](nqs-ai-hub/src/lib/anthropic/client.ts:72)).
En este camino:
- Claude corre Python en el sandbox de Anthropic y escribe el archivo.
- El hub captura solo el `file_id` ([`client.ts:433-444`](nqs-ai-hub/src/lib/anthropic/client.ts:433)),
  lo baja de la Files API como **bytes crudos** (`downloadGeneratedFile`,
  [`client.ts:402-416`](nqs-ai-hub/src/lib/anthropic/client.ts:402): `Buffer.from(await resp.arrayBuffer())`)
  y lo sube a Storage tal cual (`uploadBuffer` en el adapter, sin pasar por ningún
  parser de texto). **Cero contacto con el contenido como string.** Se renderiza como
  `FileCard` (con botón "ver"/"copiar" para texto, agregado recientemente, que también
  lee el archivo tal cual — sin transformarlo).
- **Veredicto de este camino: el hub NO puede estar rompiendo el formato acá** — nunca
  interpreta el contenido como texto, solo mueve bytes.
- **PERO**: [`FILE_GEN_INSTRUCTIONS`](nqs-ai-hub/src/lib/adapters/claude.ts:114) le dice
  explícitamente a Claude que la generación real (code execution) es **SOLO para
  binarios** ("Para TEXTO o Markdown (no binario), seguí usando el artifact de texto de
  siempre") — o sea, un `.txt` de prompt NO debería pasar por acá salvo que Claude no
  respete esa instrucción.

### b) Vía ARTIFACT DE TEXTO (el hub arma el .txt tomando `response.text`)
El camino esperado para prompts/texto largo, según las propias instrucciones del hub.
Claude emite el contenido embebido en su respuesta de TEXTO, dentro de un bloque
pseudo-XML propio del hub (no es un mecanismo de Anthropic):
```
<function_calls><invoke name="artifacts">
<parameter name="type">text/plain</parameter>
...
<parameter name="content">EL PROMPT ACÁ</parameter>
</invoke></function_calls>
```
Acá sí hay parseo client-side (`parse-artifacts.ts`) que extrae `content` del medio del
texto — **este es el camino que hay que auditar en detalle** (sección 2).

**Cómo distinguir cuál pasó en un caso puntual:** el log `execute.summary`
(`msg:"execute.summary"`, agregado en la tarea anterior) trae `contentBlocks` — si
aparece `bash_code_execution_tool_result`, fue camino (a); si el texto trae
`<function_calls>` y `artifactDetected:true`, fue camino (b). El screenshot que motivó
esta sesión (`AMENITY_night_glow_v1.txt` con botones ver/copiar) es una `FileCard`, o sea
**camino (a)** para ESE caso puntual — pero el reporte de formato roto puede ser sobre
otro caso vía camino (b). Recomendado confirmar con ese log cuál aplica al caso reportado.

## 2. Transformaciones sospechosas — rastreadas una por una (camino b, el del artifact)

| Operación | Dónde | ¿Qué le hace al contenido del artifact? |
|---|---|---|
| Acumulación del texto streameado | [`client.ts:271,353`](nqs-ai-hub/src/lib/anthropic/client.ts:271) `textBlocks.map(b=>b.text).join("\n")` (sin file-gen) vs [`client.ts:435`](nqs-ai-hub/src/lib/anthropic/client.ts:435) `text += block.text` (con file-gen) | Si Anthropic devuelve el texto en **un solo bloque** (lo normal en el path sin tools), es un no-op. Si alguna vez lo partiera en varios bloques, el primer camino **inserta un `\n` extra** en la unión que el segundo no inserta. Riesgo bajo/no confirmado, pero es una asimetría real entre los dos accumulators. |
| Extracción del `content` del artifact | [`parse-artifacts.ts:148-154`](nqs-ai-hub/src/lib/utils/parse-artifacts.ts:148) `extractParam` — regex `<parameter name="content">([\s\S]*?)</parameter>` + **`.trim()`** | Saca espacios/saltos de línea SOLO al principio y al final del bloque completo. **No toca nada del interior** (ni saltos internos, ni asteriscos, ni guiones, ni espaciado entre líneas). |
| `cleanResidualTags` | [`parse-artifacts.ts:93-104`](nqs-ai-hub/src/lib/utils/parse-artifacts.ts:93) | Se aplica a los segmentos de **texto conversacional** (antes/después del bloque de artifact), **NO al `content` del artifact** (ese sale de `parseArtifactBody`→`extractParam`, un camino separado). Sí colapsa 3+ saltos de línea a 2 y borra tags sueltos — pero solo en la prosa del chat, no en el prompt generado. |
| Preview en pantalla ("ver") | [`ArtifactCard.tsx:191-192`](nqs-ai-hub/src/components/chat/ArtifactCard.tsx:191) `<pre>{artifact.content}</pre>` para `text/plain` | Solo CSS (monospace, wrap). No modifica el string; es nada más cómo se ve en el modal. |
| Descarga del .txt | [`ArtifactCard.tsx:213-226`](nqs-ai-hub/src/components/chat/ArtifactCard.tsx:213) `new Blob([artifact.content], {type: "text/plain;charset=utf-8"})` | **Copia literal** de `artifact.content` a un Blob. Cero transformación. |
| Copiar al portapapeles | [`ArtifactCard.tsx:199-211`](nqs-ai-hub/src/components/chat/ArtifactCard.tsx:199) `navigator.clipboard.writeText(text)` | Copia literal, mismo string. |

**No hay** strip de markdown, no hay normalización `\r\n`↔`\n` (todo el pipeline es
string JS de punta a punta, nunca toca un archivo en disco con distinta convención de
línea), no hay escape/unescape de caracteres, no hay colapso de espacios en el
`content` del artifact.

## 3. Comparación: Claude → .txt (puntos de paso, camino b)

```
Anthropic API (response.content[].text)
   │  join("\n") si streamTextOnly, o += si file-gen   [posible \n extra, no confirmado]
   ▼
response.text  (persistido TAL CUAL en claude_messages.content — DB)
   │  regex extractParam + .trim()                     [ÚNICO transform real]
   ▼
artifact.content
   │  new Blob([...])  /  clipboard.writeText(...)      [copia literal]
   ▼
.txt descargado / texto copiado
```
**Un solo punto de transformación real y deliberado: el `.trim()` de bordes.** No explica
un formato "roto" en el interior del texto (saltos de línea internos, negritas, guiones,
separadores) — eso ya viene así en `response.text`, es decir, **así lo escribió el
modelo**.

## 4. El rol del System Brain vs. FORMAT_INSTRUCTIONS — el sospechoso fuerte

En [`claude.ts:231-235`](nqs-ai-hub/src/lib/adapters/claude.ts:231):
```js
const fullSystem = fileGenEnabled
  ? `${projectSystem}\n\n${FORMAT_INSTRUCTIONS}\n\n${FILE_GEN_INSTRUCTIONS}`
  : `${projectSystem}\n\n${FORMAT_INSTRUCTIONS}`;
```
`FORMAT_INSTRUCTIONS` se concatena **DESPUÉS** del System Brain del proyecto
(`projectSystem`). El comentario del propio código lo dice explícito
([`claude.ts:60-64`](nqs-ai-hub/src/lib/adapters/claude.ts:60)): *"Van al final para que
Claude las priorice."* — es una decisión deliberada de que las instrucciones del HUB
pesen más que las del proyecto cuando hay tensión.

**Dos mecanismos concretos de conflicto, ambos dentro de `FORMAT_INSTRUCTIONS`
([`claude.ts:66-107`](nqs-ai-hub/src/lib/adapters/claude.ts:66)):**

1. **Regla de títulos, impuesta como absoluta:**
   > "REGLA DE TÍTULOS: para títulos de sección **dentro de tus respuestas**, usá SIEMPRE
   > `## Título`... **NUNCA** uses `**Título:**`..."

   Está fraseada como aplicable a "tus respuestas" en general — no acota explícitamente
   "esto es solo para el texto conversacional, no para el contenido de artifacts". Si un
   proyecto de ad studio pide prompts con secciones tipo `**HOOK:**` / `**CTA:**` (patrón
   común en templates de copy), esta regla del hub le dice a Claude que NUNCA use ese
   estilo — puede estar directamente sobreescribiendo el formato pedido por el System
   Brain del proyecto, precisamente adentro del `content` del artifact.

2. **La tipificación `text/plain` empuja al modelo hacia "texto plano" real:**
   > "Tipos soportados: - text/plain (.txt) — texto plano, prompts largos"

   Decirle a Claude "esto es texto plano" es una señal semántica fuerte para el modelo:
   tiende a asociarlo con "sin marcado", lo cual puede hacer que evite asteriscos/guiones
   como formato aunque el System Brain los pida como parte literal de la plantilla del
   prompt (no como markdown a renderizar). Esto es comportamiento del modelo influido por
   el PROMPT del hub, no una transformación de código — pero el origen sigue siendo el
   hub.

**Por qué esto explica el contraste con Claude.ai:** en Claude.ai el user interactúa
directo, sin que el hub le inyecte una capa de instrucciones de formato encima de las
suyas. Mismo prompt del proyecto, sin la competencia de `FORMAT_INSTRUCTIONS` → sale
como el proyecto espera. En el hub, el mismo pedido corre con el System Brain **más**
las reglas del hub compitiendo por prioridad (y con prioridad deliberada a favor del hub,
por el orden de concatenación) → el resultado se parece más a lo que pide el hub que a
lo que pide el proyecto.

## 5. Veredicto y recomendación (sin implementar)

- **¿El hub toca el formato al armar el .txt?** No, en el sentido de "código que
  reprocesa el string". El único transform real es un `.trim()` de bordes — no altera el
  interior del texto.
- **¿Entonces por qué sale distinto a Claude.ai?** Porque las **instrucciones que se le
  dan al modelo** (no el post-procesamiento) son distintas, y compiten con el System
  Brain del proyecto — con prioridad a favor del hub por diseño (posición al final +
  lenguaje "SIEMPRE"/"NUNCA" sin acotar el alcance a la conversación).

**Recomendación de qué mirar (para la próxima tarea, no implementada acá):**
1. **Acotar el alcance de la regla de títulos** en `FORMAT_INSTRUCTIONS` para que aplique
   solo al texto conversacional del chat, explícitamente EXCLUYENDO el `content` de los
   artifacts (que debería respetar el formato que pida el System Brain del proyecto, sea
   cual sea).
2. **Revisar la instrucción de `type="text/plain"`**: aclarar que "texto plano" es solo
   el TIPO del archivo (para la extensión `.txt`), no una instrucción de NO usar
   asteriscos/guiones/estructura si el proyecto los pide como parte de su formato.
3. Considerar si `FORMAT_INSTRUCTIONS` debería ir **antes** del System Brain (o con
   lenguaje más débil tipo "salvo que el proyecto indique otra cosa") en vez de
   "para que Claude las priorice" — invertir la prioridad a favor del proyecto.
4. Usar el log `execute.summary`/`execute.context` (de las tareas anteriores) para
   reproducir el caso reportado: confirmar si fue camino (a) o (b), y comparar el
   `systemPromptPreview` (para confirmar qué le llegó a Claude) contra el texto final.

### Archivos revisados
[`src/lib/adapters/claude.ts`](nqs-ai-hub/src/lib/adapters/claude.ts) (FORMAT_INSTRUCTIONS, FILE_GEN_INSTRUCTIONS, concatenación del system) ·
[`src/lib/anthropic/client.ts`](nqs-ai-hub/src/lib/anthropic/client.ts) (acumulación de texto, downloadGeneratedFile) ·
[`src/lib/utils/parse-artifacts.ts`](nqs-ai-hub/src/lib/utils/parse-artifacts.ts) (extractParam, cleanResidualTags) ·
[`src/components/chat/ArtifactCard.tsx`](nqs-ai-hub/src/components/chat/ArtifactCard.tsx) (downloadArtifact, copyText, preview) ·
[`src/components/chat/FileCard.tsx`](nqs-ai-hub/src/components/chat/FileCard.tsx) (camino code-execution).
