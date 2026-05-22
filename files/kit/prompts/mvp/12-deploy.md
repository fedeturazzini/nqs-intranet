# Sesión 12 — Tests, deploy y entrega

## ⚠️ ANTES DE EMPEZAR — PEDIRLE AL CLIENTE

### Lo que NQS tiene que aportar:

- [ ] **Cuenta de Resend** + dominio verificado (opcional pero recomendado para emails)
- [ ] **DNS del dominio configurado** (`hub.nqs.com.ar` o el que hayan decidido)
- [ ] **Reunión agendada** con Tomás (1 hora) para charlar:
  - Budget mensual esperado en Anthropic
  - Quién paga qué y cómo monitorear consumo
  - Qué pasa si superan presupuesto
  - Setear budget alerts en Anthropic
- [ ] **Lista de empleados completa** para mandarles el mail de bienvenida

### Mensajes sugeridos para mandarle al cliente:

> Ver template **"2.3 — Antes de sesión 12"** y **"3. ENTREGA DEL MVP"** en `docs/05-client-comms-template.md`.

### Por qué importa:

- Sin Resend, el sistema funciona pero sin emails (notificaciones, etc). Postergable.
- Sin DNS, deployás en `.vercel.app`. Funciona pero menos pro. Postergable.
- **La reunión de costos NO es postergable**. Es la conversación más importante antes del lanzamiento. Sin esto, en 3 meses NQS te va a culpar de "tu plataforma nos cobró X".

**Crítico: la reunión de costos sí o sí antes de mandarle credenciales a los empleados.**

---

## Objetivo

Cerrar el MVP: tests críticos pasando, deploy a producción en Vercel, documentación para NQS, capacitación inicial al admin.

**Duración**: 3 horas
**Output**: hub.nqs.com.ar funcionando en producción + manual de usuario + manual de admin.

---

## PROMPT

