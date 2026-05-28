/**
 * /api/admin/users
 *
 * GET  → lista users con count de tools activas + last_login (de auth.users).
 * POST → crea user (auth + public.users) con UUID compartido.
 *
 * Solo admin. Las acciones de toggle access / schedule / créditos
 * viven en sus propios endpoints (ver /api/admin/tools/access etc.).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/auth/admin-guard";
import { createServerClient } from "@/lib/db/supabase";

const NewUserSchema = z.object({
  email: z.string().email().max(254),
  name: z.string().min(2).max(120),
  initials: z.string().min(1).max(4),
  role: z.enum(["admin", "employee"]),
  dept: z.string().max(80).optional(),
  jobTitle: z.string().max(120).optional(),
  password: z.string().min(8).max(120),
});

export async function GET(): Promise<NextResponse> {
  const guard = await requireAdminApi();
  if (guard instanceof NextResponse) return guard;

  const db = createServerClient();

  // public.users
  const { data: users, error } = await db
    .from("users")
    .select("id, email, name, initials, role, dept, job_title, is_active, created_at, updated_at")
    .order("created_at", { ascending: true });
  if (error) {
    return NextResponse.json(
      { error: "db_error", message: error.message },
      { status: 500 },
    );
  }

  // tool_access por user (count de activos).
  const { data: accesses } = await db
    .from("tool_access")
    .select("user_id, status")
    .eq("status", "active");

  const activeCount = new Map<string, number>();
  for (const a of accesses ?? []) {
    activeCount.set(a.user_id, (activeCount.get(a.user_id) ?? 0) + 1);
  }

  // last_sign_in_at de auth.users (admin API).
  const { data: authUsers } = await db.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  const lastSignIn = new Map<string, string | null>();
  for (const u of authUsers?.users ?? []) {
    lastSignIn.set(u.id, u.last_sign_in_at ?? null);
  }

  const enriched = (users ?? []).map((u) => ({
    ...u,
    tools_active_count: activeCount.get(u.id) ?? 0,
    last_sign_in_at: lastSignIn.get(u.id) ?? null,
  }));

  return NextResponse.json({ users: enriched });
}

export async function POST(request: Request): Promise<NextResponse> {
  const guard = await requireAdminApi();
  if (guard instanceof NextResponse) return guard;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const parsed = NewUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_request", message: parsed.error.issues[0].message },
      { status: 400 },
    );
  }
  const {
    email,
    name,
    initials,
    role,
    dept,
    jobTitle,
    password,
  } = parsed.data;

  const db = createServerClient();

  // 1) crear en auth.users
  const { data: auth, error: authErr } = await db.auth.admin.createUser({
    email: email.trim().toLowerCase(),
    password,
    email_confirm: true,
    user_metadata: { name, role },
  });
  if (authErr || !auth.user) {
    return NextResponse.json(
      { error: "auth_create_failed", message: authErr?.message ?? "no_user_returned" },
      { status: 422 },
    );
  }

  // 2) insertar en public.users con el MISMO UUID
  const { data: profile, error: insertErr } = await db
    .from("users")
    .insert({
      id: auth.user.id,
      email: email.trim().toLowerCase(),
      name,
      initials: initials.toUpperCase(),
      role,
      dept: dept ?? null,
      job_title: jobTitle ?? null,
      is_active: true,
    })
    .select("*")
    .single();
  if (insertErr || !profile) {
    // Inconsistencia: revertimos el auth.user para no dejar fantasmas.
    await db.auth.admin.deleteUser(auth.user.id).catch(() => {
      console.error(
        JSON.stringify({
          level: "error",
          msg: "rollback failed: stale auth user",
          authUserId: auth.user.id,
        }),
      );
    });
    return NextResponse.json(
      {
        error: "profile_insert_failed",
        message: insertErr?.message ?? "profile_missing",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ user: profile });
}
