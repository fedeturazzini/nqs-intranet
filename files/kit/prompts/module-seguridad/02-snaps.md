# Módulo Seguridad — Sesión S02: Capturas automáticas (Snaps)

## 🚨 ANTES DE EMPEZAR — PEDIRLE AL CLIENTE (CRÍTICO LEGAL)

### Lo que NQS DEBE aportar antes de implementar (sin esto, NO arranques):

- [ ] **Política de privacidad escrita y publicada** que mencione explícitamente las capturas automáticas
- [ ] **Consentimiento firmado por CADA empleado** que va a usar la plataforma:
  - El consentimiento debe ser explícito sobre capturas en eventos de seguridad
  - Tiene que estar fechado y firmado individualmente
  - Recomendado: revisarlo con un abogado de NQS antes
- [ ] **Definición de política de retención**: 
  - Default 90 días, pero pueden definir otro
  - Política clara de quién accede a snaps y por qué
- [ ] **Decisión sobre permisos**:
  - ¿Solo Tomás ve snaps?
  - ¿RRHH tiene acceso?
  - ¿Hay alguien de legales que debe aprobar antes de revisarlos?

### Mensaje sugerido para mandarle al cliente:

> Ver template **"4.3 — Activar módulo Seguridad"** en `docs/05-client-comms-template.md`.

### Por qué es CRÍTICO:

⚠️ **Capturas automáticas de pantalla a empleados, sin consentimiento explícito, es ilegal en Argentina** (Ley 25.326 de Protección de Datos Personales) y en la mayoría de jurisdicciones.

- Si NQS implementa esto sin los papeles → demanda potencial de empleados.
- Si vos lo construís sin verificar los papeles → riesgo de complicidad profesional.

**Reglas estrictas**:
1. **NO arranques esta sesión sin confirmación documental de que NQS tiene los consentimientos.**
2. **Pedile a Tomás screenshot del consentimiento firmado de al menos 1 empleado como prueba.**
3. **Si NQS quiere implementar SIN consentimientos, rechazá el módulo.** Documentá la negativa por mail.

Esta es la única sesión del kit donde mi recomendación es: **decir que no si no hay papeles**, sin importar la plata involucrada.

---

## Objetivo

Sistema de capturas de pantalla automáticas en ciertos eventos sospechosos. **Con consentimiento expreso del usuario** (importante legalmente).

**Duración**: 3 horas

---

## CONSIDERACIONES LEGALES

⚠️ **IMPORTANTE**: capturas automáticas de pantalla son sensibles legalmente. Antes de implementar, validar con el cliente:

1. ¿Tienen política de privacidad clara que mencione esto?
2. ¿Los empleados firmaron consentimiento?
3. ¿Solo se capturan eventos puntuales o todo el tiempo?
4. ¿Quién accede a las capturas y con qué política de retención?

Recomendación: capturas SOLO de eventos específicos (intento detectado por reglas, no continuo) y con notificación clara al usuario.

---

## PROMPT

```
Sesión S02 del módulo Seguridad/Shield.

ESTADO ACTUAL:
Leé `progress-s01.md`.

OBJETIVO:
Sistema de capturas automáticas en eventos sospechosos.

PRE-REQUISITO:
NQS debe confirmar que tiene política y consentimiento de empleados antes de activar esto.

PASOS:

1. Browser Extension (necesario para captura real):
   - Crear extensión Chrome/Edge en `extension/` (carpeta separada del proyecto principal).
   - Manifest V3.
   - Permissions: `activeTab`, `tabCapture`, `storage`.
   - Background service worker que escucha mensajes de la app web.

2. Comunicación app → extensión:
   - La app web manda postMessage al content script de la extensión.
   - Trigger: cuando `securityEngine.scanContent` detecta event high.
   - Mensaje: `{ type: 'capture_screenshot', userId, eventId }`.

3. La extensión captura:
   - `chrome.tabs.captureVisibleTab()` → base64 PNG.
   - POST a `/api/snaps/upload` con la captura + metadata.

4. Endpoint `src/app/api/snaps/upload/route.ts`:
   - Recibe captura.
   - Sube a Supabase Storage en bucket `snapshots/` privado.
   - Inserta en tabla `screenshots`.
   - Asocia con el `security_event` que lo disparó.

5. UI consentimiento:
   - Cuando un user loguea por primera vez, modal: "NQS puede capturar pantallas en eventos de seguridad. Esto se hace por X motivos. [Acepto] [No acepto]".
   - Si rechaza, no se hacen capturas pero se puede dejar usar la plataforma (decisión del cliente).
   - Persistir consentimiento en `users.consents` (jsonb).

6. Si NO está disponible la extensión:
   - Fallback: notificar al admin sin captura.
   - Mensaje en UI cuando un user inicia: "Para activar captura de pantalla, instalá la extensión NQS Shield" (link).

7. Política de retención:
   - Snaps se borran automáticamente a los 90 días.
   - Cron diario `/api/cron/clean-snaps` que ejecuta DELETE FROM screenshots WHERE created_at < NOW() - INTERVAL '90 days'.

8. Encriptación de snaps:
   - Los snaps en Storage están encriptados en reposo (Supabase lo hace).
   - URL de acceso firmado con expiración corta (15 min).

9. Test manual:
   - Instalar extensión local.
   - Trigger una regla (ej. SP-PROT).
   - Verificar que se sube captura.
   - Como admin, ver el snap en /admin/shield (próxima sesión).

10. Documentación:
    - `docs/security/snap-policy.md` con política de uso.
    - `docs/security/extension-install.md` con instrucciones para empleados.

11. Commit.

AL FINAL:
`progress-s02.md`.
Próximo: `prompts/module-seguridad/03-shield-ui.md`.
```

---

## VALIDACIÓN

- [ ] Extension funciona
- [ ] Capturas se suben correctamente
- [ ] Consentimiento se respeta
- [ ] Retention policy funciona
