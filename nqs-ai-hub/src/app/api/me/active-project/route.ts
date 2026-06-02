/**
 * /api/me/active-project
 *
 * GET  → proyecto activo del user (o null si todavía no eligió).
 * POST → cambiar el proyecto activo. Body: { project_id }.
 *
 * Valida que el project exista y esté activo antes de setearlo.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/server";
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

  await setActiveProject(session.userId, project.id);
  return NextResponse.json({ ok: true, project });
}
