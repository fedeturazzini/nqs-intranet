# Progress aux — Streaming de Claude + contador de "pensando"

**Fecha**: 2026-06-05
**Branch**: `develop`
**Tipo**: fix de fondo + UX.

## Problema
Claude tiraba **"Request timed out."** con prompts grandes. Causa: el cliente
usaba `messages.create()` (no streaming), que **espera la respuesta completa**
antes de devolver; con el cerebro de un proyecto (~8k tokens) + una respuesta
larga, pasaba el `timeout` de 60s del SDK.

## Solución — streaming end-to-end (`3cbea1c`, `be38a71`)
- **`client.ts`**: `streamClaude()` usa `messages.stream()`. Con streaming el
  timeout se **renueva por chunk**, así que las generaciones largas ya no se
  cortan. Emite `onText(delta)` por cada fragmento. (timeout 60s → 120s.)
- **Adapter**: `execute` acepta `onText`; usa `streamClaude`.
- **Endpoint** `/api/tools/claude/execute`: responde **NDJSON** por un
  `ReadableStream` — eventos `delta` / `done` / `error`. `export const
  maxDuration = 60` para que Vercel no mate la función.
- **`useClaudeChat`**: consume el stream y **pinta el texto en vivo** (limpia
  el "pensando" en el primer delta; setea conversationId/messageId/tokens en
  `done`).
- **Contador**: mientras Claude piensa (antes del primer fragmento), el bubble
  muestra **"Claude está pensando… Ns"** con segundos que suben, como el
  Claude original.

## Verificación
```
npm run typecheck → OK
npm test          → 58/58
npm run build     → OK
```

## A tener en cuenta
- En **Vercel**, `maxDuration = 60` cubre respuestas de hasta ~60s de
  streaming (en Hobby es el techo). Para respuestas más largas habría que
  subir de plan; igual el user ve el texto aparecer mientras tanto.
- Para probar en **dev**, asegurate de lanzar el server sin la
  `ANTHROPIC_API_KEY` vacía del shell:
  `env -u ANTHROPIC_API_KEY npm run dev`.

## Próximo paso
Probar en vivo (mandar un mensaje grande a Claude → ver el contador y el
texto en vivo, sin timeout). Luego merge `develop` → `main`.
