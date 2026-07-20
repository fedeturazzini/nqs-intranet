# Auditoría — Slack intermitente en pedidos de acceso a Claude

**Fecha**: 2026-07-20
**Branch**: `develop`
**Alcance**: **solo lectura / diagnóstico**. No se modificó código. Único archivo nuevo: este.
**Contexto previo**: `slack-audit.md` (logo/formato) + fix `after()` ya aplicado (commit `08971ea`,
comentado en `access-request/route.ts:136-150`).

---

## ⚠️ UPDATE tras verificación empírica (2026-07-20) — leer primero

Se corrió la query del audit contra la **DB real** (service_role, solo lectura). **La hipótesis
principal de abajo (§1, filas `pending` fantasma) NO se sostiene con los datos de hoy:**

- **0 filas `access` en estado `pending`** (Claude ni ninguna tool). No hay nada trabado *ahora*.
- **8 `access_requests` en total, todas resueltas** (6 approved / 2 rejected). Claude: 3 (2 aprobadas
  en ~1 min, 1 test rechazada). Tutoriales: 5.
- El fix `after()` (`08971ea`) **ya está en `main`**. Santiago pidió Claude **hoy** y lo aprobaron en
  1 min → el aviso salió.

**Reinterpretación**: los "no llegó" fueron **históricos** (ventana del bug del `void`); esas filas ya
se resolvieron desde `/admin/requests` (por eso hoy hay 0 pending). El candidato *vivo* más consistente
con los datos sería **`already_has_access`** (5 users con Claude `active`), pero es difícil de gatillar
por UI (una tool activa muestra "abrir", no "solicitar"). **Mitad B (remediar) no tiene nada que
remediar.**

**Decisión (acordada con el usuario): observabilidad primero.** En vez de la re-emisión con throttle
(fase 2), se instrumenta para *medir en prod* si el corte silencioso ocurre de verdad:
`access_requests.notified_at` (migración `0015`) + logs estructurados en los dos cortes
(`already_pending` / `already_has_access`) y en el resultado del envío. **Sin cambio de comportamiento
del guard.** Si los logs de prod muestran cortes reales, se activa la re-emisión (§7).

---

## TL;DR — Veredicto

El aviso a Slack **no falla al azar ni por webhook**. Falla de forma **determinística** según el
**historial del usuario para esa tool**: el endpoint tiene **3 guards que cortan ANTES del
`after()`/notify**, y para **Claude** casi siempre se cumple uno de ellos.

**Causa raíz #1 (la que calza con el patrón)** — el guard **`already_pending`**
(`route.ts:93-110`): si el user ya tiene una solicitud `access` **pendiente** para esa tool, el
endpoint **corta sin notificar**. Claude es la tool que todos piden primero y la que arrastra
**filas `pending` viejas** creadas durante la ventana del bug del `void` (cuando Vercel congelaba la
función y el aviso nunca salía — pero **la fila igual se guardaba**). Resultado: el user ya tiene una
`pending` de Claude → **cualquier re-pedido de Claude choca contra el guard y no dispara aviso nuevo**.
Tutoriales es una tool **nueva**, sin `pending` arrastradas → el primer pedido pasa limpio → **sí avisa**.

**Matiz importante sobre "responde ok"**: el endpoint **NO devuelve `ok` en los paths bloqueados** —
devuelve **HTTP 400** (`already_pending` / `already_has_access`). El falso positivo **no** es un check
verde: es que el user ve un mensaje **tranquilizador** ("Ya tenés una solicitud pendiente", en color
warn) que **le confirma que su pedido está en curso**, mientras el admin **nunca** recibió ni recibirá
el ping de Slack para esa fila. La percepción "pedí y no pasó nada" es real; el HTTP literal no es `ok`.

**Lo que hay que tocar**: que el path `already_pending` **re-emita el aviso** (best-effort, con el
`requestId` existente, sin crear fila duplicada), y/o reparar las `pending` viejas. Detalle en §7.

---

## Mapa completo del endpoint — todos los early-return

`src/app/api/me/access-request/route.ts`. Orden real de ejecución y, por cada return, si **notifica**
y **qué ve el user**:

