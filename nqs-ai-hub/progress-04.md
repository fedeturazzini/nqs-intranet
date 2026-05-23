# Progress 04 — Layout del dashboard (topbar + marquee + toast)

**Fecha**: 2026-05-23
**Duración real**: ~1.5 horas
**Sesión anterior**: `progress-03.md`
**Próxima sesión**: `kit/prompts/mvp/05-hub.md`

## Qué se construyó

- `Topbar` (Server) con logo + brand + pip de "conectado" + nav + chip de usuario.
- `TopbarNav` (Client) con `usePathname()` para resaltar la ruta activa. 5 items: Hub / Tutoriales / Playbook / Organigrama / Admin (este último solo para `role=admin`, con badge opcional de pending).
- `UserChip` (Server) — pill con iniciales + primer nombre + botón "salir" (LogoutButton anidado).
- `Toast` (Client) — renderer global que se suscribe al store.
- Toast store en Zustand (`src/lib/store/toast.ts`) con `showToast()`, `hideToast()`, auto-dismiss configurable (4s default).
- `(dashboard)/layout.tsx` reescrito: resuelve sesión con `requireAuth()`, monta `<Topbar /> + <Marquee /> + children + <Toast />` dentro de `.app`.
- Páginas `/hub` y `/admin` simplificadas (el LogoutButton se mudó al chip, no se duplica en cada page).
- Marquee con las 6 frases del manifesto del prompt.
- `getSession()` ahora incluye `initials` (lo necesitaba el chip).
- Tests actualizados (6/6 verde) con los nuevos fixtures que incluyen `initials`.

## Archivos creados

```
nqs-ai-hub/
├── src/
│   ├── components/ui/
│   │   ├── Topbar.tsx              ← server, ensambla nav + chip
│   │   ├── TopbarNav.tsx           ← client, usePathname + toast en "soon"
│   │   ├── UserChip.tsx            ← server, chip pill
│   │   └── Toast.tsx               ← client, suscribe al store
│   └── lib/store/toast.ts          ← Zustand store + helper showToast()
└── progress-04.md
```

## Archivos modificados

- `src/app/(dashboard)/layout.tsx` — de passthrough a layout real con auth + topbar + marquee + toast.
- `src/app/(dashboard)/hub/page.tsx` — limpio: encabezado + placeholder, sin LogoutButton (vive en el chip).
- `src/app/(dashboard)/admin/page.tsx` — idem.
- `src/lib/auth/server.ts` — `Session` ahora incluye `initials`; `getSession()` lo selectea.
- `src/components/ui/LogoutButton.tsx` — acepta prop `style` (lo usa el UserChip para inlinear y no romper el aspecto del chip).
- `tests/auth.test.ts` — fixtures actualizados con `initials`.
- `package.json` — agregada dep `zustand@^5`.

## Cómo funciona el sistema de toast

```
┌──────────────────────────────┐
│ cualquier Client Component   │
│                              │
│  showToast({title, msg})     │
│  ↓                           │
└──────────────────────────────┘
            │
            ▼
┌──────────────────────────────┐
│ src/lib/store/toast.ts       │
│  Zustand store               │
│  - toast: Toast | null       │
│  - showToast()               │
│  - hideToast()               │
│  - auto-dismiss en 4s        │
└──────────────────────────────┘
            │
            ▼ (subscription)
┌──────────────────────────────┐
│ <Toast /> en layout          │
│  - solo renderiza si !=null  │
│  - click para dismiss        │
│  - usa clases .toast,        │
│    .toast-glyph, .toast-msg  │
└──────────────────────────────┘
```

**API**:
```ts
import { showToast } from "@/lib/store/toast";

// helper sin hook (handlers de event, server actions client-callable)
showToast({ title: "PEDIDO ENVIADO", msg: "Tu request está en cola.", color: "#4FD1C5" });

// o adentro de un component que necesita reaccionar a cambios
const showToast = useToastStore((s) => s.showToast);
```

