/**
 * POST /api/me/change-password
 *
 * Body: { current_password, new_password }
 * Valida la actual re-autenticando con el cliente anon
 * (signInWithPassword) y, si OK, actualiza la password vía admin API.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { getSession } from "@/lib/auth/server";
import { createServerClient } from "@/lib/db/supabase";
import type { Database } from "@/types/db";

const BodySchema = z.object({
  current_password: z.string().min(1).max(200),
  new_password: z.string().min(8).max(200),
});

export async function POST(request: Request): Promise<NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
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

  // 1) Validar la password ACTUAL re-autenticando con el cliente anon.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return NextResponse.json({ error: "server_misconfigured" }, { status: 500 });
  }
  const authClient = createClient<Database>(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: signInErr } = await authClient.auth.signInWithPassword({
    email: session.email,
    password: parsed.data.current_password,
  });
  if (signInErr) {
    return NextResponse.json(
      { error: "wrong_password", message: "La contraseña actual no es correcta" },
      { status: 401 },
    );
  }

  // 2) Actualizar la password vía admin API (service_role).
  const db = createServerClient();
  const { error: updErr } = await db.auth.admin.updateUserById(session.userId, {
    password: parsed.data.new_password,
  });
  if (updErr) {
    return NextResponse.json(
      { error: "update_failed", message: updErr.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}
