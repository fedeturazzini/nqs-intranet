# Progress 15 — Solicitud de acceso a tools bloqueadas

**Fecha**: 2026-05-28
**Duración real**: ~1.5 horas
**Sesión anterior**: `progress-13.md`
**Próxima sesión**: `kit/prompts/mvp/12-deploy.md`

> Mejora detectada en testing: faltaba que un user pudiera pedir acceso a una tool que el admin no le habilitó. Sin migration nueva — la 0007 ya soporta `request_type='access'`.

## Los 3 flujos de solicitud (ahora completos)

| Flujo | Situación | Endpoint |
|---|---|---|
| Pedir créditos | tiene acceso, sin créditos | `/api/tools/3dsky/request-credits` |
| Acceso excepcional | tiene acceso, fuera de horario | `/api/me/exceptional-access` |
| **Solicitar acceso** (NUEVO) | NO tiene acceso a la tool | `/api/me/access-request` |

## Qué se construyó

- **`/api/me/access-request` POST**: `{toolId, reason: 10-500 chars}`. Validaciones server-side:
  - tool existe y `is_active=true` (rechaza `coming_soon` → 400)
  - user NO tiene acceso activo (→ 400 `already_has_access`)
  - no hay request `access` pendiente para ese (user, tool) (→ 400 `already_pending`)
  - inserta `access_requests` con `request_type='access'` + notif Slack
- **`RequestAccessModal`** (Client): se abre desde el hub al clickear una tool bloqueada. Textarea de motivo (mín 10 chars), badge 🔓, maneja `already_pending` deshabilitando el submit.
- **HubScreen**: `onRequest` (era un toast placeholder) ahora abre el `RequestAccessModal`. Tools `coming_soon` no llegan acá (su card está disabled).
- **Aprobación extendida** (`/api/admin/requests/[id]/approve`): branch nuevo para `request_type='access'` → upsert de `tool_access` a `status='active'` permanente (sin `expires_at`, schedule null), log `admin.access.grant`, notif Slack con kind `access_approved` (incluye quién aprobó).
- **Rechazo extendido** (`reject`): si es `access`, usa kind `access_rejected` con el admin name.
- **RequestsBoard**: el botón de aprobar ahora dice "aprobar y habilitar →" para `access` (vs "aprobar +N →" de créditos / "aprobar acceso →" de excepcional). El badge azul "acceso a tool" + filtro chip ya venían de sesión 13.
- **`notifySlack` ampliado** con 2 kinds nuevos:
  - `access_request` → 🔓 header + botón "Ver en panel"
  - `access_approved` / `access_rejected` → incluye `adminName` ("✅ Tomás aprobó acceso: Bruno ahora tiene acceso a Claude")

## Archivos creados

```
nqs-ai-hub/
├── src/
│   ├── app/api/me/access-request/route.ts        ← endpoint user
│   └── components/tool/RequestAccessModal.tsx     ← modal hub
└── progress-15.md
```

## Archivos modificados

- `src/lib/notifications/slack.ts` — 2 tipos + 2 kinds nuevos en `buildPayload`. Refactor del fallback (ver decisión técnica).
- `src/components/screens/HubScreen.tsx` — `onRequest` abre el modal; nuevo state `requestAccessTool` + render del modal.
- `src/app/api/admin/requests/[id]/approve/route.ts` — branch `access` con upsert de `tool_access` + log + Slack diferenciado. Imports de `logToolUsage` + `ToolId`.
- `src/app/api/admin/requests/[id]/reject/route.ts` — Slack diferenciado por `request_type`.
- `src/components/admin/RequestsBoard.tsx` — label del botón aprobar según tipo.
- `tests/slack.test.ts` — 2 casos nuevos (access_request, access_approved). 21/21.

## Decisiones técnicas tomadas

1. **El server valida duplicados, el modal solo refleja.** El `RequestAccessModal` no pre-chequea si hay request pendiente — manda el POST y si el server devuelve `already_pending`, muestra el mensaje + deshabilita. Una sola fuente de verdad (el server), sin race conditions entre lo que ve el cliente y el estado real.

2. **Acceso aprobado es permanente (sin expires_at).** A diferencia del acceso excepcional (que expira), aprobar una solicitud de acceso habilita la tool de forma permanente con `schedule=null` (24/7). Si el admin quiere restringir horarios, lo hace después desde `/admin/access`. Razón: "solicitar acceso" es "quiero esta herramienta para mi trabajo", no "quiero entrar una vez".

