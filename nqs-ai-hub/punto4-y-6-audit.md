# Audit — puntos 4 y 6 del feedback NQS

**Fecha:** 2026-07-30  
**Modo:** READ-ONLY sobre código y datos; el único archivo creado es este informe. Sin migraciones ni deploy.  
**Branches revisadas:** `main`, `develop`, `origin/main` y `origin/develop`.

## Estado de ramas al momento del audit

Las cuatro referencias están en el mismo commit:

```text
8e591e9 feat(chat): mostrar el horario de cada mensaje
```

Por lo tanto, **no hay diferencia funcional entre `main` y `develop` para los puntos 4 y 6**. Los
estados viejos de los audits/progress deben leerse como una foto de su fecha, no como el estado actual:

- El audit del punto 6 decía que faltaba implementar el parser. Eso quedó desactualizado por
  `38d8155` (2026-07-30).
- `formato-txt-audit.md` diagnosticó el conflicto de formato antes de que se corrigiera en
  `00a447d` (2026-07-29).
- `filecard-audit.md` describe el estado previo a `73e2153`, y
  `archivo-equivocado-audit.md` el problema introducido por ese primer fix antes de
  `4e31432` + `4875555`.

## Resumen ejecutivo

### Punto 4

**Sigue pendiente.** La causa confirmada no está en el endpoint de lectura: el endpoint trae todos
los mensajes ya persistidos, ordenados por `created_at`, y `loadConversation` hace un fetch
`no-store`. El hueco está en el ciclo de vida del cliente:

1. al salir de `/tool/claude`, `ClaudeView` se desmonta y se pierde el estado local del hook; al
   volver no se reabre automáticamente la última conversación;
2. al entrar a otra conversación dentro del SPA, `loadConversation` reemplaza por completo
   `messages`;
3. el placeholder de la respuesta que estaba en vuelo desaparece;
4. si se vuelve antes de que termine Claude, la DB todavía no tiene esa vuelta (user + assistant se
   persisten recién después de terminar Anthropic), por lo que se carga una foto vieja;
5. cuando llega `delta`/`done`, el hook intenta actualizar el placeholder por su id local, pero ese
   placeholder ya no existe en el estado reemplazado;
6. no hay re-fetch del mensaje al finalizar ni polling de una ejecución pendiente. El próximo refresh
   manual sí toma la fila ya persistida.

Hay además un segundo problema: el `done` de una generación vieja hace
`setConversationId(convId)` sin comprobar qué conversación está viendo ahora el usuario. Puede dejar
`conversationId` apuntando a la conversación generadora mientras `messages` todavía contiene la otra.

### Punto 6

**La causa principal diagnosticada ya está corregida en ambas ramas.** El parser ya no descarta en
silencio un wrapper completo cuyo cuerpo no rinde `type` + `content`: desde `38d8155` rescata el
contenido y lo muestra como texto. También hay tests específicos.

El conflicto estilístico entre `FORMAT_INSTRUCTIONS` y el System Brain también está corregido en
ambas ramas desde `00a447d`: las reglas del hub se acotan a la prosa del chat y el formato interior
del artifact queda bajo control del proyecto; solo la mecánica de tags sigue siendo obligatoria.

Quedan bordes de robustez, sobre todo un artifact **abierto y además mal formado** que
`extractPartialArtifact` no pueda rescatar, pero ya no está presente el silent-drop principal del
audit anterior.

---

# PUNTO 4 — respuesta o “procesando” desaparece al volver

## 1. Recuperación al volver a la conversación

### Camino actual

En `src/components/screens/ClaudeView.tsx`:

- seleccionar una conversación llama directamente a `chat.loadConversation(id)`;
- “nueva” llama a `chat.newConversation()`;
- no existe un estado por conversación ni un registro de generaciones activas.

Además, `useClaudeChat` es local a cada instancia de `ClaudeView`. Al navegar al hub u otra ruta:

- el componente se desmonta y se pierden `messages`, `conversationId`, `isSending` y los flags
  pending/streaming;
