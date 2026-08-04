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
  test("sin duración deja expires_at null (permanente, compat)", async () => {
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
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      status: "active",
      expires_at: null,
    });
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

  test("duration_minutes calcula expires_at futuro", async () => {
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now);

    const res = await patchAccess(
      new Request("http://localhost/api/admin/tools/access", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          userId: "11111111-1111-4111-8111-111111111111",
          toolId: "claude",
          status: "active",
          duration_minutes: 1440,
        }),
      }),
    );

    expect(res.status).toBe(200);
    const expected = new Date(now + 1440 * 60_000).toISOString();
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      expires_at: expected,
    });
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "active",
        expires_at: expected,
      }),
      { onConflict: "user_id,tool_id" },
    );
  });

  test("custom_expires_at null hace permanente", async () => {
    const res = await patchAccess(
      new Request("http://localhost/api/admin/tools/access", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          userId: "11111111-1111-4111-8111-111111111111",
          toolId: "claude",
          status: "active",
          custom_expires_at: null,
        }),
      }),
    );

    expect(res.status).toBe(200);
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ expires_at: null }),
      { onConflict: "user_id,tool_id" },
    );
  });

  test("custom_expires_at futuro se persiste", async () => {
    const future = new Date(Date.now() + 3_600_000).toISOString();
    const res = await patchAccess(
      new Request("http://localhost/api/admin/tools/access", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          userId: "11111111-1111-4111-8111-111111111111",
          toolId: "claude",
          status: "active",
          custom_expires_at: future,
        }),
      }),
    );

    expect(res.status).toBe(200);
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ expires_at: future }),
      { onConflict: "user_id,tool_id" },
    );
  });

  test("rechaza custom_expires_at en el pasado", async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const res = await patchAccess(
      new Request("http://localhost/api/admin/tools/access", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          userId: "11111111-1111-4111-8111-111111111111",
          toolId: "claude",
          status: "active",
          custom_expires_at: past,
        }),
      }),
    );

    expect(res.status).toBe(400);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  test("rechaza duration_minutes y custom_expires_at juntos", async () => {
    const res = await patchAccess(
      new Request("http://localhost/api/admin/tools/access", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          userId: "11111111-1111-4111-8111-111111111111",
          toolId: "claude",
          status: "active",
          duration_minutes: 60,
          custom_expires_at: new Date(Date.now() + 60_000).toISOString(),
        }),
      }),
    );

    expect(res.status).toBe(400);
    expect(mocks.upsert).not.toHaveBeenCalled();
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

  test("acepta ventanas overnight (from > to)", async () => {
    const schedule = {
      monday: { enabled: true, from: "08:00", to: "01:00" },
      tuesday: { enabled: true, from: "08:00", to: "01:00" },
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
      expect.objectContaining({ schedule }),
      { onConflict: "user_id,tool_id" },
    );
  });

  test("rechaza from === to", async () => {
    const res = await patchSchedule(
      new Request("http://localhost/api/admin/tools/schedule", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          userId: "11111111-1111-4111-8111-111111111111",
          toolId: "claude",
          schedule: {
            monday: { enabled: true, from: "08:00", to: "08:00" },
          },
        }),
      }),
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as { message?: string };
    expect(body.message).toMatch(/iguales/i);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
