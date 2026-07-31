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
  messages: [] as Array<{
    id: string;
    role: "user" | "assistant";
    content: string;
    images: string[];
    tokens_input: number | null;
    tokens_output: number | null;
    created_at: string;
  }>,
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
          order: async () => ({ data: state.messages, error: null }),
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
  state.messages = [];
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

  test("GET desempata un batch como user antes de assistant", async () => {
    const createdAt = "2026-07-31T23:08:20.68781+00:00";
    state.messages = [
      {
        id: "assistant-1",
        role: "assistant",
        content: "Acá está el archivo",
        images: [],
        tokens_input: 10,
        tokens_output: 20,
        created_at: createdAt,
      },
      {
        id: "user-1",
        role: "user",
        content: "pasame el txt",
        images: [],
        tokens_input: null,
        tokens_output: null,
        created_at: createdAt,
      },
    ];

    const response = await GET(
      new Request(`http://localhost/api/me/conversations/${CONVERSATION}`),
      context,
    );
    const body = (await response.json()) as {
      messages: Array<{ id: string; role: string }>;
    };

    expect(body.messages.map(({ id, role }) => ({ id, role }))).toEqual([
      { id: "user-1", role: "user" },
      { id: "assistant-1", role: "assistant" },
    ]);
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
