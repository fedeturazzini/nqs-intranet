/**
 * GET /api/admin/conversations/[id]
 *
 * Detalle completo de una conversación (admin + gate de Gastos).
 * Opción A: sin ownership de empleado, sin gate de proyecto privado.
 * Solo lectura — no hay PATCH/DELETE acá.
 */
import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/admin-guard";
import { requireGastosGateApi } from "@/lib/auth/gastos-gate";
import { createServerClient } from "@/lib/db/supabase";
import { buildConversationMessagesPayload } from "@/lib/db/queries/conversation-detail";

type RouteContext = { params: Promise<{ id: string }> };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const guard = await requireAdminApi();
  if (guard instanceof NextResponse) return guard;
  const gate = await requireGastosGateApi();
  if (gate instanceof NextResponse) return gate;

  const { id } = await context.params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const db = createServerClient();
  const { data: conv, error: convErr } = await db
    .from("claude_conversations")
    .select(
      "id, user_id, project_id, title, created_at, updated_at, users(name), projects(name)",
    )
    .eq("id", id)
    .maybeSingle();

  if (convErr) {
    return NextResponse.json(
      { error: "db_error", message: convErr.message },
      { status: 500 },
    );
  }
  if (!conv) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const owner = conv.users as { name: string } | null;
  const project = conv.projects as { name: string } | null;

  try {
    const messages = await buildConversationMessagesPayload(id);
    return NextResponse.json({
      conversation: {
        id: conv.id,
        title: conv.title,
        createdAt: conv.created_at,
        updatedAt: conv.updated_at,
        userId: conv.user_id,
        userName: owner?.name ?? "—",
        projectId: conv.project_id,
        projectName: project?.name ?? null,
      },
      messages,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "db_error",
        message: error instanceof Error ? error.message : "error desconocido",
      },
      { status: 500 },
    );
  }
}
