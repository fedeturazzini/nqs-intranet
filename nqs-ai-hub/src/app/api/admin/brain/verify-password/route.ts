/**
 * POST /api/admin/brain/verify-password
 *
 * Body: { password }
 * Compara con bcrypt contra brain_config.password_hash. Si coincide, setea
 * la cookie httpOnly `brain_session` (30 min) y devuelve { success: true }.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { requireAdminApi } from "@/lib/auth/admin-guard";
import { createServerClient } from "@/lib/db/supabase";
import { BRAIN_COOKIE, BRAIN_TTL_SECONDS, mintBrainToken } from "@/lib/auth/brain";

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
    .from("brain_config")
    .select("password_hash")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!config) {
    return NextResponse.json(
      { error: "not_configured", message: "El Brain no tiene password seteada" },
      { status: 500 },
    );
  }

  const ok = await bcrypt.compare(parsed.data.password, config.password_hash);
  if (!ok) {
    return NextResponse.json({ success: false }, { status: 401 });
  }

  const isProd = process.env.NODE_ENV === "production";
  const res = NextResponse.json({ success: true });
  res.cookies.set(BRAIN_COOKIE, mintBrainToken(), {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: BRAIN_TTL_SECONDS,
  });
  return res;
}
