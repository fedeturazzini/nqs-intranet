# API Routes — Estructura completa

> Mapa de todos los endpoints del proyecto, organizados por módulo. Las marcadas con [MVP] van en el MVP. Las marcadas con [Vx] van en módulos futuros.

## Autenticación

```
POST   /api/auth/login              [MVP] login con email/password
POST   /api/auth/logout             [MVP] cerrar sesión
GET    /api/auth/session            [MVP] obtener sesión actual
```

## Usuario actual (me)

```
GET    /api/me                      [MVP] datos del usuario actual
GET    /api/me/access               [MVP] lista de tools y estado de acceso del usuario
GET    /api/me/usage                [MVP] historial de uso del usuario
```

## Tools — Claude

```
POST   /api/tools/claude/execute    [MVP] enviar prompt + imágenes, recibir respuesta
GET    /api/tools/claude/history    [MVP] historial de conversaciones del usuario
GET    /api/tools/claude/conversation/:id [MVP] mensajes de una conversación
DELETE /api/tools/claude/conversation/:id [MVP] eliminar conversación
```

## Tools — 3DSky

```
GET    /api/tools/3dsky/embed-url   [MVP] URL del proxy para el iframe
GET    /api/tools/3dsky/credits     [MVP] créditos disponibles del usuario actual
POST   /api/tools/3dsky/check-credits [MVP] (llamado desde el proxy) chequea si puede consumir
POST   /api/tools/3dsky/consume-credit [MVP] (llamado desde el proxy) descuenta crédito
POST   /api/tools/3dsky/request-more [MVP] solicitar más créditos al admin
```

## Tools — Genéricos

```
GET    /api/tools                   [MVP] listado de tools con estados
GET    /api/tools/:id               [MVP] info de una tool
```

## Admin — Usuarios

```
GET    /api/admin/users             [MVP] listar usuarios
POST   /api/admin/users             [MVP] crear usuario
PATCH  /api/admin/users/:id         [MVP] editar usuario
DELETE /api/admin/users/:id         [MVP] baja de usuario (soft delete: is_active=false)
POST   /api/admin/users/:id/access  [MVP] conceder/revocar acceso a una tool
```

## Admin — Prompt padre

```
GET    /api/admin/system-prompts            [MVP] listar prompts
GET    /api/admin/system-prompts/:id        [MVP] obtener prompt (desencriptado)
POST   /api/admin/system-prompts            [MVP] crear nuevo prompt
PATCH  /api/admin/system-prompts/:id        [MVP] editar prompt
POST   /api/admin/system-prompts/:id/activate [MVP] activar versión
```

## Admin — Créditos 3DSky

```
GET    /api/admin/credits/pools            [MVP] historial de compras de pool
POST   /api/admin/credits/pools            [MVP] registrar nueva compra (X créditos a $Y)
GET    /api/admin/credits/allocations      [MVP] asignaciones actuales por usuario
POST   /api/admin/credits/allocate         [MVP] asignar/desasignar créditos a un usuario
GET    /api/admin/credits/transactions     [MVP] historial de movimientos
```

## Admin — Logs

```
GET    /api/admin/logs                     [MVP] logs de uso con filtros básicos
```

## [V2] Sistema de aprobaciones

```
GET    /api/me/requests                    [V2] solicitudes del usuario actual
POST   /api/me/requests                    [V2] crear solicitud de acceso
GET    /api/admin/requests                 [V2] solicitudes pendientes
POST   /api/admin/requests/:id/approve     [V2] aprobar solicitud
POST   /api/admin/requests/:id/reject      [V2] rechazar
```

## [V2] Control horario

```
GET    /api/admin/time-windows             [V2] listar ventanas configuradas
POST   /api/admin/time-windows             [V2] crear ventana
PATCH  /api/admin/time-windows/:id         [V2] editar
DELETE /api/admin/time-windows/:id         [V2] borrar
```

## [V2] Panel admin completo

```
GET    /api/admin/dashboard/kpis           [V2] KPIs principales
GET    /api/admin/dashboard/tokens         [V2] gráfico de tokens
GET    /api/admin/dashboard/ranking        [V2] ranking de uso
GET    /api/admin/reports/export?format=   [V2] export CSV/PDF
GET    /api/admin/costs/estimate           [V2] estimación de costos
```

## [V2] Seguridad

```
GET    /api/admin/security/events          [V2] eventos detectados
POST   /api/admin/security/events/:id/review [V2] marcar como revisado
GET    /api/admin/security/rules           [V2] reglas configuradas
PATCH  /api/admin/security/rules/:id       [V2] editar regla
```

## [V2] Snapshots

```
POST   /api/snaps/upload                   [V2] subir captura (desde extensión browser)
GET    /api/admin/snaps                    [V2] lista de capturas
POST   /api/admin/snaps/:id/verdict        [V2] marcar verdict
```

## [V2] Otras tools (cada una sigue el patrón)

```
GET    /api/tools/weavy/embed-url          [V2]
GET    /api/tools/kling/embed-url          [V2]
... etc.
```

## [V2] Notificaciones

```
POST   /api/webhooks/slack                 [V2] webhook entrante de Slack
POST   /api/webhooks/whatsapp              [V2] webhook entrante de WhatsApp
```

---

## Convenciones

1. **Todos los endpoints requieren auth** salvo `/api/auth/*`.
2. **Endpoints `/api/admin/*` requieren `role=admin`**.
3. **Endpoints `/api/me/*` operan sobre el usuario autenticado**.
4. **Endpoints `/api/tools/:id/*` validan permisos vía `requireToolAccess`**.
5. **Body y query siempre validados** con Zod.
6. **Respuestas siempre JSON**, nunca text plano.
7. **Errores siempre con `{ error: 'code', message: 'human readable' }`**.
8. **Códigos HTTP correctos**: 200, 201, 400, 401, 403, 404, 409, 500.

## Ejemplo de respuesta exitosa

```json
{
  "data": {
    "id": "uuid",
    "name": "Sofía",
    ...
  }
}
```

## Ejemplo de respuesta de error

```json
{
  "error": "no_credits",
  "message": "Te quedaste sin créditos para 3DSky"
}
```
