# Sesión 08 — ThreeDSkyAdapter + endpoints de créditos

## ⚠️ ANTES DE EMPEZAR — PEDIRLE AL CLIENTE

### Lo que NQS tiene que confirmar:

- [ ] **Estado del proxy 3DSky** (`3dsky.nqs.com.ar` o como se llame):
  - ¿Está operativo?
  - ¿Quién lo mantiene? (NQS in-house o externo)
  - ¿Pueden agregar 2 endpoints que llamen a tu API? (`check-credits` y `consume-credit`)
- [ ] **Coordinación HMAC**: vos vas a generar un secret compartido. NQS lo carga en su proxy.
- [ ] **URL del proxy** confirmada para configurar variables de entorno.

### Mensaje sugerido para mandarle al cliente:

> Ver template **"2.2 — Antes de sesión 08"** en `docs/05-client-comms-template.md`.

### Por qué importa:

- Si el proxy del cliente NO está listo, podés desarrollar todo el módulo igual. Tu API y vista van a funcionar.
- Pero el flujo end-to-end real (empleado descarga modelo en 3DSky → proxy intercepta → consulta tu API → descuenta crédito) NO va a funcionar hasta que el proxy del cliente esté operativo.
- **Aclarale a NQS** que esto es responsabilidad de ellos y que sin proxy, en producción no se descuentan créditos en consumo real (aunque toda la gestión interna sí funciona).

**Si el proxy no está listo, avanzá igual con el módulo pero documentá el bloqueo.**

---

## Objetivo

Implementar el adapter de 3DSky con sistema de créditos completo: pool, allocations, consumo, transacciones. Backend solo, sin UI todavía.

**Duración**: 2.5 horas
**Output**: endpoints funcionales para que el proxy NQS pueda consultar y consumir créditos, y para que el admin gestione el pool.

---

## PROMPT

