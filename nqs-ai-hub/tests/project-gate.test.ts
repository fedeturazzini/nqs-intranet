/**
 * Tests del token de gate de proyectos privados (migration 0016).
 *
 * Sólo la lógica pura de firma / expiración / gate_version — sin DB ni cookies.
 * Mockeamos las dependencias del módulo (next/headers y la query) para poder
 * importar sólo las funciones puras.
 */
import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: () => undefined })),
}));
vi.mock("@/lib/db/queries/projects", () => ({
  getProjectGateFields: vi.fn(async () => null),
}));

process.env.ENCRYPTION_KEY = "test-secret-key-for-project-gate";

const { mintProjectGateToken, verifyProjectGateToken, projectGateCookieName } =
  await import("@/lib/auth/project-gate");

const PID = "11111111-1111-1111-1111-111111111111";

afterEach(() => {
  vi.useRealTimers();
});

describe("verifyProjectGateToken", () => {
  test("roundtrip válido → true", () => {
    const token = mintProjectGateToken(PID, 3);
    expect(verifyProjectGateToken(token, PID, 3)).toBe(true);
  });

  test("gate_version distinto → false (el bump invalida la cookie)", () => {
    const token = mintProjectGateToken(PID, 3);
    expect(verifyProjectGateToken(token, PID, 4)).toBe(false);
  });

  test("otro projectId → false (cookie atada al proyecto)", () => {
    const token = mintProjectGateToken(PID, 1);
    const other = "22222222-2222-2222-2222-222222222222";
    expect(verifyProjectGateToken(token, other, 1)).toBe(false);
  });

  test("firma adulterada → false", () => {
    const token = mintProjectGateToken(PID, 1);
    const last = token.slice(-1);
    const tampered = token.slice(0, -1) + (last === "a" ? "b" : "a");
    expect(verifyProjectGateToken(tampered, PID, 1)).toBe(false);
  });

  test("token expirado → false", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const token = mintProjectGateToken(PID, 1);
    // Avanzamos más de los 15 min de TTL.
    vi.setSystemTime(new Date("2026-01-01T00:16:00Z"));
    expect(verifyProjectGateToken(token, PID, 1)).toBe(false);
  });

  test("token vacío o mal formado → false", () => {
    expect(verifyProjectGateToken(undefined, PID, 1)).toBe(false);
    expect(verifyProjectGateToken("", PID, 1)).toBe(false);
    expect(verifyProjectGateToken("a.b", PID, 1)).toBe(false);
  });
});

describe("projectGateCookieName", () => {
  test("incluye el projectId (una cookie por proyecto)", () => {
    expect(projectGateCookieName(PID)).toBe(`pg_${PID}`);
  });
});

describe("projectGateCookieOptions", () => {
  test("maxAge 0 limpia la cookie con los mismos flags", async () => {
    const { projectGateCookieOptions } = await import("@/lib/auth/project-gate");
    const opts = projectGateCookieOptions(0);
    expect(opts).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
  });
});

describe("clearAllProjectGateCookies", () => {
  test("limpia solo cookies con prefijo pg_", async () => {
    const { clearAllProjectGateCookies, projectGateCookieName } =
      await import("@/lib/auth/project-gate");

    const set = vi.fn();
    const res = { cookies: { set } } as unknown as import("next/server").NextResponse;
    const other = "session_other";

    clearAllProjectGateCookies(res, [
      { name: projectGateCookieName(PID) },
      { name: other },
      { name: `pg_22222222-2222-2222-2222-222222222222` },
    ]);

    expect(set).toHaveBeenCalledTimes(2);
    expect(set.mock.calls.every((c) => String(c[0]).startsWith("pg_"))).toBe(
      true,
    );
    expect(set.mock.calls.every((c) => c[2]?.maxAge === 0)).toBe(true);
  });
});
