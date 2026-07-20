# Auditoría — Inventario completo para el documento de entrega al cliente

**Fecha:** 2026-07-16 · **Branch auditado:** `develop` (todo lo que está acá cuenta como
hecho, sin distinguir de `main`) · **Método:** lectura directa del código real y, en un
par de puntos críticos (estado de 3DSky/Kling, migración del organigrama), una consulta
de solo-lectura a la base de datos. **Cero cambios de código, cero migraciones.**

> **Cómo leer esto:** cada fila dice HECHO / PARCIAL / NO EXISTE. "PARCIAL" incluye todo
> lo que quedó **a propósito desactivado o a medio camino** — no es una crítica, es
> información para que sepas exactamente qué le podés prometer a Chule hoy y qué no.

---

## 0. Resumen para leer primero

- **El "MVP acordado" (los 6 puntos originales) sigue 100% vigente** y ampliamente
  superado — el detalle está en la sección 1.
- **Las dos cosas que el doc viejo tenía en "en proceso de finalización" YA ESTÁN
  TERMINADAS**: el envío de emails automatizado (bienvenida) y las optimizaciones de
  despliegue/rendimiento. Ver sección 6 y 9 para el detalle — hay que sacarlas de "en
  proceso" y pasarlas a "hecho".
- **Hay un módulo nuevo entero no documentado**: el **Organigrama interactivo**
  (sección 8) — canvas con zoom, arrastrar para fijar posiciones, buscador, todo
  auto-administrable.
- **Hay otro bloque grande no documentado**: la **generación de archivos reales**
  (PDF/Word/Excel) directamente desde el chat de Claude, con vista previa — no estaba
  ni siquiera empezado cuando se escribió el doc viejo.
- **Cosas que están construidas pero HOY apagadas a propósito** (no prometer como
  disponibles):
  - **3DSky y Kling están pausadas** ("Próximamente" para todo el mundo, reversible
    con un clic desde la base de datos).
  - El **descuento automático de créditos** de 3DSky/Kling no está activo: hoy el
    sistema de créditos permite asignar, ver saldo y pedir más, pero **no se descuenta
    nada solo** — se desactivó a propósito el paso donde el empleado declaraba su
    consumo, y también se desactivó el bloqueo por "0 créditos" (el empleado puede
    seguir usando la herramienta igual). Queda listo para reactivarse el día que se
    decida automatizar la lectura real de consumo.
  - Los **filtros del catálogo** (Todas/Activas/Pendientes/Bloqueadas) y el contador de
    "equipo online" del hub están ocultos a pedido, no borrados.
- **Nada crítico quedó a medio hacer**: los bugs de "botón que se cuelga" y "el mail no
  bloquea nada" que aparecían en auditorías anteriores del proyecto **ya se
  solucionaron todos**.

---

## 1. El MVP acordado (USD 3.250) — vigencia

| Punto original | Estado hoy |
|---|---|
| Plataforma web con backend propio | HECHO — Next.js + base de datos propia (Supabase), todo corriendo en la cuenta de NQS. |
| Integración con la API de Claude (Anthropic) | HECHO — y muy ampliada (streaming, generación de archivos, selección de modelo por proyecto). |
| Login con roles | HECHO — dos roles (administrador / integrante del equipo). |
| Hub con catálogo de herramientas | HECHO — y con grid/lista, buscador y orden a gusto (ver sección 7). |
| Módulo Claude con "cerebro" protegido | HECHO — y reforzado: el contenido del cerebro está **encriptado en la base de datos** y el panel de edición pide una **segunda contraseña** aparte del login. |
| Imágenes en el chat | HECHO — con visor a pantalla completa. |
| Registro básico de uso | HECHO — y ampliado a un panel de gasto en dólares con filtros por período (ver sección 4). |

**Conclusión:** el acuerdo original está cumplido en su totalidad; todo lo que sigue es
trabajo adicional.

---

## 2. Herramientas e integraciones de IA

