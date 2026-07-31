import { beforeEach, describe, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  conversation: null as {
    id: string;
    user_id: string;
    project_id: string | null;
  } | null,
  activeProjectId: null as string | null,
  project: null as {
    id: string;
    name: string;
    is_active: boolean;
    is_private: boolean;
    gate_version: number;
  } | null,
  gateAllowed: true,
}));

const mocks = vi.hoisted(() => ({
  logWarn: vi.fn(),
  getActiveProjectId: vi.fn(async () => state.activeProjectId),
  getProjectForExecuteContext: vi.fn(async () => state.project),
  hasProjectGate: vi.fn(async () => state.gateAllowed),
}));

vi.mock("@/lib/db/supabase", () => ({
  createServerClient: () => ({
    from: (table: string) => {
      if (table !== "claude_conversations") {
        throw new Error(`tabla inesperada: ${table}`);
      }
      const builder = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: async () => ({
          data: state.conversation,
          error: null,
        }),
      };
      return builder;
    },
  }),
}));

vi.mock("@/lib/db/queries/projects", () => ({
  getActiveProjectId: mocks.getActiveProjectId,
  getProjectForExecuteContext: mocks.getProjectForExecuteContext,
}));

vi.mock("@/lib/auth/project-gate", () => ({
  hasProjectGate: mocks.hasProjectGate,
}));

vi.mock("@/lib/log", () => ({
  logWarn: mocks.logWarn,
}));

import { resolveClaudeExecuteContext } from "@/lib/adapters/claude-execute-context";

const USER = "11111111-1111-1111-1111-111111111111";
const OTHER_USER = "99999999-9999-9999-9999-999999999999";
const CONVERSATION = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const PROJECT_A = "22222222-2222-2222-2222-222222222222";
const PROJECT_B = "33333333-3333-3333-3333-333333333333";

function availableProject(id: string, isPrivate = false) {
  return {
    id,
    name: "Proyecto A",
    is_active: true,
    is_private: isPrivate,
    gate_version: 3,
  };
}

beforeEach(() => {
  state.conversation = null;
  state.activeProjectId = null;
  state.project = availableProject(PROJECT_A);
  state.gateAllowed = true;
  vi.clearAllMocks();
});

