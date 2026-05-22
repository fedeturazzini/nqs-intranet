# Sesión 09 — Vista de 3DSky con iframe + overlay de créditos

## Objetivo

UI del usuario para 3DSky: iframe del proxy, header con créditos disponibles, overlay cuando se queda sin créditos, modal para solicitar más.

**Duración**: 2.5 horas

---

## PROMPT

```
Sesión 09 del NQS AI Hub.

ESTADO ACTUAL:
Leé `progress-08.md`.

OBJETIVO:
Vista de 3DSky completa con iframe embebido, indicador de créditos en tiempo real, y flujos de "sin créditos" y "solicitar más".

PASOS:

1. Crear `src/components/screens/ThreeDSkyView.tsx`:
   - Adaptar `ThreeDSkyMock` de `design/screens.jsx` (líneas 463-513).
   - Estructura:
     - Hero arriba: contador de créditos grande + barra de progreso + botón "solicitar más".
     - Iframe debajo con el proxy.
   - Layout fiel al diseño.

2. Crear `src/components/tool/EmbeddedSite.tsx`:
   - Adaptar `EmbeddedSite` de `design/screens.jsx` (líneas 567-669).
   - Renderiza iframe + overlay de preloader animado:
     - "verificando permiso" → "autenticando con sesión compartida" → "cargando catálogo"
     - El iframe se monta desde el primer render y nunca se desmonta.
     - El overlay desaparece cuando el iframe está cargado.
   - Manejo de error si el iframe no carga en 9s → muestra fallback con botón "reintentar".

3. Crear `src/components/tool/CreditsHeader.tsx`:
   - Header arriba del iframe con:
     - "↳ TUS CRÉDITOS · ESTE MES" eyebrow
     - Número grande de créditos restantes (con tipografía Instrument Serif)
     - "de 30" (total asignado)
     - Barra de progreso
     - Texto "{X} usados este mes · refresh el 1ro de [mes próximo]"
     - Botón "solicitar más créditos"
   - Se actualiza en tiempo real cuando se consumen créditos (ver paso 5).

4. Crear `src/components/tool/CreditsBlockOverlay.tsx`:
   - Adaptar `CreditsBlockOverlay` de `design/screens.jsx` (líneas 348-374).
   - Se muestra encima del iframe cuando los créditos llegan a 0.
   - Mensaje claro: "Te quedaste sin créditos".
   - Botón "solicitar más créditos al admin".
   - Botón "volver al hub".

5. Comunicación con el iframe (postMessage):
   - El iframe del proxy puede mandar mensajes al parent (nuestra app) cuando consume un crédito.
   - Listener: `window.addEventListener('message', (e) => { if (e.data.type === 'credit_consumed') refreshCredits() })`
   - Validar origin: `e.origin === process.env.NEXT_PUBLIC_THREE_DSKY_PROXY_ORIGIN`.

6. Crear `src/components/tool/CreditRequestModal.tsx`:
   - Adaptar `CreditRequestModal` de `design/screens.jsx` (líneas 376-433).
   - Form con:
     - Input numérico: cuántos créditos solicitar (default 10, max 100).
     - Textarea: motivo.
   - Submit → POST a `/api/tools/3dsky/request-more`.
   - Muestra toast "Solicitud enviada al admin".

7. Página `src/app/(dashboard)/tool/3dsky/page.tsx`:
   - Server Component.
   - Valida acceso del usuario.
   - Trae créditos iniciales server-side.
   - Pasa a `<ThreeDSkyView initialCredits={...} />`.

8. Hook `src/lib/hooks/use3DSkyCredits.ts`:
   - State de créditos.
   - Polling cada 30 segundos para refrescar (backup por si postMessage falla).
   - Función `refreshCredits()` para llamar manualmente.

9. Manejo de estados:
   - `credits > 5`: estado normal.
   - `credits <= 5 && > 0`: indicador en warn (color naranja).
   - `credits === 0`: overlay de bloqueo.

10. Test manual:
    - Loguearse como Sofia → ir a hub → click 3DSky.
    - Ver el iframe cargar con preloader animado.
    - Ver el contador de créditos (30/30).
    - Simular consumo: usar el endpoint `consume-credit` con curl.
    - Verificar que el contador se actualiza (vía polling o postMessage).
    - Forzar credits=0 → ver overlay.
    - Click "solicitar más" → modal → submit → toast.

11. Commit.

REGLAS:
- El iframe NUNCA se desmonta una vez montado.
- Validar `e.origin` en postMessage por seguridad.
- El proxy URL viene del backend (incluye HMAC token), no se hardcodea.

ARCHIVOS A REFERENCIAR:
- `design/screens.jsx` líneas 348-433 (CreditsBlockOverlay, CreditRequestModal), 463-513 (ThreeDSkyMock), 567-669 (EmbeddedSite)
- `design/screens.css` (clases `.threedsky-mock`, `.threedsky-hero`, `.threedsky-credits`, `.threedsky-grid`, `.threedsky-item`, `.embed-wrap`, `.embed-overlay`, `.embed-auth`, `.embed-fallback`)

NOTA IMPORTANTE:
El proxy 3DSky es responsabilidad del CLIENTE, no nuestra. Nosotros solo hablamos con él vía:
- iframe (renderiza el proxy)
- postMessage (proxy → nuestra app)
- HTTP endpoints (proxy → nuestra API: check-credits, consume-credit)

Si el proxy del cliente no está aún listo cuando probamos esto, usar un mock local. Crear `tools/mock-proxy/` con un Express simple que actúe como proxy de prueba.

AL FINAL:
`progress-09.md` con vista funcionando, ya sea contra proxy real o mock.
Próximo paso: `prompts/mvp/10-admin-base.md`
```

---

## VALIDACIÓN

- [ ] Vista se ve idéntica al diseño
- [ ] Iframe carga con preloader animado
- [ ] Contador de créditos visible y actualizable
- [ ] Overlay aparece cuando credits=0
- [ ] Modal de solicitar más funciona
- [ ] postMessage del iframe se procesa correctamente

## Próximo paso

`prompts/mvp/10-admin-base.md`