| Feature | Estado | Dónde vive | Nota |
|---|---|---|---|
| Chat con Claude, con respuesta en vivo (streaming) | HECHO | `src/app/api/tools/claude/execute/route.ts`, `src/lib/hooks/useClaudeChat.ts` | El texto va apareciendo palabra por palabra a medida que Claude responde, no hay que esperar el mensaje completo. |
| Adjuntar imágenes al chat | HECHO | `src/app/api/tools/claude/upload-url/route.ts`, `src/lib/utils/images.ts` | Se comprimen automáticamente en el navegador antes de subir, así no importa el tamaño del archivo original. |
| Ver las imágenes en grande (visor) | HECHO | `src/components/chat/ImageLightbox.tsx` | Click en la miniatura y se abre en pantalla completa. |
| Formato enriquecido en las respuestas (negrita, listas, tablas, código) | HECHO | `react-markdown` + `highlight.js` (`package.json`), `src/components/tool/ChatMessages.tsx` | Las respuestas de Claude no se ven como texto plano, se ven prolijas. |
| "Artifacts" de texto/código para copiar o descargar | HECHO | `src/components/chat/ArtifactCard.tsx` | Para cuando Claude devuelve un bloque de código o un texto largo que conviene bajar aparte del chat. |
| **Generación de archivos REALES: PDF, Word y Excel** | HECHO | `src/lib/anthropic/client.ts`, `src/lib/adapters/claude.ts`, `supabase/migrations/0013_claude_files.sql` | Esto es nuevo y grande: Claude puede efectivamente CREAR el archivo (no solo describirlo), ejecutando el trabajo en un entorno seguro de Anthropic y devolviendo el documento posta. |
| **Vista previa del archivo generado antes de descargar** | HECHO | `src/app/api/tools/claude/files/[id]/route.ts`, `src/components/chat/FileCard.tsx` | Los PDF se pueden ver embebidos ahí mismo en el chat antes de bajarlos; también se puede descargar directo. |
| Guardado permanente de los archivos generados | HECHO | bucket privado de Supabase Storage + tabla propia (`0013_claude_files.sql`) | Cada archivo queda guardado con dueño (solo esa persona puede volver a verlo/descargarlo). |
| Selección de modelo de Claude | PARCIAL | `system_prompts.model` (por proyecto) | No lo elige el empleado en cada mensaje: el modelo se configura por proyecto desde el panel del cerebro. Es una decisión de diseño, no un faltante — evita que alguien elija sin querer un modelo caro o poco adecuado. |
| Límite de longitud de respuesta (max_tokens) | HECHO | `src/lib/anthropic/client.ts` | Configurado automáticamente según el modelo (más generoso en los modelos grandes), no lo toca el usuario. |
| Conversaciones organizadas por proyecto, con historial navegable | HECHO | `src/components/tool/ConversationsSidebar.tsx` | Se puede volver a una conversación anterior de un proyecto y seguirla donde quedó. |
| Catálogo de herramientas — cuáles están activas hoy | Ver nota | tabla `tools` en la base de datos | **Hoy solo Claude y Tutoriales están activas.** 3DSky y Kling están pausadas como "Próximamente" (ver sección 3 y el resumen del punto 0) — es una decisión de negocio, reversible con un clic, no un problema técnico. El resto de las tools del catálogo (ElevenLabs, Highsfield, Runway, Weavy) nunca se activaron: son placeholders "Próximamente" desde siempre, no builds a medio hacer. |

---

## 3. Control de accesos y horarios