**Defaults**:
- `color`: `var(--accent)` (amarillo NQS) si no se pasa.
- `durationMs`: 4000. Pasar `0` deja el toast hasta `hideToast()` manual.
- Solo se muestra UN toast a la vez. Si llega otro mientras hay activo, lo reemplaza (no apila).

**Probarlo manualmente**: en la topbar, clickear "Tutoriales", "Playbook" u "Organigrama" — disparan un toast "módulo en preparación". El click sobre el toast lo cierra inmediatamente, sino se auto-cierra en 4s.

## Decisiones técnicas tomadas

1. **Zustand sobre Context+Reducer.** El toast lo dispara cualquier punto del árbol (incluyendo handlers profundos). Con Context tendríamos que envolver desde el layout y pasar el dispatch. Con Zustand un `showToast(...)` desde cualquier import resuelve todo, sin re-renders innecesarios en el resto del árbol.

2. **`usePathname()` en vez de leer pathname desde `next/headers`.** El prompt sugería `next/headers`, pero en Next 16 el pathname server-side requiere setear un header custom en el proxy (`x-pathname`) y leerlo en el layout — frágil y no idiomático. La nav es una pieza chica de UI sin SEO ni SSR-only, hidratarla con `usePathname()` no cuesta nada y es el patrón que casi todos los projects de Next 16 usan.

3. **Topbar como Server Component, nav como Client.** El topbar mismo no necesita JS (markup estático + props del server). Solo la nav (que reacciona al pathname y al toast en "soon" routes) y el LogoutButton del chip son Client. Mínimo JS al cliente.

4. **`getSession()` ahora trae `initials`.** Lo agregué porque el chip lo necesita. Como `getSession` está cacheada por request, agregar una columna al select no cambia el costo. Alternativa rechazada: hacer una query separada en el layout — innecesario.

5. **Defensa en profundidad: `requireAuth()` en layout Y en pages.** El layout ya valida; las pages igual llaman `requireAuth` (o `requireAdmin` en el admin). Es redundante pero gracias a `cache()` no hay overhead — y si alguien borra el guard del layout por accidente, las pages siguen protegidas.

6. **5 items en la nav, no 4.** El diseño original tiene Hub/Tutoriales/Organigrama; el prompt agregó Playbook. Sigo el prompt. Los 3 que aún no tienen ruta (Tutoriales/Playbook/Organigrama) son botones que disparan un toast "módulo en preparación" — sirve como prueba viva del sistema de toast, y cuando entren los módulos se cambian a `<Link href="...">`.

7. **`pendingCount` cableado pero hard-coded en `0`.** La tabla `access_requests` existe (sesión 02) pero el módulo de aprobaciones es post-MVP. El prop está plumbeado hasta `TopbarNav` para que sea trivial wire-uparlo después — solo hay que reemplazar `PENDING_COUNT_PLACEHOLDER` por una query a `access_requests WHERE status='pending'`.

8. **Estilos del Link en TopbarNav inline.** El CSS del cliente está pensado para `<button>`, no `<a>`. Re-uso el design intent (mismas variables CSS) pero inline porque Next exige `<Link>` (que renderiza un `<a>`) para client-side routing tipado. Trade-off aceptado: un poquito de duplicación vs perder el routing optimizado de Next.

## Cosas pendientes (TODO en código)

- [ ] Cablear `pendingCount` real cuando exista el módulo de aprobaciones.
- [ ] Cuando Tutoriales / Playbook / Organigrama tengan rutas, cambiar de `kind: "soon"` a `kind: "link"` en `BASE_ITEMS` (1-liner por cada uno).
- [ ] Apilamiento de toasts: hoy solo se muestra uno; si la UX lo pide, cambiar el store a `Toast[]` con `Set` de IDs.
- [ ] Animación de salida del toast: hoy desaparece de golpe. Agregar `aria-live="polite"` ya está, pero faltaría un `fade-out` antes de unmount (con `setTimeout` previo al `set({ toast: null })`).

