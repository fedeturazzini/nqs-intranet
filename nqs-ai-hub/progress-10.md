# Progress 10 — Panel admin completo + selector de modelo Claude

**Fecha**: 2026-05-26 → 2026-05-27 UTC
**Duración real**: ~4 horas
**Sesión anterior**: `progress-09.md` (+ refactor header `tool-view-bar`)
**Próxima sesión**: `kit/prompts/mvp/11-admin-credits.md`

> **Cambio de alcance** acordado con NQS antes de arrancar: la sesión 10 absorbió varias features que originalmente eran v2 (control de acceso por user, horarios, requests, auditoría) + el selector de modelo Claude.

## Qué se construyó

### Migrations
- **0003** — agrega `system_prompts.model TEXT NOT NULL DEFAULT 'claude-sonnet-4-5'` + CHECK constraint con 3 modelos. ⚠️ Usé nombres incorrectos.
- **0004** — fix: DROP constraint viejo + UPDATE filas (sonnet-4-5 → sonnet-4-6, opus-4-1 → opus-4-7) + ALTER DEFAULT a `claude-sonnet-4-6` + CREATE constraint correcto con los modelos vigentes 2026.

### Endpoints admin nuevos
- `POST/GET /api/admin/users` — listar (con JOIN tools_active_count + last_sign_in) + crear (auth + public.users con rollback).
- `PATCH/DELETE /api/admin/users/[id]` — edit campos + soft delete (is_active=false).
- `GET/POST /api/admin/system-prompts` — listar versiones / crear nueva versión (con activación opcional).
- `GET /api/admin/system-prompts/[id]` — detalle con content desencriptado.
- `POST /api/admin/system-prompts/[id]/activate` — activar versión existente.
- `PATCH /api/admin/system-prompts/[id]/model` — cambiar SOLO el modelo (sin crear versión nueva).
- `GET /api/admin/requests` — listar con filtros status/toolId/userId + JOIN explícito (2 FKs a users).
- `GET /api/admin/logs` — usage_logs con filtros.
- `GET /api/admin/credit-transactions` — historial con filtros.

### UI admin (todas las pages bajo `/admin/*`)
- **Layout** + `AdminSidebar` (Client, `usePathname` para active state, badge naranja de "Solicitudes pendientes" calculado server-side).
- **`/admin`** (Overview) — 4 StatTiles: usuarios activos, tools habilitadas, llamadas Claude 7d, solicitudes pendientes.
- **`/admin/users`** — `UsersTable` con `NewUserModal` y `UserDetailModal` (tabs: Datos básicos / Accesos → link a /admin/access).
- **`/admin/access`** — split view: lista de users a la izquierda, `ToolAccessCard` por tool a la derecha con toggle on/off + `ScheduleEditor` por día.
- **`/admin/prompt`** — `PromptManager` con editor textarea + counter chars/tokens + sidebar de versiones + `ModelSelector` con 3 tarjetas (Haiku/Sonnet/Opus) con pricing + tagline + badge "en uso" + confirm modal al cambiar.
- **`/admin/requests`** — `RequestsBoard` con 4 tabs (pendientes/aprobadas/rechazadas/todas) + `RequestCard` con aprobar/rechazar (con motivo).
- **`/admin/logs`** — `LogsBoard` con 3 tabs (usage / module sessions / credit transactions).

### Cliente Anthropic dinámico
- `claude.ts` adapter ahora pasa `options.model: systemPrompt.model` al `callClaude`.
- `usage_logs.metadata` registra `model` y `promptVersion` por llamada (auditable desde `/admin/logs`).
- Default `DEFAULT_MODEL = "claude-sonnet-4-6"` como fallback si el system prompt activo no tiene `model` populated.

### Fix del proxy
- Eliminada la branch de redirect `/login → /hub` que causaba `ERR_TOO_MANY_REDIRECTS` con cookies stale.
- Ahora `/login` siempre renderea; la page detecta sesión válida vía `getSession()` y redirige a `/hub` o `/admin` cuando corresponde.

## Archivos creados