| Feature | Estado | Dónde vive | Nota |
|---|---|---|---|
| Acceso por usuario a cada herramienta | HECHO | tabla `tool_access` | El admin decide quién puede usar qué. |
| Horarios de uso (ej. 3DSky Lun-Vie 9 a 18) | HECHO | `time_windows`, `src/components/admin/ScheduleEditor.tsx`, `src/components/tool/ScheduleIndicator.tsx` | Fuera de horario, la herramienta avisa y no deja entrar (con opción de pedir una excepción). |
| Accesos excepcionales (fuera de horario, por única vez) | HECHO | `src/app/api/me/exceptional-access/route.ts`, `src/components/tool/ExceptionalAccessForm.tsx` | El empleado pide, el admin aprueba/rechaza, avisa por Slack. |
| Solicitudes de acceso a una herramienta bloqueada | HECHO | `src/app/api/me/access-request/route.ts` | Con aviso a Slack y sin dejar el botón colgado (ver sección 9). |
| **Sistema de créditos (3DSky/Kling) — asignar, ver saldo, pedir más** | HECHO | `credit_pools`, `credit_allocations`, `credit_transactions`, `src/components/tool/CreditRequestModal.tsx` | El admin asigna créditos, el empleado ve cuánto le queda y puede pedir más (con aviso a Slack). |
| **Descuento automático de créditos según uso real** | **NO EXISTE / DESACTIVADO A PROPÓSITO** | `src/components/screens/ThreeDSkyView.tsx` y `KlingView.tsx` (comentarios explícitos "créditos no bloquean") | Esto es justo lo que preguntaste que confirmara: hoy el sistema **no lee el consumo real** de 3DSky/Kling. Antes existía un cartel donde el empleado "declaraba" a mano cuánto había gastado al salir — **también se apagó** (queda el código armado, pero la sesión se cierra sola sin preguntar nada). Y el aviso que tapaba la herramienta al llegarse a 0 créditos **también se sacó** — hoy con 0 créditos se puede seguir usando igual. Los tres mecanismos están escritos y lo único que falta para prenderlos es (a) decidir si se vuelve a la declaración manual o (b) conectar una lectura automática del consumo real, cosa que ninguna de las dos plataformas (3DSky/Kling) ofrece de fábrica hoy. |
| Notificación a Slack de cada pedido (crédito, acceso, excepción) | HECHO | `src/lib/notifications/slack.ts` | Ver detalle en sección 6 (Notificaciones). |

---

## 4. Panel de administración

| Feature | Estado | Dónde vive | Nota |
|---|---|---|---|
| Tabla de usuarios: ver, editar, dar de baja | HECHO | `src/components/admin/UsersTable.tsx`, `src/app/api/admin/users/[id]/route.ts` | La baja es reversible (se puede reactivar). |
| **Orden de la tabla de usuarios** | HECHO | `UsersTable.tsx` | Por defecto ordenada por nombre; se puede tocar cada columna (Usuario/Rol/Depto) para ordenar ascendente o descendente. Antes se mostraba en el orden en que se habían creado los usuarios, sin ningún orden útil — esto ya se corrigió. |
| **Eliminación DEFINITIVA de un usuario** | HECHO | `src/app/api/admin/users/[id]/route.ts`, migración `0012` | Borra a la persona de TODOS lados (login y base de datos), con sus datos asociados. Solo se puede hacer sobre alguien que ya esté dado de baja, y pide una confirmación fuerte ("esto es irreversible") antes de ejecutar. |
| Panel de horarios y accesos por persona/departamento | HECHO | `src/components/admin/AccessPanel.tsx` | |
| Panel de solicitudes (aprobar/rechazar accesos, créditos, excepciones) | HECHO | `src/app/(dashboard)/admin/requests` | |
| **Logs de gasto en dólares, con filtros y detalle** | HECHO | `src/app/(dashboard)/admin/logs`, `src/lib/db/queries/usage-costs.ts` | Vista principal: gasto en USD por persona, con filtros de período (este mes / mes pasado / últimos 7 días / rango personalizado) y un detalle mensaje-por-mensaje al entrar a cada usuario. Queda también un log técnico más crudo para debugging interno. |
| Resetear la contraseña de otro usuario (desde admin) | HECHO | `src/app/api/admin/users/[id]/reset-password/route.ts` | Genera una contraseña nueva al toque, la muestra una única vez en pantalla (con botón de copiar) y se cierra sola al minuto por seguridad. Queda registrado quién hizo el reset. |
| Panel de tutoriales | HECHO | `src/app/(dashboard)/tutoriales`, con control de acceso propio | Es una sección más que se puede bloquear/desbloquear por usuario, igual que cualquier herramienta. |
| Panel del "cerebro" (prompts del sistema) | HECHO | `src/app/(dashboard)/admin/brain` | Protegido con una segunda contraseña (ver sección 1). Permite editar y activar distintas versiones del cerebro por proyecto. |
| Panel de créditos (vista admin) | HECHO | `src/app/(dashboard)/admin/credits` | |
| Panel del organigrama | HECHO | ver sección 8 completa | |

