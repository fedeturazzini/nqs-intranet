# Audit — "devuelve la respuesta sin el prompt generado" (contenido no visible)

**Fecha:** 2026-07-28 · **Branch:** develop · **Modo:** READ-ONLY (solo lectura, nada modificado).
**Feedback NQS, punto 6:** Claude genera el contenido pero a veces NO se muestra. Se arregla
pidiéndoselo de vuelta o como `.txt`.

## TL;DR — veredicto

**Confirmado: es un bug de PARSEO/RENDER del lado del cliente, no de generación.** El contenido se
genera y se **guarda entero** en la DB (`claude_messages.content`), pero el parser de artifacts lo
**descarta en silencio** cuando el bloque `<function_calls>` no cumple el formato exacto.

La causa raíz principal está en **`src/lib/utils/parse-artifacts.ts:44-53`**: si el bloque de artifact
matchea el regex externo pero no se le puede extraer `type`+`content`, el bloque **no se renderiza ni
como card ni como texto** — se salta entero. **No hay fallback a texto crudo.** Como el modelo cumple
el pseudo-XML *casi siempre* pero no *siempre*, el síntoma es intermitente ("a veces sí, a veces no").

El tema de `max_tokens` (8192 / "continuá") es un caso DISTINTO y ya está *parcialmente* manejado
(muestra una card "cortado"); se solapa poco con este reporte.

---

## 1. El formato de artifact de texto

Definido en las `FORMAT_INSTRUCTIONS` que se appendean al system prompt de cada proyecto:
[`src/lib/adapters/claude.ts:63-102`](nqs-ai-hub/src/lib/adapters/claude.ts:63). Es un **pseudo-XML
propio** (misma sintaxis que Claude.ai / el formato interno de tool-use de Anthropic) que el modelo
tiene que emitir EXACTO:

```
<function_calls>
<invoke name="artifacts">
<parameter name="command">create</parameter>
<parameter name="type">text/plain</parameter>
<parameter name="title">nombre_del_archivo</parameter>
<parameter name="content">contenido completo…</parameter>
</invoke>
</function_calls>
```

- Tipos soportados: `text/plain`, `text/markdown`, `application/vnd.ant.code` (con `language=`).
- Las instrucciones piden: chat breve + el contenido pesado DENTRO del artifact.
- **Riesgo estructural:** todo depende de que el modelo reproduzca 5 etiquetas anidadas con nombres y
  comillas exactos. Cualquier desvío rompe el parseo (ver §2/§3). Es la misma sintaxis que el modelo
  usa para tool-calls REALES, así que tiende a "mejorarla" o namespacearla por su cuenta.

## 2. El parser (cliente)

**Todo el parseo es client-side**, sobre el texto que se va acumulando en streaming y sobre el
mensaje final. El server solo guarda el texto crudo; no interviene en el render.

Archivo: [`src/lib/utils/parse-artifacts.ts`](nqs-ai-hub/src/lib/utils/parse-artifacts.ts).

- **Regex externo** (`ARTIFACT_RE`, línea 33): 
  `/<function_calls>\s*<invoke\s+name="artifacts"\s*>([\s\S]*?)<\/invoke>\s*<\/function_calls>/gi`
  Tolera whitespace y may/min, pero exige: la etiqueta literal `name="artifacts"` **con comillas
  dobles**, y el bloque **cerrado** (`</invoke></function_calls>`). Es **no-greedy** (`*?`).
- **`parseMessageWithArtifacts`** (40-64): itera los matches, arma segmentos texto/artifact en orden.
  Por cada match llama a `parseArtifactBody(match[1])`.
- **`parseArtifactBody`** (134-146): extrae `type` y `content` con `extractParam`. **Si falta
  cualquiera de los dos → devuelve `null`** (línea 138: `if (!type || !content) return null`).
- **`extractParam`** (148-154): `/<parameter name="X">([\s\S]*?)<\/parameter>/` — **no-greedy**,
  **comillas dobles**, exige `</parameter>` de cierre.

**Qué pasa si el bloque viene mal formado (el punto clave):** hay DOS rutas y se comportan distinto:

| Situación | Qué se muestra |
|---|---|
| No hay `<function_calls>` en absoluto (contenido plano) | ✅ Se muestra TODO como texto/markdown (fallback OK) |
| Hay bloque, matchea el regex, pero `parseArtifactBody` → `null` | ❌ **Se descarta en silencio** (ni card ni texto) |
| Bloque sin cerrar (`</function_calls>` nunca llega) | ⚠️ Se recupera parcial vía `extractPartialArtifact` |

