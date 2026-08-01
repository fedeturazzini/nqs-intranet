# Auditoría de fluidez y velocidad percibida de Claude

**Fecha:** 2026-08-01  
**Branch:** `develop`  
**Alcance:** lectura del código actual. No se midió latencia en vivo, no se
modificó código/configuración y no se desplegó. La región ya está alineada en
`iad1` y el execute ya reutiliza sesión/proyecto y carga cerebro + historial en
paralelo.

**Estado importante:** la ventana de historial por tokens no está presente en el
código actual. El historial completo se sigue leyendo y enviando a Anthropic;
por eso continúa siendo un factor real de TTFT en conversaciones largas.

## Veredicto ejecutivo

La UI ya resuelve bien el vacío más visible: para un envío sin adjuntos agrega el
mensaje del usuario y “Claude está pensando…” de forma optimista, antes de que
responda el servidor. El mayor margen de mejora ya no está en inventar un
spinner, sino en evitar trabajo repetido durante y después del stream:

1. **Batch de deltas + memoización de burbujas + scroll acotado** — impacto muy
   alto en respuestas largas; esfuerzo bajo/medio; **rápido para el lunes**.
   Hoy cada delta reemplaza estado, recorre todos los mensajes, vuelve a renderizar
   la lista y parsea nuevamente contenido/artifacts.
2. **Liberar el input al recibir `done` y sacar el refetch completo del camino
   bloqueante** — impacto alto; esfuerzo bajo; **rápido para el lunes**.
   Actualmente el texto ya terminó, pero el input puede seguir deshabilitado
   mientras se vuelve a descargar y reconciliar toda la conversación.
3. **Cache visual stale-while-revalidate + estado real de carga al cambiar de
   conversación** — impacto alto en navegación; esfuerzo bajo/medio; **viable
   para el lunes**. Hay cache en memoria, pero siempre se hace un GET
   `no-store`; la primera apertura queda vacía sin skeleton.
4. **Eliminar queries duplicadas al abrir Claude y al listar/cambiar proyecto** —
   impacto medio/alto real; esfuerzo bajo; **rápido para el lunes**. Las
   optimizaciones del execute no se aplicaron por completo a la página SSR ni a
   los endpoints de navegación.
5. **Permitir escribir el próximo borrador mientras Claude responde** — impacto
   alto percibido/productivo; esfuerzo bajo; **rápido para el lunes**. Debe seguir
   bloqueado el segundo envío, no la escritura.
6. **Definir una política explícita para el historial largo** — impacto muy alto
   real en chats extensos; esfuerzo medio y con trade-off de contexto. No debería
   entrar como fix silencioso: hay que acordar budget, mínimo de turnos y/o
   resumen antes de aplicarlo.

La velocidad de escritura del modelo después del primer token no puede
acelerarse desde React o Supabase. Depende principalmente del modelo y de
Anthropic. El código sí puede reducir el preflight, el tamaño del input, el
trabajo de render y las esperas artificiales alrededor de la generación.

## Recorrido actual: Enter → primera palabra → chat liberado

### Sin adjuntos

1. `ChatInput.handleSend()` llama a `onSend` y limpia texto/adjuntos
   (`ChatInput.tsx:189-225`).
2. Antes del primer `await`, `useClaudeChat.sendMessage()` agrega localmente el
   mensaje del usuario y un assistant pendiente
   (`useClaudeChat.ts:481-522`). Esto es optimistic UI real.
3. El POST hace, antes de abrir NDJSON: sesión, permiso, parseo del body y
   contexto de conversación/proyecto/gate
   (`api/tools/claude/execute/route.ts:53-137`).
4. Recién después construye el `ReadableStream`
   (`route.ts:139-201`).
5. Dentro del adapter, cerebro e historial ya se cargan correctamente en
   paralelo (`claude.ts:246-258`).
6. El server no envía un evento inicial de “preparando”: el primer evento es un
   delta de Anthropic o un status posterior de generación de archivo
   (`route.ts:146-156`; `client.ts:625-644`).
7. Cada delta actualiza estado y vuelve a pintar el texto acumulado
   (`useClaudeChat.ts:621-700`).
8. Cuando Anthropic termina, el server persiste mensajes, actualiza la
   conversación, procesa archivos y espera el log de uso antes de mandar
   `done` (`claude.ts:477-775`).
9. Al recibir `done`, el cliente vuelve a pedir la conversación completa y
   espera ese GET antes de resolver el envío y habilitar el input
   (`useClaudeChat.ts:708-767`, `806-812`).

### Con adjuntos

