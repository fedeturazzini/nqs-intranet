/**
 * GET /api/admin/logs
 *
 * Lista de usage_logs con JOIN del user. Filtros: userId, toolId,
 * action prefix (ej `claude.*`), since, until, limit.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/auth/admin-guard";
import { createServerClient } from "@/lib/db/supabase";

const QuerySchema = z.object({
  userId: z.string().uuid().optional(),
  toolId: z.string().min(1).optional(),
  action: z.string().min(1).max(80).optional(),
  since: z.string().datetime().optional(),
  until: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

export async function GET(request: Request): Promise<NextResponse> {
  const guard = await requireAdminApi();
  if (guard instanceof NextResponse) return guard;

  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    userId: url.searchParams.get("userId") ?? undefined,
    toolId: url.searchParams.get("toolId") ?? undefined,
    action: url.searchParams.get("action") ?? undefined,
    since: url.searchParams.get("since") ?? undefined,
    until: url.searchParams.get("until") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_request", message: parsed.error.issues[0].message },
      { status: 400 },
    );
  }

  const db = createServerClient();
  let q = db
    .from("usage_logs")
    .select(
      "id, user_id, tool_id, action, metadata, tokens_consumed, credits_consumed, created_at, users(name, initials)",
    )
    .order("created_at", { ascending: false })
    .limit(parsed.data.limit);

  if (parsed.data.userId) q = q.eq("user_id", parsed.data.userId);
  if (parsed.data.toolId) q = q.eq("tool_id", parsed.data.toolId);
  if (parsed.data.action) q = q.like("action", `${parsed.data.action}%`);
  if (parsed.data.since) q = q.gte("created_at", parsed.data.since);
  if (parsed.data.until) q = q.lt("created_at", parsed.data.until);

  const { data, error } = await q;
  if (error) {
    return NextResponse.json(
      { error: "db_error", message: error.message },
      { status: 500 },
    );
  }
  return NextResponse.json({ logs: data ?? [] });
}
