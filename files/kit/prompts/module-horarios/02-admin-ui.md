# Módulo Horarios — Sesión H02: UI Admin

## Objetivo

UI para que el admin configure ventanas horarias visualmente (drag para crear, click para borrar, grid semanal).

**Duración**: 3 horas

---

## PROMPT

```
Sesión H02 del módulo Horarios.

ESTADO ACTUAL:
Leé `progress-h01.md`.

OBJETIVO:
UI admin para configurar ventanas horarias con grid semanal interactivo.

PASOS:

1. Habilitar tab "Horarios" en el admin sidebar (sesión 10 del MVP creó la nav con tabs deshabilitadas).
   - En `src/app/(dashboard)/admin/layout.tsx`, quitar el flag `disabled` de "Horarios".

2. Página `src/app/(dashboard)/admin/schedule/page.tsx`:
   - Server Component.
   - Trae lista de users y tools.
   - Renderiza `<ScheduleAdminView users={...} tools={...} />`.

3. Crear `src/components/admin/ScheduleAdminView.tsx`:
   - Client Component.
   - Layout:
     - Selector dropdown: "Para qué usuario" (o "Todos los usuarios" = global).
     - Selector dropdown: "Para qué tool" (o "Todas las tools").
     - Grid semanal: 7 columnas (lun-dom) × 24 filas (horas).
     - Cada celda se puede marcar como "permitido".
     - Drag para marcar rango.
     - Click para borrar celda.
     - Preview en tiempo real del que está construyendo: "Lun-Vie 9-18hs".
     - Botón "guardar configuración".

4. Crear `src/components/admin/WeekGrid.tsx`:
   - Renderiza el grid de 7×24 con celdas clickeables.
   - State: array de { day, startHour, endHour } habilitados.
   - Drag: en mousedown marca, en mousemove pinta, en mouseup confirma.

5. Para mostrar ventanas existentes:
   - Al cambiar el selector de user/tool, GET `/api/admin/time-windows?userId=X&toolId=Y`.
   - Pintar las ventanas que vuelven en el grid.

6. Al guardar:
   - Detectar diff entre el estado actual y el inicial.
   - Mandar al backend: crear las nuevas + borrar las eliminadas.
   - Toast: "Configuración guardada".

7. Componente extra: `<UserScheduleSummary />`:
   - Muestra el resumen en texto: "Sofía Romero: Claude lun-vie 9-18, 3DSky lun-sab 8-20".
   - Útil para auditoría rápida.

8. Visualización de "horario actual":
   - Mostrar línea horizontal en el grid en la hora actual.
   - Que sea visualmente claro si AHORA estaría permitido o no.

9. Test manual:
   - Configurar Sofia: Claude lun-vie 9-18hs.
   - Loguearse como Sofia → intentar usar Claude.
   - Si está dentro del horario → OK. Fuera → mensaje de bloqueo.
   - Cambiar el horario y ver que se actualiza.

10. Commit.

AL FINAL:
`progress-h02.md`.
Próximo: `prompts/module-horarios/03-expiration.md`.
```

---

## VALIDACIÓN

- [ ] Grid funcional, drag para crear
- [ ] Persistencia funciona
- [ ] User ve mensaje claro cuando está fuera de horario
- [ ] Visualmente intuitivo