```
nqs-ai-hub/
├── src/
│   ├── app/
│   │   ├── (dashboard)/admin/
│   │   │   ├── access/page.tsx                   ← split view (sidebar users + cards tools)
│   │   │   ├── logs/page.tsx                     ← shell + LogsBoard
│   │   │   ├── prompt/page.tsx                   ← shell + PromptManager
│   │   │   ├── requests/page.tsx                 ← shell + RequestsBoard
│   │   │   ├── users/page.tsx                    ← pre-carga + UsersTable
│   │   │   ├── layout.tsx                        ← sidebar + requireAdmin + pending badge
│   │   │   └── page.tsx                          ← Overview con 4 StatTiles
│   │   └── api/admin/
│   │       ├── credit-transactions/route.ts      ← GET con filtros
│   │       ├── logs/route.ts                     ← GET usage_logs
│   │       ├── requests/route.ts                 ← GET con JOIN explícito
│   │       ├── system-prompts/
│   │       │   ├── route.ts                      ← GET versiones / POST nueva
│   │       │   ├── [id]/route.ts                 ← GET detalle (decrypted)
│   │       │   ├── [id]/activate/route.ts        ← POST activar
│   │       │   └── [id]/model/route.ts           ← PATCH solo modelo
│   │       └── users/
│   │           ├── route.ts                      ← GET + POST (rollback en falla)
│   │           └── [id]/route.ts                 ← PATCH + DELETE soft
│   ├── components/admin/
│   │   ├── AccessPanel.tsx                       ← split view users + tools
│   │   ├── AdminSidebar.tsx                      ← nav con badge
│   │   ├── LogsBoard.tsx                         ← 3 tabs genéricas con Table<T>
│   │   ├── ModelSelector.tsx                     ← 3 tarjetas con pricing + confirm
│   │   ├── NewUserModal.tsx                      ← form + auto initials
│   │   ├── PromptManager.tsx                     ← editor + ModelSelector + sidebar versiones
│   │   ├── RequestsBoard.tsx                     ← tabs + RequestCard + reject modal inline
│   │   ├── ScheduleEditor.tsx                    ← por día con debounce 400ms
│   │   ├── StatTile.tsx                          ← KPI card
│   │   ├── ToolAccessCard.tsx                    ← toggle + schedule editor
│   │   ├── UserDetailModal.tsx                   ← tabs básicos + accesos
│   │   └── UsersTable.tsx                        ← tabla + click row + new
│   └── lib/auth/admin-guard.ts                   ← requireAdminApi()
├── supabase/
│   ├── apply-remote-0003.sql                     ← model column (nombres viejos)
│   ├── apply-remote-0004.sql                     ← fix nombres + UPDATE filas
│   ├── migrations/0003_claude_model_selector.sql
│   └── migrations/0004_fix_claude_model_names.sql
└── progress-10.md
```

## Archivos modificados

- `src/proxy.ts` — saqué la branch `/login → /hub` que causaba el redirect loop.
- `src/lib/adapters/claude.ts` — `callClaude(..., { model: systemPrompt.model })` + `metadata.model` + `metadata.promptVersion` en `usage_logs`.
- `src/lib/anthropic/client.ts` — `DEFAULT_MODEL = "claude-sonnet-4-6"` (de fallback) + comentarios actualizados.
- `src/lib/db/queries/system-prompts.ts` — `ActiveSystemPrompt` ahora incluye `model: string`.
- `src/types/db.ts` — `model: string` agregado a Row/Insert/Update de `system_prompts`.

## Decisiones técnicas tomadas

1. **Static route `/admin/*` antes que dispatcher.** Cada page es su propia ruta, no un mega-page con switch. Más claro para code-splitting y para que la sidebar marque active state via `usePathname`.

2. **`requireAdminApi()` helper.** Devuelve `Session | NextResponse`. Patrón consistente en los 9 endpoints admin. Usa `instanceof NextResponse` para narrowing.

3. **Server Components fetchan directo, no via API propia.** Páginas como `/admin/users` hacen las 3 queries paralelas en el mismo proceso. Acciones (crear/edit/delete) sí pegan al endpoint REST desde los modales del cliente — necesitamos auth + validación + Slack notif que viven solo del lado server.

4. **3 queries en `getOverviewStats` con `head: true`.** `select("id", { count: "exact", head: true })` cuenta sin traer rows. Promise.all las dispara en paralelo.

5. **`ScheduleEditor` con debounce de 400ms.** El admin tipea hora y el editor podría disparar PATCH en cada keystroke. Debounce centraliza: el último cambio dentro de 400ms es el que persiste.

6. **Discriminated union `DaySchedule` causó fricción.** `Partial<DaySchedule>` no permite `from`/`to` cuando la variante es `{enabled:false}` — TS no puede narrow ambas variantes. Solución: un alias local `DayPatch` (todos opcionales) + lógica condicional en `updateDay`.

