/**
 * PATCH /api/admin/organigrama/position
 *
 * Fija (o resetea) el override de posición de un nodo del organigrama.
 *   body: { type: "person"|"dept", id: uuid, x: int|null, y: int|null }
 * x/y ambos null = volver al layout automático. Admin-only.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/auth/admin-guard";
import { setNodePosition } from "@/lib/db/queries/org";

const BodySchema = z
  .object({
    type: z.enum(["person", "dept"]),
    id: z.string().uuid(),
    x: z.number().int().min(-100000).max(100000).nullable(),
    y: z.number().int().min(-100000).max(100000).nullable(),
  })
  .refine((d) => (d.x === null) === (d.y === null), {
    message: "x e y deben ser ambos null o ambos número",
  });

export async function PATCH(request: Request): Promise<NextResponse> {
  const guard = await requireAdminApi();
  if (guard instanceof NextResponse) return guard;

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

  const { type, id, x, y } = parsed.data;
  try {
    await setNodePosition(type, id, x, y);
  } catch (e) {
    return NextResponse.json(
      { error: "db_error", message: e instanceof Error ? e.message : "error" },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
