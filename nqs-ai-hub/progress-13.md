# Progress 13 — Mejoras pre-deploy (4 partes, 4 commits)

**Fecha**: 2026-05-28
**Duración real**: ~4 horas
**Sesión anterior**: `progress-11.md` (la 12 es el deploy, después de ésta)
**Próxima sesión**: `kit/prompts/mvp/12-deploy.md`

> Sesión nueva que el kit original no tenía. Reemplazó a un eventual prompt 12 de "pulir antes de deploy". Cuatro mejoras independientes que se commitearon por separado.

## Las 4 partes

| # | Parte | Commit | Migration |
|---|---|---|---|
| 1 | Light mode default + toggle | `70a24ff` | 0005 |
| 2 | Memoria separada del system prompt | `e6d33c1` | 0006 |
| 3 | Popup horario + acceso excepcional | `a69dd22` | 0007 |
| 4 | Filtros UI en /admin/logs | `666ff48` | — |

> Bonus: `fea7309` (fix de loop de redirect previo) que apareció antes de arrancar la sesión.

Apply SQL único combinado: `supabase/apply-remote-0005-7.sql`.

## Parte 1 — Light mode default + toggle

- **Migration 0005**: `users.theme_preference TEXT NOT NULL DEFAULT 'light'` + CHECK (light|dark).
- **`getSession()`** ahora incluye `theme`; fallback a `light` si la DB tiene un valor raro.
- **RootLayout** convertido a async Server Component que setea `<html data-theme={theme}>`. Sin sesión → light.
- **`/api/me/preferences` PATCH**: `{theme}` validado con Zod; update de `users.theme_preference`.
- **`ThemeToggle`**: botón circular outlined en la topbar, icono ☀/☾. Click invierte y aplica `data-theme` al DOM al toque + PATCH en background. Rollback + toast rojo si PATCH falla.

CSS del cliente ya tenía `[data-theme="light"]` con todas las variables redefinidas — no se tocó.

## Parte 2 — Memoria separada del system prompt

- **Migration 0006**: `system_prompts.type TEXT NOT NULL DEFAULT 'system'` + CHECK (system|memory) + INSERT idempotente de una memoria vacía inicial para `claude`.
- **`getActiveSystemAndMemory(toolId)`**: nueva función que devuelve los DOS activos (`{system, memory}`) en una query.
- **`ClaudeAdapter.execute()`** concatena con tags:
  ```
  <system_prompt>{system.content}</system_prompt>
  <workspace_memory>{memory.content}</workspace_memory>
  ```
  Si memoria está vacía, manda solo el system (sin tags). Compat con system-prompt-only.
- **`usage_logs.metadata`** ahora incluye `memoryVersion` y `memoryLength` para auditoría.
- **Fix crítico**: `decrypt('')` tira excepción. Memorias recién creadas tienen `content_encrypted = ''` (la migration las seedea así). `getActiveSystemAndMemory` + `getActiveSystemPrompt` + `GET admin/system-prompts/[id]` tratan `''` como plaintext `""` sin llamar a `decrypt`. Sin este fix, la primera llamada a Claude post-migration falla con "no pudimos procesar tu pedido".
- **`/admin/prompt`**: convertida en `PromptTabs` con 2 tabs ("system prompt" / "memoria del workspace"). Cada tab usa `PromptManager` con prop `type`:
  - System: muestra `ModelSelector`, min 20 chars
  - Memory: oculta `ModelSelector` (modelo lo da el system), min 0 chars (puede estar vacía)
  - Ambos PromptManager se montan siempre y se ocultan con `display:none` al cambiar tab para no perder state local
- **Endpoints**: POST /system-prompts acepta `type`; nextVersion calculada por `(tool, type)` (secuencias independientes). POST /[id]/activate solo desactiva otros del MISMO `(toolId, type)`. GET acepta `?type=` filter.

**Verificación E2E**: memoria vacía → Claude responde genérico. Activar memoria con "Proyecto activo: Manhattan One — pitch hotelero para abril 2026. Cliente: REC." → mismo prompt "¿qué proyecto estoy trabajando?" → Claude responde "Manhattan One, pitch hotelero para REC, con vista al Hudson. Abril 2026." ✓