7. **`SECURITY INVOKER` por default en los RPCs.** Llamamos siempre con `service_role`, no necesitamos escalation.

8. **JOIN explícito `users!fk_name`.** Tablas como `access_requests` con 2 FKs a `users` (user_id + reviewed_by) requieren especificar la FK. Mismo patrón aplica a `credit_transactions`.

9. **Modelo se cambia con PATCH dedicado, no creando nueva versión.** Es una decisión de UX: si admin solo quiere abaratar, no debería crear v2 v3 v4... con el mismo contenido. Cambiar contenido SÍ crea versión nueva (POST + auto-bump version).

10. **`ActivateOnSave` toggle en `PromptManager`.** Cuando guardás contenido nuevo, podés guardarlo como borrador (is_active=false) o activarlo directamente. Por default está ON con confirm prompt — un admin queriendo "drafts" lo desmarca explícito.

11. **`ModelSelector` con confirm modal al switch.** Solo si el switch involucra Sonnet (sale o entra). Pricing y tagline visibles para que el admin decida con info. Badge "en uso" destaca el modelo corriendo en producción.

12. **Fallback en `getActiveSystemPrompt`**: si `model` viene null/missing (caso teórico), pasa `claude-sonnet-4-6` por default. No debería pasar — la migration impone NOT NULL + CHECK constraint — pero el cliente Anthropic igual tiene un fallback en `DEFAULT_MODEL`.

13. **`UsersTable` con grid CSS, no `<table>`.** Hover effect requiere row entera highlighted; grid permite eso + responsive más facil que table.

## Cosas pendientes (TODO en código)

- [ ] Test de race condition entre 2 admins activando versions distintas del mismo prompt simultáneamente. Hoy el último gana sin merge.
- [ ] Filtros UI para `/admin/logs` (date range, user picker, tool dropdown). Hoy se ven los últimos 100 sin filtros.
- [ ] "Vista previa" del prompt con un user prompt de ejemplo (mencionado en el prompt original 7.a). Lo dejo para sesión 11+ — requiere streaming response o cache de respuestas previas para no quemar tokens cada vez que el admin previewea.
- [ ] "Ver diff con versión activa" — necesita una lib de diff (react-diff-viewer). Lo dejo para post-MVP.
- [ ] El `Tab 3: Créditos` del `UserDetailModal` (mencionado en el prompt 5) — sesión 11 lo cubre.
- [ ] El admin Tomás no tiene `tool_access` en seed → cuando entra a `/admin/access`, todas las tools le aparecen como "locked". No es bug (admin pasa por arriba del check), pero confunde el state inicial. Considerar: sumar al script de seed un grant default para admins, o un avisito visual en la UI.

## Cosas a tener en cuenta para la próxima sesión

- La sesión 11 (admin de créditos) tiene los endpoints listos (`/api/admin/credits/pools` GET/POST + `/credits/allocations` GET/POST). Falta UI completa: vista de pool con histórico de compras, asignación masiva, gráfico de consumo por user.
- El `UserDetailModal` tab "Créditos" puede mostrar resumen + acceso al panel completo.
- Si NQS pasa el `SLACK_WEBHOOK_URL`, probar también que las notifs de aprobación/rechazo llegan al canal real.

## Cómo probar lo que se construyó

```bash
npm run dev
# Login: tomas@nqs.test / nqs2026admin → llega a /admin (Overview)
```

Recorrido sugerido:

1. **`/admin`** — ves 4 stat tiles con números reales.
2. **`/admin/users`** — tabla con los 3 users (Tomás/Sofía/Bruno).
3. **`+ nuevo usuario`** — crear "Lucía Pérez" con email/dept/password. Aparece en la tabla.
4. **Click en Lucía** → modal con tab "Datos básicos" → cambiar dept → guardar → tab "Accesos & horarios" → click "abrir panel" → vas a `/admin/access?user=<luciaId>`.
5. **`/admin/access`** — Lucía seleccionada. Click toggle en card de Claude → ON. Click toggle en 3DSky → ON. Click "+ configurar horarios" en 3DSky → setear lun-vie 9-18 → debounce guarda.
6. **Logueate como Lucía** (otra ventana) → ves Claude y 3DSky active en el hub.
7. **Volver como Tomás** → **`/admin/prompt`** → ves el system prompt placeholder + 3 cards (Haiku/Sonnet/Opus) con Sonnet marcado "en uso".
8. **Click Haiku** → confirm modal → cambio se aplica → toast "MODELO ACTUALIZADO". Verifica en `/admin/logs` → próximas llamadas a Claude desde el hub van con `metadata.model: "claude-haiku-4-5"`.
9. **`/admin/requests`** — si Sofia pidió créditos, aparece. Click "aprobar" → toast "APROBADO. Sofia recibió +N créditos." Notif a Slack si está configurado.
10. **`/admin/logs`** — 3 tabs: usage / module sessions / credit transactions. Cada una con sus filtros.

