# Progress — Mini-fix de artifacts (3 issues visuales)

**Fecha**: 2026-06-07
**Branch**: `develop` (NO pusheado — validar en preview primero)
**Alcance**: chat de Claude. Sin migración, sin env nuevas.

## Issues resueltos

### Issue 1 — tags `</invoke> </function_calls>` residuales (`9d41a88`)
A veces quedaban tags sueltos en el texto después de la card.
- `ARTIFACT_RE` más tolerante: whitespace flexible (`\s+`/`\s*`) + flag `i`.
- `cleanResidualTags()` borra cualquier tag de artifact suelto
  (`function_calls`/`invoke`/`parameter`) de los segmentos de texto y colapsa
  líneas vacías. Es el safety net: aunque el regex no matchee un caso raro, el
  texto sale limpio.
- Durante streaming, `AssistantContent` ya cortaba el contenido en el
  `<function_calls>` sin cerrar (no muestra el XML parcial).
- +2 tests (residuales + regex tolerante).

### Issue 2 — botón "Ver" + modal de preview (`e0214b9`)
Antes solo se podía copiar/descargar a ciegas. Ahora la card tiene
**Ver | Copiar | Descargar**.
- "Ver" abre un modal (en `createPortal`, cierra con **esc** o click afuera)
  que renderiza el contenido según el tipo:
  - `text/markdown` → `MarkdownRenderer`.
  - `application/vnd.ant.code` → markdown con highlight (fence de 4 backticks
    por si el código trae bloques de 3 adentro).
  - resto (`text/plain`, `text/html`, …) → monospace con wrap.
- El modal reusa las clases `.modal-bd`/`.modal`/`.modal-hd` y tiene Copiar +
  Descargar arriba. El download se compartió en `downloadArtifact()`.

### Issue 3 — overflow horizontal (`04f49f7`)
Código/tablas largas empujaban el chat hacia la derecha.
- **Causa raíz**: `.chat-msg .body` (flex child) no tenía `min-width: 0`, así
  que el `<pre overflow-x:auto>` expandía el contenedor en vez de scrollear
  interno. Fix: `min-width: 0` + `max-width: 100%`.
- `.md-body`: `min-width:0`, `max-width:100%`, `overflow-wrap:break-word`.
- `.md-body pre`: `max-width:100%`; `pre code` → `inline-block` + `min-width:100%`.
- `.md-body table`: `display:block` + `width:max-content` + `overflow-x:auto`
  (patrón GitHub: scroll interno sin romper el layout de la tabla).
- **Light mode**: bloques de código con fondo claro (`var(--bg-elev-2)`) y
  tokens en color de texto (highlight monocromo, legible). En **dark** se deja
  el github-dark con todos sus colores.

## Verificación

```
npm run typecheck → OK
npm test          → 67/67  (+2 del parser)
npm run build     → OK
```
Validación manual (tags limpios, modal Ver, scroll interno de código/tablas,
light/dark): la hace Fede en preview.

## Nota
- En **light mode** el código pierde los colores de syntax highlight (queda
  monocromo legible). Si se quiere highlight con colores también en light,
  habría que importar un theme claro de highlight.js scopeado por `data-theme`
  (queda para más adelante).

## Commits (en `develop`, **NO pusheados**)
- `9d41a88` fix(artifacts): regex tolerante + limpieza de tags residuales
- `e0214b9` feat(artifacts): botón "Ver" + modal de preview
- `04f49f7` fix(chat): overflow horizontal en código/tablas/mensajes largos
- (este doc)

## Próximo paso
Validar en preview de `develop` → merge a `main`.