- al volver, el hook arranca con `messages = []` y `conversationId = null`;
- no hay `sessionStorage`, `localStorage`, query param ni store global que recuerde la conversación;
- no hay un efecto de mount que llame a `loadConversation` con la última conversación.

Por eso hay dos formas confirmadas del punto 4: **remount sin auto-restore** al salir de la pantalla y
**reemplazo/race de estado** al cambiar de conversación sin salir del SPA.

En `src/lib/hooks/useClaudeChat.ts`, `loadConversation`:

- hace `GET /api/me/conversations/[id]` con `cache: "no-store"`;
- reemplaza `conversationId`;
- reemplaza **todo** `messages` por la respuesta del endpoint;
- no cancela ni identifica fetches anteriores;
- no reconcilia después con una generación que estaba en curso.

En `src/app/api/me/conversations/[id]/route.ts`, el GET:

- valida sesión, ownership, proyecto activo y gate privado;
- consulta `claude_messages` por `conversation_id`;
- no aplica `limit`;
- ordena ascendente por `created_at`;
- devuelve también imágenes, PDFs y archivos asociados.

### Veredicto: ¿el componente no re-fetchea o el fetch no trae el último?

**El endpoint sí trae el último mensaje que ya esté confirmado en DB.** No hay filtro ni límite que
quite la última respuesta. Si la respuesta estaba persistida antes de iniciar ese GET, el código
actual debe devolverla.

El caso confirmado que explica “vuelvo, no está; refresco y aparece” es una **carrera temporal**:

1. se vuelve mientras la respuesta todavía está generándose o antes de que termine su persistencia;
2. `loadConversation` trae la foto anterior;
3. la respuesta se persiste después;
4. no existe un segundo fetch/reconciliación automática.

También hay dos carreras de estado adicionales:

- Los `delta` y el `done` actualizan con `m.id === pendingMsgId`. Si `loadConversation` ya reemplazó
  el array y eliminó ese placeholder, los eventos posteriores no insertan nada.
- `done` cambia incondicionalmente `conversationId` a la conversación que generó la respuesta, aunque
  el usuario ya esté mirando otra.

Por eso, **no hay evidencia en el código de que el GET “pierda una respuesta completada”**. Si se
reproduce con una fila que se sabe persistida antes del GET, habría que capturar el orden real de
requests; el siguiente sospechoso es una respuesta tardía de otro `loadConversation`, porque tampoco
hay `AbortController`/request id para descartar cargas obsoletas.

## 2. El caso “procesando” — respuesta en vuelo

### Navegación entre conversaciones dentro de Claude

Cambiar de conversación dentro del mismo `ClaudeView` **no llama `abort()`**. El POST original sigue
vivo y normalmente el adapter termina Anthropic y persiste:

- la conversación, si era nueva;
- el mensaje del user;
- el mensaje final del assistant;
- luego emite `done`.

Lo que se pierde es la representación cliente de esa ejecución: `messages` es un único array global
para la conversación visible, no un estado indexado por conversación. Al volver antes del commit no
hay fila ni placeholder recuperable.

### Salir de la ruta, cerrar la pestaña o cortar realmente el response

Acá el comportamiento **no está garantizado server-side**:

- `execute/route.ts` ejecuta el adapter dentro de `ReadableStream.start`;
- no usa `after()`, `waitUntil`, cola ni job durable;
- no persiste una fila “pending” antes de llamar a Anthropic;
- la persistencia definitiva ocurre después de que `streamClaude` entrega el mensaje final;
- los callbacks de Anthropic escriben los deltas en el mismo controller del response.

Si el consumidor desaparece, el código no tiene una continuación durable independiente del stream.
Según cuándo se propague la desconexión, la invocación puede alcanzar a terminar o puede fallar antes
de persistir. Por eso no se puede sostener como invariantes ni “siempre se pierde” ni “el server
siempre la completa”.

Esto corrige una afirmación demasiado fuerte de `progress-chat-fix.md`: el código puede continuar en
algunos casos después de abortar el cliente, pero **no existe una garantía explícita** de finalización
server-side.

