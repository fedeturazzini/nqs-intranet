# Módulo Panel Admin — Sesión PA01: Overview avanzado

## Objetivo

Reemplazar el overview básico del MVP con un dashboard ejecutivo: KPIs en tiempo real, alertas, actividad reciente.

**Duración**: 3 horas

---

## PROMPT

```
Sesión PA01 del módulo Panel Admin Completo.

ESTADO ACTUAL:
El admin overview del MVP es básico (4 StatTiles). Ahora lo expandimos.

OBJETIVO:
Dashboard ejecutivo con visión completa del estado del workspace.

PASOS:

1. Adaptar `AdminOverview` de `design/screens.jsx` (líneas 715-824) como referencia.

2. Mejorar `src/app/(dashboard)/admin/page.tsx`:
   - Trae datos server-side desde múltiples queries.
   - Renderiza `<AdminOverviewView />`.

3. Crear `src/components/admin/AdminOverviewView.tsx` con secciones:

   **Row 1 — KPIs principales (4 StatTiles)**:
   - Usuarios activos hoy / total usuarios
   - Llamadas a IA hoy / promedio semanal
   - Créditos 3DSky disponibles / pool total
   - Solicitudes pendientes (con badge animado si > 0)

   **Row 2 — Alertas**:
   - Lista de "cosas que requieren atención":
     - Solicitudes hace +24hs sin responder
     - Pool de créditos < 20%
     - Usuarios con acceso expirando en 24hs
     - Eventos de seguridad recientes (si módulo shield activo)
   - Cada alerta clickeable y lleva al lugar relevante.

   **Row 3 — Actividad reciente**:
   - Feed cronológico de últimas 20 acciones (`usage_logs`).
   - Avatar + nombre + acción + tool + tiempo relativo.
   - Click → expand para ver detalles.

   **Row 4 — Quick actions**:
   - Botones grandes: "Nuevo usuario", "Editar prompt padre", "Comprar créditos 3DSky", "Ver logs completos".

4. Endpoint `src/app/api/admin/dashboard/kpis/route.ts`:
   - GET: devuelve todos los KPIs en un solo response.
   - Queries optimizadas (idealmente en una sola query con CTE).

5. Endpoint `src/app/api/admin/dashboard/activity/route.ts`:
   - GET: actividad reciente paginada.

6. Endpoint `src/app/api/admin/dashboard/alerts/route.ts`:
   - GET: lista de alertas activas.
   - Cada alerta: `{ id, severity, title, description, link, createdAt }`.

7. Auto-refresh:
   - Cliente hace polling cada 30s a kpis y alerts.
   - SWR o React Query para cache + revalidation.
   - `npm install swr`.

8. Animaciones sutiles:
   - Números que cambian con animación de count-up.
   - Alertas nuevas aparecen con fade-in.

9. Test manual:
   - Sofía usa Claude → admin ve el contador subir en tiempo real.
   - Crear solicitud pending → alerta aparece.

10. Commit.

AL FINAL:
`progress-pa01.md`.
Próximo: `prompts/module-panel-admin/02-charts.md`.
```

---

## VALIDACIÓN

- [ ] Dashboard se carga en < 1s
- [ ] KPIs son precisos
- [ ] Alertas son útiles
- [ ] Activity feed actualiza en tiempo real