| # | Línea | Condición | HTTP | ¿Notifica Slack? | ¿Qué percibe el user? |
|---|-------|-----------|:----:|:----------------:|-----------------------|
| 1 | 33 | sin sesión | 401 | ❌ | error (no aplica al patrón) |
| 2 | 41 / 45 | body/reason inválido | 400 | ❌ | error de validación |
| 3 | 61 | falló query de tool | 500 | ❌ | error |
| 4 | 67 | `tool_not_found` | 404 | ❌ | error |
| 5 | 69-77 | `tool_coming_soon` (`is_active=false`) | 400 | ❌ | "aún no está disponible" |
| 6 | **79-91** | **`already_has_access`** (tiene `tool_access.status='active'`) | **400** | **❌** | error rojo "Ya tenés acceso" |
| 7 | **93-110** | **`already_pending`** (ya hay request `access` `pending`) | **400** | **❌** | warn "Ya tenés una solicitud pendiente" |
| 8 | 112-129 | falló el INSERT | 500 | ❌ | error |
| ✅ | **141-152** | **camino feliz**: INSERT ok → `after(notifySlack)` → `{ok:true}` | 200 | **✅** | verde "SOLICITUD ENVIADA" |

**El aviso solo sale en la fila ✅.** Las filas **6** y **7** son las únicas que un user "normal"
(con sesión, tool válida y activa, motivo ok) puede pegar y aun así **no generar aviso**. Son el
corazón del problema.

---

## 1) Guard de duplicados — `already_pending` (sospecha principal, CONFIRMADA)

**Lógica exacta** (`route.ts:93-110`):

```ts
// 3) no hay request 'access' pendiente para este (user, tool)
const { data: pending } = await db
  .from("access_requests")
  .select("id")
  .eq("user_id", session.userId)
  .eq("tool_id", toolId)
  .eq("request_type", "access")
  .eq("status", "pending")
  .maybeSingle();
if (pending) {
  return NextResponse.json(
    { error: "already_pending", message: "Ya tenés una solicitud pendiente..." },
    { status: 400 },
  );   // ← CORTA ACÁ. El after()/notify está más abajo (line 141). Nunca se ejecuta.
}
```

- **¿Qué devuelve?** HTTP **400** con `error: "already_pending"`. **No** es un 200 "silencioso".
- **¿Notifica?** **No.** El `return` está en la línea 108; el `after(notifySlack)` recién aparece en
  la 141. El corte es **antes** del notify. **Cero aviso a Slack.**
- **Por qué calza con el patrón**: Claude es la tool base que todos prueban primero → es la que más
  se **repite** y la que más filas `pending` arrastra. Un user que ya tiene una `pending` de Claude y
  vuelve a pedir → **no llega aviso nuevo**. Exactamente lo observado.

---

## 2) ¿Ya tiene acceso? — `already_has_access` (posible, secundario)

**Lógica** (`route.ts:79-91`):

```ts
const { data: access } = await db.from("tool_access")
  .select("status").eq("user_id", session.userId).eq("tool_id", toolId).maybeSingle();
if (access?.status === "active") {
  return NextResponse.json({ error: "already_has_access", ... }, { status: 400 }); // sin notify
}
```

- Si el user **ya tiene `tool_access` activo** para esa tool → **400, sin aviso**.
- **Refutación parcial de la hipótesis del brief**: al crear un usuario **NO** se le da Claude por
  default. El único acceso default es **3DSky**, y se hace en código
  (`admin/users/route.ts:169-179`, `tool_id: "3dsky"`). No hay ningún seed/migración que otorgue
  Claude en masa (el único `INSERT INTO tool_access` de los seeds es el retro-grant de **Tutoriales**,
  y está **comentado**). ⇒ `already_has_access` para Claude **solo** ocurre si un admin **aprobó**
  Claude antes y el acceso sigue `active`.
- Por eso este guard es **secundario**: explica casos puntuales (user con Claude ya aprobado que
  vuelve a pedir), no el grueso del patrón. El grueso es §1.

**Detalle de robustez (menor)**: ambos guards usan `.maybeSingle()` e **ignoran el error** de la
query. Como `access_requests` **no tiene UNIQUE** por `(user, tool, type)` (ver §3), si existieran
**dos** filas `pending` para el mismo par, `.maybeSingle()` devuelve error → `data=null` → el guard
**no corta** y termina notificando (y creando otra `pending`). O sea: el guard bloquea de forma fiable
solo cuando hay **exactamente una** `pending`. No cambia el veredicto, pero conviene saberlo.

---

## 3) Estados de la solicitud — cuál traba y cuál no

`access_requests.status` es un enum `request_status = ('pending','approved','rejected','expired')`
(`apply-remote.sql:220`), default `'pending'`. El guard filtra **`.eq("status","pending")`**, así que:

