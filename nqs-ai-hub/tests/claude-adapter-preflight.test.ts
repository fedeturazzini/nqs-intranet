import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const mocks = vi.hoisted(() => ({
  getBrain: vi.fn(),
  getProjectSummary: vi.fn(),
  historyOrder: vi.fn(),
  insertMessages: vi.fn(),
  updateConversation: vi.fn(),
  insertFile: vi.fn(),
  logInfo: vi.fn(),
  logToolUsage: vi.fn(),
  streamClaude: vi.fn(),
  downloadGeneratedFile: vi.fn(),
  modelSupportsCodeExecution: vi.fn(),
  detectBinaryDeliveryIntent: vi.fn(),
  shouldEnableBinaryFileGeneration: vi.fn(),
  uploadBuffer: vi.fn(),
}));

vi.mock("@/lib/db/supabase", () => ({
  createServerClient: () => ({
    from: (table: string) => {
      if (table === "claude_messages") {
        return {
          select: () => ({
            eq: () => ({ order: mocks.historyOrder }),
          }),
          insert: () => ({ select: mocks.insertMessages }),
        };
      }
      if (table === "claude_conversations") {
        return {
          update: () => ({ eq: mocks.updateConversation }),
        };
      }
      if (table === "claude_files") {
        return {
          insert: () => ({
            select: () => ({ single: mocks.insertFile }),
          }),
        };
      }
      throw new Error(`tabla inesperada: ${table}`);
    },
  }),
}));

vi.mock("@/lib/db/queries/system-prompts", () => ({
  getActiveSystemAndMemoryForProject: mocks.getBrain,
}));
vi.mock("@/lib/db/queries/projects", () => ({
  getProjectSummary: mocks.getProjectSummary,
}));
vi.mock("@/lib/db/queries/tools", () => ({ getToolAccess: vi.fn() }));

vi.mock("@/lib/anthropic/client", () => ({
  buildUserContent: (prompt: string) => [{ type: "text", text: prompt }],
  downloadGeneratedFile: mocks.downloadGeneratedFile,
  maxTokensFor: () => 4096,
  modelSupportsCodeExecution: mocks.modelSupportsCodeExecution,
  streamClaude: mocks.streamClaude,
}));
vi.mock("@/lib/anthropic/errors", () => ({
  isNoCreditsError: () => false,
  NO_CREDITS_CODE: "no_credits",
}));
vi.mock("@/lib/log", () => ({
  logInfo: mocks.logInfo,
  logWarn: vi.fn(),
}));
vi.mock("@/lib/utils/parse-artifacts", () => ({
  analyzeArtifactAttempt: () => ({
    attempted: false,
    detected: false,
    reason: null,
  }),
}));
vi.mock("@/lib/utils/log-preview", () => ({
  shortHash: () => "hash",
  previewText: () => "preview",
}));
vi.mock("@/lib/storage/claude-uploads", () => ({
  pathBelongsToUser: () => true,
  signDownloadUrls: vi.fn(async () => []),
  uploadBuffer: mocks.uploadBuffer,
}));
vi.mock("@/lib/adapters/claude-binary-delivery", () => ({
  detectBinaryDeliveryIntent: mocks.detectBinaryDeliveryIntent,
  isPotentialBinaryFollowUp: () => false,
  orderPriorDeliveryMessages: (messages: unknown[]) => messages,
  resolvePriorDeliveryTurn: () => ({
    previousUserPrompt: null,
    previousAssistantId: null,
  }),
  shouldEnableBinaryFileGeneration: mocks.shouldEnableBinaryFileGeneration,
}));
vi.mock("@/lib/adapters/claude-text-delivery", () => ({
  detectTextDeliveryIntent: () => null,
  hasDeliveredTextArtifact: () => false,
  repairMalformedTextDelivery: (text: string) => ({
    text,
    repaired: false,
    source: null,
  }),
}));
vi.mock("@/lib/adapters/utils", () => ({
  logToolUsage: mocks.logToolUsage,
}));

