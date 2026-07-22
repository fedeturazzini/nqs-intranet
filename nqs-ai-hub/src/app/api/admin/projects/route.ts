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
import bcrypt from "bcryptjs";
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
  name: z
    .string()
    .trim()
    .min(1, "Poné un nombre para el proyecto.")
    .max(120, "El nombre es muy largo (máx. 120 caracteres)."),
  slug: z
    .string()
    .trim()
    .min(1, "El slug no puede quedar vacío.")
    .max(80, "El slug es muy largo (máx. 80 caracteres).")
    .regex(/^[a-z0-9-]+$/, "El slug solo admite minúsculas, números y guiones."),
  // description/icon son opcionales: vacío llega como null desde el modal.
  description: z
    .string()
    .max(500, "La descripción es muy larga (máx. 500 caracteres).")
    .nullable()
    .optional(),
  icon: z.string().max(16, "El ícono es muy largo.").nullable().optional(),
  // Privacidad (migration 0016). Si is_private=true, `password` es obligatorio.
  is_private: z.boolean().optional().default(false),
  password: z
    .string()
    .min(8, "La contraseña necesita al menos 8 caracteres.")
    .max(200, "La contraseña es demasiado larga.")
    .optional(),
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

  // Privacidad (migration 0016): si es privado, requiere contraseña (min 8) y
  // guardamos el bcrypt; si es abierto, password_hash queda null.
  const isPrivate = parsed.data.is_private;
  let passwordHash: string | null = null;
  if (isPrivate) {
    if (!parsed.data.password) {
      return NextResponse.json(
        {
          error: "password_required",
          message:
            "Un proyecto privado necesita una contraseña (mínimo 8 caracteres)",
        },
        { status: 400 },
      );
    }
    passwordHash = await bcrypt.hash(parsed.data.password, 10);
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
      is_private: isPrivate,
      password_hash: passwordHash,
      created_by: guard.userId,
    })
    // Nunca devolver password_hash al cliente.
    .select(
      "id, name, slug, description, icon, is_active, is_private, gate_version, created_by, created_at, updated_at",
    )
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