## Parte 3 — Popup horario + acceso excepcional

- **Migration 0007**: `access_requests.request_type TEXT NOT NULL DEFAULT 'credits'` + CHECK (credits|access|exceptional_access) + `exceptional_duration_minutes INT`.
- **`/api/me/exceptional-access` POST**: `{toolId, reason: 5-500 chars, duration: 5-720 min}`. Cap 12 hs para evitar pedidos abusivos. Inserta access_request + notif a Slack con prefijo ⏰.
- **Approve endpoint** branch nuevo: para `exceptional_access` no suma créditos; upsertea `tool_access` con `expires_at = NOW() + duration` y `schedule = null` (temporalmente sin restricción horaria). Cuando pasa `expires_at`, el middleware lo trata como expired. Slack notif diferenciada.
- **`listToolsWithAccess`** ahora devuelve `access.schedule` para que el Hub pueda detectar fuera-de-horario client-side.
- **UI**:
  - **`OutsideHoursModal`** con info de horarios habilitados (`summarizeSchedule`) + próxima ventana (`nextScheduleWindow`) + botones "Solicitar acceso excepcional" / "Cerrar".
  - **`ExceptionalAccessForm`** se monta dentro del mismo modal al apretar "solicitar". Textarea de motivo + selector de duración con presets (1h / 2h / hasta fin del día / custom).
  - **HubScreen** integra checkSchedule client-side: al hacer click en una card active, si schedule no allow → abre modal en lugar de navegar. Defensa: el endpoint server-side (`canUseTool` en `/tool/[id]`) sigue activo igual.
  - **RequestsBoard** ahora tiene sub-filtro de tipo (KindChips: todos / créditos / acceso / ⏰ excepcional) combinable con tabs de status. **`RequestCard`** muestra border-left coloreado por tipo (#FF8A3D excepcional, #5BC0EB access), badge de tipo + badge de "asked" (`+N créditos` o `Nh fuera de horario`).

**Verificación E2E**: setear schedule restrictivo → sofia llama exceptional-access con duration=120 → request creada. Admin aprueba → response incluye `expires_at`. Sofia inmediatamente puede hacer GET `/api/tools/3dsky/embed-url` con 200. ✓

## Parte 4 — Filtros UI en /admin/logs

- **`LogsFilters`** (Client): barra con date range (since/until), user picker, tool picker + action prefix (solo tab usage) + tx type (solo tab transactions). Layout grid responsive, debounce 600ms en el input de action.
- **`LogsBoard`** reescrito:
  - Tab + filtros derivados de URL `searchParams` (single source of truth). Refrescar mantiene state; URL es shareable.
  - `router.replace` con `scroll:false` al cambiar tab/filtros — no saturamos history.
  - Cache por tab se invalida cuando cambian filtros (`filtersKey = JSON.stringify`).
  - 3 fetchers reusan filtros mapeados al shape de cada endpoint (module-sessions usa `from`/`to`, los otros `since`/`until`).
- **`/admin/logs` page** (Server): pre-carga users + tools livianos para popular los pickers desde el primer render sin fetch adicional. `LogsBoard` envuelto en Suspense (`useSearchParams` lo exige).

**Sin cambios en endpoints** — todos aceptan los query params desde sesión 08.

## Bonus — Fix de loop de redirect (`fea7309`)

Antes de arrancar la sesión apareció `ERR_TOO_MANY_REDIRECTS`. Causa: el proxy redirigía `/login → /hub` si veía cookie. Pero si el JWT estaba stale, `/hub` hacía `requireAuth → null` → redirect a `/login` → proxy bouncea de vuelta. Loop.

Fix: saqué esa branch del proxy. La page `/login` ya hace el redirect a `/hub` o `/admin` si la sesión es válida (vía `getSession` que sí chequea Supabase). Si está inválida, `/login` renderea el form y el user puede re-loguearse (el POST sobrescribe las cookies stale con tokens frescos).

## Smoke tests OK

```bash
npm run typecheck    # OK
npm test             # 19/19
npm run build        # 43 rutas + Proxy
```

| Verificación | Estado |
|---|---|
| Light mode arranca por default | ✅ |
| Toggle dark/light funciona y persiste en DB | ✅ |
| Validación Zod theme inválido → 400 | ✅ |
| /admin/prompt tiene 2 tabs (System Prompt, Memoria) | ✅ |
| Editar la memoria afecta las respuestas de Claude end-to-end | ✅ |
| `usage_logs.metadata` registra memoryVersion + memoryLength | ✅ |
| Click en tool fuera de horario → OutsideHoursModal | ✅ |
| POST `/api/me/exceptional-access` con cap 720 min | ✅ |
| Approve exceptional → tool_access con expires_at | ✅ |
| User inmediatamente puede entrar (canUseTool) | ✅ |
| `/admin/requests` con kind filter (chips) + badges coloreados | ✅ |
| `/admin/logs` con LogsFilters y URL state | ✅ |

## Pendientes para deploy (sesión 12)

1. **Vercel body size 4.5MB**: 5 imágenes × 5MB en base64 ≈ 33MB → explota en prod. Bajar límite client-side a 1MB×3 **o** subir a Supabase Storage primero. **Pendiente desde sesión 07.**
2. **`SLACK_WEBHOOK_URL`**: si NQS lo pasa antes del deploy, sumarlo a Vercel envs. Sin URL las notifs se loguean como `skipped` y no rompe nada.
3. **Migrations 0001 → 0007** en orden si la DB de prod arranca limpia. La 0003 quedó con nombres de modelos incorrectos (Sonnet 4-5 / Opus 4-1) y la 0004 los corrige (Sonnet 4-6 / Opus 4-7). Si Anthropic publica modelos nuevos, otra migration suma al CHECK.
4. **`ENCRYPTION_KEY`**: rotar antes de prod si la key actual fue expuesta en algún momento. Los `system_prompts.content_encrypted` quedarían inutilizables si se rota sin re-encriptar — el adapter Claude **no** podría desencriptar. Plan B: re-encriptar via script con la key vieja → key nueva.
5. **Expiración automática de `tool_access.expires_at`**: hoy se valida at-runtime en `canUseTool` ("si expires_at pasó, lo trato como expired"). Para limpieza/auditoría, un cron job que setee `status='expired'` cuando `expires_at < NOW()` sería más prolijo. **No bloqueante para MVP.**
6. **Schedule original tras acceso excepcional**: al aprobar un excepcional pisamos `schedule=null` temporal. Cuando vence, queda sin schedule (acceso 24/7 — incorrecto). Solución: guardar el schedule original en `review_note` y restaurarlo en un cron. **Documentado.**
7. **Refresh post-compra de créditos** todavía es `window.location.reload()` (heredado de sesión 11). Refactor a Server Actions cuando haya tiempo.

## Heads-up del deploy

- `next build` en Next 16 usa Turbopack — el dev server también, sin opt-out. El smoke test mostró que funciona; no hay problema documentado.
- Cookies `secure` ya condicionado a `NODE_ENV === "production"` en login route.
- Hay 4 migrations applied históricamente (0001 base, 0002 3dsky, 0003 model selector con typo, 0004 fix model names, 0005 theme, 0006 memory, 0007 exceptional). El typo de 0003 quedó en historial — re-aplicar todo desde 0 funciona porque 0004 corrige; documentado.

## Variables de entorno agregadas

(ninguna nueva — `SLACK_WEBHOOK_URL` ya estaba de sesión 08 como placeholder)

## Commits sugeridos

Ya hechos, en orden:
- `666ff48` `feat(logs): filtros UI en admin logs con URL state`
- `70a24ff` `feat(theme): light mode default + toggle dark/light persistente`
- `e6d33c1` `feat(memory): sistema de memoria separado del system prompt`
- `a69dd22` `feat(schedule): popup horario + solicitud acceso excepcional`

Plus el fix preliminar `fea7309 fix(proxy): evita ERR_TOO_MANY_REDIRECTS con cookies stale`.

## Próximo paso

`kit/prompts/mvp/12-deploy.md` — deploy final del MVP a Vercel.
