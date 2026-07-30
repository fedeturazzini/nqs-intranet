/**
 * Parser de artifacts de Claude.
 *
 * Claude puede emitir contenido largo dentro de un bloque
 * `<function_calls><invoke name="artifacts">…</invoke></function_calls>`
 * (mismo formato que Claude.ai). Acá lo separamos del texto conversacional
 * para renderizar: texto → markdown, artifact → card descargable.
 *
 * Convención del proyecto: `type`, no `interface`.
 */

export type ParsedArtifact = {
  command: "create" | "update" | "rewrite";
  /** MIME del artifact: text/plain, text/markdown, application/vnd.ant.code, … */
  type: string;
  /** Nombre del archivo (sin extensión necesariamente). */
  title: string;
  /** Contenido completo. */
  content: string;
  /** Lenguaje, para artifacts de código. */
  language?: string;
};

export type MessageSegment =
  | { kind: "text"; content: string }
  | { kind: "artifact"; artifact: ParsedArtifact };

export type ParsedMessage = { segments: MessageSegment[] };

// `g` para iterar todos los artifacts. Usamos matchAll (no exec) para no
// arrastrar `lastIndex` entre llamadas. Tolerante a whitespace y a may/min
// (`\s+`, `\s*`, flag `i`) porque el modelo no siempre formatea igual.
const ARTIFACT_RE =
  /<function_calls>\s*<invoke\s+name="artifacts"\s*>([\s\S]*?)<\/invoke>\s*<\/function_calls>/gi;

/**
 * Separa el mensaje en segmentos de texto y artifacts, en orden. Si no hay
 * artifacts, devuelve un único segmento de texto con todo el contenido.
 */
export function parseMessageWithArtifacts(content: string): ParsedMessage {
  const segments: MessageSegment[] = [];
  let lastIndex = 0;

  for (const match of content.matchAll(ARTIFACT_RE)) {
    const idx = match.index ?? 0;
    if (idx > lastIndex) {
      const before = cleanResidualTags(content.slice(lastIndex, idx));
      if (before) segments.push({ kind: "text", content: before });
    }
    const artifact = parseArtifactBody(match[1]);
    if (artifact) {
      segments.push({ kind: "artifact", artifact });
    } else {
      // FALLBACK anti silent-drop (prompt-no-visible-audit.md). El bloque matcheó
      // el wrapper pero no rinde un artifact válido (falta type/content, nombre de
      // parámetro raro, comillas simples, el contenido incluye las propias
      // etiquetas…). ANTES se descartaba EN SILENCIO: el user veía la respuesta
      // conversacional y el prompt no aparecía en ningún lado. Mejor mostrarlo
      // como texto que perderlo.
      const salvaged = salvageArtifactText(match[1]);
      if (salvaged) segments.push({ kind: "text", content: salvaged });
    }
    lastIndex = idx + match[0].length;
  }

  if (lastIndex < content.length) {
    const after = cleanResidualTags(content.slice(lastIndex));
    if (after) segments.push({ kind: "text", content: after });
  }

  if (segments.length === 0) {
    // Última red: nunca renderizar un mensaje vacío. Pelamos también la metadata
    // del artifact para no mostrar "text/plain" ni el título como si fueran el
    // contenido (pasa cuando el mensaje ES sólo un bloque sin `content` usable).
    segments.push({
      kind: "text",
      content: cleanResidualTags(stripMetaParams(content)),
    });
  }
  return { segments };
}

/**
 * True si hay un `<function_calls>` abierto sin cerrar — pasa durante el
 * streaming, mientras el artifact todavía está llegando. La UI muestra un
 * placeholder "generando…" en ese caso.
 */
export function hasIncompleteArtifact(content: string): boolean {
  const open = (content.match(/<function_calls>/g) ?? []).length;
  const close = (content.match(/<\/function_calls>/g) ?? []).length;
  return open > close;
}

/**
 * True si hay un `<thinking>` abierto sin cerrar — pasa durante el streaming
 * mientras Claude escribe su razonamiento. La UI oculta lo que sigue al
 * `<thinking>` abierto y muestra el indicador "pensando".
 */
export function hasIncompleteThinking(content: string): boolean {
  const open = (content.match(/<thinking>/gi) ?? []).length;
  const close = (content.match(/<\/thinking>/gi) ?? []).length;
  return open > close;
}

/**
 * Limpia tags de artifacts que hayan quedado sueltos en un segmento de texto
 * (ej. un `</invoke></function_calls>` duplicado que el modelo dejó después de
 * la card). Evita que se vean tags crudos en el chat.
 */
