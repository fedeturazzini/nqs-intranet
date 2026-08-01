import { beforeEach, describe, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  table: "",
  selection: "",
  filters: [] as Array<[string, string]>,
  order: null as { column: string; ascending: boolean } | null,
  limit: 0,
}));

vi.mock("@/lib/db/supabase", () => ({
  createServerClient: () => ({
    from: (table: string) => {
      state.table = table;
      const builder = {
        select: (selection: string) => {
          state.selection = selection;
          return builder;
        },
        eq: (column: string, value: string) => {
          state.filters.push([column, value]);
          return builder;
        },
        order: (column: string, options: { ascending: boolean }) => {
          state.order = { column, ascending: options.ascending };
          return builder;
        },
        limit: async (limit: number) => {
          state.limit = limit;
          return {
            data: [
              {
                id: "conversation-1",
                title: "Conversación",
                created_at: null,
                updated_at: null,
              },
            ],
            error: null,
          };
        },
      };
      return builder;
    },
  }),
}));

import {
  CONVERSATION_LIST_LIMIT,
  listConversationsForProject,
} from "@/lib/db/queries/conversations";

beforeEach(() => {
  state.table = "";
  state.selection = "";
  state.filters = [];
  state.order = null;
  state.limit = 0;
});

describe("listConversationsForProject", () => {
  test("filtra ownership y proyecto con columnas mínimas y límite", async () => {
    const rows = await listConversationsForProject("user-1", "project-1");

    expect(state.table).toBe("claude_conversations");
    expect(state.selection).toBe("id, title, created_at, updated_at");
    expect(state.filters).toEqual([
      ["user_id", "user-1"],
      ["project_id", "project-1"],
    ]);
    expect(state.order).toEqual({ column: "updated_at", ascending: false });
    expect(state.limit).toBe(CONVERSATION_LIST_LIMIT);
    expect(rows).toHaveLength(1);
  });
});