La ruta ❌ es el bug. En el loop (44-53):
```ts
const artifact = parseArtifactBody(match[1]);
if (artifact) segments.push({ kind: "artifact", artifact }); // ← si es null, NO pushea nada
lastIndex = idx + match[0].length;                           // ← pero AVANZA saltando el bloque
```
El texto de ANTES y DESPUÉS del bloque se conserva; el **contenido del bloque (el prompt generado) se
pierde**. No cae a texto crudo. Silencioso.

**¿Stream o mensaje final?** Ambos: `AssistantContent` re-parsea el `content` acumulado en cada render
([`ChatMessages.tsx:311-353`](nqs-ai-hub/src/components/tool/ChatMessages.tsx:311)). El hook acumula
los deltas en `acc` y setea `streaming:true` durante el stream, `streaming:false` en el `done`
([`useClaudeChat.ts:296-350`](nqs-ai-hub/src/lib/hooks/useClaudeChat.ts:296)). Durante el stream, si
hay un `<function_calls>` abierto, `AssistantContent` **corta el `visible`** en el último
`<function_calls>` (líneas 327-329) y muestra un placeholder "generando…" — o sea sí puede quedar "a
mitad de una etiqueta", pero eso se resuelve al cerrar el stream (ver §5). El problema grave NO es el
stream a medias: es el bloque **completo pero no-parseable** que se tira en silencio.

## 3. Casos concretos que rompen (dejan el contenido invisible)

Todos estos hacen que `parseArtifactBody` devuelva `null` (o que el regex externo matchee mal) →
**bloque descartado**:

1. **Falta o queda vacío `<parameter name="content">`** (o `type`) → `null` → descarta. (El caso más
   directo: el modelo abre el content pero no lo cierra con `</parameter>` antes del `</invoke>`.)
2. **`content` sin `</parameter>` de cierre** → `extractParam` no matchea (es no-greedy y exige cierre)
   → content vacío → `null`.
3. **El contenido del artifact contiene `</parameter>`, `</invoke>` o `</function_calls>`** (ej. pedís
   un prompt/código que menciona estas etiquetas, o XML/HTML): el no-greedy corta ANTES de tiempo →
   content truncado o el bloque externo cierra donde no debe → `null` o contenido mocho.
4. **Nombre de parámetro namespaced o distinto** (`antml:parameter`, `name="contents"`, `name='content'`
   con comilla simple) → `extractParam` no matchea → `null`. Muy plausible: el modelo está entrenado
   fuerte en el formato de tool-use REAL y a veces lo namespacea.
5. **`name='artifacts'` con comilla simple, o `name="artifact"` singular** → el regex EXTERNO no matchea
   → cae a la ruta "sin wrapper": acá **sí se ve** (como texto, con los tags limpiados por
   `cleanResidualTags`). Menos grave.
