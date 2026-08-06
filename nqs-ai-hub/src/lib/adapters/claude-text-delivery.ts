import type { ClaudeResponse } from "@/lib/anthropic/client";
import {
  analyzeArtifactAttempt,
  parseMessageWithArtifacts,
} from "@/lib/utils/parse-artifacts";

export type TextDeliveryIntent = {
  format: "txt" | "md";
  filename: string;
};

export type TextDeliveryContext = {
  previousUserPrompt?: string | null;
  previousAssistantText?: string | null;
  recentMessages?: Array<{
    role: string;
    content: string;
  }>;
};

const DELIVERY_ACTION =
  /\b(?:gener|cre|arm|hac|mand|envi|pas|devolv|entreg|export|guard|descarg|convert|prepar|quier|necesit|dame|d[áa]|create|generate|make|send|give|return|export|save|download|convert)\w*/i;
const TXT_MARKER =
  /(?:\.txt\b|\b(?:formato\s+)?txt\b|\barchivo\s+de\s+texto\b)/i;
const MD_MARKER =
  /(?:\.md\b|\b(?:formato\s+)?markdown\b|\barchivo\s+markdown\b)/i;
const TERSE_FORMAT_REQUEST =
  /^(?:(?:en|como)\s+)?(?:archivo\s+)?(?:\.?txt|\.?md|markdown)[.!]?\s*$/i;
