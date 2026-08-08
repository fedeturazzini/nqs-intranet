/**
 * Guard server-side en GET /api/admin/system-prompts:
 * admin sin cookie brain → 403 brain_locked.
 */
import { beforeEach, describe, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  brainUnlocked: false,
}));

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  requireBrainGateApi: vi.fn(async () => {
    if (state.brainUnlocked) return true as const;
    const { NextResponse } = await import("next/server");
    return NextResponse.json({ error: "brain_locked" }, { status: 403 });
  }),
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

vi.mock("@/lib/auth/brain", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/brain")>();
  return {
    ...actual,
    requireBrainGateApi: mocks.requireBrainGateApi,
  };
});

vi.mock("@/lib/db/supabase", () => ({
  createServerClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: async () => ({ data: [], error: null }),
          }),
        }),
      }),
    }),
  }),
}));

import { GET } from "@/app/api/admin/system-prompts/route";

beforeEach(() => {
  state.brainUnlocked = false;
  mocks.getSession.mockResolvedValue({
    userId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    role: "admin",
    name: "Admin",
  });
  vi.clearAllMocks();
});

describe("GET /api/admin/system-prompts brain gate", () => {
  test("admin sin gate → 403 brain_locked", async () => {
    state.brainUnlocked = false;
    const res = await GET(
      new Request("http://localhost/api/admin/system-prompts?toolId=claude"),
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("brain_locked");
  });

  test("admin con gate → 200", async () => {
    state.brainUnlocked = true;
    const res = await GET(
      new Request("http://localhost/api/admin/system-prompts?toolId=claude"),
    );
    expect(res.status).toBe(200);
  });

  test("empleado → 403 (antes del gate)", async () => {
    mocks.getSession.mockResolvedValue({
      userId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      role: "employee",
      name: "Emp",
    });
    const res = await GET(
      new Request("http://localhost/api/admin/system-prompts?toolId=claude"),
    );
    expect(res.status).toBe(403);
    expect(mocks.requireBrainGateApi).not.toHaveBeenCalled();
  });
});
