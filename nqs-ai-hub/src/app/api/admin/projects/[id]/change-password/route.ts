/**
 * POST /api/admin/projects/[id]/change-password
 *
 * Resetea la contraseña de un proyecto PRIVADO (migration 0016). Solo admin.
 * Body: { new_password }. NO pide la anterior — decisión de diseño: es el
 * mecanismo de recuperación ("privado protege del equipo, no de los admins").
 *
 * Re-hashea (bcrypt, rounds 10) y hace gate_version++ para INVALIDAR todos los
 * gates vigentes (quien ya estaba adentro tendrá que re-ingresar con la nueva).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { requireAdminApi } from "@/lib/auth/admin-guard";
import { createServerClient } from "@/lib/db/supabase";
import { getProjectGateFields } from "@/lib/db/queries/projects";
import { logToolUsage } from "@/lib/adapters/utils";

type RouteContext = { params: Promise<{ id: string }> };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const BodySchema = z.object({ new_password: z.string().min(8).max(200) });

export async function POST(
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

  const fields = await getProjectGateFields(id);
  if (!fields) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (!fields.is_private) {
    return NextResponse.json(
      { error: "not_private", message: "El proyecto no es privado" },
      { status: 400 },
    );
  }

  const db = createServerClient();
  const newHash = await bcrypt.hash(parsed.data.new_password, 10);
  const { error: updErr } = await db
    .from("projects")
    .update({
      password_hash: newHash,
      gate_version: fields.gate_version + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (updErr) {
    return NextResponse.json(
      { error: "db_error", message: updErr.message },
      { status: 500 },
    );
  }

  await logToolUsage({
    userId: guard.userId,
    toolId: "claude",
    action: "admin.project.password_change",
    metadata: { projectId: id, by: guard.name },
  });

  return NextResponse.json({ success: true });
}
