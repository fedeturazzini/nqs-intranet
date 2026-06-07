# Progress — Fix del chat de Claude (feedback de Chule)

**Fecha**: 2026-06-07
**Branch**: `develop` (NO pusheado — validar en preview primero)
**Alcance**: un solo módulo (el chat de Claude). Sin migración, sin env nuevas.

## Issues resueltos

| # | Issue de Chule | Estado | Cómo |
|---|----------------|--------|------|
| 1 | Tarda 1+ min en arrancar | ✅ ya resuelto | Streaming ya estaba implementado (ver abajo). El 1-min era el viejo `messages.create()` sin stream, ya migrado. |
| 2 | Markdown crudo (`**`, `##`) | ✅ | `react-markdown` v10 + `remark-gfm` + `rehype-highlight`. |
| 3 | Rechaza imágenes >10MB | ✅ | Tope 30MB + compresión client-side a ~4MB. |
| 4 | XML raro (`<function_calls>`) | ✅ | System prompt anti-artifacts + parser de fallback. |
| 5 | Se traba al click en imagen mientras responde | ✅ | Lightbox en `createPortal` + auto-scroll que no interrumpe. |
| 6 | Mensajes largos cortados | ✅ | Nunca hubo truncado; con markdown se ven completos. |
| — | (extra) Detener generación | ✅ | Botón "■ detener" con AbortController. |

## PARTE 0 — Auditoría de streaming (no se reimplementó)

**Streaming ya estaba 100% implementado** (lo hizo el prompt de streaming anterior):
- **Backend** `/api/tools/claude/execute`: devuelve un `ReadableStream` con
  NDJSON (`{type:"delta"|"done"|"error"}`); el adapter usa `streamClaude`
  (`messages.stream()` del SDK) con callback `onText`.
- **Frontend** `useClaudeChat`: lee `res.body.getReader()`, parsea NDJSON y
  pinta el texto en vivo.
- **Indicador**: `ThinkingIndicator` con contador de segundos hasta el primer
  chunk.

→ Se saltó la PARTE 1 (no se tocó el streaming). Nota: usa **NDJSON**, no SSE
`text/event-stream` como sugería el prompt — es equivalente y ya funciona.

## PARTE 2 — Markdown

- `src/components/chat/MarkdownRenderer.tsx` (nuevo): memoizado, **no renderiza
  HTML crudo** (seguro contra inyección desde la respuesta), links en pestaña
  nueva. react-markdown v10 ya no pasa `inline` al `code` → se distingue inline
  vs bloque por CSS.
- Estilos `.md-body` en `screens.css` (on-brand: serif en headers, mono en
  código, accent en links). Tema `github-dark` de highlight.js importado en
  `globals.css`.
- `ChatMessages`: las respuestas del asistente usan `<MarkdownRenderer>`; los
  mensajes del user siguen en texto plano.

## PARTE 3 — Imágenes hasta 30MB + compresión

- `src/lib/utils/image-compression.ts` (nuevo): `compressImageIfNeeded` con
  `browser-image-compression` (Web Worker). Deja igual las <4MB; comprime el
  resto a `maxSizeMB: 4`, `maxWidthOrHeight: 2048`, `initialQuality: 0.85`.
- `images.ts`: `MAX_IMAGE_BYTES` 10→30MB (tope de **entrada**).
- `ChatInput`: comprime al adjuntar, muestra "⏳ optimizando imagen…", bloquea
  el envío mientras comprime, loguea el ratio en consola (`18.0MB → 3.8MB`).
- **Por qué 4MB**: Anthropic acepta hasta 5MB/imagen; dejamos margen. Si una
  comprimida igual superara 5MB (raro), Anthropic devuelve error y el adapter
  lo maneja.

## PARTE 4 — Artifacts

- `claude.ts`: se appendea `FORMAT_INSTRUCTIONS` **al final** del system prompt
  de cada proyecto (para que tenga prioridad sobre el cerebro). Pide markdown
  estándar y prohíbe `<function_calls>`, `<invoke>`, `<artifact>`, etc.
- Fallback en `MarkdownRenderer`: si igual aparece, lo envuelve en un code fence
  (no rompe el render).

## PARTE 5 — UX

- **Detener generación**: botón "■ detener" mientras streamea → `AbortController`
  aborta el fetch; el texto parcial se conserva (no se marca error). _Nota_: el
  server sigue su curso y guarda la respuesta completa en DB, así que al recargar
  la conversación se ve completa (mejor que perderla).
- **Auto-scroll respetuoso**: si el user scrollea arriba, no lo pegamos al
  fondo; al mandar mensaje nuevo, sí. Antes saltaba en cada chunk.
- **Lightbox en portal**: `createPortal(document.body)` → abrirlo durante el
  streaming no interfiere.
- **Mensajes largos**: siempre completos (no había truncado).

## Verificación

```
npm run typecheck → OK
npm test          → 58/58
npm run build     → OK  (react-markdown, highlight.js CSS y browser-image-
                         compression bundlean sin problema)
```
Validación manual (velocidad, markdown, compresión real, detener, etc.): la
hace Fede en preview — ver checklist del prompt.

## Dependencias nuevas
`react-markdown@10`, `remark-gfm@4`, `rehype-highlight@7`, `highlight.js@11`,
`browser-image-compression@2`.
> `npm audit` reporta 2 moderate, pero son de `postcss` (dependencia **interna
> de Next**, preexistente) — NO de estas libs. No tocar (`audit fix --force`
> querría degradar Next).

## Commits (en `develop`, **NO pusheados**)
- `b444f0b` feat(chat): renderizar markdown
- `a20c1fa` feat(chat): imágenes hasta 30MB con compresión
- `f0f1708` fix(claude): system prompt sin artifacts
- `7e7225b` feat(chat): botón detener generación
- `1644aa2` fix(chat): interacción fluida durante streaming
- (este doc)

## Próximo paso
Validar en preview de `develop` (el módulo más usado — probar exhaustivo) →
si OK, merge a `main`.
