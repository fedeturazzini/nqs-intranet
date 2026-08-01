import { describe, expect, test, vi } from "vitest";

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
  logInfo: vi.fn(),
  streamClaude: vi.fn(),
}));

vi.mock("@/lib/db/supabase", () => ({
  createServerClient: () => ({
    from: (table: string) => {
      if (table !== "claude_messages") {
        throw new Error(`tabla inesperada: ${table}`);
      }
      return {
        select: () => ({
          eq: () => ({ order: mocks.historyOrder }),
        }),
      };
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
  downloadGeneratedFile: vi.fn(),
  maxTokensFor: () => 4096,
  modelSupportsCodeExecution: () => false,
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
  uploadBuffer: vi.fn(),
}));
vi.mock("@/lib/adapters/claude-binary-delivery", () => ({
  detectBinaryDeliveryIntent: () => null,
  isPotentialBinaryFollowUp: () => false,
  orderPriorDeliveryMessages: (messages: unknown[]) => messages,
  resolvePriorDeliveryTurn: () => ({
    previousUserPrompt: null,
    previousAssistantId: null,
  }),
  shouldEnableBinaryFileGeneration: () => false,
}));
vi.mock("@/lib/adapters/claude-text-delivery", () => ({
  detectTextDeliveryIntent: () => null,
  hasDeliveredTextArtifact: () => false,
}));
vi.mock("@/lib/adapters/utils", () => ({ logToolUsage: vi.fn() }));

import { claudeAdapter } from "@/lib/adapters/claude";

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
});
