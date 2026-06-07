# Auditoría Slack — Estado actual

**Fecha del reporte**: 2026-06-06
**Branch revisada**: `develop`
**Alcance**: solo lectura de código. No se modificó nada salvo este archivo.

---

## Setup técnico

- **Helper**: `src/lib/notifications/slack.ts`
- **Método**: **Incoming Webhook** (POST a `SLACK_WEBHOOK_URL`). No usa Web API ni tokens de bot.
- **Variables de entorno**:
  | Var | Uso | Estado local (`.env.local`) |
  |-----|-----|------------------------------|
  | `SLACK_WEBHOOK_URL` | URL del webhook (secreto) | ✅ **configurada** (valor real, redactado acá) |
  | `SLACK_ICON_URL` | logo del bot (opcional) | ❌ **vacía** → cae al emoji 🟡 |
  | `NEXT_PUBLIC_APP_URL` | base del link "Ver detalle" | ✅ configurada |
- **Resiliencia**: si no hay `SLACK_WEBHOOK_URL` → no-op silencioso (loguea `skipped`). Si el POST falla (timeout 5s / 5xx / red) → loguea `error` pero **nunca** tira excepción (no rompe la operación del usuario). Cubierto por tests.
- **Identidad del bot** (`slackIdentity()`, líneas 81-89): `username: "NQS AI Hub"` + `icon_url` si `SLACK_ICON_URL` está seteada; si no, `icon_emoji: ":large_yellow_circle:"` (🟡).

> ⚠️ **Producción (Vercel)**: esta auditoría solo ve el entorno local. Hay que confirmar que en Vercel estén `SLACK_WEBHOOK_URL`, `NEXT_PUBLIC_APP_URL` y (si se quiere el logo) `SLACK_ICON_URL`. El código se comporta igual en ambos: sin `SLACK_ICON_URL` muestra 🟡.

---

## Notificaciones implementadas

Hay **5 tipos** (`kind`), agrupados en **2 formatos**:

- **Solicitudes NUEVAS** → formato simplificado + `@channel` (función `newRequestPayload`, líneas 181-220).
- **Resoluciones** (aprobado/rechazado) → formato informativo con campos, **sin** `@channel`.

### 1. Solicitud nueva de créditos (3DSky)
- **Trigger**: usuario pide créditos a 3DSky.
- **Archivo**: `src/app/api/tools/3dsky/request-credits/route.ts:72`
- **Tiene @channel**: ✅
- **Tiene logo NQS**: ⚠️ solo si `SLACK_ICON_URL` está seteada (hoy = 🟡)
- **Usa Blocks**: ✅ (header + section + actions)
- **Formato que renderiza**:
  ```
  [🟡]  NQS AI Hub
  🔔 Nueva solicitud
  @channel
  Empleado:              Pide:
  {nombre}               {N} créditos para 3DSky
  [ Ver detalle ]   ← botón azul (primary)
  ```
  Texto de fallback/push: `<!channel> 🔔 Nueva solicitud — {nombre} pide {N} créditos para 3DSky`
- **¿Coincide con pedido de Chule?**: ✅ Sí (EMPLEADO + PIDE, @channel, sin motivo largo).
- **Diferencia menor**: el `adminUrl` apunta a `/admin#requests` (los otros 2 usan `/admin/requests`). Ver **D2**.

### 2. Solicitud de acceso a tool
- **Trigger**: usuario pide acceso a una tool bloqueada (incl. Tutoriales).
- **Archivo**: `src/app/api/me/access-request/route.ts:136`
- **Tiene @channel**: ✅ · **Logo**: ⚠️ (= 🟡 hoy) · **Blocks**: ✅
- **Formato**:
  ```
  🔔 Nueva solicitud
  @channel
  Empleado: {nombre}     Pide: acceso a {tool}
  [ Ver detalle ] → /admin/requests
  ```
- **¿Coincide con Chule?**: ✅ Sí.

### 3. Solicitud de acceso excepcional (fuera de horario)
- **Trigger**: usuario pide acceso excepcional con duración.
- **Archivo**: `src/app/api/me/exceptional-access/route.ts:76`
- **Tiene @channel**: ✅ · **Logo**: ⚠️ (= 🟡) · **Blocks**: ✅
- **Formato**:
  ```
  🔔 Nueva solicitud
  @channel
  Empleado: {nombre}     Pide: acceso excepcional ({dur}) a {tool}
  [ Ver detalle ] → /admin/requests
  ```
  (`{dur}` se formatea lindo: 120 → `2h`, 30 → `30 min`.)
