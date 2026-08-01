import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  hasProjectGate: vi.fn(),
  getProjectById: vi.fn(),
  setActiveProject: vi.fn(),
  getActiveProjectForUser: vi.fn(),
}));

vi.mock("@/lib/auth/server", () => ({
  getSession: mocks.getSession,
}));

vi.mock("@/lib/auth/project-gate", () => ({
  hasProjectGate: mocks.hasProjectGate,
}));

vi.mock("@/lib/db/queries/projects", () => ({
  getActiveProjectForUser: mocks.getActiveProjectForUser,
  getProjectById: mocks.getProjectById,
  setActiveProject: mocks.setActiveProject,
}));

import { POST } from "@/app/api/me/active-project/route";

const USER = "11111111-1111-4111-8111-111111111111";
const PROJECT_B = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({ userId: USER });
  mocks.getProjectById.mockResolvedValue({
    id: PROJECT_B,
    name: "Proyecto B",
    is_active: true,
    is_private: false,
    gate_version: 3,
  });
  mocks.hasProjectGate.mockResolvedValue(true);
  mocks.setActiveProject.mockResolvedValue(undefined);
});

describe("POST /api/me/active-project multi-tab", () => {
  test("cambia el último proyecto sin borrar cookies pg_* de otras pestañas", async () => {
    const response = await POST(
      new Request("http://localhost/api/me/active-project", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ project_id: PROJECT_B }),
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(mocks.setActiveProject).toHaveBeenCalledWith(USER, PROJECT_B);
    expect(mocks.getActiveProjectForUser).not.toHaveBeenCalled();
    expect(mocks.hasProjectGate).not.toHaveBeenCalled();
  });

  test("proyecto privado reutiliza gate_version y deja pasar una cookie vigente", async () => {
    mocks.getProjectById.mockResolvedValue({
      id: PROJECT_B,
      name: "Proyecto privado",
      is_active: true,
      is_private: true,
      gate_version: 7,
    });
    mocks.hasProjectGate.mockResolvedValue(true);

    const response = await POST(
      new Request("http://localhost/api/me/active-project", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ project_id: PROJECT_B }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.hasProjectGate).toHaveBeenCalledWith(PROJECT_B, {
      is_private: true,
      gate_version: 7,
    });
    expect(mocks.setActiveProject).toHaveBeenCalledWith(USER, PROJECT_B);
  });

  test("cookie privada inválida o revocada bloquea antes de cambiar proyecto", async () => {
    mocks.getProjectById.mockResolvedValue({
      id: PROJECT_B,
      name: "Proyecto privado",
      is_active: true,
      is_private: true,
      gate_version: 8,
    });
    mocks.hasProjectGate.mockResolvedValue(false);

    const response = await POST(
      new Request("http://localhost/api/me/active-project", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ project_id: PROJECT_B }),
      }),
    );

    expect(response.status).toBe(403);
    expect(mocks.hasProjectGate).toHaveBeenCalledWith(PROJECT_B, {
      is_private: true,
      gate_version: 8,
    });
    expect(mocks.setActiveProject).not.toHaveBeenCalled();
  });
});
