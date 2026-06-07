# Progress — Subir max_tokens + manejar respuestas cortadas

**Fecha**: 2026-06-07
**Branch**: `develop` (NO pusheado — validar en preview primero)
**Alcance**: chat de Claude. Sin migración, sin env nuevas.

## Issue
El header de los mensajes mostraba `OUT 4096` exacto = la respuesta se cortaba
al llegar al techo de `max_tokens`. Si se cortaba **dentro de un artifact**, el
`</function_calls>` nunca llegaba y el frontend mostraba **"Generando
archivo…" colgado para siempre**.

## 3 fixes

### 1. max_tokens 4096 → 8192 (`a345840`)
`client.ts`: `DEFAULT_MAX_TOKENS = 8192` + `maxTokensFor(model)` (Haiku queda en
4096, Sonnet/Opus 8192). **No aumenta costo**: solo se pagan los tokens
realmente generados; `max_tokens` es un techo.

### 2. Detectar respuestas cortadas (`13463cf`)
`streamClaude` ya devolvía `stopReason`. Lo plumbeamos hasta la UI:
`ExecuteResult.stopReason` → evento `done` del NDJSON → `ChatMessage.stopReason`
en `useClaudeChat`. Si `stopReason === "max_tokens"`, el mensaje muestra un
aviso al pie: **"⚠ Respuesta cortada por el límite de longitud. Pedile a Claude
que continúe."**

### 3. Resolver el placeholder colgado (`13463cf`)
- `useClaudeChat` ahora marca `streaming` en el mensaje (`true` entre el 1er
  chunk y `done`; `false` en `done`/abort/error).
- `AssistantContent`: si el artifact está incompleto y **ya no streamea**
  (cortado), en vez del placeholder muestra una **card parcial**
  (`extractPartialArtifact`) con badge **"⚠ INCOMPLETO"** — el user puede
  ver/copiar/descargar lo que sí se generó, y mandar "continuá".
- Si todavía streamea, sigue el placeholder "Generando…" normal.

Esto arregla también las **conversaciones viejas** (las que ya tenían un
artifact cortado): al renderizar se ven como card incompleta, no colgadas. **Sin
tocar la DB.**

## Verificación
```
npm run typecheck → OK
npm test          → 71/71  (+2 de extractPartialArtifact)
npm run build     → OK
```

## Testing manual (preview)
- Pedir respuesta larga → header `OUT` < 8192 (no se corta).
- Forzar el corte ("dame 30 prompts de 300 palabras") → si llega a 8192,
  aparece el aviso al pie.
- Forzar un artifact cortado → card con badge "⚠ INCOMPLETO" (no placeholder
  colgado); "continuá" lo sigue.
- No-regresiones: respuestas cortas, streaming, artifacts completos (sin badge).

## Commits (en `develop`, **NO pusheados**)
- `a345840` fix(claude): subir max_tokens a 8192
- `13463cf` feat(chat): manejar respuestas cortadas por max_tokens
- (este doc)

## Próximo paso
Validar en preview → merge a `main`. Si se quiere más velocidad: prompt caching
de Anthropic (otro prompt).
