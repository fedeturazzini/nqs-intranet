import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  notifySlack: vi.fn(),
  logInfo: vi.fn(),
  logError: vi.fn(),
  after: vi.fn((fn: () => Promise<void>) => {
    void fn();
  }),
  state: {
    tool: {
      id: "claude",
      name: "Claude",
      is_active: true,
    } as { id: string; name: string; is_active: boolean } | null,
    access: null as {
      status: string;
      expires_at: string | null;
    } | null,
    pending: null as { id: string } | null,
    inserted: null as { id: string } | null,
    insertError: null as { message: string } | null,
  },
}));

vi.mock("next/server", async () => {
  const actual =
    await vi.importActual<typeof import("next/server")>("next/server");
  return {
    ...actual,
    after: mocks.after,
  };
});

vi.mock("@/lib/auth/server", () => ({
  getSession: mocks.getSession,
}));

vi.mock("@/lib/notifications/slack", () => ({
  notifySlack: mocks.notifySlack,
}));

vi.mock("@/lib/log", () => ({
  logInfo: mocks.logInfo,
  logError: mocks.logError,
}));

vi.mock("@/lib/db/supabase", () => ({
  createServerClient: () => ({
    from: (table: string) => {
      if (table === "tools") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: mocks.state.tool,
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "tool_access") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: mocks.state.access,
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      if (table === "access_requests") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  eq: () => ({
                    maybeSingle: async () => ({
                      data: mocks.state.pending,
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          }),
          insert: () => ({
            select: () => ({
              single: async () => ({
                data: mocks.state.inserted,
                error: mocks.state.insertError,
              }),
            }),
          }),
          update: () => ({
            eq: async () => ({ error: null }),
          }),
        };
      }
      throw new Error(`tabla inesperada: ${table}`);
    },
  }),
}));

import { POST } from "@/app/api/me/access-request/route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({
    userId: "11111111-1111-4111-8111-111111111111",
    name: "Fran",
  });
  mocks.notifySlack.mockResolvedValue(true);
  mocks.state.tool = { id: "claude", name: "Claude", is_active: true };
  mocks.state.access = null;
  mocks.state.pending = null;
  mocks.state.inserted = { id: "req-1" };
  mocks.state.insertError = null;
});

function request(body: unknown) {
  return new Request("http://localhost/api/me/access-request", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/me/access-request — renovación", () => {
  test("rechaza acceso permanente vigente", async () => {
    mocks.state.access = { status: "active", expires_at: null };
    const res = await POST(request({ toolId: "claude" }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: "already_has_access",
    });
  });

  test("rechaza acceso temporal todavía vigente", async () => {
    mocks.state.access = {
      status: "active",
      expires_at: new Date(Date.now() + 3_600_000).toISOString(),
    };
    const res = await POST(request({ toolId: "claude" }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: "already_has_access",
    });
  });

  test("acepta renovación cuando active + expires_at está vencido", async () => {
    mocks.state.access = {
      status: "active",
      expires_at: new Date(Date.now() - 60_000).toISOString(),
    };
    const res = await POST(
      request({
        toolId: "claude",
        reason: "Necesito renovar Claude",
      }),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      ok: true,
      requestId: "req-1",
    });
    expect(mocks.logInfo).toHaveBeenCalledWith(
      "access-request creada",
      expect.objectContaining({
        toolId: "claude",
        requestId: "req-1",
        reason: "renewal",
      }),
    );
  });

  test("acepta renovación cuando status DB es expired", async () => {
    mocks.state.access = {
      status: "expired",
      expires_at: new Date(Date.now() - 60_000).toISOString(),
    };
    const res = await POST(request({ toolId: "claude" }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true });
  });

  test("deduplica solicitud pendiente", async () => {
    mocks.state.access = {
      status: "active",
      expires_at: new Date(Date.now() - 60_000).toISOString(),
    };
    mocks.state.pending = { id: "pending-1" };
    const res = await POST(request({ toolId: "claude" }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: "already_pending",
    });
  });
});
