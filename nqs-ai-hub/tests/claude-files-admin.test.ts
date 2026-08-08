/**
 * Admin bypass en GET /api/tools/claude/files/[id]:
 * dueño OK; otro empleado 403; admin sin gate 403; admin+gate 200.
 */
import { beforeEach, describe, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  session: {
    userId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    role: "employee" as "admin" | "employee",
  },
  gastosUnlocked: false,
  file: {
    user_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    storage_path: "path/file.pdf",
    name: "doc.pdf",
  },
}));

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  hasGastosGate: vi.fn(async () => state.gastosUnlocked),
  createFileDownloadUrl: vi.fn(async () => "https://signed.example/dl"),
  signDownloadUrls: vi.fn(async () => [
    { path: "path/file.pdf", url: "https://signed.example/inline" },
  ]),
}));

vi.mock("@/lib/auth/server", () => ({
  getSession: mocks.getSession,
}));

vi.mock("@/lib/auth/gastos-gate", () => ({
  hasGastosGate: mocks.hasGastosGate,
}));

vi.mock("@/lib/storage/claude-uploads", () => ({
  createFileDownloadUrl: mocks.createFileDownloadUrl,
  signDownloadUrls: mocks.signDownloadUrls,
}));

vi.mock("@/lib/db/supabase", () => ({
  createServerClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: state.file, error: null }),
        }),
      }),
    }),
  }),
}));

import { GET } from "@/app/api/tools/claude/files/[id]/route";

const FILE_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const ctx = { params: Promise.resolve({ id: FILE_ID }) };

beforeEach(() => {
  state.session = {
    userId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    role: "employee",
  };
  state.gastosUnlocked = false;
  state.file.user_id = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
  mocks.getSession.mockImplementation(async () => state.session);
  vi.clearAllMocks();
});

describe("GET /api/tools/claude/files/[id]", () => {
  test("dueño → 200", async () => {
    state.file.user_id = state.session.userId;
    const res = await GET(
      new Request("http://localhost/api/tools/claude/files/x"),
      ctx,
    );
    expect(res.status).toBe(200);
  });

  test("empleado no-owner → 403", async () => {
    const res = await GET(
      new Request("http://localhost/api/tools/claude/files/x"),
      ctx,
    );
    expect(res.status).toBe(403);
  });

  test("admin sin gate → 403", async () => {
    state.session.role = "admin";
    state.gastosUnlocked = false;
    const res = await GET(
      new Request("http://localhost/api/tools/claude/files/x"),
      ctx,
    );
    expect(res.status).toBe(403);
  });

  test("admin con gate → 200 aunque no sea owner", async () => {
    state.session.role = "admin";
    state.gastosUnlocked = true;
    const res = await GET(
      new Request("http://localhost/api/tools/claude/files/x"),
      ctx,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { url: string };
    expect(body.url).toContain("signed.example");
  });
});
