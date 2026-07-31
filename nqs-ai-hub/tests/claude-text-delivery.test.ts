import { describe, expect, test } from "vitest";
import {
  detectTextDeliveryIntent,
  hasDeliveredTextArtifact,
} from "@/lib/adapters/claude-text-delivery";
import {
  extractGeneratedFilesFromBlocks,
  summarizeContentBlocks,
  type ClaudeResponse,
} from "@/lib/anthropic/client";

const artifact = `<function_calls>
<invoke name="artifacts">
<parameter name="command">create</parameter>
<parameter name="type">text/plain</parameter>
<parameter name="title">prompt.txt</parameter>
<parameter name="content">CONTENIDO</parameter>
</invoke>
</function_calls>`;

function response(overrides: Partial<ClaudeResponse> = {}): ClaudeResponse {
  return {
    text: "texto inline",
    tokensInput: 10,
    tokensOutput: 5,
    stopReason: "end_turn",
    contentBlocks: [{ type: "text", chars: 12 }],
    anthropicMessageId: "msg_first",
    cacheCreationTokens: 2,
    cacheReadTokens: 3,
    ...overrides,
  };
}

describe("detectTextDeliveryIntent", () => {
  test("detecta pedidos explícitos de txt/md y conserva un nombre seguro", () => {
    expect(
      detectTextDeliveryIntent("Mandámelo como prompt final.txt descargable"),
    ).toEqual({ format: "txt", filename: "prompt final.txt" });
    expect(
      detectTextDeliveryIntent("Export this response as resultado.md"),
    ).toEqual({ format: "md", filename: "resultado.md" });
    expect(detectTextDeliveryIntent("en .txt")).toEqual({
      format: "txt",
      filename: "respuesta-claude.txt",
    });
    expect(detectTextDeliveryIntent("Dámelo en Markdown")).toEqual({
      format: "md",
      filename: "respuesta-claude.md",
    });
  });

  test("no confunde analizar un adjunto con pedir una entrega", () => {
    expect(
      detectTextDeliveryIntent("Analizá el archivo briefing.txt"),
    ).toBeNull();
    expect(detectTextDeliveryIntent("Escribí una respuesta larga")).toBeNull();
  });
});

describe("postcondición de entrega textual", () => {
  test("acepta artifact válido o file_id real", () => {
    expect(hasDeliveredTextArtifact(response({ text: artifact }))).toBe(true);
    expect(
      hasDeliveredTextArtifact(
        response({ generatedFiles: [{ fileId: "file_1" }] }),
      ),
    ).toBe(true);
  });
});

describe("code execution diagnostics", () => {
  const blocks = [
    {
      type: "server_tool_use",
      name: "code_execution",
      input: { code: "print('x')" },
    },
    {
      type: "bash_code_execution_tool_result",
      content: {
        type: "bash_code_execution_result",
        return_code: 1,
        stdout: "salida",
        stderr: "error",
        content: [{ type: "bash_code_execution_output", file_id: "bash_1" }],
      },
    },
    {
      type: "code_execution_tool_result",
      content: {
        type: "code_execution_result",
        return_code: 0,
        stdout: "",
        stderr: "",
        content: [{ type: "code_execution_output", file_id: "code_1" }],
      },
    },
  ];

  test("captura variantes bash y code", () => {
    expect(extractGeneratedFilesFromBlocks(blocks)).toEqual([
      { fileId: "bash_1" },
      { fileId: "code_1" },
    ]);
  });

  test("resume tool/result sin exponer contenido por default", () => {
    expect(summarizeContentBlocks(blocks)).toEqual([
      { type: "server_tool_use", toolName: "code_execution" },
      {
        type: "bash_code_execution_tool_result",
        resultType: "bash_code_execution_result",
        returnCode: 1,
        stdoutChars: 6,
        stderrChars: 5,
        errorCode: undefined,
        files: 1,
      },
      {
        type: "code_execution_tool_result",
        resultType: "code_execution_result",
        returnCode: 0,
        stdoutChars: 0,
        stderrChars: 0,
        errorCode: undefined,
        files: 1,
      },
    ]);
  });
});
