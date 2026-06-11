# Auditoría Slack — Estado actual

**Fecha**: 2026-06-10
**Branch**: `develop`
**Alcance**: solo lectura. No se modificó nada salvo este archivo.
**Cambio vs auditoría previa**: se agregó **Kling** → ahora hay **8** call sites
(antes 7). El helper de Slack no cambió.

## Setup técnico

- **Helper**: `src/lib/notifications/slack.ts`
- **Método**: **Incoming Webhook** (POST a `SLACK_WEBHOOK_URL`). No usa Web API ni token de bot.
- **Variables de entorno**:
  | Var | Uso | Estado local (`.env.local`) |
  |-----|-----|------------------------------|
  | `SLACK_WEBHOOK_URL` | URL del webhook (secreto) | ✅ configurada |
  | `SLACK_ICON_URL` | logo del bot (opcional) | ❌ **vacía** → cae al emoji 🟡 |
  | `NEXT_PUBLIC_APP_URL` | base del link "Ver detalle" | ✅ configurada |
- **Resiliencia**: sin `SLACK_WEBHOOK_URL` → no-op silencioso; si el POST falla (timeout 5s / 5xx / red) → loguea `error`, nunca tira excepción. Cubierto por 8 tests (`tests/slack.test.ts`).
- **Identidad** (`slackIdentity()`): `username: "NQS AI Hub"` + `icon_url` si `SLACK_ICON_URL` está seteada; si no, `icon_emoji: ":large_yellow_circle:"` (🟡).

> ⚠️ **Producción (Vercel)**: esta auditoría ve el entorno local. Confirmar que en Vercel estén `SLACK_WEBHOOK_URL`, `NEXT_PUBLIC_APP_URL` y (para el logo) `SLACK_ICON_URL`. El código se comporta igual: sin `SLACK_ICON_URL` muestra 🟡.

## Inventario de notificaciones

**8 call sites**, **5 `kind`s**, agrupados en **2 formatos**:

### A) Solicitudes NUEVAS → `@channel` + formato simplificado
Función `newRequestPayload`: header "🔔 Nueva solicitud" + `<!channel>` + 2 campos
*Empleado* / *Pide* + botón "Ver detalle". **Sin** motivo largo (el admin lo ve en el panel).

| # | Tipo (`kind`) | Disparador | Archivo | @channel | Logo | `adminUrl` |
|---|---------------|------------|---------|:---:|:---:|------------|
| 1 | `credits_request` (3DSky) | "pedir créditos" en 3DSky | `tools/3dsky/request-credits/route.ts:72` | ✅ | 🟡 | ⚠️ `/admin#requests` |
| 2 | `credits_request` (Kling) | "pedir créditos" en Kling | `tools/kling/request-credits/route.ts:75` | ✅ | 🟡 | ✅ `/admin/requests` |
| 3 | `access_request` | pedir acceso a una tool | `me/access-request/route.ts:136` | ✅ | 🟡 | ✅ `/admin/requests` |
| 4 | `exceptional_request` | pedir acceso excepcional | `me/exceptional-access/route.ts:76` | ✅ | 🟡 | ✅ `/admin/requests` |

Texto fallback (push): `<!channel> 🔔 Nueva solicitud — {nombre} pide {pide}`
donde `{pide}` = `"{N} créditos para {tool}"` / `"acceso a {tool}"` / `"acceso excepcional ({dur}) a {tool}"`.

### B) RESOLUCIONES → informativas, **sin** `@channel`
Header con emoji + campos. **No** pingean al canal (correcto).

| # | Tipo (`kind`) | Disparador | Archivo | @channel | Campos |
|---|---------------|------------|---------|:---:|--------|
| 5 | `access_approved` / `access_rejected` | admin resuelve acceso | `admin/requests/[id]/approve:262` · `reject:95` | ❌ | Empleado · Herramienta · Resuelto por · Nota? · **ID solicitud (UUID)** |
| 6 | `credits_approved` / `credits_rejected` | admin resuelve créditos | `approve:271` · `reject:104` | ❌ | Empleado · Herramienta · Créditos? · Nota? · **ID solicitud (UUID)** |

Todas usan **Slack Blocks** (header + section + actions), no solo `text`.

## Comparación con el pedido de Chule

