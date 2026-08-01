import type { ReactElement } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  canUseTool: vi.fn(),
  listActiveProjects: vi.fn(),
  getActiveProjectForUser: vi.fn(),
  listConversationsForProject: vi.fn(),
  verifyProjectGateToken: vi.fn(),
  cookieGet: vi.fn(),
  logWarn: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: mocks.cookieGet }),
}));
vi.mock("@/lib/auth/server", () => ({ requireAuth: mocks.requireAuth }));
vi.mock("@/lib/middleware/permissions", () => ({
  canUseTool: mocks.canUseTool,
}));
vi.mock("@/lib/auth/project-gate", () => ({
  projectGateCookieName: (projectId: string) => `pg_${projectId}`,
  verifyProjectGateToken: mocks.verifyProjectGateToken,
}));
vi.mock("@/lib/db/queries/projects", () => ({
  listActiveProjects: mocks.listActiveProjects,
  getActiveProjectForUser: mocks.getActiveProjectForUser,
}));
vi.mock("@/lib/db/queries/conversations", () => ({
  listConversationsForProject: mocks.listConversationsForProject,
}));
vi.mock("@/lib/log", () => ({ logWarn: mocks.logWarn }));
vi.mock("@/components/screens/ClaudeView", () => ({
  ClaudeView: () => null,
}));

import ToolPage from "@/app/(dashboard)/tool/[toolId]/page";

const USER = "11111111-1111-4111-8111-111111111111";
const PROJECT = "22222222-2222-4222-8222-222222222222";
const session = {
  userId: USER,
  email: "user@nqs.com",
  name: "User",
  initials: "US",
  role: "employee" as const,
  isActive: true,
  theme: "light" as const,
};
const publicProject = {
  id: PROJECT,
  name: "Proyecto",
  icon: null,
  is_active: true,
  is_private: false,
  gate_version: 3,
};
const context = { params: Promise.resolve({ toolId: "claude" }) };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAuth.mockResolvedValue(session);
  mocks.canUseTool.mockResolvedValue({ allowed: true });
  mocks.listActiveProjects.mockResolvedValue([publicProject]);
  mocks.getActiveProjectForUser.mockResolvedValue(publicProject);
  mocks.listConversationsForProject.mockResolvedValue([
    {
      id: "conversation-1",
      title: "Conversación",
      created_at: null,
      updated_at: null,
    },
  ]);
  mocks.verifyProjectGateToken.mockReturnValue(true);
  mocks.cookieGet.mockReturnValue({ value: "valid-cookie" });
});

describe("/tool/claude SSR", () => {
  test("pasa la sesión como hint y entrega conversaciones iniciales", async () => {
    const result = (await ToolPage(context)) as ReactElement<{
      initialConversations: Array<{ id: string }>;
      activeProject: { id: string } | null;
    }>;

    expect(mocks.canUseTool).toHaveBeenCalledWith(USER, "claude", {
      user: session,
    });
    expect(mocks.listConversationsForProject).toHaveBeenCalledWith(
      USER,
      PROJECT,
    );
    expect(result.props.initialConversations).toEqual([
      expect.objectContaining({ id: "conversation-1" }),
    ]);
    expect(result.props.activeProject).toMatchObject({ id: PROJECT });
  });

  test("empleado sin acceso conserva el guard y no carga proyectos", async () => {
    mocks.canUseTool.mockResolvedValue({
      allowed: false,
      reason: "no_access",
    });

    await expect(ToolPage(context)).rejects.toThrow("redirect:/hub");
    expect(mocks.listActiveProjects).not.toHaveBeenCalled();
    expect(mocks.listConversationsForProject).not.toHaveBeenCalled();
  });

  test("proyecto privado con cookie revocada no expone lista ni proyecto activo", async () => {
    const privateProject = {
      ...publicProject,
      is_private: true,
      gate_version: 11,
    };
    mocks.listActiveProjects.mockResolvedValue([privateProject]);
    mocks.getActiveProjectForUser.mockResolvedValue(privateProject);
    mocks.verifyProjectGateToken.mockReturnValue(false);

    const result = (await ToolPage(context)) as ReactElement<{
      initialConversations: unknown[];
      activeProject: { id: string } | null;
      projects: Array<{ id: string; locked: boolean }>;
    }>;

    expect(mocks.verifyProjectGateToken).toHaveBeenCalledWith(
      "valid-cookie",
      PROJECT,
      11,
    );
    expect(mocks.listConversationsForProject).not.toHaveBeenCalled();
    expect(result.props.initialConversations).toEqual([]);
    expect(result.props.activeProject).toBeNull();
    expect(result.props.projects).toEqual([
      expect.objectContaining({ id: PROJECT, locked: true }),
    ]);
  });

  test("si falla el preload, conserva la página y habilita fallback del sidebar", async () => {
    mocks.listConversationsForProject.mockRejectedValue(new Error("db down"));

    const result = (await ToolPage(context)) as ReactElement<{
      initialConversations: unknown[] | null;
      activeProject: { id: string } | null;
    }>;

    expect(result.props.activeProject).toMatchObject({ id: PROJECT });
    expect(result.props.initialConversations).toBeNull();
    expect(mocks.logWarn).toHaveBeenCalledWith(
      "claude SSR: no se pudo precargar conversaciones",
      expect.objectContaining({ userId: USER, projectId: PROJECT }),
    );
  });
});
