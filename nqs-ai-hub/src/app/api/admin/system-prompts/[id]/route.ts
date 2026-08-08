/**
 * GET /api/admin/system-prompts/[id]
 *
 * Detalle de una versión del prompt. INCLUYE el content desencriptado
 * en plaintext — solo admin. RLS + check de rol garantizan que esto
 * no se filtre.
 *
 * DELETE /api/admin/system-prompts/[id]
 *
 * Borra una versión del historial. Solo inactivas — la activa nunca
 * se puede eliminar (hay que activar otra antes). Tampoco se puede
 * dejar el (tool, type, project) sin ninguna versión.
 */
import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/admin-guard";
import { requireBrainGateApi } from "@/lib/auth/brain";
import { createServerClient } from "@/lib/db/supabase";
import { decrypt } from "@/lib/utils/crypto";
import {
  defaultThinkingModeFor,
  isThinkingMode,
} from "@/lib/anthropic/thinking-mode";

type Ctx = { params: Promise<{ id: string }> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _request: Request,
  ctx: Ctx,
): Promise<NextResponse> {
  const guard = await requireAdminApi();
  if (guard instanceof NextResponse) return guard;
  const brainGate = await requireBrainGateApi();
  if (brainGate instanceof NextResponse) return brainGate;

  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const db = createServerClient();
  const { data, error } = await db
    .from("system_prompts")
    .select(
      "id, tool_id, type, name, content_encrypted, model, thinking_mode, is_active, version, created_by, created_at, updated_at",
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
      type: data.type,
      name: data.name,
      // Empty content_encrypted (ej. memoria recién creada) → plaintext "".
      content: data.content_encrypted ? decrypt(data.content_encrypted) : "",
      model: data.model,
      thinkingMode: isThinkingMode(data.thinking_mode)
        ? data.thinking_mode
        : defaultThinkingModeFor(data.model),
      isActive: data.is_active,
      version: data.version,
      createdBy: data.created_by,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    },
  });
}

export async function DELETE(
  _request: Request,
  ctx: Ctx,
): Promise<NextResponse> {
  const guard = await requireAdminApi();
  if (guard instanceof NextResponse) return guard;
  const brainGate = await requireBrainGateApi();
  if (brainGate instanceof NextResponse) return brainGate;

  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const db = createServerClient();
  const { data: target, error: lookupErr } = await db
    .from("system_prompts")
    .select("id, tool_id, type, project_id, is_active, version")
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
  if (target.is_active === true) {
    return NextResponse.json(
      {
        error: "cannot_delete_active",
        message:
          "No se puede borrar la versión activa. Activá otra primero.",
      },
      { status: 409 },
    );
  }

  // Contar hermanas del mismo (tool, type, project) para no dejar el
  // historial vacío.
  let siblingsQuery = db
    .from("system_prompts")
    .select("id", { count: "exact", head: true })
    .eq("tool_id", target.tool_id)
    .eq("type", target.type);
  siblingsQuery =
    target.project_id == null
      ? siblingsQuery.is("project_id", null)
      : siblingsQuery.eq("project_id", target.project_id);
  const { count, error: countErr } = await siblingsQuery;
  if (countErr) {
    return NextResponse.json(
      { error: "db_error", message: countErr.message },
      { status: 500 },
    );
  }
  if ((count ?? 0) <= 1) {
    return NextResponse.json(
      {
        error: "cannot_delete_last",
        message: "No se puede borrar la única versión del historial.",
      },
      { status: 409 },
    );
  }

  const { error: delErr } = await db
    .from("system_prompts")
    .delete()
    .eq("id", id);
  if (delErr) {
    return NextResponse.json(
      { error: "db_error", message: delErr.message },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, version: target.version });
}
