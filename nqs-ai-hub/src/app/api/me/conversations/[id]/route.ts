/**
 * GET   /api/me/conversations/[id] — mensajes de una conversación.
 * PATCH /api/me/conversations/[id] — renombrar el título de la conversación.
 *
 * Ambos validan ownership server-side (no nos fiamos de RLS solo — el
 * service_role client se la saltea).
 *
 * En Next 16 los `params` de rutas dinámicas son `Promise`.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/server";
import { createServerClient } from "@/lib/db/supabase";
import { hasProjectGate } from "@/lib/auth/project-gate";
import { buildConversationMessagesPayload } from "@/lib/db/queries/conversation-detail";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(
  _request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  const db = createServerClient();

  // Ownership check + título de la conv en una sola query.
  const { data: conv, error: convErr } = await db
    .from("claude_conversations")
    .select("id, user_id, project_id, title, created_at, updated_at")
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
  if (conv.user_id !== session.userId) {
    // 404 a propósito — no leakear existencia de conversaciones ajenas.
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // La conversación es la autoridad de proyecto. El singleton global puede
  // cambiar desde otra pestaña y no debe impedir abrir esta conversación.
  // Las conversaciones legacy/huérfanas (project_id null) no inventan un gate.
  if (conv.project_id && !(await hasProjectGate(conv.project_id))) {
    return NextResponse.json({ error: "project_locked" }, { status: 403 });
  }

  try {
    const messagesWithUrls = await buildConversationMessagesPayload(id);
    return NextResponse.json({
      conversation: {
        id: conv.id,
        title: conv.title,
        createdAt: conv.created_at,
        updatedAt: conv.updated_at,
      },
      messages: messagesWithUrls,
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

// El título editable: no vacío y con un largo razonable. Se `trim`ea antes de
// validar, así "   " no pasa como título válido.
const RenameSchema = z.object({
  title: z.string().trim().min(1, "el título no puede estar vacío").max(100),
});

/**
 * PATCH /api/me/conversations/[id] — renombra el título de la conversación.
 * Body: { title }. Solo el dueño puede renombrar (ownership por user_id → 403).
 */
export async function PATCH(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "bad_request", message: "body no es JSON válido" },
      { status: 400 },
    );
  }

  const parsed = RenameSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_request", message: parsed.error.issues[0].message },
      { status: 400 },
    );
  }
  const title = parsed.data.title;

  const db = createServerClient();

  // Ownership: traemos la conv y validamos que sea del user antes de tocar nada.
  const { data: conv, error: convErr } = await db
    .from("claude_conversations")
    .select("id, user_id, project_id")
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
  if (conv.user_id !== session.userId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (conv.project_id && !(await hasProjectGate(conv.project_id))) {
    return NextResponse.json({ error: "project_locked" }, { status: 403 });
  }

  // Update con guard extra por user_id (defensa en profundidad).
  const { error: updErr } = await db
    .from("claude_conversations")
    .update({ title })
    .eq("id", id)
    .eq("user_id", session.userId);

  if (updErr) {
    return NextResponse.json(
      { error: "db_error", message: updErr.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, title });
}
