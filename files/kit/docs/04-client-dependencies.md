# 04 — Dependencias del cliente (NQS)

> Todo lo que NQS tiene que aportar, pagar o aprobar para que el proyecto avance. Organizado por momento del proyecto.

## Por qué este documento existe

Si llegás al día del deploy y NQS no tiene cuenta de Anthropic creada, perdiste 3 días. Si arrancás v2 sin que NQS tenga el consentimiento firmado de los empleados, no podés activar el módulo de snaps. Este documento previene esos bloqueos.

**Regla**: nunca avances una sesión si lo que el cliente tiene que aportar no está disponible. Mejor postponer 24hs que dejar código a medio hacer.

---

## 📋 RESUMEN: matriz de pedidos al cliente

| Momento | Qué pedir | Tipo | Crítico? |
|---------|-----------|------|----------|
| Antes de sesión 01 | Cuenta Supabase + credenciales | Setup | 🔴 Sí |
| Antes de sesión 01 | Cuenta Vercel | Setup | 🔴 Sí |
| Antes de sesión 01 | API key Anthropic + créditos cargados | Setup + Pago | 🔴 Sí |
| Antes de sesión 01 | Decisión sobre dominio | Decisión | 🟡 Importante |
| Antes de sesión 02 | Lista de empleados iniciales | Data | 🟡 Importante |
| Antes de sesión 02 | Contenido del prompt padre actual | Data | 🔴 Sí |
| Antes de sesión 08 | Confirmar estado del proxy 3DSky | Técnico | 🔴 Sí |
| Antes de sesión 12 | Cuenta Resend (emails) | Setup | 🟡 Importante |
| Antes de sesión 12 | Dominio configurado (DNS) | Setup | 🟡 Importante |
| Antes de sesión 12 | Confirmar quién paga Anthropic mes a mes | Comercial | 🔴 Sí |
| Antes de módulo Horarios | Política horaria definida | Decisión | 🟢 Negociable |
| Antes de módulo Aprobaciones | Webhook Slack/WhatsApp (si aplica) | Setup | 🟢 Negociable |
| Antes de módulo Seguridad | Política de privacidad firmada por empleados | Legal | 🔴 Sí |
| Antes de módulo Tools nuevas | API keys / cuentas de cada tool | Setup + Pago | 🔴 Sí |

---

## 🚀 SETUP INICIAL (antes de empezar a desarrollar)

### 1. Cuenta de Supabase

**Qué**: cuenta + nuevo proyecto creado.
**Quién la crea**: NQS, en su propia cuenta corporativa.
**Costo**: free tier alcanza para empezar. Cuando superen los límites (probablemente mes 2-3), pasa a **USD 25/mes** (plan Pro).
**Qué te tienen que dar a vos**:
- URL del proyecto (algo como `https://abcdef.supabase.co`)
- `anon key` (la pública, va al frontend)
- `service_role key` (la privada, va al backend) — esta es **crítica**, da acceso total a la DB

**Canal de envío seguro**: 1Password compartido, Bitwarden, o similar. NO por WhatsApp ni mail común.

**Documentación para NQS**:
> "Necesito que entren a supabase.com, creen una cuenta con el email corporativo de NQS (no personal de Tomás), creen un proyecto nuevo llamado 'nqs-ai-hub', y me pasen las 3 credenciales que aparecen en Project Settings → API."

### 2. Cuenta de Vercel

**Qué**: cuenta + proyecto deployable.
**Quién la crea**: NQS.
**Costo**: free tier (plan Hobby) alcanza al principio. Si necesitan analytics avanzado o más de cierto tráfico → **Pro USD 20/mes**. Realísticamente alcanza con free al menos los primeros 6 meses.
**Qué te tienen que dar a vos**:
- Invitación al proyecto Vercel como collaborator.
- O alternativamente: vos lo creás bajo tu cuenta y después transferís la ownership a NQS antes de entregar.

**Importante**: que la cuenta esté a nombre de NQS, no tuyo. Si está a tu nombre, los emails de billing van a vos, los emails de degradación de servicio van a vos, los problemas son tuyos.

### 3. API key de Anthropic (la más importante)

**Qué**: cuenta de Anthropic + API key generada + créditos cargados.
**Quién la crea**: **NQS, no vos**.

**Razón crítica de por qué NQS y no vos**:
- La tarjeta de crédito que cargás en Anthropic es la que paga el consumo mensual.
- Si la cargás vos, vos pagás y después tenés que recuperar la plata facturándole a NQS — quilombo administrativo.
- Si Anthropic detecta abuso o suspende la cuenta, es problema del titular.
- Si el consumo se dispara (un empleado hace mil llamadas), vos sos el que recibe la alerta de USD 500 en la tarjeta.

**Costo inicial**: USD 50-100 de créditos para arrancar (cubre todo el desarrollo del MVP).
**Costo recurrente en producción**: **muy variable**, entre USD 100-500/mes según uso real. Esto es lo más importante que NQS tiene que entender desde el día 1.

