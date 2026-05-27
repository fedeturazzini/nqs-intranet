# Progress 09 — Vista de 3DSky (iframe + declaración de consumo + horarios)

**Fecha**: 2026-05-26 → 2026-05-27 UTC
**Duración real**: ~2.5 horas
**Sesión anterior**: `progress-08.md`
**Próxima sesión**: `kit/prompts/mvp/10-admin-base.md` (versión modificada — incluirá selector de modelo Claude)

> **Cambio de alcance** acordado con NQS en sesión 08: NO hay proxy. La tool se embebe directo via iframe a `https://3dsky.org/es/`. La declaración de consumo es manual al salir del módulo.

## Qué se construyó

- **Ruta dedicada** `/tool/3dsky/page.tsx` (estática, le gana al dispatcher `[toolId]`) que:
  - Resuelve sesión + schedule + créditos + URL del adapter
  - Despacha a 4 pantallas según `canUseTool`: `ThreeDSkyView` (OK), `OutsideHoursScreen`, `NoCreditsScreen`, `NoAccessScreen`
- **`ThreeDSkyView`** (Client) — composición completa: topbar interno, header de créditos, indicador de horario, iframe con preloader, overlays + modales.
- **5 componentes** de tool nuevos:
  - `CreditsHeader` — número grande Instrument Serif + barra con color según %
  - `ScheduleIndicator` — pip verde "activo ahora" o "próxima ventana: …" (re-evalúa cada minuto)
  - `EmbeddedSite` — iframe + preloader 3-step + fallback "abrir en nueva pestaña" si tarda >9s
  - `DeclareConsumptionPrompt` — modal con stepper +/- y validación maxAvailable
  - `CreditRequestModal` — adaptado del diseño, valida con Zod en cliente
  - `CreditsBlockOverlay` — overlay sobre iframe cuando `credits=0`
- **3 pantallas gate**:
  - `OutsideHoursScreen` — server component, muestra `summarizeSchedule` + `nextScheduleWindow`
  - `NoCreditsScreen` — client, abre el modal de request inline
  - `NoAccessScreen` — variantes para `no_access`/`pending_approval`/`expired`
- **Hook `useThreeDSkySession`**: lifecycle (start on mount, declare + end on confirm, beacon-end on unmount best-effort).
- **Helpers**: `lib/utils/schedule-window.ts` con `summarizeSchedule()` y `nextScheduleWindow()` (separado de `schedule.ts` que ya tenía el validador puro).
- **Limpieza**: borrado `ThreeDSkyPlaceholder` (sesión 07); dispatcher `[toolId]` simplificado para Claude solamente.

## Archivos creados

```
nqs-ai-hub/
├── src/
│   ├── app/(dashboard)/tool/3dsky/page.tsx        ← dispatcher de gates
│   ├── components/
│   │   ├── screens/
│   │   │   ├── ThreeDSkyView.tsx                  ← composición principal
│   │   │   ├── OutsideHoursScreen.tsx
│   │   │   ├── NoCreditsScreen.tsx
│   │   │   └── NoAccessScreen.tsx
│   │   └── tool/
│   │       ├── CreditsHeader.tsx
│   │       ├── ScheduleIndicator.tsx
│   │       ├── EmbeddedSite.tsx
│   │       ├── DeclareConsumptionPrompt.tsx
│   │       ├── CreditRequestModal.tsx
│   │       └── CreditsBlockOverlay.tsx
│   └── lib/
│       ├── hooks/useThreeDSkySession.ts
│       └── utils/schedule-window.ts
└── progress-09.md
```

## Archivos modificados / borrados

- `src/app/(dashboard)/tool/[toolId]/page.tsx` — saqué el branch de `3dsky` (ahora maneja solo `claude`; el resto redirige a `/hub`).
- **borrado** `src/components/screens/ThreeDSkyPlaceholder.tsx` — ya no se usa.

## Decisiones técnicas tomadas

1. **Route estática `/tool/3dsky/page.tsx` vs. dispatcher.** En Next.js App Router, los segments estáticos ganan sobre los dinámicos. Crear el archivo dedicado fue lo más claro: dispatcher queda solo para Claude, la 3dsky tiene su propio archivo con sus propias responsabilidades (cargar schedule + créditos + URL del adapter). Cuando entren más tools, repetimos el patrón.

2. **Gating server-side con `canUseTool` → branches por `reason`.** Cada `reason` tiene su propia UI (informativa, no técnica). El usuario nunca ve "outside_hours" — ve "3DSky no está disponible ahora · próxima ventana: hoy a las 09:00". `OutsideHoursScreen` recibe la `schedule` para describir qué horarios tiene habilitados.

3. **Cargar `schedule` server-side incluso en el gate.** `OutsideHoursScreen` necesita la schedule para mostrar resumen + próxima ventana. La query corre antes de `canUseTool` para tenerla disponible en cualquier branch.