### Distinción pedida

#### (a) Respuesta completada y persistida

- Está en `claude_messages`.
- El GET la devuelve.
- Un `loadConversation` iniciado después del commit debe mostrarla.
- Si el cliente cargó antes del commit, queda stale hasta otro fetch.
- Si otra carga anterior responde más tarde, puede volver a pisar el estado porque no hay guard de
  request activa.

#### (b) Respuesta en vuelo

- Dentro del SPA, la request suele seguir, pero el placeholder/stream queda desacoplado de la
  conversación cuando `messages` es reemplazado.
- La DB no expone “procesando”: no hay fila pending ni endpoint de estado.
- Al terminar, no hay reconciliación del mensaje completo.
- Ante desconexión real, no hay garantía de persistencia durable.

### Causa raíz confirmada del punto 4

**Estado de chat monolítico + persistencia solo al final + ausencia de reconciliación por
conversación.** El bug no es que el endpoint omita la última fila; es que el cliente toma una foto
antes de que exista esa fila y pierde el vínculo con la ejecución que la producirá.

## 3. Solape con filecard / archivo-equivocado

### Qué ya se hizo

`73e2153` agregó `reconcileFilesFromServer` para recuperar cards cuando `files[]` no llegó por
`done`. `4e31432` corrigió la regresión que tomaba archivos de un turno anterior, y `4875555` agregó
señales honestas cuando se esperaba un archivo y no apareció.

Todo eso está en `main` y `develop`.

### Qué comparte con el punto 4

Comparte el **mecanismo arquitectónico**:

- re-fetch de `/api/me/conversations/[id]`;
- reconciliación del estado local con la verdad persistida;
- asociación exacta por conversación y message id;
- red de seguridad si se pierde `done`.

Pero el helper actual:

- vive dentro de `sendMessage`;
- solo reconcilia `files`;
- presupone que el mensaje target todavía existe;
- no repone el placeholder ni el mensaje completo;
- no representa estados “pending”;
- para conversación nueva sin `done`, puede no conocer todavía el `conversationId`.

### Conclusión de solape

**Sí conviene reutilizar/generalizar el patrón de re-fetch, pero no es el mismo fix.** El punto 4
necesita reconciliación de mensajes/generaciones y aislamiento por conversación. Hay que conservar
la regla aprendida en `archivo-equivocado`: nunca adoptar “el último assistant” a ciegas; usar ids
exactos o una identidad de ejecución.

### Archivos a tocar para el fix del punto 4

Mínimo para resolver navegación dentro del SPA:

- `src/lib/hooks/useClaudeChat.ts`
  - separar conversación visible de ejecuciones activas;
  - recordar/restaurar la última conversación (estado de sesión o URL) si ese es el UX esperado;
  - no dejar que un `done` viejo cambie la selección actual;
  - re-fetch/reconciliar al finalizar una ejecución cuyo placeholder fue reemplazado;
  - cancelar/ignorar respuestas de `loadConversation` obsoletas;
  - opcionalmente conservar un pending por `conversationId`.
- `src/components/screens/ClaudeView.tsx`
  - selección/nueva conversación consciente de generaciones activas;
  - disparar recuperación al volver.
- tests nuevos del hook/flujo:
  - A genera → se selecciona B → termina A → B no se pisa;
  - se vuelve a A antes/después de persistir → aparece pending o respuesta final;
  - dos cargas fuera de orden → gana la selección más reciente.

Para garantizar continuidad después de abandonar la ruta/pestaña:

- `src/app/api/tools/claude/execute/route.ts`;
- `src/lib/adapters/claude.ts`;
- `src/lib/adapters/types.ts`;
- posiblemente una representación durable de ejecución/pending o un worker/cola.

Ese segundo alcance puede requerir diseño de persistencia; **no está resuelto solo agregando
`after()` alrededor del código actual**, porque los deltas siguen acoplados al controller del
response y hoy los mensajes se insertan únicamente al final.

---

