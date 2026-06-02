/**
 * /api/admin/projects/[id]
 *
 * PATCH  → editar proyecto (name/slug/description/icon/is_active). Admin.
 * DELETE → SOFT delete (is_active=false). No borra la fila. Admin.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/auth/admin-guard";
import { createServerClient } from "@/lib/db/supabase";

type RouteContext = { params: Promise<{ id: string }> };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PatchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9-]+$/, "slug: solo minúsculas, números y guiones")
    .optional(),
  description: z.string().max(500).nullable().optional(),
  icon: z.string().max(16).nullable().optional(),
  is_active: z.boolean().optional(),
});

export async function PATCH(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const guard = await requireAdminApi();
  if (guard instanceof NextResponse) return guard;

  const { id } = await context.params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_request", message: parsed.error.issues[0].message },
      { status: 400 },
    );
  }

  const patch = { ...parsed.data, updated_at: new Date().toISOString() };

  const db = createServerClient();
  const { data, error } = await db
    .from("projects")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "slug_taken", message: "Ya existe un proyecto con ese slug" },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: "db_error", message: error.message },
      { status: 500 },
    );
  }
  return NextResponse.json({ project: data });
}

export async function DELETE(
  _request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const guard = await requireAdminApi();
  if (guard instanceof NextResponse) return guard;

  const { id } = await context.params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const db = createServerClient();

  // FIX 17.5: antes de archivar, las conversaciones de este proyecto pasan
  // a project_id = NULL ("Sin proyecto"). No se borran — quedan huérfanas y
  // recuperables (vista "Sin proyecto" queda como TODO post-MVP).
  const { error: convErr } = await db
    .from("claude_conversations")
    .update({ project_id: null })
    .eq("project_id", id);
  if (convErr) {
    return NextResponse.json(
      { error: "db_error", message: convErr.message },
      { status: 500 },
    );
  }

  // SOFT delete del proyecto: archivamos (is_active=false), no borramos la
  // fila ni sus prompts.
  const { error } = await db
    .from("projects")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    return NextResponse.json(
      { error: "db_error", message: error.message },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