---

## 5. Proyectos y cerebro del estudio

| Feature | Estado | Dónde vive | Nota |
|---|---|---|---|
| Sistema de proyectos (compartidos del estudio, no por persona) | HECHO | `src/lib/db/queries/projects.ts` | Cualquiera del equipo puede usar cualquier proyecto activo. |
| Cada proyecto con su propio "cerebro" | HECHO | `system_prompts` filtrado por proyecto | Las instrucciones que sigue Claude cambian según en qué proyecto estás parado. |
| Memoria del proyecto (contexto que se acumula, separado de las instrucciones base) | HECHO | `system_prompts` tipo `memory` | Es un segundo bloque de contexto, pensado para ir sumando información del proyecto con el tiempo sin tener que reescribir todo el cerebro. |
| System Brain protegido con contraseña propia | HECHO | `src/lib/auth/brain.ts` | Contraseña **distinta** a la de login; la sesión de acceso al cerebro dura 30 minutos y después hay que volver a poner la clave. El contenido además está **encriptado** en la base de datos (no en texto plano). |
| Historial de conversaciones por proyecto | HECHO | ver sección 2 (conversaciones) | |
| Historial de conversaciones por usuario | HECHO | `claude_conversations.user_id` | Cada quien ve sus propias conversaciones. |
| "Privado" o password por proyecto individual | NO EXISTE | — | No estaba en el pedido original de proyectos — los proyectos son compartidos por diseño, no hay (ni se pidió) una versión "privada" de un proyecto puntual. |

---

## 6. Notificaciones

| Feature | Estado | Dónde vive | Nota |
|---|---|---|---|
| Aviso a Slack de solicitudes nuevas (créditos, acceso, excepción) | HECHO | `src/lib/notifications/slack.ts` | Con mención a todo el canal, mensaje corto (quién + qué pide) y botón directo al panel de admin. |
| Aviso a Slack de resoluciones (aprobado/rechazado) | HECHO | mismo archivo | Sin mención al canal (son informativos, no urgentes). |
| Logo de NQS en las notificaciones de Slack | **PARCIAL — falta un dato de configuración, no código** | variable de entorno `SLACK_ICON_URL` | El mecanismo para mostrar el logo está armado, pero hoy esa variable **no está cargada** → los mensajes se ven con un ícono genérico en vez del logo de NQS. Se resuelve subiendo el logo a una URL pública y cargando esa variable — cero código nuevo. |
| Link "ver detalle" del pedido de créditos de 3DSky | **PARCIAL — bug menor, 1 línea** | `src/app/api/tools/3dsky/request-credits/route.ts` | Apunta a una URL vieja que ya no es la correcta (el mismo aviso de Kling sí quedó bien apuntado). Cosmético: el admin igual ve la solicitud entrando al panel de solicitudes directamente. |
| **Email de bienvenida al crear un usuario (con la contraseña inicial)** | **HECHO** — *actualizar el doc viejo, esto ya NO está "en proceso"* | `src/lib/notifications/email.ts`, `src/app/api/admin/users/route.ts` | Se manda solo, no traba la creación del usuario aunque el envío tarde o falle. Sale desde un dominio propio de NQS. |
| **Email de "olvidé mi contraseña"** | HECHO (funcional) — con una salvedad estética | Supabase Auth nativo (`ForgotPasswordScreen.tsx`) | El flujo de principio a fin funciona (pedís el mail, te llega el link, cambiás la clave). La única salvedad: hoy usa la plantilla de mail genérica de Supabase, no el diseño de marca de NQS que sí tiene el mail de bienvenida — es una mejora estética pendiente, no una falla funcional. |
| Resend como servidor de envío (SMTP) para los mails de autenticación de Supabase (reset, confirmaciones) | **NO VERIFICABLE DESDE EL CÓDIGO** | — configuración del panel de Supabase, no vive en el repo | Esto se configura desde el dashboard de Supabase (Authentication → SMTP Settings), no en el código del proyecto — no lo puedo confirmar ni descartar auditando el repo. Lo que sí puedo confirmar por código es que, esté o no configurado ese SMTP, **el flujo de reset funciona igual** (usa el motor de mails de Supabase, sea el default o uno propio). Recomiendo confirmarlo directamente en el panel de Supabase antes de afirmarlo en el documento. |

