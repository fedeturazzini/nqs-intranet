# Progress — Ocultar thinking y razonamiento meta de Claude

**Fecha**: 2026-06-07
**Branch**: `develop` (NO pusheado — validar en preview primero)
**Alcance**: chat de Claude. Sin migración, sin env nuevas, sin tocar la DB.

## Issue
Claude a veces mostraba al user su razonamiento interno: tags
`<thinking>…</thinking>` literales, o prosa meta en tercera persona
("The user said X which means Y, I will deliver Z"). El user solo debe ver el
output final.

## 3 fixes complementarios

### A) Extended thinking — AUDIT (no estaba habilitado) (`7049e14`)
Revisé `client.ts` y el adapter: **no hay** parámetro `thinking` /
`budget_tokens` en la llamada a la API. O sea, extended thinking **NO estaba
habilitado** → el issue NO viene de la API, sino de razonamiento que el modelo
emite como **texto** (tags `<thinking>` o prosa meta). No hubo cambio de código
en esta parte.

### B) System prompt técnico (`7049e14`)
Nueva sección `=== COMPORTAMIENTO ===` en `FORMAT_INSTRUCTIONS` (claude.ts):
- Responder directo, sin explicar el proceso de razonamiento.
- NUNCA `<thinking>`, ni frases meta en tercera persona, ni comentarios sobre
  el propio proceso, ni preámbulos (con la excepción de UNA frase breve antes
  de un artifact).
- Tono conversacional, en segunda persona ("vos").
Va al final del system prompt (después del cerebro del proyecto) para tener
prioridad. Aplica a todos los proyectos. **No se toca el Brain** (lo de Chule).

### C) Filtro en el frontend (`efd9a40`)
Defensa adicional (el regex no puede atrapar la prosa sin tags — eso es trabajo
del system prompt — pero sí los `<thinking>`):
- `cleanResidualTags` borra los bloques `<thinking>…</thinking>` completos (y
  tags sueltos) de los segmentos de texto.
- `hasIncompleteThinking` detecta un `<thinking>` abierto durante el streaming;
  `AssistantContent` oculta lo que sigue al tag abierto y muestra el indicador
  "Claude está pensando…" hasta que cierra.

## Conversaciones viejas
**Se limpian solas.** El filtro corre al **renderizar** cada mensaje, así que las
conversaciones viejas (las de Sofía con `<thinking>` crudos) se ven limpias
después del deploy. **No se modificó la DB.**

## Límite conocido
El **razonamiento en prosa sin tags** ("The user wants…") NO se puede filtrar
con regex — depende del system prompt (B). Si igual aparece algún caso, suele
ser porque el prompt del proyecto (Brain) lo induce. En ese caso: screenshot
del caso puntual y se refina.

## Verificación
```
npm run typecheck → OK
npm test          → 69/69  (+2 de <thinking>)
npm run build     → OK
```

## Commits (en `develop`, **NO pusheados**)
- `7049e14` fix(claude): system prompt previene razonamiento meta + audit thinking
- `efd9a40` fix(parser): filtrar <thinking> en el frontend
- (este doc)

## Próximo paso
Validar en preview de `develop` → merge a `main`.
