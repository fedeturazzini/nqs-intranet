# Sesión 01 — Setup inicial del proyecto

## ⚠️ ANTES DE EMPEZAR — PEDIRLE AL CLIENTE

Esta sesión depende de que NQS tenga listas varias cuentas. **No avances sin confirmar todo esto**.

### Lo que NQS tiene que aportar antes de esta sesión:

- [ ] **Cuenta Supabase** + proyecto creado → necesitás URL, anon key, service_role key
- [ ] **Cuenta Vercel** + invitación a vos como colaborador
- [ ] **Cuenta Anthropic** + API key + USD 50-100 de créditos cargados
- [ ] **Canal seguro acordado** para intercambiar secretos (1Password / Bitwarden / Doppler)
- [ ] **Decisión de dominio** (hub.nqs.com.ar vs vercel.app)
- [ ] **NQS entiende** que Anthropic genera costos mensuales variables (USD 100-500)

### Mensaje sugerido para mandarle al cliente:

> Ver template **"1. ANTES DE ARRANCAR (kick-off)"** en `docs/05-client-comms-template.md`.

### Por qué importa:

- Si arrancás sin la API key de Anthropic, no podés probar nada del MVP cuando llegues a la sesión 06.
- Si arrancás sin Supabase, no podés hacer la DB en sesión 02.
- Si NQS no entiende los costos recurrentes desde ahora, te van a culpar de la factura mensual cuando llegue.

**Si falta cualquiera de estos, pausá el proyecto y resolvé antes.**

---

## Objetivo de la sesión

Crear el proyecto Next.js, configurar Tailwind, Supabase, importar los estilos del cliente, y dejar el repo listo para arrancar a construir. Sin lógica de negocio todavía.

**Duración estimada**: 2-3 horas
**Output**: proyecto vacío deployable con la home renderizando el logo y el marquee del cliente.

---

## CONTEXTO PARA LA IA

Antes de copy-paste, asegurate de tener abiertos en Cursor / referenciados en Claude Code:

- `kit/docs/00-project-context.md`
- `kit/docs/01-architecture.md`
- `kit/docs/02-conventions.md`
- `kit/docs/progress-template.md`
- Carpeta `design/` con el código del cliente (`styles.css`, `screens.css`, `components.jsx`)

---

## PROMPT (copy-paste a Cursor/Claude Code)

