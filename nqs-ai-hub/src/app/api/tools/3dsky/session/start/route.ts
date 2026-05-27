/**
 * POST /api/tools/3dsky/session/start
 *
 * Body: ninguno.
 * Response: { sessionId: string }
 *
 * Crea un registro en `module_sessions` con `entered_at = NOW()`.
 * El frontend persiste el sessionId (state local del componente) y lo
 * usa al salir para llamar a /session/end.
 *
 * Valida permisos con `canUseTool` (incluye horario) — no queremos
 * abrir sesiones fuera de ventana.
 */
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/server";
import { canUseTool } from "@/lib/middleware/permissions";
import { createServerClient } from "@/lib/db/supabase";

export async function POST(request: Request): Promise<NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const perm = await canUseTool(session.userId, "3dsky");
  if (!perm.allowed) {
    return NextResponse.json(
      { error: perm.reason, message: perm.message ?? null },
      { status: 403 },
    );
  }

  // Auditoría — capturamos IP y UA del request.
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const ua = request.headers.get("user-agent") ?? null;

  const db = createServerClient();
  const { data, error } = await db
    .from("module_sessions")
    .insert({
      user_id: session.userId,
      tool_id: "3dsky",
      ip_address: ip,
      user_agent: ua,
    })
    .select("id")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "db_error", message: error?.message ?? "no_session_created" },
      { status: 500 },
    );
  }

  return NextResponse.json({ sessionId: data.id });
}
