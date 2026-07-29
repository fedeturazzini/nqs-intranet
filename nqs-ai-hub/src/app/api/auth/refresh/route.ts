/**
 * POST /api/auth/refresh
 *
 * Refresca la sesión usando el `sb-refresh-token` (httpOnly) y ROTA ambas
 * cookies. Lo llama el cliente cuando una request protegida devuelve 401 por
 * JWT vencido (ver `useClaudeChat`): refresca en silencio y reintenta una vez.
 *
 * - Usa el cliente ANON (mismo patrón que /api/auth/login) para `refreshSession`.
 * - Supabase ROTA el refresh token en cada uso → guardamos SIEMPRE el que
 *   devuelve la llamada (`data.session.refresh_token`), no el viejo.
 * - Si el refresh falla (token vencido/revocado): limpiamos ambas cookies y
 *   devolvemos 401, para forzar un re-login limpio.
 * - CSRF: las cookies son `sameSite=lax` → un POST cross-site no las manda, así
 *   que el endpoint no necesita token anti-CSRF. No lleva body.
 *
 * Fix de fondo (proactivo en el proxy / @supabase/ssr) queda aparte.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from "@/lib/auth/server";
import type { Database } from "@/types/db";
import { decodeJwtExpMs } from "@/lib/auth/jwt";
import { logWarn } from "@/lib/log";

// Mismo maxAge que /api/auth/login (la cookie vive 7 días; el JWT adentro ~1h).
// TODO: dedupe de las opciones de cookie con login en un helper compartido.
const ONE_WEEK_SECONDS = 60 * 60 * 24 * 7;

/** Respuesta que borra ambas cookies de sesión (fuerza re-login limpio). */
function clearedSession(error: string): NextResponse {
  const res = NextResponse.json({ error }, { status: 401 });
  res.cookies.delete(ACCESS_TOKEN_COOKIE);
  res.cookies.delete(REFRESH_TOKEN_COOKIE);
  return res;
}

export async function POST(): Promise<NextResponse> {
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get(REFRESH_TOKEN_COOKIE)?.value;

  // Sin refresh token no hay nada que canjear → sesión muerta.
  if (!refreshToken) {
    logWarn("refresh: sin refresh token", {
      route: "auth/refresh",
      status: 401,
      reason: "no_refresh_token",
    });
    return clearedSession("no_refresh_token");
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return NextResponse.json({ error: "server misconfigured" }, { status: 500 });
  }

  const authClient = createClient<Database>(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await authClient.auth.refreshSession({
    refresh_token: refreshToken,
  });

  // Refresh token inválido/vencido/ya rotado → limpiar y forzar re-login.
  if (error || !data.session) {
    logWarn("refresh falló (token muerto/rotado)", {
      route: "auth/refresh",
      status: 401,
      reason: "refresh_failed",
      err: error ?? undefined,
    });
    return clearedSession("refresh_failed");
  }

  const isProd = process.env.NODE_ENV === "production";
  // expiresAt del NUEVO token → el cliente (SessionKeepAlive) reprograma el
  // próximo refresh con el exp real, sin hardcodear la 1h.
  const res = NextResponse.json({
    ok: true,
    expiresAt: decodeJwtExpMs(data.session.access_token),
  });

  // Re-seteamos AMBAS con los tokens NUEVOS, mismas opciones que el login.
  const cookieOpts = {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax" as const,
    path: "/",
    maxAge: ONE_WEEK_SECONDS,
  };
  res.cookies.set(ACCESS_TOKEN_COOKIE, data.session.access_token, cookieOpts);
  res.cookies.set(REFRESH_TOKEN_COOKIE, data.session.refresh_token, cookieOpts);

  return res;
}