**Estimación realista del consumo**:
- 1 empleado activo, uso normal (10 prompts/día): ~USD 15/mes
- 1 empleado uso intenso (50 prompts/día con imágenes): ~USD 80/mes
- 10 empleados uso mixto: **USD 200-400/mes**

**Qué te tienen que dar a vos**:
- La API key (formato: `sk-ant-api03-...`)
- Confirmación de que cargaron créditos
- Acceso (de lectura al menos) a `console.anthropic.com` para que puedas debuggear

**Canal de envío**: igual que Supabase, secret manager compartido. Esta key da acceso a gastar plata, **no se manda por mail ni WhatsApp**.

### 4. Decisión sobre dominio

**Opciones**:
- **Opción A**: Usar dominio propio de NQS, ej. `hub.nqs.com.ar`.
- **Opción B**: Usar el dominio gratuito de Vercel, ej. `nqs-ai-hub.vercel.app`.

**Recomendación**: Opción A para producción (más profesional, mejor UX), B para staging.

**Si eligen A**, necesitan:
- Tener el dominio (`nqs.com.ar` lo tienen seguro, solo crean subdomain).
- Acceso al panel de DNS (probablemente NIC.ar o el registrar que usen).
- Te pasan acceso o configuran ellos los CNAME records que Vercel pida.

**Cuándo configurarlo**: idealmente antes de sesión 12, pero podés laburar con el `.vercel.app` durante todo el desarrollo y solo cambiar al final.

---

## 🔧 SETUP A MITAD DEL MVP

### 5. Lista de empleados iniciales (antes de sesión 02)

**Qué**: nombres, emails, departamentos de los empleados de NQS que van a usar la plataforma.
**Para qué**: para hacer los seeds de la DB.
**Formato sugerido**: spreadsheet con columnas: nombre completo, email, departamento, rol (admin/employee), tools a las que tiene acceso por default.

**Ojo**: alcanza con 2-3 empleados de prueba para arrancar; el resto los carga después el admin desde el panel cuando esté listo (sesión 10).

### 6. Contenido del prompt padre actual (antes de sesión 02)

**Qué**: el "cerebro" actual de Claude que está en el Project de Claude.ai.
**Quién lo da**: Tomás (admin de NQS) lo copia y te lo pasa por canal seguro.
**Para qué**: cargarlo como `system_prompt` inicial en la DB.

**Importante**: este prompt es la propiedad intelectual de NQS. Tratarlo con cuidado:
- No commitearlo al repo nunca.
- No mandarlo por mail común.
- Idealmente lo carga Tomás directamente en producción una vez deployado.

### 7. Confirmar estado del proxy 3DSky (antes de sesión 08)

**Qué**: confirmar que el proxy `3dsky.nqs.com.ar` (o como lo llamen) está operativo y NQS sabe cómo lo van a conectar a tu API.
**Quién**: NQS, o quien sea que mantenga ese proxy.
**Qué necesitás**:
- URL del proxy
- Confirmación de que el proxy puede hacer requests HTTP a tu API
- Coordinación de cómo van a configurar el HMAC secret compartido

**Si el proxy no está listo**: el módulo 3DSky en producción no va a funcionar end-to-end, aunque el código tuyo sí. Puede pasar que entregues el MVP con todo funcional menos el flujo real de descarga de 3DSky hasta que ellos terminen el proxy. **Aclará esto desde el principio**.

---

## 📦 ANTES DEL DEPLOY (sesión 12)

### 8. Cuenta de Resend (para emails)

**Qué**: cuenta + dominio verificado para envío.
**Quién la crea**: NQS.
**Costo**: free tier hasta 3000 emails/mes alcanza. Después **USD 20/mes**.
**Qué te dan**: API key.
**Necesitan también**: configurar registros DNS (SPF, DKIM) para que los emails no caigan en spam.

Es opcional para el MVP estricto, pero recomendado para notificaciones (acceso aprobado, créditos asignados, etc.). Si no lo tienen, el sistema funciona pero sin emails.

### 9. Dominio configurado (DNS)

Ya lo decidieron en el setup inicial. Acá llega el momento de hacer los apuntes DNS reales:
- CNAME o A record apuntando a Vercel.
- Vercel da las instrucciones específicas cuando agregás el dominio en su panel.

### 10. Confirmar quién paga Anthropic mes a mes (REUNIÓN OBLIGATORIA)

Esta es la conversación más importante que tenés que tener antes del lanzamiento. Te recomiendo agendar reunión específica para esto con Tomás.

**Temas a cubrir**:
- Costo estimado mensual (USD 100-500 según uso).
- Cómo van a monitorear el consumo (panel admin + console.anthropic.com).
- Qué pasa si superan presupuesto: ¿pausan empleados? ¿agregan créditos automáticamente?
- Quién es el dueño de la tarjeta de crédito en Anthropic.
- Setear un budget alert en Anthropic (ej. avisar cuando lleguen a USD 200 en un mes).

**Por qué importa**: no querés que en 3 meses NQS te diga "tu plataforma nos cobró USD 800 este mes y no entendemos por qué". Tienen que entender que el consumo lo generan **sus empleados**, no la plataforma. Tu rol es proveer visibilidad (que el módulo PA05 hace), no controlar el gasto.