import { claudeAdapter } from "@/lib/adapters/claude";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.modelSupportsCodeExecution.mockReturnValue(false);
  mocks.detectBinaryDeliveryIntent.mockReturnValue(null);
  mocks.shouldEnableBinaryFileGeneration.mockReturnValue(false);
  mocks.insertMessages.mockResolvedValue({
    data: [
      {
        id: "message-1",
        role: "assistant",
        created_at: "2026-08-02T20:00:00.000Z",
      },
    ],
    error: null,
  });
  mocks.updateConversation.mockResolvedValue({ error: null });
  mocks.insertFile.mockResolvedValue({
    data: { id: "stored-file-1" },
    error: null,
  });
  mocks.logToolUsage.mockResolvedValue(undefined);
});

afterEach(() => {
  delete process.env.ENABLE_FILE_GENERATION;
  vi.restoreAllMocks();
});

describe("Claude adapter preflight", () => {
  test("inicia cerebro e historial juntos y loguea el proyecto ya cargado", async () => {
    const brain = deferred<{
      system: {
        id: string;
        content: string;
        model: string;
        version: number;
      };
      memory: null;
    }>();
    const history = deferred<{
      data: Array<{
        id: string;
        role: "user" | "assistant";
        content: string;
        created_at: string;
      }>;
      error: null;
    }>();
    mocks.getBrain.mockReturnValueOnce(brain.promise);
    mocks.historyOrder.mockReturnValueOnce(history.promise);
    mocks.streamClaude.mockRejectedValueOnce(new Error("stop after preflight"));

    let settled = false;
    const run = claudeAdapter.execute!("user-1", {
      prompt: "hola",
      conversationId: "conversation-1",
      projectContext: {
        projectId: "project-1",
        projectName: "Proyecto en memoria",
        isPrivate: true,
        source: "conversation",
      },
    });
    void run.then(() => {
      settled = true;
    });

    expect(mocks.getBrain).toHaveBeenCalledTimes(1);
    expect(mocks.historyOrder).toHaveBeenCalledTimes(1);
    expect(settled).toBe(false);

    history.resolve({ data: [], error: null });
    await Promise.resolve();
    expect(settled).toBe(false);

    brain.resolve({
      system: {
        id: "brain-1",
        content: "System",
        model: "claude-sonnet-4-5",
        version: 7,
      },
      memory: null,
    });

    await expect(run).resolves.toMatchObject({ ok: false });
    expect(mocks.logInfo).toHaveBeenCalledWith(
      "execute.context",
      expect.objectContaining({
        projectId: "project-1",
        projectName: "Proyecto en memoria",
        brainPasswordGated: true,
      }),
    );
    expect(mocks.getProjectSummary).not.toHaveBeenCalled();
  });

  test("loguea timings de texto con fases de archivo en null", async () => {
    mocks.getBrain.mockResolvedValue({
      system: {
        id: "brain-1",
        content: "System",
        model: "claude-sonnet-4-5",
        version: 7,
      },
      memory: null,
    });
    mocks.historyOrder.mockResolvedValue({ data: [], error: null });
    mocks.streamClaude.mockImplementationOnce(async (...args: unknown[]) => {
      const onTiming = args[5] as ((phase: "first_delta") => void) | undefined;
      onTiming?.("first_delta");
      return {
        text: "respuesta",
        tokensInput: 10,
        tokensOutput: 5,
        stopReason: "end_turn",
        contentBlocks: [{ type: "text", chars: 9 }],
        anthropicMessageId: "msg_text",
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
      };
    });
    const times = [1_100, 1_150, 1_300, 1_310, 1_400];
    vi.spyOn(Date, "now").mockImplementation(() => times.shift() ?? 1_400);

    const result = await claudeAdapter.execute!("user-1", {
      prompt: "hola",
      conversationId: "conversation-1",
      projectContext: {
        projectId: "project-1",
        projectName: "Proyecto",
        isPrivate: false,
        source: "conversation",
      },
      telemetry: {
        requestId: "vercel-request-1",
        requestStartedAt: 1_000,
      },
    });

    expect(result).toMatchObject({ ok: true });
    expect(mocks.logInfo).toHaveBeenCalledWith("execute.timings", {
      route: "tools/claude/execute",
      requestId: "vercel-request-1",
      anthropicMessageId: "msg_text",
      userId: "user-1",
      conversationId: "conversation-1",
      model: "claude-sonnet-4-5",
      generatedFile: false,
      fileCount: 0,
      fileType: null,
      preflightMs: 100,
      ttftMs: 50,
      sandboxMs: null,
      filePersistMs: null,
      anthropicTotalMs: 200,
      totalMs: 400,
    });
  });

  test("mide sandbox y persistencia cuando Anthropic entrega un archivo", async () => {
    process.env.ENABLE_FILE_GENERATION = "true";
    mocks.modelSupportsCodeExecution.mockReturnValue(true);
    mocks.detectBinaryDeliveryIntent.mockReturnValue({
      format: "pdf",
      source: "explicit",
      reason: "formato explícito",
    });
    mocks.shouldEnableBinaryFileGeneration.mockReturnValue(true);
    mocks.getBrain.mockResolvedValue({
      system: {
        id: "brain-1",
        content: "System",
        model: "claude-sonnet-4-5",
        version: 7,
      },
      memory: null,
    });
    mocks.historyOrder.mockResolvedValue({ data: [], error: null });
    mocks.downloadGeneratedFile.mockResolvedValue({
      fileId: "file-1",
      name: "informe.pdf",
      mediaType: "application/pdf",
      sizeBytes: 3,
      bytes: Buffer.from("pdf"),
    });
    mocks.uploadBuffer.mockResolvedValue(
      "user-1/conversation-1/generated/informe.pdf",
    );
    mocks.streamClaude.mockImplementationOnce(async (...args: unknown[]) => {
      const onTiming = args[5] as
        | ((phase: "first_delta" | "sandbox_start" | "sandbox_end") => void)
        | undefined;
      onTiming?.("first_delta");
      onTiming?.("sandbox_start");
      onTiming?.("sandbox_end");
      return {
        text: "archivo listo",
        tokensInput: 12,
        tokensOutput: 8,
        stopReason: "end_turn",
        generatedFiles: [{ fileId: "file-1" }],
        contentBlocks: [
          { type: "server_tool_use", toolName: "code_execution" },
        ],
        anthropicMessageId: "msg_pdf",
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
      };
    });
    const times = [
      1_100, 1_110, 1_120, 1_200, 1_250, 1_260, 1_300, 1_400, 1_450,
    ];
    vi.spyOn(Date, "now").mockImplementation(() => times.shift() ?? 1_450);

    const result = await claudeAdapter.execute!("user-1", {
      prompt: "generá un PDF",
      conversationId: "conversation-1",
      projectContext: {
        projectId: "project-1",
        projectName: "Proyecto",
        isPrivate: false,
        source: "conversation",
      },
      telemetry: {
        requestId: "vercel-request-2",
        requestStartedAt: 1_000,
      },
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        files: [
          expect.objectContaining({
            id: "stored-file-1",
            name: "informe.pdf",
          }),
        ],
      },
    });
    expect(mocks.logInfo).toHaveBeenCalledWith("execute.timings", {
      route: "tools/claude/execute",
      requestId: "vercel-request-2",
      anthropicMessageId: "msg_pdf",
      userId: "user-1",
      conversationId: "conversation-1",
      model: "claude-sonnet-4-5",
      generatedFile: true,
      fileCount: 1,
      fileType: "pdf",
      preflightMs: 100,
      ttftMs: 10,
      sandboxMs: 80,
      filePersistMs: expect.any(Number),
      anthropicTotalMs: 150,
      totalMs: 450,
    });
  });
});