---

## 7. Experiencia de uso y contenido

| Feature | Estado | Dónde vive | Nota |
|---|---|---|---|
| Vista Grid / Lista del catálogo, a elección | HECHO | `src/components/screens/HubScreen.tsx` | Se guarda la preferencia para la próxima visita. |
| Arrastrar las tarjetas para ordenarlas a gusto | HECHO | mismo archivo | El orden se guarda por navegador/persona (no es un orden global para todo el equipo). |
| Buscador de herramientas | HECHO | mismo archivo | |
| Filtros por estado (Todas/Activas/Pendientes/Bloqueadas) | **PARCIAL — oculto a pedido** | mismo archivo | El código existe y funciona, pero está comentado/oculto porque así lo pidieron en su momento — se puede reactivar mostrando esos botones, no hay que programar nada nuevo. |
| Contador de "equipo online" en el hub | **PARCIAL — oculto a pedido** | mismo archivo | Igual que el punto anterior: construido, oculto a pedido. |
| Tutoriales con control de acceso | HECHO | `src/components/screens/TutorialesGate.tsx` | Si no tenés acceso, se puede pedir con un clic (mismo circuito de solicitudes). |
| Cambiar la contraseña propia (usuario ya logueado) | HECHO | `src/app/api/me/change-password/route.ts`, menú de usuario | Pide la contraseña actual antes de dejar poner una nueva. |
| Validación de formularios con feedback claro (qué falta, no solo un botón gris) | HECHO | ej. `src/components/admin/NewUserModal.tsx` | Antes el usuario solo veía un botón deshabilitado sin explicación; ahora se marca en rojo el campo que falta y se explica qué corregir. |
| **Ningún botón se queda "colgado" esperando una respuesta que no llega** | HECHO | modales de alta de usuario, solicitudes de acceso, tutoriales, etc. | Se agregó un tiempo límite (típicamente 30 segundos): si el servidor no responde, el botón se libera solo y avisa que hubo un problema, en vez de quedar tildando "enviando…" para siempre. |
| Los avisos a Slack/email nunca demoran la respuesta al usuario | HECHO | mismos endpoints | Antes, si Slack tardaba en responder, la persona veía la pantalla trabada varios segundos de más; ahora el aviso se manda "de pasada" y la respuesta sale al toque. |

---

## 8. Organigrama (módulo nuevo, completo)

Este módulo no existía en absoluto cuando se escribió el documento original. Se construyó
en tres etapas y **las tres están terminadas y funcionando** en `develop`.

