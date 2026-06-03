/**
 * PATCH /api/admin/users/[id]/org
 *
 * Actualiza los datos de organigrama de un user: is_in_org, reports_to_id,
 * org_role, org_position.
 *
 * Validaciones:
 *   - reports_to_id (si viene) debe existir y tener is_in_org=true.
 *   - no crear ciclos (A reporta a B, B reporta a A, …).
 *   - no puede reportarse a sí mismo.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/auth/admin-guard";
import { createServerClient } from "@/lib/db/supabase";
import { wouldCreateCycle } from "@/lib/db/queries/org";
import type { Database } from "@/types/db";

type UserUpdate = Database["public"]["Tables"]["users"]["Update"];

type RouteContext = { params: Promise<{ id: string }> };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const BodySchema = z.object({
  is_in_org: z.boolean().optional(),
  reports_to_id: z.string().uuid().nullable().optional(),
  org_role: z.string().max(120).nullable().optional(),
  org_position: z.number().int().min(0).max(9999).nullable().optional(),
});

export async function PATCH(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const guard = await requireAdminApi();
  if (guard instanceof NextResponse) return guard;

  const { id } = await context.params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
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

  const db = createServerClient();

  // Validación del jefe (si se está seteando reports_to_id no-null).
  const reportsTo = parsed.data.reports_to_id;
  if (reportsTo) {
    if (reportsTo === id) {
      return NextResponse.json(
        { error: "self_report", message: "Un user no puede reportarse a sí mismo" },
        { status: 400 },
      );
    }
    const { data: boss } = await db
      .from("users")
      .select("id, is_in_org")
      .eq("id", reportsTo)
      .maybeSingle();
    if (!boss) {
      return NextResponse.json(
        { error: "boss_not_found", message: "El jefe seleccionado no existe" },
        { status: 404 },
      );
    }
    if (!boss.is_in_org) {
      return NextResponse.json(
        {
          error: "boss_not_in_org",
          message: "El jefe tiene que estar en el organigrama",
        },
        { status: 400 },
      );
    }
    if (await wouldCreateCycle(id, reportsTo)) {
      return NextResponse.json(
        {
          error: "cycle",
          message: "Esa relación crearía un ciclo en la jerarquía",
        },
        { status: 400 },
      );
    }
  }

  // Solo seteamos los campos que vinieron.
  const patch: UserUpdate = { updated_at: new Date().toISOString() };
  if (parsed.data.is_in_org !== undefined) patch.is_in_org = parsed.data.is_in_org;
  if (parsed.data.reports_to_id !== undefined)
    patch.reports_to_id = parsed.data.reports_to_id;
  if (parsed.data.org_role !== undefined) patch.org_role = parsed.data.org_role;
  if (parsed.data.org_position !== undefined)
    patch.org_position = parsed.data.org_position;

  const { data, error } = await db
    .from("users")
    .update(patch)
    .eq("id", id)
    .select("id, name, is_in_org, reports_to_id, org_role, org_position")
    .single();

  if (error) {
    return NextResponse.json(
      { error: "db_error", message: error.message },
      { status: 500 },
    );
  }
  return NextResponse.json({ user: data });
}
