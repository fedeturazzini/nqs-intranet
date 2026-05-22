# Módulo Horarios — Sesión H03: Caducidad + notificaciones

## ⚠️ ANTES DE EMPEZAR — PEDIRLE AL CLIENTE

### Lo que NQS tiene que aportar (si no se hizo en sesión 12 MVP):

- [ ] **Cuenta de Resend** + dominio verificado para envío de emails
- [ ] **Decisión sobre Slack**: ¿NQS usa Slack? Si sí, crear app + webhook
  - Costo: gratuito hasta cierto volumen
- [ ] **Decisión sobre WhatsApp** (alternativa o complemento):
  - Cuenta Twilio (USD 0.005/mensaje, despreciable para alertas operativas)

### Por qué importa:

- Sin Resend, los emails de "tu acceso expiró" no se mandan. El cron expira accesos igual, pero el usuario se entera cuando intenta usar la tool.
- Slack/WhatsApp es opcional.

---

## Objetivo

Sistema de accesos temporales con caducidad automática + notificaciones (email + Slack) cuando algo pasa.

**Duración**: 2 horas

---

## PROMPT

```
Sesión H03 del módulo Horarios.

ESTADO ACTUAL:
Leé `progress-h02.md`.

OBJETIVO:
- Accesos temporales con expires_at funcional.
- Notificaciones automáticas (email mediante Resend, Slack opcional).
- UI para que el admin grant acceso temporal ("dale acceso a Claude hasta el viernes").

PASOS:

1. Configurar Resend (servicio de email):
   - Crear cuenta en resend.com.
   - `npm install resend`.
   - Variable env: `RESEND_API_KEY`.
   - Dominio: configurar `mail.nqs.com.ar` para envío (o usar sandbox).

2. Crear `src/lib/notifications/email.ts`:
   - Función `sendEmail({ to, subject, body, template })`.
   - Templates en `src/lib/notifications/templates/`:
     - `access-expired.tsx` (React Email).
     - `access-granted.tsx`.
     - `access-expiring-soon.tsx` (24hs antes de expirar).

3. Mejorar el cron `/api/cron/expire-access`:
   - Además de expirar, mandar email al user.
   - Loguear el envío.

4. Crear nuevo cron `/api/cron/expiring-soon`:
   - Corre 1 vez al día.
   - Busca accesos que expiran en las próximas 24hs.
   - Manda email de aviso.

5. En `vercel.json`:
```json
{
  "crons": [
    { "path": "/api/cron/expire-access", "schedule": "*/5 * * * *" },
    { "path": "/api/cron/expiring-soon", "schedule": "0 9 * * *" }
  ]
}
```

6. UI en admin: dar acceso temporal:
   - En el `UserDetailModal` (sesión 10 del MVP), agregar opción:
     - Switch "acceso temporal" cuando se otorga acceso a una tool.
     - Si está on, aparece datepicker para `expires_at`.
   - Al guardar, crea el tool_access con expires_at seteado.

7. UI en hub: mostrar acceso por expirar:
   - En cada ToolCard, si access.expires_at está en las próximas 48hs, mostrar warning visual + tooltip "expira el [fecha]".

8. Notificaciones por Slack (opcional, si NQS lo pide):
   - `npm install @slack/webhook`.
   - Variable env: `SLACK_WEBHOOK_URL`.
   - Función `sendSlackMessage({ channel, text, blocks })`.
   - Trigger: accesos expirados, créditos al 80%, prompt padre modificado.

9. Página `src/app/(dashboard)/admin/notifications/page.tsx`:
   - Settings de notificaciones del admin: cuáles eventos quiere recibir, dónde (email o Slack).

10. Tests:
    - Test de templates de email (snapshot).
    - Test del cron expire-access con mock de DB.

11. Commit.

AL FINAL:
`progress-h03.md`.
Módulo Horarios COMPLETO.
```

---

## VALIDACIÓN

- [ ] Acceso temporal con expires_at funciona
- [ ] Cron expira accesos correctamente
- [ ] Email se manda al user
- [ ] UI admin permite asignar acceso temporal
- [ ] Slack notifs funcionan si están configuradas
