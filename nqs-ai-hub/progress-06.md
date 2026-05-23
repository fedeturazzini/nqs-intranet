# Progress 06 — ClaudeAdapter + endpoints de Claude

**Fecha**: 2026-05-23
**Duración real**: ~2 horas
**Sesión anterior**: `progress-05.md`
**Próxima sesión**: `kit/prompts/mvp/07-claude-view.md`

## Qué se construyó

- Patrón `ToolAdapter` cableado: `types`, `utils`, `index` (registry) + 5 placeholders.
- `claudeAdapter` operativo: `checkAccess` + `logUsage` + `execute` (multimodal + conversaciones persistentes + token logging).
- `threeDSkyAdapter` stub: `checkAccess` y `getRemainingCredits` reales (los usa el Hub desde sesión 05); `consumeCredit` y `getEmbedUrl` tiran `notImplemented` hasta sesión 08.
- Cliente Anthropic en `src/lib/anthropic/client.ts`: instancia única lazy, `callClaude(system, messages, opts)` + `buildUserContent(prompt, images)`. Retries + timeout built-in del SDK.
- Middleware `canUseTool(userId, toolId)` + helper `requireToolAccess()` que devuelve `NextResponse | null`.
- 3 endpoints nuevos: `POST /api/tools/claude/execute`, `GET /api/me/conversations`, `GET /api/me/conversations/[id]`.
- **Fix de proxy**: las rutas `/api/*` sin sesión ahora devuelven `401 JSON` en vez de redirect HTML a `/login` (bug que apareció haciendo el smoke test del endpoint).

## Archivos creados

```
nqs-ai-hub/
├── src/
│   ├── app/api/
│   │   ├── me/
│   │   │   └── conversations/
│   │   │       ├── route.ts                    ← GET últimas 20 convs
│   │   │       └── [id]/route.ts               ← GET mensajes de una conv
│   │   └── tools/claude/execute/route.ts       ← POST ejecutar Claude
│   └── lib/
│       ├── adapters/
│       │   ├── types.ts                        ← ToolAdapter, AccessState, Result, ExecuteParams/Result
│       │   ├── utils.ts                        ← logToolUsage
│       │   ├── index.ts                        ← registry + getAdapter + createPlaceholderAdapter
│       │   ├── claude.ts                       ← ClaudeAdapter operativo
│       │   └── three-dsky.ts                   ← stub (sesión 08 completa)
│       ├── anthropic/client.ts                 ← Anthropic SDK + callClaude + buildUserContent
│       └── middleware/permissions.ts           ← canUseTool + requireToolAccess
└── progress-06.md
```

## Archivos modificados

- `src/proxy.ts` — bug fix: rutas `/api/*` sin sesión devuelven 401 JSON; rutas de pantallas siguen con redirect HTML a `/login`.
- `package.json` — agregadas deps `@anthropic-ai/sdk@^0.98` y `zod@^4`.
- `.env.local` — `ANTHROPIC_API_KEY` poblada (gitignored).

## Decisiones técnicas tomadas

1. **Tipos en `./types.ts`, registry en `./index.ts`.** El reference ponía todo en `index.ts` pero eso provoca ciclos: si `claude.ts` importa types de `./index`, e `./index` importa `claudeAdapter` de `./claude`, los módulos se ven con shapes vacíos en initial-load. Solución: `types.ts` autónomo, `claude.ts` y `three-dsky.ts` importan de `./types` y `./utils`, `./index` solo registra. `./index` re-exporta los types para que el resto del código (rutas) los consuma desde `@/lib/adapters` sin saber la sub-ruta.

2. **`logToolUsage` no tira excepción.** Devuelve `boolean` (true=OK, false=falló). El caller decide qué hacer. Razón: si Anthropic ya nos cobró tokens, queremos devolver la respuesta al user aunque el insert al log falle por DB transient. Loggeamos `console.error` con metadata completa para auditar.

3. **Modelo: `claude-sonnet-4-5` (no `claude-sonnet-4-6`).** El prompt menciona `4-6` pero ese alias no resuelve hoy en la API. Lo dejé como `4-5` con un TODO para bumpear cuando Anthropic publique el 4-6. El default vive en `client.ts` (`DEFAULT_MODEL`) — se cambia en un solo lugar.

4. **Retries + timeout = built-in del SDK.** El SDK de Anthropic ya tiene `maxRetries` con exponential backoff y `timeout` config (los seteamos a 3 y 60s). Construir un wrapper propio sería duplicar lógica más frágil. El SDK además solo reintenta en errores transients (5xx, 408, 429, network), no en 4xx que son bugs nuestros.

5. **Order of operations en `execute`**: Anthropic primero, persist después. Si Anthropic falla, no ensuciamos la conv. Si Anthropic OK pero persist falla, el user igual recibe su texto (ya pagamos) y dejamos `console.error` para audit. **No es transaccional** (Supabase JS no lo soporta). Para atomicidad real habría que mover persist+log a un Postgres RPC. Documentado como TODO.

