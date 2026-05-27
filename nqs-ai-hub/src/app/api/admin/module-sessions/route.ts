/**
 * GET /api/admin/module-sessions
 *
 * Auditoría: lista de entradas/salidas al módulo, con filtros opcionales.
 * Query params:
 *   - userId   → filtra por usuario
 *   - toolId   → filtra por tool (default todos)
 *   - from     → fecha ISO inicio (entered_at >=)
 *   - to       → fecha ISO fin (entered_at <)
 *   - limit    → default 100, max 500
 *
 * Devuelve cada sesión con nombre/email del user para no tener que hacer
 * un JOIN en el cliente.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/auth/admin-guard";
import { createServerClient } from "@/lib/db/supabase";

const QuerySchema = z.object({
  userId: z.string().uuid().optional(),
  toolId: z.string().min(1).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

export async function GET(request: Request): Promise<NextResponse> {
  const guard = await requireAdminApi();
  if (guard instanceof NextResponse) return guard;

  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    userId: url.searchParams.get("userId") ?? undefined,
    toolId: url.searchParams.get("toolId") ?? undefined,
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
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
    .from("module_sessions")
    .select(
      "id, user_id, tool_id, entered_at, exited_at, declared_consumption, ip_address, users(name, email)",
    )
    .order("entered_at", { ascending: false })
    .limit(parsed.data.limit);

  if (parsed.data.userId) q = q.eq("user_id", parsed.data.userId);
  if (parsed.data.toolId) q = q.eq("tool_id", parsed.data.toolId);
  if (parsed.data.from) q = q.gte("entered_at", parsed.data.from);
  if (parsed.data.to) q = q.lt("entered_at", parsed.data.to);

  const { data, error } = await q;
  if (error) {
    return NextResponse.json(
      { error: "db_error", message: error.message },
      { status: 500 },
    );
  }
  return NextResponse.json({ sessions: data ?? [] });
}