El mensaje optimista no aparece al apretar Enter: primero se piden URLs de upload
y se suben los archivos. Las subidas se ejecutan en serie
(`images.ts:90-138`) y la creación server-side de URLs firmadas también itera en
serie (`claude-uploads.ts:48-70`). Durante ese período solo cambia el indicador
del botón/input (`ChatInput.tsx:193-224`). Con varios adjuntos, esta espera puede
dominar la percepción previa al execute.

## 1. Tiempo hasta el primer token

### Qué ya está bien

- La región de Vercel está fijada en `iad1` (`vercel.json:5`).
- `requireToolAccess` reutiliza el perfil de sesión en el execute y evita el
  segundo SELECT de `users` (`route.ts:67-71`).
- El proyecto trae `is_private/gate_version` y el gate los reutiliza sin releer
  esa fila (`claude-execute-context.ts:146-160`).
- Cerebro e historial arrancan juntos (`claude.ts:246-258`).
- El system prompt usa prompt caching de Anthropic
  (`anthropic/client.ts:523-536`).

### Esperas reales que quedan antes de Anthropic

Para un empleado y una conversación existente, el camino normal todavía tiene
olas secuenciales:

1. auth de Supabase + perfil;
2. `tool_access`;
3. conversación/ownership;
4. proyecto;
5. cerebro + historial, en paralelo entre sí;
6. firma de adjuntos actuales, si existen;
7. consulta de archivos previos, solo en ciertos follow-ups binarios.

La query de historial no tiene `.limit()` y después todos los mensajes se agregan
al request de Anthropic (`claude.ts:248-307`). El `slice(-12)` cercano solo
alimenta la detección de intención de entrega; no limita el contexto del modelo.
En chats largos esto suma payload de Supabase, prefill de Anthropic, costo y TTFT.

El permiso y la resolución de contexto son independientes una vez obtenida la
sesión. Ejecutarlos en paralelo reduciría aproximadamente un RTT para el caso
autorizado, manteniendo ambos checks antes de Anthropic. Tiene una contrapartida:
una petición finalmente denegada podría realizar una lectura de contexto
innecesaria.

La firma de adjuntos actuales también puede arrancar junto con cerebro/historial,
porque depende del usuario y de los paths, no del resultado de esas queries. Solo
beneficia mensajes con adjuntos.

### Señal inmediata

La respuesta HTTP no se abre hasta terminar sesión, permiso y contexto. Después
de abrirse, tampoco se encola un evento `preparing`; se espera cerebro/historial
y luego a Anthropic. Aun así, el usuario no queda sin feedback porque el
“pensando…” es local y aparece inmediatamente.

Agregar un primer evento NDJSON (`accepted`/`preparing`) serviría para:

- separar TTFB de preflight interno;
- confirmar que el stream quedó conectado;
- mostrar fases más honestas (“validando contexto”, “esperando a Claude”).

No hará que Anthropic genere antes y, por sí solo, tiene menos retorno visual que
optimizar los renders.

### Falta de medición

`execute.summary.durationMs` mide la llamada completa a Anthropic, no preflight
ni primer delta (`claude.ts:426-448`, `575-611`). No hay timestamp del primer
delta. Antes de atribuir demoras al código conviene registrar:

- inicio del request;
- fin de sesión;
- fin de permiso + contexto;
- fin de cerebro + historial;
- inicio de Anthropic;
- primer delta;
- fin de Anthropic;
- `done`;
- input nuevamente habilitado.

Eso separa preflight, TTFT del proveedor, generación y post-procesamiento.

## 2. Optimistic UI

### Mensaje del usuario

**Sin adjuntos:** aparece al instante junto con un placeholder de assistant
(`useClaudeChat.ts:497-522`). No espera respuesta del server.

**Con adjuntos:** no aparece hasta que terminan todas las subidas
(`ChatInput.tsx:193-224`). Para uno o varios archivos grandes, el usuario ve el
composer ocupado pero todavía no ve su turno en el hilo.

Mejora recomendada: insertar inmediatamente una burbuja local con estado
“subiendo adjuntos” y convertirla a “pensando” al iniciar execute. Requiere
rollback claro si una subida falla.

### Input

El texto se limpia al iniciar un envío normal, pero el textarea queda
`disabled={isSending}` durante toda la respuesta
(`ChatInput.tsx:418-443`). Eso evita dobles envíos, pero también impide preparar
el siguiente mensaje.

Mejora rápida: mantener el textarea editable y conservar el botón como
“detener”/envío bloqueado hasta finalizar. Es velocidad percibida y productividad,
no menor latencia de backend.

### Finalización artificialmente larga

