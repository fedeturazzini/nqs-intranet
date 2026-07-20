# Auditoría: flujo "reset password" (¿olvidaste tu pass?)

**Fecha:** 2026-06-29
**Estado:** read-only — solo diagnóstico, sin cambios de código ni config.

---

## 0. Distinción clave: quién manda cada mail

Hay **dos mails distintos** en el sistema y se originan en lugares distintos:

| Mail | Quién lo manda | Remitente | Código relevante |
|---|---|---|---|
| Bienvenida (credenciales al crear usuario) | **App-level**, vía Resend | `NQS AI Hub <noreply@nqs.com.ar>` | `src/lib/notifications/email.ts` → `sendWelcomeEmail` |
| Reset de password (forgot-password) | **Auth-level**, nativo de Supabase | `noreply@mail.app.supabase.io` (default de Supabase) | `supabase.auth.resetPasswordForEmail(...)` en `ForgotPasswordScreen.tsx` |

**Confirmado:** el código del reset de password **no usa Resend en absoluto**. No hay ninguna referencia a `resend` ni a `sendEmail`/`sendWelcomeEmail` en `ForgotPasswordScreen.tsx` ni en `ResetPasswordScreen.tsx`. El mail de reset depende 100% de la configuración de Auth en el dashboard de Supabase (SMTP, rate limits, templates), que **no es visible desde el repo**.

Esto descarta de entrada cualquier hipótesis de "Resend rompió el reset" — son sistemas completamente separados.

---

## 1. Disparo del reset (cliente)

**Archivo:** `nqs-ai-hub/src/components/screens/ForgotPasswordScreen.tsx`

### Dónde se llama

Línea 50, dentro de `submit()`:

```ts
const supabase = createBrowserClient();
const { error } = await supabase.auth.resetPasswordForEmail(trimmed, {
  redirectTo: resetRedirectUrl(),
});
```

Usa el cliente **anon del browser** (`createBrowserClient`), correcto para esta operación pública.

### `redirectTo` exacto

Función `resetRedirectUrl()` (línea 24):

```ts
function resetRedirectUrl(): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ??
    (typeof window !== "undefined" ? window.location.origin : "");
  return `${base.replace(/\/$/, "")}/reset-password`;
}
```

Se arma dinámicamente: `${NEXT_PUBLIC_APP_URL}/reset-password`, con fallback a `window.location.origin` si la env var no existe.

**Valor actual en `.env.local` (repo):**
```
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Esto confirma el dato que mencionás: el link apuntaba a `localhost` porque la env var local tiene ese valor. **Esto es solo el `.env.local` del repo** (entorno de desarrollo) — no dice nada sobre el valor configurado en producción (Vercel), que es una variable de entorno separada, fuera del repo, y no se puede auditar desde acá.

**Importante:** este `redirectTo` tiene que estar en la **allowlist de Redirect URLs** de Supabase Auth (ver sección 4). Si la URL no matchea (por ejemplo, si el dashboard solo tiene `http://localhost:3000/**` permitido pero ahora se manda desde el dominio de prod, o viceversa), Supabase puede rechazar el link silenciosamente o el link generado puede no funcionar — esto se configura en el dashboard, no en el código.

### Manejo de loading / error / finally

```ts
setBusy(true);
try {
  ...
  if (error && error.status && error.status >= 500) {
    setErrorMsg("hubo un problema, probá de nuevo en un momento");
    setBusy(false);
    return;
  }
  setSent(true);
} catch {
  setErrorMsg("error de red, probá de nuevo");
} finally {
  setBusy(false);
}
```

**Esto está bien implementado:** hay `finally` que garantiza `setBusy(false)` siempre (a diferencia del flujo de creación de usuario, que sí tenía ese bug). No se cuelga.

### ¿Se traga el error?

**Sí, parcialmente — y es intencional, no un bug.** El código solo muestra error si `error.status >= 500`:

```ts
if (error && error.status && error.status >= 500) {
  setErrorMsg(...);
  ...
}
setSent(true); // ← se llega acá incluso si hubo error < 500
```

El comentario en el código lo explica: es una decisión de **no enumeration** (no revelar si un email existe o no en el sistema) — siempre se muestra el mismo mensaje de éxito ("si tiene cuenta, te mandamos un mail"), salvo error de servidor real (5xx).

**Esto es relevante para el diagnóstico:** si Supabase devuelve un error 4xx — por ejemplo, **429 Too Many Requests por rate limit agotado** — el código **lo trata como éxito silencioso** y muestra "revisá tu bandeja" igual, sin loggear nada visible para el usuario ni para vos como admin. Es decir: **si la causa es rate limit (4xx), el front no te va a avisar — vas a ver el mensaje de éxito normal y el mail nunca va a llegar.** Esto hace que la sospecha de rate limit sea más difícil de descartar desde la UI: hay que mirar la Network tab del browser o los logs de Supabase directamente.

---

## 2. Página que recibe el token de recovery

**Archivos:**
- `src/app/(auth)/reset-password/page.tsx` (wrapper de servidor)
- `src/components/screens/ResetPasswordScreen.tsx` (lógica)

**La página existe y está completa.** Matchea exactamente la ruta del `redirectTo` (`/reset-password`).

### Cómo procesa el token

No usa `getSessionFromUrl` explícito (función vieja de versiones anteriores del SDK). En su lugar:

1. El `createBrowserClient()` tiene `detectSessionInUrl` activado por default (comportamiento estándar de `@supabase/supabase-js` v2), que parsea automáticamente el hash `#access_token=...&type=recovery` al cargar la página.
2. Se escucha `onAuthStateChange` para el evento `PASSWORD_RECOVERY` (línea 43-47) → pasa a `phase: "ready"`.
3. Fallback: si no llega el evento, hace polling con `getSession()` y un timeout de 1.2s antes de marcar `phase: "invalid"` (líneas 50-67).
4. Al confirmar la nueva password, llama `supabase.auth.updateUser({ password })` (línea 91) — usa la sesión temporal de recovery.
5. Luego `signOut()` y redirige a `/login`.

