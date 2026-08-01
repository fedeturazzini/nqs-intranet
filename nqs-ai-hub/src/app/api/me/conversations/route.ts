/**
 * GET /api/me/conversations
 *
 * Devuelve las últimas 20 conversaciones del user actual ordenadas
 * por `updated_at desc`. Sin paginación en MVP — si una persona pasa
 * 20 conversaciones es momento de agregar cursor.
 */
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/server";
import { listConversationsForProject } from "@/lib/db/queries/conversations";
import { getActiveProjectForUser } from "@/lib/db/queries/projects";
import { hasProjectGate } from "@/lib/auth/project-gate";

export async function GET(): Promise<NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // FIX 17.5: el historial se filtra por el proyecto activo del user. Sin
  // proyecto activo, no hay conversaciones que mostrar.
  const activeProject = await getActiveProjectForUser(session.userId);
  if (!activeProject) {
    return NextResponse.json({ conversations: [] });
  }

  // Gate de proyecto privado (migration 0016): sin cookie de gate válida no
  // listamos las conversaciones del proyecto (defensa server-side, no solo UI).
  if (
    !(await hasProjectGate(activeProject.id, {
      is_private: activeProject.is_private,
      gate_version: activeProject.gate_version,
    }))
  ) {
    return NextResponse.json({ conversations: [] });
  }

  try {
    const conversations = await listConversationsForProject(
      session.userId,
      activeProject.id,
    );
    return NextResponse.json({ conversations });
  } catch (error) {
    return NextResponse.json(
      {
        error: "db_error",
        message: error instanceof Error ? error.message : "error desconocido",
      },
      { status: 500 },
    );
  }
}
