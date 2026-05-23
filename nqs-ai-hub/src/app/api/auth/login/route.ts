/**
 * POST /api/auth/login
 *
 * Body: { email: string, password: string }
 * Response: { ok: true, redirect: "/hub" | "/admin", user: { name, role } }
 *          | { ok: false, error: "credenciales inválidas" }
 *
 * - Usa el cliente ANON (no service_role) para `signInWithPassword`.
 * - Setea cookies httpOnly `sb-access-token` y `sb-refresh-token`.
 * - El mensaje de error es genérico — no decimos si el email no existe
 *   vs. password incorrecta (no enumeration).
 * - El redirect se computa server-side leyendo `public.users.role` por
 *   el id del user que devolvió Supabase Auth.
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
} from "@/lib/auth/server";
import { createServerClient } from "@/lib/db/supabase";
import type { Database } from "@/types/db";

const ONE_WEEK_SECONDS = 60 * 60 * 24 * 7;
const GENERIC_ERROR = "credenciales inválidas";

type LoginBody = { email?: unknown; password?: unknown };

function parseBody(raw: unknown): { email: string; password: string } | null {
  if (!raw || typeof raw !== "object") return null;
  const { email, password } = raw as LoginBody;
  if (typeof email !== "string" || typeof password !== "string") return null;
  if (!email.trim() || !password) return null;
  return { email: email.trim().toLowerCase(), password };
}

export async function POST(request: Request): Promise<NextResponse> {
  let parsed: { email: string; password: string } | null = null;
  try {
    parsed = parseBody(await request.json());
  } catch {
    parsed = null;
  }

  if (!parsed) {
    return NextResponse.json(
      { ok: false, error: GENERIC_ERROR },
      { status: 400 },
    );
  }

  // Cliente ANON sólo para autenticar — no toca tablas, así que no
  // necesita service_role.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return NextResponse.json(
      { ok: false, error: "server misconfigured" },
      { status: 500 },
    );
  }

  const authClient = createClient<Database>(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await authClient.auth.signInWithPassword({
    email: parsed.email,
    password: parsed.password,
  });

  if (error || !data.session || !data.user) {
    return NextResponse.json(
      { ok: false, error: GENERIC_ERROR },
      { status: 401 },
    );
  }

  // Resolvemos rol contra public.users (no confiamos en metadata).
  const db = createServerClient();
  const { data: profile, error: profErr } = await db
    .from("users")
    .select("name, role, is_active")
    .eq("id", data.user.id)
    .maybeSingle();

  if (profErr || !profile) {
    // El user existe en auth pero no en public.users — estado inconsistente.
    return NextResponse.json(
      { ok: false, error: "perfil no encontrado, contactá al admin" },
      { status: 403 },
    );
  }

  if (!profile.is_active) {
    return NextResponse.json(
      { ok: false, error: "usuario deshabilitado" },
      { status: 403 },
    );
  }

  const redirectTo = profile.role === "admin" ? "/admin" : "/hub";
  const isProd = process.env.NODE_ENV === "production";

  const response = NextResponse.json({
    ok: true,
    redirect: redirectTo,
    user: { name: profile.name, role: profile.role },
  });

  response.cookies.set(ACCESS_TOKEN_COOKIE, data.session.access_token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: ONE_WEEK_SECONDS,
  });
  response.cookies.set(REFRESH_TOKEN_COOKIE, data.session.refresh_token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: ONE_WEEK_SECONDS,
  });

  return response;
}
