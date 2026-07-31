# Audit — el sandbox corre pero no produce archivo

**Fecha:** 2026-07-31  
**Modo:** READ-ONLY; único archivo nuevo: este reporte. Sin cambios de código, migraciones ni deploy.  
**Branches:** `main`, `develop`, `origin/main` y `origin/develop` coinciden en `f64a308`.

## Resumen ejecutivo

El log:

```text
contentBlockTypes:
  [text, server_tool_use, bash_code_execution_tool_result, text]
fileIds: 0
```

confirma solamente esto:

1. Claude decidió invocar code execution.
2. Anthropic devolvió un bloque de resultado para esa invocación.
3. El response no produjo ningún `file_id` capturado.

El `execute.context` y `execute.summary` del mismo caso agregan:

```text
projectContextSource: conversation
projectName: Kling
systemPromptVersion: 2
systemPromptHash: 47bbb336413a
model: claude-opus-4-7
stopReason: end_turn
artifactAttempted: false
artifactDetected: false
fileIds: 0
tokensOutput: 1721
durationMs: 62674
```

Esto confirma que:

- se usó el proyecto/Brain correcto de la conversación (`Kling`), no hubo mezcla de proyectos;
- el system efectivo sí incluía al final la regla “Para TEXTO o Markdown… artifact”;
- Claude no emitió siquiera el marcador `<function_calls>` (`artifactAttempted:false`), por lo que
  no fue un artifact mal formado ni un fallo del parser;
- el turno terminó normalmente (`end_turn`), no por `max_tokens` ni por un `pause_turn` pendiente;
- no hubo archivo real (`fileIds:0`).

La secuencia de entrega queda confirmada: **sandbox invocado → ningún archivo real → ningún intento
de artifact → respuesta textual normal**.

**No confirma qué código ejecutó ni si terminó bien.** El código actual descarta del log:

- `server_tool_use.input` — donde está el comando/código solicitado por Claude;
- `bash_code_execution_result.return_code`;
- `stdout`;
- `stderr`;
- el subtipo/error `bash_code_execution_tool_result_error.error_code`.

Por lo tanto, para el incidente puntual no se puede distinguir retrospectivamente entre:

- ejecución exitosa usada solo para validar/calcular, sin escribir archivo;
- código que intentó escribir y falló;
- error del servicio (`unavailable`, timeout, rate limit, output demasiado grande);
- archivo no producido por decisión del modelo.

La hipótesis principal —Claude usó el sandbox para contar/validar y luego respondió texto— es
**fuerte y compatible con el flujo**, pero todavía no está confirmada para ese request por falta de
telemetría del resultado.

Sí hay una causa de diseño confirmada: las instrucciones actuales dicen que `.txt`/Markdown deben
entregarse como **artifact de texto**, no como archivo real del sandbox, mientras el tool de code
execution queda disponible en todas las requests con file generation habilitado. Claude puede usarlo
para validar y luego devolver texto; no hay una regla que diga qué debe hacer si usa el sandbox para
un pedido textual.

Además, `filesMissing` considera que **cualquier** `server_tool_use` implica que “se esperaba un
archivo”. Eso no es necesariamente cierto: el modelo puede usar el tool para cálculos. Es un detector
útil de anomalías, pero semánticamente produce falsos positivos.

## Veredicto

**Causa más probable:** un gap de instrucciones para pedidos explícitos de `.txt`, combinado con
comportamiento probabilístico del modelo. El camino canónico sí está definido (`.txt` → artifact),
pero queda una zona gris porque code execution sigue disponible y no se especifica qué hacer si el
modelo lo usa durante un pedido textual. El modelo tiene permitido:

- usar artifacts para texto;
- tener code execution disponible;
- ejecutar código para validar;
- terminar con texto.

No tiene una orden inequívoca del tipo:

> “Para `.txt`/`.md`, aunque hayas usado el sandbox para validar, la ejecución no termina hasta emitir
> un artifact textual completo y válido. El texto inline y la validación no cuentan como entrega.”

