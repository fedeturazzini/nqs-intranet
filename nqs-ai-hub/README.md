# NQS AI Hub

Plataforma interna de NQS — acceso centralizado al stack de IA del estudio
(Claude, Weavy, Kling, Runway, ElevenLabs, Highsfield, 3DSky) con login
unificado, gestión de créditos y protección del "cerebro" (prompt padre de
Claude) en el backend.

> **Estado**: setup inicial (sesión 01 del MVP).
> **Próximo paso**: `kit/prompts/mvp/02-database.md`.

## Stack

| Capa | Tech |
|------|------|
| Frontend | Next.js 16 (App Router) · React 19 · TypeScript estricto |
| Estilos | Tailwind CSS v4 + design system del cliente (`src/styles/components.css`, `screens.css`) |
| Backend | Next.js API Routes (Node runtime) |
| DB / Auth / Storage | Supabase (`@supabase/supabase-js`) |
| LLM | Anthropic Claude Sonnet 4.6 (sesión 06) |
| Hosting | Vercel (sesión 12) |

## Requisitos

- Node 20+ (probado con 25.x).
- npm 10+.
- Cuenta de Supabase con proyecto creado (URL + anon + service_role).
- API key de Anthropic con créditos cargados.

## Setup local

```bash
# 1. Instalar dependencias
npm install

# 2. Variables de entorno
cp .env.local.example .env.local
# Editar .env.local con los valores reales de Supabase y Anthropic.

# 3. Levantar dev server
npm run dev
```

Abrir [http://localhost:3000](http://localhost:3000). Deberías ver el logo
NQS animado + el marquee + un texto "setup completo".

## Scripts

```bash
npm run dev      # next dev (sin Turbopack — ver progress-01.md)
npm run build    # next build
npm run start    # next start
```

## Estructura

```
src/
├── app/                  ← App Router
│   ├── (auth)/login/     ← placeholder login (sesión 03)
│   ├── (dashboard)/      ← rutas autenticadas (sesión 04)
│   ├── api/              ← API routes (sesión 02+)
│   ├── layout.tsx        ← root layout (data-theme="dark")
│   └── page.tsx          ← home temporal con logo + marquee
├── components/
│   ├── ui/               ← primitivos (NqsLogo, Marquee)
│   ├── tool/             ← componentes de tool (ToolCard, etc — sesión 05)
│   ├── admin/            ← componentes del panel admin
│   └── screens/          ← pantallas completas
├── lib/
│   ├── adapters/         ← ToolAdapters (sesión 06+)
│   ├── middleware/       ← canUseTool + auth guards
│   ├── db/supabase.ts    ← clients server + browser
│   ├── anthropic/        ← cliente Claude (sesión 06)
│   └── utils/
├── styles/
│   ├── globals.css       ← entry: fuentes + Tailwind + componentes + screens
│   ├── components.css    ← design system del cliente (no tocar)
│   └── screens.css       ← layout-specific del cliente (no tocar)
└── types/
```

## Variables de entorno

Ver `.env.local.example` para la lista completa. Las críticas:

| Variable | Lado | Notas |
|----------|------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | client + server | URL pública del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client + server | Anon key, respeta RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | Salta RLS — nunca exponer al cliente |
| `ANTHROPIC_API_KEY` | **server only** | Clave de Anthropic |

## Convenciones

- TypeScript estricto, sin `any`. Usar `type` en vez de `interface`.
- Server Components por default; `"use client"` solo cuando haga falta.
- El **prompt padre** y la **service role key** nunca llegan al cliente.
- Permisos centralizados en `lib/middleware/permissions.ts` (sesión 02+).
- Cada llamada a Anthropic se loguea en `usage_logs` (sesión 06).

Más detalle en `kit/docs/02-conventions.md`.
