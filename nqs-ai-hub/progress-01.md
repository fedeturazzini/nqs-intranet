# Progress 01 — Setup inicial del proyecto

**Fecha**: 2026-05-22
**Duración real**: ~1 hora
**Sesión anterior**: —
**Próxima sesión**: `kit/prompts/mvp/02-database.md`

## Qué se construyó

- Proyecto Next.js (App Router) con TypeScript estricto + Tailwind v4.
- Estructura de carpetas completa (`src/app`, `src/components`, `src/lib`, `src/styles`, `src/types`) con `.gitkeep` en las que todavía no tienen archivos.
- Design system del cliente importado tal cual (`components.css`, `screens.css`) + carga de fuentes Google (Inter, JetBrains Mono, Instrument Serif).
- Componentes UI base: `NqsLogo` y `Marquee` adaptados desde `design/components.jsx` a TSX, ambos como Server Components.
- Home temporal que renderiza el logo grande, el marquee y un mensaje "setup completo".
- Clientes Supabase server-side / browser-side (`lib/db/supabase.ts`).
- Tooling: Prettier + `prettier-plugin-tailwindcss` configurado para Tailwind v4.
- `vercel.json` listo (sin deploy todavía).
- README operativo en la raíz del proyecto.

## Archivos creados

```
nqs-ai-hub/
├── .env.local                        ← env real (gitignored)
├── .env.local.example                ← plantilla commiteable
├── .prettierrc
├── .prettierignore
├── README.md                          ← reescrito
├── progress-01.md                     ← este archivo
├── vercel.json
├── public/
│   └── assets/
│       └── nqs-logo.gif               ← copiado de design/assets/
└── src/
    ├── app/
    │   ├── (auth)/
    │   │   └── login/page.tsx         ← placeholder
    │   ├── (dashboard)/
    │   │   ├── layout.tsx             ← placeholder
    │   │   ├── hub/page.tsx           ← placeholder
    │   │   ├── tool/[toolId]/page.tsx ← placeholder (params async)
    │   │   └── admin/.gitkeep
    │   ├── api/.gitkeep
    │   ├── layout.tsx                 ← reescrito, data-theme="dark"
    │   └── page.tsx                   ← reescrito, logo + marquee
    ├── components/
    │   ├── ui/
    │   │   ├── NqsLogo.tsx
    │   │   └── Marquee.tsx
    │   ├── tool/.gitkeep
    │   ├── admin/.gitkeep
    │   └── screens/.gitkeep
    ├── lib/
    │   ├── adapters/.gitkeep
    │   ├── middleware/.gitkeep
    │   ├── db/supabase.ts
    │   ├── anthropic/.gitkeep
    │   └── utils/.gitkeep
    ├── styles/
    │   ├── globals.css                ← entry: fuentes + tailwind + componentes + screens
    │   ├── components.css             ← copia 1:1 de design/styles.css
    │   └── screens.css                ← copia de design/screens.css (-1 llave huérfana, ver abajo)
    └── types/.gitkeep
```

## Archivos modificados

- `package.json` — agregadas dependencias (ver sección siguiente).
- `src/app/globals.css` → movido a `src/styles/globals.css` y reescrito.
- `src/styles/screens.css` — removida llave de cierre extra en línea 1521 que rompía el parser de PostCSS de Tailwind v4 (el bloque `@keyframes login-marquee-scroll` ya estaba bien cerrado, había un `}` huérfano debajo). Bug en el archivo original del cliente.
- Borrados: `src/app/favicon.ico`, SVGs por defecto en `public/`, CSS boilerplate.

## Dependencias instaladas (versiones resueltas)

| Paquete | Tipo | Versión |
|---------|------|---------|
| `next` | dep | 16.2.6 |
| `react` | dep | 19.2.4 |
| `react-dom` | dep | 19.2.4 |
| `@supabase/supabase-js` | dep | ^2.106.1 |
| `typescript` | devDep | ^5 |
| `@types/node` | devDep | ^20 |
| `@types/react` | devDep | ^19 |
| `@types/react-dom` | devDep | ^19 |
| `tailwindcss` | devDep | ^4 (resuelto 4.3.0) |
| `@tailwindcss/postcss` | devDep | ^4 |
| `prettier` | devDep | ^3.8.3 |
| `prettier-plugin-tailwindcss` | devDep | ^0.8.0 |

## Decisiones técnicas tomadas

1. **Next.js 16 en lugar de 15.** `create-next-app@latest` ahora resuelve Next 16.2.6 (Next 15 quedó como rama LTS pero `@latest` apunta a 16). Las consecuencias prácticas para el MVP:
   - `params` en rutas dinámicas es `Promise<…>` (ya aplicado en `tool/[toolId]/page.tsx`).
   - El root `AGENTS.md` del template advierte que hay breaking changes; lo dejamos como recordatorio para sesiones futuras.
   - Si el cliente exige LTS, se downgradea con `npm install next@15 react@18 react-dom@18` y se ajustan las rutas async.

