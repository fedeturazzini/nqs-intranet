import { beforeEach, describe, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  tables: [] as string[],
  select: "",
  relation: null as Record<string, unknown> | null,
}));

vi.mock("@/lib/db/supabase", () => ({
  createServerClient: () => ({
    from: (table: string) => {
      state.tables.push(table);
      const builder = {
        select: (selection: string) => {
          state.select = selection;
          return builder;
        },
        eq: () => builder,
        maybeSingle: async () => ({
          data: state.relation ? { project: state.relation } : null,
          error: null,
        }),
      };
      return builder;
    },
  }),
}));

import { getActiveProjectForUser } from "@/lib/db/queries/projects";

beforeEach(() => {
  state.tables = [];
  state.select = "";
  state.relation = null;
});

describe("getActiveProjectForUser", () => {
  test("resuelve user_active_project y projects en una sola query relacional", async () => {
    state.relation = {
      id: "project-1",
      name: "Proyecto",
      slug: "proyecto",
      description: null,
      icon: null,
      is_active: true,
      is_private: false,
      gate_version: 1,
      password_hash: "nunca-sale",
      created_by: null,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    };

    const project = await getActiveProjectForUser("user-1");

    expect(state.tables).toEqual(["user_active_project"]);
    expect(state.select).toContain(
      "projects!user_active_project_project_id_fkey",
    );
    expect(project).toMatchObject({ id: "project-1", is_active: true });
    expect(project).not.toHaveProperty("password_hash");
  });

  test("un proyecto activo archivado se trata como ausencia de selección", async () => {
    state.relation = {
      id: "project-1",
      is_active: false,
    };

    await expect(getActiveProjectForUser("user-1")).resolves.toBeNull();
    expect(state.tables).toEqual(["user_active_project"]);
  });
});
