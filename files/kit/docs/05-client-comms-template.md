# 05 — Templates de comunicación con el cliente

> Mensajes pre-redactados que le mandás a NQS (Tomás) en momentos clave del proyecto. Copiá, ajustá tono, mandá. Te ahorra pensarlo cada vez.

## Cómo usar estos templates

Cada template está pensado para un momento específico del proyecto. Tienen:
- **Cuándo mandarlo**
- **Por dónde** (WhatsApp casual / email formal)
- **Contenido**

Ajustá el tono según tu relación con Tomás (informal en general, formal cuando se trata de plata).

---

## 📧 1. ANTES DE ARRANCAR (kick-off)

**Cuándo**: una vez firmada la propuesta, antes de ejecutar sesión 01.
**Canal**: email + WhatsApp aviso.
**Tono**: profesional pero accesible.

```
Asunto: NQS AI Hub — Arrancamos. Necesito que prepares algunas cosas

Hola Tomás,

Antes de empezar a codear, necesito que NQS prepare algunos accesos y cuentas. 
Te paso todo junto así lo resolvés en un rato:

1. CUENTA DE SUPABASE
   - Entrar a supabase.com con email corporativo (no personal).
   - Crear proyecto nuevo: "nqs-ai-hub".
   - Region recomendada: South America (São Paulo) por latencia.
   - Pasarme las 3 credenciales que aparecen en Project Settings → API:
     * Project URL
     * anon key (pública)
     * service_role key (privada, importante)

2. CUENTA DE ANTHROPIC (la importante)
   - Entrar a console.anthropic.com con email corporativo de NQS.
   - IMPORTANTE: la cuenta tiene que estar a nombre de NQS, no mío. 
     La razón: el consumo mensual lo paga la tarjeta cargada acá.
   - Generar una API key.
   - Cargar USD 50-100 de créditos iniciales (cubre todo el desarrollo).
   - Setear un budget alert en USD 200/mes (te explico cuando charlemos).

3. CUENTA DE VERCEL
   - Entrar a vercel.com con email corporativo.
   - Plan gratuito (Hobby) está bien para empezar.
   - Invitarme como colaborador cuando creemos el proyecto.

4. CANAL SEGURO PARA INTERCAMBIAR CLAVES
   Te propongo usar 1Password compartido o Bitwarden. 
   La API key de Anthropic NO la podemos mandar por WhatsApp ni mail común 
   (es como una tarjeta de crédito digital).
   ¿Tenés preferencia? Si no, te abro un Bitwarden gratis ahora.

5. DECISIÓN DE DOMINIO
   ¿Va a estar en hub.nqs.com.ar o usamos un nqs-ai-hub.vercel.app temporal?
   Si es lo primero, vamos a necesitar acceso al DNS más adelante (no urgente).

CONTEXTO IMPORTANTE SOBRE COSTOS RECURRENTES:
Una vez deployado y en uso, NQS va a tener costos mensuales fijos. 
Te paso un estimado realista:

- Supabase: USD 0 al inicio, USD 25/mes a partir de mes 2-3
- Vercel: USD 0 (probablemente alcance todo el tiempo)
- Anthropic: USD 100-300/mes los primeros meses, puede subir a USD 300-500 
  con uso intenso de todos los empleados
- Email transaccional (Resend): USD 0-20/mes
- Dominio: ~USD 15/año

Total realista en régimen: USD 150-500/mes.

NO es plata que me pagás a mí (solo es por mi trabajo lo que ya acordamos), 
es lo que cuestan los servicios que la plataforma usa. Quería que lo supieras 
desde ahora para que no haya sorpresas.

¿Pasamos por WhatsApp por dudas? 
Cuando tengas las cuentas listas avisame y arrancamos.

Abrazo,
Fede
```

---

## 📱 2. PEDIDOS PUNTUALES DURANTE EL DESARROLLO

**Cuándo**: en momentos específicos del MVP cuando necesitás algo del cliente.
**Canal**: WhatsApp.
**Tono**: directo y casual.

