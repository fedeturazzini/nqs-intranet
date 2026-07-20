# Auditoría — Por qué no llegan las notificaciones de Slack

**Fecha:** 2026-07-16 · **Branch:** `develop` · **Read-only** (único archivo nuevo: este).
Síntoma reportado por NQS: **no llegan los avisos de "fulano te pide acceso"** a Slack.
Antes llegaban. La solicitud **sí** se guarda (aparece en el panel) → el problema es solo
la notificación.

> **TL;DR / Veredicto.** La causa #1 sospechada por vos (el `void notifySlack(...).catch()`
> "traga el error") es **medio cierta pero por otro motivo**: el helper de Slack **sí
> loguea** los errores. El problema real del fire-and-forget es más profundo y explica
> TODO: en Vercel (serverless), cuando el endpoint hace `void notifySlack(...)` y
> **retorna la respuesta sin esperar**, la función se **congela apenas manda la respuesta**
> y el POST a Slack **queda colgado y nunca se completa** (ni se manda, ni se loguea el
> error — la ejecución muere antes). Y hay una **asimetría reveladora en el código**: los
> avisos de **solicitud nueva** (los que no llegan) son `void` (fire-and-forget); los de
> **resolución** (aprobado/rechazado) son `await` (se completan dentro del request). Eso
> calza exacto con "las solicitudes no avisan". El fix es hacer que el trabajo post-respuesta
> corra de verdad (`after()` de `next/server` o `waitUntil`), no volver a `await` (que
> re-trae el bug del botón colgado). **Es código.** Igual dejo el checklist de config por
> si el webhook además está revocado.

---

## 1. El helper (`src/lib/notifications/slack.ts`)

- **Env var:** lee `process.env.SLACK_WEBHOOK_URL` (nombre exacto). En `.env.local` está
  cargada; en Vercel hay que confirmarlo (sección 6).
- **Guard de "sin webhook" (como el `[EMAIL SKIPPED]`):** sí existe. Si `SLACK_WEBHOOK_URL`
  no está seteada, **no manda nada y loguea**:
  ```json
  {"level":"info","msg":"slack notification skipped — SLACK_WEBHOOK_URL no seteada","kind":"access_request"}
  ```
  → texto exacto para buscar en Vercel: **`slack notification skipped`**.
- **Timeout / manejo de fallo:** `AbortController` con **5s**. Y — importante — **NO se traga
  los errores**:
  - Si Slack responde **no-OK** (4xx/5xx), loguea con `console.error`:
    ```json
    {"level":"error","msg":"slack webhook returned non-OK","status":<código>,"body":"<primeros 200 chars>","kind":"..."}
    ```
    → buscar en Vercel: **`slack webhook returned non-OK`** (incluye status + body de Slack).
  - Si el POST falla (timeout, red, DNS), loguea:
    ```json
    {"level":"error","msg":"slack webhook POST failed","error":"<mensaje>","kind":"..."}
    ```
    → buscar en Vercel: **`slack webhook POST failed`**.
- **¿Distingue 200 de error de Slack?** Sí a nivel HTTP (`res.ok`). Pero **ojo con un caso
  borde de Slack**: los Incoming Webhooks a veces devuelven **HTTP 200 con body `"ok"`** aun
  cuando algo está raro, y devuelven **200/400 con body `invalid_payload` / `no_service` /
  `channel_not_found`** en otros. El helper loguea el body **solo cuando `!res.ok`** (status
  ≥ 400). Si Slack devolviera 200 con un body de error (poco común pero posible), el helper
  lo daría por bueno. No es la causa principal, pero es un punto ciego menor.

**Conclusión del helper:** está **bien hecho** y **no es el que traga el error**. Si el POST
se ejecuta y falla, queda registrado en Vercel. El problema es que, con fire-and-forget, **el
POST muchas veces ni se ejecuta** (ver punto 3 y 7).

---

## 2. Los dos tipos de aviso (payload exacto)

### A) Solicitud NUEVA (`newRequestPayload`) — **con `<!channel>`**
Usado por los 3 kinds nuevos (`credits_request`, `access_request`, `exceptional_request`).

