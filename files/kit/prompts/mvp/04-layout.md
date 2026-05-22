# Sesión 04 — Layout del dashboard

## Objetivo

Construir el layout base que envuelve a hub, admin y tool views: topbar con logo, navegación, user chip + marquee superior + sistema de toast.

**Duración**: 2 horas
**Output**: layout reutilizable que se ve idéntico al diseño del cliente.

---

## PROMPT

```
Sesión 04 del NQS AI Hub.

ESTADO ACTUAL:
Leé `progress-03.md`.

OBJETIVO:
Construir el layout del dashboard (topbar + marquee + sistema de toast) que envuelve todas las pantallas autenticadas.

PASOS:

1. Crear `src/components/ui/Topbar.tsx`:
   - Adaptar el `<header className="topbar">` que está en el App component de `design/uploads/nqs-dashboard.html` (o reconstruir desde el JSX original en NQS AI Hub.html).
   - Estructura:
     - Izquierda: Logo NQS + texto "WORKSPACE" + pip verde de conectado
     - Centro: nav con botones "Hub" / "Tutoriales" / "Playbook" / "Organigrama" / "Admin" (este último solo si role=admin)
     - Derecha: indicador de equipo + user chip con iniciales + "salir"
   - Recibe props: `user: { name, initials, role }`, `currentRoute`, `pendingCount` (para badge en admin)
   - El click en "salir" llama a POST /api/auth/logout y redirige.

2. Crear `src/components/ui/Marquee.tsx` (si no se hizo en sesión 01):
   - Mostrar 6 frases del manifesto NQS:
     - "ONE KEY · EVERY TOOL"
     - "DIRIGIDO, NO GENERADO"
     - "DESPLEGÁ IA EN MINUTOS"
     - "DUEÑOS DE TU STACK"
     - "NQS · AI HUB"
     - "BUILT IN ARGENTINA"
   - Animación CSS de marquee infinito.
   - Recibe `items: string[]` como prop.

3. Crear `src/components/ui/Toast.tsx`:
   - Adaptar el componente Toast de `design/components.jsx` (líneas 178-189).
   - Sistema de toast global con un Provider/Context o con Zustand.
   - Recomendación: Zustand para simplicidad (`npm install zustand`).
   - API: `showToast({ title, msg, color, durationMs })`.

4. Crear `src/lib/store/toast.ts`:
   - Store de Zustand con: `toast: Toast | null`, `showToast()`, `hideToast()`.

5. Crear el layout `src/app/(dashboard)/layout.tsx`:
   - Server Component.
   - Llama a `getSession()` y `getUser(userId)` para tener los datos del user.
   - Si no hay sesión, redirige a /login.
   - Renderiza:
     ```tsx
     <div className="app">
       <Topbar user={user} currentRoute={...} />
       <Marquee items={...} />
       {children}
       <Toast />
     </div>
     ```
   - El `currentRoute` se obtiene del pathname (usar `next/headers`).

6. Actualizar `src/app/(dashboard)/hub/page.tsx`:
   - Quitar el saludo placeholder, reemplazar con un `<div className="page"><h1>Hub (próxima sesión)</h1></div>`.
   - Probar que se ve dentro del layout.

7. Crear `src/components/ui/UserChip.tsx`:
   - El user chip de la topbar como componente separado para reusabilidad.
   - Props: `user: { name, initials }`.

8. Asegurar que las clases CSS del cliente funcionan:
   - Probar `.topbar`, `.brand`, `.brand-mark`, `.brand-pip`, `.nav`, `.user-chip`, `.av`.
   - Si alguna no estaba en `components.css` o `screens.css`, copiarla de `design/styles.css`.

9. Test visual:
   - Loguearse como Sofia → debería ver: topbar con su nombre + marquee + página vacía.
   - Loguearse como Tomas → debería ver: topbar con su nombre + botón "Admin" extra en nav.

10. Commit.

REGLAS:
- El Topbar se renderiza en server pero el botón de logout es interactivo (puede ser un client component anidado).
- El Marquee es 100% CSS, no necesita JS, puede ser server component.
- El Toast SÍ es client component (state).

ARCHIVOS A REFERENCIAR:
- `design/styles.css` (clases `.topbar`, `.brand`, `.nav`, `.user-chip`, `.marquee`, `.toast`)
- `design/components.jsx` (NqsLogo, Marquee, Toast)
- `design/uploads/nqs-dashboard.html` (estructura visual del dashboard)

AL FINAL:
`progress-04.md` con:
- Componentes creados
- Cómo funciona el sistema de toast
- Próximo paso: `prompts/mvp/05-hub.md`
```

---

## VALIDACIÓN

- [ ] Layout se ve idéntico al diseño
- [ ] Marquee se desplaza correctamente
- [ ] User chip muestra las iniciales correctas
- [ ] Sofia NO ve el botón Admin; Tomas SÍ lo ve
- [ ] Logout funciona desde el user chip
- [ ] Toast funciona (lo podés probar disparando uno manualmente desde el componente)

## Próximo paso

`prompts/mvp/05-hub.md`