| Estado de la fila vieja (user+claude) | ¿Cuenta como "pendiente"? | ¿Bloquea el nuevo pedido? | ¿Notifica al re-pedir? |
|---|:---:|:---:|:---:|
| `pending` | ✅ sí | ✅ **sí** | ❌ **no** ← el caso trabado |
| `approved` | ❌ no | ❌ no* | ✅ sí* |
| `rejected` | ❌ no | ❌ no | ✅ **sí** (se puede volver a pedir) |
| `expired` | ❌ no | ❌ no | ✅ sí |

\* Ojo: si fue `approved` y el `tool_access` quedó **`active`**, entonces corta el **otro** guard
(`already_has_access`, §2) y tampoco notifica. Si el acceso venció (`tool_access.status='expired'`/
`'locked'`), ninguno de los dos guards corta → el re-pedido **sí** notifica.

**Conclusión del punto**: una solicitud **rechazada NO deja trabado** (permite volver a pedir y avisa).
El **único** estado que silencia el aviso de forma permanente es **`pending`**. Y no hay proceso que
limpie `pending` viejas automáticamente → una `pending` histórica queda ahí para siempre bloqueando
el aviso, hasta que el admin la resuelva en `/admin/requests` o se borre a mano.

---

## 4) Diferencia real Claude vs Tutoriales

**El notify es idéntico** para ambas: `notifySlack({ kind: "access_request", toolName: tool.name, ... })`
y la rama `access_request` de `slack.ts:246` **no** ramifica por tool. ⇒ La diferencia **no** está en
el aviso; está **aguas arriba**, en si un guard corta. Descartado que Claude "se formatee distinto".

Diferencias que **sí** existen y explican el patrón:

1. **Historial de uso**: Claude es la tool base ("arrancá cualquier proyecto", seed `apply-remote.sql:53`,
   `is_active=TRUE`). Todos la piden **primero y varias veces** → alta probabilidad de tener una fila
   `pending` (o un acceso `active`) previa → guard corta. Tutoriales es **nueva y de nicho** → historial
   limpio → el primer pedido pasa.
2. **Ventana del bug `void`**: antes del fix `after()`, cada pedido de Claude devolvía `ok`, **creaba la
   fila `pending`** y **perdía el aviso** (Vercel congelaba la función). Esas `pending` **siguen ahí**.
   Hoy el user re-pide Claude → `already_pending` → sigue sin avisar. Tutoriales llegó **después** del
   fix → no acumuló `pending` fantasma.
3. **NO es el default de creación**: ni Claude ni Tutoriales se otorgan al alta (solo 3DSky). Y el
   retro-grant de Tutoriales a todos está **comentado** (`apply-remote-tutoriales-tool.sql:28-38`,
   "NO ejecutar salvo que Chule lo pida"). Que el pedido de Tutoriales de B **haya llegado** confirma
   que B **no** tenía Tutoriales `active` → coherente: la diferencia es historial, no permisos default.
4. **`coming_soon` descartado**: Claude es `is_active=TRUE`. Además, que el pedido de Claude de A **sí**
   llegara prueba que Claude no es coming_soon (si no, tampoco llegaría el de A).

---

## 5) El path que no notifica y qué percibe el user (¿falso positivo?)

Recorriendo los early-return "alcanzables por un user normal":

