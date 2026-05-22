# Módulo Panel Admin — Sesión PA05: Estimación de costos

## Objetivo

Calcular y mostrar costos asociados al consumo: tokens × precio por modelo, créditos × USD del pool. Visibilidad financiera para NQS.

**Duración**: 2 horas

---

## PROMPT

```
Sesión PA05 del módulo Panel Admin Completo. Última del módulo.

ESTADO ACTUAL:
Leé `progress-pa04.md`.

OBJETIVO:
Estimación de costos en USD y proyecciones.

PASOS:

1. Tabla de pricing en DB:
   - Crear migration nueva: `model_pricing`:
     ```sql
     CREATE TABLE model_pricing (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       tool_id TEXT REFERENCES tools(id),
       model_name TEXT NOT NULL,
       price_input_per_1m NUMERIC(10, 4),  -- USD por millón de tokens input
       price_output_per_1m NUMERIC(10, 4), -- USD por millón de tokens output
       effective_from TIMESTAMPTZ NOT NULL,
       effective_to TIMESTAMPTZ,
       created_at TIMESTAMPTZ DEFAULT NOW()
     );
     ```
   - Seed inicial con precios actuales de Claude Sonnet 4.6.

2. Helper `src/lib/utils/cost-calculator.ts`:
   - `calculateClaudeCost(inputTokens, outputTokens, model, date)`.
   - Lookup en `model_pricing` según fecha del consumo.
   - Devuelve USD.

3. Vista `src/app/(dashboard)/admin/costs/page.tsx`:
   - Tabs: Resumen | Por tool | Por usuario | Pricing config.

4. Resumen:
   - StatTiles:
     - Costo total este mes
     - Costo total mes anterior (con diff %)
     - Proyección fin de mes (basada en consumo actual)
     - Promedio diario
   - Chart de área: costo acumulado por día del mes.

5. Por tool:
   - Tabla: tool | tokens consumidos | costo este mes | costo mes anterior.
   - Para 3DSky: USD del pool consumido (no tokens).

6. Por usuario:
   - Ranking de usuarios por costo.
   - Útil para identificar usuarios que consumen mucho.

7. Pricing config:
   - UI para editar `model_pricing`.
   - Histórico de cambios de precio.
   - Cuando hay que actualizar (cada vez que Anthropic cambia tarifas).

8. Alertas presupuestarias:
   - Setting: "alertarme cuando el costo del mes supere USD X".
   - Cron diario chequea.
   - Notif vía email/Slack.

9. Endpoint `/api/admin/costs/estimate`:
   - GET con filtros.
   - Devuelve breakdown de costos.

10. Test manual:
    - Loguearse como admin.
    - Ver costos del mes.
    - Cambiar el precio de Claude → recalcular costos.
    - Setear alerta de USD 500 → simular superarla.

11. Commit.

AL FINAL:
`progress-pa05.md`.
Módulo Panel Admin Completo TERMINADO.
```

---

## VALIDACIÓN

- [ ] Costos calculados correctamente
- [ ] Histórico de pricing funciona
- [ ] Proyección de fin de mes razonable
- [ ] Alertas presupuestarias funcionan