3. **Branch por `request_type` en approve, no endpoints separados.** El mismo `/approve` maneja los 3 tipos (credits / exceptional_access / access) con un `if` por tipo. Mantiene el flujo de "marcar como approved + Slack" compartido y solo varía el efecto (sumar créditos vs tool_access temporal vs tool_access permanente).

4. **Refactor del fallback en `buildPayload` (slack.ts).** Al sumar los kinds `access_approved`/`access_rejected` (tipo con `kind` de unión), el exhaustiveness check `const _: never = n` dejó de compilar: TS no estrecha del todo cuando el discriminante `kind` es a su vez una unión (`"access_approved" | "access_rejected"`) y se descarta con `||`. Es un comportamiento conocido de TS. Solución: cada kind tiene su bloque con `return` explícito (5 bloques cubren los 5 kinds) y el fallback final es un mensaje genérico sin `never`. El runtime queda 100% cubierto; perdemos solo el check de exhaustividad en compile-time (aceptable — agregar un kind nuevo sin su bloque caería en el fallback genérico, no rompería).

5. **`admin.access.grant` en usage_logs.** Cuando el admin habilita una tool vía aprobación, queda registrado en el audit trail con `targetUserId` + `requestId`. Visible desde `/admin/logs` filtrando `action=admin.`.

## Cosas pendientes (TODO)

- [ ] El modal podría pre-cargar si ya hay una request pendiente (para deshabilitar el submit ANTES de mandar). Hoy lo descubre al primer submit. Para MVP es aceptable — el server es la fuente de verdad.
- [ ] Cuando se aprueba un acceso, el user necesita refrescar el hub para verlo activo (no hay push en tiempo real). Documentado, consistente con el resto del MVP.
- [ ] Si el admin bloquea (status=locked) una tool que el user tenía activa con conversaciones/créditos, esos datos quedan — no se borran. Correcto (re-habilitar restaura todo).

## Cómo probar lo que se construyó

```bash
npm run dev
```

Flujo (admin Tomás + user Bruno en ventanas separadas):

1. **Admin** bloquea Claude para Bruno: `/admin/access` → seleccionar Bruno → toggle Claude OFF (o vía API `PATCH /api/admin/tools/access {status:"locked"}`).
2. **Bruno** en el hub → card de Claude muestra "solicitar acceso" → click → `RequestAccessModal`.
3. Escribir motivo (mín 10 chars) → "enviar solicitud" → toast verde.
4. **Slack**: llega "🔓 Bruno pidió acceso a Claude" con botón "Ver en panel".
5. Bruno intenta pedir de nuevo → mensaje "ya tenés una solicitud pendiente".
6. **Admin** → `/admin/requests` → tab/chip "acceso" → card con badge azul "acceso a tool" + border-left azul → botón "aprobar y habilitar →".
7. Click → tool_access se activa. Slack: "✅ Tomás aprobó acceso: Bruno ahora tiene acceso a Claude".
8. **Bruno** refresca el hub → Claude activo → click → entra normal.

## Tests + smoke E2E

```bash
npm run typecheck    # OK
npm test             # 21/21 (sumó 2 casos de slack)
npm run build        # 44 rutas + Proxy
```

| Escenario E2E (curl) | Resultado |
|---|---|
| Bruno pide acceso a Claude (bloqueado) | ✅ 200 + requestId |
| Pedir de nuevo → already_pending | ✅ 400 |
| Pedir tool coming_soon (weavy) | ✅ 400 tool_coming_soon |
| Motivo < 10 chars | ✅ 400 |
| Admin ve la request tipo access | ✅ |
| Aprobar → tool_access activo | ✅ 200, requestType=access |
| Bruno entra a Claude (canUseTool pasa) | ✅ 200 |
| Rechazar → user puede volver a pedir | ✅ (no da already_pending) |

Cleanup: Bruno restaurado a Claude active, requests + convs de smoke borradas.

## Validación post-sesión

- [x] User sin acceso puede pedir desde el hub
- [x] La solicitud llega a Slack con info clara (🔓)
- [x] Aparece en /admin/requests con badge azul
- [x] Admin aprueba → toggle de acceso se activa automáticamente
- [x] User refresh y ve la tool habilitada
- [x] No se pueden mandar solicitudes duplicadas
- [x] No se puede pedir acceso a tools coming_soon
- [x] Admin rechaza y el user puede volver a pedir

## Variables de entorno agregadas

(ninguna nueva)

## Commit

```
feat(access): flujo de solicitud de acceso a tools bloqueadas con Slack
```

## Próximo paso

`kit/prompts/mvp/12-deploy.md` — deploy del MVP completo.
