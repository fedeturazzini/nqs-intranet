# Sesión 07 — Vista de Claude (frontend) con chat + imágenes

## Objetivo

Construir la UI del wrapper de Claude: chat con texto + soporte de subida de imágenes (drag-and-drop, preview), historial, botón de copiar.

**Duración**: 3 horas
**Output**: Sofia abre Claude desde el hub, escribe un prompt, opcionalmente arrastra imágenes, recibe la respuesta optimizada y la copia al clipboard.

---

## PROMPT

```
Sesión 07 del NQS AI Hub.

ESTADO ACTUAL:
Leé `progress-06.md`.

OBJETIVO:
Vista de Claude completa con chat, imágenes, historial y copy-to-clipboard.

PASOS:

1. Crear página `src/app/(dashboard)/tool/[toolId]/page.tsx`:
   - Server Component.
   - Si toolId !== 'claude' y !== '3dsky' → redirect a /hub (en MVP solo esos dos están operativos).
   - Si toolId === 'claude' → renderiza `<ClaudeView />`.
   - Si toolId === '3dsky' → renderiza `<ThreeDSkyView />` (sesión 09).

2. Crear `src/components/screens/ClaudeView.tsx`:
   - Client Component.
   - Estructura:
     - Header con back button "← volver al hub", título "Claude" + indicador de estado, info de uso.
     - Lista de conversaciones (sidebar izquierdo): historial del usuario.
     - Panel principal: chat de la conversación actual.
   - Layout responsive desktop-first.

3. Crear `src/components/tool/ChatMessages.tsx`:
   - Adaptar `ClaudeMock` de `design/screens.jsx` (líneas 435-461), pero con mensajes reales.
   - Cada mensaje: avatar + "CLAUDE" o "SOFÍA" + content.
   - Soporta mostrar imágenes adjuntas al mensaje del user.
   - Botón "copiar" en cada respuesta de Claude.
   - Scroll automático al último mensaje.

4. Crear `src/components/tool/ChatInput.tsx`:
   - Input multilínea (textarea autoresize) abajo.
   - Área de preview de imágenes adjuntas (thumbnails con botón ✕ para eliminar).
   - Drag-and-drop sobre toda el área para adjuntar imágenes.
   - Click en ícono 📎 para abrir file picker.
   - Botón "→" para enviar (también con Enter, Shift+Enter para nueva línea).
   - Validaciones:
     - Máximo 5 imágenes por mensaje.
     - Máximo 5MB por imagen.
     - Solo PNG, JPEG, WebP, GIF.
   - Muestra spinner mientras la respuesta carga.

5. Crear `src/lib/utils/images.ts`:
   - Helper `fileToBase64(file: File): Promise<{ media_type, data }>`.
   - Helper `validateImage(file: File): { ok: boolean, error?: string }`.

6. Hook `src/lib/hooks/useClaudeChat.ts`:
   - State management de la conversación actual.
   - `sendMessage(prompt, images)` que llama a `/api/tools/claude/execute`.
   - Manejo de loading, error, conversationId.
   - Actualiza UI optimisticamente con el mensaje del user antes de recibir respuesta.

7. Sidebar de conversaciones:
   - Llama a `/api/me/conversations` al cargar.
   - Muestra título o primeras palabras del primer mensaje.
   - Click → carga esa conversación.
   - Botón "nueva conversación" arriba.

8. Cuando se carga una conversación:
   - GET `/api/me/conversations/[id]` trae mensajes.
   - Se renderizan en orden.

9. Botón de copiar:
   - Click en respuesta de Claude → copia al clipboard.
   - Toast: "Copiado al portapapeles".

10. Manejo de errores:
    - Si la API falla (no tiene acceso, no créditos, error de Anthropic), mostrar toast con mensaje claro.
    - Si una imagen es muy grande, validar localmente antes de enviar.

11. Test manual:
    - Loguearse como Sofia → ir al hub → click en Claude.
    - Escribir un prompt simple → recibir respuesta.
    - Adjuntar una imagen + prompt → recibir respuesta.
    - Refrescar la página → la conversación sigue en el sidebar.
    - Crear nueva conversación → arrancar limpia.
    - Copiar respuesta → ver que llega al clipboard.

12. Commit.

REGLAS:
- El componente principal es Client (necesita useState).
- Las imágenes se convierten a base64 EN EL CLIENTE antes de enviar.
- El sidebar se carga via fetch en useEffect (no via server).
- Después de enviar, hacer scroll al último mensaje.
- Mientras carga la respuesta, mostrar un placeholder "Claude está pensando..." con animación de pulse.

ARCHIVOS A REFERENCIAR:
- `design/screens.jsx` líneas 435-461 (ClaudeMock)
- `design/screens.css` (clases `.claude-mock`, `.chat-msg`, `.chat-input`, `.av`, `.body`, `.who`)
- `design/styles.css` (clases base)

UX ESPECÍFICAS:
- El input se enfoca automáticamente al cargar.
- Al apretar Enter se envía; Shift+Enter nueva línea.
- Las imágenes se previsualizan como thumbnails redondeados.
- El historial muestra solo las primeras 20 conversaciones (paginación futura).

AL FINAL:
`progress-07.md` con:
- Vista funcionando
- Soporte multimodal probado
- Próximo paso: `prompts/mvp/08-3dsky-adapter.md`
```

---

## VALIDACIÓN

- [ ] Vista de Claude se ve idéntica al diseño
- [ ] Texto-only funciona end-to-end
- [ ] Imágenes funcionan (subir, preview, enviar, recibir respuesta)
- [ ] Drag-and-drop de imágenes funciona
- [ ] Historial se carga y permite cambiar entre conversaciones
- [ ] Copiar al clipboard funciona
- [ ] Loading state se muestra correctamente
- [ ] Errores se muestran como toast

## Próximo paso

`prompts/mvp/08-3dsky-adapter.md`