# PUNTO 6 — prompt generado que no se visualiza

## 4. Estado actual del parser

### Qué decía el audit anterior

`prompt-no-visible-audit.md` confirmó que un wrapper completo podía matchear `ARTIFACT_RE`, fallar
en `parseArtifactBody`, avanzar `lastIndex` y descartar el bloque entero. No había fallback.

### Qué cambió después

El fix **sí se aplicó** en `38d8155`:

- si `parseArtifactBody` devuelve `null`, `salvageArtifactText` intenta extraer `content` de forma
  tolerante;
- acepta namespace en `parameter`, comillas simples/dobles/sin comillas y cierre faltante dentro del
  body ya capturado;
- si no reconoce `content`, pela metadata y muestra lo restante;
- hay una última red para no devolver cero segmentos;
- `tests/parse-artifacts.test.ts` cubre falta de `type`, comillas simples, namespace, metadata y texto
  alrededor del bloque roto.

**Resultado:** el silent-drop principal del punto 6 está resuelto en `main` y `develop`.

### Matriz actual de casos

| Caso | Estado actual |
|---|---|
| Texto plano sin wrapper | Se muestra como markdown/texto. |
| Wrapper válido + `type` y `content` válidos | Card normal. |
| Wrapper completo, pero falta `type` o el parámetro usa comillas/namespace raro | Ya no se descarta: se rescata como texto. |
| Wrapper externo no reconocido (`name='artifacts'`, nombre distinto, etc.) | No se arma card; `cleanResidualTags` pela tags y deja visibles los valores. Puede verse metadata mezclada, pero no debería quedar vacío si había contenido. |
| Artifact dentro de code fence | El regex puede interpretar los tags dentro del fence como artifact; card + backticks residuales o fallback. Es un glitch de parseo, no el silent-drop original. |
| Wrapper abierto con sintaxis estándar al terminar el stream | `extractPartialArtifact` muestra card “cortado”. |
| Wrapper abierto **y además** mal formado antes de que `extractPartialArtifact` pueda reconocer `<invoke>`/`content` | Borde todavía abierto: `AssistantContent` oculta desde `<function_calls>`, el extractor puede devolver `null` y no hay fallback final para ese fragmento. |
| Wrapper cerrado con solo metadata y sin `content` usable | El fallback elimina la metadata y puede quedar vacío. No pierde un prompt reconocible, pero sí deja una respuesta sin card/contenido si el modelo nunca emitió `content`. |
| El contenido incluye literalmente `</parameter>` | `extractParam` puede cortar antes de tiempo y considerar válido un artifact truncado; al ser “válido”, no entra al salvage. |
| El contenido incluye literalmente cierres de `invoke/function_calls` | El regex externo puede cerrar antes de tiempo; el resto suele quedar como texto limpio, pero la card puede quedar truncada/dividida. |
| Múltiples menciones literales a `<function_calls>` | El conteo simple open/close puede marcar un bloque incompleto espurio y ocultar texto posterior hasta terminar/reprocesar. |

### Qué falta exactamente

No falta el fix principal. Para cerrar los bordes restantes:

1. dar fallback de texto también cuando `hasIncompleteArtifact` es true, terminó el stream y
   `extractPartialArtifact` devuelve `null`;
2. hacer tolerante `extractPartialArtifact`/`extractOpenContent` a namespace, comillas y tags
   parcialmente escritos;
3. evitar que un `</parameter>` literal dentro del prompt trunque silenciosamente una card que se
   considera válida;
4. agregar tests de code fence, wrapper externo variante, cierre literal dentro de contenido y
   artifact abierto mal formado;
5. a mediano plazo, reemplazar el pseudo-XML por tool use/structured output real si se quiere
   eliminar la fragilidad de raíz.

Verificación actual: `tests/parse-artifacts.test.ts` pasa completo (**23/23**). Esa suite cubre el
fallback principal, pero no todos los bordes listados arriba.

### Archivos a tocar si se hace ese hardening

