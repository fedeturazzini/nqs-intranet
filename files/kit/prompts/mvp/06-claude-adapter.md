# Sesión 06 — ToolAdapter pattern + ClaudeAdapter

## Objetivo

Implementar el patrón ToolAdapter (crítico para escalabilidad) y el primer adapter completo: Claude. Backend solo, sin UI todavía.

**Duración**: 3 horas
**Output**: endpoint funcional que recibe prompt + imágenes y devuelve respuesta de Claude usando el prompt padre.

---

## PROMPT

```
Sesión 06 del NQS AI Hub.

ESTADO ACTUAL:
Leé `progress-05.md`.

OBJETIVO:
Implementar el patrón ToolAdapter y construir el ClaudeAdapter completo. Backend listo para llamar a la API de Anthropic con el cerebro como system prompt.

REFERENCIA CRÍTICA:
Leé `kit/reference/tool-adapter-pattern.ts` completo. Ese archivo tiene la interfaz exacta y un ejemplo de implementación.

PASOS:

1. Instalar SDK de Anthropic:
   - `npm install @anthropic-ai/sdk`

2. Crear `src/lib/adapters/types.ts`:
   - Definir todos los tipos compartidos: `ToolId`, `AccessState`, `ExecuteParams`, `ExecuteResult`, `Result<T, E>`.
   - Definir la interfaz `ToolAdapter` exactamente como está en `kit/reference/tool-adapter-pattern.ts`.

3. Crear `src/lib/adapters/index.ts`:
   - Registry de adapters.
   - Función `getAdapter(toolId)`.
   - Función `createPlaceholderAdapter()` para tools "próximamente".

4. Crear `src/lib/adapters/utils.ts`:
   - Helper `logToolUsage(params)` que escribe en `usage_logs`.

5. Crear `src/lib/anthropic/client.ts`:
   - Instancia única de Anthropic SDK con API key.
   - Helper `callClaude(systemPrompt, messages, options)` con:
     - model: 'claude-sonnet-4-6'
     - max_tokens: 4096 (configurable)
     - retry con backoff exponencial (3 intentos)
     - timeout de 60s
     - logging de tokens consumidos
   - Manejo de errores tipados.

6. Crear `src/lib/adapters/claude.ts`:
   - Implementar `ClaudeAdapter` que cumple la interfaz `ToolAdapter`.
   - Métodos:
     - `id: 'claude'`, `category: 'text'`, `usesCredits: false`, `isEmbedded: false`.
     - `checkAccess(userId)`: query a tool_access.
     - `logUsage(userId, action, metadata)`: llama a `logToolUsage`.
     - `execute(userId, params)`:
       1. Traer system_prompt activo de Claude (desencriptado).
       2. Armar `messages` con el user content (texto + imágenes en formato Anthropic).
       3. Llamar a `callClaude(systemPrompt, messages)`.
       4. Guardar mensajes en `claude_conversations` y `claude_messages`.
       5. Loguear en `usage_logs` con tokens consumidos.
       6. Devolver `Result<ExecuteResult>`.

7. Crear `src/lib/adapters/three-dsky.ts` (placeholder por ahora, se completa en sesión 08):
   - Stub con la estructura pero los métodos lanzan "not implemented" excepto `checkAccess`.

8. Implementar middleware de permisos en `src/lib/middleware/permissions.ts`:
   - Copiar de `kit/reference/middleware-permissions.ts`.
   - Implementar TODOS los checks del MVP (auth, tool_access, créditos si aplica).
   - Comentar los checks `[FUTURE]` con TODO claros.

9. Crear endpoint `src/app/api/tools/claude/execute/route.ts`:
   - POST handler.
   - Valida sesión.
   - Llama a `requireToolAccess(userId, 'claude')`.
   - Recibe body validado con Zod:
     ```typescript
     const ExecuteSchema = z.object({
       prompt: z.string().min(1).max(10000),
       images: z.array(z.object({
         type: z.literal('base64'),
         media_type: z.enum(['image/jpeg', 'image/png', 'image/gif', 'image/webp']),
         data: z.string(),
       })).max(5).optional(),
       conversationId: z.string().uuid().optional(),
     });
     ```
   - Llama a `claudeAdapter.execute(userId, params)`.
   - Devuelve la respuesta o error.

10. Crear `src/app/api/me/conversations/route.ts` (GET):
    - Lista conversaciones del usuario actual.
    - Ordenadas por updated_at desc.
    - Limit 20.

11. Crear `src/app/api/me/conversations/[id]/route.ts` (GET):
    - Mensajes de una conversación.
    - Valida que la conversation pertenezca al user (RLS lo hace pero por las dudas).

12. Test manual con curl o Postman:
    - Loguearse y obtener cookie de sesión.
    - POST a `/api/tools/claude/execute` con:
      ```json
      { "prompt": "Hola, ¿quién sos?" }
      ```
    - Debería responder con texto de Claude.
    - Verificar que se creó registro en `claude_conversations`, `claude_messages` y `usage_logs`.

13. Instalar zod si no está: `npm install zod`.

14. Commit.

REGLAS CRÍTICAS:
- El `system_prompt` NUNCA se devuelve en la response. Solo se usa internamente.
- Las imágenes se mandan como base64 (formato Anthropic Multimodal API).
- Si la API de Anthropic falla, devolver error genérico al cliente, NO el mensaje crudo de Anthropic.
- Cada llamada SI O SI loguea en usage_logs (transacción).

DOCUMENTACIÓN DE ANTHROPIC API:
- Multimodal: https://docs.claude.com/en/docs/build-with-claude/vision
- Streaming (no usar en MVP, dejar para v2)

AL FINAL:
`progress-06.md` con:
- Adapter de Claude funcional
- Endpoint probado con curl
- Próximo paso: `prompts/mvp/07-claude-view.md`
```

---

## VALIDACIÓN

- [ ] `POST /api/tools/claude/execute` con `{ prompt: "hola" }` devuelve respuesta
- [ ] Se crea registro en `claude_conversations` y `claude_messages`
- [ ] Se crea registro en `usage_logs`
- [ ] Si Sofia no tiene tool_access (probar removiendo manualmente), el endpoint devuelve 403
- [ ] El system_prompt NO aparece en la response
- [ ] Probar con imagen base64 funciona también

## Próximo paso

`prompts/mvp/07-claude-view.md`
