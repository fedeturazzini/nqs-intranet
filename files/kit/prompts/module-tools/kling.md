# Módulo Tools — Kling

## Objetivo

Integrar Kling (generación de video con IA, Kuaishou) al stack del hub.

**Duración**: 3 horas

---

## CONTEXTO ESPECÍFICO

- Kling **TIENE API pública** desde Kuaishou.
- Documentación: https://klingai.com/api-docs (verificar al implementar).
- Modelo de costos: por segundo de video generado.
- Async: el endpoint inicia generación y devuelve task_id; se hace polling para obtener resultado.

---

## PROMPT

```
Integramos Kling al NQS AI Hub.

Pre-requisito: leé `prompts/module-tools/_template.md`.

OBJETIVO:
Wrapper sobre la API de Kling con UI propia (no iframe, opción A).

PASOS:

1. Investigar API de Kling actual:
   - Revisar docs vigentes.
   - Identificar endpoint de generación, parámetros, modelo de async/sync.
   - Obtener API key (NQS la provee).

2. Adapter `src/lib/adapters/kling.ts`:
   - id: 'kling', category: 'video', usesCredits: true (por segundo de video).
   - `execute(userId, params)`:
     - params: { prompt, durationSeconds, aspectRatio, model, sourceImage? }.
     - Llama a Kling API: POST /generate.
     - Devuelve task_id.
   - `getTaskStatus(taskId)`: nuevo método específico de tools async.
     - Llama a Kling API: GET /tasks/:id.
     - Devuelve { status: 'pending' | 'processing' | 'completed' | 'failed', result?: { videoUrl } }.
   - `consumeCredit`: descuenta créditos según duración del video.

3. Schema de DB para tasks:
   ```sql
   CREATE TABLE generation_tasks (
     id UUID PRIMARY KEY,
     user_id UUID REFERENCES users(id),
     tool_id TEXT REFERENCES tools(id),
     external_task_id TEXT,
     status TEXT,
     params JSONB,
     result JSONB,
     credits_reserved INT,
     created_at TIMESTAMPTZ DEFAULT NOW(),
     completed_at TIMESTAMPTZ
   );
   ```
   - Tabla genérica para todas las tools async (Kling, Runway).

4. Endpoints:
   - `POST /api/tools/kling/generate`: inicia generación. Reserva créditos.
   - `GET /api/tools/kling/tasks/:id`: status de un task del user.
   - `GET /api/tools/kling/history`: historial de generaciones del user.

5. Polling vs Webhooks:
   - Kling soporta webhook si lo configurás.
   - Recomendación: webhook si está disponible (más eficiente).
   - Endpoint `POST /api/webhooks/kling`: recibe notif de completed.

6. Vista `src/components/screens/KlingView.tsx`:
   - Form de generación:
     - Textarea: prompt.
     - Slider: duración (3, 5, 10 segundos).
     - Selector: aspect ratio (16:9, 9:16, 1:1).
     - Selector: modelo (Kling 1.0, 2.0 si están).
     - Upload opcional: imagen base.
     - Cuenta créditos estimados que se van a consumir.
   - Botón "generar".
   - Lista lateral: generaciones recientes con thumbnails y status.

7. Cuando el video está listo:
   - Notif al user (toast).
   - Player de video inline.
   - Botón "descargar" (Supabase Storage o link directo).

8. Manejo de créditos:
   - Al iniciar generación, reserva créditos (no descuenta todavía).
   - Si la generación falla, devolver créditos.
   - Si exitosa, confirmar consumo.

9. Test manual:
   - Generar video corto.
   - Esperar a que termine (1-2 min típicamente).
   - Ver resultado.
   - Descargar.

10. Commit.

AL FINAL:
`progress-kling.md`.
```

---

## VALIDACIÓN

- [ ] Generación inicia correctamente
- [ ] Webhook (o polling) actualiza el status
- [ ] Video se reproduce en el browser
- [ ] Créditos se descuentan correctamente
- [ ] Falla → créditos vueltos
