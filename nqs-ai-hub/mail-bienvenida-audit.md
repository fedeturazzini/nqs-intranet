# Auditoría: mail de bienvenida no llega (Resend)

**Fecha:** 2026-06-30
**Estado:** read-only — solo diagnóstico, sin cambios de código.

---

## 1. El helper de email

**Archivo:** `nqs-ai-hub/src/lib/notifications/email.ts`

### Nombre de la variable

```ts
// línea 16
const RESEND_API_KEY = process.env.RESEND_API_KEY;
```

El código lee exactamente `RESEND_API_KEY`. Si en Vercel la variable se cargó con ese nombre exacto, el nombre **no es el problema**.

### Guard si la key no está

```ts
// línea 30-34
if (!resend) {
  console.log(
    JSON.stringify({ level: "info", msg: "[EMAIL SKIPPED]", to, subject }),
  );
  return; // ← sale silencioso, no llama a Resend
}
```

Si `RESEND_API_KEY` no está en el entorno en tiempo de ejecución, `resend` es `null`, el log dice `[EMAIL SKIPPED]` y retorna. **No aparece nada en Resend** en ese caso — consistente exactamente con lo reportado ("no aparece en los logs de Resend ni como Delivered ni como Failed").

### El `FROM_EMAIL` — **PROBLEMA CRÍTICO**

```ts
// línea 17
const FROM_EMAIL = "NQS AI Hub <noreply@nqs.com.ar>";
```

**El dominio del remitente es `@nqs.com.ar`, no `@nqscreative.com`.**

Esto importa en dos escenarios:

**Escenario A — Si el dominio verificado en Resend es `nqscreative.com`:** Resend rechazará el envío porque el `from` usa un dominio diferente al verificado. El error sería registrado en el `catch` de `sendEmail` (aparecería en los logs de Vercel como `[EMAIL ERROR]`) pero **no en los logs de Resend**, porque la request nunca llegaría a procesar el envío o sería rechazada por Resend antes de intentar la entrega.

**Escenario B — Si `RESEND_API_KEY` es `null` en runtime:** el código ni siquiera llega al `from`, hace `[EMAIL SKIPPED]` y retorna. En ese caso el dominio del `from` es irrelevante hasta que la key exista.

**El dominio `@nqs.com.ar` es el sospechoso secundario** — una vez que la key esté bien leída, el `from` puede ser la siguiente barrera.

---

## 2. La llamada desde el endpoint de crear usuario

**Archivo:** `nqs-ai-hub/src/app/api/admin/users/route.ts`, líneas 195–201

```ts
const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
void sendWelcomeEmail({
  to: email.trim().toLowerCase(),
  userName: name,
  temporaryPassword: password,
  hubUrl: appUrl,
}).catch((e) => console.error("welcome email failed", e));

return NextResponse.json({ user: profile });
```

**Es fire-and-forget**: `void` + `.catch(console.error)`. La respuesta al cliente sale inmediatamente en la línea siguiente, sin esperar el email.

El `.catch` **loguea el error** si la promise rechaza, pero:
- El guard interno de `sendEmail` (el `if (!resend)`) no rechaza — retorna normalmente. Por eso `.catch` nunca se dispara cuando la key está ausente.
- Si hay un error de Resend (dominio no verificado, key inválida), ese error se captura **dentro** de `sendEmail` en su propio `try/catch` (líneas 46–53), se loguea como `[EMAIL ERROR]` y **no propaga** al `.catch` externo del endpoint. La promise de `sendWelcomeEmail` siempre resuelve con `void`.

**En resumen:** no hay ninguna condición, flag ni feature toggle antes de la llamada. El código siempre llega a `void sendWelcomeEmail(...)` si el usuario se creó exitosamente. Los parámetros que pasa son correctos: `to` = email del nuevo user, `userName` = name, `temporaryPassword` = password, `hubUrl` = `NEXT_PUBLIC_APP_URL`.

---

## 3. ¿Se ejecuta el envío?

### Traza del flujo cuando la key SÍ está en Vercel:

```
POST /api/admin/users
  → requireAdminApi()           ✓
  → NewUserSchema.safeParse()   ✓
  → auth.admin.createUser()     ✓
  → insert public.users         ✓
  → insert tool_access 3DSky    ✓ (best-effort)
  → void sendWelcomeEmail(...)  ← se ejecuta SIEMPRE en el path feliz
      → sendEmail({ to, subject, html })
          → if (!resend) → [EMAIL SKIPPED] return  ← SOLO si key es null
          → Promise.race([resend.emails.send(...), timeout 8s])
              → si falla: catch → [EMAIL ERROR] en logs Vercel, no propaga
  → NextResponse.json({ user })
```

La llamada a `sendWelcomeEmail` **sí se ejecuta** si el usuario se creó bien. Lo que determina si llega a Resend es únicamente si `resend` es `null` o no.