- **¿Coincide con Chule?**: ✅ Sí.

### 4. Resolución de acceso (aprobado / rechazado)
- **Trigger**: admin aprueba/rechaza una solicitud de **acceso**.
- **Archivos**: `admin/requests/[id]/approve/route.ts:262` · `.../reject/route.ts:95`
- **Tiene @channel**: ❌ (correcto — es informativa, no necesita pingear)
- **Logo**: ⚠️ (= 🟡) · **Blocks**: ✅
- **Formato**:
  ```
  ✅ Acceso aprobado            (o ❌ Acceso rechazado)
  Empleado       {nombre}
  Herramienta    {tool}
  Resuelto por   {admin}
  Nota           {nota}          ← solo si hay
  ID solicitud   `uuid-largo`
  ```
- **¿Coincide con Chule?**: ✅ en lo pedido (Chule pidió @channel/simplificar las **solicitudes**, no las resoluciones). Incluye el UUID largo → ver **D3** (opcional).

### 5. Resolución de créditos (aprobado / rechazado)
- **Trigger**: admin aprueba/rechaza créditos o acceso excepcional.
- **Archivos**: `approve/route.ts:271` · `reject/route.ts:104`
- **Tiene @channel**: ❌ (correcto) · **Logo**: ⚠️ (= 🟡) · **Blocks**: ✅
- **Formato**:
  ```
  ✅ Solicitud aprobó           (o ⛔ Solicitud rechazó)
  Empleado       {nombre}
  Herramienta    {tool}
  Créditos       {N}            ← si aplica
  Nota           {nota}         ← si hay
  ID solicitud   `uuid-largo`
  ```
- **¿Coincide con Chule?**: ✅ en lo pedido. Detalle cosmético: el header dice "Solicitud **aprobó**/**rechazó**" (verbo) en vez de "aprobada/rechazada" (adjetivo, como sí hace el de acceso). Ver **D4**.

---

## Resumen comparativo

| Pedido de Chule | Implementado | Pendiente |
|-----------------|--------------|-----------|
| **Logo NQS visible** | ⚠️ **Parcial** | Existe el mecanismo (`icon_url`), pero `SLACK_ICON_URL` está vacía → hoy se ve el emoji 🟡, no el logo. Falta **subir el logo a una URL pública y setear la env** (no requiere código). |
| **@channel en solicitudes nuevas** | ✅ **Completo** | Las 3 solicitudes (créditos / acceso / excepcional) llevan `<!channel>`. Las resoluciones no (correcto). |
| **Formato simplificado (EMPLEADO + QUE PIDE)** | ✅ **Completo** (en solicitudes) | Las solicitudes nuevas ya son header + *Empleado* / *Pide*, sin motivo largo. Las **resoluciones** todavía muestran el `ID solicitud` (UUID) — opcional, fuera del pedido original. |

---

## Diferencias detectadas

### D1 — Logo NQS no visible (config, no código) · **la más relevante**
- **Qué pasa**: `SLACK_ICON_URL` está vacía → `slackIdentity()` cae al emoji 🟡 (`:large_yellow_circle:`).
- **Dónde**: `src/lib/notifications/slack.ts:86-88` (lógica) · `.env.local:21` (env vacía).
- **Hoy vs esperado**: avatar = círculo amarillo 🟡 ↔ esperado = logo NQS.
- **Cómo se cierra**: subir el logo NQS a una URL pública (PNG cuadrado, ej. en Supabase Storage público o `/public`) y setear `SLACK_ICON_URL` en **local y Vercel**. **Cero código.**

### D2 — Link "Ver detalle" de créditos apunta a la ruta equivocada
- **Qué pasa**: la notif de créditos arma `adminUrl = {APP_URL}/admin#requests`, pero la página real es `/admin/requests` (existe `src/app/(dashboard)/admin/requests/page.tsx`). `/admin#requests` cae en la overview del admin con un ancla que no existe.
- **Dónde**: `src/app/api/tools/3dsky/request-credits/route.ts:71`.
- **Comparación**: las solicitudes de acceso y excepcional sí usan `/admin/requests` (correcto).
- **Cómo se cierra**: cambiar `/admin#requests` → `/admin/requests` (1 línea).

