/**
 * POST /api/admin/system-prompts/[id]/activate
 *
 * Marca esta versión como is_active=true y desactiva las otras de la
 * misma tool. NO toca contenido ni modelo.
 *
 * Acción crítica — el prompt activo es el "cerebro" que recibe la API
 * de Anthropic. La UI muestra modal de confirmación antes de pegarle.
 */
import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/admin-guard";
import { createServerClient } from "@/lib/db/supabase";

type Ctx = { params: Promise<{ id: string }> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  _request: Request,
  ctx: Ctx,
): Promise<NextResponse> {
  const guard = await requireAdminApi();
  if (guard instanceof NextResponse) return guard;

  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const db = createServerClient();
  // Buscamos la version para saber a qué tool pertenece.
  const { data: target, error: lookupErr } = await db
    .from("system_prompts")
    .select("id, tool_id")
    .eq("id", id)
    .maybeSingle();
  if (lookupErr) {
    return NextResponse.json(
      { error: "db_error", message: lookupErr.message },
      { status: 500 },
    );
  }
  if (!target) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Desactivar el resto de la misma tool.
  await db
    .from("system_prompts")
    .update({ is_active: false })
    .eq("tool_id", target.tool_id)
    .neq("id", id);

  // Activar esta.
  const { error: actErr } = await db
    .from("system_prompts")
    .update({ is_active: true })
    .eq("id", id);
  if (actErr) {
    return NextResponse.json(
      { error: "db_error", message: actErr.message },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
