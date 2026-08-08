# Progress aux — Fix Brain gate server-side

**Fecha**: 2026-08-08  
**Branch**: `develop`  
**Tipo**: fix de seguridad (acotado)

## Verificación

```
npx vitest run tests/brain-gate* tests/gastos-gate.test.ts
```

## Gap cerrado

Antes: UI del Brain pedía password, pero `/api/admin/system-prompts*` solo
chequeaban `requireAdminApi` → un admin podía leer/editar el cerebro vía
devtools sin desbloquear.

Ahora: mismo patrón que Gastos — cookie + `gate_version` +
`requireBrainGateApi()` en todos los handlers de system-prompts.

## Cambios

1. **Migration `0022_brain_gate_version.sql`**: columna `gate_version` en
   `brain_config` (default 1).
2. **`src/lib/auth/brain.ts`**: token `${expiry}.${gateVersion}.${sig}`,
   `hasBrainGate`, `requireBrainGateApi` → 403 `brain_locked`,
   `clearBrainGateCookie`. Cookies viejas de 2 partes dejan de valer.
3. **verify / change-password**: mint con versión; change hace
   `gate_version++` y renueva cookie.
4. **system-prompts** (GET/POST/DELETE/activate/model): tras admin,
   `requireBrainGateApi`.
5. **`/admin/brain`**: SSR usa `hasBrainGate()`.
6. **Logout**: limpia `brain_session`.

## Deploy / preview

1. Aplicar `0022_brain_gate_version.sql` en Supabase.
2. Push `develop` → preview.
3. Validar:
   - Sin password: `GET /api/admin/system-prompts?toolId=claude` → 403
     `brain_locked`.
   - Con password en UI: leer/editar Brain OK.
   - Change password → cookie vieja inválida.
   - Gastos / proyectos privados intactos.

## Cómo atacar (para probar el fix)

Con sesión admin pero **sin** haber pasado el modal del Brain, desde
devtools:

```
fetch('/api/admin/system-prompts?toolId=claude', { credentials: 'include' })
```

Esperado: `403` + `{ "error": "brain_locked" }`.