describe("resolveClaudeExecuteContext", () => {
  test("una conversación existente manda aunque el global sea otro", async () => {
    state.conversation = {
      id: CONVERSATION,
      user_id: USER,
      project_id: PROJECT_A,
    };
    state.activeProjectId = PROJECT_B;

    const result = await resolveClaudeExecuteContext(USER, {
      conversationId: CONVERSATION,
    });

    expect(result).toEqual({
      ok: true,
      value: {
        projectId: PROJECT_A,
        projectName: "Proyecto A",
        isPrivate: false,
        source: "conversation",
      },
    });
    expect(mocks.getActiveProjectId).not.toHaveBeenCalled();
  });

  test("acepta un projectId explícito que coincide con la conversación", async () => {
    state.conversation = {
      id: CONVERSATION,
      user_id: USER,
      project_id: PROJECT_A,
    };

    const result = await resolveClaudeExecuteContext(USER, {
      conversationId: CONVERSATION,
      projectId: PROJECT_A,
    });

    expect(result.ok).toBe(true);
  });

  test("rechaza con 409 un projectId distinto antes de ejecutar", async () => {
    state.conversation = {
      id: CONVERSATION,
      user_id: USER,
      project_id: PROJECT_A,
    };

    const result = await resolveClaudeExecuteContext(USER, {
      conversationId: CONVERSATION,
      projectId: PROJECT_B,
    });

    expect(result).toMatchObject({
      ok: false,
      error: { status: 409, error: "project_context_mismatch" },
    });
    expect(mocks.getProjectForExecuteContext).not.toHaveBeenCalled();
    expect(mocks.logWarn).toHaveBeenCalledWith(
      "execute: contexto de proyecto no coincide",
      expect.objectContaining({ reason: "project_context_mismatch" }),
    );
  });

  test("rechaza ownership ajeno con 403", async () => {
    state.conversation = {
      id: CONVERSATION,
      user_id: OTHER_USER,
      project_id: PROJECT_A,
    };

    const result = await resolveClaudeExecuteContext(USER, {
      conversationId: CONVERSATION,
    });

    expect(result).toMatchObject({
      ok: false,
      error: { status: 403, error: "forbidden" },
    });
  });

  test("devuelve 404 si la conversación no existe", async () => {
    const result = await resolveClaudeExecuteContext(USER, {
      conversationId: CONVERSATION,
    });

    expect(result).toMatchObject({
      ok: false,
      error: { status: 404, error: "not_found" },
    });
  });

  test("una conversación null usa el projectId explícito con log legacy", async () => {
    state.conversation = {
      id: CONVERSATION,
      user_id: USER,
      project_id: null,
    };

    const result = await resolveClaudeExecuteContext(USER, {
      conversationId: CONVERSATION,
      projectId: PROJECT_A,
    });

    expect(result).toEqual({
      ok: true,
      value: {
        projectId: PROJECT_A,
        projectName: "Proyecto A",
        isPrivate: false,
        source: "legacy_request",
      },
    });
    expect(mocks.logWarn).toHaveBeenCalledWith(
      "execute: conversación sin proyecto",
      expect.objectContaining({ reason: "conversation_project_null" }),
    );
  });

  test("una conversación null cae al global solo como fallback legacy", async () => {
    state.conversation = {
      id: CONVERSATION,
      user_id: USER,
      project_id: null,
    };
    state.activeProjectId = PROJECT_A;

    const result = await resolveClaudeExecuteContext(USER, {
      conversationId: CONVERSATION,
    });

    expect(result).toEqual({
      ok: true,
      value: {
        projectId: PROJECT_A,
        projectName: "Proyecto A",
        isPrivate: false,
        source: "legacy_global_fallback",
      },
    });
    expect(mocks.logWarn).toHaveBeenCalledWith(
      "execute: fallback al proyecto activo global",
      expect.objectContaining({ reason: "global_project_fallback" }),
    );
  });

  test("una conversación null sin contexto devuelve conflicto legacy", async () => {
    state.conversation = {
      id: CONVERSATION,
      user_id: USER,
      project_id: null,
    };

    const result = await resolveClaudeExecuteContext(USER, {
      conversationId: CONVERSATION,
    });

    expect(result).toMatchObject({
      ok: false,
      error: { status: 409, error: "legacy_conversation_no_project" },
    });
  });

  test("una conversación nueva usa el request y no consulta el global", async () => {
    const result = await resolveClaudeExecuteContext(USER, {
      projectId: PROJECT_A,
    });

    expect(result).toEqual({
      ok: true,
      value: {
        projectId: PROJECT_A,
        projectName: "Proyecto A",
        isPrivate: false,
        source: "request",
      },
    });
    expect(mocks.getActiveProjectId).not.toHaveBeenCalled();
  });

  test("un cliente viejo usa el global para conversación nueva y lo loguea", async () => {
    state.activeProjectId = PROJECT_A;

    const result = await resolveClaudeExecuteContext(USER, {});

    expect(result).toEqual({
      ok: true,
      value: {
        projectId: PROJECT_A,
        projectName: "Proyecto A",
        isPrivate: false,
        source: "global_fallback",
      },
    });
    expect(mocks.logWarn).toHaveBeenCalledWith(
      "execute: fallback al proyecto activo global",
      expect.objectContaining({ reason: "global_project_fallback" }),
    );
  });

  test("una conversación nueva sin request ni global exige proyecto", async () => {
    const result = await resolveClaudeExecuteContext(USER, {});

    expect(result).toMatchObject({
      ok: false,
      error: { status: 400, error: "project_required" },
    });
  });

  test("rechaza proyecto inexistente o archivado", async () => {
    state.project = {
      id: PROJECT_A,
      name: "Proyecto A",
      is_active: false,
      is_private: false,
      gate_version: 3,
    };

    const result = await resolveClaudeExecuteContext(USER, {
      projectId: PROJECT_A,
    });

    expect(result).toMatchObject({
      ok: false,
      error: { status: 404, error: "project_not_available" },
    });
  });

  test("rechaza proyecto privado sin gate", async () => {
    state.project = availableProject(PROJECT_A, true);
    state.gateAllowed = false;

    const result = await resolveClaudeExecuteContext(USER, {
      projectId: PROJECT_A,
    });

    expect(result).toMatchObject({
      ok: false,
      error: { status: 403, error: "project_locked" },
    });
    expect(mocks.hasProjectGate).toHaveBeenCalledWith(PROJECT_A, {
      is_private: true,
      gate_version: 3,
    });
  });
});