```
text (fallback/push):  "<!channel> 🔔 Nueva solicitud — {nombre} pide {pide}"
blocks:
  1. header      "🔔 Nueva solicitud"            (plain_text)
  2. section     "<!channel>"                     (mrkdwn)   ← la mención al canal
  3. section     fields: *Empleado:* {nombre} | *Pide:* {pide}
  4. actions     botón "Ver detalle" → {adminUrl}  (si adminUrl existe)
+ identidad: username "NQS AI Hub" + icon_emoji 🟡 (o icon_url si SLACK_ICON_URL está)
```

### B) Resolución (aprobado/rechazado) — **SIN `<!channel>`**
Usado por `access_approved/rejected` y `credits_approved/rejected`.

```
text:  "✅/❌ {admin} aprobó/rechazó acceso: {tail}"   (sin <!channel>)
blocks:
  1. header      "✅ Acceso aprobado" (o rechazado / Solicitud aprobada…)
  2. section     fields: *Empleado* | *Herramienta* | *Resuelto por* | *Nota?* | *ID solicitud* (uuid)
+ misma identidad
```

**La diferencia clave que pediste:** sí, **solo el aviso de solicitud nueva usa `<!channel>`**;
el de resolución no. **PERO** — matiz importante: `<!channel>` en un Incoming Webhook es una
mención estándar y **normalmente NO hace que Slack rechace el mensaje** (a lo sumo no
"pinguea" si el usuario del webhook no tiene permiso, pero el mensaje igual se postea). Es
**poco probable** que el `<!channel>` sea la causa del rechazo total. Si lo fuera, el helper
lo registraría como `slack webhook returned non-OK` con body `invalid_payload` — por eso el
log de Vercel es el que confirma o descarta esto. **No es mi hipótesis principal**, pero es
barato de descartar mirando el log.

---

## 3. Quién llama a qué (¡acá está la asimetría!)

| Endpoint | Aviso | Cómo llama | Insert antes del Slack |
|---|---|---|---|
| `POST /api/me/access-request` | solicitud de acceso | **`void` (fire-and-forget)** | ✅ sí |
| `POST /api/me/exceptional-access` | acceso excepcional | **`void` (fire-and-forget)** | ✅ sí |
| `POST /api/tools/3dsky/request-credits` | créditos 3DSky | **`void` (fire-and-forget)** | ✅ sí |
| `POST /api/tools/kling/request-credits` | créditos Kling | **`void` (fire-and-forget)** | ✅ sí |
| `POST /api/admin/requests/[id]/approve` | resolución (aprobado) | **`await`** | (resuelve, no inserta) |
| `POST /api/admin/requests/[id]/reject` | resolución (rechazado) | **`await`** | (resuelve, no inserta) |

- **Todos los avisos de solicitud NUEVA** (los que NQS dice que no llegan) son
  **fire-and-forget** (`void notifySlack(...).catch(...)`), después del `return` lógico.
- **Todos los avisos de resolución** (aprobado/rechazado) son **`await notifySlack(...)`**,
  o sea **se completan dentro del request** antes de responder.
- **El insert de la solicitud va SIEMPRE antes del Slack** → por eso la solicitud queda
  guardada y aparece en el panel aunque el aviso no salga. ✅ Consistente con el síntoma.
- **Nadie usa `after()` (de `next/server`) ni `waitUntil`** en todo el repo → **no hay nada
  que mantenga viva la función para terminar el POST colgado**.

Esta asimetría es la evidencia más fuerte: **lo que falla (`void`) y lo que funciona
(`await`) están partidos justo por la línea "solicitud nueva vs. resolución"**. Un webhook
revocado o un `<!channel>` rechazado romperían **ambos** por igual (mismo webhook, mismo
helper). Que fallen solo los `void` apunta al fire-and-forget, no al webhook.

---

## 4. ¿Las tools pausadas rompen el flujo?

**No es la causa de las solicitudes que sí aparecen** — pero hay un detalle a saber:

- `access-request` valida `is_active=true` y **rechaza `coming_soon` con `400 tool_coming_soon`
  ANTES de crear la solicitud y ANTES del Slack**. O sea: pedir acceso a una tool pausada
  **no crea nada y no notifica** (corta antes).
