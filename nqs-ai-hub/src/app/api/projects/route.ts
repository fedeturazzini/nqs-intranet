/**
 * GET /api/projects
 *
 * Lista de proyectos ACTIVOS del estudio (para cualquier user logueado).
 */
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/server";
import { listActiveProjects } from "@/lib/db/queries/projects";

export async function GET(): Promise<NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const projects = await listActiveProjects();
  return NextResponse.json({ projects });
}