**Diagnóstico: esta parte del código está completa y correctamente implementada.** No es la causa de que el mail no llegue (esto solo importa una vez que el mail ya llegó y se clickeó el link).

---

## 3. ¿Quién manda el mail? — confirmado

Ya cubierto en sección 0: **Supabase Auth nativo**, no hay ruta propia ni Resend involucrados en el envío del mail de reset. El único lugar donde se invoca algo relacionado a "password reset" con código propio es:

- `src/app/api/admin/users/[id]/reset-password/route.ts` — **esto es un flujo completamente distinto**: un admin fuerza un reset de password para otro usuario vía `auth.admin.updateUserById()`, genera la password nueva y la devuelve en la respuesta HTTP (no manda ningún mail, ni con Supabase ni con Resend). No tiene relación con el flujo de "¿olvidaste tu pass?" que el usuario disparó por sí mismo. Mencionado para descartarlo del diagnóstico, no para confundirlo con el flujo afectado.

---

## 4. Config a verificar en el dashboard de Supabase (fuera del repo)

Checklist para revisar manualmente — nada de esto es auditable desde el código:

- [ ] **Authentication → Rate Limits.** El email nativo de Supabase (sin SMTP propio) tiene un límite muy bajo (históricamente ~3-4 emails/hora en proyectos free/sin SMTP custom), pensado solo para testing. **Esta es la sospecha principal**: si se probó el flujo varias veces durante desarrollo, es muy probable que el límite ya esté agotado y Supabase esté devolviendo 429 en silencio (ver sección 1 — el front no lo muestra como error).
- [ ] **Authentication → SMTP Settings.** Verificar si hay un SMTP propio configurado (ej. Resend como proveedor SMTP, SendGrid, etc.) o si sigue en el default de Supabase. Para producción, **se recomienda configurar SMTP propio** — esto eliminaría el rate limit bajo del default y permitiría mandar desde un dominio propio en vez de `mail.app.supabase.io`.
- [ ] **Authentication → URL Configuration.** Confirmar:
  - **Site URL**: debería ser el dominio de producción real.
  - **Redirect URLs (allowlist)**: tiene que incluir exactamente el valor que arma `resetRedirectUrl()` en producción — es decir `https://<dominio-prod>/reset-password`. Si solo está `http://localhost:3000/**` en la allowlist (consistente con que "antes llegaba apuntando a localhost", sugiriendo que se probó solo en local), un link generado en producción podría no autenticarse igual aunque el mail sí llegue, o viceversa.
- [ ] **Authentication → Email Templates → Reset Password.** Confirmar que el template esté habilitado y no haya sido deshabilitado por error al tocar otro template (ej. el de confirmación de signup).
- [ ] **Logs de Auth (Supabase Dashboard → Logs → Auth Logs).** Filtrar por el email de prueba y ver si la request a `resetPasswordForEmail` llega y qué status devuelve — esto confirmaría o descartaría el rate limit directamente, sin tener que inferirlo.

---

## 5. Veredicto

### ¿El código está OK?

**Sí, el código del flujo de reset está completo y correcto:**
- El trigger (`ForgotPasswordScreen.tsx`) llama bien a `resetPasswordForEmail` con un `redirectTo` armado dinámicamente.
- Maneja loading con `finally` (no se cuelga).
- La página de destino (`/reset-password` + `ResetPasswordScreen.tsx`) existe, procesa el token de recovery correctamente vía `detectSessionInUrl` + `onAuthStateChange`, y permite setear la nueva password con `updateUser`.
- No hay ninguna dependencia rota con Resend — el reset nunca pasó por ahí.

**Único matiz de código (no bug, pero afecta el diagnóstico):** el manejo de errores en `ForgotPasswordScreen.tsx` solo muestra mensaje de error para 5xx; un 429 (rate limit) se trata como éxito silencioso en la UI. Esto no es la causa de que el mail no llegue, pero sí es la razón por la que **no vas a ver ningún error en pantalla** aunque la causa real sea el rate limit agotado.

### Causa más probable

**Sospecha principal: rate limit del email nativo de Supabase agotado.** El comentario en el propio código (`ForgotPasswordScreen.tsx` línea 16-17) dice explícitamente "el mail por ahora es el default de Supabase Auth" — confirma que nunca se configuró SMTP propio. El límite por default de Supabase es bajo y está pensado solo para testing; es consistente con "antes llegaba, ahora no" si se probó el flujo repetidamente durante el desarrollo.

Es **config de Supabase, no código.**

### Qué tocar de cada lado

**Código (nada urgente, ya funciona):**
- Opcional/mejora: en `ForgotPasswordScreen.tsx`, loggear o mostrar algún indicio cuando el error sea 429, para no enmascarar rate limits futuros detrás del mensaje de éxito genérico (a evaluar, fuera de este alcance read-only).

**Config de Supabase (acá está la causa más probable):**
1. Revisar **Auth Logs** para confirmar si las llamadas a `resetPasswordForEmail` están devolviendo 429.
2. Si es así, esperar a que se resetee la ventana de rate limit, o — la solución real para producción — **configurar SMTP propio** (Resend como SMTP, ya que el dominio `nqs.com.ar` ya se usa para el mail de bienvenida) en Authentication → SMTP Settings.
3. Confirmar **Site URL** y **Redirect URLs** apuntan al dominio de producción correcto, no solo a `localhost`.
4. Confirmar que el template de "Reset Password" sigue habilitado.
