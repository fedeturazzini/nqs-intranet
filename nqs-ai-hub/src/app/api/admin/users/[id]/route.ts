/**
 * /api/admin/users/[id]
 *
 * PATCH  → editar campos básicos (name, dept, job_title, role, initials, is_active).
 * DELETE → soft delete (is_active=false). NO borra de auth.users — el
 *          admin puede reactivar cambiando is_active de vuelta a true.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/auth/admin-guard";
import { createServerClient } from "@/lib/db/supabase";
import type { TablesUpdate } from "@/types/db";

type Ctx = { params: Promise<{ id: string }> };
type UserUpdate = TablesUpdate<"users">;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PatchSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  initials: z.string().min(1).max(4).optional(),
  role: z.enum(["admin", "employee"]).optional(),
  dept: z.string().max(80).nullable().optional(),
  jobTitle: z.string().max(120).nullable().optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(
  request: Request,
  ctx: Ctx,
): Promise<NextResponse> {
  const guard = await requireAdminApi();
  if (guard instanceof NextResponse) return guard;

  const { id } = await ctx.params;
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

  // Mapear camelCase del API → snake_case de la columna. Tipamos como
  // TablesUpdate<"users"> para que `.update()` valide cada key.
  const update: UserUpdate = {};
  if (parsed.data.name !== undefined) update.name = parsed.data.name;
  if (parsed.data.initials !== undefined)
    update.initials = parsed.data.initials.toUpperCase();
  if (parsed.data.role !== undefined) update.role = parsed.data.role;
  if (parsed.data.dept !== undefined) update.dept = parsed.data.dept;
  if (parsed.data.jobTitle !== undefined) update.job_title = parsed.data.jobTitle;
  if (parsed.data.isActive !== undefined) update.is_active = parsed.data.isActive;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "no_changes" }, { status: 400 });
  }

  const db = createServerClient();
  const { data, error } = await db
    .from("users")
    .update(update)
    .eq("id", id)
    .select("*")
    .single();
  if (error) {
    return NextResponse.json(
      { error: "db_error", message: error.message },
      { status: 500 },
    );
  }
  return NextResponse.json({ user: data });
}

export async function DELETE(
  _request: Request,
  ctx: Ctx,
): Promise<NextResponse> {
  const guard = await requireAdminApi();
  if (guard instanceof NextResponse) return guard;

  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  // Soft delete: marcamos is_active=false. El auth.user sigue existiendo
  // pero `requireAuth → getSession()` falla porque public.users.is_active
  // está chequeado en el middleware de permisos. La sesión activa muere
  // en el próximo render.
  const db = createServerClient();
  const { error } = await db
    .from("users")
    .update({ is_active: false })
    .eq("id", id);
  if (error) {
    return NextResponse.json(
      { error: "db_error", message: error.message },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
