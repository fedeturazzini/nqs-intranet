/**
 * Guards de endpoints admin de conversaciones + gasto:
 * - empleado → 403
 * - admin sin gate → 403 gastos_locked
 * - admin con gate → 200
 * - detalle sin project gate (opción A)
 */
import { beforeEach, describe, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  role: "admin" as "admin" | "employee",
  userId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  gastosUnlocked: false,
  targetUser: {
    id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    name: "Empleado Test",
  },
  conversations: [
    {
      id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
      title: "Privada",
      created_at: "2026-08-01T00:00:00.000Z",
      updated_at: "2026-08-01T00:00:00.000Z",
      project_id: "dddddddd-dddd-dddd-dddd-dddddddddddd",
      projects: { name: "Proyecto Privado" },
    },
  ],
  conversation: {
    id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
    user_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    project_id: "dddddddd-dddd-dddd-dddd-dddddddddddd",
    title: "Privada",
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-01T00:00:00.000Z",
    users: { name: "Empleado Test" },
    projects: { name: "Proyecto Privado" },
  },
  messages: [
    {
      id: "m1",
      role: "user" as const,
      content: "hola",
      images: [],
      tokens_input: null,
      tokens_output: null,
      created_at: "2026-08-01T00:00:01.000Z",
    },
    {
      id: "m2",
      role: "assistant" as const,
      content: "chau",
      images: [],
      tokens_input: 10,
      tokens_output: 5,
      created_at: "2026-08-01T00:00:02.000Z",
    },
  ],
}));

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  hasGastosGate: vi.fn(async () => state.gastosUnlocked),
  requireGastosGateApi: vi.fn(async () => {
    if (state.gastosUnlocked) return true as const;
    const { NextResponse } = await import("next/server");
    return NextResponse.json({ error: "gastos_locked" }, { status: 403 });
  }),
  hasProjectGate: vi.fn(async () => false), // si se llamara, bloquearía
}));

vi.mock("@/lib/auth/server", () => ({
  getSession: mocks.getSession,
}));

vi.mock("@/lib/auth/admin-guard", () => ({
  requireAdminApi: async () => {
    const session = await mocks.getSession();
    if (!session) {
      const { NextResponse } = await import("next/server");
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    if (session.role !== "admin") {
      const { NextResponse } = await import("next/server");
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    return session;
  },
}));

vi.mock("@/lib/auth/gastos-gate", () => ({
  hasGastosGate: mocks.hasGastosGate,
  requireGastosGateApi: mocks.requireGastosGateApi,
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
      if (table === "users") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: state.targetUser,
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "claude_conversations") {
        const builder: Record<string, unknown> = {};
        builder.select = () => builder;
        builder.eq = () => builder;
        builder.order = () => builder;
        builder.range = async () => ({
          data: state.conversations,
          error: null,
        });
        builder.maybeSingle = async () => ({
          data: state.conversation,
          error: null,
        });
        return builder;
      }
      if (table === "claude_messages") {
        return {
          select: () => ({
            eq: () => ({
              order: async () => ({ data: state.messages, error: null }),
            }),
          }),
        };
      }
      if (table === "claude_files") {
        return {
          select: () => ({
            eq: async () => ({ data: [], error: null }),
          }),
        };
      }
      throw new Error(`tabla inesperada: ${table}`);
    },
  }),
}));

import { GET as listConversations } from "@/app/api/admin/users/[id]/conversations/route";
import { GET as getConversation } from "@/app/api/admin/conversations/[id]/route";
import { GET as getUsdLogs } from "@/app/api/admin/logs/usd/route";

const USER_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const CONV_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const ADMIN_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

beforeEach(() => {
  state.role = "admin";
  state.gastosUnlocked = false;
  mocks.getSession.mockImplementation(async () =>
    state.role === "admin"
      ? { userId: ADMIN_ID, role: "admin", name: "Admin" }
      : { userId: USER_ID, role: "employee", name: "Emp" },
  );
  vi.clearAllMocks();
});

describe("GET /api/admin/users/[id]/conversations", () => {
  const ctx = { params: Promise.resolve({ id: USER_ID }) };

  test("empleado → 403", async () => {
    state.role = "employee";
    const res = await listConversations(
      new Request("http://localhost/api/admin/users/x/conversations"),
      ctx,
    );
    expect(res.status).toBe(403);
  });

  test("admin sin gate → 403 gastos_locked", async () => {
    state.gastosUnlocked = false;
    const res = await listConversations(
      new Request("http://localhost/api/admin/users/x/conversations"),
      ctx,
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("gastos_locked");
  });

  test("admin con gate → lista OK (incluye proyecto privado)", async () => {
    state.gastosUnlocked = true;
    const res = await listConversations(
      new Request(
        "http://localhost/api/admin/users/x/conversations?limit=50&offset=0",
      ),
      ctx,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      conversations: Array<{ projectName: string | null }>;
    };
    expect(body.conversations).toHaveLength(1);
    expect(body.conversations[0].projectName).toBe("Proyecto Privado");
    expect(mocks.hasProjectGate).not.toHaveBeenCalled();
  });
});

describe("GET /api/admin/conversations/[id]", () => {
  const ctx = { params: Promise.resolve({ id: CONV_ID }) };

  test("admin sin gate → 403", async () => {
    state.gastosUnlocked = false;
    const res = await getConversation(
      new Request("http://localhost/api/admin/conversations/x"),
      ctx,
    );
    expect(res.status).toBe(403);
  });

  test("admin con gate → detalle OK sin chequear project gate", async () => {
    state.gastosUnlocked = true;
    const res = await getConversation(
      new Request("http://localhost/api/admin/conversations/x"),
      ctx,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      conversation: { userName: string; projectName: string | null };
      messages: unknown[];
    };
    expect(body.conversation.userName).toBe("Empleado Test");
    expect(body.conversation.projectName).toBe("Proyecto Privado");
    expect(body.messages).toHaveLength(2);
    expect(mocks.hasProjectGate).not.toHaveBeenCalled();
  });

  test("empleado → 403", async () => {
    state.role = "employee";
    state.gastosUnlocked = true;
    const res = await getConversation(
      new Request("http://localhost/api/admin/conversations/x"),
      ctx,
    );
    expect(res.status).toBe(403);
  });
});

describe("GET /api/admin/logs/usd", () => {
  test("admin sin gate → 403 gastos_locked", async () => {
    state.gastosUnlocked = false;
    // getUsdSummary se llama solo si pasa el gate; mockeamos queries.
    vi.doMock("@/lib/db/queries/usage-costs", () => ({
      getUsdSummary: vi.fn(async () => []),
    }));
    const res = await getUsdLogs(
      new Request("http://localhost/api/admin/logs/usd?period=today"),
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("gastos_locked");
  });
});
