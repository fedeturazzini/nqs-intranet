import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getActiveProjectForUser: vi.fn(),
  hasProjectGate: vi.fn(),
  listConversationsForProject: vi.fn(),
}));

vi.mock("@/lib/auth/server", () => ({
  getSession: mocks.getSession,
}));
vi.mock("@/lib/db/queries/projects", () => ({
  getActiveProjectForUser: mocks.getActiveProjectForUser,
}));
vi.mock("@/lib/auth/project-gate", () => ({
  hasProjectGate: mocks.hasProjectGate,
}));
vi.mock("@/lib/db/queries/conversations", () => ({
  listConversationsForProject: mocks.listConversationsForProject,
}));

import { GET } from "@/app/api/me/conversations/route";

const USER = "11111111-1111-4111-8111-111111111111";
const PROJECT = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({ userId: USER });
  mocks.getActiveProjectForUser.mockResolvedValue({
    id: PROJECT,
    is_active: true,
    is_private: false,
    gate_version: 2,
  });
  mocks.hasProjectGate.mockResolvedValue(true);
  mocks.listConversationsForProject.mockResolvedValue([
    {
      id: "conversation-1",
      title: "Conversación",
      created_at: null,
      updated_at: null,
    },
  ]);
});

describe("GET /api/me/conversations", () => {
  test("reusa proyecto y gate precargado antes de listar", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(mocks.getActiveProjectForUser).toHaveBeenCalledWith(USER);
    expect(mocks.hasProjectGate).toHaveBeenCalledWith(PROJECT, {
      is_private: false,
      gate_version: 2,
    });
    expect(mocks.listConversationsForProject).toHaveBeenCalledWith(
      USER,
      PROJECT,
    );
    expect(await response.json()).toMatchObject({
      conversations: [{ id: "conversation-1" }],
    });
  });

  test("gate privado revocado devuelve lista vacía sin leer conversaciones", async () => {
    mocks.getActiveProjectForUser.mockResolvedValue({
      id: PROJECT,
      is_active: true,
      is_private: true,
      gate_version: 9,
    });
    mocks.hasProjectGate.mockResolvedValue(false);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(mocks.hasProjectGate).toHaveBeenCalledWith(PROJECT, {
      is_private: true,
      gate_version: 9,
    });
    expect(mocks.listConversationsForProject).not.toHaveBeenCalled();
    expect(await response.json()).toEqual({ conversations: [] });
  });

  test("sin proyecto activo evita gate y listado", async () => {
    mocks.getActiveProjectForUser.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(mocks.hasProjectGate).not.toHaveBeenCalled();
    expect(mocks.listConversationsForProject).not.toHaveBeenCalled();
  });
});
