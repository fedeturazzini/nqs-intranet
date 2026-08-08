/**
 * POST /api/admin/gastos/change-password
 *
 * Body: { current_password, new_password }
 * Valida la actual, hashea la nueva, gate_version++ (invalida cookies),
 * loguea admin.gastos.password_change.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { requireAdminApi } from "@/lib/auth/admin-guard";
import { createServerClient } from "@/lib/db/supabase";
import { logToolUsage } from "@/lib/adapters/utils";
import {
  GASTOS_GATE_COOKIE,
  GASTOS_GATE_TTL_SECONDS,
  gastosGateCookieOptions,
  mintGastosGateToken,
} from "@/lib/auth/gastos-gate";

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
    .from("gastos_gate_config")
    .select("id, password_hash, gate_version")
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
      {
        error: "wrong_password",
        message: "La contraseña actual no es correcta",
      },
      { status: 401 },
    );
  }

  const newHash = await bcrypt.hash(parsed.data.new_password, 10);
  const nextVersion = config.gate_version + 1;
  const { error: updErr } = await db
    .from("gastos_gate_config")
    .update({
      password_hash: newHash,
      gate_version: nextVersion,
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
    action: "admin.gastos.password_change",
    metadata: { by: guard.name },
  });

  // Renovar cookie del admin que cambió la clave (sigue dentro).
  const res = NextResponse.json({ success: true });
  res.cookies.set(
    GASTOS_GATE_COOKIE,
    mintGastosGateToken(nextVersion),
    gastosGateCookieOptions(GASTOS_GATE_TTL_SECONDS),
  );
  return res;
}
