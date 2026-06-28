# Auditoría: flujo "Crear usuario o admin"

**Fecha:** 2026-06-28  
**Estado:** read-only — solo diagnóstico, sin cambios de código.

---

## 1. Componente del modal

**Archivo:** `nqs-ai-hub/src/components/admin/NewUserModal.tsx`

### Campos y obligatoriedad

| Campo | Obligatorio | Criterio |
|---|---|---|
| Nombre completo | Sí | `name.trim().length >= 2` |
| Email | Sí | `email.includes("@")` |
| Iniciales | Sí | `initials.length >= 1` (se auto-calculan desde el nombre) |
| Departamento | No | select con opción "— sin asignar —" |
| Job Title | No (oculto) | campo deshabilitado visualmente |
| Rol | No | default `"employee"`, siempre tiene valor |
| Password inicial | Sí | `password.length >= 8` |

### Validación en cliente

Existe una variable `canSubmit` (línea 67) que deshabilita el botón "crear usuario →" si algún campo obligatorio no está completo:

```ts
const canSubmit =
  !submitting &&
  name.trim().length >= 2 &&
  email.includes("@") &&
  initials.length >= 1 &&
  password.length >= 8;
```

**Problema:** El botón queda `disabled` pero **no hay ningún indicador visual** de qué campo falta ni ningún mensaje que aparezca al intentar hacer click. El usuario solo ve el botón gris y silencio — sin label de error, sin borde rojo en los inputs, sin tooltip.

### Visualización de errores

Existe un estado `error: string | null` (línea 28) y se renderiza (líneas 269–276):

```tsx
{error && (
  <div className="t-meta" style={{ color: "var(--danger)", marginTop: 12 }}>
    ↳ {error}
  </div>
)}
```

Este estado **sí se muestra**, pero solo se puebla en dos casos:
1. Cuando el servidor responde con `res.ok === false` → `setError(data.message)`.
2. Cuando hay un error de red en el `catch` → `setError(err.message)`.

**No existe ninguna lógica** que setee `error` con mensajes de campo requerido en el cliente. Si `canSubmit` es `false`, el botón está disabled y no pasa nada más.

---

## 2. El submit / handler

**Función:** `handleSubmit` (línea 74).

```
setSubmitting(true)          ← loading ON
setError(null)
try {
  fetch(...)
  const data = await res.json()
  if (!res.ok || "error" in data) {
    setError(msg)
    setSubmitting(false)     ← loading OFF en error de API
    return
  }
  showToast(...)
  onCreated()                ← NO hay setSubmitting(false) aquí
} catch (err) {
  setError(...)
  setSubmitting(false)       ← loading OFF en error de red
}
```

### Problema crítico: `setSubmitting(false)` falta en el path de éxito y en `finally`

No hay `finally`. El reset del loading solo ocurre en dos ramas:
- Error de API (`!res.ok`): `setSubmitting(false)` en línea 97.
- Error de red (`catch`): `setSubmitting(false)` en línea 108.

En el **path de éxito** (líneas 100–105), se llama `onCreated()` sin resetear `submitting`. Si `onCreated` cierra el modal (`open → false`), el componente retorna `null` en línea 65 antes de que el estado se limpie, lo que no genera problema visible. **Pero** si la request se cuelga (timeout, Resend bloqueante, etc.) o si el servidor demora mucho y el modal sigue abierto, `submitting` queda en `true` para siempre.

El patrón correcto sería usar `finally` para garantizar el reset:

```ts
// Correcto (no implementado):
try { ... } catch { ... } finally { setSubmitting(false); }
```

### ¿Cuándo queda colgado en "CREANDO…"?

Si el servidor no responde (ni éxito ni error — por ejemplo, si la request queda en pending indefinido), el `await fetch(...)` nunca resuelve, no se ejecuta ninguna rama, y `submitting` queda en `true`. El botón dice "creando…" para siempre y no hay forma de resetear sin cerrar/reabrir el modal.

---

## 3. El endpoint de creación `/api/admin/users` (POST)

**Archivo:** `nqs-ai-hub/src/app/api/admin/users/route.ts`

### Pasos del endpoint

1. **Guard de admin:** `requireAdminApi()` — verifica sesión y rol.
2. **Parse del body:** `request.json()` → Zod `NewUserSchema.safeParse()`.
3. **Validación Zod** (server-side): email válido, name ≥2 chars, initials 1–4, role enum, password ≥8.
4. **Crear en `auth.users`:** `db.auth.admin.createUser(...)` con `email_confirm: true`.
5. **Insert en `public.users`** con el mismo UUID.
6. Si el insert falla: rollback con `db.auth.admin.deleteUser(auth.user.id)`.
7. **Insert default `tool_access`** para 3DSky Lun-Vie 9-18 (best-effort, no bloquea).
8. **`await sendWelcomeEmail(...)`** — bloqueante (ver sección 4).
9. Retorna `{ user: profile }`.

### Formato de errores

El endpoint devuelve errores con estructura consistente:

```json
{ "error": "bad_request", "message": "descripción" }
```

