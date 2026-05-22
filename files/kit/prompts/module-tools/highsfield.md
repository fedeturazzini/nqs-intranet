# Módulo Tools — Highsfield (Higgsfield)

## Objetivo

Integrar Highsfield al stack (movimientos de cámara cinematográficos sobre AI video).

**Duración**: 2.5 horas

---

## CONTEXTO ESPECÍFICO

- Highsfield es relativamente nuevo, verificar estado de API pública al momento de implementación.
- Si no tiene API pública: opción B (iframe + proxy) o C (iframe directo).
- Si tiene API: similar a Kling/Runway.

---

## PROMPT

```
Integramos Highsfield al NQS AI Hub.

Pre-requisitos: leé `prompts/module-tools/_template.md`.

PASOS:

1. Verificar estado de Highsfield al momento de implementación:
   - ¿Hay API pública? Si sí → opción A.
   - Si no, ¿permite embedding? → opción C.
   - Si no permite embedding fácil, configurar proxy → opción B.

2. Si opción A (API directa):
   - Seguir patrón de Kling/Runway.
   - Crear adapter, vista, endpoints.

3. Si opción B/C (iframe):
   - Seguir patrón de Weavy o 3DSky.
   - Adapter con `getEmbedUrl`.
   - Vista con `<EmbeddedSite />`.

4. Resto: standard según el template.

AL FINAL:
`progress-highsfield.md`.
```

---

## VALIDACIÓN

- [ ] Tool funcional según opción elegida
- [ ] Permisos y logs correctos
