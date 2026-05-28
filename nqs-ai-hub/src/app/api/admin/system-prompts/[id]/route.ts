/**
 * GET /api/admin/system-prompts/[id]
 *
 * Detalle de una versión del prompt. INCLUYE el content desencriptado
 * en plaintext — solo admin. RLS + check de rol garantizan que esto
 * no se filtre.
 */
import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/admin-guard";
import { createServerClient } from "@/lib/db/supabase";
import { decrypt } from "@/lib/utils/crypto";

type Ctx = { params: Promise<{ id: string }> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
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
  const { data, error } = await db
    .from("system_prompts")
    .select(
      "id, tool_id, name, content_encrypted, model, is_active, version, created_by, created_at, updated_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) {
    return NextResponse.json(
      { error: "db_error", message: error.message },
      { status: 500 },
    );
  }
  if (!data) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({
    prompt: {
      id: data.id,
      toolId: data.tool_id,
      name: data.name,
      content: decrypt(data.content_encrypted),
      model: data.model,
      isActive: data.is_active,
      version: data.version,
      createdBy: data.created_by,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    },
  });
}
