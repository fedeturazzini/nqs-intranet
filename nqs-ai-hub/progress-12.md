# Progress 12 — Tests, deploy prep y docs · CIERRE DEL MVP

**Fecha**: 2026-05-28
**Duración real**: ~3.5 horas
**Sesión anterior**: `progress-15.md`
**Estado**: **MVP CODE-COMPLETE** — falta la acción de deploy (Fede) + capacitación.

> Última sesión del MVP. Incluyó un feature grande extra que no estaba en el prompt original: migrar las imágenes de Claude a Supabase Storage (la opción que elegiste para resolver el body-size de Vercel).

## Qué se hizo

### Feature extra: imágenes de Claude → Supabase Storage (`4bc4906`)
Reemplazó el envío base64 (que chocaba con el límite de 4.5MB de Vercel) por upload directo cliente → Storage. Bonus: resuelve el historial visual.
- Bucket privado `claude-uploads` + RLS por subfolder (`apply-remote-storage.sql`).
- Cliente valida (≤10MB, ≤5) → pide signed upload URLs → sube directo (no pasa por Vercel) → manda paths al execute.
- Backend valida ownership, genera signed download URLs (1h) → Anthropic con `source:{type:"url"}`.
- Paths persistidos en `claude_messages.images`; render histórico firma URLs on-demand.
- Verificado E2E: upload, signed URL accesible, execute con imagen real (Claude la procesa), render histórico.

### Parte A — Tests + CI (`6cbb287`)
- De 21 → **57 tests** (7 archivos). Nuevos: crypto (9), permissions (13), three-dsky (7), anthropic-client (6).
- Coverage de críticos: crypto 93% · anthropic 96% · permissions 91% · auth 95% · slack 90% · schedule 100%.
- CI GitHub Actions (`.github/workflows/ci.yml`): typecheck + test + build en push/PR a main, working-directory `nqs-ai-hub/`.
- Race condition del RPC de créditos: ya existía como `npm run db:race-test` (contra DB real).

### Parte C — Documentación (este commit)
- `docs/admin-guide.md` — gestión completa del panel (users, accesos, prompt+memoria, créditos, solicitudes, logs, tareas operativas).
- `docs/user-guide.md` — uso para el equipo (hub, Claude, 3DSky, pedir acceso, FAQ).
- `docs/dev-handoff.md` — stack, arquitectura, cómo correr, ToolAdapter pattern, migrations, decisiones, rollback.
- `docs/runbooks.md` — qué hacer cuando algo se rompe (Claude caído, créditos mal, restaurar prompt, verificar API key, reset password, Slack, rollback, backup).
- `docs/deploy-checklist.md` — paso a paso del deploy a Vercel.

### Parte B — Deploy (preparado, lo ejecuta Fede)
- `vercel.json` ya estaba (framework nextjs, región gru1, root nqs-ai-hub).
- Checklist completo en `docs/deploy-checklist.md`.
- **El deploy real requiere tu cuenta de Vercel** — no lo puedo ejecutar yo.

### Parte E — Cierre
- `CHANGELOG.md` v1.0.0 con features, issues conocidos, roadmap.
- Tag `v1.0.0`.

## Lo que NO se hizo (requiere acción tuya / de NQS)

Estas partes del prompt no son código — las dejo como tu checklist:

- [ ] **Deploy a Vercel** — conectar repo (root `nqs-ai-hub`), pegar env vars, deploy. Guía en `docs/deploy-checklist.md`.
- [ ] **DNS** `hub.nqs.com.ar` (o queda `.vercel.app`).
- [ ] **Reunión de costos con Tomás** (budget Anthropic + alertas). El prompt la marca como NO postergable, antes de mandar credenciales.
- [ ] **Capacitación a Tomás** (demo + walkthrough). Las guías ya están escritas como apoyo.
- [ ] **Email de bienvenida a empleados** (URL + credenciales + link a user-guide).
- [ ] **Backup manual de la DB** antes de ir a prod.
- [ ] **Resend / emails** — opcional, postergable.
- [ ] **Issue tracker / backlog** — el roadmap está en el CHANGELOG; pasarlo a GitHub Issues/Linear si querés.

> Aclaración del prompt original: `PROXY_HMAC_SECRET` y `THREE_DSKY_PROXY_URL` **no van** — eran del approach con proxy que se descartó en sesión 08.

## Tests pasando

```
npm test            → 57/57 (7 archivos)
npm run typecheck   → OK
npm run build       → OK (con env placeholders, como hará el CI)
npm run test:coverage → críticos > 70%
```

## Deploy

Pendiente de tu acción. Todo preparado en `docs/deploy-checklist.md`. URL será `hub.nqs.com.ar` o `nqs-ai-hub-xxx.vercel.app`.

## Docs entregadas

`docs/admin-guide.md` · `docs/user-guide.md` · `docs/dev-handoff.md` · `docs/runbooks.md` · `docs/deploy-checklist.md` · `CHANGELOG.md`.

> Las guías no tienen capturas de pantalla (no las pude generar). El contenido textual cubre cada flujo; las capturas se pueden agregar después tomándolas de la plataforma ya deployada.

## Estado del MVP

**CODE-COMPLETE.** Todo el código, tests, CI y docs están listos y commiteados. Tag `v1.0.0`. Falta solo la operación de deploy + la parte humana (reunión de costos, capacitación, emails) que dependen de vos y de NQS.

## Próximo paso

1. Deploy siguiendo `docs/deploy-checklist.md`.
2. Reunión de costos con Tomás (CRÍTICA antes de dar credenciales).
3. Smoke test en prod.
4. Capacitación + emails.
5. Esperar feedback. Para la v2, los módulos van en `prompts/module-*/`.

🎉 **MVP terminado.**