### D3 — Resoluciones muestran el UUID de la solicitud (opcional)
- **Qué pasa**: `access_approved/rejected` y `credits_approved/rejected` incluyen `*ID solicitud*\n\`uuid\``.
- **Dónde**: `slack.ts:267` y `slack.ts:296`.
- **Nota**: Chule pidió simplificar las **solicitudes** (las que pingean al canal), no las resoluciones. Es un "extra", no un incumplimiento. Se puede sacar si se quiere consistencia visual.

### D4 — Wording del header de créditos (cosmético)
- **Qué pasa**: header de créditos = "Solicitud **aprobó** / **rechazó**" (verbo) en vez de "aprobada / rechazada". El de acceso sí usa el adjetivo ("Acceso aprobado/rechazado").
- **Dónde**: `slack.ts:305` (y el `text` en `:299`).
- **Impacto**: puramente estético.

---

## Recomendaciones (prompts cortos para cerrar gaps, sin escribir código todavía)

1. **Logo NQS (D1)** — *no es un prompt de código, es config*:
   - Subir `nqs-logo.png` (cuadrado, fondo sólido, ~512px) a una URL pública.
   - Setear `SLACK_ICON_URL` en Vercel + `.env.local`.
   - Probar 1 solicitud y confirmar que el avatar pasó de 🟡 al logo.
   - *Caveat*: algunos workspaces de Slack ignoran el override de `username`/`icon_url` de los Incoming Webhooks según la config de la app. Si tras setear la env sigue saliendo el ícono de la app de Slack, hay que ajustar la app en Slack (permitir customización) — eso ya es config de Slack, no del repo.

2. **Link de créditos (D2)** — prompt mínimo: "cambiar `/admin#requests` → `/admin/requests` en `request-credits/route.ts:71`". 1 línea + actualizar el test `slack.test.ts:92` si se quiere consistencia.

3. **(Opcional) Simplificar resoluciones (D3) y wording (D4)** — solo si Chule lo pide: sacar el `ID solicitud` de los 2 builders de resolución y unificar el header de créditos a "aprobada/rechazada".

> Si se decide cerrar D1+D2, es un prompt corto y quirúrgico que **no toca** las solicitudes nuevas (que ya cumplen el pedido).

---

## Tests automáticos existentes

`tests/slack.test.ts` (8 tests, pasan) ya cubre:
- Degradación: sin webhook no postea; si `fetch` falla o Slack devuelve 500, no propaga.
- Shape: `credits_request` / `access_request` / `exceptional_request` llevan `<!channel>` + header + botón y **no** incluyen el motivo largo.
- `credits_approved` usa ✅ y **no** lleva botón.
- `access_approved` menciona al admin y **no** lleva `<!channel>`.

---

## Tests manuales sugeridos (validar en el Slack real)

1. **User pide créditos a 3DSky** → en el canal:
   - [ ] Llega la notificación
   - [ ] Avatar = logo NQS (hoy: 🟡 hasta setear `SLACK_ICON_URL`)
   - [ ] Empieza con `@channel` y llega como push
   - [ ] Formato: *Empleado* + *Pide*
   - [ ] Botón "Ver detalle" → debería abrir `/admin/requests` (hoy abre `/admin#requests`, ver **D2**)
2. **User pide acceso a tool bloqueada** → mismo checklist (el link acá sí es correcto).
3. **User pide acceso excepcional** → mismo checklist; verificar que la duración salga "2h"/"30 min".
4. **Admin aprueba/rechaza** → llega la resolución, **sin** `@channel` (correcto), con el nombre del admin.

---

## Conclusión

- **@channel**: ✅ cerrado.
- **Formato simplificado**: ✅ cerrado (solicitudes nuevas).
- **Logo NQS**: ⚠️ falta **config** (`SLACK_ICON_URL`), no código.
- **Bonus**: 1 bug menor de link (**D2**) y 2 detalles cosméticos opcionales (**D3/D4**).

Próximo paso: revisar y decidir si hace falta un prompt corto para cerrar **D1** (config) + **D2** (1 línea). Lo demás ya cumple lo que pidió Chule.