**No hay evidencia de que este caso sea un fallo del parser de `file_id`.** Para el bloque
`bash_code_execution_tool_result` observado, la captura coincide exactamente con el schema del SDK.
Hay, no obstante, un gap real para otra variante (`code_execution_tool_result`) que conviene
endurecer aparte.

---

# 1. Qué hizo el sandbox

## 1.1 Qué demuestra el shape observado

El orden:

```text
text
server_tool_use
bash_code_execution_tool_result
text
```

significa:

1. Claude emitió texto.
2. Solicitó una ejecución server-side.
3. Anthropic ejecutó o intentó ejecutar el tool y devolvió el resultado.
4. Claude emitió texto después de ver el resultado.

Es compatible con el patrón:

```text
“Voy a comprobar las restricciones”
→ script para contar/validar
→ resultado
→ respuesta textual final
```

pero el array de tipos no permite demostrarlo.

## 1.2 Datos disponibles en la respuesta que hoy no se registran

El SDK instalado (`@anthropic-ai/sdk 0.98.0`) define:

```text
bash_code_execution_tool_result.content
  ├─ bash_code_execution_result
  │    ├─ return_code
  │    ├─ stdout
  │    ├─ stderr
  │    └─ content[]
  │         └─ bash_code_execution_output { file_id }
  └─ bash_code_execution_tool_result_error
       └─ error_code
```

Errores posibles tipados por el SDK:

- `invalid_tool_input`;
- `unavailable`;
- `too_many_requests`;
- `execution_time_exceeded`;
- `output_file_too_large`.

El bloque `server_tool_use` también incluye:

```text
id
name
input
```

`input` es un objeto abierto y contiene los parámetros/comando elegidos por el modelo.

## 1.3 Qué conserva el código actual

En `src/lib/anthropic/client.ts`:

- `summarizeContentBlocks` guarda para texto: tipo + cantidad de caracteres;
- para `bash_code_execution_tool_result`: tipo + cantidad de outputs de archivo;
- para `server_tool_use`: solamente `{ type: "server_tool_use" }`.

No guarda:

- código/comando;
- nombre específico del tool;
- correlación `server_tool_use.id ↔ tool_result.tool_use_id`;
- return code;
- tamaños/resúmenes de stdout/stderr;
- error code.

Luego, `src/lib/adapters/claude.ts` reduce todavía más el log de error
`"code exec: corrió el sandbox..."` a:

```text
userId
conversationId
contentBlockTypes
```

El `execute.summary` sí conserva `contentBlocks`, pero el resumen del result solo dice
`files: 0`.

## 1.4 ¿Se puede inspeccionar retroactivamente este request?

Con los logs actuales, no.

`final.content` vive en memoria durante la request y después se descarta. En DB se persiste
`response.text`, no los bloques de tool use/result. Tampoco se persiste el código ejecutado.

Para un caso futuro habría que agregar telemetría acotada en `client.ts`:

```text
anthropicMessageId
toolUseId
toolName
inputKeys
command/code length + hash
result subtype
returnCode
stdout length + tail acotado
stderr length + tail acotado
errorCode
outputFiles count
```

Recomendación de privacidad:

- por default, longitudes/hash + últimos 200–500 caracteres saneados;
- contenido del comando solo detrás de un flag específico, no reutilizar
  `DEBUG_EXECUTE_VERBOSE` indiscriminadamente;
- nunca loguear archivos ni respuestas completas.

## 1.5 Cómo interpretar el próximo caso

| Resultado | Lectura |
|---|---|
| `return_code=0`, `stderr=""`, outputs=0 y comando solo cuenta/valida | Hipótesis principal confirmada |
| `return_code!=0` o `stderr` con excepción | Falló el código; causa sandbox/script |
| result subtype `*_error` | Falló el servicio/tool antes de una ejecución normal |
| `return_code=0`, comando escribe archivo, outputs=0 | Investigar ubicación/tamaño/formato y comportamiento de Anthropic |
| outputs>0 pero `generatedFiles=0` | Bug de captura |

---

# 2. Instrucciones de generación de archivo

## 2.1 Dos mecanismos distintos

