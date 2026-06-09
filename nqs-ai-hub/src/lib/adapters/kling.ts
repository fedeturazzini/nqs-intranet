/**
 * KlingAdapter — clon de ThreeDSkyAdapter (sesión Kling).
 *
 * Kling (kling.ai, Kuaishou) es una tool de generación de video AI. Misma
 * arquitectura que 3DSky: se embebe directo vía iframe, créditos manuales con
 * pool separado, horarios configurables. El empleado declara su consumo al
 * salir; el admin verifica contra la factura de Kling.
 *
 * El sistema de créditos es genérico (credit_allocations + consume_credit_atomic
 * keyed por tool_id), así que esto es prácticamente idéntico a 3DSky cambiando
 * el TOOL_ID y la URL.
 */
import { createServerClient } from "@/lib/db/supabase";
import { getToolAccess } from "@/lib/db/queries/tools";
import { checkSchedule } from "@/lib/utils/schedule";
import { logToolUsage } from "./utils";
import type { AccessState, Result, ToolAdapter } from "./types";
import type { ToolSchedule } from "@/types/db-aliases";

const TOOL_ID = "kling" as const;
// URL directa al sitio de Kling (sin proxy, igual que 3DSky). El `?ac=1` viene
// del cliente — se deja tal cual (posible referral del estudio).
const KLING_URL = "https://kling.ai/app/video/new?ac=1";

export const klingAdapter: ToolAdapter = {
  id: TOOL_ID,
  category: "video",
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

    // active — chequeamos horario y créditos
    if (access.schedule) {
      const sched = checkSchedule(access.schedule as ToolSchedule);
      if (!sched.allowed) return { status: "locked" };
    }

    const db = createServerClient();
    const { data: alloc } = await db
      .from("credit_allocations")
      .select("credits_assigned, credits_used")
      .eq("user_id", userId)
      .eq("tool_id", TOOL_ID)
      .maybeSingle();

    const total = alloc?.credits_assigned ?? 0;
    const used = alloc?.credits_used ?? 0;
    const remaining = total - used;

    // Sin créditos = locked (no entra al módulo).
    if (remaining <= 0) return { status: "locked" };

    return {
      status: "active",
      credits: remaining,
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

  /**
   * Consume créditos atómicamente vía RPC. Maneja:
   *   - SQLSTATE P0001 = invalid_amount
   *   - SQLSTATE P0002 = no_allocation
   *   - SQLSTATE P0003 = insufficient_credits
   */
  async consumeCredit(
    userId,
    amount,
    reason,
  ): Promise<Result<{ remaining: number }>> {
    if (amount <= 0) {
      return { ok: false, error: new Error("invalid_amount") };
    }

    const db = createServerClient();
    const { data, error } = await db.rpc("consume_credit_atomic", {
      p_user_id: userId,
      p_tool_id: TOOL_ID,
      p_amount: amount,
      p_reason: reason,
    });

    if (error) {
      const msg = error.message ?? "";
      if (msg.includes("insufficient_credits")) {
        return { ok: false, error: new Error("insufficient_credits") };
      }
      if (msg.includes("no_allocation")) {
        return { ok: false, error: new Error("no_allocation") };
      }
      if (msg.includes("invalid_amount")) {
        return { ok: false, error: new Error("invalid_amount") };
      }
      console.error(
        JSON.stringify({
          level: "error",
          msg: "consume_credit_atomic RPC error",
          userId,
          amount,
          error: msg,
        }),
      );
      return { ok: false, error: new Error("rpc_failed") };
    }

    const remaining =
      typeof data === "object" && data !== null && "remaining" in data
        ? (data as { remaining: number }).remaining
        : 0;

    await logToolUsage({
      userId,
      toolId: TOOL_ID,
      action: "kling.consume_credit",
      metadata: { amount, reason },
      creditsConsumed: amount,
    });

    return { ok: true, value: { remaining } };
  },

  async getEmbedUrl(): Promise<string> {
    // Sin proxy. URL directa al sitio de Kling.
    return KLING_URL;
  },
};