const NAMED_FILENAME =
  /(?:como|as|llamad[oa]|named|archivo|file)\s+["'`]?([a-z0-9][a-z0-9 _.-]{0,80}\.(?:txt|md))\b/i;
const SIMPLE_FILENAME = /([a-z0-9][a-z0-9_-]{0,80}\.(?:txt|md))\b/i;
const DELIVERY_FOLLOW_UP =
  /\b(?:no\s+(?:lo\s+)?(?:veo|encuentro|aparece)|no\s+(?:lleg[oó]|vino)|falt\w*|de\s+nuevo|otra\s+vez|reintent\w*|regener\w*|actualiz\w*|modific\w*|cambi\w*|correg\w*|ajust\w*|volv(?:amos|é|e)\s+a)\b/i;
const TEXT_DELIVERY_OPT_OUT =
  /\b(?:sin\s+(?:artifact|\.?txt|archivo)|directamente\s+en\s+el\s+chat|solo\s+(?:por|en)\s+el\s+chat|no\s+(?:uses?|quiero)\s+(?:artifact|\.?txt|archivo))\b/i;

/** Mínimo de contenido para no reparar un falso positivo conversacional. */
const MIN_REPAIR_CONTENT_CHARS = 80;

function safeFilename(prompt: string, format: "txt" | "md"): string {
  const requested =
    prompt.match(NAMED_FILENAME)?.[1] ?? prompt.match(SIMPLE_FILENAME)?.[1];
  if (!requested) return `respuesta-claude.${format}`;
  const cleaned = requested
    .replace(/[/\\<>:"|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || `respuesta-claude.${format}`;
}

function explicitIntent(prompt: string): TextDeliveryIntent | null {
  if (
    !DELIVERY_ACTION.test(prompt) &&
    !TERSE_FORMAT_REQUEST.test(prompt.trim())
  ) {
    return null;
  }
  const format = MD_MARKER.test(prompt)
    ? "md"
    : TXT_MARKER.test(prompt)
      ? "txt"
      : null;
  return format ? { format, filename: safeFilename(prompt, format) } : null;
}

function previousArtifactIntent(
  content: string | null | undefined,
): TextDeliveryIntent | null {
  if (!content) return null;
  const artifacts = parseMessageWithArtifacts(content).segments
    .filter((segment) => segment.kind === "artifact")
    .map((segment) => segment.artifact);
  const artifact = artifacts
    .reverse()
    .find(
      (candidate) =>
        candidate.type === "text/plain" ||
        candidate.type === "text/markdown",
    );
  if (!artifact) return null;
  const format = artifact.type === "text/markdown" ? "md" : "txt";
  const title = artifact.title.trim();
  return {
    format,
    filename: title.toLowerCase().endsWith(`.${format}`)
      ? title
      : `${title || "respuesta-claude"}.${format}`,
  };
}

function recentContextIntent(
  messages: TextDeliveryContext["recentMessages"],
): TextDeliveryIntent | null {
  if (!messages) return null;
  for (const message of [...messages].reverse()) {
    if (message.role === "user") {
      if (TEXT_DELIVERY_OPT_OUT.test(message.content)) return null;
      const intent = explicitIntent(message.content);
      if (intent) return intent;
    } else if (message.role === "assistant") {
      const intent = previousArtifactIntent(message.content);
      if (intent) return intent;
    }
  }
  return null;
}

/**
 * Detecta solo pedidos EXPLÍCITOS de entrega textual. Mencionar/adjuntar un
 * `.txt` para analizarlo no alcanza: también tiene que haber una acción de
 * creación, envío, exportación o descarga. Para un seguimiento inequívoco
 * ("no lo veo", "cambialo", "de nuevo"), hereda el formato del pedido o
 * artifact inmediatamente anterior.
 */
export function detectTextDeliveryIntent(
  prompt: string,
  context: TextDeliveryContext = {},
): TextDeliveryIntent | null {
  const direct = explicitIntent(prompt);
  if (direct) return direct;
  if (!DELIVERY_FOLLOW_UP.test(prompt)) return null;
  return (
    recentContextIntent(context.recentMessages) ??
    explicitIntent(context.previousUserPrompt ?? "") ??
    previousArtifactIntent(context.previousAssistantText) ??
    null
  );
}

export function hasDeliveredTextArtifact(response: ClaudeResponse): boolean {
  return (
    analyzeArtifactAttempt(response.text).detected ||
    (response.generatedFiles?.length ?? 0) > 0
  );
}

export type TextDeliveryRepairSource =
  | "bash_heredoc"
  | "flattened_artifact"
  | "stripped_artifact_tags"
  | "xai_function_call";

export type TextDeliveryRepair = {
  text: string;
  repaired: boolean;
  source?: TextDeliveryRepairSource;
};

function encodeXmlEntities(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function formatFromMime(mime: string): "txt" | "md" {
  return /markdown/i.test(mime) ? "md" : "txt";
}

function resolveRepairTarget(
  intent: TextDeliveryIntent | null,
  mime: string,
  filenameFromPayload: string | null,
): TextDeliveryIntent {
  const format = intent?.format ?? formatFromMime(mime);
  const rawName =
    intent?.filename ??
    filenameFromPayload ??
    `respuesta-claude.${format}`;
  const cleaned = rawName
    .replace(/[/\\<>:"|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  const filename = cleaned.toLowerCase().endsWith(`.${format}`)
    ? cleaned
    : `${cleaned || "respuesta-claude"}.${format}`;
  return { format, filename };
}

function buildRepairedArtifactText(
  preamble: string,
  target: TextDeliveryIntent,
  content: string,
): string {
  const mime = target.format === "md" ? "text/markdown" : "text/plain";
  const intro = preamble.trim() || "Listo, va el archivo.";
  return `${intro}
<function_calls>
<invoke name="artifacts">
<parameter name="command">create</parameter>
<parameter name="type">${mime}</parameter>
<parameter name="title" encoding="entities">${encodeXmlEntities(target.filename)}</parameter>
<parameter name="content" encoding="entities">${encodeXmlEntities(content)}</parameter>
</invoke>
</function_calls>`;
}

/**
 * Claude a veces aplana el artifact a:
 *   create text/plain nombre.txt <contenido>
 * sin ningún tag. El esquema está completo; faltan solo los wrappers.
 */
function tryRepairFlattenedArtifact(
  text: string,
  intent: TextDeliveryIntent | null,
): TextDeliveryRepair | null {
  const match = text.match(
    /^(?:([\s\S]*?)\n+)?create\s+(text\/plain|text\/markdown)\s+([a-z0-9][a-z0-9_.-]{0,120}\.(?:txt|md))\s+(\S[\s\S]*)$/i,
  );
  if (!match) return null;
  const preamble = match[1] ?? "";
  const mime = match[2];
  const filename = match[3];
  const content = match[4].trim();
  if (content.length < MIN_REPAIR_CONTENT_CHARS) return null;
  // Evitar reparar prosa que solo menciona el patrón al pasar.
  if (/\bcreate\s+text\/(?:plain|markdown)\b/i.test(preamble)) return null;

  const target = resolveRepairTarget(intent, mime, filename);
  return {
    repaired: true,
    source: "flattened_artifact",
    text: buildRepairedArtifactText(preamble, target, content),
  };
}

/**
 * Variante donde el modelo escribe los nombres de tag sin `<` `>`:
 *   function_calls invoke name="artifacts" parameter name="content" …
 */
function tryRepairStrippedArtifactTags(
  text: string,
  intent: TextDeliveryIntent | null,
): TextDeliveryRepair | null {
  if (
    !/\bfunction_calls\b/i.test(text) ||
    !/\binvoke\s+name=["']?artifacts["']?/i.test(text)
  ) {
    return null;
  }
  if (/<function_calls>/i.test(text)) return null;

  const typeMatch = text.match(
    /parameter\s+name=["']?type["']?\s*(text\/plain|text\/markdown)\s*parameter/i,
  );
  const titleMatch = text.match(
    /parameter\s+name=["']?title["']?\s*([a-z0-9][a-z0-9_.-]{0,120}\.(?:txt|md))\s*parameter/i,
  );
  const contentMatch = text.match(
    /parameter\s+name=["']?content["']?\s*([\s\S]*?)(?:\s*parameter\s+invoke|\s*function_results|\s*$)/i,
  );
  const content = contentMatch?.[1]?.trim() ?? "";
  if (content.length < MIN_REPAIR_CONTENT_CHARS) return null;

  const mime = typeMatch?.[1] ?? "text/plain";
  const target = resolveRepairTarget(intent, mime, titleMatch?.[1] ?? null);
  const preambleMatch = text.match(
    /^([\s\S]*?)(?=\bfunction_calls\b|\binvoke\s+name=["']?artifacts["']?)/i,
  );
  const preamble = (preambleMatch?.[1] ?? "").trim();

  return {
    repaired: true,
    source: "stripped_artifact_tags",
    text: buildRepairedArtifactText(preamble, target, content),
  };
}

/**
 * Variante con wrapper estilo xAI:
 *   <xai:function_call name="artifacts"> create text/plain name.txt … </xai:function_call>
 */
function tryRepairXaiFunctionCall(
  text: string,
  intent: TextDeliveryIntent | null,
): TextDeliveryRepair | null {
  const match = text.match(
    /^(?:([\s\S]*?)\n+)?<xai:function_call\s+name=["']artifacts["']\s*>\s*([\s\S]*?)\s*<\/xai:function_call>\s*$/i,
  );
  if (!match) return null;
  const preamble = match[1] ?? "";
  const inner = match[2].trim();
  // Reusar el parser aplanado sobre el interior (+ preamble).
  const flattened = tryRepairFlattenedArtifact(
    preamble ? `${preamble}\n\n${inner}` : inner,
    intent,
  );
  if (!flattened?.repaired) return null;
  return { ...flattened, source: "xai_function_call" };
}

function tryRepairBashHeredoc(
  text: string,
  intent: TextDeliveryIntent | null,
): TextDeliveryRepair | null {
  if (!intent) return null;
  if (!/<invoke\s+name=["'](?:bash_tool|present_files)["']/i.test(text)) {
    return null;
  }
  const heredoc = text.match(
    /cat\s+>\s+[^\n]+?<<\s*['"]?([A-Za-z_][A-Za-z0-9_]*)['"]?\s*\n([\s\S]*?)\n\1(?:\s|$)/i,
  );
  const content = heredoc?.[2]?.trim();
  if (!content) return null;

  return {
    repaired: true,
    source: "bash_heredoc",
    text: buildRepairedArtifactText("Listo, va el archivo.", intent, content),
  };
}

/**
 * Claude a veces imprime pseudo-tools de claude.ai (`bash_tool`,
 * `present_files`) o aplana el artifact (sin tags / sin `<>` / wrapper xAI).
 * Si el contenido del archivo está completo en el texto, lo recuperamos como
 * artifact parseable sin ejecutar nada.
 *
 * El patrón aplanado es auto-descriptivo (type + filename + content), así que
 * NO exige `intent` previo — eso cubre entregas Reframes tipo "Stone and Water
 * Detail" donde el user no dijo ".txt" explícito.
 */
export function repairMalformedTextDelivery(
  text: string,
  intent: TextDeliveryIntent | null,
): TextDeliveryRepair {
  if (analyzeArtifactAttempt(text).detected) {
    return { text, repaired: false };
  }

  return (
    tryRepairFlattenedArtifact(text, intent) ??
    tryRepairStrippedArtifactTags(text, intent) ??
    tryRepairXaiFunctionCall(text, intent) ??
    tryRepairBashHeredoc(text, intent) ?? { text, repaired: false }
  );
}