El system final contiene dos bloques del hub.

### `FORMAT_INSTRUCTIONS`

Para texto largo/autocontenido permite artifacts:

```text
text/plain (.txt)
text/markdown (.md)
application/vnd.ant.code
```

Claude debe emitir pseudo-XML con:

```text
<parameter name="content">...</parameter>
```

La UI lo convierte en `ArtifactCard` y descarga un Blob; no hay sandbox ni `file_id`.

### `FILE_GEN_INSTRUCTIONS`

Solo exige code execution real para:

- PDF;
- Word/docx;
- Excel/xlsx;
- PowerPoint/pptx.

Y termina con una regla explícita:

```text
Para TEXTO o Markdown (no binario), seguí usando el artifact de texto de siempre.
```

## 2.2 La zona gris para “dame un archivo .txt”

Para el usuario, “archivo `.txt`” significa un archivo descargable.

Para el system actual significa:

- `.txt` → artifact textual;
- binario → archivo real del sandbox.

Sin embargo, cuando el feature flag y el modelo lo permiten,
`streamWithFileGeneration` manda el tool `code_execution` en **todas** las requests. No se habilita
solo cuando el prompt pide un binario.

Así, Claude recibe simultáneamente:

1. “Para texto usá artifact”.
2. Un sandbox disponible.
3. Skills de documentos disponibles.
4. Ninguna prohibición de usar el sandbox para validar texto.

El modelo puede obedecer parcialmente:

```text
usa sandbox para verificar
→ no escribe archivo
→ devuelve texto en chat
```

Si ese texto final contiene un artifact válido, la UI igualmente debería mostrar una
`ArtifactCard` descargable aunque `fileIds=0`. El detector actual podría mostrar además el warning
`filesMissing`, porque solo mira archivos reales y no consulta `artifactDetected`.

En el caso reportado (“no apareció ninguna card”), conviene buscar el `execute.summary` del mismo
turno y revisar:

```text
artifactAttempted
artifactDetected
artifactFailReason
contentBlocks
```

- `artifactDetected=true` → debería haber ArtifactCard; si no la hubo, investigar render/parser.
- `artifactAttempted=true`, `artifactDetected=false` → el modelo intentó el camino textual pero lo
  formó mal.
- ambos false + `fileIds=0` → devolvió solo texto conversacional; coincide con la hipótesis principal.

## 2.3 La frase atribuida al “System Brain de Kling”

La frase:

```text
Para TEXTO o Markdown (no binario), seguí usando el artifact de texto de siempre.
```

no pertenece necesariamente al Brain guardado del proyecto. Es `FILE_GEN_INSTRUCTIONS`, agregado
por el hub al final del system efectivo. Por eso aparece en el preview/log del system completo de
Kling.

## 2.4 Qué falta aclarar

Hoy no se diferencia:

- “quiero contenido textual largo”;
- “quiero explícitamente un archivo `.txt` descargable”;
- “usá código solo para validar este texto”;
- “generá un binario real”.

Tampoco existe esta regla:

```text
Si invocás code execution durante un pedido explícito de archivo, la ejecución debe terminar
produciendo un output de archivo en ese mismo turno. Calcular o validar sin escribirlo no cuenta
como entrega.
```

## 2.5 Ajuste de instrucciones recomendado

Mantener el diseño actual y hacerlo inequívoco:

1. **`.txt`/`.md`**:
   - entregar siempre mediante artifact textual completo y válido;
   - no usar code execution como mecanismo de entrega;
   - si el modelo usa el sandbox para validar, esa validación **no reemplaza** al artifact: debe
     emitirlo igualmente en el mismo turno;
   - no afirmar “listo” si no emitió el artifact.
2. **PDF/docx/xlsx/pptx**:
   - usar sandbox;
   - escribir el archivo;
   - producir output/file_id;
   - si hay validaciones, hacerlas antes del write dentro de la misma ejecución.
3. **Contenido textual largo sin pedido de descarga**:
   - artifact opcional según las reglas ya existentes.

