# NQS AI Hub — Kit de Desarrollo

> Kit completo para construir el proyecto NQS AI Hub con asistencia de IA. Incluye prompts numerados, snippets de código, checklist y referencias.

## Cómo usar este kit

### Estructura
```
kit/
├── README.md                    ← este archivo (cómo arrancar)
├── docs/
│   ├── 00-project-context.md   ← contexto completo del proyecto
│   ├── 01-architecture.md      ← arquitectura escalable
│   ├── 02-conventions.md       ← convenciones de código
│   ├── 03-checklist.md         ← checklist completo de tareas
│   └── progress-template.md    ← template para los .md de avance
├── prompts/
│   ├── mvp/                    ← 12 prompts del MVP
│   ├── module-horarios/        ← prompts del módulo de horarios
│   ├── module-creditos/        ← prompts del módulo de créditos 3DSky
│   ├── module-aprobaciones/    ← prompts del módulo de solicitudes
│   ├── module-panel-admin/     ← prompts del módulo panel admin completo
│   ├── module-tools/           ← prompts para agregar nuevas tools
│   └── module-seguridad/       ← prompts del módulo de seguridad/shield
├── reference/
│   ├── db-schema.sql           ← schema completo de DB (todo el roadmap)
│   ├── tool-adapter-pattern.ts ← patrón ToolAdapter para extensibilidad
│   ├── middleware-permissions.ts ← middleware de permisos
│   └── api-routes.md           ← estructura de endpoints
└── assets/
    └── (link al diseño del cliente)
```

### Flujo de trabajo recomendado

1. **Antes de empezar**: leé `docs/00-project-context.md`, `docs/01-architecture.md` y **`docs/04-client-dependencies.md`** completos. Una vez. Te ahorra horas después.

2. **Antes de cada sesión**: revisá el bloque "⚠️ ANTES DE EMPEZAR — PEDIRLE AL CLIENTE" al inicio del prompt. Si falta algo del cliente, **pausá y pedilo** antes de avanzar. Usá los templates de `docs/05-client-comms-template.md`.

3. **Cada sesión** (2-3 hs/día):
   - Abrí Cursor (o Claude Code).
   - Tomá el siguiente prompt numerado de `prompts/mvp/` (o el módulo que estés trabajando).
   - Copy-paste al chat de la IA, **adjuntando los archivos referenciados**.
   - La IA construye lo que pide el prompt.
   - **Crítico**: al final, la IA debe generar `progress-XX.md`. Guardalo en la raíz del proyecto. Ese .md es input del próximo prompt.
   - Tachá la tarea del checklist.

4. **Cuando termines el MVP**: los prompts de los módulos están listos para cuando NQS te apruebe la v2. No los uses todavía.

### Reglas de oro

1. **Nunca saltees prompts.** Cada uno asume que los anteriores se ejecutaron.
2. **Siempre referenciá `progress-XX.md` anterior** al arrancar nuevo prompt. La IA pierde contexto.
3. **Revisá siempre el bloque "⚠️ ANTES DE EMPEZAR"** del prompt. Si falta algo del cliente, no avances.
4. **Si un prompt te falla** (la IA hace algo raro), revisá el `progress` anterior y reintenta. No avances con algo roto.
5. **Tests solo en lo crítico**: auth, manejo del prompt padre, descuento de créditos.
6. **Diseño del cliente**: copiá y adaptá su código. NO redibujar desde cero.
7. **Costos recurrentes**: están en `docs/04-client-dependencies.md`. NQS tiene que entenderlos desde el día 1.

### Setup inicial (antes del prompt 01)

1. Crear cuenta en Vercel, Supabase y obtener:
   - API key de Anthropic (provista por NQS)
   - Credenciales de Supabase (URL + anon key + service role key)
2. Tener el ZIP del diseño descomprimido en una carpeta.
3. Abrir Cursor en la carpeta donde irá el proyecto.

### Stack confirmado

- **Frontend**: Next.js 15 (App Router) + React + Tailwind CSS
- **Backend**: Next.js API Routes (Node.js)
- **DB**: PostgreSQL via Supabase
- **Auth**: Supabase Auth
- **Storage**: Supabase Storage (para imágenes adjuntas)
- **LLM**: Anthropic API (Claude Sonnet 4.6)
- **Hosting**: Vercel (todo)
- **IA para desarrollo**: Cursor + Claude Code

### Estimación de tiempo

Asumiendo 2-3 hs/día con IA:

| Fase | Sesiones | Duración |
|------|----------|----------|
| MVP completo | 12 sesiones | 4 semanas |
| Módulo horarios | 3 sesiones | 1 semana |
| Módulo créditos | (ya en MVP) | — |
| Módulo aprobaciones | 4 sesiones | 1.5 semanas |
| Módulo panel admin completo | 5 sesiones | 2 semanas |
| Módulo otras tools | variable | depende del tool |
| Módulo seguridad/shield | 4 sesiones | 1.5 semanas |

### Soporte

Si te atascás en una sesión, abrí un chat con Claude y pegale:
- El `progress-XX.md` anterior
- El prompt que estás corriendo
- El error/comportamiento extraño que tenés

Con ese contexto Claude te puede desbloquear rápido.

---

**Próximo paso**: abrir `GETTING_STARTED.md` (te lleva paso a paso) o `docs/00-project-context.md` (contexto del proyecto).