- `src/lib/utils/parse-artifacts.ts`;
- `src/components/tool/ChatMessages.tsx`;
- `tests/parse-artifacts.test.ts`.

`ArtifactCard.tsx` no es la causa: renderiza lo que recibe. Tampoco hace falta volver a implementar
el fallback ya presente.

## 5. Cruce con FORMAT_INSTRUCTIONS vs System Brain

### Estado

El conflicto diagnosticado en `formato-txt-audit.md` **ya fue corregido** por `00a447d`, presente en
`main` y `develop`.

Ahora `FORMAT_INSTRUCTIONS` distingue:

- **mecánica obligatoria del hub:** tags del artifact y no emitir thinking;
- **estilo del chat:** títulos/tono solo para la prosa conversacional;
- **contenido del artifact:** manda el System Brain del proyecto;
- `text/plain` define la extensión/tipo, no prohíbe asteriscos, guiones ni estructura.

### Cómo se relaciona realmente con el punto 6

Son dos capas distintas:

- El conflicto viejo explicaba que el modelo generara un prompt con **formato interior incorrecto**.
- El punto 6 explicaba que el cliente **no mostrara** un prompt existente por un fallo sintáctico del
  wrapper.

Podían coexistir, pero el conflicto estilístico no era por sí mismo la causa del silent-drop. Las
instrucciones mecánicas de pseudo-XML sí mantienen una dependencia probabilística del formato que
emite el modelo: aunque estén bien redactadas, Claude todavía puede variar tags/comillas/cierres.

### Conclusión

No hay que “arreglar juntos” dos fixes pendientes: **ambos fixes principales ya están hechos**. Si se
endurece el parser, conviene conservar el scoping actual de `FORMAT_INSTRUCTIONS` y no volver a
cambiar la prioridad estilística del proyecto.

## 6. Corte por `max_tokens`

### Estado actual

No todos los modelos usan 64K:

- Haiku 4.5, Sonnet 4.6 y Sonnet 5: target **32K**;
- Opus 4.6/4.7/4.8/5: target **64K**;
- los techos declarados son 64K para Haiku y 128K para Sonnet/Opus;
- el chat usa streaming; el helper no-streaming se limita a 16K por restricción del SDK.

El `stop_reason` viaja desde Anthropic hasta el mensaje. Si es `max_tokens`, la UI muestra un aviso.
Para un artifact estándar sin cierre:

- mientras streamea: placeholder “generando…”;
- al terminar: `extractPartialArtifact`;
- se muestra una card parcial con badge de incompleto.

### ¿Se solapa con el punto 6?

**Sí como disparador de un wrapper abierto, pero no como causa principal del silent-drop histórico.**
Subir el techo reduce frecuencia, no elimina:

- respuestas que legítimamente llegan a 32K/64K;
- timeout/desconexión antes del cierre;
- un artifact abierto con sintaxis demasiado rota para el extractor parcial.

El caso estándar de corte ya está manejado. El borde “abierto + no parseable” es el solape residual
que conviene cubrir en el hardening del punto 6.

---

# 7. Mapa de estado y plan