Después de `done`, `reconcileFromServer()` descarga toda la conversación y se
espera antes de salir de `sendMessage` (`useClaudeChat.ts:762-767`). El estado
`isSending` recién vuelve a `false` en el `finally` posterior
(`useClaudeChat.ts:806-812`).

El evento `done` ya incluye texto final, message id, horario, tokens y archivos.
Para el caso normal, el GET completo es redundante. Puede:

- correr en background sin bloquear el input;
- limitarse a casos de persistencia/archivo incierto;
- reemplazarse por actualización puntual con los datos de `done`.

Esta es una de las mejoras rápidas con mejor retorno.

## 3. Fluidez del streaming

### Estado y re-renders

Por cada delta:

- se concatena `acc`;
- se crea un estado de sesión nuevo;
- se hace `.map()` sobre todos los mensajes para encontrar el assistant activo
  (`useClaudeChat.ts:663-679`);
- `ClaudeView` y `ChatMessages` vuelven a renderizar;
- `MessageBubble` no está memoizado (`ChatMessages.tsx:120-149`).

Los objetos de mensajes terminados sí conservan referencia durante el `.map()`,
por lo que envolver `MessageBubble` en `memo` permitiría saltar casi todo el
trabajo de mensajes viejos con un cambio acotado.

### Markdown y artifacts

`AssistantContent` ejecuta detección de tags y
`parseMessageWithArtifacts(visible)` en cada render
(`ChatMessages.tsx:386-430`). Como todas las burbujas se vuelven a invocar, el
parseo de artifacts de mensajes viejos también se repite.

`MarkdownRenderer` está memoizado, por lo que los markdowns terminados evitan
reprocesar `react-markdown` si su string no cambió
(`MarkdownRenderer.tsx:14-49`). El mensaje activo no obtiene ese beneficio:
cada delta cambia el string y vuelve a parsear todo el texto acumulado, incluido
GFM y syntax highlighting. En respuestas largas, el costo acumulado tiende a
crecer más que linealmente.

Mejoras, de menor a mayor:

1. agrupar deltas y publicar estado como máximo una vez por animation frame o
   cada 30–50 ms;
2. memoizar `MessageBubble`/`AssistantContent` para aislar el mensaje activo;
3. durante streaming, diferir `rehype-highlight` y hacer el render completo al
   final;
4. para respuestas enormes, renderizar el tramo estable y el tramo en curso por
   separado.

Las dos primeras son candidatas claras para el lunes.

### Auto-scroll

Cada cambio de `messages` dispara `scrollIntoView`
(`ChatMessages.tsx:94-107`). Durante streaming eso puede forzar layout por cada
delta. La lógica que respeta al usuario cuando scrollea hacia arriba está bien,
pero el scroll adherido al fondo debería compartir el mismo batch/rAF que el
render del texto.

### NDJSON

El reader incremental mantiene buffer, separa por salto de línea y parsea cada
evento correctamente (`useClaudeChat.ts:621-661`). El JSON no es el cuello
estructural; la frecuencia de commits React posterior sí puede serlo.

## 4. Navegación y carga

### Entrada a Claude

La página SSR todavía repite trabajo que la optimización del execute ya evitó:

- `requireAuth()` resuelve sesión, pero `canUseTool()` se llama sin el hint de
  sesión y vuelve a consultar `users` (`tool/[toolId]/page.tsx:36-45`;
  `permissions.ts:43-84`).
- `getActiveProjectForUser()` hace primero `user_active_project` y después
  `projects` (`projects.ts:138-145`).
- Tras cargar el proyecto activo, `hasProjectGate(activeProject.id)` puede releer
  sus campos de gate (`tool/[toolId]/page.tsx:52-69`;
  `project-gate.ts:122-130`), aunque esos datos ya están en memoria.

Pasar la sesión como hint, resolver el proyecto activo con una relación/query y
validar la cookie con `is_private/gate_version` precargados elimina lecturas sin
cambiar seguridad. Es mejora real de navegación y de esfuerzo bajo.

El acceso desde el Hub usa `router.push` sin prefetch explícito
(`HubScreen.tsx:221-231`). Prefetchear el route/chunk de Claude al hover o en idle
puede mejorar la transición, especialmente porque el cliente del chat importa
markdown, highlighting y compresión de imágenes.

Desde la pantalla de Proyectos, en cambio, se navega con
`window.location.href = "/tool/claude"` (`ProjectsScreen.tsx:86-87`): es una
recarga completa y pierde la ventaja de navegación SPA. Además no existe un
`loading.tsx` para la ruta de tools, por lo que el SSR dinámico no tiene feedback
inmediato propio.

