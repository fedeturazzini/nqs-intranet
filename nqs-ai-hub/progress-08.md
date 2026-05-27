# Progress 08 — 3DSky adapter sin proxy + créditos + horarios + Slack

**Fecha**: 2026-05-26 / 2026-05-27 UTC
**Duración real**: ~3 horas
**Sesión anterior**: `progress-07.md`
**Próxima sesión**: `kit/prompts/mvp/09-3dsky-view.md` (versión modificada — sin proxy)

> **Cambio de alcance acordado con NQS** (documentado en el prompt mod.): NO se construye proxy 3DSky. La tool se embebe directo via iframe; los empleados DECLARAN su consumo al salir; el admin verifica contra factura mensual y controla quién y en qué horarios puede usar el módulo.

## Qué se construyó

- **Migration 0002**: `tool_access.schedule JSONB`, `access_requests.credits_requested INT`, tabla `module_sessions` (entrada/salida del módulo) y RPC `consume_credit_atomic` (atómico con `SELECT … FOR UPDATE`).
- **`ThreeDSkyAdapter`** real (reemplaza el stub de sesión 06): `checkAccess` valida tool_access + schedule + créditos; `consumeCredit` usa el RPC; `getEmbedUrl` devuelve URL directa de 3DSky (sin proxy); `getRemainingCredits` para el Hub.
- **Helper de schedule** (`lib/utils/schedule.ts`): chequea ventana horaria en TZ `America/Argentina/Buenos_Aires` con `Intl.DateTimeFormat` (no depende de la TZ del server).
- **Middleware `canUseTool` actualizado**: nuevo check de horario entre access status y créditos. `outside_hours` ya estaba en el enum de razones desde sesión 06.
- **Slack helper** (`lib/notifications/slack.ts`): `notifySlack(payload)` envía a `SLACK_WEBHOOK_URL` con timeout 5s. Si la env no está / Slack falla → log `error` pero NO tira excepción (graceful degradation obligatoria).
- **5 endpoints empleado**: `/api/tools/3dsky/credits` (GET), `/embed-url` (GET con validación de permisos), `/session/start` (POST), `/session/end` (POST con descuento de créditos via RPC), `/request-credits` (POST + Slack notif).
- **7 endpoints admin** + helper `requireAdminApi()`:
  - `/api/admin/credits/pools` GET/POST (compras del pool)
  - `/api/admin/credits/allocations` GET/POST (asignación delta con tx)
  - `/api/admin/tools/access` PATCH (toggle on/off por user)
  - `/api/admin/tools/schedule` PATCH (ventanas horarias por user, validadas con Zod)
  - `/api/admin/requests/[id]/approve` POST (suma créditos + tx + Slack)
  - `/api/admin/requests/[id]/reject` POST (Slack)
  - `/api/admin/module-sessions` GET (auditoría con filtros)
- **Tests**: 19 totales (6 auth + 6 schedule + 7 slack) — todos pasan.
- **Race condition test contra DB real** (`npm run db:race-test`): 15 consumos paralelos sobre 10 créditos → 10 OK + 5 `insufficient_credits` + `credits_used=10` exacto (sin overflow) + 10 rows en `credit_transactions`. **PASA.**

## Archivos creados

```
nqs-ai-hub/
├── src/
│   ├── app/api/
│   │   ├── admin/
│   │   │   ├── credits/
│   │   │   │   ├── pools/route.ts
│   │   │   │   └── allocations/route.ts
│   │   │   ├── tools/
│   │   │   │   ├── access/route.ts
│   │   │   │   └── schedule/route.ts
│   │   │   ├── requests/[id]/
│   │   │   │   ├── approve/route.ts
│   │   │   │   └── reject/route.ts
│   │   │   └── module-sessions/route.ts
│   │   └── tools/3dsky/
│   │       ├── credits/route.ts
│   │       ├── embed-url/route.ts
│   │       ├── session/{start,end}/route.ts
│   │       └── request-credits/route.ts
│   └── lib/
│       ├── auth/admin-guard.ts            ← requireAdminApi()
│       ├── notifications/slack.ts          ← notifySlack() + builders
│       └── utils/schedule.ts               ← checkSchedule + nowInArgentina
├── supabase/migrations/0002_3dsky_credits.sql
├── supabase/apply-remote-0002.sql          ← copia paste-en-editor
├── scripts/test-credit-race.ts             ← race test contra DB
├── tests/schedule.test.ts                  ← 6 casos
├── tests/slack.test.ts                     ← 7 casos
└── progress-08.md
```

