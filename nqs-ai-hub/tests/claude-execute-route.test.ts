import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  resolve: vi.fn(),
  getSession: vi.fn(),
  requireToolAccess: vi.fn(),
}));

vi.mock("@/lib/auth/server", () => ({
  getSession: mocks.getSession,
}));

vi.mock("@/lib/middleware/permissions", () => ({
  requireToolAccess: mocks.requireToolAccess,
}));

vi.mock("@/lib/adapters", () => ({
  getAdapter: () => ({ execute: mocks.execute }),
}));

vi.mock("@/lib/adapters/claude-execute-context", () => ({
  resolveClaudeExecuteContext: mocks.resolve,
}));

vi.mock("@/lib/log", () => ({
  logWarn: vi.fn(),
  logError: vi.fn(),
  requestIdFrom: () => "test-request",
}));

import { POST } from "@/app/api/tools/claude/execute/route";

const USER = "11111111-1111-4111-8111-111111111111";
const CONVERSATION = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PROJECT_A = "22222222-2222-4222-8222-222222222222";
const PROJECT_B = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({ userId: USER });
  mocks.requireToolAccess.mockResolvedValue(null);
});

describe("POST /api/tools/claude/execute preflight", () => {
  test("devuelve HTTP 409 JSON y no abre el adapter ante mismatch", async () => {
    mocks.resolve.mockResolvedValue({
      ok: false,
      error: {
        status: 409,
        error: "project_context_mismatch",
        message:
          "Esta conversación pertenece a otro proyecto. Recargá o reabrí el proyecto antes de continuar.",
      },
    });

    const response = await POST(
      new Request("http://localhost/api/tools/claude/execute", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt: "hola",
          conversationId: CONVERSATION,
          projectId: PROJECT_B,
        }),
      }),
    );

    expect(response.status).toBe(409);
    expect(response.headers.get("content-type")).toContain("application/json");
    await expect(response.json()).resolves.toMatchObject({
      error: "project_context_mismatch",
    });
    expect(mocks.resolve).toHaveBeenCalledWith(
      USER,
      expect.objectContaining({
        conversationId: CONVERSATION,
        projectId: PROJECT_B,
      }),
      { requestId: "test-request" },
    );
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  test("inyecta el contexto canónico y recién entonces inicia NDJSON", async () => {
    mocks.resolve.mockResolvedValue({
      ok: true,
      value: { projectId: PROJECT_A, source: "conversation" },
    });
    mocks.execute.mockResolvedValue({
      ok: true,
      value: {
        text: "respuesta",
        tokensInput: 1,
        tokensOutput: 1,
        conversationId: CONVERSATION,
        messageId: "message-id",
        createdAt: null,
      },
    });

    const response = await POST(
      new Request("http://localhost/api/tools/claude/execute", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt: "hola",
          conversationId: CONVERSATION,
          projectId: PROJECT_A,
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain(
      "application/x-ndjson",
    );
    expect(await response.text()).toContain('"type":"done"');
    expect(mocks.execute).toHaveBeenCalledWith(
      USER,
      expect.objectContaining({
        projectId: PROJECT_A,
        projectContext: { projectId: PROJECT_A, source: "conversation" },
      }),
      expect.any(Function),
      expect.any(Function),
    );
  });
});
