/**
 * POST /api/me/exceptional-access
 *
 * Solicitud de acceso EXCEPCIONAL (fuera de horario habitual) a una tool.
 *
 * Body: { toolId, reason: string(5-500), duration: int (5-720) }
 *   - `duration` en minutos. 720 min = 12hs (cap razonable para evitar
 *     pedidos abusivos del estilo "una semana completa").
 *
 * Inserta un access_request con request_type='exceptional_access' y
 * dispara una notif a Slack (best-effort).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/server";
import { createServerClient } from "@/lib/db/supabase";
import { notifySlack } from "@/lib/notifications/slack";

const BodySchema = z.object({
  toolId: z.string().min(1),
  reason: z.string().trim().min(5).max(500),
  duration: z.number().int().min(5).max(720),
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
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_request", message: parsed.error.issues[0].message },
      { status: 400 },
    );
  }

  const db = createServerClient();
  const { data, error } = await db
    .from("access_requests")
    .insert({
      user_id: session.userId,
      tool_id: parsed.data.toolId,
      reason: parsed.data.reason,
      request_type: "exceptional_access",
      exceptional_duration_minutes: parsed.data.duration,
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

  // Resolvemos nombre de la tool para el mensaje de Slack.
  const { data: tool } = await db
    .from("tools")
    .select("name")
    .eq("id", parsed.data.toolId)
    .maybeSingle();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const adminUrl = appUrl
    ? `${appUrl.replace(/\/$/, "")}/admin/requests`
    : undefined;

  await notifySlack({
    kind: "credits_request",
    userName: session.name,
    toolName: tool?.name ?? parsed.data.toolId,
    amount: parsed.data.duration,
    reason: `⏰ ACCESO EXCEPCIONAL fuera de horario · ${parsed.data.duration} min · ${parsed.data.reason}`,
    requestId: data.id,
    adminUrl,
  });

  return NextResponse.json({ ok: true, requestId: data.id });
}