```
Sesión 08 del NQS AI Hub.

ESTADO ACTUAL:
Leé `progress-07.md`.

CONTEXTO ESPECÍFICO DE 3DSKY:
3DSky no tiene API pública. NQS ya tiene embebido un proxy en `3dsky.nqs.com.ar` que intercepta requests de compra y consulta nuestra API.

El flujo de créditos según el cliente (ver dev note en `design/screens.jsx` líneas 211-234):
1. El proxy NQS intercepta requests HTTP a endpoints de compra de 3dsky.org.
2. Antes de pasar al upstream, consulta nuestra API: `POST /api/tools/3dsky/check-credits`.
3. Si credits > 0, llama a `POST /api/tools/3dsky/consume-credit`, registra auditoría, y deja pasar.
4. Si credits === 0, devuelve 402 al iframe.
5. Las descargas FREE y re-descargas no se interceptan.

OBJETIVO DE ESTA SESIÓN:
Backend completo del módulo créditos.

PASOS:

1. Completar `src/lib/adapters/three-dsky.ts`:
   - Implementar todos los métodos de la interfaz `ToolAdapter`.
   - `id: '3dsky'`, `category: 'assets'`, `usesCredits: true`, `isEmbedded: true`.
   - `checkAccess(userId)`:
     - Buscar tool_access.
     - Buscar credit_allocations para devolver `credits` y `creditsTotal`.
     - Devolver `{ status: 'active', credits, creditsTotal }`.
   - `getRemainingCredits(userId)`:
     - Query a credit_allocations.
     - Devolver `credits_assigned - credits_used`.
   - `consumeCredit(userId, amount, reason)`:
     - **Transacción atómica** (importante):
       1. SELECT FOR UPDATE en credit_allocations.
       2. Verificar que credits_available >= amount, sino throw "insufficient_credits".
       3. UPDATE credits_used += amount.
       4. INSERT en credit_transactions (type='consumption').
       5. INSERT en usage_logs.
     - Si la transacción falla, todo se rollbackea.
     - Devolver `{ remaining: number }`.
   - `getEmbedUrl(userId)`:
     - Devolver `${process.env.THREE_DSKY_PROXY_URL}?user=${userId}&token=${signedToken}`.
     - El token firma el userId con HMAC para que el proxy pueda verificar.
   - `logUsage()`: usar el helper común.

2. Crear `src/lib/utils/signed-tokens.ts`:
   - Función `signUserToken(userId)`: genera HMAC-SHA256 con secret env.
   - Función `verifyUserToken(token, userId)`: valida que el token sea correcto.
   - Secret en env: `PROXY_HMAC_SECRET` (generar uno nuevo).

3. Endpoints PARA EL PROXY (no para el frontend):

   `src/app/api/tools/3dsky/check-credits/route.ts` (POST):
   - Headers: `X-Proxy-Token: <hmac>` para validar que viene del proxy NQS.
   - Body: `{ userId }`.
   - Devuelve: `{ available: number, can_consume: boolean }`.
   - NO descuenta, solo consulta.

   `src/app/api/tools/3dsky/consume-credit/route.ts` (POST):
   - Headers: igual.
   - Body: `{ userId, amount, reason, modelId? }`.
   - Llama a `threeDSkyAdapter.consumeCredit`.
   - Devuelve: `{ ok: true, remaining: number }` o `{ ok: false, error: 'insufficient_credits' }`.

4. Endpoints PARA EL FRONTEND (autenticado por sesión normal):

   `src/app/api/tools/3dsky/credits/route.ts` (GET):
   - Devuelve `{ credits, creditsTotal, used }` del user actual.

   `src/app/api/tools/3dsky/embed-url/route.ts` (GET):
   - Devuelve `{ url: string }` con el URL del proxy + token firmado.

   `src/app/api/tools/3dsky/request-more/route.ts` (POST):
   - Body: `{ amount: number, reason: string }`.
   - En MVP: solo registra la solicitud y manda toast al admin (sin sistema de aprobación todavía).
   - Inserta en `access_requests` (la tabla ya existe).

5. Endpoints PARA EL ADMIN:

   `src/app/api/admin/credits/pools/route.ts`:
   - GET: lista credit_pools (historial de compras).
   - POST: registra compra. Body: `{ toolId, totalCredits, costUsd, note }`.

   `src/app/api/admin/credits/allocations/route.ts`:
   - GET: lista allocations actuales por user (con JOIN para nombres).
   - POST: ajusta allocation. Body: `{ userId, toolId, delta: number }`. Suma/resta del `credits_assigned`.
     - Validar que no quede menos que credits_used (sino el usuario quedaría con saldo negativo).
     - Registrar transaction.

   `src/app/api/admin/credits/transactions/route.ts` (GET):
   - Lista transacciones con filtros (userId, toolId, dateRange).

6. Validación con Zod en todos los endpoints.

7. Middleware específico para endpoints del proxy:
   - `src/lib/middleware/proxy-auth.ts`: valida el header `X-Proxy-Token`.
   - Aplicar a `check-credits` y `consume-credit`.

8. Tests críticos (Vitest):
   - Test de `consumeCredit`: descuento correcto, error si insuficiente, transacción rollback en error.
   - Test de race condition: 2 requests simultáneos de consume → solo uno debe pasar.

9. Test manual con curl:
   - Probar `GET /api/tools/3dsky/credits` con cookie de Sofia → debería devolver `{ credits: 30, creditsTotal: 30, used: 0 }`.
   - Probar `POST /api/tools/3dsky/consume-credit` con X-Proxy-Token → descuenta 1.
   - Verificar que se creó credit_transaction y usage_log.

10. Commit.

REGLAS:
- Los endpoints del proxy NO usan cookies, usan HMAC header.
- Los endpoints del frontend SÍ usan cookies (sesión normal).
- La transacción de consumo es ATÓMICA, sin excepciones.
- El proxy URL es configurable via env (en dev podría ser `http://localhost:8888`).

VARIABLES DE ENTORNO NUEVAS:
```
THREE_DSKY_PROXY_URL=https://3dsky.nqs.com.ar
PROXY_HMAC_SECRET=<generar uno>
```

AL FINAL:
`progress-08.md` con:
- Adapter funcional
- Endpoints probados con curl
- Tests de race condition pasando
- Próximo paso: `prompts/mvp/09-3dsky-view.md`
```

---

## VALIDACIÓN

- [ ] `GET /api/tools/3dsky/credits` devuelve los créditos de Sofia
- [ ] `POST /api/tools/3dsky/consume-credit` descuenta correctamente
- [ ] Si Sofia tiene 0 créditos, consume devuelve error
- [ ] Transacción rollback funciona (probar forzando error en medio)
- [ ] Admin puede ajustar allocations
- [ ] Admin puede registrar nueva compra de pool

## Próximo paso

`prompts/mvp/09-3dsky-view.md`