## Archivos modificados

- `src/lib/adapters/three-dsky.ts` — de stub a adapter operativo (replace completo, mantiene mismo shape).
- `src/lib/middleware/permissions.ts` — agrega check de horario entre access y créditos.
- `src/types/db.ts` — manualmente: `tool_access.schedule`, `access_requests.credits_requested`, tabla `module_sessions`, función `consume_credit_atomic`. (Idealmente regen con `supabase gen types` cuando haya PAT — documentado.)
- `src/types/db-aliases.ts` — `DayOfWeek`, `DaySchedule`, `ToolSchedule`, `DAYS_OF_WEEK`, `ModuleSessionRow`.
- `package.json` — script nuevo `db:race-test`.
- `.env.local` + `.env.local.example` — `SLACK_WEBHOOK_URL` placeholder.

## Decisiones técnicas tomadas

1. **TZ `America/Argentina/Buenos_Aires` server-side.** El server puede correr en UTC (Vercel) y los empleados están en AR. `nowInArgentina()` usa `Intl.DateTimeFormat({timeZone: ...}).formatToParts()` para extraer day-of-week + HH:MM sin depender del locale del proceso. Hard-coded por ahora — si NQS sumara empleados en otras TZs, mover a una columna `users.timezone`.

2. **Schedule en JSONB, no tabla `time_windows`.** El reference schema preveía una tabla aparte; la decisión nueva (NQS) es ponerlo *por (user, tool)* — exactamente lo que cabe en `tool_access.schedule`. Más simple y atómico para upsert. La tabla `time_windows` queda vacía como estaba (FUTURE).

3. **RPC `consume_credit_atomic` con `SELECT … FOR UPDATE`.** Bloquea la fila de `credit_allocations` antes de chequear; el resto de los consumos esperan. El test de race (`npm run db:race-test`) confirma 0 overflow incluso con 15 requests paralelos. SQLSTATEs propios (`P0001`, `P0002`, `P0003`) para diferenciar errores y mapearlos en el adapter a mensajes claros.

4. **`SECURITY INVOKER`, no `DEFINER`, en el RPC.** Lo llamamos siempre con `service_role` desde el backend; no necesitamos privilege escalation. EXECUTE revoked de PUBLIC, granted solo a `service_role`.

5. **`getEmbedUrl` = URL directa a `https://3dsky.org/es/`.** Sin proxy. El control de consumo es 100% por declaración del empleado al salir + verificación humana contra factura. La columna `tools.embed_url` queda libre por si NQS quisiera personalizar (ej. enlace a una página interna primero).

6. **Si `declaredConsumption > créditos disponibles` → `consume_credit_atomic` falla → cerramos la sesión con `declared_consumption=0`.** Razón: no queremos inconsistencia entre `credit_transactions` (no hay row) y `module_sessions.declared_consumption` (que sí registraría algo no descontado). El admin puede investigar la sesión + auditar la factura aparte. Response 422 con `consume_failed` para que el frontend muestre toast.

7. **Slack notif es always-best-effort.** Timeout 5s con `AbortController`. Si la env no está seteada → log `info` ("skipped"). Si fetch tira o 5xx → log `error`. NUNCA throw. Verificado con 3 tests.

