/**
 * 3DSky adapter — STUB.
 *
 * La lógica real (proxy + consumeCredit transaccional + getEmbedUrl)
 * vive en la sesión 08. Acá solo dejamos `checkAccess` operativa para
 * que el Hub muestre el estado correcto desde sesión 05. El resto
 * tira `notImplemented()` — el endpoint del adapter detecta esto y
 * devuelve 501 al cliente si alguien lo llama.
 */
import { getToolAccess } from "@/lib/db/queries/tools";
import { createServerClient } from "@/lib/db/supabase";
import { logToolUsage } from "./utils";
import type {
  AccessState,
  Result,
  ToolAdapter,
} from "./types";

const TOOL_ID = "3dsky" as const;

function notImplemented(method: string): never {
  throw new Error(
    `ThreeDSkyAdapter.${method}: not implemented yet. Se construye en sesión 08.`,
  );
}

export const threeDSkyAdapter: ToolAdapter = {
  id: TOOL_ID,
  category: "assets",
  usesCredits: true,
  isEmbedded: true,

  async checkAccess(userId): Promise<AccessState> {
    const access = await getToolAccess(userId, TOOL_ID);
    if (!access || access.status === "locked") return { status: "locked" };
    if (access.status === "pending") {
      return {
        status: "pending",
        requestedAt: access.granted_at
          ? new Date(access.granted_at)
          : new Date(),
      };
    }
    if (access.status === "expired") {
      return {
        status: "expired",
        expiredAt: access.expires_at
          ? new Date(access.expires_at)
          : new Date(),
      };
    }
    // active: traer créditos asignados/usados para que el Hub muestre
    // la barra.
    const db = createServerClient();
    const { data: alloc } = await db
      .from("credit_allocations")
      .select("credits_assigned, credits_used")
      .eq("user_id", userId)
      .eq("tool_id", TOOL_ID)
      .maybeSingle();

    const total = alloc?.credits_assigned ?? 0;
    const used = alloc?.credits_used ?? 0;
    return {
      status: "active",
      credits: total - used,
      creditsTotal: total,
    };
  },

  async logUsage(userId, action, metadata) {
    await logToolUsage({ userId, toolId: TOOL_ID, action, metadata });
  },

  async getRemainingCredits(userId): Promise<number> {
    const db = createServerClient();
    const { data: alloc } = await db
      .from("credit_allocations")
      .select("credits_assigned, credits_used")
      .eq("user_id", userId)
      .eq("tool_id", TOOL_ID)
      .maybeSingle();
    if (!alloc) return 0;
    return alloc.credits_assigned - alloc.credits_used;
  },

  async consumeCredit(): Promise<Result<{ remaining: number }>> {
    notImplemented("consumeCredit");
  },

  async getEmbedUrl(): Promise<string> {
    notImplemented("getEmbedUrl");
  },
};