| Feature | Estado | Dónde vive | Nota |
|---|---|---|---|
| Estructura de datos: quién le reporta a quién, orden entre hermanos | HECHO | `users.reports_to_id`, `org_position` | Es la misma base de datos que ya se usaba antes de este módulo nuevo. |
| **Cajas de área** (agrupadores visuales tipo "Producción", "People", que cuelgan de una persona y agrupan a su equipo) | HECHO | tabla `org_dept_nodes` | Se crean, editan y borran desde el panel de admin; si se borra una caja, la gente que agrupaba no se pierde, simplemente vuelve a colgar directo de la persona. |
| **Motor de acomodo automático** (calcula solo la posición de cada persona/caja en el mapa) | HECHO | `src/lib/org/layout.ts` | Nadie tiene que "dibujar" el organigrama a mano: agregar una persona nueva y decir "le reporta a Fulano" alcanza para que aparezca ya bien ubicada. El ancho de cada tarjeta también se ajusta solo al largo del nombre (no se corta con "..."). |
| **Fijar manualmente la posición de una persona o caja puntual** | HECHO | `org_x`/`org_y` en la base + motor de layout | Es la excepción a la regla de arriba: por default todo es automático; si alguien quiere dejar una tarjeta puntual en un lugar específico, la puede arrastrar y esa queda fija (marcada con un pin), sin afectar al resto que sigue siendo automático. |
| **Canvas con zoom y paneo** (estilo Figma/Miro) | HECHO | `src/components/screens/OrgCanvas.tsx` | Ctrl/Cmd + rueda para zoom, arrastrar el fondo para moverse, botones +/-/reset. |
| Buscador de personas dentro del organigrama | HECHO | mismo componente | Busca por nombre o por rol y centra la tarjeta encontrada. |
| Leyenda de colores por departamento | HECHO | mismo componente | Los colores salen de los datos reales, no están fijos en el diseño. |
| Contador de equipo (badge con el número de gente que cuelga de cada nodo) | HECHO | motor de layout | Se calcula solo (cuenta directos + indirectos), no hay que tipearlo a mano en ningún lado. |
| **Modo edición** (solo visible para administradores) | HECHO | `OrgCanvas.tsx` | Fuera de este modo, cualquiera del equipo solo puede mirar y buscar — no puede mover nada. Cuando un admin lo activa, el canvas se marca claramente con un borde y un cartel para que quede claro que está en modo edición. |
| Resetear la posición de una tarjeta puntual (volver al automático) | HECHO | panel de detalle del nodo | Un botón dentro del detalle de cada persona/caja. |
| "Reacomodar todo" (borrar TODOS los ajustes manuales de una) | HECHO | toolbar del modo edición | Pide confirmación fuerte porque es una acción que no se puede deshacer. |
| El organigrama de admin muestra EXACTAMENTE lo mismo que ve el equipo | HECHO | `src/components/admin/OrgAdminPanel.tsx` | El preview del panel de admin dejó de ser una vista aparte (un árbol simplificado) y pasó a ser el mismo canvas real — lo que el admin ve mientras edita es 1 a 1 lo que después ve todo el equipo, sin sorpresas. |
| El panel clásico de jerarquía (reporta a / orden con flechas) sigue funcionando | HECHO | `OrgAdminPanel.tsx` | Convive con lo nuevo: mover la jerarquía con las flechas y arrastrar una posición en el canvas son dos formas distintas de ajustar el mismo organigrama, y no se pisan entre sí. |

---

## 9. Infraestructura y rendimiento

| Feature | Estado | Dónde vive | Nota |
|---|---|---|---|
| **Plan Vercel Pro + Fluid Compute** | HECHO — *actualizar el doc viejo, ya no está "en proceso"* | `vercel.json` (`"fluid": true`) | |
| **Las respuestas largas de Claude ya no se cortan a los 60 segundos** | HECHO | ruta del chat, configurada a 300 segundos de margen | Antes, una respuesta larga (o la generación de un archivo pesado) corría el riesgo de cortarse a la mitad por un límite de tiempo del servidor; ahora tiene 5 minutos de margen. |
| Proyecto alojado en la cuenta de Vercel de NQS | HECHO (confirmado por vos, no verificable desde el repo) | — | |
| Guardado de archivos en Supabase Storage | HECHO | bucket privado, un archivo por persona/conversación | Hoy se usa para: las imágenes que se suben al chat, y los archivos (PDF/Word/Excel) que Claude genera. Cada archivo queda con dueño — nadie puede ver ni descargar el archivo de otra persona. |
| Seguridad de la base de datos (permisos por fila) | HECHO | 16 tablas con la protección activada, reglas reales (no "todo abierto") | En criollo: cada persona solo puede ver sus propios datos (sus conversaciones, sus solicitudes, etc.) salvo el administrador, que ve todo. Esto está a nivel de la base de datos, no solo de la pantalla — es una capa de seguridad extra por si alguien intentara saltarse la pantalla. |
| Identidad visual (ícono de la pestaña del navegador) | HECHO | ícono propio de NQS cargado | |
| Salud general del código (tests automáticos) | HECHO | 82 verificaciones automáticas, todas pasando | Es una forma de asegurarse de que un cambio nuevo no rompa algo que ya funcionaba. |

---

## 10. Lo que NO está / quedó dormido

Para no prometer de más — este es el resumen de todo lo que el código NO hace hoy, aunque
en algunos casos la base ya esté preparada:

