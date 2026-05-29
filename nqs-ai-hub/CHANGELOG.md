# Changelog — NQS AI Hub

Formato basado en [Keep a Changelog](https://keepachangelog.com/).

## [1.0.0] — 2026-05-28 · MVP

Primera versión del NQS AI Hub: plataforma interna que centraliza el
acceso al stack de IA del estudio y protege el "cerebro" (prompt padre)
en el backend.

### Features

**Auth & acceso**
- Login con Supabase Auth (email/password), roles `admin` / `employee`.
- Cookies httpOnly, proxy de guardia, sesión validada server-side por request.

**Hub**
- Grid de 7 tools con estados (active / locked / pending / coming_soon / créditos).
- Filtros, búsqueda, vista grid/lista, reorden por drag-and-drop (persistido local).
- Light/dark mode con toggle persistente por usuario.

**Claude** (operativa)
- Wrapper sobre la API de Anthropic. El prompt padre vive encriptado (AES-256-GCM) en el backend y NUNCA llega al cliente.
- System prompt + memoria del workspace editables por separado, con versionado.
- Selector de modelo (Haiku / Sonnet / Opus).
- Chat multimodal: imágenes vía Supabase Storage (signed URLs), historial visual.
- Conversaciones persistentes, copy-to-clipboard, logging de tokens + modelo por llamada.

**3DSky** (operativa)
- Iframe directo + declaración manual de consumo al salir.
- Sistema de créditos con descuento atómico (RPC con lock de fila).
- Control de acceso por empleado (toggle on/off) y horarios por día.
- Solicitud de más créditos y de acceso excepcional fuera de horario.

**Panel admin**
- ABM de usuarios (crear/editar/baja).
- Editor del prompt padre + memoria, con historial de versiones.
- Accesos & horarios por usuario/tool.
- Pool de créditos 3DSky: registrar compras, asignar con +/−, historial con export CSV.
- Solicitudes (créditos / acceso / excepcional) con aprobar/rechazar.
- Logs combinados (usage / module sessions / credit transactions) con filtros y URL state.

**Integraciones**
- Slack: notificaciones de solicitudes y resoluciones (graceful degradation si no está configurado).

**Arquitectura escalable**
- Patrón ToolAdapter: sumar una tool = un archivo nuevo.
- Middleware de permisos centralizado: sumar una regla = un check más.
- Schema de DB completo para todo el roadmap (tablas futuras ya creadas).
- Componentes UI agnósticos de tool.

### Tests
- 57 tests (Vitest). Coverage en críticos: crypto 93%, anthropic 96%, permissions 91%, auth 95%, slack 90%, schedule 100%.
- Test de race condition del consumo de créditos contra DB real.
- CI (GitHub Actions): typecheck + tests + build en cada push/PR a main.

### Issues conocidos
- **Reset de password**: hoy es desde el dashboard de Supabase (self-service es roadmap).
- **Acceso excepcional**: al aprobarse se setea `expires_at`; la validación es at-runtime, pero no hay un cron que limpie `status='expired'` ni que restaure el schedule original al vencer. Manual por ahora.
- **Mobile**: la plataforma es desktop-first. Drag-and-drop del hub y el iframe de 3DSky no funcionan bien en touch.
- **Overview admin sin gráficos**: son números + logs, no dashboards.
- **`db.ts` editado a mano** en algunas migrations (faltaba PAT de Supabase para regenerar). Funcionalmente equivalente al autogen.

### Roadmap (post-MVP)
1. Módulo horarios completo (caducidad automática, cron de limpieza).
2. Módulo aprobaciones (consolida el flujo de solicitudes).
3. Panel admin completo (gráficos, exportación, visibilidad para directores).
4. Más tools: Weavy, Kling, Runway, ElevenLabs, Highsfield.
5. Módulo seguridad/shield (detección de prompt injection).
6. Reset de password self-service.
7. Soporte mobile.

[1.0.0]: https://github.com/fedeturazzini/nqs-intranet/releases/tag/v1.0.0
