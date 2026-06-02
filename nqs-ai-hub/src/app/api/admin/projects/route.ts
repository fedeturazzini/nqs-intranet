/**
 * /api/admin/projects
 *
 * GET  → todos los proyectos (incluye archivados). Solo admin.
 * POST → crear proyecto. Solo admin.
 *
 * Nota: la creación NO pre-crea system_prompts. Cada proyecto arranca sin
 * cerebro/memoria; el admin los carga desde /admin/brain (create-on-save).
 * Esto mantiene prod-safe la ventana en que el código viejo (no
 * project-aware) podría estar corriendo en producción.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/auth/admin-guard";
import { createServerClient } from "@/lib/db/supabase";
import { listAllProjects } from "@/lib/db/queries/projects";

export async function GET(): Promise<NextResponse> {
  const guard = await requireAdminApi();
  if (guard instanceof NextResponse) return guard;
  const projects = await listAllProjects();
  return NextResponse.json({ projects });
}

const CreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9-]+$/, "slug: solo minúsculas, números y guiones"),
  description: z.string().max(500).optional(),
  icon: z.string().max(16).optional(),
});

export async function POST(request: Request): Promise<NextResponse> {
  const guard = await requireAdminApi();
  if (guard instanceof NextResponse) return guard;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_request", message: parsed.error.issues[0].message },
      { status: 400 },
    );
  }

  const db = createServerClient();
  const { data, error } = await db
    .from("projects")
    .insert({
      name: parsed.data.name,
      slug: parsed.data.slug,
      description: parsed.data.description ?? null,
      icon: parsed.data.icon ?? null,
      is_active: true,
      created_by: guard.userId,
    })
    .select("*")
    .single();

  if (error) {
    // 23505 = unique_violation (slug duplicado).
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
