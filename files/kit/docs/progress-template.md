# Progress Template

> Este es el template que la IA debe llenar al final de cada sesión. Cada prompt termina pidiendo a la IA que genere `progress-XX.md` siguiendo este formato.

```markdown
# Progress XX — [Nombre de la sesión]

**Fecha**: YYYY-MM-DD
**Duración real**: X horas
**Sesión anterior**: progress-XX.md
**Próxima sesión**: prompts/mvp/XX-yyy.md

## Qué se construyó

- Archivo `X` con `Y` funcionalidad
- ...

## Archivos creados

```
src/
  app/
    api/
      tools/
        claude/
          execute/route.ts     ← endpoint que llama a Anthropic
  lib/
    adapters/
      claude.ts                ← ClaudeAdapter implementation
    anthropic/
      client.ts                ← cliente con retry
```

## Archivos modificados

- `package.json` — agregadas dependencias: `@anthropic-ai/sdk`
- `src/types/db.ts` — regenerado con nuevas tablas
- ...

## Decisiones técnicas tomadas

- Usé X en vez de Y porque Z.
- Modelé la tabla A con columna B porque...

## Cosas pendientes (TODO en código)

- [ ] Implementar rate limiting en endpoint X
- [ ] Agregar test para el caso de imagen muy grande
- ...

## Cosas a tener en cuenta para la próxima sesión

- El componente Z está esperando un prop W que todavía no se pasó.
- La tabla `time_windows` está creada pero vacía — se usa en módulo horarios.
- ...

## Cómo probar lo que se construyó

1. `npm run dev`
2. Ir a http://localhost:3000/...
3. Loguearse como `sofia@nqs.test` / `password123`
4. ...

## Errores conocidos

- (ninguno) / lista de bugs detectados pero no resueltos en esta sesión

## Variables de entorno agregadas

```env
NEW_VAR=value
```

## Commits sugeridos

```
feat(claude): wrapper de API con soporte multimodal
test(claude): tests para casos edge de imágenes
```
```
