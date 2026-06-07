# Progress — Artifacts visuales como cards + botón copiar

**Fecha**: 2026-06-07
**Branch**: `develop` (NO pusheado — validar en preview primero)
**Alcance**: chat de Claude. Sin migración, sin env nuevas.

## Cambio de estrategia

En el prompt anterior (`progress-chat-fix.md`, PARTE 4) le pedíamos a Claude que
**NO** usara artifacts. Pero el modelo los genera igual (está entrenado fuerte
para eso) y aparecían como XML crudo, feo.

**Nuevo enfoque: los abrazamos.** Claude puede generar artifacts; la app los
**parsea** y los muestra como **cards descargables** (estilo Claude.ai, diseño
NQS).

## Qué se hizo

### 1. System prompt permite artifacts (`80aec85`)
`FORMAT_INSTRUCTIONS` (en `claude.ts`) pasó de "no uses artifacts" a "usalos
cuando convenga", con la sintaxis estándar `<function_calls><invoke
name="artifacts">…`. Aplica a todos los proyectos. Patrón sugerido: respuesta
breve en el chat + contenido pesado en el artifact.

### 2. Parser (`8705bd5`)
`src/lib/utils/parse-artifacts.ts`:
- `parseMessageWithArtifacts(content)` → segmentos ordenados `text` | `artifact`.
- `hasIncompleteArtifact(content)` → detecta artifact a medio llegar (streaming).
- Usa `matchAll` (no arrastra `lastIndex`). +7 tests.

### 3. ArtifactCard (`eb856e4`)
`src/components/chat/ArtifactCard.tsx`: card con ícono + título + tipo + botones
**Copiar** (feedback ✓) y **Descargar** (Blob con la extensión correcta, nombre
sanitizado sin doble extensión). `ArtifactGeneratingPlaceholder` con spinner.
CSS en `screens.css`.

### 4. Integración + botón copiar (`a2c88a3`)
- `ChatMessages` → `AssistantContent` separa texto (markdown) de artifacts
  (cards). Durante streaming oculta el XML parcial y muestra el placeholder.
- Barra al pie de cada mensaje de Claude (hover): **Copiar** copia el contenido
  limpio (texto + contenido de los artifacts, sin el XML). Reemplaza el copiar
  del header.
- `MarkdownRenderer`: se quitó `cleanupArtifactSyntax` (ya no hace falta; el
  renderer recibe solo texto).

## Tipos de artifacts soportados

| `type` | Extensión | Uso |
|--------|-----------|-----|
| `text/plain` | `.txt` | texto plano, prompts largos |
| `text/markdown` | `.md` | documentos formateados |
| `text/html` | `.html` | html |
| `application/vnd.ant.code` (+ `language`) | `.js/.ts/.py/.css/.json/.sh/.sql/.yaml/…` | código |
| (otro) | `.txt` | fallback: se baja como texto |

## Comportamiento durante streaming

- Mientras el `<function_calls>` está abierto sin cerrar → se oculta el XML
  parcial y se muestra **"Generando archivo…"** con spinner.
- Al cerrarse → el placeholder se reemplaza por la card completa.
- El texto conversacional antes del artifact se renderiza normal mientras tanto.

## Notas

- **Conversaciones viejas**: las que tenían artifacts como XML crudo ahora se
  ven como cards (el parser corre al renderizar; no hace falta migrar nada).
- **Tipos no soportados** (React, SVG, Mermaid): la card aparece igual, pero el
  contenido se baja como `.txt`. No rompe; si pasa seguido, agregar handlers.
- **Copiar/descargar**: `navigator.clipboard` y Blob requieren secure context
  (HTTPS en Vercel; localhost también cuenta). OK.

## Verificación

```
npm run typecheck → OK
npm test          → 65/65  (+7 del parser)
npm run build     → OK
```
Validación manual (pedir contenido largo → card; copiar; descargar; streaming;
no-regresiones de markdown/imágenes/lightbox/detener): la hace Fede en preview.

## Commits (en `develop`, **NO pusheados**)
- `80aec85` feat(claude): permitir artifacts en el system prompt
- `8705bd5` feat(artifacts): parser + tests
- `eb856e4` feat(artifacts): ArtifactCard (copiar + descargar)
- `a2c88a3` feat(chat): cards en mensajes + botón copiar al pie
- (este doc)

## Próximo paso
Validar en preview de `develop` → merge a `main`. Después: Kling, lock por
dispositivo, entrega final.