### 2.1 — Antes de sesión 02 (DB y seeds)

```
Hola Tomás, todo bien? 
Para arrancar la DB necesito 2 cosas:

1. El contenido actual del "cerebro" de Claude (lo que tienen en el Project de Claude.ai). 
Pasámelo por el [Bitwarden/1Password/etc.] que acordamos. 
Es lo más sensible del proyecto, después no lo manejo más yo: 
queda encriptado en la DB y solo vos lo vas a poder editar desde el admin.

2. Mandame un excel/sheet con los empleados iniciales que van a tener acceso:
   - Nombre completo
   - Email
   - Departamento
   - ¿Es admin o employee?
   
Con 2-3 personas alcanza para arrancar, el resto los cargás vos después 
desde el panel admin.
```

### 2.2 — Antes de sesión 08 (3DSky)

```
Tomás, vamos con el módulo de 3DSky.

Necesito confirmar el estado del proxy: 
- ¿Está operativo el proxy en 3dsky.nqs.com.ar (o como se llame)?
- ¿Quién lo mantiene? ¿Tu equipo o un externo?
- ¿Pueden agregar 2 endpoints HTTP que llamen a mi API cuando alguien 
  intenta descargar un modelo?

Lo necesito básicamente porque el proxy le va a tener que preguntar 
a mi plataforma "¿este empleado tiene créditos?" antes de dejar pasar 
la descarga.

Si el proxy todavía no está listo, igual avanzo con el módulo de créditos 
del lado de la plataforma. Pero al deploy final el flujo completo 
no va a funcionar hasta que el proxy esté.

¿Hablamos 10 minutos por call?
```

### 2.3 — Antes de sesión 12 (deploy)

```
Tomás, ya estamos en la última semana antes del deploy.

Necesito que prepares 3 cosas:

1. Resend para emails (opcional pero recomendado):
   - Crear cuenta en resend.com
   - Verificar el dominio nqs.com.ar (te van a pedir agregar registros DNS)
   - Pasarme la API key

2. Configurar DNS del subdominio hub.nqs.com.ar 
   (Vercel me va a dar las instrucciones específicas cuando llegue 
   el momento, te aviso en el día).

3. La reunión que te decía sobre costos recurrentes: 
   ¿el viernes a las 15hs? 
   Necesitamos hablar de:
   - Budget mensual esperado en Anthropic
   - Quién paga qué
   - Qué pasa si superamos presupuesto
   - Cómo monitorear consumo

Avisame.
```

---

## 📋 3. ENTREGA DEL MVP

**Cuándo**: día del deploy a producción, después del smoke test.
**Canal**: email formal + reunión en vivo.
**Tono**: cierre profesional, sin perder calidez.

```
Asunto: NQS AI Hub — Entrega del MVP ✅

Tomás,

Listo, el MVP está deployado en hub.nqs.com.ar (o vercel URL).

Te dejo todo lo necesario para que empieces a usarlo:

ACCESOS
- URL: [URL]
- Tu usuario admin: [email]
- Tu password inicial: [enviar por canal seguro, NO en este mail]
- Cambiá la contraseña en el primer login.

DOCUMENTACIÓN (carpeta /docs en el repo)
- admin-guide.md → cómo gestionar usuarios, prompt padre, créditos
- user-guide.md → para mandarle a los empleados
- runbooks.md → qué hacer si algo se rompe
- changelog.md → versión 1.0.0 con todo lo entregado

PRÓXIMOS PASOS RECOMENDADOS

1. Esta semana:
   - Que vos te familiarices con el admin panel (te paso 1 hora de demo, 
     ya agendamos).
   - Cargar el resto de los empleados desde /admin/users.
   - Revisar el prompt padre que cargué y ajustar si necesitás.

2. Próximas 2 semanas:
   - Que los empleados usen la plataforma en serio.
   - Vos monitoreás consumo desde /admin/credits y /admin/logs.
   - Cualquier bug o ajuste, me decís.

3. Mes 1:
   - Sacar conclusiones de uso real.
   - Decidir qué módulos de v2 priorizar.

MÓDULOS DISPONIBLES PARA V2 (precios ya acordados):
- Control horario y caducidad: USD 720
- Sistema de aprobaciones: a cotizar
- Panel admin completo (gráficos, exportación PDF, estimación de costos): USD 1.450
- Integración de tools adicionales (Weavy, Kling, Runway, ElevenLabs, Highsfield): 
  cotizar por tool
- Módulo seguridad / shield (detección de prompt injection + capturas): 
  cotizar (requiere consentimientos legales firmados antes)
- Módulo de contenido (Tutoriales, Playbook, Organigrama): a cotizar

COSTOS RECURRENTES (RECORDATORIO)
- Supabase: cuando superen free tier, USD 25/mes
- Anthropic: variable según uso, monitoreá en /admin/costs
- Resend: USD 0-20/mes
- Vercel: probablemente USD 0

GARANTÍA POST-LANZAMIENTO
Tenés 30 días de soporte sin costo para bugs y ajustes menores.
Nuevas features o cambios grandes, cotizamos aparte.

Cualquier cosa, escribime.

Abrazo,
Fede
```

