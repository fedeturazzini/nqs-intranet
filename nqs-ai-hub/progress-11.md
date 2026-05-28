# Progress 11 — Admin: gestión de créditos 3DSky + widgets overview

**Fecha**: 2026-05-27 → 2026-05-28
**Duración real**: ~1.5 horas
**Sesión anterior**: `progress-10.md`
**Próxima sesión**: `kit/prompts/mvp/12-deploy.md`

> El backend de créditos ya estaba listo desde sesión 08 (endpoints `pools`, `allocations`, `credit-transactions`). Esta sesión es UI + widgets del overview.

## Qué se construyó

- **Página `/admin/credits`** — `AdminCreditsView` adaptado fielmente del mockup del cliente (`design/screens.jsx` 1057-1145):
  - Hero card con título y descripción.
  - 3 StatTiles (POOL TOTAL · ASIGNADOS · DISPONIBLE) con colores semánticos.
  - Tabla de asignaciones con avatar/rol/uso mensual (meter con %)/disponibles (Instrument Serif)/4 botones (−5 / − / + / +5).
  - Botones globales "comprar más créditos" y "historial".
- **`BuyCreditsModal`** — form para registrar compras manuales con cantidad + USD + nota.
- **`TransactionsModal`** — tabla paginada con filtros (tipo, usuario, rango de fechas) + export CSV.
- **2 widgets nuevos en `/admin` overview**:
  - **Pool 3DSky** — clickable, número grande de créditos libres, meter de asignados, link a `/admin/credits`.
  - **Últimas 10 acciones** — feed de `usage_logs` con avatar/tool/action/tokens/timestamp, link a `/admin/logs`.
- **Sidebar admin actualizado** — "Créditos · pool" promovido del bucket "próximamente" a item activo.

## Archivos creados

```
nqs-ai-hub/
├── src/
│   ├── app/(dashboard)/admin/credits/page.tsx       ← server: pool + allocations + users
│   └── components/admin/
│       ├── AdminCreditsView.tsx                     ← stat tiles + tabla + optimistic +/-
│       ├── BuyCreditsModal.tsx                      ← registrar compra
│       └── TransactionsModal.tsx                    ← filtros + paginación + CSV
└── progress-11.md
```

## Archivos modificados

- `src/components/admin/AdminSidebar.tsx` — "Créditos · pool" pasa a item navegable (saca de "próximamente"; el bucket queda con Shield + Snaps).
- `src/app/(dashboard)/admin/page.tsx` — overview ahora tiene 2 widgets nuevos abajo de los stat tiles; sumamos 3 queries más a `loadStats` (`credit_pools`, `credit_allocations`, `usage_logs recientes`).

## Decisiones técnicas tomadas

1. **Optimistic update con rollback.** El click en +/- actualiza el state local al toque. Si el server rechaza (ej. `invalid_delta` cuando assigned < used), revertimos y mostramos toast rojo. Si todo OK, el server devuelve el `credits_assigned` autoritativo y lo sincronizamos por si nuestro cálculo difería (no debería, pero defensa en profundidad).

2. **Guardrails client-side antes del fetch.** El botón "−" se deshabilita cuando `assigned - 1 < used`. "−5" igual. Esto evita un round-trip + toast cuando ya sabemos que va a fallar. El server igual valida — defense in depth.

3. **Confirm modal antes de quitar todos los créditos.** Si admin va a dejar a un user con assigned=0 desde un valor > 0, `confirm()` nativo del browser. Para MVP alcanza; si queda feo se puede swappear por un modal custom después.

4. **`BuyCreditsModal` solo registra el log de la compra.** El admin compra en 3DSky con sus credenciales propias; acá solo carga lo que ya gastó. UX clara: el placeholder de "Notas" sugiere "pagué con la tarjeta corp el 27/05/2026, factura #12345" — el log queda auditable para conciliar con factura mensual.

5. **`TransactionsModal` con paginación client-side.** Traemos 500 rows del endpoint y paginamos localmente (`PAGE_SIZE=20`). Razón: los filtros (tipo/usuario/fecha) son combinables y queremos que cambiar uno no dispare otro fetch. Para NQS con ~5-10 employees, 500 tx es ~6 meses de uso normal — suficiente. Cuando esto crezca, mover a paginación server.

6. **Export CSV con `Blob` + `URL.createObjectURL`.** Sin lib externa. Header fijo de 9 columnas, escapamos `,` y `"` y `\n` con un replace simple — robusto para los datos esperados (IDs UUID, nombres, fechas ISO, números).

7. **Widget "Pool 3DSky" del overview es clickable.** Toda la card es `<Link>`. Mostramos meter + libres / total + alocados/usados. Color verde > 20, amarillo < 20, rojo si va negativo (pool < asignados).

8. **Widget "Últimas 10 acciones" no es interactivo todavía.** Solo lista. Click "ver todos →" lleva a `/admin/logs`. Si después se pide filtrar desde acá (ej. click en un user → `/admin/logs?userId=...`), se cablea fácil.

9. **Refresh post-compra simple: `window.location.reload()`.** El `BuyCreditsModal` actualiza el `poolTotal` local optimisticamente (sumando el `added`) y mantiene la vista. Para refrescar también `credit_pools` history y tx, el admin recarga manual. Trade-off MVP — un Server Action o un `router.refresh()` lo dejarían tip-top, post-MVP.