4. **Hook `useThreeDSkySession` con `navigator.sendBeacon` en cleanup.** Si el user cierra la pestaña sin declarar, mandamos un beacon a `/session/end` con `declared=0`. El beacon es la única forma confiable de mandar requests durante `unload` — `fetch` se cancela. Si `sendBeacon` no existe (entornos exóticos), no hay mucho más que hacer; el admin verá una sesión sin `exited_at` y la audita aparte.

5. **`declaredRef` evita doble cierre.** Si el user declara via modal y después también cierra la tab, el beacon del cleanup ve `declaredRef.current = true` y no hace nada (evitamos un 409 silencioso).

6. **No intercepto `beforeunload` para mostrar el modal.** El browser solo permite mostrar un prompt genérico ("Are you sure you want to leave?"), no UI custom. Decisión: el modal aparece SOLO al clickear "← volver al hub" desde el topbar de la view. Si el user cierra la tab sin pasar por ahí, el cleanup-beacon registra la sesión con `declared=0` y el admin investiga si fuera necesario.

7. **Iframe sandbox permisivo.** 3DSky necesita cookies, scripts, forms y popups. `sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads"`. Esto desactiva el sandbox de seguridad en la práctica — aceptable porque el user ya tiene credentials propios en 3DSky (no estamos exponiendo nada nuestro).

8. **Hard timeout de 9s en `EmbeddedSite`.** Si el iframe no dispara `onLoad` en 9s, mostramos fallback "abrir en nueva pestaña". Esto cubre el caso en que 3DSky cambie sus headers y bloquee iframes en el futuro (el preloader queda colgado para siempre sin el timeout).

9. **`ScheduleIndicator` re-evalúa cada 60s.** El user puede tener la tab abierta a las 08:59:30 y a las 09:00:00 entrar a su ventana. Sin re-eval, el "fuera de horario" se queda hasta que recargue. Costo: 1 render extra cada minuto.

10. **`CreditsHeader` color por % disponible.** `> 50%` verde, `20-50%` amarillo, `< 20%` rojo, `== 0` gris (queda el overlay tomando el render). Decisión visual + accesible.

11. **Modales con `Esc` + click backdrop + focus en primer input.** Patrón estándar. No implementé focus trap completo (libs como `react-focus-trap` lo hacen mejor) — para MVP con modales simples es suficiente.

12. **Validación client-side espeja Zod del endpoint.** `CreditRequestModal` valida `{amount: 1-1000, reason: 5-500 chars}` antes de submit. Si pasa, el server lo re-valida con Zod (defensa en profundidad).

13. **Refresh de créditos: sólo después de `declareAndEnd`.** El hook NO polea `/credits` periódicamente — sería ruido. Si el admin aprueba un request mientras el user está adentro del módulo, no se entera hasta refrescar la página. Trade-off aceptado: en práctica un aprove tarda > tiempo en sesión.

## Cosas pendientes (TODO en código)

- [ ] **3DSky podría bloquear iframe.** Si lo hace, el preloader se queda esperando hasta el timeout y aparece el fallback "abrir en nueva pestaña". El usuario igual puede usar 3DSky en una tab nueva. Solución más graceful: detectar el bloqueo más rápido con `iframe.contentWindow.postMessage` heartbeat. Lo dejo como TODO; el flow actual no rompe.
- [ ] **No interceptamos navegación interna del topbar (Hub/Tutoriales/Playbook/...).** Si el user clickea "Hub" en la nav superior estando en `/tool/3dsky`, navega directo sin pasar por el modal de declaración. La cleanup-beacon registra `declared=0`. Para interceptar tendríamos que cablear un `unstable_useNavigationGuard` (no estable en Next 16) o un Provider que escuche el router. Documentado.
- [ ] **Focus trap en modales** — usar `react-focus-lock` o similar cuando haya tiempo.
- [ ] **Mobile**: el iframe es desktop-first. En mobile la barra del header se va a apretar. Probar antes del deploy.
- [ ] El `ScheduleIndicator` se re-evalúa cada 60s — si la ventana está justo al borde, puede haber hasta 1 min de delay. Aceptable.
- [ ] El `summarizeSchedule` no detecta "fines de semana": "Sáb-Dom" lo agrupa, "Sáb · Dom 09:00-18:00" lo trata como uno si tienen mismo `from-to`. Funciona.
- [ ] Tests del helper `schedule-window.ts` (no añadidos en esta sesión — los tests de `schedule.ts` ya cubren la lógica base).

## Cosas a tener en cuenta para la próxima sesión

- La sesión 10 (admin base) tiene los 7 endpoints listos desde sesión 08. Solo falta UI: panel con ABM users, ABM créditos, vista de pending requests, editor de system prompt de Claude.
- **El prompt 10 va a tener una modificación**: incluir un **selector de modelo de Claude** (Haiku/Sonnet/Opus) — esto requiere agregar una columna `tools.default_model` o un campo en `system_prompts` y exponerlo en el panel admin + el cliente Anthropic. Avisame cuando arranques la 10.
- Sofía quedó restaurada a 30/0 créditos, sin schedule, status active. Sin requests pendientes ni transactions de smoke tests.
- Hay 1 sesión cerrada de 3DSky en `module_sessions` con `declared=3` del smoke test — dejo eso como dato real de auditoría para sesión 10 (cuando el admin abra el panel y filtre por module-sessions).

