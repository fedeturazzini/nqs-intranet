/**
 * GET /api/me/access
 *
 * Catálogo de tools con estado de acceso del usuario actual.
 * Útil para Client Components que necesiten refrescar el estado sin
 * recargar la página (ej. después de "solicitar acceso" cuando exista
 * el módulo de aprobaciones).
 *
 * El render server-side del Hub NO usa este endpoint — llama a
 * `listToolsWithAccess()` directo desde la page para evitar el round-trip.
 */
import { NextResponse } from "next/server";
import { listToolsWithAccess } from "@/lib/db/queries/access";
import { getSession } from "@/lib/auth/server";

export async function GET(): Promise<NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const tools = await listToolsWithAccess(session.userId);
  return NextResponse.json({ tools });
}
