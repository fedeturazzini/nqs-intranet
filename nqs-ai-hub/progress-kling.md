# Progress — Habilitar Kling como tool (clon de 3DSky)

**Fecha**: 2026-06-07
**Branch**: `develop` (NO pusheado — validar en preview primero)
**Requiere**: aplicar `supabase/apply-remote-kling.sql` (1 UPDATE). Sin env nuevas.

## Hallazgo: la arquitectura ya era genérica
La mayor parte del trabajo NO fue necesaria porque el sistema es DB-driven:
- **`ToolId` ya incluía `kling`** y el **seed de `tools` ya tenía la fila kling**
  (con `is_active=FALSE`). → la migration es un **UPDATE** (prenderla), no insert.
- **Créditos genéricos**: `credit_allocations` + `credit_pools` +
  `consume_credit_atomic(p_tool_id)` están keyed por `tool_id`. **No hay tablas
  3dsky-específicas** → no se crean tablas nuevas.
- **Hub** (`listToolsWithAccess`) y **admin/access** (`AccessPanel` itera tools
  desde DB) → kling **aparece solo** al prender `is_active`. Routing del hub es
  `/tool/${tool.id}` (genérico).
- **Defaults de user**: el alta solo otorga `3dsky` → kling queda **OFF por
  default automáticamente** (sin cambios).
- **Aprobación de solicitudes** (acceso + créditos) ya es genérica por `tool_id`.

## Qué se construyó (commits, en `develop`, NO pusheados)

| Commit | Qué |
|--------|-----|
| `7080189` | Migration 0011 (UPDATE kling → is_active+uses_credits) + `KlingAdapter` (clon del de 3DSky) + registro en el adapters registry |
| `cf7e340` | 5 endpoints `/api/tools/kling/*` (embed-url, credits, session/start, session/end, request-credits) — clones de 3DSky |
| `17aa986` | `/tool/kling` (page + `KlingView`) + parametrización de `useThreeDSkySession` y `CreditRequestModal` con `toolId` opcional |
| `4e21955` | `/admin/credits` multi-tool (selector de tools con créditos; default 3dsky) |

### Archivos
**Nuevos**: `supabase/migrations/0011_enable_kling.sql`, `supabase/apply-remote-kling.sql`,
`src/lib/adapters/kling.ts`, `src/app/(dashboard)/tool/kling/page.tsx`,
`src/components/screens/KlingView.tsx`, y 5 `route.ts` bajo `src/app/api/tools/kling/`.
**Modificados**: `src/lib/adapters/index.ts` (registrar), `admin/credits/page.tsx`
(multi-tool), `useThreeDSkySession.ts` + `CreditRequestModal.tsx` (param `toolId`).

> **3DSky quedó intacto**: la parametrización del hook y el modal usa default
> `"3dsky"`, así que todos los call sites de 3DSky son byte-idénticos en
> comportamiento. No se tocó ningún archivo de 3DSky.

## Créditos
- **Pool separado** (filas de `credit_pools`/`credit_allocations` con
  `tool_id='kling'`), misma mecánica que 3DSky. Pool inicial **vacío**.
- **Flow del admin** (heads-up): comprar créditos en kling.ai con la cuenta del
  estudio → registrar la compra en `/admin/credits?tool=kling` (suma al pool) →
  asignar a users con los +/-. El user pide más con "pedir créditos".

## Default OFF
Users nuevos: solo 3DSky activo (Lun-Vie 9-18). Kling **no** se otorga solo —
el admin lo habilita por user en `/admin/access` (con horarios opcionales).

## Logs
- **Sesiones**: igual que 3DSky, se trackean en `module_sessions`
  (`tool_id='kling'`, entered/exited). No se usa `usage_logs` (3DSky tampoco).
- **Logs USD** (`/admin/logs`): **no aplica** a Kling — no es API, no hay costo
  por llamada calculable de nuestro lado. El gasto de Kling se ve en la factura
  de kling.ai. Si en el futuro se quiere trackear, sería una pantalla aparte.

## ⚠️ Riesgo: embedding en iframe
Kling, como muchas SPAs con auth, **puede bloquear** ser embebida en iframe
(`X-Frame-Options` / CSP `frame-ancestors`). Un `HEAD` a la URL dio `405`
(inconcluso). Se replicó el patrón directo de 3DSky (iframe vía `getEmbedUrl`).
Si en la práctica Kling no carga en el iframe, **no es bug del código** — la
solución sería abrir en pestaña nueva (cambio chico, follow-up). A validar en
preview.

## Verificación
```
npm run typecheck → OK
npm test          → 71/71
npm run build     → OK  (manifest muestra /tool/kling + los 5 /api/tools/kling/*)
```

## PRÓXIMO PASO (acción tuya)
1. **Aplicar `supabase/apply-remote-kling.sql`** en el SQL Editor de Supabase
   (1 UPDATE; sin esto kling queda como "próximamente" en el hub). No cambia el
   schema → no hace falta regenerar types.
2. Validar en preview (catálogo, solicitar acceso, aprobar, iframe, créditos).
3. Si el iframe de Kling no carga → avisame y lo paso a "abrir en pestaña".
