# Deploy a Vercel — checklist

> El deploy lo hace Fede (requiere cuenta de Vercel). Este es el paso a
> paso. Estimado: 30-45 min la primera vez.

## 0. Pre-requisitos

- [ ] Todas las migrations aplicadas en Supabase prod (0001 → 0007 + `apply-remote-storage.sql`).
- [ ] El bucket `claude-uploads` existe y es privado.
- [ ] Los 3 seed users existen (o los reales de NQS).
- [ ] **Reunión de costos con Tomás hecha** (budget Anthropic + alertas). NO mandar credenciales a empleados antes de esto.

## 1. Conectar el repo a Vercel

1. [vercel.com](https://vercel.com) → **Add New → Project** → importar `fedeturazzini/nqs-intranet`.
2. **Root Directory**: `nqs-ai-hub` (¡importante! el proyecto vive en un subdir del repo).
3. Framework: Next.js (autodetectado). Build command y output: default.

## 2. Variables de entorno (Production)

En Project Settings → Environment Variables, agregar (scope **Production**, y Preview si querés previews funcionales):

| Variable | De dónde sale |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API (publishable key) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API (service_role / secret) |
| `ANTHROPIC_API_KEY` | la que provee NQS |
| `ENCRYPTION_KEY` | **la MISMA de `.env.local`** (sino no podés desencriptar los system prompts existentes) |
| `NEXT_PUBLIC_APP_URL` | `https://hub.nqs.com.ar` (o la URL de Vercel) |
| `SLACK_WEBHOOK_URL` | el webhook de NQS |

> ⚠️ **`ENCRYPTION_KEY` tiene que ser idéntica** a la de desarrollo. Si la cambiás, los `system_prompts.content_encrypted` ya guardados quedan ilegibles y Claude deja de funcionar. Copiala tal cual de `.env.local`.

> Las variables de Storage NO necesitan nada extra — usan la URL/keys de Supabase. **No hay `PROXY_HMAC_SECRET` ni `THREE_DSKY_PROXY_URL`** (eran del approach con proxy que se descartó).

## 3. Deploy

1. **Deploy** → Vercel buildea y publica.
2. Verificá que el build pasa (typecheck + build corren en Vercel).
3. URL inicial: `nqs-ai-hub-xxx.vercel.app`.

## 4. Dominio (opcional)

Si NQS tiene `hub.nqs.com.ar`:
1. Project Settings → Domains → agregar `hub.nqs.com.ar`.
2. En el DNS del dominio, agregar el CNAME/A que Vercel indique.
3. Esperar verificación (minutos a horas). Vercel emite el SSL solo.

Si no, queda el `.vercel.app` — funciona igual, menos pro.

## 5. Smoke test en producción

- [ ] Abrir la URL → redirige a `/login`.
- [ ] Login como `tomas@nqs.test / nqs2026admin` → `/admin`.
- [ ] `/admin/users` → crear un user de prueba.
- [ ] En incógnito, login con ese user → `/hub`.
- [ ] Claude: mandar un prompt → responde.
- [ ] Claude: adjuntar una imagen → responde (verifica que Storage anda en prod).
- [ ] 3DSky: entrar al módulo, declarar consumo → descuenta.
- [ ] Pedir créditos → llega notif a Slack.
- [ ] `/admin/logs` → ver las llamadas.

## 6. Monitoring

- [ ] Vercel Analytics: Project → Analytics → Enable (gratis en Hobby).
- [ ] Vercel → Project → Settings → Notifications: activar email en deploy failures.
- [ ] Anthropic Console → Billing → setear **budget alert** (la reunión de costos).

## Rollback

Si un deploy rompe prod:
1. Vercel → Deployments → buscar el último deploy que andaba.
2. **⋯ → Promote to Production** (instantáneo, sin rebuild).

Para revertir código: `git revert <sha>` + push → Vercel redeploya solo.

## Notas técnicas

- `next build` en Next 16 usa Turbopack siempre. Probado, OK.
- Cookies `secure` se activan solo con `NODE_ENV=production` (automático en Vercel).
- Las API routes corren en Node runtime (no Edge) — necesario para el SDK de Anthropic y service_role.
- Región `gru1` (São Paulo) configurada en `vercel.json` — la más cercana a Argentina.
- Body limit: ya NO es problema. Las imágenes van directo cliente → Storage (signed URLs), el body del execute solo lleva paths.
