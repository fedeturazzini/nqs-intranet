# Check de feedback NQS — estado real contra el código

**Fecha:** 2026-07-28 · **Branches revisadas:** `develop` y `main` · **Modo:** READ-ONLY.
Verificado contra el código y los commits, no de memoria. Estados: **HECHO** (mergeado y funcional),
**PARCIAL** (a medias / solo audit / detrás de flag), **PENDIENTE** (no está).

## Tabla

| Punto | Estado | Dónde vive | Qué falta |
|---|---|---|---|
| **2.** Adjuntar imagen (cap de dimensiones + 401) | **HECHO** | Cap de dimensiones SIEMPRE (lado largo → 1568px, no solo por peso): `src/lib/utils/image-compression.ts` (`compressImageIfNeeded`, commit **756327b**). Refresh+retry ante 401 de upload-url: `src/lib/utils/images.ts` (`uploadImages`, commit **2e3b9c0**). | Nada funcional. Edge: si el browser no puede medir dimensiones (`createImageBitmap` falla) cae al criterio por peso — aceptable. |
| **3+7.** Deslogueo al navegar / cada tanto | **HECHO — pero solo en `develop`, NO en `main`/prod** | Refresh proactivo en TODA la app autenticada: `src/components/auth/SessionKeepAlive.tsx` montado en `src/app/(dashboard)/layout.tsx` (cubre hub/admin/tutoriales/organigrama/projects/tool) + `src/app/api/auth/refresh` devuelve `expiresAt`. Commit **1a80085**. | Pushear + deployar (hoy está en develop LOCAL, ni siquiera en origin) y **validar el timing >1h en preview**. |
| **4.** Respuesta/"procesando" desaparece al salir y volver | **PENDIENTE** | `src/lib/hooks/useClaudeChat.ts` (`loadConversation` solo lee la DB) + `src/app/api/tools/claude/execute/route.ts` (persistencia). | Las respuestas COMPLETADAS sí se recargan de la DB. Falta: (a) recuperar una respuesta **en vuelo** (si navegás mientras streamea, no se persiste ni se recupera — no hay `after()` que complete server-side, ni draft cliente); (b) al volver al chat no se re-abre la conversación en la que estabas (arranca una nueva). |
| **5.** Límite de imágenes | **PENDIENTE** (sigue en **5**) | `MAX_ATTACHMENTS = 5` en `src/lib/utils/images.ts:23` (y el mismo tope en `execute/route.ts`). | Si el pedido era subirlo a **10**: cambiar `MAX_ATTACHMENTS` (cliente) + `MAX_ATTACHMENTS` del `ExecuteSchema` (server). Hoy está en 5. |
| **6.** Prompt que no se muestra | **PARCIAL — solo audit, sin fix** | Diagnóstico: `prompt-no-visible-audit.md` (commit **6996e34**). El parser (`src/lib/utils/parse-artifacts.ts`) NO se tocó. | El fix real: fallback a **texto crudo** cuando el bloque de artifact no parsea (hoy se descarta en silencio), parser más tolerante (comillas/namespace/cierres). |
| **9.** Copiar en archivos generados | **HECHO para texto; N/A para binarios** | Texto (.txt/.md/código) = `ArtifactCard.tsx`: tiene **"⧉ copiar"** en la card y en el modal. Binarios (PDF/Word/Excel/PPT) = `FileCard.tsx`: solo **ver/descargar**. | El prompt/texto ya se copia. "Copiar" un PDF/Word/Excel al portapapeles no es estándar web (se descargan). Si NQS insiste en un botón copiar en esos, no está (y no aplica bien). |
| **10.** Pegar imagen con Ctrl+V | **PENDIENTE** | `src/components/tool/ChatInput.tsx` — tiene drag-drop (`onDrop`) y file picker (📎), **no** hay handler de `paste`. | Agregar `onPaste` en el textarea/contenedor que lea `e.clipboardData.files` y llame a `addFiles(...)` (reusa toda la lógica de compresión/validación ya existente). Cambio chico. |

## develop vs main (prod vs dev)

**En `develop` pero NO en `main`:** un solo commit → **`1a80085`** (el refresh proactivo de sesión, punto 3+7).

Todo lo demás ya está en `main`: cap de dimensiones (756327b), refresh 401 de upload (2e3b9c0),
logging (eb454ce), audits (6996e34), fix del loop /tool→/hub (eb75110), Opus/tokens (2a1ccd4/4cf190c),
proyectos privados, etc.

⚠️ **Doble salvedad sobre el punto 3+7:** `1a80085` está en `develop` **local** y **no se pudo pushear**
en esta sesión (el remote pide credenciales de GitHub que acá no hay). O sea: hasta que se haga
`git push origin develop` + deploy, el fix de deslogueo **no está en ningún lado accesible** (ni prod ni
preview). Es lo primero a destrabar.

## Resumen para NQS

- **Ya en prod (main):** punto **2** (adjuntar imagen: dimensiones + 401) ✅, punto **9** (copiar el
  texto/prompt generado) ✅.
- **Listo pero sin deployar (develop):** puntos **3+7** (deslogueo al navegar) — falta push + deploy + prueba de 1h.
- **A medias:** punto **6** (prompt no visible) — hay diagnóstico completo, falta el fix del parser.
- **Pendientes:** punto **4** (respuesta en vuelo al volver), punto **5** (sigue en 5, no 10), punto **10** (pegar con Ctrl+V).

### Archivos revisados
`image-compression.ts` · `images.ts` · `ChatInput.tsx` · `useClaudeChat.ts` · `execute/route.ts` ·
`ArtifactCard.tsx` · `FileCard.tsx` · `SessionKeepAlive.tsx` · `(dashboard)/layout.tsx` · `parse-artifacts.ts` · git log `main..develop`.
