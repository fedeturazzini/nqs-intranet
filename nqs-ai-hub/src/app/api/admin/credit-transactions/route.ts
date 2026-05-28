/**
 * GET /api/admin/credit-transactions
 *
 * Lista de credit_transactions con JOIN al user (que consumió/recibió)
 * y al admin que ejecutó (performed_by). Filtros: userId, toolId, type.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/auth/admin-guard";
import { createServerClient } from "@/lib/db/supabase";

const QuerySchema = z.object({
  userId: z.string().uuid().optional(),
  toolId: z.string().min(1).optional(),
  type: z.enum(["allocation", "consumption", "refund", "adjustment"]).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

export async function GET(request: Request): Promise<NextResponse> {
  const guard = await requireAdminApi();
  if (guard instanceof NextResponse) return guard;

  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    userId: url.searchParams.get("userId") ?? undefined,
    toolId: url.searchParams.get("toolId") ?? undefined,
    type: url.searchParams.get("type") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_request", message: parsed.error.issues[0].message },
      { status: 400 },
    );
  }

  const db = createServerClient();
  // 2 FKs a users (user_id y performed_by) → JOIN explícito.
  let q = db
    .from("credit_transactions")
    .select(
      "id, user_id, tool_id, type, amount, reason, performed_by, created_at, users!credit_transactions_user_id_fkey(name, initials)",
    )
    .order("created_at", { ascending: false })
    .limit(parsed.data.limit);

  if (parsed.data.userId) q = q.eq("user_id", parsed.data.userId);
  if (parsed.data.toolId) q = q.eq("tool_id", parsed.data.toolId);
  if (parsed.data.type) q = q.eq("type", parsed.data.type);

  const { data, error } = await q;
  if (error) {
    return NextResponse.json(
      { error: "db_error", message: error.message },
      { status: 500 },
    );
  }
  return NextResponse.json({ transactions: data ?? [] });
}
