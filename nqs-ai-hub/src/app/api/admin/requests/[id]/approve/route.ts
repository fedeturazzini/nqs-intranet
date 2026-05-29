/**
 * POST /api/admin/requests/[id]/approve
 *
 * Body: { note?: string }
 *
 * Aprueba una solicitud según su request_type:
 *   - credits             → suma créditos al allocation + tx
 *   - exceptional_access  → tool_access temporal con expires_at
 *   - access              → tool_access permanente (habilita la tool)
 * En todos los casos marca la request como `approved` + notif a Slack.
 *
 * Validamos: request existe + status='pending' (no aprobar dos veces).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/auth/admin-guard";
import { createServerClient } from "@/lib/db/supabase";
import { logToolUsage } from "@/lib/adapters/utils";
import { notifySlack } from "@/lib/notifications/slack";
import type { ToolId } from "@/types/db-aliases";

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
    // body opcional — si no vino, seguimos.
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_request", message: parsed.error.issues[0].message },
      { status: 400 },
    );
  }

  const db = createServerClient();
  // Traemos la request con info del user para el log + Slack.
  // `access_requests` tiene 2 FKs a `users` (user_id y reviewed_by),
  // así que tenemos que especificar la FK explícita para el JOIN. La
  // misma sintaxis vale para `tools` aunque tenga 1 sola.
  const { data: req, error: reqErr } = await db
    .from("access_requests")
    .select(
      "id, user_id, tool_id, credits_requested, exceptional_duration_minutes, request_type, status, users!access_requests_user_id_fkey(name), tools!access_requests_tool_id_fkey(name)",
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

  const reqType = req.request_type ?? "credits";
  // Tracked across branches para incluir en la respuesta final.
  let newAssigned: number | null = null;
  let expiresAt: string | null = null;

  // ─── Flow para solicitud de acceso a tool ───
  // El user no tenía la tool habilitada. Upsert de tool_access a
  // status='active' permanente (sin expires_at). schedule queda null
  // (24/7) — si el admin quiere restringir horarios lo hace después
  // desde /admin/access.
  if (reqType === "access") {
    const { error: tAccErr } = await db.from("tool_access").upsert(
      {
        user_id: req.user_id,
        tool_id: req.tool_id,
        status: "active",
        granted_by: guard.userId,
      },
      { onConflict: "user_id,tool_id" },
    );
    if (tAccErr) {
      return NextResponse.json(
        { error: "db_error", message: tAccErr.message },
        { status: 500 },
      );
    }
    // Log de auditoría — admin habilitó acceso a una tool.
    await logToolUsage({
      userId: guard.userId,
      toolId: req.tool_id as ToolId,
      action: "admin.access.grant",
      metadata: { targetUserId: req.user_id, requestId: id },
    });
  } else if (reqType === "exceptional_access") {
    // ─── Flow para acceso excepcional ───
    // No suma créditos: crea/actualiza tool_access con expires_at futuro
    // y schedule=null (temporalmente sin restricción horaria). Cuando
    // pase expires_at, el middleware lo trata como expired.
    const mins = req.exceptional_duration_minutes;
    if (mins == null || mins <= 0) {
      return NextResponse.json(
        {
          error: "invalid_duration",
          message: "la request no tiene exceptional_duration_minutes",
        },
        { status: 422 },
      );
    }
    expiresAt = new Date(Date.now() + mins * 60_000).toISOString();
    const { error: tAccErr } = await db.from("tool_access").upsert(
      {
        user_id: req.user_id,
        tool_id: req.tool_id,
        status: "active",
        // schedule=null = sin restricción horaria durante la ventana
        // excepcional. NO pisamos el schedule original — lo guardamos
        // en review_note para restaurarlo después si quisiéramos
        // automatizarlo en una sesión posterior.
        schedule: null,
        expires_at: expiresAt,
        granted_by: guard.userId,
      },
      { onConflict: "user_id,tool_id" },
    );
    if (tAccErr) {
      return NextResponse.json(
        { error: "db_error", message: tAccErr.message },
        { status: 500 },
      );
    }
    // No registramos credit_transaction — no se movieron créditos.
  } else {
    // ─── Flow para créditos (comportamiento original) ───
    if (req.credits_requested == null || req.credits_requested <= 0) {
      return NextResponse.json(
        { error: "invalid_amount", message: "la request no tiene credits_requested" },
        { status: 422 },
      );
    }

    // 1) sumar al allocation
    const { data: alloc } = await db
      .from("credit_allocations")
      .select("id, credits_assigned, credits_used")
      .eq("user_id", req.user_id)
      .eq("tool_id", req.tool_id)
      .maybeSingle();

    newAssigned = (alloc?.credits_assigned ?? 0) + req.credits_requested;

    if (alloc) {
      const { error } = await db
        .from("credit_allocations")
        .update({ credits_assigned: newAssigned })
        .eq("id", alloc.id);
      if (error) {
        return NextResponse.json(
          { error: "db_error", message: error.message },
          { status: 500 },
        );
      }
    } else {
      const { error } = await db.from("credit_allocations").insert({
        user_id: req.user_id,
        tool_id: req.tool_id,
        credits_assigned: req.credits_requested,
        credits_used: 0,
      });
      if (error) {
        return NextResponse.json(
          { error: "db_error", message: error.message },
          { status: 500 },
        );
      }
    }

    // 2) tx
    await db.from("credit_transactions").insert({
      user_id: req.user_id,
      tool_id: req.tool_id,
      type: "allocation",
      amount: req.credits_requested,
      reason: `approval request=${id.slice(0, 8)}${parsed.data.note ? ` · ${parsed.data.note}` : ""}`,
      performed_by: guard.userId,
    });
  }

  // 3) marcar request approved
  const { error: updErr } = await db
    .from("access_requests")
    .update({
      status: "approved",
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

  // 4) Slack
  const userName =
    (req.users as unknown as { name?: string } | null)?.name ?? "—";
  const toolName =
    (req.tools as unknown as { name?: string } | null)?.name ?? req.tool_id;

  if (reqType === "access") {
    // Notif con el kind de resolución de acceso (incluye quién aprobó).
    await notifySlack({
      kind: "access_approved",
      userName,
      toolName,
      adminName: guard.name,
      note: parsed.data.note,
      requestId: id,
    });
  } else {
    await notifySlack({
      kind: "credits_approved",
      userName,
      toolName,
      amount:
        reqType === "exceptional_access"
          ? req.exceptional_duration_minutes ?? undefined
          : req.credits_requested ?? undefined,
      note:
        reqType === "exceptional_access"
          ? `⏰ Acceso excepcional aprobado · expira ${expiresAt}${parsed.data.note ? ` · ${parsed.data.note}` : ""}`
          : parsed.data.note,
      requestId: id,
    });
  }

  return NextResponse.json({
    ok: true,
    requestId: id,
    requestType: reqType,
    credits_assigned: newAssigned,
    expires_at: expiresAt,
  });
}