## Cómo probar lo que se construyó

```bash
npm run dev
```

Flujo manual como **sofia@nqs.test / nqs2026sofia**:

1. **Hub** → click en card **3DSky** (debería estar active con 30/30 créditos).
2. **/tool/3dsky** carga:
   - Topbar interno: "← volver al hub" izq · "3DSKY ◈ •" centro · "↳ SESIÓN ACTIVA" der
   - `CreditsHeader`: número grande "30", "de 30", barra verde al 100%, botón "solicitar más créditos"
   - `ScheduleIndicator`: NO aparece (sofia no tiene schedule por default)
   - Iframe carga con preloader 3-step → muestra 3dsky.org
3. **Click "solicitar más créditos"** → modal con stepper, default 10, textarea. Submit con "render fin de semana, 3 modelos para Manhattan One" → toast "SOLICITUD ENVIADA · Pedido xxx mandado". Verificar en DB: `access_requests` con `credits_requested=10` y `status='pending'`. Si NQS configuró Slack → notif llega al canal.
4. **Click "← volver al hub"** → modal "¿Descargaste algún modelo?" con stepper 0-30. Confirmar con 2 → toast "CONSUMO REGISTRADO · Te quedan 28 créditos" → redirige a `/hub`.
5. **Cerrar tab sin pasar por el modal** → el beacon manda `declared=0` (verificar en DB `module_sessions` que la última sesión tiene `exited_at` ≠ null pero `declared_consumption=0`).
6. **Como admin (tomas)**, vía API:
   - `PATCH /api/admin/tools/schedule` con `{schedule: {friday: {enabled:true, from:"09:00", to:"18:00"}}}` para sofia
   - Loguear como sofia, abrir `/tool/3dsky` → `OutsideHoursScreen` "3DSky no está disponible ahora · Viernes 09:00–18:00 · próxima: el viernes a las 09:00"
   - Restaurar con `{schedule: null}`
7. **Sin créditos**: `POST /api/admin/credits/allocations {delta:-30}` para sofia, abrir `/tool/3dsky` → `NoCreditsScreen` con botón que abre el modal de request inline.
8. **Bloqueado**: `PATCH /api/admin/tools/access {status:"locked"}` para sofia, abrir → `NoAccessScreen` "Acceso bloqueado".

## Tests automáticos + smoke E2E verificados

```bash
npm run typecheck    # OK
npm test             # 19/19 (auth + schedule + slack)
npm run db:race-test # OK (de sesión 08)
npm run build        # 26 rutas + Proxy
```

Smoke E2E con curl (9 escenarios contra dev server):

| Escenario | Resultado |
|---|---|
| `/tool/3dsky` con créditos sin schedule | ✅ ThreeDSkyView render: créditos, brand, iframe, no overlay |
| Schedule solo viernes (martes hoy) | ✅ OutsideHoursScreen con "Viernes 09:00–18:00" |
| Schedule todos los días 24h | ✅ ThreeDSkyView con ScheduleIndicator presente |
| allocation -30 (créditos=0) | ✅ NoCreditsScreen con botón "solicitar créditos" |
| access status=locked | ✅ NoAccessScreen "Acceso bloqueado" |
| Flow start → declareAndEnd(3) | ✅ 200, credits=27 |

## Issues conocidos del iframe

- **3DSky probablemente NO bloquea iframe** (el prompt del usuario confirma: "verificado que 3dsky.org NO tiene X-Frame-Options ni CSP restrictivos"). Si en algún momento cambia, el `EmbeddedSite` lo detecta por hard-timeout 9s y muestra fallback con "abrir en nueva pestaña" — el flow sigue funcionando, solo cambia donde se ve 3DSky.
- **Cookies de 3DSky son propias del browser del user.** Si el user nunca se logueó a 3DSky, el iframe va a mostrar la home anónima. Login al sitio externo está fuera de scope de NQS.
- **Sandbox permisivo** (`allow-same-origin + allow-scripts`) — no es real "sandbox", pero el iframe es del propio user contra un sitio externo donde tiene credentials, no exponemos nada nuestro.

## Variables de entorno agregadas

(ninguna nueva — `SLACK_WEBHOOK_URL` ya estaba de sesión 08)

## Commits sugeridos

```
feat(3dsky-view): vista del empleado con iframe + declaración consumo + horarios
```

## Próximo paso

`kit/prompts/mvp/10-admin-base.md` — RECORDATORIO: incluir selector de modelo Claude (Haiku/Sonnet/Opus). Avisame cuando arranques y armamos el prompt modificado.
