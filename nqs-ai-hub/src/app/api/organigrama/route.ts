/**
 * GET /api/organigrama
 *
 * Estructura del organigrama (nodos con is_in_org=true). Para cualquier
 * user logueado (read-only).
 */
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/server";
import { getOrgNodes } from "@/lib/db/queries/org";

export async function GET(): Promise<NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const nodes = await getOrgNodes();
  return NextResponse.json({ nodes });
}