6. **Artifact dentro de un ```` ``` ```` code fence**: el regex igual matchea el `<function_calls>`
   interno → si el body está bien, renderiza card + backticks sueltos como texto (glitch menor). Si el
   fence además desordena el formato, cae en 1-4.
7. **Múltiples artifacts / `<function_calls>` mencionado en prosa**: desbalancea el conteo
   `open>close` de `hasIncompleteArtifact` → `AssistantContent` corta `visible` en el ÚLTIMO
   `<function_calls>` y puede ocultar texto legítimo posterior o generar una card "cortado" espuria.
8. **Contenido SIN wrapper** (el modelo devuelve el prompt como markdown pelado): ✅ **se ve bien**.
   Por eso el workaround "pedíselo de vuelta / como .txt" funciona: muchas veces termina emitiéndolo
   como texto plano, que sí renderiza.

**El más probable dado "a veces sí, a veces no":** los casos **1-4** — desvíos finos en el pseudo-XML
del `content`/`parameter` (cierre faltante, namespace, comillas), que el modelo comete de forma
probabilística y más seguido cuanto más largo/complejo es el contenido. Cualquiera de ellos, combinado
con la **ausencia de fallback**, produce exactamente el síntoma: el texto conversacional aparece, el
prompt no.

## 4. El fallback (o su ausencia)

- **Sin `<function_calls>` alguno** → hay fallback: todo el mensaje se muestra como texto
  ([`parse-artifacts.ts:60-62`](nqs-ai-hub/src/lib/utils/parse-artifacts.ts:60)).
- **Con `<function_calls>` que no parsea** → **NO hay fallback**: el bloque se descarta (§2). El
  contenido llegó y está guardado, pero se tira en el render.

Esa **asimetría es el bug de UX**: el parser confía en el bloque cuando matchea el regex externo, pero
si el body no rinde un artifact válido, no vuelve atrás a "mostralo como texto". El contenido existe en
`claude_messages.content` (se puede confirmar reabriendo la conversación: se re-renderiza con el mismo
parser y vuelve a faltar — prueba de que es render, no generación).

## 5. ¿Influye el max_tokens / el corte?

**Se solapa poco y ya está mayormente manejado.** Si la respuesta se corta por `max_tokens` a mitad de
un artifact, el `</function_calls>` nunca llega → `hasIncompleteArtifact` true → al terminar el stream
(`!streaming`), `AssistantContent` llama a `extractPartialArtifact`
([`ChatMessages.tsx:336-337,350`](nqs-ai-hub/src/components/tool/ChatMessages.tsx:336)) y muestra una
**card parcial con badge "cortado"** + el aviso "⚠ Respuesta cortada… continuá". O sea, en el caso de
corte **se muestra algo** (parcial), no queda en blanco.

- Por eso el corte NO explica el síntoma "respuesta sin NADA del prompt": ese es el silent-drop de §2.
- Matices donde el corte sí puede dejar poco/nada: si corta antes de abrir `<parameter name="content">`
  (card parcial vacía), o si `extractPartialArtifact` no matchea porque el `<invoke>` quedó mocho.
- El fix de `max_tokens` de esta sesión (8192 → 32K/64K por modelo) **reduce la frecuencia** de cortes
  mid-artifact, pero **no toca** la causa principal (el silent-drop es independiente del largo).

## 6. Veredicto y recomendación de enfoque (SIN implementar)

**Causa principal (confirmada):** silent-drop en `parseMessageWithArtifacts` — un bloque de artifact
que matchea el wrapper pero no rinde `type`+`content` se descarta sin fallback
([`parse-artifacts.ts:50-52`](nqs-ai-hub/src/lib/utils/parse-artifacts.ts:50)). Disparado por desvíos
finos del modelo en el pseudo-XML (§3, casos 1-4).

**Causa secundaria:** parser frágil por diseño — regex no-greedy + comillas/nombres exactos + sin
tolerancia a contenido que contenga las propias etiquetas.

**Recomendación de fix (a definir en el próximo paso), de más barato a más de fondo:**

1. **Fallback anti silent-drop (imprescindible, 1 cambio):** si el bloque matchea el wrapper pero
   `parseArtifactBody` devuelve `null`, **no descartarlo** — mostrar su contenido como texto (pasarlo
   por `cleanResidualTags` y renderizar markdown). Con esto, aunque el card no se arme, el prompt
   SIEMPRE aparece. Elimina el síntoma reportado con riesgo mínimo.
2. **Parser más tolerante:** aceptar comillas simples/dobles, prefijos de namespace (`antml:`),
   `name` variantes; extraer `content` hasta `</parameter>` **o** hasta `</invoke>`/fin si no cierra;
   manejar contenido que contenga las etiquetas (tomar el último cierre / balanceo, no el primero).
3. **Cerrar artifacts abiertos al final del stream:** ya existe para el corte (`extractPartialArtifact`);
   extender la misma tolerancia al caso "completo pero no parseable".
4. **De fondo (recomendado a mediano plazo):** salir del pseudo-XML frágil para TEXTO. Opciones:
   (a) renderizar el contenido largo inline como markdown (la ruta de texto plano ya es la confiable),
   o (b) usar tool-use / structured outputs REALES de Anthropic para los artifacts, en vez de parsear
   un pseudo-XML del texto. Esto saca de raíz la dependencia de que el modelo formatee perfecto.
   (La generación de BINARIOS ya usa code execution real; el frágil es solo el artifact de texto.)

**Sugerencia:** arrancar por el **#1** (fallback) para matar el síntoma ya, y evaluar #2/#4 para robustez.

---

### Archivos revisados
- [`src/lib/adapters/claude.ts`](nqs-ai-hub/src/lib/adapters/claude.ts) — `FORMAT_INSTRUCTIONS`, persistencia del texto crudo.
- [`src/lib/utils/parse-artifacts.ts`](nqs-ai-hub/src/lib/utils/parse-artifacts.ts) — parser (causa raíz).
- [`src/components/tool/ChatMessages.tsx`](nqs-ai-hub/src/components/tool/ChatMessages.tsx) — `AssistantContent` (render, truncación de stream, card parcial).
- [`src/lib/hooks/useClaudeChat.ts`](nqs-ai-hub/src/lib/hooks/useClaudeChat.ts) — acumulación del stream, `streaming`, `stopReason`.
