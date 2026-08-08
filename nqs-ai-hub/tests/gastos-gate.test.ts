/**
 * Tests del token de gate de Gastos (migration 0021).
 * Lógica pura de firma / expiración / gate_version.
 */
import { afterEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookieValue: undefined as string | undefined,
  gateVersion: 1 as number | null,
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: () =>
      mocks.cookieValue === undefined
        ? undefined
        : { value: mocks.cookieValue },
  })),
}));

vi.mock("@/lib/db/supabase", () => ({
  createServerClient: () => ({
    from: () => ({
      select: () => ({
        order: () => ({
          limit: () => ({
            maybeSingle: async () => ({
              data:
                mocks.gateVersion === null
                  ? null
                  : { gate_version: mocks.gateVersion },
              error: null,
            }),
          }),
        }),
      }),
    }),
  }),
}));

process.env.ENCRYPTION_KEY = "test-secret-key-for-gastos-gate";

const {
  hasGastosGate,
  mintGastosGateToken,
  verifyGastosGateToken,
  GASTOS_GATE_COOKIE,
} = await import("@/lib/auth/gastos-gate");

afterEach(() => {
  vi.useRealTimers();
  mocks.cookieValue = undefined;
  mocks.gateVersion = 1;
});

describe("verifyGastosGateToken", () => {
  test("roundtrip válido → true", () => {
    const token = mintGastosGateToken(3);
    expect(verifyGastosGateToken(token, 3)).toBe(true);
  });

  test("gate_version distinto → false (el bump invalida la cookie)", () => {
    const token = mintGastosGateToken(3);
    expect(verifyGastosGateToken(token, 4)).toBe(false);
  });

  test("firma adulterada → false", () => {
    const token = mintGastosGateToken(1);
    const last = token.slice(-1);
    const tampered = token.slice(0, -1) + (last === "a" ? "b" : "a");
    expect(verifyGastosGateToken(tampered, 1)).toBe(false);
  });

  test("token expirado → false", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const token = mintGastosGateToken(1);
    vi.setSystemTime(new Date("2026-01-01T00:31:00Z"));
    expect(verifyGastosGateToken(token, 1)).toBe(false);
  });

  test("token vacío o mal formado → false", () => {
    expect(verifyGastosGateToken(undefined, 1)).toBe(false);
    expect(verifyGastosGateToken("", 1)).toBe(false);
    expect(verifyGastosGateToken("a.b", 1)).toBe(false);
  });
});

describe("hasGastosGate", () => {
  test("cookie vigente + versión al día → true", async () => {
    mocks.gateVersion = 2;
    mocks.cookieValue = mintGastosGateToken(2);
    await expect(hasGastosGate()).resolves.toBe(true);
  });

  test("sin cookie → false", async () => {
    mocks.gateVersion = 1;
    mocks.cookieValue = undefined;
    await expect(hasGastosGate()).resolves.toBe(false);
  });

  test("sin config en DB → false", async () => {
    mocks.gateVersion = null;
    mocks.cookieValue = mintGastosGateToken(1);
    await expect(hasGastosGate()).resolves.toBe(false);
  });

  test("cookie con versión vieja → false", async () => {
    mocks.gateVersion = 5;
    mocks.cookieValue = mintGastosGateToken(4);
    await expect(hasGastosGate()).resolves.toBe(false);
  });
});

describe("GASTOS_GATE_COOKIE", () => {
  test("nombre fijo", () => {
    expect(GASTOS_GATE_COOKIE).toBe("gastos_gate");
  });
});