10. **Optimistic vs server source of truth.** Pasamos el `credits_assigned` devuelto por el server al state después del POST. Si el endpoint cambia su lógica (ej. cap a 100), el cliente ve el valor real, no el optimista.

11. **Filas filtradas a `role === 'employee'`** en `/admin/credits`. Admin (Tomás) no necesita allocation porque pasa por arriba de los checks (ver middleware/permissions). La fila lo confundiría.

## Cosas pendientes (TODO en código)

- [ ] Botón "⋯" de cada fila en la tabla está disabled — pensado para acciones extra (resetear, ver detalle de tx por user, etc.). Cuando NQS pida, se cabolea.
- [ ] Refresh sin reload completo en `AdminCreditsView` — refactor a Server Actions o un endpoint `GET /api/admin/credits/state` que devuelva todo. Para MVP el reload basta.
- [ ] Filtros de logs en `/admin/logs` (el endpoint los soporta; el `LogsBoard` no los expone todavía). Mismo issue que arrastramos de sesión 10. **No bloqueante para MVP** — el admin puede ver últimas 100 sin filtros.
- [ ] Búsqueda libre full-text en logs (el prompt original lo menciona como nice-to-have). Para implementar bien hay que sumar tsvector a usage_logs.
- [ ] El widget "Últimas 10 acciones" no actualiza solo; admin recarga la página para ver lo nuevo. WebSocket / polling es overkill para MVP.

## Cosas a tener en cuenta para la próxima sesión

- La sesión 12 (deploy) toca todo lo del repo. Antes de hacer push a Vercel, importante:
  - **Variables de entorno** en Vercel: todas las de `.env.local.example` (URL, ANON, SERVICE_ROLE, ANTHROPIC, ENCRYPTION_KEY, SLACK_WEBHOOK_URL si está).
  - **Body size limit**: 5 imágenes × 5MB en base64 ≈ 33MB. El default de Vercel es 4.5MB por POST. Cuando deploy, hay que bajar el límite client-side o subir a Supabase Storage primero. **Documentado desde sesión 07**.
  - **Migrations**: 0001 → 0002 → 0003 → 0004. La 0003 quedó con nombres incorrectos; 0004 los arregla. Si la DB de prod arranca limpia, podés combinar 0003+0004 en una sola, o aplicar las dos en orden.
  - **Cookies httpOnly + secure** en prod: el flag `secure` ya está condicionado por `NODE_ENV === "production"` en login route.
- Crear un workflow CI/CD que corra `npm test && npm run typecheck && npm run build` antes de cada merge a main.

## Cómo probar lo que se construyó

```bash
npm run dev
# Login: tomas@nqs.test / nqs2026admin
```

1. **`/admin`** — ver los 2 widgets nuevos abajo: Pool 3DSky (con meter) + Últimas acciones (lista de logs recientes).
2. **Click en "Pool 3DSky" o sidebar "Créditos · pool"** → `/admin/credits`.
3. **Ver stat tiles**: POOL TOTAL (100), ASIGNADOS (50), DISPONIBLE (50). Si seedeas distinto, los números cambian.
4. **Tabla**: Sofía 30 assigned / 0 used / 30 disponibles, Bruno 20 / 0 / 20.
5. **Click "+5" en Sofía** → numéro pasa a 35 al toque + toast no aparece (es éxito silencioso). Verificar en `/admin/credits` con F5: persiste.
6. **Click "−5"** → vuelve a 30.
7. **Click "+5" 6 veces consecutivas** rápido en Bruno → el optimistic suma todos, los POSTs se hacen en paralelo. Refresh para ver el valor final.
8. **Click "comprar más créditos"** → modal. Cantidad: 100, USD: 200, nota: "test fin de mes". Submit → toast verde. Pool overview pasa de 100 a 200.
9. **Click "historial"** → modal con tx. Filtrar por tipo "allocation" → solo positivos. Click "CSV ↓" → descarga `credit-transactions-3dsky-<ts>.csv`.
10. **Probar guardrail**: Bruno tiene 20, gastá 19 (consume vía session/end), después intentá "−5" → toast rojo "ya gastó 19 créditos. Mínimo asignado: 19".

## Tests + build

```bash
npm run typecheck    # OK
npm test             # 19/19
npm run build        # 41 rutas + Proxy (sumó /admin/credits)
```

## Smoke E2E (con curl)

| Test | Resultado |
|---|---|
| `/admin/credits` markup completo (hero, 3 stat tiles, tabla, botones) | ✅ |
| Sidebar promueve "Créditos · pool" a item activo | ✅ |
| `/admin` overview muestra widget POOL 3DSKY + ÚLTIMAS 10 ACCIONES | ✅ |
| POST `/api/admin/credits/allocations` +5 a Sofia → 200 con credits_assigned=35 | ✅ |
| POST -5 → vuelve a 30 | ✅ |
| POST -100 (assigned < used) → 422 `invalid_delta` con mensaje claro | ✅ |
| POST `/api/admin/credits/pools` registra compra → 200 | ✅ |
| GET `/api/admin/credit-transactions?toolId=3dsky` con JOIN explícito → muestra historial | ✅ |
| Cleanup: pool de smoke test borrado + tx generadas borradas | ✅ |

## Variables de entorno agregadas

(ninguna nueva)

## Commits sugeridos

```
feat(admin-credits): pool + asignación con +/- + compra + historial CSV
```

## Próximo paso

`kit/prompts/mvp/12-deploy.md` — deployment a Vercel + verificaciones pre-prod.
