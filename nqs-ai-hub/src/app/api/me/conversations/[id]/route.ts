/**
 * GET /api/me/conversations/[id]
 *
 * Mensajes de una conversación, ordenados cronológicamente.
 * Valida ownership server-side (no nos fiamos de RLS solo — el
 * service_role client se la saltea).
 *
 * En Next 16 los `params` de rutas dinámicas son `Promise`.
 */
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/server";
import { createServerClient } from "@/lib/db/supabase";
import { signDownloadUrls } from "@/lib/storage/claude-uploads";

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
    .select("id, user_id, title, created_at, updated_at")
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

  const { data: messages, error: msgErr } = await db
    .from("claude_messages")
    .select(
      "id, role, content, images, tokens_input, tokens_output, created_at",
    )
    .eq("conversation_id", id)
    .order("created_at", { ascending: true });

  if (msgErr) {
    return NextResponse.json(
      { error: "db_error", message: msgErr.message },
      { status: 500 },
    );
  }

  // Las imágenes se guardan como PATHS de Storage. Para mostrarlas hay
  // que firmar URLs de descarga on-demand (1h). Juntamos todos los paths
  // de la conversación, firmamos en un solo batch, y devolvemos
  // `imageUrls` por mensaje.
  const allPaths: string[] = [];
  for (const m of messages ?? []) {
    const imgs = Array.isArray(m.images) ? (m.images as unknown[]) : [];
    for (const p of imgs) {
      if (typeof p === "string" && p.length > 0) allPaths.push(p);
    }
  }
  const signedByPath = new Map<string, string>();
  if (allPaths.length > 0) {
    const signed = await signDownloadUrls(allPaths);
    for (const s of signed) signedByPath.set(s.path, s.url);
  }

  const messagesWithUrls = (messages ?? []).map((m) => {
    const imgs = Array.isArray(m.images) ? (m.images as unknown[]) : [];
    const imageUrls = imgs
      .filter((p): p is string => typeof p === "string")
      .map((p) => signedByPath.get(p))
      .filter((u): u is string => Boolean(u));
    return { ...m, imageUrls };
  });

  return NextResponse.json({
    conversation: {
      id: conv.id,
      title: conv.title,
      createdAt: conv.created_at,
      updatedAt: conv.updated_at,
    },
    messages: messagesWithUrls,
  });
}
