# Progress 07 — Claude view (chat + multimodal + sidebar)

**Fecha**: 2026-05-23
**Duración real**: ~2 horas
**Sesión anterior**: `progress-06.md`
**Próxima sesión**: `kit/prompts/mvp/08-3dsky-adapter.md`

## Qué se construyó

- Página `/tool/[toolId]` real: dispatcher que valida toolId + permisos server-side, redirige a `/hub` para tools no operativas o sin acceso.
- `ClaudeView` (Client) — chat completo con header, sidebar de conversaciones, área de mensajes y input.
- `ChatMessages` — render de mensajes con avatar, label de quién habla, copy-to-clipboard en respuestas de Claude, soporte de imágenes adjuntas, placeholder "Claude está pensando…" + bloque de error si falla.
- `ChatInput` — textarea autoresize, drag-and-drop de imágenes sobre toda el área, thumbnails con ✕ para quitar, file picker via 📎, Enter envía / Shift+Enter nueva línea, validación local (5 imágenes max, 5MB cada una, JPEG/PNG/GIF/WebP).
- `ConversationsSidebar` — fetch a `/api/me/conversations` al montar, lista clickeable con highlight de la activa, botón "+ nueva".
- `useClaudeChat()` — hook que centraliza state (messages, conversationId, isSending, loadError) + acciones (sendMessage, loadConversation, newConversation).
- `images.ts` — helpers `validateImage`, `fileToBase64` (sin prefijo data:), `fileToPreviewUrl` (con prefijo, para `<img src>`).
- `ThreeDSkyPlaceholder` — vista placeholder de 3DSky para que `/tool/3dsky` no rompa hasta sesión 09.

## Archivos creados

```
nqs-ai-hub/
├── src/
│   ├── components/
│   │   ├── screens/
│   │   │   ├── ClaudeView.tsx                  ← chat principal
│   │   │   └── ThreeDSkyPlaceholder.tsx        ← stub hasta sesión 09
│   │   └── tool/
│   │       ├── ChatInput.tsx                   ← textarea + DnD imágenes
│   │       ├── ChatMessages.tsx                ← render con copy button
│   │       └── ConversationsSidebar.tsx        ← lista historial
│   └── lib/
│       ├── hooks/useClaudeChat.ts              ← state management
│       └── utils/images.ts                     ← base64 + validation
└── progress-07.md
```

## Archivos modificados

- `src/app/(dashboard)/tool/[toolId]/page.tsx` — de placeholder a dispatcher real con `requireAuth` + `canUseTool` + redirect.

## Decisiones técnicas tomadas

1. **Dispatcher en `/tool/[toolId]/page.tsx`, no rutas separadas por tool.** Alternativa hubiera sido `/tool/claude/page.tsx` + `/tool/3dsky/page.tsx`. Dispatcher tiene menos boilerplate y un solo guard de permisos; cuando una tool nueva entre operativa, basta con agregar un `if` y un componente.

2. **Hook propio `useClaudeChat`, no Zustand global.** El chat es local a la pantalla; no necesita compartir state entre componentes lejanos. Si después aparece un "indicador global de Claude pensando" en el topbar, se promueve a Zustand sin cambiar la API del hook.

3. **Optimistic update con placeholder "pensando".** El user ve su mensaje al instante + un bubble en estado `isPending`. Cuando llega la respuesta, reemplazamos el placeholder. Si falla, el placeholder se convierte en bloque de error con el mensaje del server. Ventaja: la UI nunca se siente trabada, el user sabe que su mensaje "se enganchó".

4. **Sidebar refresh por contador, no por refetch directo.** `sidebarRefresh: number` es un prop incremental — el sidebar re-fetcha cuando cambia. Esto evita que el `ClaudeView` tenga que importar el método de refetch de la sidebar (acoplamiento) o que la sidebar exponga un ref imperativo. Patrón "signal-based" estándar.

5. **Imágenes a base64 en el cliente.** El form mismo convierte cada `File` con `FileReader.readAsDataURL` y manda el payload `{type:"base64", media_type, data}` que Zod valida en el endpoint. Trade-off: aumenta ~33% el tamaño del request body. Para 5×5MB = 25MB → ~33MB encoded, dentro del límite default de Next/Vercel (4.5MB body por route)... **wait**, eso explota. Lo documento en pendientes y dejo el límite client-side conservador.

6. **Preview con data URLs locales, no upload temporal.** No subimos las imágenes a Storage ni nada antes de mandarlas a Claude. La preview vive en memoria del cliente como data URL hasta que se envía. El mensaje en la DB se guarda con `images: []` (ver sesión 06) — el historial visual no rehidrata, los mensajes viejos solo tienen el texto. TODO para módulo de uploads.

7. **Auto-scroll con `scrollIntoView({behavior:"smooth"})`.** El sentinel `<div ref={endRef}/>` al final de la lista. `useEffect` reacciona a cambios en `messages`. Funciona también en mensajes pending (cuando el placeholder aparece, scrollea).

