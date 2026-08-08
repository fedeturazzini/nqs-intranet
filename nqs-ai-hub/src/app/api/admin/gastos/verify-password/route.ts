/**
 * POST /api/admin/gastos/verify-password
 *
 * Body: { password }
 * Compara con bcrypt contra gastos_gate_config.password_hash. Si coincide,
 * setea la cookie httpOnly `gastos_gate` (30 min, con gate_version) y
 * devuelve { success: true }.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { requireAdminApi } from "@/lib/auth/admin-guard";
import { createServerClient } from "@/lib/db/supabase";
import {
  GASTOS_GATE_COOKIE,
  GASTOS_GATE_TTL_SECONDS,
  gastosGateCookieOptions,
  mintGastosGateToken,
} from "@/lib/auth/gastos-gate";

const BodySchema = z.object({ password: z.string().min(1).max(200) });

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
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const db = createServerClient();
  const { data: config } = await db
    .from("gastos_gate_config")
    .select("password_hash, gate_version")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!config) {
    return NextResponse.json(
      {
        error: "not_configured",
        message: "Gastos no tiene password seteada",
      },
      { status: 500 },
    );
  }

  const ok = await bcrypt.compare(parsed.data.password, config.password_hash);
  if (!ok) {
    return NextResponse.json({ success: false }, { status: 401 });
  }

  const res = NextResponse.json({ success: true });
  res.cookies.set(
    GASTOS_GATE_COOKIE,
    mintGastosGateToken(config.gate_version),
    gastosGateCookieOptions(GASTOS_GATE_TTL_SECONDS),
  );
  return res;
}
