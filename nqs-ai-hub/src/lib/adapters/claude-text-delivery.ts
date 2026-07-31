import type { ClaudeResponse } from "@/lib/anthropic/client";
import { analyzeArtifactAttempt } from "@/lib/utils/parse-artifacts";

export type TextDeliveryIntent = {
  format: "txt" | "md";
  filename: string;
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

/**
 * Detecta solo pedidos EXPLÍCITOS de entrega textual. Mencionar/adjuntar un
 * `.txt` para analizarlo no alcanza: también tiene que haber una acción de
 * creación, envío, exportación o descarga.
 */
export function detectTextDeliveryIntent(
  prompt: string,
): TextDeliveryIntent | null {
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

export function hasDeliveredTextArtifact(response: ClaudeResponse): boolean {
  return (
    analyzeArtifactAttempt(response.text).detected ||
    (response.generatedFiles?.length ?? 0) > 0
  );
}