### Sidebar de conversaciones

`ConversationsSidebar` llama siempre a `/api/me/conversations` con
`cache: "no-store"` al montar y con cada `refreshSignal`
(`ConversationsSidebar.tsx:44-69`).

Ese endpoint ejecuta secuencialmente sesión, proyecto activo, gate y listado
(`api/me/conversations/route.ts:16-51`). La página SSR ya conocía el proyecto y
su gate, pero el cliente no recibe una lista inicial.

Opciones:

- rápida: conservar la lista previa mientras revalida y no poner todo el sidebar
  en “cargando”;
- media: pasar `initialConversations` desde SSR, consultadas en paralelo con
  proyectos;
- media: cache de cliente por proyecto con stale-while-revalidate;
- estructural: endpoint que resuelva proyecto/gate/listado en menos olas de DB.

Al crear una conversación hay dos mecanismos que incrementan
`sidebarRefresh`: al resolver `onSend` y al observar el cambio de
`conversationId` (`ClaudeView.tsx:109-145`). Pueden provocar refetch duplicado.
Debe quedar una sola fuente.

### Cambiar de conversación

Existe un store en memoria por conversación y sobrevive a mounts dentro de la
SPA (`useClaudeChat.ts:148-223`). Es una buena base: al volver a una conversación
ya visitada puede mostrar lo cacheado inmediatamente.

Sin embargo, cada selección llama igualmente a `fetchConversation` con
`no-store` (`useClaudeChat.ts:412-451`). En una conversación nunca visitada,
`beginLoad` crea una sesión vacía, pero no existe `isLoading`: durante el GET se
muestra el estado “escribí abajo para arrancar” en lugar de un skeleton
(`ChatMessages.tsx:109-117`). Esto se siente como parpadeo o conversación vacía.

Recomendación rápida:

- exponer `isLoadingConversation`;
- mantener mensajes cacheados mientras revalida;
- mostrar skeleton solo en primera carga;
- deduplicar promesas si se cliquea dos veces la misma conversación;
- opcionalmente prefetch del detalle al hover.

El endpoint de detalle devuelve todos los mensajes, firma todos los adjuntos y
consulta todos los archivos (`api/me/conversations/[id]/route.ts:61-190`). Para
conversaciones largas hará falta paginación/carga hacia atrás, pero es un cambio
mayor y debe preservar que el historial completo siga visible para el usuario.

### Cambiar de proyecto

El POST de proyecto carga la fila y, para privados, `hasProjectGate(project.id)`
puede leerla otra vez en vez de usar los campos ya obtenidos
(`api/me/active-project/route.ts:33-76`). Después el sidebar hace otro ciclo
completo de carga. Reusar gate precargado y cachear lista por proyecto reduce la
espera real.

## 5. Re-renders y peso del cliente

### Hallazgos confirmados

- Toda la lista participa de cada render del stream; `MessageBubble` no está
  memoizado.
- El parseo de artifacts corre dentro de cada `AssistantContent`.
- El mensaje activo vuelve a ejecutar markdown + GFM + highlighting para cada
  actualización publicada.
- `browser-image-compression` se importa estáticamente al entrar al chat, aunque
  el usuario nunca adjunte una imagen
  (`image-compression.ts:33`; `ChatInput.tsx:28-37`).
- `react-markdown`, `remark-gfm`, `rehype-highlight` y `highlight.js` forman
  parte del camino inicial del chat (`MarkdownRenderer.tsx:19-22`).
- El CSS de `highlight.js` se importa globalmente, por lo que también alcanza
  pantallas que nunca abren Claude (`styles/globals.css:13`).
- Modales/visores de artifacts y archivos también se importan de forma estática
  desde la lista de mensajes.

No se ejecutó un bundle analyzer, por lo que no corresponde afirmar cuántos KB
ahorraría cada split.

### Recomendaciones

1. import dinámico de `browser-image-compression` dentro del camino que realmente
   necesita comprimir;
2. cargar previews/modales pesados al abrirlos;
3. medir si separar highlighting reduce significativamente el chunk inicial;
4. prefetch del chunk de Claude desde Hub para que el costo ocurra antes del
   click.

Son mejoras reales de carga, pero después de corregir renders y esperas
post-stream, que tienen evidencia de mayor impacto diario.

## 6. Percepción vs realidad

### Velocidad real

- menos olas de DB en SSR, execute y endpoints del sidebar;
- permiso + contexto en paralelo;
- uploads de múltiples adjuntos con concurrencia acotada;
- menos commits React y menos parseo durante streaming;
- no refetchear la conversación completa después de cada `done`;
- paginar el detalle de conversaciones largas;
- diferir dependencias que no se usan al entrar.