### Logs disponibles para diagnóstico en Vercel

| Mensaje en logs | Significado |
|---|---|
| `{"level":"info","msg":"[EMAIL SKIPPED]",...}` | `RESEND_API_KEY` no estaba disponible en runtime — la key no se leyó |
| `{"level":"error","msg":"[EMAIL ERROR]","error":"..."}` | La key existe, se intentó enviar, Resend rechazó (dominio, key inválida, etc.) |
| `welcome email failed ...` | La promise rechazó (no debería pasar con la implementación actual, pero está ahí de guardia) |
| *(ninguno de los anteriores)* | La función se ejecutó y aparentemente mandó el mail — revisar en Resend dashboard |

---

## 4. Verificación cruzada

### Nombre de la env var

| En el código | En Vercel (según contexto) | ¿Coincide? |
|---|---|---|
| `RESEND_API_KEY` | `RESEND_API_KEY` | **Sí** (asumiendo que así se cargó) |

Si el mail no aparece en Resend **en absoluto** (ni como intento fallido), la causa más probable es que la key llega como `null` en runtime. Esto puede pasar aunque esté cargada en Vercel si:

1. El deploy fue creado **antes** de cargar la variable y **no se hizo redeploy** posterior (Vercel necesita un nuevo deploy para que las env vars entren en las lambdas).
2. La variable se cargó en el scope incorrecto (ej. solo "Preview" pero no "Production", o solo "Development").
3. `NEXT_PUBLIC_APP_URL` no es el problema, pero notar que ese valor sigue siendo `http://localhost:3000` en `.env.local` — en producción el valor correcto debe estar en Vercel.

### El `FROM_EMAIL`

```ts
const FROM_EMAIL = "NQS AI Hub <noreply@nqs.com.ar>";
```

**`@nqs.com.ar` es el dominio hardcodeado.** Si en el dashboard de Resend el dominio verificado es `nqscreative.com` (y no `nqs.com.ar`), Resend **rechazará el envío** con un error de "sender domain not verified" o similar. Ese error sí aparecería en los logs de Vercel como `[EMAIL ERROR]`, pero **no en los logs de Resend** (Resend no registra envíos rechazados por dominio no verificado de la misma forma que los entregados o fallidos).

---

## 5. Veredicto

### Causa más probable (en orden de probabilidad)

**1ª — `RESEND_API_KEY` llega como `null` en runtime (más probable)**

Evidencia: el mail no aparece en los logs de Resend en absoluto — ni como Delivered ni como Failed. Eso es exactamente lo que produce el path `[EMAIL SKIPPED]`: la key no existe, `resend` es `null`, se retorna sin hacer ninguna llamada HTTP a Resend. Para confirmar: ir a los **logs de Vercel** del deploy de producción y buscar `EMAIL SKIPPED`. Si aparece, la key no está disponible en runtime.

Causas posibles dentro de esto:
- El redeploy no se completó correctamente o se hizo sobre un deploy viejo.
- La variable se cargó en el scope "Preview" pero no en "Production" (o viceversa).
- La variable existe pero con un nombre distinto (`RESEND_KEY`, `RESEND_API`, etc.).

**2ª — `FROM_EMAIL` usa dominio no verificado en Resend (`@nqs.com.ar`)**

Si la key SÍ llega y el mail tampoco aparece en Resend (o aparece como error), la causa es que `noreply@nqs.com.ar` no está en el dominio verificado de la cuenta Resend. En ese caso los logs de Vercel mostrarían `[EMAIL ERROR]` con el mensaje de Resend.

### ¿Es código o config?

- **El código está completo y correcto en lógica.** La llamada se ejecuta, tiene fire-and-forget bien implementado, tiene timeout de 8s, loguea errores.
- **El problema es de entorno/config:**
  - **Primario:** verificar en Vercel que la key esté disponible en runtime (revisar logs para `EMAIL SKIPPED`).
  - **Secundario (a corregir en código):** el `FROM_EMAIL` hardcodeado en `@nqs.com.ar` tiene que coincidir con el dominio verificado en Resend — si el dominio verificado es `nqscreative.com`, hay que cambiarlo.

### Archivos y líneas exactas a tocar para el fix

| # | Archivo | Línea | Qué cambiar |
|---|---|---|---|
| 1 | `nqs-ai-hub/src/lib/notifications/email.ts` | 17 | `FROM_EMAIL`: cambiar `noreply@nqs.com.ar` por la dirección del dominio verificado en Resend (ej. `noreply@nqscreative.com` si ese es el dominio verificado). |

Config fuera del repo (Vercel dashboard):
- Confirmar que `RESEND_API_KEY` esté en **Production** + **Preview** + que el último deploy posterior a cargarla haya sido exitoso.
- Revisar logs de Vercel del endpoint `POST /api/admin/users` buscando `EMAIL SKIPPED` o `EMAIL ERROR`.