Códigos: `400` (bad_request), `422` (auth_create_failed), `500` (profile_insert_failed, db_error).

El cliente lee `data.message` y lo muestra en `setError(msg)`. **Funciona correctamente** si el servidor responde.

### Casos especiales

- **Email ya existe:** Supabase Auth devuelve error en `authErr`. El endpoint retorna `{ error: "auth_create_failed", message: authErr.message }` con status 422. El cliente lo muestra.
- **Password inválido (< 8 chars):** El schema Zod lo rechaza antes de llegar a Supabase, devuelve 400.

---

## 4. El envío de email con Resend

**Archivo helper:** `nqs-ai-hub/src/lib/notifications/email.ts`

### ¿Bloqueante o fire-and-forget?

```ts
// En route.ts línea 194:
await sendWelcomeEmail({ ... });
```

Es **`await` dentro del request handler** — completamente bloqueante. La respuesta al cliente no se envía hasta que `sendWelcomeEmail` termine.

### ¿Qué pasa si `RESEND_API_KEY` no está configurada?

En `email.ts` línea 19:
```ts
const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;
```

Si la key no existe, `resend` es `null`. En `sendEmail` (línea 30):
```ts
if (!resend) {
  console.log(JSON.stringify({ level: "info", msg: "[EMAIL SKIPPED]", to, subject }));
  return; // ← sale inmediatamente
}
```

**Sin la key: la llamada es instantánea, hace log y retorna.** No bloquea, no tira error.

### ¿Qué pasa si la key SÍ está pero Resend falla (timeout de red, etc.)?

```ts
try {
  await resend.emails.send(...);  // ← puede colgar indefinidamente
} catch (error) {
  console.error(...);
  // No rompe la operación principal.
}
```

Si `resend.emails.send` demora o nunca resuelve (problema de red con la API de Resend, timeout de la SDK), el `await` bloquea el request handler por el tiempo que Resend tarde. Si eso supera el timeout de la plataforma (Vercel default: 10s en free, 300s en configurado), la función lambda muere con timeout — el fetch del cliente recibe un error de red (`ERR_EMPTY_RESPONSE` o similar), cae al `catch` de `handleSubmit`, y **el botón se resetea**.

Sin embargo, si el timeout de Vercel es generoso y Resend simplemente "cuelga" durante minutos, la request no responde, el fetch del cliente queda en pending, y el botón muestra "creando…" indefinidamente.

### ¿La creación depende del email?

No. El usuario ya fue creado en `auth.users` + `public.users` + `tool_access` **antes** de llamar a `sendWelcomeEmail`. El `await` está al final (línea 194). Si falla el email, el usuario existe igual. Son operaciones independientes.

---

## 5. Resumen diagnóstico

### Causa del botón colgado en "CREANDO…"

**Causa principal: el request nunca responde.**

El flujo es: crear auth user → insert profile → insert tool_access → `await sendWelcomeEmail`. Si Resend está configurado y su SDK hace un `await` que nunca resuelve (por problema de red externo o timeout sin manejo), el handler de Next.js no retorna respuesta. El `fetch` del cliente queda en pending indefinido, ninguna rama de `handleSubmit` se ejecuta, `setSubmitting(false)` nunca se llama.

**Causa secundaria: no hay `finally`.**  
Si el request eventualmente fallara silenciosamente (sin lanzar excepción en el cliente), el path de éxito tampoco llama `setSubmitting(false)`. Aunque con la key ausente el email es no-op, si la key se configura en el futuro el riesgo reaparece.

**Con la key ausente (situación actual):** el email es instantáneo (no-op), por lo que el cuelgue no viene de Resend hoy. La causa probable del cuelgue actual sería algún problema intermitente de Supabase Auth (`createUser` lento) o de red, que deja el fetch en pending sin timeout definido en el cliente.

### Causa de la falta de feedback de validación

El botón queda `disabled` cuando `canSubmit === false`, pero **no hay ningún mecanismo** que informe al usuario qué campos faltan. No existe:
- Mensaje de error en el estado `error`.
- Bordes rojos en inputs inválidos.
- Tooltip o label explicativo.
- Intento de submit que dispare validación visual.

El usuario solo ve el botón gris sin explicación.

---

## 6. Archivos a tocar para el fix

| # | Archivo | Qué cambiar |
|---|---|---|
| 1 | `nqs-ai-hub/src/components/admin/NewUserModal.tsx` | Agregar `finally { setSubmitting(false) }` en `handleSubmit`. Agregar feedback visual de validación (mensajes por campo faltante o intento de submit con `canSubmit === false`). |
| 2 | `nqs-ai-hub/src/app/api/admin/users/route.ts` | Convertir `await sendWelcomeEmail(...)` a fire-and-forget con `void sendWelcomeEmail(...).catch(console.error)` para que no bloquee la respuesta al cliente. |
| 3 | `nqs-ai-hub/src/lib/notifications/email.ts` | (Opcional) Agregar timeout explícito a `resend.emails.send` para evitar cuelgues indefinidos cuando la key esté configurada. |