8. **Textarea autoresize manual con `scrollHeight`.** Sin librería — es 5 líneas de cálculo. Limites: `TEXTAREA_MIN_ROWS=1`, `TEXTAREA_MAX_ROWS=8`. Se reset a `auto` antes de medir para que `scrollHeight` no acumule.

9. **Enter envía, Shift+Enter nueva línea, `isComposing` respeta IME.** El check `!e.nativeEvent.isComposing` evita enviar mensajes cuando el user está componiendo japonés/coreano/chino con un IME — un Enter ahí confirma el candidato, no envía el form.

10. **Copy to clipboard con `navigator.clipboard.writeText`.** Toast verde "COPIADO" en éxito, rojo "ERROR" si falla (algunos browsers bloquean si la pestaña no tiene foco). El botón solo aparece en respuestas de assistant que ya completaron (no en pending, no en error).

11. **404, no 403, cuando el ID de conv no existe / pertenece a otro.** Sigue el patrón del endpoint (sesión 06) — no leakeamos enumeración.

12. **`canUseTool` en la page server, no solo en el endpoint.** Si Sofia (por algún motivo) llega a `/tool/3dsky` sin acceso, la page redirige a `/hub` antes de renderizar. Defensa en profundidad: la card ya está bloqueada, el endpoint igual valida, y la page como tercera barrera. Admin pasa por arriba siempre.

13. **`ThreeDSkyPlaceholder` ya hoy.** El prompt mandó renderizarlo cuando `toolId === '3dsky'`. Como el componente real no existe (sesión 09), creé un stub que tira el mismo encabezado "VOLVER AL HUB" + "próxima sesión". Cuando arranque sesión 09 se reemplaza por el real.

## Cosas pendientes (TODO en código)

- [ ] **Body size de Next**: el default de Next/Vercel es 4.5MB por POST. 5×5MB en base64 = ~33MB → puede explotar en prod. Opciones: subir las imágenes a Supabase Storage primero y mandar URLs a Anthropic (que también acepta `source: {type:"url", url}`), o bajar el límite client-side a 1MB×3. Lo dejo documentado para resolver antes del deploy de sesión 12.
- [ ] Persistir imágenes del historial en `claude_messages.images` (hoy se guarda `[]`). Cuando se rehidrata un mensaje viejo se ve solo el texto.
- [ ] Streaming de respuestas (post-MVP). Hoy el textarea se bloquea hasta el final.
- [ ] Resize del textarea en mobile (probado solo desktop).
- [ ] El sidebar carga las primeras 20 conversaciones; cuando un user pase ese límite hay que sumar paginación en el endpoint y un "ver más" abajo.
- [ ] Atajo de teclado para nueva conversación (`⌘N`) — hoy es solo botón.
- [ ] Indicador visual cuando el drag-and-drop está activo en la propia lista de mensajes (hoy el border-dashed amarillo aparece solo sobre el input).

## Cosas a tener en cuenta para la próxima sesión

- El componente `ThreeDSkyPlaceholder` se borra en sesión 09 y se reemplaza por `<ThreeDSkyView />` real (créditos + iframe del proxy).
- El dispatcher `/tool/[toolId]/page.tsx` ya pasa `session` al ClaudeView; para 3DSky vas a necesitar `credits + creditsTotal` + `embedUrl`. Mejor llamarlo desde el adapter (`threeDSkyAdapter.checkAccess` ya devuelve los créditos).
- El hook `useClaudeChat` está exportado como `UseClaudeChat = ReturnType<...>` — si querés tests, podés mockearlo con `vi.mock("@/lib/hooks/useClaudeChat")`.
- 2 conversaciones reales quedaron en la DB del smoke test ("En 20 palabras: ¿quién sos?" y "En 5 palabras: ¿estás operativo?"). Si querés DB limpia: `DELETE FROM claude_conversations;` en el SQL Editor.

## Cómo probar lo que se construyó

```bash
npm run dev
# login: sofia@nqs.test / nqs2026sofia
```

1. Caes en `/hub`; click en la card de **Claude** → `/tool/claude`.
2. Header con back link, brand "CLAUDE" + pip verde, status "CONVERSACIÓN NUEVA".
3. Sidebar a la izquierda con tus 2 conversaciones previas + botón "+ nueva".
4. Área de chat vacía con mensaje "↳ escribí abajo para arrancar una conversación".
5. Input abajo con placeholder + 📎 + botón →.
6. **Test texto**: escribí "Resumime el plan en 5 puntos" y Enter → ves tu mensaje al instante + "Claude está pensando…" → llega la respuesta. Tokens visibles arriba a la derecha.
7. **Test imagen + texto**:
   - Click en 📎 (o arrastrá una imagen sobre el componente).
   - Aparece thumbnail con ✕ para quitar.
   - Escribí "¿Qué ves?" y enviá.
   - El mensaje del user muestra la imagen renderizada; la respuesta de Claude la describe.