Otra opción de producto sería hacer que un pedido explícito de `.txt` genere un archivo real en
Storage. El pipeline ya puede transportar esos bytes, pero sería un **cambio deliberado de contrato**,
no el fix mínimo: hoy `.txt` está diseñado como ArtifactCard client-side. Para este bug se recomienda
primero reforzar el camino canónico existente.

---

# 3. Captura del `file_id`

## 3.1 Camino implementado

En `streamWithFileGeneration`, por cada bloque final:

```text
bash_code_execution_tool_result
  → content.type === bash_code_execution_result
  → result.content[]
  → output.type === bash_code_execution_output
  → output.file_id
```

Cada id se agrega a `generatedFiles`.

Esto coincide exactamente con:

- los tipos del SDK instalado;
- la documentación oficial de Anthropic para Bash Code Execution.

## 3.2 Para el incidente observado

El bloque fue `bash_code_execution_tool_result`.

Si dentro hubiera existido un `bash_code_execution_output`, el código actual habría capturado su
`file_id`.

Además hay una instrumentación shape-agnostic:

```text
JSON.stringify(final.content)
→ contar ocurrencias de "file_id"
→ comparar contra capturedThisTurn
```

Si encuentra más ids crudos que capturados, emite:

```text
code exec: file_id en el contenido NO capturado
```

Por lo tanto:

- `fileIds: 0`;
- bloque Bash;
- sin warning adicional de “file_id no capturado”;

es evidencia fuerte de que Anthropic no devolvió ningún `file_id`, no de que el parser lo perdió.

## 3.3 Gap real para otras variantes

El SDK y la documentación oficial también contemplan:

```text
code_execution_tool_result
  → code_execution_result
  → code_execution_output { file_id }
```

El código productivo solo captura la rama `bash_*`.

La instrumentación detectaría el string `"file_id"` y avisaría, pero **no lo agrega a
`generatedFiles`**. En esa variante habría un falso negativo real: warning diagnóstico + sin
FileCard.

Este gap conviene corregir, pero **no explica este incidente específico**, porque el bloque reportado
fue Bash.

## 3.4 Otros falsos negativos / diagnósticos incompletos

- Si el result es `bash_code_execution_tool_result_error`, `files=0` y no se loguea `error_code`.
- `countFileOutputs` solo entiende la rama Bash.
- No hay test unitario del loop privado `streamWithFileGeneration` que simule ambas variantes de
  result; el test actual verifica el resumen de bloques, no la captura end-to-end.
- El detector `filesMissing` se activa por presencia de cualquier `server_tool_use`, no por intención
  de archivo. Puede llamar “archivo faltante” a una ejecución puramente analítica.

## 3.5 Conclusión sobre captura

| Pregunta | Respuesta |
|---|---|
| ¿La captura Bash actual es correcta? | Sí |
| ¿Hay evidencia de file_id perdido en este caso? | No |
| ¿Puede haber falsos negativos con otro shape? | Sí, `code_execution_tool_result` |
| ¿El log distingue no-output de error del sandbox? | No |

---

# 4. Por qué el segundo intento sí funciona

## 4.1 No existe una condición técnica “primera vez”

No hay en el código:

- retry automático que en el segundo intento cambie instrucciones;
- modo de file generation distinto por número de intento;
- branch especial para conversación nueva/existente que obligue a crear archivo;
- recuperación de un file_id anterior.

Cada mensaje vuelve a llamar a Anthropic con el mismo tool y las mismas instrucciones base.

## 4.2 Comportamiento probabilístico + prompt más explícito

La explicación más probable:

1. Primer pedido: el modelo interpreta que debe validar/preparar el contenido.
2. Usa code execution, pero no escribe un output.
3. Devuelve texto.
4. El usuario reclama “generalo de nuevo / no llegó el archivo”.
5. Ese follow-up es más reciente, específico e inequívoco.
6. En el segundo run el modelo sí ejecuta un write/save y Anthropic devuelve `file_id`.

Los modelos no eligen tools de forma completamente determinista. Una instrucción ambigua puede
producir decisiones distintas entre dos runs.

## 4.3 Efecto del historial