- **3DSky y Kling están pausadas** (`is_active=false`, confirmado). Además, desde el hub las
  cards "Próximamente" **ni siquiera abren el modal de pedir acceso** (el handler corta si
  `status === "coming_soon"`). ⇒ **no se pueden generar solicitudes de acceso a 3DSky/Kling
  desde la UI**, y por API tirarían 400 sin guardar.
- **Como el síntoma es "la solicitud SÍ se guarda y aparece en el panel"**, esas solicitudes
  son necesariamente de una tool **activa** — hoy las únicas activas son **Claude** (que
  todos ya tienen) y **Tutoriales**. ⇒ **las solicitudes que no avisan son con toda
  probabilidad de acceso a _Tutoriales_** (mismo endpoint `access-request`, mismo `void`).
- ⚠️ Los avisos de **créditos** de 3DSky/Kling son otra historia: al estar pausadas esas
  tools, el flujo de créditos casi no es alcanzable (la página redirige al hub). No es el
  caso que reporta NQS ("te pide acceso"), pero si algún día se reactivan, esos avisos
  también son `void` → mismo problema.

**Veredicto de este punto:** la tool pausada **no** es la causa (esas ni siquiera crean
solicitud); la causa es el fire-and-forget del endpoint de acceso, que sí corre para las
tools activas.

---

## 5. Bugs conocidos a confirmar

- **Link "Ver detalle" de créditos 3DSky → sigue MAL.** `3dsky/request-credits` arma
  `adminUrl = {APP_URL}/admin#requests` (ancla vieja inexistente). Kling, acceso y excepcional
  usan `/admin/requests` (correcto). Es cosmético (no rompe el envío), pero sigue presente.
- **`SLACK_ICON_URL` vacía → NO rompe el mensaje.** El código está bien defendido:
  ```
  const iconUrl = process.env.SLACK_ICON_URL?.trim();
  if (iconUrl) return { username, icon_url: iconUrl };   // solo si tiene valor
  return { username, icon_emoji: ":large_yellow_circle:" }; // fallback 🟡
  ```
  Si la var falta o está vacía, **usa el emoji 🟡** — **nunca manda un `icon_url` vacío**.
  ⇒ la hipótesis "icon vacío → Slack rechaza el mensaje entero" queda **descartada**. Lo
  único que pasa sin `SLACK_ICON_URL` es que se ve el emoji en vez del logo NQS.

---

## 6. Config fuera del repo (checklist — no auditable desde el código)

- [ ] **`SLACK_WEBHOOK_URL` en Vercel**, scope **Production**, con valor válido, y con un
      **deploy posterior** a haberla cargado (Vercel no inyecta env nuevas en deploys viejos).
- [ ] **El webhook sigue vivo.** Slack **revoca** los Incoming Webhooks si se **desinstala/
      reinstala** la app, se **rota** el webhook, o se **archiva/borra** el canal destino.
      "Antes llegaba y ahora no" es el síntoma clásico de webhook revocado. Test directo:
      `curl -X POST -H 'Content-type: application/json' --data '{"text":"prueba NQS"}' <WEBHOOK_URL>`
      → debe responder **`ok`**. Si responde `no_service` / `no_team` / 404 → **webhook muerto**.
- [ ] **El canal existe y permite `@channel`** (si tenés restringidas las menciones a admins,
      el mensaje igual se postea; solo no pinguea).
- [ ] **Logs de Vercel** (Production, endpoint `POST /api/me/access-request`) — buscar:
      - `slack notification skipped` → la env var no está en runtime.
      - `slack webhook returned non-OK` → llegó a Slack y Slack lo rechazó (mirar `status`+`body`).
      - `slack webhook POST failed` → timeout/red.
      - **Ninguno de los tres + la solicitud igual se guardó** → el fire-and-forget **se
        cortó antes de ejecutarse** (la hipótesis principal, punto 7).

---

## 7. Veredicto

