/**
 * POST /api/admin/organigrama/reset-all
 *
 * Borra TODOS los overrides de posición (users + cajas) → todo el organigrama
 * vuelve al layout automático. Destructivo (se pierde el acomodo manual): la
 * confirmación la pide la UI. Admin-only.
 */
import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/admin-guard";
import { resetAllPositions } from "@/lib/db/queries/org";

export async function POST(): Promise<NextResponse> {
  const guard = await requireAdminApi();
  if (guard instanceof NextResponse) return guard;

  try {
    await resetAllPositions();
  } catch (e) {
    return NextResponse.json(
      { error: "db_error", message: e instanceof Error ? e.message : "error" },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