---

## 🔮 MÓDULOS FUTUROS (v2)

### Antes del módulo Horarios

**Qué pedir**:
- Decisión sobre qué horarios quieren imponer (¿9-18 lun-vie? ¿libre? ¿por departamento?).
- ¿Quieren accesos temporales (ej. acceso a Weavy por 24hs)?

**No requiere pago adicional**.

### Antes del módulo Aprobaciones

**Qué pedir**:
- ¿Quieren notificaciones por Slack? Si sí, acceso al workspace para crear app.
- ¿O por WhatsApp? Si sí, definir cuenta Twilio (USD 0.005 por mensaje aprox).
- ¿Aprueba solo Tomás o varios admins?

### Antes del módulo Seguridad / Shield

**ESTE ES EL MÁS DELICADO**. Tiene componente legal.

**Qué pedir antes de implementar**:
1. **Política de privacidad** que mencione explícitamente:
   - Que se loguean las interacciones con Claude.
   - Que se pueden capturar pantallas en eventos de seguridad.
   - Qué se hace con esos datos y cuánto tiempo se guardan.
2. **Consentimiento firmado de cada empleado** que va a usar la plataforma.
3. **Decisión sobre quién accede a snaps/logs sensibles**: ¿solo Tomás? ¿RRHH también?
4. **Confirmar política de retención**: 90 días por default, pero puede variar.

**Sin estos papeles, no implementes este módulo**. Riesgo legal real.

### Antes de cada módulo de Tools nueva

**Por cada tool (Weavy, Kling, Runway, ElevenLabs, Highsfield)**:
- Cuenta corporativa de NQS en esa tool.
- API key.
- Decisión de quién paga (mismo tema que Anthropic).
- Costos esperados (cada tool tiene su pricing, varía mucho).

**Costos referenciales** (verificar al momento de implementar):
- Weavy: USD 30-100/mes según plan
- Kling: USD por segundo de video, ~USD 0.50-1.00 por video corto
- Runway: USD 15-95/mes plan + uso adicional
- ElevenLabs: USD 5-330/mes según volumen
- Highsfield: variable, en beta

---

## 💰 COSTOS RECURRENTES TOTALES (visión cliente)

Esta es la tabla que tenés que poner en la propuesta y mostrar a NQS:

### MVP en producción (mes 1-2)

| Servicio | Costo |
|----------|-------|
| Supabase free tier | USD 0 |
| Vercel Hobby | USD 0 |
| Anthropic API | USD 100-300 (variable) |
| Resend free | USD 0 |
| Dominio | ~USD 15/año |
| **Total** | **~USD 100-300/mes** |

### MVP en producción consolidado (mes 3+)

| Servicio | Costo |
|----------|-------|
| Supabase Pro | USD 25 |
| Vercel (depende uso) | USD 0-20 |
| Anthropic API | USD 200-500 |
| Resend | USD 0-20 |
| Dominio | USD 1.25 (prorrateado) |
| **Total** | **~USD 250-600/mes** |

### Con v2 completo

Sumar por cada tool integrada según su pricing. Realísticamente la plataforma completa con todas las tools en producción puede costar **USD 600-1500/mes** a NQS.

**Tu rol**: dejarles claro este número. **No es tu plata, es la de ellos**, pero tienen que estar preparados.

---

## 🤝 CANAL SEGURO PARA INTERCAMBIAR SECRETOS

Para todos los API keys, credenciales y secretos:

**Opciones recomendadas**:
1. **1Password compartido** (mejor opción). Costo: USD 8/mes por usuario, o el plan business.
2. **Bitwarden** (gratis para uso básico).
3. **Doppler** o **Infisical** (manejo de secrets profesional, gratis hasta cierto uso).

**Opciones NO aceptables**:
- WhatsApp / Telegram / Signal en chat regular.
- Email común.
- Drive / Dropbox / Notion sin encriptación adicional.
- Slack DM o canal privado.

**Acordá con NQS al inicio cuál van a usar**. No empieces sin esto resuelto.

---

## ✅ CHECKLIST FINAL ANTES DE ARRANCAR

Antes de ejecutar `prompts/mvp/01-setup.md`, validá:

- [ ] NQS tiene cuenta de Supabase + proyecto creado
- [ ] Tenés las 3 credenciales de Supabase en un canal seguro
- [ ] NQS tiene cuenta de Vercel
- [ ] NQS creó cuenta de Anthropic
- [ ] NQS cargó USD 50-100 de créditos en Anthropic
- [ ] Tenés la API key de Anthropic en canal seguro
- [ ] Hay decisión sobre el dominio
- [ ] Acordaron canal seguro para intercambiar secretos
- [ ] NQS entiende que Anthropic factura mensual variable (USD 100-500)
- [ ] Tenés acceso al diseño del cliente (lo tenés en el kit)

Si alguno de estos está pendiente, **no arranques**. Esperá. Mejor un día más de espera que dos días de bloqueo después.