- **`already_pending` (#7)** — `RequestAccessModal.tsx:110-118`: en 400 con `already_pending` hace
  `setAlreadyPending(true)` + muestra el `message` en **color warn** ("↳ Ya tenés una solicitud
  pendiente...") y **NO** dispara el toast verde "SOLICITUD ENVIADA". → El user **no** ve un `ok`
  literal, pero ve un mensaje que **suena a "ya está en trámite"**. **Esa es la trampa**: lo
  tranquiliza, mientras el admin **jamás fue pingeado** por esa fila. Percepción neta: "yo lo pedí" /
  admin: "a mí no me llegó nada". ← **el falso positivo real, matizado**.
  - En `TutorialesGate.tsx:52-60` el mismo `already_pending` muestra un toast warn "YA PEDISTE ACCESO"
    (mismo efecto tranquilizador).
- **`already_has_access` (#6)** — `RequestAccessModal.tsx` lo muestra en **rojo/danger**. Acá el user
  sí percibe "algo raro", pero igual **el admin no recibió aviso**.
- Resto (#1-5, #8) — errores explícitos; el user ve que falló, no aplica al síntoma "pedí y no pasó nada".

**Respuesta directa al brief**: el endpoint **no** responde `ok` (200) en los paths que silencian el
aviso — responde **400**. Pero el efecto que reportaste ("respondió ok pero no notificó") es **real en
la práctica**: (a) **históricamente**, el bug del `void` sí devolvía `ok` + creaba la `pending` + perdía
el aviso, y (b) **hoy**, el re-pedido devuelve un 400 "blando" (warn) que el user lee como confirmación,
sin que el admin se entere. El único `ok` verdadero (200) **siempre** dispara el `after()`.

---

## 6) ¿Es el guard o falla el `after()` en sí?

**Es el guard, no el `after()`.** Argumento decisivo: el **mismo user B**, en el **mismo entorno**,
al pedir **Tutoriales sí** recibe aviso y al pedir **Claude no**. Si el `after()` fallara de forma
intermitente (cold start, timeout, entorno), fallaría **al azar y para ambas tools** — no
selectivamente por tool y por historial. El patrón es **determinístico** (Claude sí/no según DB),
que es la firma de un branch de código (guard), no de una condición de carrera del runtime.

**Riesgo residual del `after()` que igual conviene anotar**: `notifySlack` tiene timeout de 5s y es
best-effort (`slack.ts`, resiliencia). Si el **primer** pedido legítimo pierde el aviso por un fallo
transitorio de Slack (5xx/timeout/red), **la fila `pending` queda igual** → todos los reintentos
chocan con `already_pending` → **el guard convierte una pérdida transitoria del aviso en una pérdida
permanente**. Es el mismo mecanismo del §1, disparable incluso post-fix. Este es el verdadero hueco de
diseño a cerrar.

---

## 7) Cómo verificarlo y qué tocar para el fix

### Verificación (1 query, confirma o descarta en 10 segundos)
Para el user B afectado y `tool_id='claude'`:

```sql
SELECT id, status, created_at
FROM access_requests
WHERE user_id = '<UUID de B>' AND tool_id = 'claude' AND request_type = 'access'
ORDER BY created_at DESC;
```
- Si aparece una fila **`pending`** → **hipótesis §1 confirmada** (el guard la está bloqueando).
- Si no hay `pending` pero el user tiene `tool_access` `active` de Claude → es §2.
- Bonus: `/admin/requests` **ya lista** esas `pending`. Es decir, **no están perdidas**: al admin
  "no le llegó a Slack", pero puede verlas en el panel. Vale confirmarlo ahí también.

### Fix recomendado (para la próxima sesión; acá NO se toca nada)
Orden de preferencia:

1. **Re-emitir el aviso en `already_pending`** (`route.ts:93-110`): en vez de cortar seco, si ya hay
   una `pending`, **no** crear fila nueva pero **sí** disparar `after(notifySlack(... requestId
   existente ...))` y responder `{ ok: true, alreadyPending: true }`. Así el admin **se entera igual**.
   - Para no spamear si el user martilla el botón: throttle simple con una columna `notified_at` en
     `access_requests` (re-notificar solo si `now - notified_at > N min`, o si `notified_at IS NULL`).
2. **Marcar el envío**: agregar `notified_at` y setearlo en el camino feliz; el re-pedido re-notifica
   solo si nunca se notificó. Cierra el §6 (pérdida transitoria → permanente).
3. **Reparación puntual (una vez)**: para las `pending` de Claude arrastradas del bug `void`, o bien
   re-enviar sus avisos, o simplemente confiar en `/admin/requests` (ya las muestra) y que el admin las
   resuelva. No requiere código si el admin las procesa desde el panel.
4. **UX honesta**: si se mantiene el corte, cambiar el copy de `already_pending` para que **no**
   tranquilice de más ("tu pedido anterior sigue pendiente; el admin ya fue avisado / avisá al admin").

**Recomendación mínima**: **(1)** resuelve el síntoma de raíz con poco código y sin migración; **(2)**
lo blinda contra fallos transitorios de Slack. **(3)** limpia lo heredado.

---

## Caveats

- **No ejecuté SQL ni miré la DB real** — el veredicto sale del **código**. La query del §7 lo confirma
  empíricamente. Fuerte sospecha, pendiente de ese chequeo.
- No verifiqué contra el canal de Slack real (sin acceso desde acá).
- El archivo `slack-notif-audit.md` que menciona el comentario de `route.ts:139` **no existe** en el
  repo (se ve `slack-audit.md`, que es la auditoría de logo/formato). El fix `after()` sí está aplicado
  y documentado en el propio comentario del endpoint (`route.ts:136-150`) y en el commit `08971ea`.