6. **`conversationId` opcional en el body.** Si viene, traemos historial y validamos ownership (`conversation.user_id === userId`); si no, creamos una conv nueva con título = primeros 80 chars del prompt. El multi-turn se hizo en el primer smoke test: la segunda pregunta llegó con 158 input tokens vs 88 del primero — la diferencia es el historial previo que se reinjecta como mensajes.

7. **404 (no 403) cuando bruno intenta leer la conv de sofia.** Devolver 403 leakearía que la conv existe. Devolvemos 404 (genérico) para no dar pistas de qué IDs son válidos. Pattern estándar de "don't enumerate."

8. **Imágenes ANTES del texto** en `buildUserContent`. Anthropic recomienda este orden en sus docs de vision — mejora la calidad de las respuestas multimodal.

9. **Base64 en DB para imágenes = no, por ahora.** El schema tiene `claude_messages.images JSONB`. Hoy guardamos `[]` y la imagen vive solo en la request a Anthropic. Cuando exista módulo de uploads (Supabase Storage), guardamos las URLs ahí. Para MVP el browser no necesita re-mostrar las imágenes históricas — esto es aceptable.

10. **Bug fix del proxy descubierto por el smoke test.** El proxy redirigía `/api/tools/claude/execute` sin sesión a `/login` con 307. Un cliente API esperando JSON recibía HTML. Lo cambié: ahora `/api/*` sin sesión devuelve `{"error":"unauthorized"}` con 401; las pantallas siguen con redirect. Esto también arregla cualquier futuro endpoint que tengamos.

11. **Wrapper `Result<T, E>` en `execute`, no throws.** Adheriendo a la convención del proyecto (02-conventions.md). El endpoint hace el `if (!result.ok) return 502`. Errores antes del API call (config, network) también van por Result — el adapter loggea el original pero devuelve un Error con mensaje genérico al caller para no leakear detalles internos.

12. **`requireToolAccess` devuelve `NextResponse | null`** (no Response). Trabajamos en Next 16 App Router; usar `NextResponse` mantiene tipos consistentes y permite features como `cookies.set` en respuestas si las necesitamos.

## Cosas pendientes (TODO en código)

- [ ] Atomicidad real de persist + log con Postgres RPC (hoy best-effort).
- [ ] Cuando exista módulo de uploads, guardar imágenes en Supabase Storage y poblar `claude_messages.images` con URLs.
- [ ] Bump del default model a `claude-sonnet-4-6` cuando Anthropic lo publique.
- [ ] Streaming de respuestas (post-MVP). Hoy `execute` espera la respuesta completa.
- [ ] Rate limit por user (post-MVP). Hoy un user puede bombardear el endpoint.
- [ ] Tests unitarios del middleware `canUseTool` y del adapter (con mocks de Supabase y Anthropic).

## Cosas a tener en cuenta para la próxima sesión

- El endpoint `POST /api/tools/claude/execute` ya devuelve el shape `{ text, tokensInput, tokensOutput, conversationId, messageId }`. La sesión 07 (Claude view) consume esto desde un Client Component.
- Hay 1 conv real en la DB del proyecto Supabase (creada por el smoke test). Si querés limpiarla, `DELETE FROM claude_conversations` en el SQL Editor lo cascadea a `claude_messages`.
- Para el primer uso productivo: el system prompt activo es el placeholder seedeado en sesión 02 ("Sos el asistente creativo interno de NQS..."). Cuando NQS pase el prompt real, se reemplaza desde el panel admin (sesión 10) — el endpoint actual ya lee desde DB encriptado.
- El admin (tomas) pasa todos los checks de `canUseTool` por la regla "admin pasa por arriba" — útil para que pueda probar tools desde su sesión sin tener `tool_access` rows.

## Cómo probar lo que se construyó

### Smoke test estructural (sin Anthropic — opcional)

```bash
# Sin sesión → 401 JSON
curl -X POST http://localhost:3003/api/tools/claude/execute \
  -H 'content-type: application/json' -d '{"prompt":"hola"}'
# {"error":"unauthorized"}  HTTP 401

# Con sesión, body inválido → 400 zod
curl -X POST http://localhost:3003/api/tools/claude/execute \
  -b cookies.txt -H 'content-type: application/json' -d '{}'
# {"error":"bad_request","message":"prompt: Invalid input..."}  HTTP 400
```

### Smoke test contra Anthropic real (verificado en esta sesión)

