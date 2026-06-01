/**
 * PATCH /api/admin/tools/access
 *
 * Body: { userId, toolId, status: "active" | "locked" }
 *
 * Toggle on/off del acceso de un user a una tool. Si no existe row en
 * `tool_access`, la crea con `granted_by = admin actual`.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/auth/admin-guard";
import { createServerClient } from "@/lib/db/supabase";

const AccessSchema = z.object({
  userId: z.string().uuid(),
  toolId: z.string().min(1),
  status: z.enum(["active", "locked"]),
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
  const parsed = AccessSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_request", message: parsed.error.issues[0].message },
      { status: 400 },
    );
  }
  const { userId, toolId, status } = parsed.data;

  const db = createServerClient();
  const { error } = await db
    .from("tool_access")
    .upsert(
      {
        user_id: userId,
        tool_id: toolId,
        status,
        granted_by: guard.userId,
        // El toggle del panel otorga/revoca acceso PERMANENTE. Limpiamos
        // `expires_at` para no arrastrar un vencimiento viejo de una
        // aprobación temporal (quick access / excepcional): si no, el user
        // queda `active` pero con expires_at vencido → canUseTool lo trata
        // como `expired` y no puede entrar. Los accesos con vencimiento
        // sólo se setean desde el flujo de aprobación de solicitudes.
        expires_at: null,
      },
      { onConflict: "user_id,tool_id" },
    );
  if (error) {
    return NextResponse.json(
      { error: "db_error", message: error.message },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
