# Módulo Contenido — Sesión C03: Organigrama

## Objetivo

Vista interactiva del organigrama NQS: equipo, roles, responsabilidades, conexiones jerárquicas.

**Duración**: 3 horas

---

## CONTEXTO

El cliente entregó implementación completa en `design/organigrama.jsx` (30KB) + `design/organigrama-data.jsx` (15KB) + `design/organigrama.css` (21KB). Es un componente complejo con visualización custom.

---

## PROMPT

```
Módulo Contenido — Sesión C03: Organigrama. Última del módulo.

ESTADO ACTUAL:
Leé `progress-c02.md`.

OBJETIVO:
Adaptar el organigrama del cliente + integrarlo con la tabla `users` real.

PASOS:

1. Schema (extender users):
   ```sql
   ALTER TABLE users ADD COLUMN IF NOT EXISTS reports_to UUID REFERENCES users(id);
   ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT;
   ALTER TABLE users ADD COLUMN IF NOT EXISTS skills TEXT[];
   ALTER TABLE users ADD COLUMN IF NOT EXISTS start_date DATE;
   ```

2. Migrar `design/organigrama.jsx`:
   - Adaptar a Next.js + TypeScript.
   - Mantener la visualización custom del cliente.
   - Datos vienen de DB en vez de hardcoded.

3. Página `src/app/(dashboard)/organigrama/page.tsx`:
   - Server Component.
   - Trae users con info necesaria.
   - Renderiza `<OrganigramaScreen users={...} />`.

4. Crear `src/components/screens/OrganigramaScreen.tsx`:
   - Adaptar el componente del cliente.
   - Importar `design/organigrama.css`.
   - Visualización: cards de personas, conexiones jerárquicas, agrupación por dept.
   - Click en persona → modal con detalle (bio, skills, contacto, herramientas que usa).

5. Vista admin para editar organigrama:
   - `src/app/(dashboard)/admin/organigrama/page.tsx`.
   - Tabla de users con campos: nombre, rol, dept, reports_to, bio.
   - Drag-and-drop visual para cambiar jerarquías.

6. Endpoints:
   - `GET /api/organigrama`: estructura completa para render.
   - `PATCH /api/admin/users/:id/org`: actualiza reports_to, dept, etc.

7. Mejoras al UserDetailModal (admin):
   - Agregar campos: reports_to, bio, skills, start_date.

8. Featured:
   - "¿Quién hace qué?" — buscar persona por skill o rol.
   - "Equipo de Sofía" — ver todo el subárbol.

9. Test manual:
   - Ver organigrama.
   - Click en una persona → ver detalle.
   - Como admin → cambiar reports_to de alguien.

10. Commit.

AL FINAL:
`progress-c03.md`.
Módulo Contenido COMPLETO.
```

---

## VALIDACIÓN

- [ ] Organigrama se ve idéntico al diseño
- [ ] Drag-and-drop admin funciona
- [ ] Búsqueda por skills funciona
- [ ] Estructura jerárquica reflejada correctamente
