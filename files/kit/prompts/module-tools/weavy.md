# Módulo Tools — Weavy

## Objetivo

Integrar Weavy (workflows visuales sobre Stable Diffusion + ControlNet) al stack del hub.

**Duración**: 2.5 horas

---

## CONTEXTO ESPECÍFICO

- Weavy NO tiene API pública (verificado).
- Funciona como app web tipo Figma Weave.
- NQS tiene cuenta y workflows pre-armados.
- Opciones de integración:
  - **B**: Iframe + proxy (similar a 3DSky).
  - **C**: Iframe directo con SSO compartido.

Recomendación: opción C si Weavy lo permite, C es más simple.

---

## PROMPT

```
Integramos Weavy al NQS AI Hub.

Pre-requisito: leé `prompts/module-tools/_template.md` para entender el flow general.

OBJETIVO ESPECÍFICO DE WEAVY:
- Permitir embedding de workflows ya creados.
- No usa créditos en el MVP (suma de costos viene aparte).
- Validar acceso vía nuestro middleware.

DECISIONES PREVIAS QUE NECESITÁS CONFIRMAR CON NQS:
1. ¿Weavy permite iframe sin auth adicional, o necesita proxy?
2. ¿Hay un workflow "default" que el user ve al abrir? ¿O ven todos los del workspace?
3. ¿Hay límite de uso (compute, time) que controlar desde el hub?

PASOS:

1. Adapter `src/lib/adapters/weavy.ts`:
   - id: 'weavy', category: 'visual', usesCredits: false, isEmbedded: true.
   - `checkAccess`: standard tool_access lookup.
   - `getEmbedUrl`: devuelve URL de Weavy. Si necesita auth, generar magic link con token firmado.
   - `logUsage`: standard.

2. Si necesita proxy (opción B):
   - NQS debe configurar proxy en `weavy.nqs.com.ar`.
   - Endpoints `/api/tools/weavy/check-access` y `/api/tools/weavy/log-usage` para que el proxy consulte.

3. Vista `src/components/screens/WeavyView.tsx`:
   - Similar a `ThreeDSkyView` pero sin créditos.
   - Header con info: "Workspace NQS · X workflows disponibles".
   - Iframe a `getEmbedUrl()`.
   - Preloader del cliente (`<EmbeddedSite />`).

4. Si NQS quiere limitar workflows visibles, agregar tabla:
   ```sql
   CREATE TABLE weavy_workflows (
     id UUID PRIMARY KEY,
     weavy_workflow_id TEXT,
     name TEXT,
     description TEXT,
     thumbnail_url TEXT,
     is_public BOOLEAN DEFAULT TRUE,  -- visible para todos
     created_at TIMESTAMPTZ DEFAULT NOW()
   );
   ```
   - Y vista alternativa donde primero se selecciona workflow → luego abre Weavy con ese workflow.

5. Activar:
   - `UPDATE tools SET is_active = true WHERE id = 'weavy';`
   - Asignar tool_access a empleados que correspondan.

6. Test manual:
   - Loguearse como Sofia con acceso a Weavy.
   - Abrir Weavy desde el hub.
   - Verificar que el iframe carga sin pedir auth adicional.
   - Verificar que el uso se loguea.

7. Commit.

AL FINAL:
`progress-weavy.md` con detalles de la integración elegida.
```

---

## VALIDACIÓN

- [ ] Weavy se abre desde el hub
- [ ] Auth compartida funciona (no pide login adicional)
- [ ] Logs registran apertura
- [ ] Permisos respetados
