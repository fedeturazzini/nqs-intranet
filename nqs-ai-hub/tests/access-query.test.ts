/**
 * Tests de lib/db/queries/access — listToolsWithAccess.
 *
 * Foco: el status que muestra el HUB debe espejar el criterio del server
 * (`canUseTool`) para `expires_at`. Un acceso "active" con `expires_at` vencido
 * tiene que reportarse como "expired" — si el hub lo mostrara "active", la card
 * sería clickeable, el user entraría a /tool/<id>, el server lo rebotaría a /hub
 * y la card seguiría "active" → loop. Ver rebote-claude-audit.md.
 *
 * Mock: builder *thenable* (se await-ea directo, sin `.maybeSingle()`) que
 * devuelve arrays por tabla.
 */
import { beforeEach, describe, expect, test, vi } from "vitest";

type Rows = Record<string, unknown>[];
let tableData: Record<string, Rows> = {};

function makeBuilder(table: string) {
  const result = { data: tableData[table] ?? [], error: null };
  const builder = {
    select: () => builder,
    neq: () => builder,
    eq: () => builder,
    // Thenable: `await builder` resuelve a { data, error }.
    then: (resolve: (v: unknown) => void) => resolve(result),
  };
  return builder;
}

vi.mock("@/lib/db/supabase", () => ({
  createServerClient: () => ({
    from: (table: string) => makeBuilder(table),
  }),
}));

const { listToolsWithAccess } = await import("@/lib/db/queries/access");

const CLAUDE_TOOL = {
  id: "claude",
  name: "Claude",
  vendor: "Anthropic",
  category: "chat",
  description: "",
  color: "#D97757",
  glyph: "C",
  is_active: true,
  uses_credits: false,
};

beforeEach(() => {
  tableData = {};
});

describe("listToolsWithAccess — expires_at", () => {
  test("acceso 'active' con expires_at VENCIDO → status 'expired' (no 'active')", async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    tableData = {
      tools: [CLAUDE_TOOL],
      tool_access: [{ tool_id: "claude", status: "active", expires_at: past }],
    };
    const tools = await listToolsWithAccess("u1");
    const claude = tools.find((t) => t.id === "claude");
    // El punto del fix: NO puede quedar "active" (sería clickeable → rebote).
    expect(claude?.access.status).toBe("expired");
    // Y expone la fecha de vencimiento para el pill.
    expect(claude?.access.expiredAt).toBeTruthy();
  });

  test("acceso 'active' con expires_at FUTURO → status 'active'", async () => {
    const future = new Date(Date.now() + 3_600_000).toISOString();
    tableData = {
      tools: [CLAUDE_TOOL],
      tool_access: [{ tool_id: "claude", status: "active", expires_at: future }],
    };
    const tools = await listToolsWithAccess("u1");
    expect(tools.find((t) => t.id === "claude")?.access.status).toBe("active");
  });

  test("acceso 'active' permanente (expires_at null) → status 'active'", async () => {
    tableData = {
      tools: [CLAUDE_TOOL],
      tool_access: [{ tool_id: "claude", status: "active", expires_at: null }],
    };
    const tools = await listToolsWithAccess("u1");
    expect(tools.find((t) => t.id === "claude")?.access.status).toBe("active");
  });

  test("sin row de acceso → status 'locked'", async () => {
    tableData = { tools: [CLAUDE_TOOL], tool_access: [] };
    const tools = await listToolsWithAccess("u1");
    expect(tools.find((t) => t.id === "claude")?.access.status).toBe("locked");
  });
});
