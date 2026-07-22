/**
 * /api/admin/projects/[id]
 *
 * PATCH  → editar proyecto (name/slug/description/icon/is_active). Admin.
 * DELETE → SOFT delete (is_active=false). No borra la fila. Admin.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { requireAdminApi } from "@/lib/auth/admin-guard";
import { createServerClient } from "@/lib/db/supabase";
import { getProjectGateFields } from "@/lib/db/queries/projects";

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
  // Privacidad (migration 0016). Lógica de transiciones en el handler; un
  // cambio de clave sin tocar is_private va por el endpoint /change-password.
  is_private: z.boolean().optional(),
  password: z.string().min(8).max(200).optional(),
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

  // Patch explícito (no spread de parsed.data — `password` no es columna y va
  // procesada aparte).
  const patch: {
    name?: string;
    slug?: string;
    description?: string | null;
    icon?: string | null;
    is_active?: boolean;
    is_private?: boolean;
    password_hash?: string | null;
    gate_version?: number;
    updated_at: string;
  } = { updated_at: new Date().toISOString() };
  if (parsed.data.name !== undefined) patch.name = parsed.data.name;
  if (parsed.data.slug !== undefined) patch.slug = parsed.data.slug;
  if (parsed.data.description !== undefined)
    patch.description = parsed.data.description;
  if (parsed.data.icon !== undefined) patch.icon = parsed.data.icon;
  if (parsed.data.is_active !== undefined) patch.is_active = parsed.data.is_active;

  // Transiciones de privacidad (migration 0016).
  if (parsed.data.is_private !== undefined) {
    const current = await getProjectGateFields(id);
    if (!current) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (parsed.data.is_private) {
      if (parsed.data.password) {
        // abierto→privado (o re-setear clave al pasar a privado): hash + bump.
        patch.is_private = true;
        patch.password_hash = await bcrypt.hash(parsed.data.password, 10);
        patch.gate_version = current.gate_version + 1;
      } else if (current.is_private) {
        // ya era privado y no mandan clave → no tocamos hash ni gate.
        patch.is_private = true;
      } else {
        return NextResponse.json(
          {
            error: "password_required",
            message:
              "Un proyecto privado necesita una contraseña (mínimo 8 caracteres)",
          },
          { status: 400 },
        );
      }
    } else {
      // privado→abierto: limpiar el hash e invalidar todos los gates vigentes.
      patch.is_private = false;
      patch.password_hash = null;
      patch.gate_version = current.gate_version + 1;
    }
  }

  const db = createServerClient();
  const { data, error } = await db
    .from("projects")
    .update(patch)
    .eq("id", id)
    // Nunca devolver password_hash al cliente.
    .select(
      "id, name, slug, description, icon, is_active, is_private, gate_version, created_by, created_at, updated_at",
    )
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
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const guard = await requireAdminApi();
  if (guard instanceof NextResponse) return guard;

  const { id } = await context.params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const db = createServerClient();
  const hard = new URL(request.url).searchParams.get("hard") === "true";

  if (hard) {
    // S18: HARD delete — borra el proyecto y TODO lo asociado de la DB.
    //   1. claude_conversations del proyecto → cascade a claude_messages
    //      (FK ON DELETE CASCADE). Las borramos explícito porque su FK a
    //      projects es ON DELETE SET NULL (si no, sobrevivirían huérfanas).
    //   2. el proyecto → cascade a system_prompts (FK ON DELETE CASCADE).
    const { error: convDelErr } = await db
      .from("claude_conversations")
      .delete()
      .eq("project_id", id);
    if (convDelErr) {
      return NextResponse.json(
        { error: "db_error", message: convDelErr.message },
        { status: 500 },
      );
    }
    const { error: projDelErr } = await db
      .from("projects")
      .delete()
      .eq("id", id);
    if (projDelErr) {
      return NextResponse.json(
        { error: "db_error", message: projDelErr.message },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: true, hard: true });
  }

  // SOFT delete (archivar). Las conversaciones del proyecto pasan a
  // project_id = NULL ("Sin proyecto"); no se borran.
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
