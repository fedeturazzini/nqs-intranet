# Runbooks — NQS AI Hub

Qué hacer cuando algo se rompe. Pasos concretos, en orden.

---

## Claude no responde / da "no pudimos procesar tu pedido"

El error real se loguea en el server (Vercel → Logs, o consola en dev). Buscá `claude.execute failed`.

Causas comunes:

1. **`ANTHROPIC_API_KEY` inválida o vacía.** Síntoma en el log: `ANTHROPIC_API_KEY no está definida` o un 401 de Anthropic.
   - Verificá la key en Vercel → Settings → Env Vars.
   - Probá la key: `curl https://api.anthropic.com/v1/messages -H "x-api-key: $KEY" -H "anthropic-version: 2023-06-01" -H "content-type: application/json" -d '{"model":"claude-sonnet-4-6","max_tokens":10,"messages":[{"role":"user","content":"hi"}]}'`
   - Si rotó: actualizá la env en Vercel → redeploy.

2. **No hay system prompt activo.** Log: `no hay system prompt activo para Claude`.
   - `/admin/prompt` → tab System Prompt → activá una versión.

3. **Imagen inválida.** Log: `Could not process image` (de Anthropic).
   - Imágenes muy chicas (1×1) o corruptas. El user debe reintentar con otra imagen.

4. **Sobrecarga de Anthropic (529/503).** El SDK reintenta solo (maxRetries=3). Si persiste, es del lado de Anthropic — esperar.

---

## Los créditos de 3DSky se descontaron mal

1. `/admin/credits` → "historial" → revisá las transacciones del user.
2. Cada consumo es una row `consumption` con monto negativo y el motivo (`3DSky session …`).
3. Si un empleado declaró de más/menos, ajustá manualmente con los botones **+/−** en la tabla.
4. Para auditar entradas/salidas: `/admin/logs` → Module Sessions → filtrá por user.

> El descuento es atómico (RPC `consume_credit_atomic` con lock de fila), así que no hay doble-descuento por race condition. Si ves un saldo raro, es por una declaración del empleado, no un bug de concurrencia.

---

## Restaurar una versión anterior del prompt

1. `/admin/prompt` → tab correspondiente (System Prompt o Memoria).
2. Sidebar derecho (historial) → click en la versión que querés.
3. Se carga en read-only. **"activar esta versión"** → confirma → vuelve a estar en uso para todos.

No se pierde nada: todas las versiones quedan guardadas, solo cambia cuál está activa.

---

## Verificar que la API key de Anthropic está activa

```bash
curl -s https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{"model":"claude-sonnet-4-6","max_tokens":10,"messages":[{"role":"user","content":"ping"}]}'
```
- 200 con `content` → key OK.
- 401 → key inválida/revocada → generar una nueva en console.anthropic.com → actualizar en Vercel.
- 400 `model not found` → el modelo del prompt activo no existe; cambialo en `/admin/prompt`.

---

## Resetear el password de un empleado

Hoy es desde Supabase (el reset self-service es roadmap):
1. Supabase Dashboard → Authentication → Users.
2. Buscá el email → ⋯ → **Send password recovery** (le manda un mail) o **Reset password** (seteás vos una nueva y se la pasás).

---

## Un empleado no puede entrar a una tool que debería poder

1. `/admin/access` → seleccioná al user.
2. Verificá:
   - El toggle de la tool está **ON** (active).
   - Si tiene **horario** configurado, ¿está dentro de la ventana? (hora de Argentina)
   - Si es 3DSky, ¿tiene **créditos** > 0?
3. El error que ve el user te dice cuál falló: "bloqueado" (toggle off), "fuera de horario" (schedule), "sin créditos" (3DSky).

---

## Las notificaciones de Slack no llegan

1. Verificá `SLACK_WEBHOOK_URL` en Vercel → Env Vars.
2. Probá el webhook directo:
   ```bash
   curl -X POST -H 'content-type: application/json' \
     -d '{"text":"test"}' "$SLACK_WEBHOOK_URL"
   ```
   - Devuelve `ok` → el webhook anda; revisá que estés mirando el canal correcto.
   - `no_service` / `404` → el webhook fue revocado; generá uno nuevo en Slack.
3. **La app no se rompe si Slack falla** — las solicitudes igual se crean. En el log vas a ver `slack webhook ...` si hubo error.

---

## El sitio está caído / un deploy rompió prod

1. Vercel → Deployments → encontrá el último deploy que andaba.
2. ⋯ → **Promote to Production** (instantáneo, sin rebuild).
3. Para arreglar el código: `git revert <sha>` + push → Vercel redeploya.

---

## Backup de la base

Supabase hace backups automáticos (diarios en el plan Pro). Para un backup manual antes de algo riesgoso:
- Supabase Dashboard → Database → Backups → o un `pg_dump` con el connection string (Settings → Database).

> Antes de aplicar una migration nueva en prod, hacé un backup manual.
