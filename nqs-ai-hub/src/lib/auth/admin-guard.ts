/**
 * Helper para endpoints `/api/admin/*`. Si el caller no es admin,
 * devuelve un `NextResponse` listo para retornar; si es admin, devuelve
 * la sesión.
 *
 *   const guard = await requireAdminApi();
 *   if (guard instanceof NextResponse) return guard;
 *   // guard.userId, guard.name, etc. disponibles
 */
import { NextResponse } from "next/server";
import { getSession, type Session } from "./server";

export async function requireAdminApi(): Promise<Session | NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (session.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return session;
}
