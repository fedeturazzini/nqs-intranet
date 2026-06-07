# Progress — Consistencia de títulos en respuestas de Claude

**Fecha**: 2026-06-07
**Branch**: `develop` (NO pusheado — validar en preview primero)
**Alcance**: solo system prompt técnico. Sin migración, sin env, sin frontend.

## Issue
Claude alternaba el formato de los títulos de sección:
- a veces `## 10 ideas` → header serif italic (lindo),
- a veces `**10 ideas:**` → texto bold sans (otra pinta).
Respuestas con la misma estructura se veían distintas entre conversaciones.

## Cambio (`344116d`)
Se agregó una **REGLA DE TÍTULOS** al final de la sección
`=== FORMATO DE RESPUESTAS ===` del `FORMAT_INSTRUCTIONS` (en
`src/lib/adapters/claude.ts`):
- Usar SIEMPRE `## Título` (header H2) para encabezar secciones.
- NUNCA `**Título:**` ni `**Título**` para titular.
- El bold queda solo para enfatizar palabras dentro de un párrafo.

Aplica a todos los proyectos (va en el prompt técnico, no en el Brain). El
`MarkdownRenderer` ya rinde los `##` con la tipografía serif del design system.

## Verificación
```
npm run typecheck → OK
```
(Cambio de string en el system prompt; sin impacto en tests/build. El efecto
real se valida pidiéndole títulos a Claude en preview.)

## Próximo paso
Validar en preview: pedir 3 veces "Dame 10 ideas sobre X" en conversaciones
distintas → las 3 deben usar `## 10 ideas` (serif italic), no `**10 ideas:**`.
Luego merge `develop` → `main`. Pendientes: Kling, lock por dispositivo,
entrega final.
