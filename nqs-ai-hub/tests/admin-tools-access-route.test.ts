import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdminApi: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("@/lib/auth/admin-guard", () => ({
  requireAdminApi: mocks.requireAdminApi,
}));

vi.mock("@/lib/db/supabase", () => ({
  createServerClient: () => ({
    from: () => ({
      upsert: mocks.upsert,
    }),
  }),
}));

import { PATCH as patchAccess } from "@/app/api/admin/tools/access/route";
import { PATCH as patchSchedule } from "@/app/api/admin/tools/schedule/route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdminApi.mockResolvedValue({
    userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  });
  mocks.upsert.mockResolvedValue({ error: null });
});

describe("PATCH /api/admin/tools/access", () => {
  test("hacer permanente limpia expires_at", async () => {
    const res = await patchAccess(
      new Request("http://localhost/api/admin/tools/access", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          userId: "11111111-1111-4111-8111-111111111111",
          toolId: "claude",
          status: "active",
        }),
      }),
    );

    expect(res.status).toBe(200);
    expect(mocks.upsert).toHaveBeenCalledWith(
      {
        user_id: "11111111-1111-4111-8111-111111111111",
        tool_id: "claude",
        status: "active",
        granted_by: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        expires_at: null,
      },
      { onConflict: "user_id,tool_id" },
    );
  });
});

describe("PATCH /api/admin/tools/schedule", () => {
  test("persiste el borrador de horarios enviado", async () => {
    const schedule = {
      monday: { enabled: true, from: "08:00", to: "19:00" },
      tuesday: { enabled: false },
    };
    const res = await patchSchedule(
      new Request("http://localhost/api/admin/tools/schedule", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          userId: "11111111-1111-4111-8111-111111111111",
          toolId: "claude",
          schedule,
        }),
      }),
    );

    expect(res.status).toBe(200);
    expect(mocks.upsert).toHaveBeenCalledWith(
      {
        user_id: "11111111-1111-4111-8111-111111111111",
        tool_id: "claude",
        schedule,
        granted_by: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      },
      { onConflict: "user_id,tool_id" },
    );
  });
});
