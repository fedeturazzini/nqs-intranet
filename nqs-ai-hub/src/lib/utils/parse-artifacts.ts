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
// arrastrar `lastIndex` entre llamadas.
const ARTIFACT_RE =
  /<function_calls>\s*<invoke name="artifacts">([\s\S]*?)<\/invoke>\s*<\/function_calls>/g;

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
      const before = content.slice(lastIndex, idx).trim();
      if (before) segments.push({ kind: "text", content: before });
    }
    const artifact = parseArtifactBody(match[1]);
    if (artifact) segments.push({ kind: "artifact", artifact });
    lastIndex = idx + match[0].length;
  }

  if (lastIndex < content.length) {
    const after = content.slice(lastIndex).trim();
    if (after) segments.push({ kind: "text", content: after });
  }

  if (segments.length === 0) segments.push({ kind: "text", content });
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