2. **Tailwind v4 en vez de v3.** El template moderno usa Tailwind v4 con `@import "tailwindcss"` y sin `tailwind.config.ts`. No afecta el approach porque el grueso del diseño vive en las clases custom del cliente (`.btn`, `.card`, etc.). Tailwind queda para utilities one-off.

3. **CSS del cliente como fuente única.** `components.css` y `screens.css` se importan completos y sin reescritura desde `globals.css`. La única edición fue la corrección del `}` huérfano (ver arriba). Si el cliente actualiza el design system, se reemplazan los archivos y listo.

4. **Sin Turbopack en dev.** El prompt pedía no usar Turbopack por compat con Babel/JSX legacy. `npm run dev` corre `next dev` clásico. Nota: `next build` en Next 16 usa Turbopack siempre — no es opt-in y no se puede desactivar fácil, pero el build pasó OK.

5. **Sin ESLint todavía.** El template `--no-eslint` no genera `.eslintrc`. Lo agregamos cuando definamos reglas estrictas (probable sesión 02 o cuando la arquitectura esté más estable).

6. **`@supabase/supabase-js` directo, no `@supabase/ssr`.** Para el setup alcanza. Cuando llegue auth con cookies (sesión 03) se evalúa migrar a `@supabase/ssr` para Server Components que lean sesión.

7. **`createServerClient` no se cachea.** Cada call crea un cliente nuevo para no compartir estado de auth entre requests concurrentes.

8. **Logo como `<img>` en vez de `next/image`.** Es un gif animado chico, `next/image` desoptimiza/strippa GIFs y no aporta. Se mantiene el approach del diseño del cliente con un comentario `eslint-disable-next-line` por si se activa ESLint después.

9. **Fuentes vía Google CSS y no `next/font`.** El prompt pedía explícitamente `@import url(...)`. Trade-off: un round-trip extra al cargar la primera vez, pero el design system del cliente ya asume fuentes vivas (por eso `--sans`, `--mono`, `--serif` son las del cliente, no las de Geist).

## Cosas pendientes (TODO en código)

- [ ] Generar tipos de Supabase (`supabase gen types typescript`) y reemplazar `type Database = unknown` en `lib/db/supabase.ts`. Esto se hace al final de la sesión 02 cuando exista el schema real.
- [ ] Definir `.eslintrc` con reglas estrictas (next/core-web-vitals + sin `any` + import sort).
- [ ] Agregar script `npm run typecheck` y `npm run format` en `package.json`.
- [ ] El placeholder `(auth)/login/page.tsx` actualmente queda accesible público — eso se resuelve cuando exista middleware de auth (sesión 03).

## Cosas a tener en cuenta para la próxima sesión

- Las carpetas `src/types/`, `src/lib/anthropic/`, `src/lib/middleware/`, etc. están vacías con `.gitkeep`. Borrar el `.gitkeep` al meter el primer archivo real.
- El placeholder de `tool/[toolId]/page.tsx` usa `params: Promise<{...}>` — patrón Next 16. No olvidarlo en las rutas reales.
- La home actual (`src/app/page.tsx`) es un placeholder. Cuando exista el login real (sesión 03), redirige a `/login` o `/hub` según sesión.
- El archivo `.env.local` ya existe pero todas las variables están vacías. Antes de la sesión 02 hay que completarlas con los datos reales del proyecto Supabase de NQS.

## Cómo probar lo que se construyó

```bash
cd nqs-ai-hub
npm install        # sólo la primera vez
npm run dev
```

1. Abrir [http://localhost:3000](http://localhost:3000).
2. Verificar:
   - Marquee desplazándose en la parte superior.
   - Logo NQS animado (el `<stroke>` animado del SVG corre en loop).
   - Tipografías Instrument Serif (título italic), JetBrains Mono (eyebrows), Inter (body) cargadas.
   - Tema dark: fondo `#0a0908`, accent amarillo `#e8ff3d`.
   - En DevTools › Computed, `body` debería tener `font-family: "Inter", …` y las variables `--bg`, `--accent`, etc. presentes en `:root`.
3. Probar el build de producción:
   ```bash
   npm run build
   ```
   Debe terminar con 5 rutas: `/`, `/hub`, `/login`, `/tool/[toolId]`, `/_not-found`.

## Errores conocidos

- (ninguno bloqueante)
- Warning de npm: 2 moderate severity vulnerabilities en deps transitivas. No bloqueantes para dev. Revisar en la sesión 12 antes de deploy.

## Variables de entorno agregadas

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Todas vacías por ahora. `.env.local.example` está commiteado, `.env.local` está en `.gitignore`.

## Commits sugeridos

```
chore(setup): scaffold Next.js 16 + Tailwind v4 + TypeScript estricto
feat(ui): NqsLogo y Marquee adaptados del design system del cliente
feat(db): clientes Supabase server-only y browser
chore(styles): importar design system del cliente (components.css, screens.css)
docs: README + progress-01
```

(Se pueden agrupar todos en un único commit "feat: setup inicial del proyecto" porque es la primera sesión).