8. **Aprobación de requests es transaccionalmente débil.** Hacemos 4 ops secuenciales (update allocation → insert tx → update request status → Slack). Si una falla en el medio, podemos quedar en estado inconsistente. Para MVP es aceptable (el admin lo puede arreglar a mano desde Dashboard); para v2 mover a un RPC `approve_credit_request_atomic(request_id, admin_id)` similar al `consume_credit_atomic`.

9. **JOIN explícito `users!access_requests_user_id_fkey`.** PostgREST falla si una tabla tiene 2 FKs a otra (`access_requests` tiene `user_id` y `reviewed_by` → 2 FKs a `users`). La sintaxis `users!<fk_name>(...)` resuelve el ambigüedad. Encontrado durante el smoke test (HTTP 500); fix aplicado en approve y reject.

10. **`requireAdminApi()` helper** vs duplicar el chequeo en cada route handler. Mismo patrón que `requireToolAccess()` pero para gating por rol. Devuelve `Session | NextResponse` — el caller usa `instanceof NextResponse` para narrow.

11. **`schedule` schema validation con Zod estricto.** El admin puede pasar un JSON malformado (ej. `from > to`); validamos con un schema discriminado por `enabled`. `from < to` obligatorio (no soportamos ventanas que cruzan medianoche en MVP — usar 23:59 si querés).

12. **Window check inclusive de `from`, exclusive de `to`.** Ej. ventana 09:00–18:00: a las 09:00 entra, a las 18:00 NO. Documentado en el test "borde superior es exclusivo".

13. **`Set-Cookie` para acceso al módulo no se usa** — el sessionId vive en state del cliente. Razón: el módulo no es una "sub-sesión" auth, es solo una unidad de auditoría. Ponerlo en cookie traería gracia (durable entre recargas) pero crearía dudas sobre quién dueño es del lifecycle.

## Cosas pendientes (TODO en código)

- [ ] Aprobación atómica en un RPC (`approve_credit_request_atomic`). Hoy son 4 ops secuenciales.
- [ ] **`/types/db.ts` se editó a mano** después de aplicar migration 0002. Cuando se pueda regen con PAT, hay que correr `npx supabase gen types typescript --project-id nslliqinzpqjiysjlulm > src/types/db.ts` y verificar que las 4 adiciones (schedule, credits_requested, module_sessions, consume_credit_atomic) salgan idénticas.
- [ ] **Esquema de TZ multi-usuario.** Hard-coded a Argentina. Si NQS internacionaliza, mover a `users.timezone` y leer en el helper.
- [ ] Cuando NQS pase el `SLACK_WEBHOOK_URL` real, probar end-to-end que llegan las notifs (las 3 variantes: request, approved, rejected).
- [ ] Webhook de auditoría/canal separado para `module-sessions` (cuando entra/sale alguien). Opcional, NQS no lo pidió.
- [ ] Endpoint `/api/admin/credits/transactions` (lectura del historial). El schema ya soporta — solo falta wire-up para futuro panel admin.
- [ ] El RPC del consume hace `INSERT INTO credit_transactions` con `performed_by = p_user_id` (el propio user). Para diferenciar consumos automáticos vs. ajustes manuales podríamos pasar `p_performed_by` separado.

## Cosas a tener en cuenta para la próxima sesión

- La vista de 3DSky (sesión 09) consume:
  - `GET /api/tools/3dsky/credits` (mostrar barra)
  - `GET /api/tools/3dsky/embed-url` (al entrar)
  - `POST /api/tools/3dsky/session/start` (recibe sessionId)
  - `POST /api/tools/3dsky/session/end` (al salir, con declaredConsumption)
  - `POST /api/tools/3dsky/request-credits` (form de "pedir más")
- El `ThreeDSkyPlaceholder` que dejamos en sesión 07 se borra; se reemplaza por la vista real.
- El embed de 3DSky es un iframe a `https://3dsky.org/es/`. 3DSky NO permite ser embebido en iframe (`X-Frame-Options: SAMEORIGIN` típicamente). Si esto rompe, hay que abrir en una ventana nueva o usar otro approach (ver "Errores conocidos").
- La sesión 11 (admin completo) ya tiene los 7 endpoints listos; solo falta UI.

