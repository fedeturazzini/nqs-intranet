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
 * Body: { toolId, reason?: string(0-500) } — el motivo es OPCIONAL: si no
 * escriben nada, la solicitud se crea igual (sin mínimo de caracteres).
 *
 * Validaciones server-side:
 *   - tool existe y está operativa (is_active=true; rechaza coming_soon)
 *   - el user NO tiene ya acceso activo
 *   - el user NO tiene una request 'access' pendiente para esta tool
 *
 * Inserta access_request con request_type='access' + notif a Slack. Si el
 * aviso se confirma (200), marca notified_at (observabilidad — ver migración
 * 0015). Los cortes silenciosos (already_pending / already_has_access) se
 * loguean pero NO avisan a Slack (por ahora — la re-emisión es fase 2).
 */
import { after, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/server";
import { createServerClient } from "@/lib/db/supabase";
import { notifySlack } from "@/lib/notifications/slack";

const BodySchema = z.object({
  toolId: z.string().min(1),
  // Motivo OPCIONAL: sin mínimo de caracteres. Si el user no escribe nada, la
  // solicitud se manda igual. El max queda como guardarraíl de payload.
  reason: z.string().trim().max(500).optional().default(""),
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
    // Observabilidad (fase 1): este path NO avisa a Slack (el user ya tiene la
    // tool). Lo logueamos porque, si aparece seguido en prod, es un pedido que
    // "no llegó" explicado por tener acceso activo — no un webhook caído.
    console.log(
      JSON.stringify({
        level: "info",
        msg: "access-request corto: already_has_access (sin Slack)",
        userId: session.userId,
        toolId,
      }),
    );
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
    // Observabilidad (fase 1): hoy este path NO re-emite el aviso — esa es la
    // fase 2 (re-emisión con throttle, ver slack-intermitente-audit.md). El log
    // deja medir en prod cuántas veces se choca una fila pendiente sin avisar.
    console.log(
      JSON.stringify({
        level: "info",
        msg: "access-request corto: already_pending (sin Slack)",
        userId: session.userId,
        toolId,
        pendingId: pending.id,
      }),
    );
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
      // Motivo vacío → null (la columna es nullable), no string vacío.
      reason: reason || null,
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
  // after(): corre DESPUÉS de enviar la respuesta pero mantiene VIVA la función
  // en serverless, así el POST a Slack se completa. Con `void` quedaba pendiente
  // y Vercel congelaba la función al responder → el aviso nunca salía (ver
  // slack-notif-audit.md). La solicitud ya está guardada (insert arriba); el
  // aviso viaja aparte y no bloquea la respuesta (el botón no se cuelga).
  //
  // Observabilidad (fase 1): si Slack confirma el envío (200), marcamos
  // notified_at. Best-effort — si el update falla, la solicitud y el aviso ya
  // salieron igual. Un notified_at que queda null = aviso NO confirmado: la
  // señal que queremos medir en prod antes de decidir la re-emisión (fase 2).
  after(async () => {
    const sent = await notifySlack({
      kind: "access_request",
      userName: session.name,
      toolName: tool.name,
      reason,
      requestId: created.id,
      adminUrl,
    });
    if (!sent) {
      console.error(
        JSON.stringify({
          level: "error",
          msg: "access_request aviso NO confirmado (notified_at queda null)",
          requestId: created.id,
        }),
      );
      return;
    }
    const { error: markErr } = await db
      .from("access_requests")
      .update({ notified_at: new Date().toISOString() })
      .eq("id", created.id);
    if (markErr) {
      console.error(
        JSON.stringify({
          level: "error",
          msg: "notified_at update falló (el aviso sí salió)",
          requestId: created.id,
          error: markErr.message,
        }),
      );
    }
  });

  return NextResponse.json({ ok: true, requestId: created.id });
}
