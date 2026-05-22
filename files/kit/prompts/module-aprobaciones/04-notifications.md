# Módulo Aprobaciones — Sesión A04: Notificaciones avanzadas

## ⚠️ ANTES DE EMPEZAR — PEDIRLE AL CLIENTE

### Lo que NQS tiene que aportar:

- [ ] **Decisión sobre canales**: Slack o WhatsApp (o ambos)
- [ ] **Si Slack**:
  - Acceso al workspace de NQS para crear la app
  - Decisión sobre canal específico (#admin, #general, privado a Tomás)
  - Permisos para que admins puedan accionar desde Slack (aprobar/rechazar)
- [ ] **Si WhatsApp**:
  - Cuenta Twilio creada (USD 0.005/mensaje, ~USD 10-30/mes para uso normal)
  - Número de WhatsApp Business verificado (o sandbox para testing)
  - Lista de números a notificar

### Mensaje sugerido para mandarle al cliente:

> Ver template **"4.2 — Activar módulo Aprobaciones"** en `docs/05-client-comms-template.md`.

### Por qué importa:

- Sin canal externo, las solicitudes solo se ven entrando al panel admin. Aceptable pero menos ágil.
- Los costos de Twilio son tan bajos que no es bloqueante.

---

## Objetivo

Integración con Slack y WhatsApp para notificaciones en tiempo real + sistema de preferencias del admin.

**Duración**: 2 horas

---

## PROMPT

```
Sesión A04 del módulo Aprobaciones. Última del módulo.

ESTADO ACTUAL:
Leé `progress-a03.md`.

OBJETIVO:
Notificaciones en tiempo real vía Slack/WhatsApp + UI de preferencias.

PASOS:

1. Slack integration (si NQS usa Slack):
   - Configurar Slack App con webhook entrante.
   - `npm install @slack/webhook`.
   - Variables env: `SLACK_WEBHOOK_URL`.
   - Función `notifySlack({ text, blocks, channel })` en `src/lib/notifications/slack.ts`.

2. WhatsApp integration (si NQS prefiere):
   - Opción 1: WhatsApp Business API (Meta).
   - Opción 2: Twilio (más simple).
   - Recomendación: Twilio si no quieren manejar Meta directo.
   - `npm install twilio`.
   - Variables env: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`.
   - Función `notifyWhatsApp({ to, message, template })`.

3. Eventos que disparan notificaciones:
   - Nueva solicitud → notif al admin.
   - Solicitud aprobada/rechazada → notif al user.
   - Acceso expirado → notif al user (24hs antes).
   - Solicitud pending hace >24hs → notif al admin como recordatorio.
   - Pool de créditos al 80% → notif al admin.

4. UI de preferencias en `src/app/(dashboard)/admin/notifications/page.tsx`:
   - Matriz de eventos × canales.
   - Cada evento puede tener: ☐ email ☐ slack ☐ whatsapp.
   - Configuración por evento de:
     - Email recipient (puede ser distinto al del admin).
     - Slack channel (#admin, #general, etc.).
     - WhatsApp phone.

5. Sistema de webhooks entrantes (para responder desde Slack):
   - Endpoint `src/app/api/webhooks/slack/route.ts`.
   - Recibe interactions de botones Slack.
   - Si admin clickea "aprobar" desde Slack → llama internamente al endpoint approve.
   - Verifica firma del request con SLACK_SIGNING_SECRET.

6. Template Slack para nueva solicitud:
   ```
   🔔 Nueva solicitud de acceso
   Usuario: Sofía Romero
   Tool: Weavy
   Motivo: "Necesito acceso para el pitch de Manhattan"
   Duración: 48 horas
   
   [✅ Aprobar]  [❌ Rechazar]  [👤 Ver perfil]
   ```

7. Throttling:
   - No mandar más de 1 email por minuto por usuario.
   - No spamear Slack si hay múltiples eventos seguidos.

8. Test manual:
   - Configurar Slack webhook.
   - Sofia hace solicitud.
   - Tomas recibe Slack notif.
   - Click "aprobar" desde Slack → solicitud aprobada en la app.

9. Commit.

AL FINAL:
`progress-a04.md`.
Módulo Aprobaciones COMPLETO.
```

---

## VALIDACIÓN

- [ ] Slack notifs funcionan
- [ ] WhatsApp notifs funcionan (si activo)
- [ ] UI de preferencias funcional
- [ ] Acciones desde Slack funcionan
- [ ] Throttling evita spam