```bash
# 1) Login
curl -X POST http://localhost:3003/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"sofia@nqs.test","password":"nqs2026sofia"}' \
  -c sofia.txt

# 2) Primer prompt
curl -X POST http://localhost:3003/api/tools/claude/execute \
  -b sofia.txt -H 'content-type: application/json' \
  -d '{"prompt":"En 20 palabras: ¿quién sos?"}'
# → { text: "Soy tu asistente creativo en NQS...", tokensInput: 88, tokensOutput: 49, conversationId: "...", messageId: "..." }

# 3) Listar conversaciones del user
curl -b sofia.txt http://localhost:3003/api/me/conversations
# → { conversations: [{id, title, ...}] }

# 4) Leer mensajes
curl -b sofia.txt http://localhost:3003/api/me/conversations/<id>
# → { conversation: {...}, messages: [{role:'user', ...}, {role:'assistant', tokens_input, tokens_output, ...}] }

# 5) Segundo turn (multi-turn)
curl -X POST http://localhost:3003/api/tools/claude/execute \
  -b sofia.txt -H 'content-type: application/json' \
  -d '{"prompt":"¿Qué te pregunté antes?","conversationId":"<id>"}'
# → Claude responde con conocimiento del primer turn (tokensInput > primero porque incluye historial)

# 6) Ownership: bruno trata de leer conv de sofia → 404
curl -b bruno.txt http://localhost:3003/api/me/conversations/<id-de-sofia>
# → {"error":"not_found"}  HTTP 404
```

### Verificación en DB

Después de los calls de arriba, en Supabase Dashboard:
- `claude_conversations`: 1 row con title "En 20 palabras: ¿quién sos?".
- `claude_messages`: 4 rows (2 user + 2 assistant). Los assistant tienen `tokens_input` y `tokens_output` poblados.
- `usage_logs`: 2 rows con `action='claude.execute'`, `tokens_consumed` con la suma input+output, y `metadata` con `conversationId`, `messageId`, `imagesCount`, `promptLength`.

### Tests + build

```bash
npm test          # 6/6 (auth, no agregamos tests al adapter en esta sesión)
npm run typecheck # OK
npm run build     # 12 rutas + Proxy
```

## Adapter de Claude — features

| Feature | Estado |
|---|---|
| `id`, `category`, `usesCredits`, `isEmbedded` | ✅ |
| `checkAccess(userId)` | ✅ devuelve `AccessState` con `expiresAt`/`requestedAt`/`expiredAt` según status |
| `logUsage(userId, action, metadata)` | ✅ delega a `logToolUsage` |
| `execute(userId, params)` | ✅ multimodal + multi-turn + persist + log |
| Retries automáticos | ✅ (3, backoff exp, vía SDK) |
| Timeout 60s | ✅ (vía SDK) |
| System prompt nunca expuesto | ✅ vive en DB encriptada, se desencripta server-side, se pasa como `system:` al SDK, no entra en messages ni en la response |
| Error genérico al user en fallas Anthropic | ✅ ("no pudimos procesar tu pedido, intentá de nuevo") |
| Token logging por call | ✅ (best-effort, no atómico) |

## Endpoint probado con curl — resultado real

Verificado en esta sesión contra la API de Anthropic con la key del proyecto. La transcripción del primer turn:

```
POST /api/tools/claude/execute
Body: {"prompt":"En 20 palabras: ¿quién sos?"}

Response 200:
{
  "text": "Soy tu asistente creativo en NQS. Transformo prompts cortos en briefs detallados, claros y listos para ejecutar. Hablo en rioplatense.",
  "tokensInput": 88,
  "tokensOutput": 49,
  "conversationId": "66034c10-2ff7-4610-864d-80892ce51449",
  "messageId": "128b450c-add1-4319-bf82-4ac060627bff"
}
```

El system prompt placeholder se está usando — la respuesta literalmente repite "transformo prompts cortos en briefs detallados, claros y listos para ejecutar. Hablo en rioplatense", que es texto del seed. ✓

Multi-turn (segundo prompt con `conversationId`):
- Input tokens: 158 (vs 88 del primero) → diferencia ≈ historial previo reinjectado ✓
- Respuesta: "Me preguntaste quién soy en veinte palabras exactas." → Claude entendió contexto ✓

## Errores conocidos

- Persist + log de usage NO son atómicos: si el insert falla después del API call, el user recibe texto pero la conv queda sin guardar (o sin log). Documentado como TODO para Postgres RPC.
- HTML5 drag-and-drop (del Hub, sesión 05) sigue sin funcionar en mobile — no se toca en esta sesión.

## Variables de entorno agregadas

```env
ANTHROPIC_API_KEY=sk-ant-…  # ya poblada (gitignored)
```

## Commits sugeridos

```
feat(claude): ToolAdapter pattern + ClaudeAdapter + endpoint execute
fix(proxy): rutas /api/* sin sesión devuelven 401 JSON en vez de redirect
```

(Una sesión = un commit suele alcanzar. Hago un solo commit con todo.)

## Próximo paso

`kit/prompts/mvp/07-claude-view.md` — la pantalla del wrapper de Claude en `/tool/claude`: input textarea, drop de imágenes, render del response, sidebar con conversaciones.
