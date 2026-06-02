/**
 * POST /api/admin/brain/change-password
 *
 * Body: { current_password, new_password }
 * Valida la actual contra el hash, hashea la nueva y actualiza brain_config.
 * Loguea en usage_logs con action 'admin.brain.password_change'.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { requireAdminApi } from "@/lib/auth/admin-guard";
import { createServerClient } from "@/lib/db/supabase";
import { logToolUsage } from "@/lib/adapters/utils";

const BodySchema = z.object({
  current_password: z.string().min(1).max(200),
  new_password: z.string().min(6).max(200),
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
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_request", message: parsed.error.issues[0].message },
      { status: 400 },
    );
  }

  const db = createServerClient();
  const { data: config } = await db
    .from("brain_config")
    .select("id, password_hash")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!config) {
    return NextResponse.json({ error: "not_configured" }, { status: 500 });
  }

  const ok = await bcrypt.compare(
    parsed.data.current_password,
    config.password_hash,
  );
  if (!ok) {
    return NextResponse.json(
      { error: "wrong_password", message: "La contraseña actual no es correcta" },
      { status: 401 },
    );
  }

  const newHash = await bcrypt.hash(parsed.data.new_password, 10);
  const { error: updErr } = await db
    .from("brain_config")
    .update({
      password_hash: newHash,
      updated_by: guard.userId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", config.id);

  if (updErr) {
    return NextResponse.json(
      { error: "db_error", message: updErr.message },
      { status: 500 },
    );
  }

  await logToolUsage({
    userId: guard.userId,
    toolId: "claude",
    action: "admin.brain.password_change",
    metadata: { by: guard.name },
  });

  return NextResponse.json({ success: true });
}
