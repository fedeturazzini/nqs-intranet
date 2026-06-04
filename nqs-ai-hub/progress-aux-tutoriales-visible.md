# Progress aux — Tutoriales siempre visible + flow de solicitud

**Fecha**: 2026-06-04
**Branch**: `develop`
**Tipo**: ajuste corto sobre `progress-aux-tutoriales-acceso.md`.

## Verificación
```
npm run typecheck → OK
npm test          → 58/58
npm run build     → OK
```

## Cambio aplicado

El prompt anterior ocultaba el item TUTORIALES del navbar si el user no
tenía acceso (mala UX: el user no sabía que existía). Ahora:

### 1. Tutoriales SIEMPRE visible (`faf46ee`)
- El item TUTORIALES se muestra para todos los users, idéntico, sin
  indicador de bloqueo.
- Se quitó la plomería `hasTutoriales` (layout → Topbar → TopbarNav) — una
  query `canUseTool` menos por page load.

### 2. Flow de solicitud al entrar sin acceso (`61e852e`)
- `/tutoriales` sin acceso → pantalla **"ACCESO BLOQUEADO"** (no 404) con:
  - Botón **"solicitar acceso al admin →"** (un click).
  - Botón secundario **"volver al hub"**.
- El botón hace `POST /api/me/access-request` (toolId='tutoriales') → crea
  el `access_request` + notifica a **Slack** (@channel, formato
  simplificado del prompt 16). **Reusa el endpoint y la tabla existentes.**
- **Estado pendiente**: la page chequea si ya hay una solicitud `access`
  pendiente del user para tutoriales; si sí, el botón arranca como
  "solicitud pendiente" (deshabilitado). Tras enviar, pasa a pendiente.
- **Rechazo**: si el admin rechaza, el user puede volver a pedir.

## Consistencia con otras tools
- Usa el **mismo endpoint** (`/api/me/access-request`) y la **misma tabla**
  (`access_requests`) que las solicitudes de Claude/3DSky.
- La solicitud aparece en `/admin/solicitudes` junto a las demás, con los
  **quick access buttons** ([1 día][3 días][1 semana][permanente][custom]).
- Aprobar setea `tool_access` para tutoriales correctamente (el approve
  route es genérico por `request_type='access'`).

## Testing (validar en preview)
1. User nuevo (default OFF) → login → **TUTORIALES visible** en el navbar.
2. Click → pantalla "ACCESO BLOQUEADO" + botón solicitar.
3. Click solicitar → toast "Solicitud enviada" + botón → "solicitud
   pendiente". Slack recibe la notif con @channel.
4. Admin en /admin/solicitudes → aprueba con [1 día] → user refresca →
   ve el catálogo.
5. Admin revoca en /admin/access → user refresca → vuelve el gate.

## Próximo paso
Validar en preview → merge `develop` → `main`. Después: prompts pendientes
o entrega final.