| Punto | Causa raíz | Qué se hizo | Qué falta | Archivos a tocar | Se solapa con |
|---|---|---|---|---|---|
| 4 — volver a conversación | Hook local que se pierde al desmontar y no auto-restaura; estado único reemplazado por `loadConversation`; persistencia solo al final; eventos tardíos buscan un placeholder eliminado; sin reconciliación/pending por conversación | El endpoint ya trae todos los mensajes. Los fixes de filecard agregaron un patrón de re-fetch, pero solo para `files[]` | Restaurar la última conversación; aislar ejecución de selección visible; reconciliar mensajes al volver/finalizar; ignorar cargas obsoletas; no dejar que un `done` viejo cambie la conversación activa. Diseñar continuidad durable si debe sobrevivir salida real | `useClaudeChat.ts`, `ClaudeView.tsx`, tests; para durabilidad también `execute/route.ts`, `claude.ts`, tipos y quizá persistencia/job | Comparte endpoint/patrón de reconciliación con filecard; debe respetar asociación exacta de archivo-equivocado |
| 6 — artifact completo mal parseado | Silent-drop al fallar `type/content` | **Resuelto** por `38d8155`: salvage a texto + tests | Solo hardening de bordes: abierto + mal formado, tags literales, fences y parser estructural | `parse-artifacts.ts`, `ChatMessages.tsx`, tests | max_tokens/desconexión pueden dejar bloque abierto |
| 6 — formato System Brain | Reglas estilísticas absolutas del hub pisaban el contenido del proyecto | **Resuelto** por `00a447d`: scope chat vs artifact; el proyecto manda dentro del contenido | Validación con casos reales; no rehacer el orden/prioridad salvo evidencia nueva | Ninguno para el fix ya hecho; `claude.ts` solo si una prueba real muestra otra colisión | Relacionado con generación, no con el silent-drop del render |
| 6 — corte por longitud | Artifact sin cierre al alcanzar techo | Targets 32K/64K + `stopReason` + aviso + card parcial | Cubrir extractor parcial que devuelve `null`; el corte nunca desaparece por completo aunque suba el techo | `parse-artifacts.ts`, `ChatMessages.tsx`, tests | Borde residual del punto 6 |
| Cards de archivo | `files[]` dependía de `done`; luego un fallback podía adoptar archivo viejo | **Resuelto en ambas ramas** por `73e2153`, `4e31432`, `4875555` | No reimplementar. Mantener match exacto al generalizar reconciliación | Ninguno por este audit | Patrón reutilizable para punto 4 |

## Recomendación de orden

1. **Punto 4, primero y en un fix separado.** Es el único de los dos cuyo síntoma principal sigue
   abierto. Primero resolver correctamente navegación/reconciliación dentro del SPA; decidir aparte
   si el requisito incluye garantía durable al cerrar ruta/pestaña.
2. **Validar punto 6 actual con reproducciones reales.** El parser y el scoping ya cambiaron en
   `main`/`develop`; no diseñar otro fix sobre el código viejo descrito en los audits.
3. **Hardening residual del punto 6**, si la validación encuentra casos: fallback de artifact abierto
   no parseable + tests de tags literales/fences.

No conviene implementar 4 y 6 juntos: comparten la superficie visual del chat, pero sus causas,
riesgos y pruebas son independientes. Mezclarlos dificultaría verificar que la reconciliación del
punto 4 no introduce otra asociación incorrecta y que el parser del punto 6 no cambia el contenido.

## Qué ya está resuelto y no debe rehacerse

- Fallback anti silent-drop de artifact completo mal formado (`38d8155`).
- Tests de rescate por falta de type, comillas simples y namespace.
- Scoping de `FORMAT_INSTRUCTIONS` para que el proyecto mande dentro del artifact (`00a447d`).
- Targets 32K/64K, propagación de `stopReason`, aviso de corte y card parcial.
- Re-fetch de archivos perdidos por `done` (`73e2153`).
- Asociación exacta para no servir archivos de turnos anteriores (`4e31432`).
- Aviso/generación nueva cuando se esperaba un archivo real (`4875555`).

## Evidencia revisada

- `src/lib/hooks/useClaudeChat.ts`
- `src/components/screens/ClaudeView.tsx`
- `src/components/tool/ConversationsSidebar.tsx`
- `src/components/tool/ChatMessages.tsx`
- `src/app/api/me/conversations/[id]/route.ts`
- `src/app/api/tools/claude/execute/route.ts`
- `src/lib/adapters/claude.ts`
- `src/lib/adapters/types.ts`
- `src/lib/anthropic/client.ts`
- `src/lib/utils/parse-artifacts.ts`
- `tests/parse-artifacts.test.ts`
- `prompt-no-visible-audit.md`
- `filecard-audit.md`
- `archivo-equivocado-audit.md`
- `formato-txt-audit.md`
- `check-feedback-audit.md`
- progress de chat, artifacts y max tokens
- historial de commits y paridad de `main`/`develop`
