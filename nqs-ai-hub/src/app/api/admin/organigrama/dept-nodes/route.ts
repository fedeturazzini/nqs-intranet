/**
 * POST /api/admin/organigrama/dept-nodes
 *
 * Crea una caja de área (org_dept_nodes). Admin-only.
 *   body: { name, department?, parent_person_id?, accent?, sort_order? }
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/auth/admin-guard";
import { createServerClient } from "@/lib/db/supabase";
import { createDeptNode } from "@/lib/db/queries/org";

const CreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  department: z.string().max(40).nullable().optional(),
  parent_person_id: z.string().uuid().nullable().optional(),
  accent: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "accent debe ser un color hex #rrggbb")
    .nullable()
    .optional(),
  sort_order: z.number().int().min(0).max(9999).nullable().optional(),
});

export async function POST(request: Request): Promise<NextResponse> {
  const guard = await requireAdminApi();
  if (guard instanceof NextResponse) return guard;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_request", message: parsed.error.issues[0].message },
      { status: 400 },
    );
  }

  const { name, department, parent_person_id, accent, sort_order } = parsed.data;

  // El padre (si viene) tiene que existir.
  if (parent_person_id) {
    const db = createServerClient();
    const { data: parent } = await db
      .from("users")
      .select("id")
      .eq("id", parent_person_id)
      .maybeSingle();
    if (!parent) {
      return NextResponse.json(
        { error: "parent_not_found", message: "La persona padre no existe" },
        { status: 400 },
      );
    }
  }

  try {
    const node = await createDeptNode({
      name,
      department: department ?? null,
      parentPersonId: parent_person_id ?? null,
      accent: accent ?? null,
      sortOrder: sort_order ?? null,
    });
    return NextResponse.json({ node });
  } catch (e) {
    return NextResponse.json(
      { error: "db_error", message: e instanceof Error ? e.message : "error" },
      { status: 500 },
    );
  }
}
