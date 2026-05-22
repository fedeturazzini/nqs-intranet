# Módulo Panel Admin — Sesión PA04: Exportación CSV y PDF

## Objetivo

Permitir exportar reportes de logs, transacciones, usuarios en CSV y PDF (formato profesional para mandar a contabilidad o dirección).

**Duración**: 2 horas

---

## PROMPT

```
Sesión PA04 del módulo Panel Admin Completo.

ESTADO ACTUAL:
Leé `progress-pa03.md`.

OBJETIVO:
Exportación CSV y PDF de reportes.

PASOS:

1. Instalar dependencias:
   - `npm install papaparse` (CSV).
   - `npm install @react-pdf/renderer` (PDF en React).

2. CSV export:
   - Helper `src/lib/utils/csv-export.ts`:
     - `exportToCsv(data, columns, filename)`.
   - En cliente: genera CSV y dispara download.

3. PDF templates en `src/components/admin/pdf-reports/`:
   - `<LogsReport data={...} filters={...} />`.
   - `<CreditsReport data={...} period={...} />`.
   - `<UsersReport data={...} />`.
   - `<MonthlyReport data={...} />` — reporte mensual ejecutivo con todo.

4. Diseño de PDFs:
   - Cover con logo NQS + título + período + fecha de generación.
   - Tabla de contenidos.
   - Secciones con headers consistentes.
   - Footer con paginación + "confidencial · NQS · {fecha}".
   - Tipografía similar a la del web (Instrument Serif + Inter).

5. Endpoint generación server-side:
   - `src/app/api/admin/reports/generate/route.ts`.
   - Body: `{ type: 'logs' | 'credits' | 'users' | 'monthly', filters, format: 'csv' | 'pdf' }`.
   - Genera el archivo y devuelve URL temporal (Supabase Storage).
   - El archivo se borra automáticamente a las 24hs.

6. UI:
   - Botón "exportar" en cada tabla.
   - Modal con opciones: formato (CSV/PDF), incluye filtros actuales, columnas a exportar.
   - Muestra preview antes de descargar.

7. Reporte mensual automatizado:
   - Cron job el día 1 de cada mes a las 9am.
   - Genera reporte mensual completo.
   - Lo manda por email a Tomás.
   - Lo guarda en Storage para acceso histórico.

8. Vista `src/app/(dashboard)/admin/reports/page.tsx`:
   - Lista de reportes generados (los mensuales + los manuales).
   - Filtros por tipo y fecha.
   - Download.

9. Test manual:
   - Exportar logs del último mes a CSV.
   - Exportar reporte mensual a PDF.
   - Verificar formato profesional del PDF.

10. Commit.

AL FINAL:
`progress-pa04.md`.
Próximo: `prompts/module-panel-admin/05-costs.md`.
```

---

## VALIDACIÓN

- [ ] CSV export funciona y abre en Excel
- [ ] PDF se ve profesional
- [ ] Reporte mensual automático llega por email
- [ ] Historial de reportes accesible
