# Módulo Panel Admin — Sesión PA03: Filtros avanzados y búsqueda

## Objetivo

Sistema de filtros y búsqueda potente en todas las tablas del admin: logs, usuarios, transacciones, solicitudes.

**Duración**: 2.5 horas

---

## PROMPT

```
Sesión PA03 del módulo Panel Admin Completo.

ESTADO ACTUAL:
Leé `progress-pa02.md`.

OBJETIVO:
Sistema de filtros consistente y reutilizable.

PASOS:

1. Crear sistema de filtros genérico en `src/components/admin/filters/`:
   - `<FilterBar />`: contenedor.
   - `<DateRangeFilter />`: picker de fechas con presets (hoy, ayer, últimos 7 días, mes, custom).
   - `<UserFilter />`: dropdown multi-select de usuarios.
   - `<ToolFilter />`: dropdown multi-select de tools.
   - `<StatusFilter />`: chips de estados (active/pending/locked/expired).
   - `<SearchInput />`: input con debounce.

2. URL state management:
   - Los filtros se serializan en query params.
   - Refrescar la página mantiene los filtros.
   - Compartir URL con filtros funciona.
   - Usar `useSearchParams` + `useRouter` de Next.js.

3. Hook `src/lib/hooks/useTableFilters.ts`:
   - Centraliza la lógica de filtros.
   - API:
     ```typescript
     const { filters, setFilter, clearFilter, clearAll } = useTableFilters(defaultFilters);
     ```

4. Aplicar a tablas existentes:
   - Logs de uso (sesión 11 del MVP).
   - Transacciones de créditos.
   - Usuarios.
   - Solicitudes.

5. Búsqueda full-text:
   - PostgreSQL tiene full-text search nativo.
   - Agregar índice GIN en columnas relevantes (`usage_logs.metadata`, etc.).
   - En cliente: input con debounce 300ms.

6. Saved filters:
   - El admin puede guardar combinaciones de filtros como "vistas".
   - Tabla nueva en DB: `saved_filters (id, user_id, name, table_key, filter_json)`.
   - Dropdown "Mis vistas" en cada tabla.

7. Quick filters:
   - Botones pre-armados arriba de cada tabla:
     - "Solo activos"
     - "Última semana"
     - "Mi equipo" (filtra por dept del admin)

8. Test manual:
   - Filtrar logs por usuario + tool + rango de fechas.
   - Refrescar página → filtros persisten.
   - Copiar URL y abrir en otra ventana → mismos filtros.
   - Guardar como "vista" y aplicarla después.

9. Commit.

AL FINAL:
`progress-pa03.md`.
Próximo: `prompts/module-panel-admin/04-export.md`.
```

---

## VALIDACIÓN

- [ ] Filtros consistentes en todas las tablas
- [ ] URL state funciona
- [ ] Saved filters funcional
- [ ] Búsqueda full-text rápida