```
Sesión 12 del NQS AI Hub. ÚLTIMA SESIÓN DEL MVP.

ESTADO ACTUAL:
Leé `progress-11.md`.

OBJETIVO:
Cerrar el MVP completo: tests críticos, deploy, docs.

PASOS:

PARTE A — TESTS CRÍTICOS

1. Configurar Vitest si no está:
   - `npm install -D vitest @vitejs/plugin-react @testing-library/react jsdom`
   - Crear `vitest.config.ts`.
   - Agregar scripts: `test`, `test:watch`, `test:coverage`.

2. Tests en `src/lib/anthropic/client.test.ts`:
   - Mock del SDK de Anthropic.
   - Test: llamada exitosa devuelve texto.
   - Test: error de API se propaga como Result.error.
   - Test: retry funciona con backoff.

3. Tests en `src/lib/middleware/permissions.test.ts`:
   - Test: user activo + acceso activo → allowed.
   - Test: user sin acceso → no_access.
   - Test: user con tool de créditos pero credits=0 → no_credits.
   - Test: admin tiene acceso a todo.
   - Test: user inactivo → not_authenticated.

4. Tests en `src/lib/adapters/three-dsky.test.ts`:
   - Test: consumeCredit descuenta correctamente.
   - Test: consumeCredit con insufficient_credits falla.
   - Test: race condition (2 requests simultáneos) → solo uno pasa.
   - Test: rollback en error en medio de la transacción.

5. Tests en `src/lib/utils/crypto.test.ts`:
   - Test: encrypt + decrypt round-trip.
   - Test: tamper detection (modificar ciphertext rompe decrypt).

6. CI con GitHub Actions:
   - Crear `.github/workflows/ci.yml`.
   - Corre lint + tests en cada PR a main.
   - Si pasan tests, permite merge.

PARTE B — DEPLOY

7. Configurar Vercel:
   - Conectar repo de GitHub a Vercel.
   - Configurar variables de entorno en Vercel:
     - `NEXT_PUBLIC_SUPABASE_URL`
     - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
     - `SUPABASE_SERVICE_ROLE_KEY`
     - `ANTHROPIC_API_KEY`
     - `ENCRYPTION_KEY`
     - `PROXY_HMAC_SECRET`
     - `THREE_DSKY_PROXY_URL`
     - `NEXT_PUBLIC_APP_URL`
   - Asegurarse que los secrets están en "Production" only (no en Preview).

8. Configurar dominio:
   - Si el cliente ya tiene `hub.nqs.com.ar` apuntando, configurar en Vercel.
   - Si no, dejar el `*.vercel.app` y avisarle al cliente.

9. Smoke tests en producción:
   - Loguearse como Tomas.
   - Crear un usuario nuevo.
   - Loguearse con ese usuario en incógnito.
   - Probar Claude end-to-end.
   - Probar 3DSky (si el proxy del cliente está listo).
   - Verificar logs.

10. Monitoring básico:
    - Vercel Analytics (gratis con plan Hobby).
    - Configurar email alerts para errores 500.

PARTE C — DOCUMENTACIÓN

11. Crear `docs/admin-guide.md`:
    - Cómo crear/editar usuarios.
    - Cómo gestionar accesos a tools.
    - Cómo editar el prompt padre.
    - Cómo gestionar créditos 3DSky.
    - Cómo leer los logs.
    - Cómo cambiar la API key de Anthropic si rota.
    - Capturas de pantalla de cada flujo.

12. Crear `docs/user-guide.md`:
    - Cómo loguearse.
    - Cómo usar el hub.
    - Cómo usar Claude (con tip: "tu prompt simple es procesado por el cerebro NQS").
    - Cómo usar 3DSky.
    - Cómo solicitar más créditos.
    - FAQ.

13. Crear `docs/dev-handoff.md`:
    - Arquitectura del proyecto.
    - Cómo agregar una nueva tool (referenciar `kit/reference/tool-adapter-pattern.ts`).
    - Cómo agregar una nueva regla al middleware de permisos.
    - Cómo correr local.
    - Stack y decisiones técnicas.
    - Variables de entorno.
    - Cómo hacer rollback si algo se rompe.

14. Crear `docs/runbooks.md`:
    - Qué hacer si Claude no responde.
    - Qué hacer si los créditos se descuentan mal.
    - Cómo restaurar versión anterior del prompt.
    - Cómo verificar que la API key de Anthropic está activa.
    - Cómo reseteo el password de un user.

PARTE D — CAPACITACIÓN

15. Preparar una reunión de 1 hora con Tomás (admin de NQS):
    - Demo en vivo de la plataforma.
    - Walkthrough del admin panel.
    - Walkthrough de Claude desde un empleado.
    - Q&A.
    - Dejar grabada la reunión si es posible.

16. Mandar un email de bienvenida a todos los empleados de NQS:
    - URL de la plataforma.
    - Sus credenciales iniciales.
    - Link a `user-guide.md`.
    - Recordatorio: si tienen problemas, escribir a Tomás.

PARTE E — CIERRE

17. Crear `CHANGELOG.md` con la versión 1.0.0:
    - Features incluidas.
    - Issues conocidos.
    - Roadmap.

18. Crear issue tracker (Linear/GitHub Issues) con backlog inicial:
    - Las features del roadmap futuro (módulos horarios, aprobaciones, etc.).
    - Cualquier bug menor que quedó pendiente.

19. Tag la versión: `git tag v1.0.0`.

20. Commit final + push.

AL FINAL:
`progress-12.md` con:
- Tests pasando (coverage > 70% en archivos críticos)
- Deploy exitoso (URL)
- Docs entregadas
- Capacitación agendada o realizada
- Estado: MVP ENTREGADO

🎉 PROYECTO MVP TERMINADO.

PRÓXIMO PASO:
Esperar feedback del cliente. Cuando apruebe la v2, arrancar con los módulos de `prompts/module-*/`.
```

---

## VALIDACIÓN FINAL DEL MVP

- [ ] Tests pasan (`npm test`)
- [ ] Deploy en producción funciona
- [ ] hub.nqs.com.ar (o URL de Vercel) accesible
- [ ] Admin guide entregada al cliente
- [ ] User guide entregada al cliente
- [ ] Tomás capacitado
- [ ] Empleados notificados
- [ ] Tag v1.0.0 creado
- [ ] Backup completo de la DB hecho

## 🎉 FIN DEL MVP

A partir de acá, los módulos futuros van en `prompts/module-*/`. No los ejecutes hasta que NQS te apruebe la v2.

Sugerido como roadmap:
1. Módulo horarios (corto, alto impacto operativo)
2. Módulo aprobaciones (consolida el flujo de "solicitar acceso")
3. Módulo panel admin completo (visibilidad para directores)
4. Más tools (Weavy, Kling, etc.) según prioridad del cliente
5. Módulo seguridad/shield (cuando empiecen a pasar cosas raras)