El adapter persiste y reconstruye la conversación como texto:

```text
role + content
```

No persiste/replayea los bloques:

- `server_tool_use`;
- `bash_code_execution_tool_result`;
- stdout/stderr;
- outputs.

En el segundo turno Claude ve:

- su texto anterior;
- el reclamo del usuario;

pero no una representación estructurada completa de qué hizo el sandbox.

Esto refuerza la interpretación de que el segundo pedido es una instrucción nueva y más fuerte, no
la segunda fase automática de un proceso.

## 4.4 Alternativa que todavía no se puede descartar

Si el primer result tuvo:

- return code no cero;
- excepción en stderr;
- `execution_time_exceeded`;
- `output_file_too_large`;
- otro error de tool;

entonces el segundo intento podría funcionar por ser un retry exitoso de una falla transitoria.

Los logs actuales no permiten separarlo de la hipótesis de validación sin write.

## 4.5 Evidencia necesaria

Comparar primer vs segundo intento:

| Dato | Primer intento | Segundo intento |
|---|---|---|
| tool input / hash | ? | ? |
| result subtype | ? | ? |
| return code | ? | ? |
| stderr | ? | ? |
| output count | 0 | >0 |
| artifactAttempted / detected | false / false | ? |
| final text chars/snippet | disponible parcialmente | disponible parcialmente |

Si ambos tienen `return_code=0` pero solo el segundo contiene un comando de escritura/output, la
causa instruccional queda confirmada.

---

# 5. Veredicto y próximos fixes

## 5.1 Causa más probable

**Instrucción/comportamiento del modelo, no captura de file_id.**

Motivos:

1. `.txt` está explícitamente direccionado al camino artifact, no al archivo real.
2. Code execution queda disponible de todos modos.
3. No se prohíbe usarlo solo para validar.
4. No se exige emitir el artifact si, durante ese pedido textual, Claude decidió usar el sandbox.
5. La rama Bash de captura coincide con el schema oficial.
6. El segundo intento, más explícito, sí genera output.

Nivel de certeza:

- zona gris tool disponible + entrega textual: **confirmada**;
- captura Bash correcta: **confirmada**;
- proyecto/Brain incorrecto: **descartado** (`projectContextSource:"conversation"`, Kling);
- artifact mal formado o perdido por parser: **descartado** (`artifactAttempted:false`);
- corte por tokens/pausa: **descartado** (`stopReason:"end_turn"`);
- terminó sin ninguna de las dos entregas válidas (artifact o file_id): **confirmado**;
- script del incidente hizo solo validación: **probable, no demostrable con el log actual**;
- error transitorio de sandbox: **posible, no descartado**.

## 5.2 Problemas de código confirmados alrededor del diagnóstico

Aunque no parezcan la causa primaria:

1. Telemetría insuficiente del result.
2. Captura incompleta para `code_execution_tool_result` no-Bash.
3. `filesMissing` equipara “usó code tool” con “debía producir archivo”.
4. El estado `generating_file` se emite ante cualquier `server_tool_use`, aunque sea validación.
5. No hay test end-to-end de captura para ambas variantes oficiales.

## 5.3 Qué tocar si se confirma causa instruccional

### `src/lib/adapters/claude.ts`

Ajustar `FILE_GEN_INSTRUCTIONS`:

- mantener `.txt`/`.md` como artifacts;
- prohibir que code execution reemplace la entrega textual;
- exigir pseudo-XML completo aunque el sandbox se haya usado para validar;
- para binarios, exigir write/save + output en el mismo turno;
- prohibir afirmar que el archivo/artifact llegó si no se produjo la salida correspondiente.

### Posible reducción de ambigüedad

No habilitar code execution indiscriminadamente para todo mensaje. Esto requiere detectar intención y
es más riesgoso que ajustar instrucciones, pero reduciría ejecuciones de validación innecesarias.

## 5.4 Qué tocar en código

### `src/lib/anthropic/client.ts`

- resumir result subtype, return code, stdout/stderr y error code;
- capturar tanto `bash_code_execution_tool_result` como `code_execution_tool_result`;
- correlacionar tool use/result;
- agregar tests del stream file-gen.