### Causa más probable (código): fire-and-forget cortado por el freeze de serverless
Cuando el endpoint hace `void notifySlack(...)` y **retorna la respuesta**, en Vercel la
función **se congela/termina apenas responde**. El `fetch` a Slack quedó **pendiente** y,
sin `after()`/`waitUntil` que mantenga viva la ejecución, **no se completa** — y como muere
antes de resolverse, **tampoco entra al `catch`/log** (por eso "falla en silencio", pero no
por el `.catch`, sino porque la ejecución se detuvo). Esto **calza exactamente** con:
- **Solo fallan los avisos de solicitud nueva** (todos `void`) y **no** los de resolución
  (todos `await`, que sí completan en-request).
- **"Antes llegaban"**: antes del cambio a fire-and-forget, el aviso de solicitud nueva era
  `await` → se completaba dentro del request. El cambio para destrabar el botón colgado
  (correcto en su intención) **movió el envío a después de la respuesta**, donde el runtime
  ya no garantiza que corra.
- **La solicitud igual se guarda**: el insert es previo y sí ocurre en-request.

> Nota de matiz honesto: el proyecto tiene **Fluid Compute** activado (`vercel.json`
> `"fluid": true`), que **mejora** las chances de que el trabajo post-respuesta corra (mantiene
> instancias tibias) — por eso puede haber sido **intermitente** en vez de 0%. Pero Fluid **no
> garantiza** ejecutar promesas colgadas; Vercel sigue exigiendo `waitUntil`/`after()` para eso.
> Intermitencia degradada ("a veces sí, cada vez menos") es consistente con esto.

### Causa alternativa (config): webhook revocado / env ausente
Si el webhook está **muerto** o `SLACK_WEBHOOK_URL` **no está en Vercel**, no llega nada. La
forma de distinguir de la causa de código:

> **Discriminador de 1 minuto:** ¿los avisos de **aprobado/rechazado** (cuando el admin
> resuelve una solicitud) **siguen llegando**?
> - **Sí llegan** (resoluciones sí, solicitudes no) → es el **fire-and-forget** (código). El
>   webhook está vivo.
> - **No llega NINGUNO** (ni solicitudes ni resoluciones) → es **config** (webhook revocado o
>   env ausente). Correr el `curl` del punto 6.

### Descartados
- ❌ El `.catch(console.error)` tragando el error → el helper loguea internamente igual.
- ❌ `icon_url` vacío rompiendo el payload → el código usa emoji de fallback, nunca manda vacío.
- ⚠️ `<!channel>` → posible pero improbable; el log `returned non-OK` lo confirmaría. No es
  la hipótesis principal.

### Qué tocar de cada lado
**Código (la recomendación fuerte):**
- Reemplazar el `void notifySlack(...)` por **`after(() => notifySlack(...))`** usando
  `import { after } from "next/server"` en los 4 endpoints de solicitud nueva
  (`access-request`, `exceptional-access`, `3dsky/request-credits`, `kling/request-credits`).
  `after()` corre el trabajo **después de enviar la respuesta pero manteniendo viva la
  función** → el botón no se cuelga (se resuelve el bug original) **y** el Slack se completa
  (se resuelve este bug). Es el patrón oficial de Next para exactamente este caso.
- (Menor) Corregir el link `/admin#requests` → `/admin/requests` en `3dsky/request-credits`.
- (Opcional, recomendado) **Logging de éxito**: hoy solo se loguea el fallo. Agregar un
  `console.log` del resultado OK (status 200 + kind) para no volver a quedar ciegos —
  proponerlo, no implementarlo ahora.

**Config (verificar en paralelo):**
- Correr el `curl` del webhook (punto 6) para confirmar que está vivo.
- Confirmar `SLACK_WEBHOOK_URL` en Vercel/Production + redeploy posterior.
- (Cosmético) cargar `SLACK_ICON_URL` para el logo.

### Recomendación de cierre
1. Correr el **discriminador** (¿llegan las resoluciones?) → dice si atacar código o config.
2. Si es código: migrar a `after()` los 4 endpoints (chico, 4 archivos, mismo patrón).
3. Sumar el **log de éxito** del envío (así el próximo diagnóstico es mirar 1 línea en Vercel).
4. De paso: el link de 3DSky (1 línea).
