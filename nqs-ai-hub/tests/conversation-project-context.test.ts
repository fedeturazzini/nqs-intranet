import { beforeEach, describe, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  conversation: {
    id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    user_id: "11111111-1111-1111-1111-111111111111",
    project_id: "22222222-2222-2222-2222-222222222222" as string | null,
    title: "Conversación",
    created_at: "2026-07-30T00:00:00.000Z",
    updated_at: "2026-07-30T00:00:00.000Z",
  },
  gateAllowed: true,
  updateCalls: 0,
}));

const mocks = vi.hoisted(() => ({
  hasProjectGate: vi.fn(async () => state.gateAllowed),
  getSession: vi.fn(),
}));

vi.mock("@/lib/auth/server", () => ({
  getSession: mocks.getSession,
}));

vi.mock("@/lib/auth/project-gate", () => ({
  hasProjectGate: mocks.hasProjectGate,
}));

vi.mock("@/lib/storage/claude-uploads", () => ({
  signDownloadUrls: vi.fn(async () => []),
}));

vi.mock("@/lib/db/supabase", () => ({
  createServerClient: () => ({
    from: (table: string) => {
      if (table === "claude_conversations") {
        const builder = {
          select: () => builder,
          update: () => {
            state.updateCalls += 1;
            return builder;
          },
          eq: () => builder,
          maybeSingle: async () => ({
            data: state.conversation,
            error: null,
          }),
          then: (
            resolve: (value: { error: null }) => void,
          ): PromiseLike<unknown> => Promise.resolve(resolve({ error: null })),
        };
        return builder;
      }
      if (table === "claude_messages") {
        const builder = {
          select: () => builder,
          eq: () => builder,
          order: async () => ({ data: [], error: null }),
        };
        return builder;
      }
      if (table === "claude_files") {
        const builder = {
          select: () => builder,
          eq: async () => ({ data: [], error: null }),
        };
        return builder;
      }
      throw new Error(`tabla inesperada: ${table}`);
    },
  }),
}));

import { GET, PATCH } from "@/app/api/me/conversations/[id]/route";

const USER = "11111111-1111-1111-1111-111111111111";
const CONVERSATION = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const PROJECT_A = "22222222-2222-2222-2222-222222222222";

const context = { params: Promise.resolve({ id: CONVERSATION }) };

beforeEach(() => {
  state.conversation.user_id = USER;
  state.conversation.project_id = PROJECT_A;
  state.gateAllowed = true;
  state.updateCalls = 0;
  mocks.getSession.mockResolvedValue({ userId: USER });
  vi.clearAllMocks();
});

describe("conversation project context", () => {
  test("GET valida el gate del proyecto de la conversación", async () => {
    const response = await GET(
      new Request(`http://localhost/api/me/conversations/${CONVERSATION}`),
      context,
    );

    expect(response.status).toBe(200);
    expect(mocks.hasProjectGate).toHaveBeenCalledWith(PROJECT_A);
  });

  test("GET permite una conversación legacy null sin inventar un gate", async () => {
    state.conversation.project_id = null;

    const response = await GET(
      new Request(`http://localhost/api/me/conversations/${CONVERSATION}`),
      context,
    );

    expect(response.status).toBe(200);
    expect(mocks.hasProjectGate).not.toHaveBeenCalled();
  });

  test("PATCH bloquea un proyecto privado sin gate antes de actualizar", async () => {
    state.gateAllowed = false;

    const response = await PATCH(
      new Request(`http://localhost/api/me/conversations/${CONVERSATION}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "Nuevo título" }),
      }),
      context,
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: "project_locked" });
    expect(state.updateCalls).toBe(0);
  });

  test("PATCH usa el gate canónico y actualiza con acceso", async () => {
    const response = await PATCH(
      new Request(`http://localhost/api/me/conversations/${CONVERSATION}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "Nuevo título" }),
      }),
      context,
    );

    expect(response.status).toBe(200);
    expect(mocks.hasProjectGate).toHaveBeenCalledWith(PROJECT_A);
    expect(state.updateCalls).toBe(1);
  });
});
