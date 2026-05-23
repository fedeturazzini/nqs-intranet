/**
 * POST /api/auth/logout
 *
 * Limpia cookies de sesión. No invalida el JWT en Supabase porque los
 * access tokens son por naturaleza válidos hasta su exp — para revocar
 * habría que llamar a `auth.admin.signOut(token)`, lo dejamos como TODO.
 */
import { NextResponse } from "next/server";
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
} from "@/lib/auth/server";

export async function POST(): Promise<NextResponse> {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(ACCESS_TOKEN_COOKIE);
  response.cookies.delete(REFRESH_TOKEN_COOKIE);
  return response;
}