## Tests automáticos + smoke E2E

```bash
npm test          # 19/19 (sin tests nuevos esta sesión)
npm run typecheck # OK
npm run build     # 40 rutas + Proxy
```

Smoke E2E verificado (después de aplicar 0003 + 0004):

| Escenario | Resultado |
|---|---|
| `/api/admin/users` sin sesión | ✅ 401 |
| `/api/admin/users` con employee | ✅ 403 |
| `/api/admin/users` con admin | ✅ 200 con 3 usuarios |
| `/admin` con admin | ✅ 4 stat tiles |
| `/admin` con employee | ✅ 307 → /hub |
| POST nuevo user → PATCH → DELETE | ✅ 200/200/200 |
| `/admin/prompt` | ✅ 3 modelos con pricing + 1 con "en uso" |
| PATCH `[id]/model` con nombre inválido | ✅ 400 con mensaje claro |
| PATCH `[id]/model` con `claude-haiku-4-5` | ✅ 200 |
| POST `/api/tools/claude/execute` (sofia) post-PATCH | ✅ usa Haiku, respuesta cortita |
| `usage_logs.metadata.model` | ✅ `claude-haiku-4-5` y `claude-sonnet-4-6` registrados por llamada |
| PATCH model a Sonnet → llamada nueva | ✅ metadata cambia consistente |

## Selector de modelo — flow end-to-end

```
┌──────────────┐         ┌──────────────────┐
│ Admin selec- │  PATCH  │ /api/admin/      │
│ ciona Haiku  │ ──────▶ │ system-prompts/  │
└──────────────┘         │ [id]/model       │
                         └──────────────────┘
                                  │
                                  ▼
                         system_prompts.model
                         = 'claude-haiku-4-5'
                                  │
                                  ▼ (próxima execute)
┌──────────────┐         ┌──────────────────┐
│ User pide    │  POST   │ /api/tools/      │
│ Claude       │ ──────▶ │ claude/execute   │
└──────────────┘         └──────────────────┘
                                  │
                                  ▼
                         claudeAdapter.execute()
                           ↓
                         getActiveSystemPrompt('claude')
                           → returns { model: 'claude-haiku-4-5', ... }
                           ↓
                         callClaude(sys, msgs, { model: '…haiku-4-5' })
                           → Anthropic SDK usa Haiku
                           ↓
                         logToolUsage({
                           action: 'claude.execute',
                           metadata: { model: 'claude-haiku-4-5', promptVersion: 1, ... },
                           tokensConsumed: 100
                         })
```

## Errores conocidos / observaciones

- **Migration 0003 tenía nombres incorrectos** (`claude-sonnet-4-5`, `claude-opus-4-1`). Lo flagueaste vos antes del smoke. Migration 0004 lo arregla: DROP constraint + UPDATE filas + ALTER DEFAULT + nuevo CHECK con los nombres vigentes 2026 (Haiku 4.5, Sonnet 4.6, Opus 4.7). Las dos migrations quedan en el historial — no se reescribe la 0003 porque ya se aplicó.
- **Sin filtros UI en `/admin/logs`** — los endpoints aceptan query params pero el `LogsBoard` no los expone. Dejado como TODO para que `npm run build` no se ponga rojo por features no críticas del MVP.
- **`bruno@nqs.test` ya tenía `tool_access` a claude + 3dsky desde el seed**. Si vas a hacer el test "crear user nuevo Lucía", recordá que ella no va a tener acceso a nada hasta que vos lo configures en `/admin/access`.

## Variables de entorno agregadas

(ninguna nueva)

## Commits sugeridos

```
feat(admin): panel completo + selector modelo Claude + control accesos
fix(model-names): migration 0004 con nombres correctos (Sonnet 4.6, Opus 4.7)
```

## Próximo paso

`kit/prompts/mvp/11-admin-credits.md` — gestión específica del pool de créditos (vista de compras, asignación masiva, gráfico de consumo).