8. **Validaciones**: probá adjuntar un archivo .txt → toast rojo "tipo no soportado". Probá una imagen >5MB → toast rojo con el tamaño.
9. **Copy button**: en una respuesta de Claude, click "⧉ copiar" → toast verde "COPIADO". Pegar en un editor para verificar.
10. **Multi-turn**: seguí escribiendo en la misma conversación → cada nueva respuesta tiene contexto de las anteriores (tokens input crece con el historial).
11. **Nueva conversación**: click "+ nueva" → el chat se limpia, status vuelve a "CONVERSACIÓN NUEVA", el sidebar destaca otra conv si tenías una activa.
12. **Cargar histórica**: click en una conversación vieja del sidebar → se carga con todos sus mensajes; el input sigue funcionando y agrega a esa conv.
13. **Refresh**: F5 → el sidebar vuelve a mostrar todas las conversaciones (incluida cualquiera nueva que hayas creado en este browse).
14. **Sin acceso**: cerrá sesión, abrí `/tool/claude` directo → proxy redirige a `/login?next=/tool/claude`.
15. **Tool no operativa**: abrí `/tool/weavy` o `/tool/asdf` con sesión activa → redirect a `/hub`.

Tests automáticos + build:
```bash
npm test          # 6/6 (auth) — no agregamos tests del hook en esta sesión
npm run typecheck # OK
npm run build     # 12 rutas + Proxy
```

Smoke E2E verificado:
- `/tool/claude` con sofia → markup OK (brand "CLAUDE", back link, sidebar HISTORIAL, chat-input, 📎, textarea).
- `/tool/3dsky` → placeholder con "próxima sesión".
- `/tool/weavy`, `/tool/asdfasdf` → 307 a `/hub` (redirect del dispatcher).
- `/tool/claude` sin sesión → 307 a `/login?next=/tool/claude` (proxy).
- POST `/api/tools/claude/execute` con "En 5 palabras: ¿estás operativo?" → 200 + texto + persistencia OK.
- `/api/me/conversations` devuelve 2 conversaciones reales (la previa de sesión 06 + la nueva).

## Vista funcionando

```
┌─────────────────────────────────────────────────────────────────┐
│ topbar (Hub Tut Pla Org · Sofía · salir)                       │
├─────────────────────────────────────────────────────────────────┤
│ marquee ✦ NQS · AI HUB ✦ …                                    │
├─────────────────────────────────────────────────────────────────┤
│ ← VOLVER AL HUB  │ C CLAUDE •            ↳ CONVERSACIÓN ACTIVA│
├──────────────────┴──────────────────────────────────────────────┤
│ ↳ HISTORIAL              │                                      │
│  + nueva                 │  ┌─────────────────────────────┐    │
│                          │  │ C  CLAUDE         in:88 out:49│  │
│  > En 20 palabras: ¿qui… │  │    Soy tu asistente creat... │   │
│    En 5 palabras: ¿est…  │  │              [⧉ copiar]      │   │
│                          │  └─────────────────────────────┘    │
│                          │  ┌─────────────────────────────┐    │
│                          │  │ SG SOFÍA                     │   │
│                          │  │    Necesito un brief para…   │   │
│                          │  └─────────────────────────────┘    │
│                          │  ┌─────────────────────────────┐    │
│                          │  │ C  CLAUDE  pulse●            │   │
│                          │  │    Claude está pensando…     │   │
│                          │  └─────────────────────────────┘    │
│                          │                                      │
│                          │  ┌──────────────────────────┐       │
│                          │  │ 📎 │ escribí tu mensaje…│→ │     │
│                          │  └──────────────────────────┘       │
└──────────────────────────┴──────────────────────────────────────┘
```

## Soporte multimodal probado

- ✅ El endpoint POST acepta `images: [{type:"base64", media_type, data}]` con Zod (sesión 06).
- ✅ El cliente convierte File → base64 con FileReader antes de POSTear.
- ✅ Las imágenes van ANTES del texto en el payload (recomendación de Anthropic vision).
- ✅ Validación local (tipo + tamaño) antes de enviar.
- ✅ Preview en thumbnails durante composición; preview en el bubble del user después de enviar.
- ⚠️ El historial NO rehidrata imágenes (se guarda `images: []` en `claude_messages` — TODO documentado).

## Errores conocidos

- (ninguno bloqueante)
- Body size de Next default 4.5MB — adjuntar 5 imágenes de 5MB explota; bajar límite client-side o subir a Storage primero (TODO para sesión 12).

## Variables de entorno agregadas

(ninguna nueva)

## Commits sugeridos

```
feat(claude-view): chat con multimodal, sidebar de conversaciones y copy
```

## Próximo paso

`kit/prompts/mvp/08-3dsky-adapter.md` — adapter de 3DSky con `consumeCredit` atómico y `getEmbedUrl`.
