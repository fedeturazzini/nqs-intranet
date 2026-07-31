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

export type TextDeliveryRepair = {
  text: string;
  repaired: boolean;
  source?: "bash_heredoc";
};

/**
 * Claude a veces imprime pseudo-tools de claude.ai (`bash_tool`,
 * `present_files`) aunque esta integración no los ofrece. Si dejó el contenido
 * completo dentro de un heredoc, lo recuperamos como artifact de texto sin
 * ejecutar ningún comando.
 */
export function repairMalformedTextDelivery(
  text: string,
  intent: TextDeliveryIntent | null,
): TextDeliveryRepair {
  if (!intent || analyzeArtifactAttempt(text).detected) {
    return { text, repaired: false };
  }
  if (!/<invoke\s+name=["'](?:bash_tool|present_files)["']/i.test(text)) {
    return { text, repaired: false };
  }
  const heredoc = text.match(
    /cat\s+>\s+[^\n]+?<<\s*['"]?([A-Za-z_][A-Za-z0-9_]*)['"]?\s*\n([\s\S]*?)\n\1(?:\s|$)/i,
  );
  const content = heredoc?.[2]?.trim();
  if (!content) return { text, repaired: false };

  const encode = (value: string) =>
    value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const mime = intent.format === "md" ? "text/markdown" : "text/plain";
  return {
    repaired: true,
    source: "bash_heredoc",
    text: `Listo, va el archivo.
<function_calls>
<invoke name="artifacts">
<parameter name="command">create</parameter>
<parameter name="type">${mime}</parameter>
<parameter name="title" encoding="entities">${encode(intent.filename)}</parameter>
<parameter name="content" encoding="entities">${encode(content)}</parameter>
</invoke>
</function_calls>`,
  };
}