## Cómo probar lo que se construyó

```bash
npm run dev
```

### Tests automáticos
```bash
npm run typecheck    # OK
npm test             # 19/19 (6 auth + 6 schedule + 7 slack)
npm run db:race-test # 10 OK + 5 insufficient_credits, sin overflow
npm run build        # 25 rutas + Proxy
```

### Smoke E2E manual (con sofia y tomas)

```bash
# Login
curl -X POST localhost:3003/api/auth/login -H 'content-type: application/json' \
  -d '{"email":"sofia@nqs.test","password":"nqs2026sofia"}' -c /tmp/s.txt
curl -X POST localhost:3003/api/auth/login -H 'content-type: application/json' \
  -d '{"email":"tomas@nqs.test","password":"nqs2026admin"}' -c /tmp/t.txt

# Empleado
curl -b /tmp/s.txt localhost:3003/api/tools/3dsky/credits
# → {credits:30, creditsTotal:30, used:0}
curl -b /tmp/s.txt localhost:3003/api/tools/3dsky/embed-url
# → {url: "https://3dsky.org/es/"}

# Schedule fuera de horario
curl -X PATCH -b /tmp/t.txt -H 'content-type: application/json' \
  -d '{"userId":"<sofia-uuid>","toolId":"3dsky","schedule":{"friday":{"enabled":true,"from":"09:00","to":"18:00"}}}' \
  localhost:3003/api/admin/tools/schedule
curl -b /tmp/s.txt localhost:3003/api/tools/3dsky/embed-url
# → 403 {error:"outside_hours", message:"Acceso deshabilitado para martes."}

# Liberar y consumir
curl -X PATCH -b /tmp/t.txt -H 'content-type: application/json' \
  -d '{"userId":"<sofia-uuid>","toolId":"3dsky","schedule":null}' \
  localhost:3003/api/admin/tools/schedule
SESS=$(curl -X POST -b /tmp/s.txt localhost:3003/api/tools/3dsky/session/start | jq -r .sessionId)
curl -X POST -b /tmp/s.txt -H 'content-type: application/json' \
  -d "{\"sessionId\":\"$SESS\",\"declaredConsumption\":3}" \
  localhost:3003/api/tools/3dsky/session/end
# → {credits:27, creditsTotal:30, used:3}

# Solicitar + aprobar
REQ=$(curl -X POST -b /tmp/s.txt -H 'content-type: application/json' \
  -d '{"amount":50,"reason":"urgente"}' localhost:3003/api/tools/3dsky/request-credits | jq -r .requestId)
curl -X POST -b /tmp/t.txt -H 'content-type: application/json' \
  -d '{"note":"OK"}' localhost:3003/api/admin/requests/$REQ/approve
# → {ok:true, credits_assigned:80}
```

Todos verificados en esta sesión.

## Adapter funcional

| Método | Estado |
|---|---|
| `id`, `category`, `usesCredits=true`, `isEmbedded=true` | ✅ |
| `checkAccess(userId)` | ✅ valida tool_access + schedule + ≥1 crédito |
| `logUsage()` | ✅ delega a `logToolUsage` |
| `getRemainingCredits()` | ✅ |
| `consumeCredit(userId, amount, reason)` | ✅ vía RPC atómico; mapea P0001/P0002/P0003 a errores tipados |
| `getEmbedUrl()` | ✅ `https://3dsky.org/es/` (directo, sin proxy) |

## Endpoints probados con curl

