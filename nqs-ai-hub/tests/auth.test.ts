/**
 * Tests de `lib/auth/server.ts`.
 *
 * No queremos pegarle a Supabase ni a Next runtime real, así que mockeamos:
 *   - `next/headers#cookies` → un Map controlable por test.
 *   - `next/navigation#redirect` → throw que podemos assertear.
 *   - `@/lib/db/supabase#createServerClient` → stub que devuelve `auth.getUser`
 *     y `from('users').select(...).eq(...).maybeSingle()` con valores fijos.
 *
 * Casos cubiertos:
 *   - getSession() devuelve null si no hay cookie.
 *   - getSession() devuelve null si el token está expirado.
 *   - getSession() devuelve la sesión con role cuando el token es válido.
 *   - requireAuth() redirige a /login si no hay sesión.
 *   - requireAdmin() redirige a /hub si el rol es employee.
 *   - requireAdmin() pasa si el rol es admin.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

type CookieRecord = { name: string; value: string };

const cookieJar = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string): CookieRecord | undefined => {
      const value = cookieJar.get(name);
      return value === undefined ? undefined : { name, value };
    },
  })),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => {
    const err = new Error(`__REDIRECT__:${to}`);
    (err as Error & { __redirect?: string }).__redirect = to;
    throw err;
  }),
}));

// El stub se reemplaza por test via `setSupabaseStub`.
type SupabaseStub = {
  authGetUser: ReturnType<typeof vi.fn>;
  profile: {
    id: string;
    email: string;
    name: string;
    initials: string;
    role: string;
  } | null;
};
let supabaseStub: SupabaseStub | null = null;

function setSupabaseStub(stub: SupabaseStub) {
  supabaseStub = stub;
}

vi.mock("@/lib/db/supabase", () => ({
  createServerClient: () => {
    if (!supabaseStub) throw new Error("supabase stub not set");
    return {
      auth: { getUser: supabaseStub.authGetUser },
      from: (_table: string) => ({
        select: (_cols: string) => ({
          eq: (_col: string, _val: string) => ({
            maybeSingle: async () => ({
              data: supabaseStub!.profile,
              error: null,
            }),
          }),
        }),
      }),
    };
  },
}));

// Importamos DESPUÉS de los mocks.
const { getSession, requireAuth, requireAdmin, ACCESS_TOKEN_COOKIE } =
  await import("@/lib/auth/server");

beforeEach(() => {
  cookieJar.clear();
  supabaseStub = null;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("getSession", () => {
  test("devuelve null sin cookie", async () => {
    const s = await getSession();
    expect(s).toBeNull();
  });

  test("devuelve null si el token es inválido", async () => {
    cookieJar.set(ACCESS_TOKEN_COOKIE, "expired-token");
    setSupabaseStub({
      authGetUser: vi.fn(async () => ({
        data: { user: null },
        error: { message: "jwt expired" },
      })),
      profile: null,
    });
    const s = await getSession();
    expect(s).toBeNull();
  });

  test("devuelve la sesión con role cuando el token es válido", async () => {
    cookieJar.set(ACCESS_TOKEN_COOKIE, "valid-token");
    setSupabaseStub({
      authGetUser: vi.fn(async () => ({
        data: { user: { id: "user-1" } },
        error: null,
      })),
      profile: {
        id: "user-1",
        email: "sofia@nqs.test",
        name: "Sofía Galván",
        initials: "SG",
        role: "employee",
      },
    });
    const s = await getSession();
    expect(s).toEqual({
      userId: "user-1",
      email: "sofia@nqs.test",
      name: "Sofía Galván",
      initials: "SG",
      role: "employee",
    });
  });
});

describe("requireAuth", () => {
  test("redirige a /login si no hay sesión", async () => {
    await expect(requireAuth()).rejects.toThrow(/__REDIRECT__:\/login/);
  });
});

describe("requireAdmin", () => {
  test("redirige a /hub si el rol es employee", async () => {
    cookieJar.set(ACCESS_TOKEN_COOKIE, "valid-token");
    setSupabaseStub({
      authGetUser: vi.fn(async () => ({
        data: { user: { id: "user-1" } },
        error: null,
      })),
      profile: {
        id: "user-1",
        email: "sofia@nqs.test",
        name: "Sofía Galván",
        initials: "SG",
        role: "employee",
      },
    });
    await expect(requireAdmin()).rejects.toThrow(/__REDIRECT__:\/hub/);
  });

  test("pasa si el rol es admin", async () => {
    cookieJar.set(ACCESS_TOKEN_COOKIE, "valid-token");
    setSupabaseStub({
      authGetUser: vi.fn(async () => ({
        data: { user: { id: "user-0" } },
        error: null,
      })),
      profile: {
        id: "user-0",
        email: "tomas@nqs.test",
        name: "Tomás Pérez",
        initials: "TP",
        role: "admin",
      },
    });
    const s = await requireAdmin();
    expect(s.role).toBe("admin");
  });
});
