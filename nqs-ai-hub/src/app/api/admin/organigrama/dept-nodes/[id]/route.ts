/**
 * PATCH  /api/admin/organigrama/dept-nodes/[id]  — edita una caja de área.
 * DELETE /api/admin/organigrama/dept-nodes/[id]  — la borra (los reportes que
 *   colgaban se recalculan solos en el layout). Admin-only.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/auth/admin-guard";
import { createServerClient } from "@/lib/db/supabase";
import { updateDeptNode, deleteDeptNode } from "@/lib/db/queries/org";

type RouteContext = { params: Promise<{ id: string }> };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PatchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  department: z.string().max(40).nullable().optional(),
  parent_person_id: z.string().uuid().nullable().optional(),
  accent: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "accent debe ser un color hex #rrggbb")
    .nullable()
    .optional(),
  sort_order: z.number().int().min(0).max(9999).nullable().optional(),
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
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_request", message: parsed.error.issues[0].message },
      { status: 400 },
    );
  }

  if (parsed.data.parent_person_id) {
    const db = createServerClient();
    const { data: parent } = await db
      .from("users")
      .select("id")
      .eq("id", parsed.data.parent_person_id)
      .maybeSingle();
    if (!parent) {
      return NextResponse.json(
        { error: "parent_not_found", message: "La persona padre no existe" },
        { status: 400 },
      );
    }
  }

  try {
    const node = await updateDeptNode(id, {
      name: parsed.data.name,
      department: parsed.data.department,
      parentPersonId: parsed.data.parent_person_id,
      accent: parsed.data.accent,
      sortOrder: parsed.data.sort_order,
    });
    if (!node) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ node });
  } catch (e) {
    return NextResponse.json(
      { error: "db_error", message: e instanceof Error ? e.message : "error" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const guard = await requireAdminApi();
  if (guard instanceof NextResponse) return guard;

  const { id } = await context.params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  try {
    await deleteDeptNode(id);
  } catch (e) {
    return NextResponse.json(
      { error: "db_error", message: e instanceof Error ? e.message : "error" },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