| Pedido de Chule | Veredicto | Detalle |
|-----------------|:---------:|---------|
| **Logo NQS visible** | ⚠️ **Parcial** | Existe el mecanismo (`icon_url`), pero `SLACK_ICON_URL` está vacía → hoy se ve el emoji 🟡. Falta **subir el logo a una URL pública y setear la env** (no requiere código). |
| **@channel en solicitudes nuevas** | ✅ **OK** | Las **4** solicitudes nuevas (créditos 3DSky, créditos Kling, acceso, excepcional) llevan `<!channel>`. Las resoluciones no (correcto). |
| **Formato simplificado (EMPLEADO + QUE PIDE)** | ✅ **OK** | Las solicitudes nuevas son header + *Empleado* / *Pide*, sin motivo largo. Detalle: las **resoluciones** todavía muestran el `ID solicitud` (UUID) — fuera del pedido (era sobre las solicitudes), pero es un campo "extra". |

## Diferencias detectadas

### D1 — Logo NQS no visible (config, no código) · **la más relevante**
`SLACK_ICON_URL` vacía → `slackIdentity()` cae al emoji 🟡.
- **Dónde**: `slack.ts:86-88` (lógica) · `.env.local:21` (env vacía).
- **Cierre**: subir el logo NQS a una URL pública (PNG cuadrado) y setear `SLACK_ICON_URL` en **local y Vercel**. **Cero código.**

### D2 — Link "Ver detalle" de créditos 3DSky apunta mal · **ahora inconsistente**
3DSky arma `adminUrl = {APP_URL}/admin#requests`, pero la página real es `/admin/requests`. `/admin#requests` cae en la overview con un ancla inexistente.
- **Dónde**: `tools/3dsky/request-credits/route.ts:71`.
- **Inconsistencia**: Kling, acceso y excepcional ya usan `/admin/requests` (correcto). 3DSky quedó como **el único** con el link viejo.
- **Cierre**: cambiar `/admin#requests` → `/admin/requests` (1 línea) + actualizar el test `slack.test.ts:92` si se quiere consistencia.

### D3 — Resoluciones muestran el UUID de la solicitud (opcional)
`access_*` y `credits_*` incluyen `*ID solicitud*\n\`uuid\``.
- **Dónde**: `slack.ts:267` y `slack.ts:296`.
- Chule pidió simplificar las **solicitudes**, no las resoluciones. Es un "extra", no un incumplimiento.

### D4 — Wording del header de créditos (cosmético)
Header de créditos = "Solicitud **aprobó** / **rechazó**" (verbo) en vez de "aprobada / rechazada". El de acceso sí usa el adjetivo ("Acceso aprobado/rechazado").
- **Dónde**: `slack.ts:299` y `:305`. Puramente estético.

## Recomendaciones (prompts cortos para cerrar gaps)

1. **Logo (D1)** — *config, no código*: subir `nqs-logo.png` (cuadrado, ~512px) a una URL pública, setear `SLACK_ICON_URL` en Vercel + `.env.local`, probar 1 solicitud. *Caveat*: algunos workspaces ignoran el override de `username`/`icon_url` de los Incoming Webhooks; si tras setear la env sigue el ícono default, hay que permitir customización en la app de Slack (config de Slack, no del repo).
2. **Link 3DSky (D2)** — prompt mínimo: cambiar `/admin#requests` → `/admin/requests` en `tools/3dsky/request-credits/route.ts:71` (1 línea + test).
3. **(Opcional) D3/D4** — solo si Chule lo pide: sacar el `ID solicitud` de las 2 resoluciones y unificar el header de créditos a "aprobada/rechazada".

> Cerrar **D1 (config) + D2 (1 línea)** deja todo alineado. Lo demás ya cumple lo que pidió Chule.

## Verificación contra el Slack real (no se hizo)
No tengo acceso al canal de Slack del estudio desde acá, así que el reporte se basa en lo que dice el **código**. Test manual sugerido:
1. Pedir créditos a **3DSky** → en el canal: llega, avatar 🟡 (hasta setear `SLACK_ICON_URL`), empieza con `@channel`, formato *Empleado* + *Pide*, botón "Ver detalle" → hoy abre `/admin#requests` (**D2**).
2. Pedir créditos a **Kling** → igual, pero el botón sí abre `/admin/requests`.
3. Pedir **acceso** / **acceso excepcional** → mismo formato, link correcto.
4. **Admin aprueba/rechaza** → llega la resolución **sin** `@channel`, con el nombre del admin.

## Conclusión
- **@channel**: ✅ cerrado (incluye Kling).
- **Formato simplificado**: ✅ cerrado.
- **Logo NQS**: ⚠️ falta **config** (`SLACK_ICON_URL`), no código.
- **Bonus**: D2 (link 3DSky) quedó como único inconsistente al sumar Kling; D3/D4 cosméticos.

Próximo paso: decidir si hace falta un prompt corto para cerrar **D1** (config) + **D2** (1 línea).
