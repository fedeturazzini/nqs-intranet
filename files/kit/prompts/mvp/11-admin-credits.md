# Sesión 11 — Panel admin: gestión créditos 3DSky + logs

## Objetivo

Construir el panel completo de administración de créditos 3DSky (el diseño del cliente ya está hecho — solo conectarlo) + vista básica de logs de uso.

**Duración**: 2.5 horas
**Output**: Tomas puede comprar créditos, asignarlos a empleados con +/-/-5/+5, ver pool y allocations en tiempo real, ver historial de transacciones, y ver logs básicos.

---

## PROMPT

```
Sesión 11 del NQS AI Hub.

ESTADO ACTUAL:
Leé `progress-10.md`.

OBJETIVO:
Panel admin de gestión de créditos 3DSky + vista básica de logs.

NOTA CRÍTICA:
El diseño completo del módulo de créditos YA EXISTE en `design/screens.jsx` líneas 1057-1145 como `AdminCredits`. Es PRÁCTICAMENTE plug-and-play. Solo hay que conectarlo a los endpoints reales (sesión 08 ya los construyó).

PASOS:

1. Página `src/app/(dashboard)/admin/credits/page.tsx`:
   - Server Component.
   - Trae:
     - Pool total actual de 3DSky (suma de todas las compras).
     - Allocations por usuario (con info de used/assigned).
     - Suma total asignada y restante.
   - Renderiza `<AdminCreditsView ... />`.

2. Crear `src/components/admin/AdminCreditsView.tsx`:
   - Client Component.
   - Adaptar `AdminCredits` de `design/screens.jsx` (líneas 1057-1145) tal cual.
   - Estructura:
     - Hero con título "Pool de créditos · 3DSky" y descripción.
     - 3 StatTiles: POOL TOTAL, ASIGNADOS (/X), DISPONIBLE.
     - Tabla con: usuario+dept, rol, uso mensual (barra + texto X/Y), disponibles, ajustes (−5 / − / + / +5), ⋯.
   - Cada botón +/- llama a `POST /api/admin/credits/allocations` con el delta.
   - Botón "comprar más créditos" abre `<BuyCreditsModal />`.
   - Botón "historial" abre `<TransactionsModal />`.

3. Crear `src/components/admin/BuyCreditsModal.tsx`:
   - Form:
     - Cantidad de créditos comprados (number).
     - Costo en USD (number).
     - Nota opcional (textarea: "compré con la cuenta X el día Y").
   - Submit → POST `/api/admin/credits/pools`.
   - Después de submit, refresca la vista.

4. Crear `src/components/admin/TransactionsModal.tsx`:
   - Tabla con historial de transacciones (de credit_transactions).
   - Columnas: fecha, usuario, tipo, monto, razón, hecho por.
   - Filtros: fecha desde/hasta, usuario, tipo.
   - Paginación (20 por página).
   - Botón "exportar CSV" (genera CSV en cliente).

5. Mejoras de UX en la tabla principal:
   - Actualización optimista al apretar +/-: el número se actualiza inmediatamente, después llega la confirmación del server.
   - Si el server falla, revertir y mostrar toast de error.
   - Validación: no permitir asignar menos créditos que los ya usados (sino el user queda con saldo negativo).
   - Confirmar antes de quitarle todos los créditos a un usuario.

6. Página `src/app/(dashboard)/admin/overview/logs/page.tsx`:
   - Vista de logs básica.
   - Tabla con últimas 100 entradas de `usage_logs`.
   - Columnas: timestamp, usuario, tool, action, metadata (truncado), tokens, créditos.
   - Filtros: rango de fechas, usuario, tool, action.
   - Búsqueda libre.

7. Crear `src/components/admin/LogsTable.tsx`:
   - Client Component con paginación server-side.
   - Llama a `/api/admin/logs?page=X&filters=...`.

8. Endpoint `src/app/api/admin/logs/route.ts`:
   - GET con query params: page, limit, userId, toolId, action, dateFrom, dateTo, search.
   - Devuelve `{ logs: [...], total: number, page: number }`.

9. Mejoras al endpoint `/api/admin/credits/allocations` (existe de sesión 08):
   - Asegurarse de que en cada ajuste registra `credit_transactions` con type='allocation' o 'adjustment'.
   - El campo `performed_by` se llena con el admin que hace el cambio.

10. Test manual:
    - Loguearse como Tomas.
    - Ir a /admin/credits.
    - Ver el pool actual (100) y allocations (30 Sofia, 20 Bruno).
    - Click "+5" en Sofia → pasa a 35.
    - Click "−5" → vuelve a 30.
    - Comprar más créditos: +100 USD200 → pool pasa a 200.
    - Ver historial → ver las transacciones.
    - Ir a /admin/overview/logs → ver llamadas a Claude del MVP.

11. Ajustes al Overview del admin (sesión 10):
    - Agregar widget "Pool 3DSky" con créditos restantes.
    - Agregar widget "Últimas 10 acciones" enlazando a logs.

12. Commit.

REGLAS:
- Todo cambio en allocations se registra en credit_transactions (audit trail completo).
- El admin puede ver el contenido del log pero NO modificarlo ni borrarlo (DB-level: solo lectura desde la UI).
- Actualización optimista en UI mejora la sensación de velocidad.

ARCHIVOS A REFERENCIAR:
- `design/screens.jsx` líneas 1057-1145 (AdminCredits) — usar TAL CUAL como base
- `design/components.jsx` (StatTile, Modal)
- `design/screens.css` (clases `.user-table-row`, `.meter`, `.meter-fill`)

NOTA SOBRE DISEÑO:
El cliente diseñó muy bien el panel de créditos. Los botones de ajuste son su decisión específica. NO los cambies por sliders ni inputs numéricos — respetá la UX que dejó.

AL FINAL:
`progress-11.md` con:
- Panel créditos funcional
- Logs básicos visualizados
- Audit trail completo
- Próximo paso: `prompts/mvp/12-deploy.md`
```

---

## VALIDACIÓN

- [ ] Pool de créditos se ve correctamente
- [ ] Asignar +5/−5 a un usuario funciona y persiste
- [ ] Registrar nueva compra suma al pool
- [ ] Historial de transacciones se ve completo
- [ ] Vista de logs filtrable y con paginación
- [ ] Validaciones: no se puede asignar menos que lo usado

## Próximo paso

`prompts/mvp/12-deploy.md`
