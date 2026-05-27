/**
 * POST /api/tools/3dsky/request-credits
 *
 * Body: { amount: int 1-1000, reason: string 5-500 }
 * Response: { ok: true, requestId: uuid }
 *
 * Crea una entrada en `access_requests` con `credits_requested` y
 * status='pending'. Notifica a Slack (best-effort; si Slack falla, la
 * request igual se crea — documentamos en el response).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/server";
import { createServerClient } from "@/lib/db/supabase";
import { notifySlack } from "@/lib/notifications/slack";

const RequestSchema = z.object({
  amount: z.number().int().min(1).max(1000),
  reason: z.string().min(5).max(500),
});

export async function POST(request: Request): Promise<NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "bad_request", message: "body no es JSON válido" },
      { status: 400 },
    );
  }
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return NextResponse.json(
      {
        error: "bad_request",
        message: `${first.path.join(".") || "body"}: ${first.message}`,
      },
      { status: 400 },
    );
  }

  const db = createServerClient();
  const { data, error } = await db
    .from("access_requests")
    .insert({
      user_id: session.userId,
      tool_id: "3dsky",
      credits_requested: parsed.data.amount,
      reason: parsed.data.reason,
      status: "pending",
    })
    .select("id")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "db_error", message: error?.message ?? "no_request_created" },
      { status: 500 },
    );
  }

  // Notif a Slack — no bloquea ni puede romper la request.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const adminUrl = appUrl ? `${appUrl.replace(/\/$/, "")}/admin#requests` : undefined;
  await notifySlack({
    kind: "credits_request",
    userName: session.name,
    toolName: "3DSky",
    amount: parsed.data.amount,
    reason: parsed.data.reason,
    requestId: data.id,
    adminUrl,
  });

  return NextResponse.json({ ok: true, requestId: data.id });
}
