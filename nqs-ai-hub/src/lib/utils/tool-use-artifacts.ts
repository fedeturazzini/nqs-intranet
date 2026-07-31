import {
  parseMessageWithArtifacts,
  type ParsedArtifact,
} from "./parse-artifacts";

type ToolUseBlock = {
  type?: unknown;
  name?: unknown;
  input?: unknown;
};

export type ToolUseDelivery = {
  detected: boolean;
  recognized: boolean;
  appendedText: string;
  toolName?: string;
  failReason?: "unrecognized_tool" | "invalid_artifact_input";
};

export const TOOL_DELIVERY_WARNING =
  "⚠ No pudimos completar el formato de entrega que usó Claude. Pedile que vuelva a entregar el contenido.";

function record(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function escapeParameter(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function artifactToPseudoXml(artifact: ParsedArtifact): string {
  const language = artifact.language
    ? `\n<parameter name="language" encoding="entities">${escapeParameter(artifact.language)}</parameter>`
    : "";
  return `<function_calls>
<invoke name="artifacts">
<parameter name="command" encoding="entities">${escapeParameter(artifact.command)}</parameter>
<parameter name="type" encoding="entities">${escapeParameter(artifact.type)}</parameter>
<parameter name="title" encoding="entities">${escapeParameter(artifact.title)}</parameter>${language}
<parameter name="content" encoding="entities">${escapeParameter(artifact.content)}</parameter>
</invoke>
</function_calls>`;
}

export function parseToolUseArtifact(raw: unknown): ParsedArtifact | null {
  const block = raw as ToolUseBlock;
  if (block.type !== "tool_use" || block.name !== "artifacts") return null;
  const input = record(block.input);
  if (!input) return null;

  const type =
    typeof input.type === "string"
      ? input.type
      : typeof input.mime_type === "string"
        ? input.mime_type
        : null;
  const content = typeof input.content === "string" ? input.content : null;
  if (!type || content == null) return null;

  const command =
    input.command === "update" || input.command === "rewrite"
      ? input.command
      : "create";
  const title =
    typeof input.title === "string"
      ? input.title
      : typeof input.filename === "string"
        ? input.filename
        : "untitled";

  return {
    command,
    type,
    title,
    content,
    language: typeof input.language === "string" ? input.language : undefined,
  };
}

export function materializeToolUseArtifacts(
  blocks: readonly unknown[],
  currentText: string,
): ToolUseDelivery {
  const toolUses = blocks.filter(
    (raw) => (raw as { type?: unknown }).type === "tool_use",
  ) as ToolUseBlock[];
  if (toolUses.length === 0) {
    return { detected: false, recognized: false, appendedText: "" };
  }

  const artifacts = toolUses
    .map(parseToolUseArtifact)
    .filter((artifact): artifact is ParsedArtifact => artifact != null);
  if (artifacts.length > 0) {
    const unrecognized = toolUses.find(
      (toolUse) => parseToolUseArtifact(toolUse) == null,
    );
    const existingArtifacts = parseMessageWithArtifacts(currentText)
      .segments.filter((segment) => segment.kind === "artifact")
      .map((segment) => segment.artifact);
    const newArtifacts = artifacts.filter(
      (artifact, index, all) =>
        all.findIndex(
          (candidate) =>
            candidate.type === artifact.type &&
            candidate.title === artifact.title &&
            candidate.content === artifact.content,
        ) === index &&
        !existingArtifacts.some(
          (existing) =>
            existing.type === artifact.type &&
            existing.title === artifact.title &&
            existing.content === artifact.content,
        ),
    );
    const appendedParts = newArtifacts.map(artifactToPseudoXml);
    if (unrecognized) appendedParts.push(TOOL_DELIVERY_WARNING);
    return {
      detected: true,
      recognized: unrecognized == null,
      appendedText: appendedParts.join("\n\n"),
      toolName:
        typeof unrecognized?.name === "string"
          ? unrecognized.name
          : "artifacts",
      failReason: unrecognized ? "unrecognized_tool" : undefined,
    };
  }

  const first = toolUses[0];
  return {
    detected: true,
    recognized: false,
    appendedText: TOOL_DELIVERY_WARNING,
    toolName: typeof first.name === "string" ? first.name : "unknown",
    failReason:
      first.name === "artifacts"
        ? "invalid_artifact_input"
        : "unrecognized_tool",
  };
}

const SAFE_STRING_KEYS = new Set(["type", "command", "language", "mime_type"]);

export function redactToolInput(input: unknown): string {
  return JSON.stringify(input, (key, value) => {
    if (key === "" || typeof value !== "string" || SAFE_STRING_KEYS.has(key)) {
      return value;
    }
    return `[${value.length} chars]`;
  });
}
