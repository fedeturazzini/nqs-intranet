/**
 * GET /api/tools/3dsky/credits
 *
 * Devuelve el estado de créditos del user actual para 3DSky.
 * Pública dentro del módulo — no requiere `canUseTool` (queremos que el
 * front muestre 0/0 incluso si el user perdió acceso).
 */
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/server";
import { createServerClient } from "@/lib/db/supabase";

export async function GET(): Promise<NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = createServerClient();
  const { data, error } = await db
    .from("credit_allocations")
    .select("credits_assigned, credits_used")
    .eq("user_id", session.userId)
    .eq("tool_id", "3dsky")
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: "db_error", message: error.message },
      { status: 500 },
    );
  }

  const total = data?.credits_assigned ?? 0;
  const used = data?.credits_used ?? 0;
  return NextResponse.json({
    credits: total - used,
    creditsTotal: total,
    used,
  });
}
