# 00 — Contexto del proyecto NQS AI Hub

## Qué estamos construyendo

**NQS AI Hub** es una plataforma web propia para NQS (estudio creativo) que centraliza el acceso a su stack de herramientas de IA y protege la propiedad intelectual de la empresa (especialmente el "cerebro" — un prompt padre elaborado en Claude).

## El problema que resolvemos

Hoy NQS opera con varias herramientas (Claude, Weavy, Kling, Runway, ElevenLabs, Highsfield, 3DSky). Los empleados acceden directamente a cada una. Esto trae dos problemas serios:

1. **El prompt padre del "cerebro" está expuesto.** Cualquier empleado puede ver las instrucciones del Project de Claude o extraerlas con técnicas de prompt injection.
2. **No hay control operativo.** No se puede auditar uso, controlar horarios, ni gestionar créditos compartidos (especialmente 3DSky, donde un admin compra créditos y los reparte manualmente).

## La solución (MVP)

Una plataforma donde los empleados se loguean con su cuenta NQS y acceden a las herramientas habilitadas. **El prompt padre vive en el backend** — nunca llega al frontend, nunca lo ve el empleado.

## Alcance del MVP (esto es lo que entregamos a NQS)

### Funcionalidades del MVP

1. **Login** con email/password, dos roles: `admin` y `employee`.
2. **Hub principal**: grid con las 7 herramientas. Solo Claude y 3DSky operativas. El resto con etiqueta "próximamente".
3. **Módulo Claude**: wrapper sobre la API de Anthropic.
   - El empleado escribe su prompt simple + opcionalmente adjunta imágenes.
   - El backend combina con el prompt padre y llama a la API.
   - El empleado recibe el prompt optimizado, listo para copiar.
   - Historial personal.
4. **Módulo 3DSky**: gestión interna de créditos.
   - Admin compra créditos manualmente en 3DSky.org (eso es externo a la plataforma).
   - Admin carga la compra en el panel: "compré 100 créditos por USD 700".
   - Admin asigna créditos a empleados (10 a uno, 20 a otro, etc.).
   - Empleado ve cuántos créditos tiene y los consume (cuando descarga modelos vía proxy/iframe).
   - Si llega a 0 → overlay de bloqueo + botón "solicitar más créditos".
5. **Panel admin**:
   - ABM del prompt padre (editar el cerebro de Claude desde la UI).
   - ABM de usuarios (alta, baja, edición).
   - Gestión del pool de créditos 3DSky y asignaciones.
   - Logs básicos: quién usó qué, cuándo.

### Lo que NO va en el MVP (roadmap futuro)

- Sistema de solicitud y aprobación de accesos.
- Control horario y caducidad automática.
- Panel admin completo (gráficos, exportación PDF).
- Detección de prompt injection / seguridad avanzada.
- Capturas automáticas.
- Integración funcional de Weavy, Kling, Runway, ElevenLabs, Highsfield.
- Módulos de contenido: Tutoriales, Playbook, Organigrama.

## Lo crítico: arquitectura escalable

El cliente seguro va a ir habilitando módulos uno por uno. **Todo lo que construyamos en el MVP tiene que estar pensado para que sumar un módulo sea agregar archivos, no refactorizar el core.**

Esto se logra con:

1. **Schema de DB completo desde el principio** (con tablas que el MVP no usa pero existen).
2. **Patrón ToolAdapter** para herramientas (cada tool implementa una interfaz común).
3. **Middleware de permisos centralizado** que se puede extender con nuevas reglas.
4. **Componentes UI 100% reutilizables** (cada tarjeta de tool, cada modal, cada tabla).

Ver `01-architecture.md` para el detalle.

## El diseño

El cliente entregó un diseño completo en HTML+JSX+CSS (carpeta `design/`). El diseño tiene:

- **Tipografía editorial**: Instrument Serif (italic) para títulos + Inter para body + JetBrains Mono para meta/eyebrow
- **Paleta dark** (con modo light disponible): fondo `#0a0908`, accent `#e8ff3d`, textos `#f5f1e8`
- **Sistema de tags y status pills** (active, pending, locked, expired)
- **Marquee superior** con frases del manifesto
- **Animaciones sutiles**: pulse, blink, fade-in, marquee
- **Estilo "next layer"** con eyebrows en monoespaciada y flechitas "↳"

### Reglas del diseño

- **Replicar fielmente**. Copiar el CSS del cliente tal cual donde se pueda.
- **Adaptar a Next.js**: el diseño está en JSX vanilla con React UMD + Babel standalone. Hay que convertirlo a componentes Next.js con TypeScript.
- **Convertir CSS a Tailwind**: las clases custom (`.card`, `.btn`, `.tag`, `.t-eyebrow`) las mantenemos como componentes React, no las refactoreamos a Tailwind puro. Mantener los `styles.css` y `screens.css` del cliente como referencia.

## Mock data vs DB real

El diseño del cliente tiene mucho mock data en `data.jsx` (users, tools, activity, pending requests). En el MVP, **ese data viene de la DB**, no hardcodeado.

## Stack técnico

```
Frontend:    Next.js 15 (App Router) + React + TypeScript + Tailwind CSS
Backend:     Next.js API Routes (Node.js runtime)
DB:          PostgreSQL via Supabase
Auth:        Supabase Auth (email/password)
Storage:     Supabase Storage (imágenes adjuntas, futuro: descargas 3DSky)
LLM:         Anthropic API (Claude Sonnet 4.6) - modelo: claude-sonnet-4-6
Hosting:     Vercel (frontend + API routes en mismo deploy)
```

## Variables de entorno (todas)

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Anthropic (provista por NQS)
ANTHROPIC_API_KEY=

# App
NEXT_PUBLIC_APP_URL=https://hub.nqs.com.ar (placeholder)
```

## Convenciones críticas

- **TypeScript estricto**: nada de `any`.
- **Server Components por default**, Client Components solo donde haya interactividad.
- **El prompt padre NUNCA llega al cliente**. Vive en variable de entorno y/o DB.
- **Logs de uso siempre** en cada llamada a la API de Anthropic.
- **Roles**: tabla `users` con columna `role` (`admin` | `employee`).
- **Lockear el prompt padre**: solo admin puede leer/editar la tabla `system_prompts`.

## Próximo paso

Leer `01-architecture.md`.
