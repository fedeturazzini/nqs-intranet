# Progress — Kling separado de 3DSky (referencias mal copiadas)

**Fecha**: 2026-06-07
**Branch**: `develop` (NO pusheado). Sin migration, sin env.

## Bug
Al entrar a Kling sin créditos decía **"No tenés créditos de 3DSky"** (en vez de
"Kling"), y el botón "solicitar créditos" de esa pantalla pedía créditos de
**3DSky** (no de Kling).

## Auditoría — la lógica de Kling YA era correcta
Grep exhaustivo: en los archivos propios de Kling (`/tool/kling`, adapter,
`/api/tools/kling/*`, `KlingView`) las únicas referencias a "3dsky/3DSky" son
**comentarios** ("clon de 3DSky") y nombres compartidos (el hook
`useThreeDSkySession`, la clase CSS `threedsky-mock`). Toda la **lógica** usa
`"kling"` (tool_id, credit_allocations, consume_credit_atomic, Slack). O sea:
**no había bug de endpoints ni de pools** — los créditos de Kling y 3DSky ya
son registros independientes (keyed por `tool_id`).

El bug estaba en **4 componentes full-screen COMPARTIDOS** que reusé para Kling
con el texto "3DSky" hardcodeado:
- `NoCreditsScreen` — "No tenés créditos de 3DSky" **+ su `CreditRequestModal`
  interno pedía créditos sin `toolId`** (→ caía en el default 3dsky). Este era
  el bug doble (texto + acción).
- `NoAccessScreen` — mensaje de "solicitud pendiente para usar 3DSky".
- `OutsideHoursScreen` — "3DSky no está disponible ahora".
- `CreditsBlockOverlay` — "Para seguir comprando modelos en 3DSky…".

## Fix (`1d818b5`)
Se parametrizaron los 4 componentes con `toolName` (default **"3DSky"** → 3DSky
queda intacto) y, en `NoCreditsScreen`, también con `toolId` para que su modal
pida créditos de la tool correcta. Los call sites de Kling (`/tool/kling` page
+ `KlingView`) pasan `toolName="Kling"` y `toolId="kling"`.

- **3DSky byte-idéntico** en comportamiento (usa los defaults). Único cambio de
  wording: el overlay dice "Para seguir usando 3DSky…" en vez de "comprando
  modelos en 3DSky" (se generalizó; sigue diciendo "3DSky").

### Archivos
`NoCreditsScreen.tsx`, `NoAccessScreen.tsx`, `OutsideHoursScreen.tsx`,
`CreditsBlockOverlay.tsx` (parametrizados); `tool/kling/page.tsx`,
`KlingView.tsx` (cablean toolName/toolId).

## Verificación
```
npm run typecheck → OK
npm test          → 71/71
npm run build     → OK
```
Grep final: no queda texto visible "3DSky" alcanzable desde el flujo de Kling
(solo comentarios + valores default de los props).

## Independencia de pools
Ya estaba garantizada por el esquema genérico (`credit_allocations`/
`credit_pools` keyed por `tool_id`): asignar créditos de Kling a un user **no
toca** los de 3DSky. Son filas distintas.

## Heads-up
Si Sofía sigue sin poder entrar a Kling, es **esperado**: sus créditos de Kling
arrancan en **0**. El admin tiene que asignarle desde `/admin/credits?tool=kling`
(antes, registrar el pool). Esto NO es bug — es el estado inicial.

## Próximo paso
Validar en preview (sin créditos → "No tenés créditos de Kling"; solicitar →
Slack dice "Kling"; 3DSky sigue diciendo "3DSky") → merge a main.