| Endpoint | Método | Test | Resultado |
|---|---|---|---|
| `/api/tools/3dsky/credits` | GET | sofia | ✅ |
| `/api/tools/3dsky/embed-url` | GET | sofia sin schedule | ✅ devuelve URL |
| `/api/tools/3dsky/embed-url` | GET | sofia con schedule restrictivo | ✅ 403 outside_hours |
| `/api/tools/3dsky/session/start` | POST | sofia | ✅ sessionId UUID |
| `/api/tools/3dsky/session/end` | POST | declared=3 | ✅ descuenta vía RPC |
| `/api/tools/3dsky/session/end` | POST | doble cierre | ✅ 409 session_already_closed |
| `/api/tools/3dsky/request-credits` | POST | sofia | ✅ crea row + invoca Slack |
| `/api/admin/tools/access` | PATCH | tomas → sofia locked | ✅ |
| `/api/admin/tools/schedule` | PATCH | tomas | ✅ con validación Zod |
| `/api/admin/requests/[id]/approve` | POST | tomas, request pending | ✅ suma créditos + Slack |
| `/api/admin/requests/[id]/approve` | POST | bruno (employee) | ✅ 403 forbidden |
| `/api/admin/requests/[id]/approve` | POST | 2da vez sobre approved | ✅ 409 not_pending |
| `/api/admin/requests/[id]/reject` | POST | tomas | ✅ |
| `/api/admin/module-sessions` | GET | tomas filtrado por tool | ✅ devuelve histórico con JOIN |

## RPC atómico aplicado

```sql
CREATE OR REPLACE FUNCTION consume_credit_atomic(p_user_id, p_tool_id, p_amount, p_reason)
RETURNS JSON LANGUAGE plpgsql
```

- Bloquea la fila con `SELECT … FOR UPDATE`.
- Race test (15 consumos en paralelo sobre 10 créditos): 10 OK + 5 `insufficient_credits` + 0 overflow. ✅

## Schema de horarios funcionando

Formato JSONB:
```json
{
  "monday":    { "enabled": true,  "from": "09:00", "to": "18:00" },
  "tuesday":   { "enabled": true,  "from": "09:00", "to": "18:00" },
  "saturday":  { "enabled": false }
}
```

- Validado por Zod en el endpoint admin (regex `HH:MM`, `from < to`, discriminated union).
- Chequeado server-side por `canUseTool` en TZ Argentina.
- 6 tests unitarios cubren bordes (dentro/fuera de ventana, día deshabilitado, día no listado, borde exclusivo de `to`).

## Slack integración

- `notifySlack({kind, ...})` con 3 variantes: `credits_request`, `credits_approved`, `credits_rejected`.
- Payload con Slack Blocks (header, section con fields, actions con botón).
- Timeout 5s con `AbortController`.
- Sin `SLACK_WEBHOOK_URL` → log `info` + return silencioso (testeado).
- `fetch` rechaza o Slack 5xx → log `error` + return silencioso (testeado).
- **Pendiente**: NQS no pasó el webhook URL todavía. La env existe como placeholder vacío. Cuando llegue, probar las 3 variantes contra el canal real.

## Errores conocidos

1. **3DSky bloquea iframe.** Casi seguro `https://3dsky.org/es/` devuelve `X-Frame-Options: SAMEORIGIN` o equivalente. El iframe va a quedar en blanco al renderear. Soluciones en sesión 09:
   - Detectar via JS si el iframe cargó; si no, abrir en `window.open()` con `noopener`.
   - O directamente NO usar iframe — un botón "abrir 3DSky" que abre nueva pestaña + tracking del session start ahí mismo.
   - Verificar en sesión 09 qué headers manda 3DSky y elegir approach.
2. Modificación manual del autogen `db.ts`. Si se regenera sin pegar las 4 adiciones, el typecheck rompe en muchos lugares.

## Variables de entorno agregadas

```env
SLACK_WEBHOOK_URL=  # placeholder; cuando NQS pase la URL, pegarla acá
```

## Commits sugeridos

```
feat(3dsky): adapter con créditos manuales + control de acceso + horarios + Slack
```

## Próximo paso

`kit/prompts/mvp/09-3dsky-view.md` — **también necesita modificación** porque el prompt original asumía proxy. Avisame cuando arranques la 09 y armamos el prompt nuevo según los endpoints que ya están listos.
