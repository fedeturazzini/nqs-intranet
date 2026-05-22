# Módulo Contenido — Sesión C02: Playbook

## Objetivo

Sistema de "playbook" interno NQS: documentación de procesos, métodos, principios. Tipo wiki interno.

**Duración**: 2.5 horas

---

## CONTEXTO

El cliente tiene un componente `PlaybookScreen` en `design/extra-screens.jsx`. Hay que adaptarlo + agregar CMS.

---

## PROMPT

```
Módulo Contenido — Sesión C02: Playbook.

ESTADO ACTUAL:
Leé `progress-c01.md`.

OBJETIVO:
Playbook NQS con CMS.

PASOS:

1. Schema:
   ```sql
   CREATE TABLE playbook_sections (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     slug TEXT UNIQUE NOT NULL,
     title TEXT NOT NULL,
     icon TEXT,                            -- emoji o glyph
     description TEXT,
     content TEXT NOT NULL,                -- markdown
     parent_id UUID REFERENCES playbook_sections(id),  -- nesting
     order_index INT,
     is_published BOOLEAN DEFAULT TRUE,
     created_at TIMESTAMPTZ DEFAULT NOW(),
     updated_at TIMESTAMPTZ DEFAULT NOW()
   );
   ```

2. Importar contenido inicial del PlaybookScreen del cliente:
   - Migrar las secciones que ya tiene (manifesto, principios, métodos).

3. Página `src/app/(dashboard)/playbook/page.tsx`:
   - Server Component.
   - Lista de secciones con nesting.

4. Crear `src/components/screens/PlaybookScreen.tsx`:
   - Adaptar el componente del cliente.
   - Estructura tipo wiki: sidebar con TOC + contenido principal con markdown renderizado.

5. Página `src/app/(dashboard)/playbook/[slug]/page.tsx`:
   - Renderiza una sección específica.

6. Markdown renderer:
   - `npm install react-markdown remark-gfm rehype-raw`.
   - Custom components para callouts, ejemplos, código.

7. Admin CMS en `src/app/(dashboard)/admin/playbook/page.tsx`:
   - Lista nested con drag-and-drop.
   - Editor markdown para cada sección.
   - Preview en vivo.

8. Endpoints CRUD igual que tutoriales.

9. Búsqueda full-text en playbook:
   - Índice GIN en `content`.
   - Search box en `/playbook` que busca en todas las secciones.

10. Test manual:
    - Ver playbook como user.
    - Buscar un término.
    - Como admin → editar sección + agregar nueva.

11. Commit.

AL FINAL:
`progress-c02.md`.
Próximo: `prompts/module-contenido/03-organigrama.md`.
```

---

## VALIDACIÓN

- [ ] Playbook se ve idéntico al diseño
- [ ] Markdown renderiza correctamente
- [ ] Búsqueda funciona
- [ ] CMS funcional
