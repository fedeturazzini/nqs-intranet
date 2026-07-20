# Timeout Config Audit — generaciones largas de Claude (Vercel)

**Fecha:** 2026-06-29 · **Scope:** read-only (no se modificó código, migraciones ni deploy).
**Ramas revisadas:** `develop` (actual) y `main`.

> **TL;DR / Veredicto:** ✅ **La config del timeout está COMPLETA y MERGEADA en `develop` Y `main`.**
> `vercel.json` tiene `"fluid": true` y la **única** ruta que streamea a Anthropic
> (`/api/tools/claude/execute`) tiene `maxDuration = 300` + `runtime = "nodejs"`.
> No falta nada en el código. Único punto a confirmar fuera del repo: que el deploy
> de prod en vivo sea ≥ commit `6ccf1ea` y que Fluid Compute siga prendido en el dashboard.

---

## 1. `vercel.json`

- **Ubicación:** `nqs-ai-hub/vercel.json` (raíz del proyecto Vercel; el repo tiene el git root un nivel más arriba).
- **`"fluid": true` →** ✅ **SÍ**
- **Idéntico en `develop` y `main`** (confirmado: `git show main:…` también tiene `fluid: true`).
- **No hay bloque `functions` con `maxDuration`** → el límite se setea por-ruta con `export const maxDuration`, que es el patrón correcto en App Router.

Contenido tal cual:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "nextjs",
  "fluid": true,
  "regions": ["gru1"],
  "git": {
    "deploymentEnabled": {
      "main": true
    }
  }
}
```

---

## 2. Rutas que streamean a la API de Anthropic

**Método:** `grep` por `anthropic | messages.stream | /v1/messages | createMessage | stream`
en `src/app/api/**`, más patrones de streaming (`ReadableStream | TransformStream | ndjson |
text/event-stream | getReader | .stream(`) y rastreo de quién usa el SDK.

**Resultado: hay UNA sola ruta de streaming.**

| Ruta | ¿Streamea a Anthropic? |
|---|---|
| `src/app/api/tools/claude/execute/route.ts` | ✅ **SÍ** — única. Usa `getAdapter("claude")` (línea 81) y devuelve NDJSON en streaming. |
| `src/app/api/admin/system-prompts/[id]/activate/route.ts` | ❌ NO — **falso positivo**: matcheó por un comentario (`"…de Anthropic. La UI muestra modal…"`). Solo hace un UPDATE en DB, no llama a Anthropic ni streamea. |

**Dónde vive el SDK:** `src/lib/anthropic/client.ts` (`streamClaude`) → `src/lib/adapters/claude.ts`
(execute del adapter) → invocado **únicamente** desde `claude/execute/route.ts`. Ninguna otra
ruta de `app/api` importa el cliente/adapter ni produce una respuesta en streaming. (El chat de
Claude, el "brain" y las otras tools no abren otra ruta de streaming: el chat usa esta misma
ruta vía NDJSON; brain solo administra prompts en DB; 3DSky/Kling son iframes embebidos.)

---

## 3. Tabla por ruta de streaming

| archivo | maxDuration (sí/no + valor) | runtime nodejs (sí/no) | estado |
|---|---|---|---|
| `src/app/api/tools/claude/execute/route.ts` | ✅ SÍ — **300** | ✅ SÍ (`"nodejs"`) | **OK** |

Exports reales (líneas 28–29), con comentario que explica la sinergia con Fluid:

```ts
// (vercel.json "fluid": true) la espera de I/O a Anthropic no cuenta como
// Active CPU → no encarece tener la función abierta mientras streamea.
export const runtime = "nodejs";
export const maxDuration = 300;
```

> No hay ninguna otra ruta con `maxDuration` en todo `app/api` — y no hace falta, porque
> no hay otra ruta que streamee. **0 rutas PENDIENTES.**

---

## 4. Estado del branch

- **Commit responsable:** `6ccf1ea — fix(vercel): maxDuration 300s + Fluid Compute para generaciones largas`.
- **`git branch --contains 6ccf1ea` →** está en **`develop` y `main`** (además de un worktree local). ⇒ **mergeado a main, no quedó colgado.**
- **`git diff main develop`** sobre `vercel.json` y `claude/execute/route.ts` → **vacío** (idénticos en ambas ramas).
- **Verificación directa en `main`:** `vercel.json` con `fluid: true` ✅ y el execute route con `maxDuration=300` + `runtime="nodejs"` ✅.
- **Commits en `develop` sin mergear a `main`** (ninguno toca el timeout):
  - `fc1839c` feat(tools): pausar Kling y 3DSky como "Próximamente"
  - `cbbc431` feat(admin): eliminar usuario definitivamente + orden de tabla/accesos
- **PRs abiertos:** no se pudo consultar GitHub — `gh` no está instalado en este entorno.
  Pero a nivel git local el commit ya está en `main`, así que **el trabajo de
  `aux-vercel-pro-timeout` está mergeado** (si hubo PR, ya entró; no hay nada de timeout pendiente).

---

## 5. Otras rutas largas no-streaming (solo informativo)

Ninguna streamea ni se espera que pase de ~unos segundos (muy por debajo de 60s), así que
**no necesitan `maxDuration`** hoy. Listadas por las dudas:

- `src/app/api/admin/users/route.ts` (POST) — crea user: `auth.admin.createUser` + email (este último ya es fire-and-forget).
- `src/app/api/admin/users/[id]/route.ts` (DELETE `?hard=true`) — `auth.admin.deleteUser` + borrado en cascada.
- `src/app/api/admin/users/[id]/reset-password/route.ts` — `auth.admin.updateUserById`.
- `src/app/api/tools/claude/upload-url/route.ts` — genera signed URL de Supabase Storage.

> Nota: la **compresión de imágenes 30MB→4MB es client-side** (browser-image-compression en
> un Web Worker), no hay ruta de servidor que procese imágenes pesada. Por eso no aparece acá.

---

## Veredicto final

| Requisito | Estado |
|---|---|
| Plan Pro | ✅ (confirmado por vos, fuera del repo) |
| Fluid Compute en dashboard | ✅ (confirmado por vos; el repo solo puede verificar el flag `fluid: true` en `vercel.json`, que está) |
| `vercel.json` `"fluid": true` | ✅ en develop y main |
| `maxDuration = 300` en la ruta de streaming | ✅ en develop y main |
| `runtime = "nodejs"` en la ruta de streaming | ✅ en develop y main |
| Mergeado a main | ✅ (`6ccf1ea` está en main) |
| Rutas de streaming sin configurar | **0 (ninguna)** |

**No falta nada en el código.** No hay que agregar `maxDuration` a ninguna ruta ni mergear nada
del lado del timeout.

**Único chequeo que queda fuera del alcance del repo** (no se puede ver desde acá): que el
**deploy de prod en vivo** corresponda a un commit de `main` ≥ `6ccf1ea`. Como hubo varios
commits/deploys posteriores en `main`, lo más probable es que prod ya lo tenga; si querés
certeza absoluta, un redeploy de `main` garantiza que las funciones en vivo levanten
`maxDuration=300`.
