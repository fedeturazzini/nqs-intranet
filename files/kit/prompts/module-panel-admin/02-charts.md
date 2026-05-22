# Módulo Panel Admin — Sesión PA02: Gráficos avanzados

## Objetivo

Visualizaciones de consumo: tokens por día/semana/mes, ranking de usuarios, distribución por tool.

**Duración**: 3 horas

---

## PROMPT

```
Sesión PA02 del módulo Panel Admin Completo.

ESTADO ACTUAL:
Leé `progress-pa01.md`.

OBJETIVO:
Charts profesionales con drill-down.

PASOS:

1. Instalar Recharts:
   - `npm install recharts`.

2. Crear página `src/app/(dashboard)/admin/analytics/page.tsx`:
   - Tabs: Consumo IA | Créditos | Usuarios | Tools.

3. Componente `<ConsumoIAChart />`:
   - Chart de barras apiladas: tokens por día (input + output).
   - Toggle: día / semana / mes / año.
   - Por tool (filtro arriba): all, claude, futuras.
   - Hover muestra tooltip con detalles.
   - Click en una barra → drill-down a logs de ese día.

4. Componente `<CreditosChart />`:
   - Chart de área: créditos asignados vs consumidos en el tiempo.
   - Línea adicional: pool total.
   - Eje secundario: USD gastado.

5. Componente `<UsuariosRanking />`:
   - Bar chart horizontal: top 10 users por consumo (en tokens o créditos).
   - Toggle métricas: tokens, USD estimado, créditos.

6. Componente `<ToolsDistribution />`:
   - Pie chart: distribución de uso por tool.
   - Lista lateral con porcentajes y números.

7. Adaptar `BarChart` de `design/components.jsx` (líneas 122-155) si ya tiene un componente custom, sino usar Recharts directo.

8. Endpoints:
   - `/api/admin/analytics/tokens?period=day&groupBy=tool`
   - `/api/admin/analytics/credits?period=month`
   - `/api/admin/analytics/ranking?metric=tokens&limit=10`
   - `/api/admin/analytics/distribution`

9. Optimizar queries:
   - Pre-agregar en queries con GROUP BY date_trunc.
   - Considerar materialized view si el volumen lo justifica.

10. Filtros globales en la página:
    - Date range picker (default: últimos 30 días).
    - Department/user picker.

11. Test manual:
    - Generar consumo simulado de varios días.
    - Ver charts populados.
    - Probar drill-down de un día específico.

12. Commit.

AL FINAL:
`progress-pa02.md`.
Próximo: `prompts/module-panel-admin/03-filters.md`.
```

---

## VALIDACIÓN

- [ ] Charts cargan en < 2s
- [ ] Drill-down funciona
- [ ] Filtros se aplican globalmente
- [ ] Responsive en distintos viewports
