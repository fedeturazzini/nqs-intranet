/**
 * GET /api/organigrama/layout
 *
 * Organigrama híbrido calculado (etapa 1): nodos con posición/tamaño/color/
 * teamCount + edges, listo para el canvas de la etapa 2. La posición es
 * calculada (tidy-tree) salvo override manual org_x/org_y. Para cualquier user
 * logueado (read-only). No reemplaza a GET /api/organigrama (el clásico sigue).
 */
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/server";
import { getOrgLayoutData } from "@/lib/db/queries/org";
import { computeOrgLayout } from "@/lib/org/layout";

export async function GET(): Promise<NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { persons, deptNodes } = await getOrgLayoutData();
  const layout = computeOrgLayout(persons, deptNodes);
  return NextResponse.json(layout);
}
