/**
 * POST /api/admin/requests/[id]/reject
 *
 * Body: { note?: string }
 *
 * Marca una solicitud como 'rejected'. No toca allocations ni
 * transactions. Notif a Slack (best-effort).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/auth/admin-guard";
import { createServerClient } from "@/lib/db/supabase";
import { notifySlack } from "@/lib/notifications/slack";

type RouteContext = { params: Promise<{ id: string }> };

const BodySchema = z.object({
  note: z.string().max(500).optional(),
});

export async function POST(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const guard = await requireAdminApi();
  if (guard instanceof NextResponse) return guard;

  const { id } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    // opcional
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_request", message: parsed.error.issues[0].message },
      { status: 400 },
    );
  }

  const db = createServerClient();
  // 2 FKs a `users` en access_requests — FK explícita necesaria.
  const { data: req, error: reqErr } = await db
    .from("access_requests")
    .select(
      "id, user_id, tool_id, credits_requested, status, users!access_requests_user_id_fkey(name), tools!access_requests_tool_id_fkey(name)",
    )
    .eq("id", id)
    .maybeSingle();
  if (reqErr) {
    return NextResponse.json(
      { error: "db_error", message: reqErr.message },
      { status: 500 },
    );
  }
  if (!req) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (req.status !== "pending") {
    return NextResponse.json(
      { error: "not_pending", message: `estado actual: ${req.status}` },
      { status: 409 },
    );
  }

  const { error: updErr } = await db
    .from("access_requests")
    .update({
      status: "rejected",
      reviewed_by: guard.userId,
      reviewed_at: new Date().toISOString(),
      review_note: parsed.data.note ?? null,
    })
    .eq("id", id);
  if (updErr) {
    return NextResponse.json(
      { error: "db_error", message: updErr.message },
      { status: 500 },
    );
  }

  const userName =
    (req.users as unknown as { name?: string } | null)?.name ?? "—";
  const toolName =
    (req.tools as unknown as { name?: string } | null)?.name ?? req.tool_id;
  await notifySlack({
    kind: "credits_rejected",
    userName,
    toolName,
    amount: req.credits_requested ?? undefined,
    note: parsed.data.note,
    requestId: id,
  });

  return NextResponse.json({ ok: true, requestId: id });
}
