/**
 * Tests del ThreeDSkyAdapter — consumeCredit y getEmbedUrl.
 *
 * Mockeamos `createServerClient` (rpc) y `logToolUsage`. El test de
 * RACE CONDITION real (2 consumos simultáneos sobre el RPC atómico)
 * vive en `scripts/test-credit-race.ts` y corre contra la DB real
 * (`npm run db:race-test`) — acá validamos el mapeo de errores del RPC.
 */
import { beforeEach, describe, expect, test, vi } from "vitest";

// rpc() configurable por test.
let rpcResult: { data: unknown; error: { message: string } | null } = {
  data: { remaining: 5 },
  error: null,
};

vi.mock("@/lib/db/supabase", () => ({
  createServerClient: () => ({
    rpc: async () => rpcResult,
    // checkAccess usa from().select().eq()… pero estos tests no lo tocan.
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
        }),
      }),
    }),
  }),
}));

vi.mock("@/lib/adapters/utils", () => ({
  logToolUsage: vi.fn(async () => true),
}));

const { threeDSkyAdapter } = await import("@/lib/adapters/three-dsky");

beforeEach(() => {
  rpcResult = { data: { remaining: 5 }, error: null };
  vi.clearAllMocks();
});

describe("threeDSkyAdapter.consumeCredit", () => {
  test("descuenta OK y devuelve remaining", async () => {
    rpcResult = { data: { remaining: 4 }, error: null };
    const r = await threeDSkyAdapter.consumeCredit!("u1", 1, "descarga modelo X");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.remaining).toBe(4);
  });

  test("amount <= 0 → invalid_amount (sin llamar al RPC)", async () => {
    const r = await threeDSkyAdapter.consumeCredit!("u1", 0, "x");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toBe("invalid_amount");
  });

  test("RPC insufficient_credits → Result.error insufficient_credits", async () => {
    rpcResult = {
      data: null,
      error: { message: 'insufficient_credits' },
    };
    const r = await threeDSkyAdapter.consumeCredit!("u1", 99, "todo");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toBe("insufficient_credits");
  });

  test("RPC no_allocation → Result.error no_allocation", async () => {
    rpcResult = { data: null, error: { message: "no_allocation" } };
    const r = await threeDSkyAdapter.consumeCredit!("u1", 1, "x");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toBe("no_allocation");
  });

  test("RPC error genérico → rpc_failed", async () => {
    rpcResult = { data: null, error: { message: "connection reset" } };
    const r = await threeDSkyAdapter.consumeCredit!("u1", 1, "x");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toBe("rpc_failed");
  });
});

describe("threeDSkyAdapter metadata", () => {
  test("getEmbedUrl devuelve la URL directa de 3DSky (sin proxy)", async () => {
    const url = await threeDSkyAdapter.getEmbedUrl!("u1");
    expect(url).toBe("https://3dsky.org/es/");
  });

  test("flags del adapter", () => {
    expect(threeDSkyAdapter.id).toBe("3dsky");
    expect(threeDSkyAdapter.usesCredits).toBe(true);
    expect(threeDSkyAdapter.isEmbedded).toBe(true);
  });
});