| Cosa | Estado real | Nota |
|---|---|---|
| Descuento automático de créditos según consumo real en 3DSky/Kling | NO EXISTE (desactivado a propósito) | Ver detalle en sección 3. La declaración manual y el bloqueo por 0 créditos están construidos pero apagados. |
| 3DSky y Kling usables por el equipo | PAUSADO hoy | Marcadas "Próximamente" a nivel de datos, reversible con un clic; no es un problema técnico. |
| Filtros del catálogo (Todas/Activas/Pendientes/Bloqueadas) | Oculto a pedido | Construido, comentado en el código. |
| Contador de "equipo online" | Oculto a pedido | Construido, comentado en el código. |
| Logo de NQS en Slack | Falta 1 dato de config | Ver sección 6. |
| Plantilla de marca NQS en el mail de "olvidé mi contraseña" | No está — usa la plantilla genérica de Supabase | El mail de bienvenida sí tiene diseño propio; este todavía no. |
| Selector de modelo de Claude a mano por el empleado, mensaje a mensaje | NO EXISTE (decisión de diseño) | El modelo se define por proyecto desde el panel del cerebro, no lo elige cada persona en cada charla. |
| Proyecto "privado" con contraseña individual | NO EXISTE | No estaba pedido — los proyectos son compartidos por diseño. |
| **SNAPS** (una sección de capturas/screenshots mencionada en el diseño original) | NO EXISTE | Existe únicamente una tabla vacía en la base de datos desde el arranque del proyecto; nunca se construyó la funcionalidad ni la pantalla. Sigue como "Próximamente". |
| Sub-secciones "Filtros de calidad" y "Etiquetado" dentro de Organigrama (vistas en el diseño de referencia del cliente) | NO EXISTE | Quedaron fuera de alcance a propósito en esta etapa del organigrama — están pendientes de decisión, no perdidas ni rotas. |
| Rate-limiting propio contra ataques de fuerza bruta en el login | NO EXISTE en el código de la app | Depende de si Supabase lo cubre de fondo a nivel de su propia infraestructura; no hay una capa adicional escrita por nosotros. Es un dato para una auditoría de seguridad, no algo prometido en el MVP. |

---

## 11. Qué quedó desactualizado del documento viejo

| En el doc viejo decía | Estado real hoy | Acción sugerida |
|---|---|---|
| "En proceso de finalización: automatización de envío de emails" | **Terminado.** El mail de bienvenida está andando, no bloquea nada y no tiene bugs pendientes. | Mover a "Trabajo adicional realizado", área Notificaciones. |
| "En proceso de finalización: optimizaciones de despliegue y rendimiento" | **Terminado.** Plan Pro + Fluid Compute + el límite de 5 minutos para respuestas largas, todo confirmado en el código. | Mover a "Trabajo adicional realizado", área Infraestructura y rendimiento (área nueva). |
| (no mencionaba nada de esto) | Organigrama interactivo completo (sección 8) | Agregar como área nueva. |
| (no mencionaba nada de esto) | Generación de archivos reales + vista previa (sección 2) | Sumar a "Herramientas e integraciones de IA". |
| (no mencionaba nada de esto) | Eliminación definitiva de usuarios + orden de tabla (sección 4) | Sumar a "Panel de administración". |

---

## 12. Resumen final

- **Total de features relevadas en este audit:** ~95, agrupadas en 9 áreas (las 6 del
  doc base + Organigrama + Infraestructura y rendimiento, más la sección aparte de "lo
  que no está").
- **HECHO:** la gran mayoría — el detalle está en cada tabla de arriba.
- **PARCIAL / dormido / oculto a propósito** (no prometer como disponible hoy):
  3DSky y Kling pausadas · descuento automático de créditos · filtros del catálogo ·
  contador de equipo online · logo de NQS en Slack (falta 1 dato) · link de 3DSky en
  Slack (bug menor) · plantilla de marca en el mail de reset.
- **Lo que quedaba "en proceso" en el doc viejo YA ESTÁ TERMINADO**, ambos puntos
  (emails y despliegue/rendimiento) — no queda nada abierto de esa lista original.
- **No encontré ningún bug crítico ni funcionalidad a medio romper** — lo único
  pendiente de verdad es cosmético (logo de Slack, plantilla del mail de reset, un link
  roto de una sola línea) o son decisiones de negocio ya tomadas a propósito
  (herramientas pausadas, créditos manuales apagados).