---

## 🔮 4. ANTES DE CADA MÓDULO DE V2

### 4.1 — Activar módulo Horarios

```
Tomás, antes de arrancar el módulo de horarios necesito que definamos:

1. ¿Qué horarios querés imponer?
   - ¿Lun-vie 9-18hs para todos?
   - ¿Distinto por departamento?
   - ¿Algunos empleados con horario más amplio?

2. ¿Querés accesos temporales? 
   (Ejemplo: "le doy acceso a Weavy a esta persona pero solo por 48hs 
   para un proyecto puntual")

3. ¿Notificaciones automáticas? 
   - Cuando expira un acceso → mandar email al user
   - Cuando un user intenta usar fuera de horario → registrar y avisar admin

No hay costos adicionales para este módulo en infra.
Tiempo estimado de desarrollo: 1 semana.
```

### 4.2 — Activar módulo Aprobaciones

```
Antes del módulo de solicitudes y aprobaciones, definamos canales:

1. NQS usa Slack o WhatsApp para comunicación interna?
2. Si Slack: necesito acceso al workspace para crear una app de notificaciones.
3. Si WhatsApp: hay que usar Twilio (USD 0.005 por mensaje, despreciable).

¿Quién aprueba las solicitudes?
- ¿Solo vos?
- ¿También [otra persona]?
- ¿Distinto por tool?
```

### 4.3 — Activar módulo Seguridad (delicado)

```
Tomás, antes del módulo de seguridad / shield necesitamos resolver temas legales. 
Este módulo incluye:
- Análisis automático de prompts (detectar intentos de extraer info confidencial)
- Captura de pantalla en eventos sospechosos
- Modo paranoid (auditoría con segundo LLM)

NECESITAMOS antes de implementar:
1. ¿NQS tiene política de privacidad interna?
   Tiene que mencionar explícitamente que:
   - Se loguean las interacciones con Claude
   - Se pueden capturar pantallas en eventos de seguridad
   - Cuánto tiempo se guarda esa info

2. ¿Los empleados firmaron consentimiento explícito?
   Si no, hay que hacerlo. Te puedo armar un template si querés.

3. ¿Quién accede a los logs/snaps?
   - ¿Solo vos como admin?
   - ¿RRHH también?
   - ¿Hay alguien de legales que tiene que aprobar?

Sin estos papeles NO implemento el módulo. Es riesgo legal real, 
no quiero ni que vos ni yo terminemos en quilombo.

Cuando los tengas listos, hablamos.
```

### 4.4 — Activar módulo nuevas tools

