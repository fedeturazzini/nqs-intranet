# Progress — Style sync con el diseño del cliente

**Fecha**: 2026-06-06
**Branch**: `develop`
**Tipo**: estilos (CSS / tokens / fuentes). Sin lógica, rutas ni datos.

## Objetivo
Matchear la app al diseño original de NQS (`_kit`/`files/kit/assets/client-design/`:
`styles.css`, `screens.css`, `NQS AI Hub.html`).

## Hallazgo principal
El proyecto **ya estaba sincronizado casi pixel-perfect** — se construyó a
partir de esos mismos archivos:

- **`components.css` (tokens)**: byte-idéntico a `styles.css` de referencia
  **salvo el accent**.
- **`screens.css`**: es el de referencia **+60 líneas** de features nuevas
  (Organigrama, etc.), con **0 reglas compartidas modificadas**. El avatar de
  Claude `#D97757` ya coincidía.
- **Fuentes**: las familias (Inter / JetBrains Mono / serif) ya eran las
  correctas; se cargaban por `@import` de Google Fonts.

O sea, lo que el prompt asumía "desalineado" (colores, fuentes sin cargar,
espaciados) en realidad ya estaba bien.

## Cambios aplicados
1. **Fuentes → `next/font`** (commit `b8b5884`): Inter + JetBrains Mono +
   Instrument Serif self-hosted por Next (sin request a Google en runtime, sin
   flash de fuente). Se eliminó el `@import` de Google Fonts de `globals.css`.
2. **Accent**: era la única divergencia real. Se consultó con Fede →
   ver `progress-style-sync-fix.md` (la decisión final usa los overrides del
   HTML del cliente).

## Verificación
```
npm run typecheck → OK
npm test          → 58/58
npm run build     → OK
```

## Próximo paso
Validación visual contra el HTML del cliente (la hace Fede). No se pushea
hasta que confirme.
