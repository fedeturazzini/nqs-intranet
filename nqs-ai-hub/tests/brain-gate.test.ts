/**
 * Tests del token de gate del System Brain (migration 0022 gate_version).
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

process.env.ENCRYPTION_KEY = "test-secret-key-for-brain-gate";

const {
  hasBrainGate,
  mintBrainToken,
  verifyBrainGateToken,
  BRAIN_COOKIE,
  isValidBrainToken,
} = await import("@/lib/auth/brain");

afterEach(() => {
  vi.useRealTimers();
  mocks.cookieValue = undefined;
  mocks.gateVersion = 1;
});

describe("verifyBrainGateToken", () => {
  test("roundtrip válido → true", () => {
    const token = mintBrainToken(3);
    expect(verifyBrainGateToken(token, 3)).toBe(true);
  });

  test("gate_version distinto → false", () => {
    const token = mintBrainToken(3);
    expect(verifyBrainGateToken(token, 4)).toBe(false);
  });

  test("firma adulterada → false", () => {
    const token = mintBrainToken(1);
    const last = token.slice(-1);
    const tampered = token.slice(0, -1) + (last === "a" ? "b" : "a");
    expect(verifyBrainGateToken(tampered, 1)).toBe(false);
  });

  test("token expirado → false", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const token = mintBrainToken(1);
    vi.setSystemTime(new Date("2026-01-01T00:31:00Z"));
    expect(verifyBrainGateToken(token, 1)).toBe(false);
  });

  test("token viejo de 2 partes → false", () => {
    expect(verifyBrainGateToken("1234567890.abc", 1)).toBe(false);
  });

  test("token vacío → false", () => {
    expect(verifyBrainGateToken(undefined, 1)).toBe(false);
    expect(verifyBrainGateToken("", 1)).toBe(false);
  });
});

describe("hasBrainGate", () => {
  test("cookie vigente + versión al día → true", async () => {
    mocks.gateVersion = 2;
    mocks.cookieValue = mintBrainToken(2);
    await expect(hasBrainGate()).resolves.toBe(true);
  });

  test("sin cookie → false", async () => {
    mocks.gateVersion = 1;
    mocks.cookieValue = undefined;
    await expect(hasBrainGate()).resolves.toBe(false);
  });

  test("cookie con versión vieja → false", async () => {
    mocks.gateVersion = 5;
    mocks.cookieValue = mintBrainToken(4);
    await expect(hasBrainGate()).resolves.toBe(false);
  });
});

describe("isValidBrainToken (deprecated)", () => {
  test("siempre false — forzar hasBrainGate", () => {
    expect(isValidBrainToken(mintBrainToken(1))).toBe(false);
  });
});

describe("BRAIN_COOKIE", () => {
  test("nombre fijo brain_session", () => {
    expect(BRAIN_COOKIE).toBe("brain_session");
  });
});