```
Para integrar [Weavy / Kling / Runway / ElevenLabs / Highsfield] necesito:

1. Cuenta corporativa de NQS en esa tool (no personal).
2. API key (si tiene) o credenciales de la cuenta (si va con proxy/iframe).
3. Confirmación de quién paga el plan mensual.
4. Costo aproximado de esa tool por mes: [referencia del doc 04].

¿Confirmás que querés arrancar con [TOOL] ahora?
```

---

## 💰 5. CUANDO HAY ALERTAS DE CONSUMO

### 5.1 — Anthropic supera presupuesto esperado

```
Tomás, alerta: el consumo de Anthropic este mes va camino a superar USD 400 
(presupuesto inicial era USD 300).

Es por uso real, no por bug. Ya revisé los logs:
- [Usuario X] está haciendo muchas llamadas con imágenes grandes
- [Usuario Y] suma X% del consumo

Opciones:
1. Dejarlo así si el uso es legítimo y le sumás más créditos.
2. Tener una charla con esos usuarios sobre eficiencia.
3. Implementar límite de llamadas/mes por usuario (lo podemos sumar al backlog, 
   está en el módulo de panel admin completo).

¿Hablamos?
```

### 5.2 — Pool de créditos 3DSky bajo

```
Tomás, el pool de créditos 3DSky está en X% (menos del 20%). 
Te aviso porque varios empleados podrían quedarse sin créditos pronto.

¿Comprás más créditos? Lo cargás desde /admin/credits → "comprar más créditos".
```

---

## 📅 6. CHECKPOINTS MENSUALES (post-MVP)

**Cuándo**: 1 vez al mes, primer lunes.
**Canal**: email + reunión opcional.

```
Asunto: NQS AI Hub — Reporte mensual [mes]

Hola Tomás,

Te paso el resumen del mes:

CONSUMO
- Llamadas a Claude: X (vs Y mes anterior, [+/-]%)
- Tokens consumidos: X
- Costo Anthropic estimado: USD X
- Créditos 3DSky consumidos: X

USUARIOS
- Activos: X/Y (X% del equipo)
- Top usuarios por consumo:
  1. [Nombre] - X llamadas
  2. [Nombre] - X llamadas
  ...

OBSERVACIONES
- [Algo notable que viste]
- [Bug menor resuelto]
- [Recordatorio de algo pendiente]

PENDIENTES MÍOS
- [Si hay]

¿Algo querés que mire o ajuste?

Abrazo,
Fede
```

---

## 🚨 7. SITUACIONES DE EMERGENCIA

### 7.1 — La plataforma se cayó

```
Tomás, alerta: la plataforma está caída.
Lo estoy mirando ahora, te aviso en X minutos.
```

(Después)

```
OK, ya está arriba. Causa: [breve explicación].
Tiempo offline: X minutos.
Te paso post-mortem por mail mañana con detalle y cómo lo prevenimos.
```

### 7.2 — Posible compromiso de API key

```
Tomás, urgente: detecté actividad rara en Anthropic. 
Voy a rotar la API key AHORA.

Necesito que:
1. Vos te logues a console.anthropic.com
2. Revoques la API key actual
3. Generes una nueva
4. Me la pases por el canal seguro

Mientras tanto la plataforma va a estar caída ~5 minutos. 
Hablamos.
```

### 7.3 — Alguien dejó leak el prompt padre

```
Tomás, situación: detecté que [user] intentó extraer el prompt padre 
y posiblemente lo logró. 
Te paso detalles por DM/canal seguro (no acá).

Acción inmediata:
- Suspendí el acceso del usuario.
- Hay log completo del evento.

¿Llamada en 10 min?
```

---

## ✏️ NOTAS DE USO

- **Adaptá tono** según la relación. Estos son drafts.
- **No mandes la API key por WhatsApp aunque sea ahora**. Siempre canal seguro.
- **Documentá las conversaciones importantes** (decisiones de costos, cambios de scope) por email aunque hayan sido por WhatsApp. Te cubre.
- **Si Tomás no te responde** en 48hs sobre algo crítico (ej. dependencias para arrancar una sesión), no avances. Esperar es siempre mejor que ir a ciegas.
