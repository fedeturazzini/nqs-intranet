/**
 * /api/admin/users/[id]
 *
 * PATCH  → editar campos básicos (name, dept, job_title, role, initials, is_active).
 * DELETE → soft delete (is_active=false) por default; el admin puede reactivar.
 *          DELETE ?hard=true → borrado DEFINITIVO (auth.users + public.users;
 *          los datos caen por ON DELETE CASCADE de la migration 0012). Un admin
 *          no puede eliminarse a sí mismo.
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
  request: Request,
  ctx: Ctx,
): Promise<NextResponse> {
  const guard = await requireAdminApi();
  if (guard instanceof NextResponse) return guard;

  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const db = createServerClient();
  const hard = new URL(request.url).searchParams.get("hard") === "true";

  // ── Hard delete (irreversible): borra de auth.users + public.users. Los
  //    datos propios del user caen por ON DELETE CASCADE (migration 0012) y
  //    las columnas de auditoría *_by quedan en NULL.
  if (hard) {
    if (id === guard.userId) {
      return NextResponse.json(
        {
          error: "cannot_delete_self",
          message: "No podés eliminarte a vos mismo",
        },
        { status: 400 },
      );
    }
    // 1) public.users primero (cascadea los hijos). Si falla, no tocamos auth.
    const { error: pubErr } = await db.from("users").delete().eq("id", id);
    if (pubErr) {
      return NextResponse.json(
        { error: "db_error", message: pubErr.message },
        { status: 500 },
      );
    }
    // 2) auth.users (no tiene FK con public.users → se borra aparte).
    //    Best-effort: si falla, el profile ya no existe (el user no puede
    //    entrar igual); logueamos el auth huérfano para limpieza manual.
    const { error: authErr } = await db.auth.admin.deleteUser(id);
    if (authErr) {
      console.error(
        JSON.stringify({
          level: "error",
          msg: "hard delete: auth.user no se borró (profile sí)",
          userId: id,
          error: authErr.message,
        }),
      );
    }
    return NextResponse.json({ ok: true, hard: true });
  }

  // ── Soft delete (default): is_active=false. El auth.user sigue existiendo
  //    pero `getSession()` falla porque se chequea is_active. El user queda en
  //    la lista con badge "baja" y se puede reactivar.
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