## Cosas a tener en cuenta para la próxima sesión

- El layout es **async**. Cualquier page nueva dentro de `(dashboard)` se renderiza ya con `<div class="page">` esperado por los estilos del cliente (ver hub/page.tsx como template).
- `showToast` se puede llamar desde **cualquier Client Component**. Para Server Actions / Server Components hay que disparar el toast desde el Client side (ej. mostrar resultado de un mutation).
- Nav `usePathname()` no detecta cambios de query string. Si en el Hub usamos `?filter=text`, el active state se mantiene OK (matchea por pathname puro).
- El UserChip tiene `LogoutButton` interno con estilo "transparente texto" — si en algún momento querés un botón visible adicional, importá `LogoutButton` con su default (`btn sm`).

## Cómo probar lo que se construyó

```bash
npm run dev
```

Flujo manual:

1. Loguéate como `sofia@nqs.test / nqs2026sofia`.
2. Verificá topbar:
   - Logo NQS animado a la izquierda + "WORKSPACE" + pip verde.
   - Nav: Hub (activo) / Tutoriales / Playbook / Organigrama.
   - **No** aparece "Admin".
   - Derecha: "↳ EQUIPO CREATIVO" + chip con iniciales `SG` + "Sofía · salir".
3. Marquee corriendo con las 6 frases del manifesto.
4. Click en "Tutoriales" → aparece toast abajo-derecha "TUTORIALES — módulo en preparación".
5. Click sobre el toast → se cierra inmediatamente.
6. Click en "Playbook" → otro toast. Sin clicarlo, esperá 4s → se auto-cierra.
7. Logout (click en "salir" del chip) → vuelve a /login.
8. Loguéate como `tomas@nqs.test / nqs2026admin`.
9. Verificá:
   - Nav ahora incluye **"Admin"** al final.
   - Derecha: "↳ ADMIN" + chip con `TP` + "Tomás · salir".

Tests + build:
```bash
npm test          # 6/6 pasa
npm run typecheck # OK
npm run build     # 8 rutas + Proxy
```

Smoke E2E con curl (verificado):
- `/hub` con sesión sofia → markup incluye `.topbar`, `.nav`, `.user-chip`, `.av`, `.marquee`, items "Hub/Tutoriales/Playbook/Organigrama", iniciales `SG`, primer nombre "Sofía".
- `/admin` con sesión tomas → markup adicional incluye link a `/admin` con `active`, iniciales `TP`.
- Sofía NO tiene link a `/admin` en su HTML (0 menciones).
- `Hub` en `/hub` tiene `class="…active…"` aplicado.

## Componentes creados

| Componente | Tipo | Responsabilidad |
|---|---|---|
| `Topbar` | Server | Ensambla logo + nav + chip. Recibe `user` + `pendingCount` como props. |
| `TopbarNav` | Client | Render de items con active state vía `usePathname()`. Toast en items soon. |
| `UserChip` | Server | Pill con iniciales + nombre + LogoutButton inline. |
| `Toast` | Client | Renderer del toast actual del store. Click dismiss. |
| `LogoutButton` (existente, expandido) | Client | Ahora acepta `style` para inline en el chip. |

## Errores conocidos

- (ninguno bloqueante)
- El warning de Tailwind v4 sobre `next dev` con Turbopack y el HMR de las clases custom no es nuestro problema — los CSS del cliente se procesan vía `@import` y andan OK.

## Variables de entorno agregadas

(ninguna nueva)

## Commits sugeridos

```
feat(layout): dashboard topbar + marquee + toast system con Zustand
```

## Próximo paso

`kit/prompts/mvp/05-hub.md` — Hub principal con grid de tools, filtros, ToolCard.
