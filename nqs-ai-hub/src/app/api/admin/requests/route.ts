/**
 * GET /api/admin/requests
 *
 * Lista de access_requests con JOIN de user + tool, ordenadas por
 * created_at desc. Filtros: status, toolId, userId.
 *
 * El UI del admin la usa con `status=pending` por default para pintar
 * el badge en la nav.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/auth/admin-guard";
import { createServerClient } from "@/lib/db/supabase";

const QuerySchema = z.object({
  status: z.enum(["pending", "approved", "rejected", "expired"]).optional(),
  toolId: z.string().min(1).optional(),
  userId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

export async function GET(request: Request): Promise<NextResponse> {
  const guard = await requireAdminApi();
  if (guard instanceof NextResponse) return guard;

  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    status: url.searchParams.get("status") ?? undefined,
    toolId: url.searchParams.get("toolId") ?? undefined,
    userId: url.searchParams.get("userId") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_request", message: parsed.error.issues[0].message },
      { status: 400 },
    );
  }

  const db = createServerClient();
  // 2 FKs a users en access_requests → JOIN explícito.
  let q = db
    .from("access_requests")
    .select(
      "id, user_id, tool_id, credits_requested, exceptional_duration_minutes, request_type, reason, status, reviewed_by, reviewed_at, review_note, created_at, users!access_requests_user_id_fkey(name, initials, dept, email), tools!access_requests_tool_id_fkey(name, color, glyph)",
    )
    .order("created_at", { ascending: false })
    .limit(parsed.data.limit);

  if (parsed.data.status) q = q.eq("status", parsed.data.status);
  if (parsed.data.toolId) q = q.eq("tool_id", parsed.data.toolId);
  if (parsed.data.userId) q = q.eq("user_id", parsed.data.userId);

  const { data, error } = await q;
  if (error) {
    return NextResponse.json(
      { error: "db_error", message: error.message },
      { status: 500 },
    );
  }
  return NextResponse.json({ requests: data ?? [] });
}
