# Progress — Style sync FIX (overrides del HTML del cliente)

**Fecha**: 2026-06-06
**Branch**: `develop`
**Tipo**: estilos. Corrige 3 valores que el style-sync base no contempló.

## Contexto
El style-sync usó los valores del **CSS base** del cliente (`styles.css`), pero
el **HTML principal** (`NQS AI Hub.html`) tiene overrides que cambian lo que
realmente se ve en el mock:

```html
<style>:root { --serif: "Instrument Serif", "Times New Roman", serif; }</style>
<script>const TWEAK_DEFAULTS = { "theme": "light", "accent": "#ffcb5c", ... };</script>
```

Es decir, el mock renderizado arranca con: **Instrument Serif**, **tema light**
y **accent `#ffcb5c`** (no Times, no dark, no `#e8ff3d`).

## Ajustes aplicados

### 1. Serif → Instrument Serif  (commit `b8b5884`)
- `layout.tsx`: se agrega `Instrument_Serif` a `next/font/google`
  (`weight: "400"`, `style: ["normal","italic"]`, `variable: "--font-serif"`).
- `components.css`: `--serif: var(--font-serif), "Instrument Serif",
  "Times New Roman", "Times", serif;`
- (Antes el base usaba Times New Roman; Instrument Serif es más editorial,
  italic elegante — los títulos del diseño lo usan.)

### 2. Accent light → `#ffcb5c`  (commit `55b34ee`)
- `[data-theme="light"]` → `--accent: #ffcb5c` (amarillo dorado cálido,
  override de `TWEAK_DEFAULTS`).
- Dark mode queda con `#e8ff3d` (amarillo señalética del CSS base).
- Como la app arranca en **light**, el accent visible por defecto es `#ffcb5c`.
- El botón del email de bienvenida ya estaba en `#ffcb5c` (fondo claro) → sin
  cambios.

### 3. Tema default → light  (sin cambios necesarios)
- **Ya estaba en light** en toda la cadena:
  - DB: `users.theme_preference NOT NULL DEFAULT 'light'` (migration 0005).
  - `auth/server.ts`: `theme = preference === "dark" ? "dark" : "light"`.
  - `layout.tsx`: `const theme = session?.theme ?? "light"` → SSR
    `<html data-theme="light">` (sin flash dark→light).
- El `ThemeToggle` sigue funcionando y persistiendo la preferencia del user.

## Verificación
```
npm run typecheck → OK
npm test          → 58/58
npm run build     → OK  (next/font baja Instrument Serif sin errores)
```

## Commits
- `55b34ee` — style(tokens): accent según los mocks del cliente (light #ffcb5c)
- `b8b5884` — style(fonts): self-host Inter + JetBrains Mono + Instrument Serif

## A tener en cuenta
- **No se pushea** hasta que Fede valide visualmente contra el HTML del cliente
  (login con títulos en Instrument Serif italic, fondo crema `#f5f1e8`, botones
  `#ffcb5c`).
- Si Chule prefiere otro accent, es una línea de CSS (`--accent` en el bloque
  `[data-theme="light"]`).

## Próximo paso
Validación visual de Fede → si OK, mergear `develop` → `main`. Pendientes del
MVP siguen igual (Resend, organigrama, deploy).