```
Estamos arrancando el proyecto NQS AI Hub.

CONTEXTO COMPLETO:
- Leé `kit/docs/00-project-context.md` y `kit/docs/01-architecture.md` antes de empezar.
- Las convenciones de código están en `kit/docs/02-conventions.md`. Seguilas estrictamente.
- El diseño del cliente está en `design/`. Revisá `design/styles.css` para entender el sistema de variables CSS.

OBJETIVO DE ESTA SESIÓN:
Setup inicial del proyecto Next.js + Tailwind + Supabase. Sin lógica, solo el esqueleto.

PASOS A EJECUTAR:

1. Crear proyecto Next.js 15 con TypeScript:
   - `npx create-next-app@latest nqs-ai-hub --typescript --tailwind --app --src-dir --import-alias "@/*"`
   - Sin ESLint default, lo configuramos después.
   - Sin Turbopack (puede dar problemas con Babel para JSX legacy).

2. Limpiar boilerplate:
   - Borrar `src/app/page.tsx` content, dejar solo "Hello NQS"
   - Borrar styles default de `globals.css`
   - Borrar logo/imágenes de `public/`

3. Configurar estructura de carpetas:
```
src/
├── app/
│   ├── (auth)/
│   │   └── login/page.tsx
│   ├── (dashboard)/
│   │   ├── layout.tsx
│   │   ├── hub/page.tsx
│   │   ├── tool/[toolId]/page.tsx
│   │   └── admin/
│   ├── api/
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── ui/
│   ├── tool/
│   ├── admin/
│   └── screens/
├── lib/
│   ├── adapters/
│   ├── middleware/
│   ├── db/
│   ├── anthropic/
│   └── utils/
├── styles/
│   ├── globals.css
│   ├── components.css
│   └── screens.css
└── types/
```

Crear archivos vacíos con `.gitkeep` donde haga falta para que Git los trackee.

4. Importar los estilos del cliente:
   - Copiar `design/styles.css` → `src/styles/components.css` (renombramos para más claridad).
   - Copiar `design/screens.css` → `src/styles/screens.css`.
   - En `src/styles/globals.css`, importar las fuentes de Google + reset + ambos archivos:
     ```css
     @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500;600&family=Instrument+Serif:ital@0;1&display=swap');
     @import './components.css';
     @import './screens.css';
     ```
   - Importar `globals.css` en `src/app/layout.tsx`.

5. Configurar el tema en el root layout:
   - En `src/app/layout.tsx`, agregar `data-theme="dark"` al `<html>`.
   - Importar las fuentes y aplicar `body` con `font-family: var(--sans)`.

6. Crear `src/components/ui/NqsLogo.tsx`:
   - Adaptar el componente `NqsLogo` de `design/components.jsx` a TypeScript.
   - Acepta props `size` (default 28) y `variant` ('icon' | 'wide').
   - Asume que el logo va a estar en `public/assets/nqs-logo.gif` (copiar desde `design/assets/`).

7. Crear `src/components/ui/Marquee.tsx`:
   - Adaptar el componente `Marquee` de `design/components.jsx`.
   - Props: `items: string[]`.

8. Setup Supabase:
   - `npm install @supabase/supabase-js`
   - Crear `src/lib/db/supabase.ts` con dos clientes:
     - `createServerClient()` con service_role_key (solo backend)
     - `createBrowserClient()` con anon_key (frontend)
   - Configurar variables de entorno en `.env.local`:
     ```
     NEXT_PUBLIC_SUPABASE_URL=
     NEXT_PUBLIC_SUPABASE_ANON_KEY=
     SUPABASE_SERVICE_ROLE_KEY=
     ANTHROPIC_API_KEY=
     ```
   - Crear `.env.local.example` con los nombres pero sin valores.
   - Agregar `.env.local` a `.gitignore`.

9. Configurar Vercel:
   - Crear `vercel.json` básico.
   - No deployar todavía, solo dejar listo.

10. Configurar Prettier:
    - `npm install --save-dev prettier prettier-plugin-tailwindcss`
    - Crear `.prettierrc` con config básica.

11. Crear página `src/app/page.tsx` con:
    - El NqsLogo grande centrado
    - El Marquee con frases tipo "NQS AI HUB · LOADING…"
    - Mensaje "Setup completo"

12. Crear README del proyecto en la raíz con instrucciones de cómo correr local.

13. Hacer commit inicial.

REGLAS:
- TypeScript estricto. Sin `any`.
- Server Components por default. Client Components solo donde hace falta.
- NO instales dependencias innecesarias.
- Respetá el sistema de variables CSS del cliente (no las cambies).

AL FINAL DE LA SESIÓN:
Generá un archivo `progress-01.md` en la raíz del proyecto, siguiendo el template de `kit/docs/progress-template.md`.

Incluí en el progress:
- Qué archivos creaste
- Qué dependencias instalaste y sus versiones
- Cómo correr el proyecto local (`npm run dev`)
- Cualquier decisión técnica que tomaste
- Variables de entorno necesarias
- Próximo paso: ejecutar `prompts/mvp/02-database.md`
```

---

## VALIDACIÓN POST-SESIÓN

Antes de pasar a la sesión 02, comprobá:

- [ ] `npm run dev` levanta sin errores
- [ ] La home renderiza el logo NQS animado
- [ ] El marquee se desplaza correctamente
- [ ] La fuente Instrument Serif y JetBrains Mono cargaron (inspeccionar en DevTools)
- [ ] Las variables CSS (`--bg`, `--accent`, etc.) están definidas
- [ ] `progress-01.md` existe y está completo
- [ ] El repo está commiteado

## Próximo paso

`prompts/mvp/02-database.md`
