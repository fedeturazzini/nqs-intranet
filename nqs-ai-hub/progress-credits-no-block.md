# Progress — Créditos no bloquean la entrada a 3DSky/Kling

**Fecha**: 2026-06-07
**Branch**: `develop` (NO pusheado). Sin migration, sin env.

## Issue
Si un user no tenía créditos asignados de 3DSky o Kling, no lo dejaba entrar y
mostraba "Pedile créditos al admin". Conceptualmente mal: los créditos son
**manuales** (los asigna el admin). 0 créditos = "el admin no te asignó cupo
todavía", no "no podés usar la tool".

## Lo correcto (aplicado)
La entrada depende **solo** de:
1. `tool_access` activo (toggle del admin).
2. Estar dentro del horario configurado.

Los créditos pasan a ser **info + botón "pedir más"**, NO condición de entrada.

## Cambios (`bd07c79`)
El bloqueo estaba en **dos capas**, las dos desactivadas:

1. **`canUseTool` (permissions.ts) — CHECK 4**: devolvía `no_credits` cuando la
   asignación era 0/inexistente. Es el gate que usan las pages **y** los
   endpoints (`embed-url`, `session/start`). Desactivado con `TODO` para
   re-habilitarlo cuando la deducción sea automática (post-MVP). El tipo
   `PermissionReason` mantiene `"no_credits"` para ese futuro.

2. **`ThreeDSkyView` / `KlingView` — `CreditsBlockOverlay`**: tapaba el iframe
   cuando `credits <= 0`. Sin esto, aunque `canUseTool` dejara entrar, el
   overlay cubría la tool. Desactivado (el componente queda para re-habilitar).

`NoCreditsScreen` **no se borra** — queda disponible; la rama del page que la
renderiza ahora es inalcanzable (canUseTool ya no devuelve `no_credits`).

## Lo que NO cambió (ya estaba bien)
- **Hub**: las cards calculan estado con `is_active + tool_access.status`
  (sin chequear créditos), así que un user con acceso y 0 créditos ya veía la
  card **activa**. PART 4 ya cumplida.
- **Botón "pedir créditos"** dentro del módulo: ya estaba siempre visible en la
  barra (`ToolViewBar`), independiente del saldo. El contador "X · DE Y" sigue
  **oculto** (decisión de feedback v2.0, se mantiene).
- **`adapter.checkAccess`** tenía su propio "0 créditos → locked", pero **no lo
  llama nadie** (dead code para gating) → se dejó como está.

## No regresiones
- Sin **acceso** → sigue bloqueado ("solicitá al admin").
- **Fuera de horario** → sigue bloqueado ("acceso excepcional").
- Con créditos → entra igual que antes.
- Pedir créditos / Slack → sin cambios.

## Verificación
```
npm run typecheck → OK
npm test          → 71/71  (test de permisos actualizado: 0 créditos → allowed)
npm run build     → OK
```

## Próximo paso
Validar en preview (user con 0 créditos entra normal a 3DSky y Kling; sin
acceso / fuera de horario siguen bloqueados) → merge a main.
