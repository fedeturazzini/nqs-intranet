/**
 * /api/me/active-project
 *
 * GET  → proyecto activo del user (o null si todavía no eligió).
 * POST → cambiar el proyecto activo. Body: { project_id }.
 *
 * Valida que el project exista y esté activo antes de setearlo.
 * Si el destino es privado, exige cookie de gate válida.
 * Las cookies de gate son por proyecto y pueden coexistir: no se limpia la
 * anterior al cambiar, porque otra pestaña puede seguir usando ese proyecto.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/server";
import { hasProjectGate } from "@/lib/auth/project-gate";
import {
  getActiveProjectForUser,
  getProjectById,
  setActiveProject,
} from "@/lib/db/queries/projects";

export async function GET(): Promise<NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const project = await getActiveProjectForUser(session.userId);
  return NextResponse.json({ project });
}

const BodySchema = z.object({ project_id: z.string().uuid() });

export async function POST(request: Request): Promise<NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_request", message: parsed.error.issues[0].message },
      { status: 400 },
    );
  }

  const project = await getProjectById(parsed.data.project_id);
  if (!project || !project.is_active) {
    return NextResponse.json(
      { error: "project_not_available" },
      { status: 404 },
    );
  }

  if (project.is_private && !(await hasProjectGate(project.id))) {
    return NextResponse.json(
      {
        error: "project_locked",
        message: "Este proyecto es privado. Ingresá la contraseña para usarlo.",
      },
      { status: 403 },
    );
  }

  await setActiveProject(session.userId, project.id);

  // No invalidamos cookies pg_* anteriores: son project-scoped, expiran a los
  // 15 min y logout/gate_version las revocan. Esto permite tabs privadas en
  // paralelo sin que el último switch bloquee a las demás.
  return NextResponse.json({ ok: true, project });
}
