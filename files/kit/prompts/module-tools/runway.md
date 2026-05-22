# Módulo Tools — Runway

## Objetivo

Integrar Runway ML al stack (Gen-4 video, motion, lip-sync, frame interpolation).

**Duración**: 3 horas

---

## CONTEXTO ESPECÍFICO

- Runway tiene API pública: https://docs.dev.runwayml.com/
- Múltiples modelos (Gen-4 Image, Gen-4 Video, Gen-3 Alpha, lip-sync, image-to-video).
- Pricing por créditos Runway (no por segundo).
- Async como Kling.

---

## PROMPT

```
Integramos Runway al NQS AI Hub.

Pre-requisitos: 
- Leé `prompts/module-tools/_template.md`.
- Si ya implementaste Kling, podés reutilizar la infraestructura de `generation_tasks` y manejo async.

OBJETIVO:
Wrapper sobre Runway API con UI propia.

PASOS:

1. Setup:
   - API key de Runway (NQS la provee).
   - `npm install @runwayml/sdk` (si existe SDK oficial; sino fetch directo).

2. Adapter `src/lib/adapters/runway.ts`:
   - Similar a Kling.
   - Soporta múltiples modelos: definir como sub-tools internos.
   - `execute(userId, params)`:
     - params: { model: 'gen-4-video' | 'gen-4-image' | 'lip-sync', prompt, sourceImage?, sourceVideo?, ... }.
     - Routea según modelo.

3. UI con selector de modelo:
   - `src/components/screens/RunwayView.tsx`:
     - Tabs: Image | Video | Lip Sync | Frame Interpolation.
     - Cada tab tiene form específico.

4. Reutilizar `generation_tasks` del módulo Kling si ya existe.

5. Resto: similar a Kling.

AL FINAL:
`progress-runway.md`.
```

---

## VALIDACIÓN

- [ ] Cada modelo de Runway funciona
- [ ] Resultados se descargan
- [ ] Créditos descuentan según modelo
