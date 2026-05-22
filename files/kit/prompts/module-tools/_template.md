# Módulo Tools — Template: Agregar una herramienta nueva

## ⚠️ ANTES DE EMPEZAR — PEDIRLE AL CLIENTE (POR CADA TOOL)

### Lo que NQS tiene que aportar para CADA tool nueva:

- [ ] **Cuenta corporativa** de NQS en la tool (no personal)
- [ ] **API key** (si la tool tiene API) o credenciales de la cuenta (si va con proxy/iframe)
- [ ] **Confirmación de quién paga** el plan mensual de esa tool
- [ ] **Estimación de costo mensual** que NQS está dispuesto a asumir
- [ ] **Decisión técnica**: ¿integración por API, proxy o iframe? (depende de cada tool, ver doc específico)

### Mensaje sugerido para mandarle al cliente:

> Ver template **"4.4 — Activar módulo nuevas tools"** en `docs/05-client-comms-template.md`.

### Por qué importa:

- Cada tool tiene su propio pricing y modelo de negocio.
- Algunos costos pueden ser significativos (ej. Runway USD 95/mes plan + uso).
- Sin la API key, no podés ni empezar a desarrollar.

### Costos referenciales por tool (verificar al momento de implementar):

| Tool | Costo aprox |
|------|-------------|
| Weavy | USD 30-100/mes según plan |
| Kling | USD por segundo de video generado |
| Runway | USD 15-95/mes plan + uso adicional |
| ElevenLabs | USD 5-330/mes según volumen |
| Highsfield | Variable (en beta) |

**Más detalles en** `docs/04-client-dependencies.md`.

---

## Objetivo

Activar una herramienta del stack que está en estado "próximamente" (Weavy, Kling, Runway, ElevenLabs, Highsfield).

**Duración**: 2-3 horas por tool
**Pre-requisito**: arquitectura ToolAdapter del MVP funcional.

---

## CÓMO USAR ESTE TEMPLATE

Este es un template reutilizable. Reemplazá `<TOOL_ID>` y `<TOOL_NAME>` con los valores específicos:

- `weavy` / `Weavy`
- `kling` / `Kling`
- `runway` / `Runway`
- `elevenlabs` / `ElevenLabs`
- `highsfield` / `Highsfield`

---

## PROMPT

```
Activamos la tool <TOOL_NAME> en NQS AI Hub.

ESTADO ACTUAL:
La tool está creada en `tools` table desde el MVP pero `is_active=false`.

OBJETIVO:
Implementar el adapter, la vista, y activarla.

PRIMERA DECISIÓN — ¿Cómo se integra esta tool?

Opción A: **API directa** (la tool tiene API pública).
- Implementar `execute()` en el adapter.
- Frontend custom para la tool (estilo Claude wrapper).

Opción B: **Iframe con proxy** (la tool no tiene API pero NQS tiene un proxy).
- Implementar `getEmbedUrl()` en el adapter.
- Frontend con `<EmbeddedSite />` (como 3DSky).

Opción C: **Iframe directo** (la tool soporta embedding sin proxy).
- Iframe directo a la URL de la tool.
- Manejo de auth vía cookies o SSO.

Antes de empezar, confirmá con NQS qué opción aplica a <TOOL_NAME>.

PASOS (asumiendo opción B con proxy, ajustar si es A o C):

1. Crear `src/lib/adapters/<TOOL_ID>.ts`:
   - Implementar la interfaz `ToolAdapter`.
   - Si usa créditos, agregarlo igual que ThreeDSkyAdapter.
   - Si no usa créditos, dejar `usesCredits: false`.

2. Registrar el adapter en `src/lib/adapters/index.ts`:
   - Importar y agregar al objeto `adapters`.
   - Quitar el placeholder.

3. Actualizar la tabla `tools` en DB:
   - `UPDATE tools SET is_active = true WHERE id = '<TOOL_ID>';`
   - Si usa créditos: `UPDATE tools SET uses_credits = true WHERE id = '<TOOL_ID>';`

4. Si usa créditos, crear credit_pool inicial:
   - `INSERT INTO credit_pools (tool_id, total_credits, cost_usd, ...) VALUES ('<TOOL_ID>', 0, 0, ...)`

5. Endpoints específicos (si aplica):
   - `src/app/api/tools/<TOOL_ID>/embed-url/route.ts`
   - `src/app/api/tools/<TOOL_ID>/check-credits/route.ts` (si usa créditos)
   - `src/app/api/tools/<TOOL_ID>/consume-credit/route.ts` (si usa créditos)

6. Crear vista `src/components/screens/<TOOL_NAME>View.tsx`:
   - Si usa iframe: similar a `ThreeDSkyView`.
   - Si tiene UI custom: diseñar específico para la tool.
   - Respetar el sistema de diseño de NQS.

7. Actualizar `src/app/(dashboard)/tool/[toolId]/page.tsx`:
   - Agregar caso para `<TOOL_ID>`.
   - Renderizar la vista correspondiente.

8. Si la tool usa créditos, agregar al panel admin de créditos:
   - El admin debería poder gestionar pool y allocations para esta tool también.
   - El panel ya está preparado para múltiples tools en su diseño.

9. Configurar permisos default:
   - ¿Qué usuarios tienen acceso por default? Decisión del cliente.
   - Si no, se asignan vía /admin/users.

10. Testing:
    - Loguearse como admin → darle acceso a un usuario.
    - Loguearse como ese usuario → ver la tool active en el hub.
    - Abrir la tool → verificar que carga.
    - Si usa créditos → verificar consumo correcto.

11. Documentar particularidades de esta tool en `docs/tools/<TOOL_ID>.md`:
    - Cómo funciona la integración.
    - Cómo se gestionan los créditos (si aplica).
    - Quién es el dueño del proxy/cuenta upstream.
    - Cómo renovar credenciales.

12. Commit con mensaje: `feat(<tool_id>): integración completa`.

AL FINAL:
`progress-<tool_id>.md` con:
- Adapter funcional
- Vista funcional
- Tests pasando
- Doc actualizada
```

---

## NOTAS POR TOOL

### Weavy
- No tiene API pública (confirmado).
- Opción B con proxy o C con iframe directo si soportan embedding.
- Workflow-based: el user diseña pipelines visuales.
- Consideración: ¿el cliente quiere mostrar todos los workflows o solo los públicos? Esto requiere lógica adicional de permisos.

### Kling
- Tiene API pública desde Kuaishou.
- Opción A: API directa con SDK propio.
- Genera video, requiere polling para resultado.
- Costos por segundo de video generado.

### Runway
- Tiene API pública.
- Opción A: API directa.
- Soporta varios modelos (Gen-4, lip-sync, etc.).
- Manejar selección de modelo en UI.

### ElevenLabs
- API muy bien documentada.
- Opción A: directa.
- Permite seleccionar voces, idiomas, emociones.
- Devuelve archivo de audio.

### Highsfield (Higgsfield)
- API en beta. Verificar disponibilidad cuando se implemente.
- Probablemente opción A o C.

---

## VALIDACIÓN

- [ ] Tool aparece active en el hub
- [ ] Vista funciona
- [ ] Permisos respetados
- [ ] Logs registran uso
- [ ] Si usa créditos: descuento correcto
