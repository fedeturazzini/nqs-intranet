/**
 * Tests de lib/middleware/permissions — canUseTool.
 *
 * Mockeamos `createServerClient` con un query-builder chainable que
 * devuelve data por tabla. Cada test configura `tableData`.
 */
import { beforeEach, describe, expect, test, vi } from "vitest";

type Row = Record<string, unknown> | null;
let tableData: Record<string, Row> = {};

function makeBuilder(table: string) {
  const result = { data: tableData[table] ?? null, error: null };
  const builder = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: async () => result,
  };
  return builder;
}

vi.mock("@/lib/db/supabase", () => ({
  createServerClient: () => ({
    from: (table: string) => makeBuilder(table),
  }),
}));

// `checkSchedule` lo dejamos real — es lógica pura sin deps.

const { canUseTool, requireToolAccess } = await import(
  "@/lib/middleware/permissions"
);

beforeEach(() => {
  tableData = {};
});

describe("canUseTool", () => {
  test("user activo + acceso activo + tool sin créditos → allowed", async () => {
    tableData = {
      users: { id: "u1", is_active: true, role: "employee" },
      tool_access: { status: "active", expires_at: null, schedule: null },
      tools: { uses_credits: false },
    };
    const r = await canUseTool("u1", "claude");
    expect(r.allowed).toBe(true);
  });

  test("user sin registro de acceso → no_access", async () => {
    tableData = {
      users: { id: "u1", is_active: true, role: "employee" },
      tool_access: null,
    };
    const r = await canUseTool("u1", "claude");
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.reason).toBe("no_access");
  });

  test("acceso locked → no_access", async () => {
    tableData = {
      users: { id: "u1", is_active: true, role: "employee" },
      tool_access: { status: "locked" },
    };
    const r = await canUseTool("u1", "claude");
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.reason).toBe("no_access");
  });

  test("acceso pending → pending_approval", async () => {
    tableData = {
      users: { id: "u1", is_active: true, role: "employee" },
      tool_access: { status: "pending" },
    };
    const r = await canUseTool("u1", "claude");
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.reason).toBe("pending_approval");
  });

  test("tool de créditos con 0 disponibles → no_credits", async () => {
    tableData = {
      users: { id: "u1", is_active: true, role: "employee" },
      tool_access: { status: "active", expires_at: null, schedule: null },
      tools: { uses_credits: true },
      credit_allocations: { credits_assigned: 10, credits_used: 10 },
    };
    const r = await canUseTool("u1", "3dsky");
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.reason).toBe("no_credits");
  });

  test("tool de créditos con saldo → allowed", async () => {
    tableData = {
      users: { id: "u1", is_active: true, role: "employee" },
      tool_access: { status: "active", expires_at: null, schedule: null },
      tools: { uses_credits: true },
      credit_allocations: { credits_assigned: 30, credits_used: 3 },
    };
    const r = await canUseTool("u1", "3dsky");
    expect(r.allowed).toBe(true);
  });

  test("admin tiene acceso a todo (early return, sin chequear tool_access)", async () => {
    tableData = {
      users: { id: "admin1", is_active: true, role: "admin" },
      // no seteamos tool_access — admin no debería consultarlo
    };
    const r = await canUseTool("admin1", "weavy");
    expect(r.allowed).toBe(true);
  });

  test("user inactivo → not_authenticated", async () => {
    tableData = {
      users: { id: "u1", is_active: false, role: "employee" },
    };
    const r = await canUseTool("u1", "claude");
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.reason).toBe("not_authenticated");
  });

  test("user inexistente → not_authenticated", async () => {
    tableData = { users: null };
    const r = await canUseTool("ghost", "claude");
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.reason).toBe("not_authenticated");
  });

  test("acceso con expires_at en el pasado → expired", async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    tableData = {
      users: { id: "u1", is_active: true, role: "employee" },
      tool_access: { status: "active", expires_at: past, schedule: null },
    };
    const r = await canUseTool("u1", "3dsky");
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.reason).toBe("expired");
  });

  test("schedule que bloquea el día actual → outside_hours", async () => {
    // Schedule con TODOS los días deshabilitados → siempre fuera de
    // horario, sin importar cuándo corra el test.
    const blockedSchedule = {
      monday: { enabled: false },
      tuesday: { enabled: false },
      wednesday: { enabled: false },
      thursday: { enabled: false },
      friday: { enabled: false },
      saturday: { enabled: false },
      sunday: { enabled: false },
    };
    tableData = {
      users: { id: "u1", is_active: true, role: "employee" },
      tool_access: {
        status: "active",
        expires_at: null,
        schedule: blockedSchedule,
      },
    };
    const r = await canUseTool("u1", "3dsky");
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.reason).toBe("outside_hours");
  });
});

describe("requireToolAccess", () => {
  test("permiso OK → devuelve null (deja pasar)", async () => {
    tableData = {
      users: { id: "u1", is_active: true, role: "employee" },
      tool_access: { status: "active", expires_at: null, schedule: null },
      tools: { uses_credits: false },
    };
    const denied = await requireToolAccess("u1", "claude");
    expect(denied).toBeNull();
  });

  test("sin acceso → NextResponse 403", async () => {
    tableData = {
      users: { id: "u1", is_active: true, role: "employee" },
      tool_access: null,
    };
    const denied = await requireToolAccess("u1", "claude");
    expect(denied).not.toBeNull();
    expect(denied?.status).toBe(403);
  });

  test("user inactivo → NextResponse 401", async () => {
    tableData = { users: { id: "u1", is_active: false, role: "employee" } };
    const denied = await requireToolAccess("u1", "claude");
    expect(denied?.status).toBe(401);
  });
});
