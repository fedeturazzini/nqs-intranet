import type { ClaudeMessage, ClaudeResponse } from "@/lib/anthropic/client";
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

/** Une el intento original y la reparación en una única respuesta persistible. */
export function mergeClaudeResponses(
  first: ClaudeResponse,
  repair: ClaudeResponse,
): ClaudeResponse {
  const separator = first.text && repair.text ? "\n\n" : "";
  const generatedFiles = [
    ...(first.generatedFiles ?? []),
    ...(repair.generatedFiles ?? []),
  ].filter(
    (file, index, all) =>
      all.findIndex((candidate) => candidate.fileId === file.fileId) === index,
  );

  return {
    text: `${first.text}${separator}${repair.text}`,
    tokensInput: first.tokensInput + repair.tokensInput,
    tokensOutput: first.tokensOutput + repair.tokensOutput,
    stopReason: repair.stopReason ?? first.stopReason,
    generatedFiles: generatedFiles.length > 0 ? generatedFiles : undefined,
    contentBlocks: [...first.contentBlocks, ...repair.contentBlocks],
    anthropicMessageId:
      repair.anthropicMessageId ?? first.anthropicMessageId ?? null,
    cacheCreationTokens: first.cacheCreationTokens + repair.cacheCreationTokens,
    cacheReadTokens: first.cacheReadTokens + repair.cacheReadTokens,
  };
}

export const TEXT_ARTIFACT_REPAIR_PROMPT = `La entrega anterior no incluyó el archivo de texto solicitado.
Corregilo ahora en este mismo turno:
- Emití UN artifact completo usando <function_calls><invoke name="artifacts">.
- Usá type="text/plain" para .txt o type="text/markdown" para .md, según el pedido original.
- Incluí title y content completos y cerrá todas las etiquetas.
- Si antes usaste el sandbox para validar, esa validación NO reemplaza el artifact.
- No devuelvas solamente texto inline y no digas que está listo sin emitir el artifact.`;

type RepairTextDeliveryOptions = {
  intent: TextDeliveryIntent | null;
  initialResponse: ClaudeResponse;
  messages: ClaudeMessage[];
  onText?: (delta: string) => void;
  onRepairStart?: (response: ClaudeResponse) => void;
  runRepair: (
    messages: ClaudeMessage[],
    onText?: (delta: string) => void,
  ) => Promise<ClaudeResponse>;
};

export type TextDeliveryRepairResult = {
  response: ClaudeResponse;
  attempted: boolean;
  succeeded: boolean;
  anthropicMessageIds: string[];
};

/** Valida la postcondición y ejecuta como máximo UNA reparación. */
export async function repairTextDeliveryOnce({
  intent,
  initialResponse,
  messages,
  onText,
  onRepairStart,
  runRepair,
}: RepairTextDeliveryOptions): Promise<TextDeliveryRepairResult> {
  const anthropicMessageIds = [initialResponse.anthropicMessageId].filter(
    (id): id is string => Boolean(id),
  );
  if (
    !intent ||
    hasDeliveredTextArtifact(initialResponse) ||
    initialResponse.stopReason === "max_tokens"
  ) {
    return {
      response: initialResponse,
      attempted: false,
      succeeded: false,
      anthropicMessageIds,
    };
  }

  onRepairStart?.(initialResponse);
  const repairMessages: ClaudeMessage[] = [
    ...messages,
    {
      role: "assistant",
      content:
        initialResponse.text ||
        "No entregué el artifact de texto solicitado en la respuesta anterior.",
    },
    { role: "user", content: TEXT_ARTIFACT_REPAIR_PROMPT },
  ];
  let repairStarted = false;
  const repair = await runRepair(repairMessages, (delta) => {
    if (!repairStarted) {
      repairStarted = true;
      if (initialResponse.text) onText?.("\n\n");
    }
    onText?.(delta);
  });
  if (repair.anthropicMessageId) {
    anthropicMessageIds.push(repair.anthropicMessageId);
  }
  const response = mergeClaudeResponses(initialResponse, repair);
  return {
    response,
    attempted: true,
    succeeded: hasDeliveredTextArtifact(response),
    anthropicMessageIds,
  };
}
