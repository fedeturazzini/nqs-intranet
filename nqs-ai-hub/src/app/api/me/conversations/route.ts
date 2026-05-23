/**
 * GET /api/me/conversations
 *
 * Devuelve las últimas 20 conversaciones del user actual ordenadas
 * por `updated_at desc`. Sin paginación en MVP — si una persona pasa
 * 20 conversaciones es momento de agregar cursor.
 */
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/server";
import { createServerClient } from "@/lib/db/supabase";

const LIMIT = 20;

export async function GET(): Promise<NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = createServerClient();
  const { data, error } = await db
    .from("claude_conversations")
    .select("id, title, created_at, updated_at")
    .eq("user_id", session.userId)
    .order("updated_at", { ascending: false })
    .limit(LIMIT);

  if (error) {
    return NextResponse.json(
      { error: "db_error", message: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ conversations: data ?? [] });
}
