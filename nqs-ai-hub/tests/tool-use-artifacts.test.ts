import { describe, expect, test } from "vitest";
import {
  artifactToPseudoXml,
  materializeToolUseArtifacts,
  parseToolUseArtifact,
  redactToolInput,
  TOOL_DELIVERY_WARNING,
} from "@/lib/utils/tool-use-artifacts";
import { parseMessageWithArtifacts } from "@/lib/utils/parse-artifacts";

describe("tool-use artifacts", () => {
  test("reconoce el schema canónico y aliases acotados", () => {
    expect(
      parseToolUseArtifact({
        type: "tool_use",
        name: "artifacts",
        input: {
          command: "create",
          type: "text/plain",
          title: "prompt.txt",
          content: "contenido",
        },
      }),
    ).toEqual({
      command: "create",
      type: "text/plain",
      title: "prompt.txt",
      content: "contenido",
      language: undefined,
    });
    expect(
      parseToolUseArtifact({
        type: "tool_use",
        name: "artifacts",
        input: {
          mime_type: "text/markdown",
          filename: "readme.md",
          content: "# Título",
        },
      }),
    ).toMatchObject({ type: "text/markdown", title: "readme.md" });
  });

  test("materializa 20k caracteres a pseudo-XML parseable y persistible", () => {
    const content = `inicio </parameter> & <tag>\n${"x".repeat(20_000)}`;
    const result = materializeToolUseArtifacts(
      [
        {
          type: "tool_use",
          name: "artifacts",
          input: { type: "text/plain", title: "grande.txt", content },
        },
      ],
      "Listo.",
    );

    expect(result.recognized).toBe(true);
    const parsed = parseMessageWithArtifacts(
      `Listo.\n\n${result.appendedText}`,
    ).segments.find((segment) => segment.kind === "artifact");
    expect(parsed?.kind).toBe("artifact");
    if (parsed?.kind === "artifact") {
      expect(parsed.artifact.content).toBe(content);
    }
  });

  test("no duplica si el texto ya contiene un artifact válido", () => {
    const xml = artifactToPseudoXml({
      command: "create",
      type: "text/plain",
      title: "uno.txt",
      content: "uno",
    });
    const result = materializeToolUseArtifacts(
      [
        {
          type: "tool_use",
          name: "artifacts",
          input: { type: "text/plain", title: "uno.txt", content: "uno" },
        },
      ],
      xml,
    );
    expect(result.recognized).toBe(true);
    expect(result.appendedText).toBe("");
  });

  test("conserva un artifact nativo distinto aunque ya exista pseudo-XML", () => {
    const existing = artifactToPseudoXml({
      command: "create",
      type: "text/plain",
      title: "uno.txt",
      content: "uno",
    });
    const result = materializeToolUseArtifacts(
      [
        {
          type: "tool_use",
          name: "artifacts",
          input: { type: "text/plain", title: "dos.txt", content: "dos" },
        },
      ],
      existing,
    );
    const segments = parseMessageWithArtifacts(
      `${existing}\n\n${result.appendedText}`,
    ).segments;
    expect(
      segments.filter((segment) => segment.kind === "artifact"),
    ).toHaveLength(2);
  });

  test("un tool desconocido falla claro y no expone su input", () => {
    const result = materializeToolUseArtifacts(
      [
        {
          type: "tool_use",
          name: "otra_tool",
          input: { content: "secreto", code: "print('secreto')" },
        },
      ],
      "",
    );
    expect(result).toMatchObject({
      detected: true,
      recognized: false,
      toolName: "otra_tool",
      failReason: "unrecognized_tool",
      appendedText: TOOL_DELIVERY_WARNING,
    });
    const redacted = redactToolInput({
      content: "secreto",
      code: "print('secreto')",
      type: "text/plain",
    });
    expect(redacted).not.toContain("secreto");
    expect(redacted).toContain('"type":"text/plain"');
    expect(redacted).toContain("[7 chars]");
  });

  test("artifacts sin content se marca inválido", () => {
    expect(
      materializeToolUseArtifacts(
        [{ type: "tool_use", name: "artifacts", input: { title: "x.txt" } }],
        "",
      ),
    ).toMatchObject({
      detected: true,
      recognized: false,
      failReason: "invalid_artifact_input",
    });
  });
});
