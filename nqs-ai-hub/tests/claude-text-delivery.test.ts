import { describe, expect, test } from "vitest";
import {
  detectTextDeliveryIntent,
  hasDeliveredTextArtifact,
  repairMalformedTextDelivery,
} from "@/lib/adapters/claude-text-delivery";
import { parseMessageWithArtifacts } from "@/lib/utils/parse-artifacts";
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

  test("hereda TXT en un reclamo o modificación inequívoca", () => {
    expect(
      detectTextDeliveryIntent("No lo veo", {
        previousUserPrompt: "Genera el .txt",
      }),
    ).toEqual({ format: "txt", filename: "respuesta-claude.txt" });
    expect(
      detectTextDeliveryIntent("Cambiemos el shot 3", {
        previousAssistantText: artifact,
      }),
    ).toEqual({ format: "txt", filename: "prompt.txt" });
  });

  test("no hereda formato para una pregunta conversacional", () => {
    expect(
      detectTextDeliveryIntent("¿Por qué elegiste esa cámara?", {
        previousAssistantText: artifact,
      }),
    ).toBeNull();
  });

  test("recupera la intención reciente tras una respuesta fallida", () => {
    expect(
      detectTextDeliveryIntent("No lo veo", {
        recentMessages: [
          { role: "assistant", content: artifact },
          { role: "user", content: "Cambiemos el shot 3" },
          { role: "assistant", content: "Listo, ahí va el archivo." },
        ],
      }),
    ).toEqual({ format: "txt", filename: "prompt.txt" });
  });

  test("una instrucción posterior de entregar por chat corta la herencia", () => {
    expect(
      detectTextDeliveryIntent("Cambiemos el shot 3", {
        recentMessages: [
          { role: "assistant", content: artifact },
          {
            role: "user",
            content: "Desde ahora dámelos directamente en el chat, sin .txt",
          },
        ],
      }),
    ).toBeNull();
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

  test("repara pseudo-tools bash/present_files como artifact sin ejecutarlos", () => {
    const malformed = `## Archivo generado
<function_calls>
<invoke name="bash_tool">
<parameter name="command">cat > /mnt/user-data/outputs/prompt.txt << 'EOF'
CONTENIDO
con dos líneas
EOF
wc -m /mnt/user-data/outputs/prompt.txt</parameter>
</invoke>
</function_calls>
<function_calls>
<invoke name="present_files">
<parameter name="files">["/mnt/user-data/outputs/prompt.txt"]</parameter>
</invoke>
</function_calls>`;

    const repaired = repairMalformedTextDelivery(malformed, {
      format: "txt",
      filename: "prompt.txt",
    });

    expect(repaired).toMatchObject({
      repaired: true,
      source: "bash_heredoc",
    });
    expect(repaired.text).not.toContain("bash_tool");
    expect(repaired.text).not.toContain("/mnt/user-data");
    expect(parseMessageWithArtifacts(repaired.text).segments).toEqual([
      { kind: "text", content: "Listo, va el archivo." },
      {
        kind: "artifact",
        artifact: {
          command: "create",
          type: "text/plain",
          title: "prompt.txt",
          content: "CONTENIDO\ncon dos líneas",
          language: undefined,
        },
      },
    ]);
  });

  test("no repara texto sin heredoc recuperable", () => {
    expect(
      repairMalformedTextDelivery("Listo, ya lo generé.", {
        format: "txt",
        filename: "prompt.txt",
      }),
    ).toEqual({ text: "Listo, ya lo generé.", repaired: false });
  });

  test("repara artifact aplanado create text/plain nombre.txt sin intent", () => {
    const body =
      "Image 1 is the base architectural reference — this is a luxury primary bathroom with a rustic natural stone feature wall and a freestanding sculptural bathtub. CAMERA: Extremely close. PHOTOGRAPHIC STYLE: Real photograph.";
    const malformed = `Listo, va el archivo.\n\ncreate text/plain stone_and_water_detail_v1.txt ${body}`;

    const repaired = repairMalformedTextDelivery(malformed, null);

    expect(repaired).toMatchObject({
      repaired: true,
      source: "flattened_artifact",
    });
    expect(parseMessageWithArtifacts(repaired.text).segments).toEqual([
      { kind: "text", content: "Listo, va el archivo." },
      {
        kind: "artifact",
        artifact: {
          command: "create",
          type: "text/plain",
          title: "stone_and_water_detail_v1.txt",
          content: body,
          language: undefined,
        },
      },
    ]);
  });

  test("repara tags de artifact sin angle brackets", () => {
    const body =
      "Image 1 is the base architectural reference — modern kitchen and dining area with full lighting and composition details for Nano Banana.";
    const malformed = `Va el archivo.

function_calls

invoke name="artifacts" parameter name="command"createparameter parameter name="type"text/plainparameter parameter name="title"cocina_family_sunday_v1.txtparameter parameter name="content" ${body} parameter invoke function_results`;

    const repaired = repairMalformedTextDelivery(malformed, null);

    expect(repaired).toMatchObject({
      repaired: true,
      source: "stripped_artifact_tags",
    });
    const segments = parseMessageWithArtifacts(repaired.text).segments;
    expect(segments).toHaveLength(2);
    expect(segments[0]).toEqual({ kind: "text", content: "Va el archivo." });
    expect(segments[1]).toMatchObject({
      kind: "artifact",
      artifact: {
        type: "text/plain",
        title: "cocina_family_sunday_v1.txt",
        content: body,
      },
    });
  });

  test("repara wrapper xai:function_call con payload aplanado", () => {
    const body =
      "Image 1 is the base architectural reference — bathroom steam stone macro with full camera and lighting instructions.";
    const malformed = `Listo, va el archivo.

<xai:function_call name="artifacts"> create text/plain bathroom_steam_stone_macro.txt ${body}
</xai:function_call>`;

    const repaired = repairMalformedTextDelivery(malformed, null);

    expect(repaired).toMatchObject({
      repaired: true,
      source: "xai_function_call",
    });
    expect(parseMessageWithArtifacts(repaired.text).segments[1]).toMatchObject({
      kind: "artifact",
      artifact: {
        title: "bathroom_steam_stone_macro.txt",
        content: body,
      },
    });
  });

  test("no repara menciones cortas de create text/plain en prosa", () => {
    const chat =
      "No uses create text/plain foo.txt acá; eso es solo un ejemplo corto.";
    expect(repairMalformedTextDelivery(chat, null)).toEqual({
      text: chat,
      repaired: false,
    });
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