### Velocidad percibida

- optimistic bubble durante upload;
- skeleton correcto al abrir una conversación por primera vez;
- conservar cache visible mientras revalida;
- permitir escribir el siguiente borrador;
- estados de fase más claros;
- prefetch del chat antes del click.

### Ambas

- batch de deltas: reduce CPU real y hace el texto visualmente más suave;
- liberar input al recibir `done`: elimina una espera real y devuelve control
  antes;
- cache de conversación/sidebar: evita red y elimina parpadeos;
- memoización de mensajes: reduce trabajo y evita tirones.

## Qué depende de Anthropic

Una vez recibido el primer delta, los tokens por segundo dependen del modelo y
del proveedor. Elegir Haiku/Sonnet/Opus es una decisión de costo, calidad y
velocidad, no una optimización de frontend. El path de generación de archivos
también puede tener pausas del sandbox y múltiples `pause_turn`
(`anthropic/client.ts:580-726`).

El código puede influir en TTFT mediante tamaño de input y prompt caching, pero
no hacer que Opus escriba a la velocidad de un modelo menor. `max_tokens` es un
techo de salida y no reserva ese trabajo por adelantado.

Además, si Claude empieza emitiendo un bloque `<thinking>`, la UI oculta ese
contenido hasta cerrarlo y mantiene el indicador de pensamiento
(`ChatMessages.tsx:398-429`). El primer delta de red y la primera palabra visible
pueden ser momentos distintos; la medición debe registrar ambos.

## Priorización para el lunes

### P0 — alto impacto y cambio acotado

1. Batch de deltas por rAF/30–50 ms, memoizar `MessageBubble` y coordinar
   auto-scroll con ese batch. **Real + percibida.**
2. Al recibir `done`, habilitar el input sin esperar el GET completo; reconciliar
   en background o solo ante incertidumbre. **Real + percibida.**
3. Permitir editar el textarea durante una respuesta, manteniendo bloqueado el
   segundo envío. **Percibida/productividad.**
4. Estado `isLoadingConversation` + cache visible al revalidar. **Percibida +
   real al volver a una conversación.**

### P1 — rápidos con impacto real

5. Reusar sesión y gate precargado en SSR, listado y cambio de proyecto.
6. Eliminar el doble refresh del sidebar al crear una conversación.
7. Paralelizar permiso + contexto en el execute y firma de adjuntos +
   cerebro/historial, con tests de seguridad.
8. Añadir timings de preflight/primer delta/`done` y un request id común.
9. Paralelizar con concurrencia acotada uploads de múltiples adjuntos.
10. Agregar feedback de ruta (`loading.tsx`) y reemplazar la recarga completa
    Proyectos → Claude por navegación SPA.

### P2 — medir antes o trabajo mayor

11. Acordar e implementar una ventana/resumen de historial; hoy sigue
    ilimitado. Medir calidad además de tokens y TTFT.
12. Diferir compresión, highlighting y modales; confirmar con bundle analyzer.
13. Prefetch de Claude y detalles de conversación al hover/idle.
14. Paginar/virtualizar conversaciones largas sin quitar historial visible.
15. Agregar el índice compuesto `(conversation_id, created_at)` si `EXPLAIN`
    confirma el sort como costo relevante.
16. Consolidar preflight/listados en RPCs o joins.
17. Cachear cerebro/memoria con invalidación explícita al editar.

Resumir automáticamente historia antigua no es una mejora de fluidez rápida:
agrega otra llamada, costo y una política de consistencia. Solo vale evaluarlo si
se retoma una ventana de contexto y los usuarios realmente necesitan recordar
detalles que queden afuera.

## Plan de validación

1. En una conversación corta y otra larga, medir:
   `Enter → optimistic`, `Enter → headers`, `Enter → primer evento`,
   `Enter → primer delta`, `Enter → primera palabra visible`, `Anthropic fin →
   done` y `done → input habilitado`.
2. Registrar p50/p95 por fase y separar mensajes con/sin adjuntos y
   texto/archivo.
3. Usar React Profiler durante una respuesta larga: commits por segundo,
   duración de `ChatMessages` y renders de burbujas terminadas.
4. En Network, contar GETs de lista/detalle al entrar, cambiar conversación,
   crear conversación y cambiar proyecto.
5. Comparar una respuesta larga antes/después del batch observando fluidez,
   scroll, CPU y que artifacts/markdown sigan apareciendo correctamente.
6. Validar que stop, files, `.txt/.md`, sesión expirada y tabs/proyectos no
   regresen.

