# Módulo Contenido — Sesión C01: Tutoriales

## Objetivo

Módulo de tutoriales internos NQS: galería de tutoriales con player de imágenes/video, gestión vía admin CMS.

**Duración**: 3 horas

---

## CONTEXTO

El cliente ya tiene **6 tutoriales completos en HTML** en `design/tutorials/`:
- `how-mock-up.html`
- `how-ground-up.html`
- `how-in-motion.html`
- `how-weavy.html`
- `how-reframes.html`
- `how-maquette.html`

Plus assets: imágenes en `design/tutorials/img/` y `design/tutorials/assets/how/`.

El estilo y estructura ya están definidos. Hay que migrarlos a la app.

---

## PROMPT

```
Módulo Contenido — Sesión C01: Tutoriales.

ESTADO ACTUAL:
El cliente entregó 6 tutoriales HTML completos en `design/tutorials/`.

OBJETIVO:
Migrar tutoriales al hub + CMS para que el admin agregue/edite tutoriales.

PASOS:

1. Schema de DB para tutoriales:
   ```sql
   CREATE TABLE tutorials (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     slug TEXT UNIQUE NOT NULL,           -- 'how-mock-up'
     title TEXT NOT NULL,
     subtitle TEXT,
     thumbnail_url TEXT,
     description TEXT,
     tool_id TEXT REFERENCES tools(id),   -- tutorial puede estar asociado a una tool
     content JSONB NOT NULL,              -- estructura del tutorial
     access_level TEXT DEFAULT 'all',     -- 'all' | 'restricted'
     is_published BOOLEAN DEFAULT TRUE,
     order_index INT,
     created_at TIMESTAMPTZ DEFAULT NOW(),
     updated_at TIMESTAMPTZ DEFAULT NOW()
   );

   CREATE TABLE tutorial_views (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id UUID REFERENCES users(id),
     tutorial_id UUID REFERENCES tutorials(id),
     completed BOOLEAN DEFAULT FALSE,
     last_step INT,
     viewed_at TIMESTAMPTZ DEFAULT NOW()
   );
   ```

2. Estructura del JSON `content`:
   ```typescript
   type TutorialContent = {
     intro: { headline: string, body: string };
     sections: Array<{
       id: string;
       title: string;
       body: string;  // markdown
       media?: {
         type: 'image' | 'video' | 'comparison';
         src: string | { before: string; after: string };
         caption?: string;
       };
     }>;
     summary?: string;
     relatedTools?: string[];
   };
   ```

3. Importar los 6 tutoriales del cliente:
   - Script `scripts/import-tutorials.ts` que:
     - Parsea cada HTML del cliente.
     - Extrae secciones, imágenes, captions.
     - Inserta en DB con su contenido.
   - Subir imágenes a Supabase Storage en `tutorials/`.

4. Crear página `src/app/(dashboard)/tutorials/page.tsx`:
   - Server Component.
   - Trae lista de tutoriales publicados ordenados.
   - Renderiza `<TutorialsScreen tutorials={...} />`.

5. Crear `src/components/screens/TutorialsScreen.tsx`:
   - Adaptar `TutorialsScreen` de `design/screens.jsx` (líneas 1315-1482).
   - Grid de cards con thumbnail, título, tool asociado, tiempo estimado.
   - Filtros por tool / por nivel.

6. Crear página `src/app/(dashboard)/tutorials/[slug]/page.tsx`:
   - Server Component.
   - Trae tutorial específico.
   - Renderiza `<TutorialView tutorial={...} />`.

7. Crear `src/components/screens/TutorialView.tsx`:
   - Layout vertical scrollable.
   - Intro hero.
   - Secciones con texto + media.
   - Sticky sidebar con índice + progreso de lectura.
   - Componente especial `<BeforeAfterComparison />` para imágenes antes/después (varios tutoriales lo usan).
   - Botón "marcar como completado" al final.

8. Migrar el CSS:
   - `design/tutorials/style.css` → `src/styles/tutorials.css`.
   - `design/tutorials/script.js` → adaptar funcionalidades a React (comparator, lightbox).

9. Admin CMS en `src/app/(dashboard)/admin/tutorials/page.tsx`:
   - Lista de tutoriales con orden ajustable (drag-and-drop).
   - Botón "+ nuevo tutorial" → editor.

10. Editor de tutoriales:
    - Form con campos: slug, title, subtitle, thumbnail upload, tool, descripción.
    - Editor de secciones (drag para reordenar):
      - Por cada sección: título, body (markdown editor), upload de imagen/video.
    - Preview en vivo.
    - Botón "guardar como borrador" / "publicar".

11. Endpoints admin:
    - GET/POST `/api/admin/tutorials`.
    - GET/PATCH/DELETE `/api/admin/tutorials/:id`.
    - POST `/api/admin/tutorials/:id/publish`.

12. Markdown editor:
    - `npm install @uiw/react-md-editor`.

13. Test manual:
    - Como user → ver lista de tutoriales.
    - Abrir uno → leer completo.
    - Marcar como completado.
    - Como admin → editar un tutorial existente.
    - Crear uno nuevo desde cero.

14. Commit.

AL FINAL:
`progress-c01.md`.
Próximo: `prompts/module-contenido/02-playbook.md`.
```

---

## VALIDACIÓN

- [ ] 6 tutoriales del cliente migrados correctamente
- [ ] Vista de tutoriales se ve idéntica al diseño
- [ ] Comparator antes/después funcional
- [ ] CMS funcional para crear nuevos