### `src/lib/adapters/claude.ts`

- mejorar el log `filesMissing` con datos del result;
- separar:
  - tool ejecutado sin output;
  - tool error;
  - file_id no capturado;
  - archivo capturado pero no persistido.

### `src/lib/hooks/useClaudeChat.ts` / `ChatMessages.tsx`

- mostrar un mensaje distinto según la causa;
- no decir “intentó generar un archivo” si solo se detectó uso analítico del tool.

## 5.5 ¿Conviene un fallback a `.txt`?

Sí, pero no debería fingir que el sandbox generó un archivo.

### Fallback seguro recomendado

Si:

- se pidió explícitamente `.txt`/texto descargable;
- no hubo archivo real;
- no hubo artifact válido;
- `response.text` no está vacío;

mostrar una acción:

```text
Descargar esta respuesta como .txt
```

Características:

- genera un Blob client-side, igual que `ArtifactCard`;
- usa exactamente el texto visible;
- se etiqueta como fallback, no como archivo producido por Claude;
- no se inserta en `claude_files`;
- no reemplaza la advertencia de generación fallida.

### Por qué no crear automáticamente una FileCard “real”

`response.text` puede incluir:

- “Listo, te lo armé”;
- explicaciones;
- markdown conversacional;
- un artifact mal formado;
- contenido parcial.

Convertir todo silenciosamente en el archivo solicitado puede entregar datos equivocados y repetir el
problema de “mostrar algo incorrecto en vez de admitir que falló”.

### Fallback mejor, pero requiere contrato explícito

Enviar desde cliente/server un campo como:

```text
expectedOutput: "text_file" | "binary_file" | null
```

y pedir al modelo una salida estructurada separada del texto conversacional. Recién entonces se puede
sintetizar automáticamente un `.txt` con garantías razonables.

### Lo que no debe hacerse

- sintetizar PDF/Word/Excel desde texto;
- reutilizar un archivo anterior;
- tomar “el último archivo” de la conversación;
- esconder el warning porque existe texto.

---

# 6. Plan recomendado para el fix

Orden:

1. **Observabilidad:** loguear result subtype/return code/stderr/error code y tool input acotado.
2. **Instrucción:** hacer obligatorio el artifact válido para `.txt`/`.md`, incluso si Claude usó el
   sandbox para validar; reservar write + file_id para los binarios.
3. **Captura:** soportar las dos variantes oficiales de code execution.
4. **Detector:** reemplazar `usedCodeTool ⇒ filesMissing` por intención esperada + resultado.
5. **Fallback UX:** botón honesto “Descargar esta respuesta como .txt”.

Dimensionamiento:

- instrucción + telemetría: **chico**;
- captura dual + tests: **chico/mediano**;
- intención estructurada + fallback automático seguro: **mediano**.

## Archivos afectados

- `src/lib/adapters/claude.ts`
- `src/lib/anthropic/client.ts`
- `src/lib/adapters/types.ts`
- `src/app/api/tools/claude/execute/route.ts`
- `src/lib/hooks/useClaudeChat.ts`
- `src/components/tool/ChatMessages.tsx`
- `src/components/chat/ArtifactCard.tsx` o una acción de descarga textual reutilizable
- `src/lib/utils/parse-artifacts.ts`
- `tests/anthropic-client.test.ts`

## Cierre

El log no demuestra que el sandbox haya fallado ni que haya escrito un archivo. Demuestra que el tool
corrió/intentó correr y que no hubo output con `file_id`.

La captura Bash no parece ser el problema de este caso. El diseño actual deja una zona gris para
`.txt`: se instruye artifact textual, se habilita sandbox y no se define qué hacer si el modelo usa
ese sandbox solo para validar. Ese gap, más la variabilidad del modelo, explica mejor el patrón
“primer intento no / segundo intento sí”.

El fix debería endurecer instrucciones y observabilidad primero, y agregar una red de seguridad
honesta para descargar el texto visible sin inventar que el sandbox produjo algo que no produjo.
