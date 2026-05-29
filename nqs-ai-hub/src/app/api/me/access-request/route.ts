/**
 * POST /api/me/access-request
 *
 * Solicitud de ACCESO a una tool que el user todavía NO tiene habilitada.
 *
 * Distinto de:
 *   - /api/tools/3dsky/request-credits    → tiene acceso, pide créditos
 *   - /api/me/exceptional-access          → tiene acceso, fuera de horario
 *   - este                                → NO tiene acceso, pide habilitar
 *
 * Body: { toolId, reason: string(10-500) }
 *
 * Validaciones server-side:
 *   - tool existe y está operativa (is_active=true; rechaza coming_soon)
 *   - el user NO tiene ya acceso activo
 *   - el user NO tiene una request 'access' pendiente para esta tool
 *
 * Inserta access_request con request_type='access' + notif a Slack.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/server";
import { createServerClient } from "@/lib/db/supabase";
import { notifySlack } from "@/lib/notifications/slack";

const BodySchema = z.object({
  toolId: z.string().min(1),
  reason: z.string().trim().min(10).max(500),
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
  const { toolId, reason } = parsed.data;

  const db = createServerClient();

  // 1) la tool existe y está operativa
  const { data: tool, error: toolErr } = await db
    .from("tools")
    .select("id, name, is_active")
    .eq("id", toolId)
    .maybeSingle();
  if (toolErr) {
    return NextResponse.json(
      { error: "db_error", message: toolErr.message },
      { status: 500 },
    );
  }
  if (!tool) {
    return NextResponse.json({ error: "tool_not_found" }, { status: 404 });
  }
  if (!tool.is_active) {
    return NextResponse.json(
      {
        error: "tool_coming_soon",
        message: "Esta herramienta aún no está disponible",
      },
      { status: 400 },
    );
  }

  // 2) el user NO tiene ya acceso activo
  const { data: access } = await db
    .from("tool_access")
    .select("status")
    .eq("user_id", session.userId)
    .eq("tool_id", toolId)
    .maybeSingle();
  if (access?.status === "active") {
    return NextResponse.json(
      { error: "already_has_access", message: "Ya tenés acceso a esta herramienta" },
      { status: 400 },
    );
  }

  // 3) no hay request 'access' pendiente para este (user, tool)
  const { data: pending } = await db
    .from("access_requests")
    .select("id")
    .eq("user_id", session.userId)
    .eq("tool_id", toolId)
    .eq("request_type", "access")
    .eq("status", "pending")
    .maybeSingle();
  if (pending) {
    return NextResponse.json(
      {
        error: "already_pending",
        message: "Ya tenés una solicitud pendiente para esta herramienta",
      },
      { status: 400 },
    );
  }

  // 4) crear la request
  const { data: created, error: insErr } = await db
    .from("access_requests")
    .insert({
      user_id: session.userId,
      tool_id: toolId,
      request_type: "access",
      reason,
      status: "pending",
    })
    .select("id")
    .single();
  if (insErr || !created) {
    return NextResponse.json(
      { error: "db_error", message: insErr?.message ?? "no_request_created" },
      { status: 500 },
    );
  }

  // 5) notif Slack (best-effort)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const adminUrl = appUrl
    ? `${appUrl.replace(/\/$/, "")}/admin/requests`
    : undefined;
  await notifySlack({
    kind: "access_request",
    userName: session.name,
    toolName: tool.name,
    reason,
    requestId: created.id,
    adminUrl,
  });

  return NextResponse.json({ ok: true, requestId: created.id });
}