function cleanResidualTags(text: string): string {
  return text
    // Bloques <thinking>…</thinking> completos (razonamiento interno que el
    // user no debe ver). Va primero, antes de borrar tags sueltos.
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
    .replace(/<\/?thinking[^>]*>/gi, "")
    .replace(/<\/?function_calls\s*>/gi, "")
    .replace(/<\/?invoke[^>]*>/gi, "")
    .replace(/<\/?parameter[^>]*>/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Rescata el texto de un bloque de artifact que NO se pudo parsear como artifact
 * válido, para NO descartarlo en silencio (ver prompt-no-visible-audit.md): el
 * user prefiere ver el prompt como texto plano antes que no verlo.
 *
 * Va de lo más específico a lo más tolerante:
 *   1. el `content` aceptando prefijo de namespace (`antml:parameter`), comillas
 *      simples/dobles/ninguna, y SIN exigir el `</parameter>` de cierre (un corte
 *      por max_tokens lo deja abierto);
 *   2. si nada de eso matchea, el cuerpo entero del bloque con los tags pelados.
 */
function salvageArtifactText(body: string): string {
  const tolerant = body.match(
    /<[\w:]*parameter\s+name=['"]?content['"]?\s*>([\s\S]*?)(?:<\/[\w:]*parameter>|$)/i,
  );
  if (tolerant) return cleanResidualTags(tolerant[1]);
  // Sin un `content` reconocible, lo que quede después de pelar la metadata es
  // contenido real con un nombre de parámetro inesperado (ej. `contenido`) — eso
  // es justo lo que no queremos perder.
  return cleanResidualTags(stripMetaParams(body));
}

/**
 * Pela los parámetros de METADATA de un artifact (command/type/title/language)
 * con su valor. Sirve para no mostrar "text/plain" o el título como si fueran el
 * contenido cuando caemos a un camino de rescate. Tolerante a namespace y a
 * comillas simples/dobles/ninguna, y al cierre faltante.
 */
function stripMetaParams(text: string): string {
  return text.replace(
    /<[\w:]*parameter\s+name=['"]?(?:command|type|title|language)['"]?\s*>[\s\S]*?(?:<\/[\w:]*parameter>|$)/gi,
    "",
  );
}

/**
 * Extrae lo que se alcanzó a generar de un artifact que quedó incompleto
 * (cortado por max_tokens: nunca llegó el </function_calls>). Se muestra como
 * card "incompleta" con el contenido parcial, en vez de un placeholder colgado.
 */
export function extractPartialArtifact(content: string): ParsedArtifact | null {
  const match = content.match(/<function_calls>\s*<invoke[^>]*>([\s\S]*)/i);
  if (!match) return null;
  const body = match[1];
  return {
    command: (extractParam(body, "command") ||
      "create") as ParsedArtifact["command"],
    type: extractParam(body, "type") || "text/plain",
    title: `${extractParam(body, "title") || "archivo-parcial"} (cortado)`,
    content: extractParam(body, "content") || extractOpenContent(body),
    language: extractParam(body, "language") || undefined,
  };
}

/** Contenido de un `<parameter name="content">` que quedó sin cerrar. */
function extractOpenContent(body: string): string {
  const m = body.match(/<parameter name="content">([\s\S]*)$/i);
  if (!m) return "";
  return m[1]
    .replace(/<\/?(parameter|invoke|function_calls)[^>]*>/gi, "")
    .trim();
}

function parseArtifactBody(body: string): ParsedArtifact | null {
  const type = extractParam(body, "type");
  const content = extractParam(body, "content");
  // Sin type o sin content no es un artifact renderizable.
  if (!type || !content) return null;

  const command = (extractParam(body, "command") ||
    "create") as ParsedArtifact["command"];
  const title = extractParam(body, "title") || "untitled";
  const language = extractParam(body, "language") || undefined;

  return { command, type, title, content, language };
}

function extractParam(body: string, name: string): string {
  const re = new RegExp(
    `<parameter name="${name}">([\\s\\S]*?)</parameter>`,
  );
  const m = body.match(re);
  return m ? m[1].trim() : "";
}

/**
 * Analiza si el mensaje INTENTÓ emitir un artifact y si se pudo parsear bien —
 * para el log de diagnóstico `execute.summary` (adapters/claude.ts, aux-audit
 * prompt-no-visible). Reusa `parseMessageWithArtifacts` / `hasIncompleteArtifact`,
 * no duplica el regex.
 */
export type ArtifactAttempt = {
  /** Hubo un `<function_calls>` en el texto (intentó emitir un artifact). */
  attempted: boolean;
  /** El parser encontró un artifact VÁLIDO (type + content parseables). */
  detected: boolean;
  /**
   * Solo si attempted && !detected — por qué falló:
   *   - "unclosed": el bloque nunca cerró (cortado por max_tokens u otro corte).
   *   - "missing_type_or_content": cerró pero sin `type`/`content` parseables
   *     (el bug de "prompt no visible": nombre de parámetro raro, comillas
   *     simples, contenido con las propias etiquetas, etc. — ver
   *     prompt-no-visible-audit.md).
   */
  reason?: "unclosed" | "missing_type_or_content";
};

export function analyzeArtifactAttempt(content: string): ArtifactAttempt {
  const attempted = /<function_calls>/i.test(content);
  if (!attempted) return { attempted: false, detected: false };

  const { segments } = parseMessageWithArtifacts(content);
  if (segments.some((s) => s.kind === "artifact")) {
    return { attempted: true, detected: true };
  }
  return {
    attempted: true,
    detected: false,
    reason: hasIncompleteArtifact(content)
      ? "unclosed"
      : "missing_type_or_content",
  };
}
