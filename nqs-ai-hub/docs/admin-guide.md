# Guía del Admin — NQS AI Hub

> Para Tomás (y futuros admins). Cómo gestionar la plataforma desde el
> panel `/admin`.

## Entrar al panel

1. Logueate en la plataforma con tu cuenta admin.
2. Vas a ver el botón **Admin** en la barra superior (solo los admins lo ven).
3. Click → llegás al **Overview** con un resumen: usuarios activos, tools habilitadas, llamadas a Claude (últimos 7 días), solicitudes pendientes, pool de créditos 3DSky y últimas acciones.

El panel tiene una barra lateral con: Overview · Usuarios · Prompt padre · Accesos & horarios · Solicitudes · Créditos · pool · Logs.

---

## Usuarios (`/admin/users`)

### Crear un usuario
1. **+ nuevo usuario**.
2. Completá nombre, email, iniciales (se autocompletan), departamento, job title, rol (employee/admin) y un password inicial (mín 8 chars).
3. **Crear** → el usuario ya puede loguearse con ese email/password.

### Editar / dar de baja
1. Click en la fila del usuario → modal.
2. Tab **Datos básicos**: cambiar nombre/dept/rol → **guardar cambios**.
3. **Dar de baja**: desactiva al usuario (no puede loguearse). Es reversible — el mismo botón pasa a "reactivar".

> El email es inmutable (es la identidad en Supabase Auth). Si alguien cambió de email, dalo de baja y creá uno nuevo.

---

## Accesos & horarios (`/admin/access`)

Controlás qué tools puede usar cada empleado y en qué horarios.

1. Seleccioná un usuario en la lista de la izquierda.
2. Por cada tool ves una tarjeta con un **toggle on/off**:
   - **ON (active)**: el empleado puede usar la tool.
   - **OFF (locked)**: no puede. En el hub le aparece "solicitar acceso".
3. Si la tool está ON, podés **configurar horarios**:
   - Por día (lun-dom): checkbox + hora desde/hasta.
   - "copiar a todos los días" replica la config del primer día habilitado.
   - "sin restricción" = acceso 24/7 (borra el horario).

> Los horarios se evalúan en hora de Argentina. Si un empleado entra fuera de su ventana, ve un popup y puede pedir **acceso excepcional**.

---

## Prompt padre de Claude (`/admin/prompt`)

El "cerebro" de Claude. Tiene 2 pestañas:

### System Prompt
Las instrucciones del asistente (tono, rol, formato). Lo que más define cómo responde Claude.
- Editás el texto en el textarea (ves chars + tokens estimados).
- **Selector de modelo**: Haiku (barato/rápido) · Sonnet (recomendado) · Opus (máxima capacidad). Cada uno muestra su costo. Cambiar de modelo pide confirmación.
- **Guardar nueva versión**: crea una versión. Si dejás "activar al guardar" tildado, entra en uso inmediato para todos.
- **Historial** (sidebar derecho): cada versión con fecha y autor. Click para ver una vieja; "activar esta versión" la pone en uso.

### Memoria del workspace
Contexto compartido que se suma al system prompt: proyectos activos, clientes, glosario interno, decisiones. Ej: *"Proyecto activo: Manhattan One — pitch hotelero, cliente REC, entrega abril."*
- Se edita independientemente del system prompt.
- Tiene su propio versionado.
- Se concatena automáticamente en cada llamada (Claude "recuerda" el contexto).

> **Regla**: cambiar el CONTENIDO crea versión nueva. Cambiar SOLO el modelo se aplica in-place (no crea versión).

> Activar una versión afecta a TODOS los usuarios al instante. La plataforma te pide confirmar.

---

## Créditos 3DSky (`/admin/credits`)

NQS compra créditos en 3DSky.org y los reparte entre empleados.

### Pool
Arriba ves: POOL TOTAL · ASIGNADOS · DISPONIBLE (para repartir).

### Registrar una compra
1. **Comprar más créditos** → cargá cantidad + costo USD + nota (ej: "factura #123, tarjeta corp").
2. Esto NO compra en 3DSky — registra lo que ya compraste, para llevar el pool.

### Asignar a empleados
En la tabla, cada empleado tiene botones **−5 / − / + / +5**. El cambio es inmediato.
- No podés asignar menos de lo que el empleado ya consumió.
- "historial" → todas las transacciones, con filtros + export CSV.

> Los empleados declaran su consumo al salir del módulo 3DSky. Vos verificás contra la factura mensual de 3DSky y ajustás si hace falta.

---

## Solicitudes (`/admin/requests`)

Los empleados piden 3 cosas; todas llegan acá (y a Slack):
- **Créditos** (amarillo): tiene acceso, quiere más créditos 3DSky.
- **Acceso** (azul): no tiene la tool habilitada, pide que se la habilites.
- **Acceso excepcional** (naranja): tiene acceso pero está fuera de horario, pide entrar igual por un rato.

Filtrá por estado (pendientes/aprobadas/rechazadas) y por tipo.
- **Aprobar**: créditos → suma al allocation; acceso → habilita la tool; excepcional → habilita por la duración pedida.
- **Rechazar**: con nota opcional. El empleado puede volver a pedir.

Llega notificación a Slack en cada solicitud y en cada resolución.

---

## Logs (`/admin/logs`)

Auditoría con 3 pestañas + filtros (fecha, usuario, tool):
- **Usage logs**: cada acción (llamadas a Claude con tokens + modelo usado, etc.).
- **Module sessions**: entradas/salidas a 3DSky con consumo declarado e IP.
- **Credit transactions**: movimientos de créditos (asignaciones, consumos, ajustes).

Los filtros quedan en la URL — podés copiar el link de una vista filtrada.

---

## Tareas operativas comunes

### Cambiar la API key de Anthropic (si rota)
1. En Vercel → Project Settings → Environment Variables → editar `ANTHROPIC_API_KEY`.
2. Redeploy (o Vercel redeploya solo al cambiar env).
3. No toca nada de la DB.

### Resetear el password de un empleado
Por ahora desde el dashboard de Supabase: Authentication → Users → buscar el email → "Send password recovery" o "Reset password". (El reset self-service desde la plataforma es roadmap.)

### Cambiar el modelo de Claude para abaratar
`/admin/prompt` → tab System Prompt → seleccionar Haiku → confirmar. Se aplica en las próximas llamadas. Reversible en cualquier momento.

---

## Qué NO podés hacer (todavía — roadmap)

- Reset de password self-service (hoy es desde Supabase).
- Gráficos/dashboards de consumo (hoy son números + logs).
- Aprobaciones con expiración automática del acceso excepcional (hoy se valida al momento; la limpieza es manual).
