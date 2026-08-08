/**
 * POST /api/auth/logout
 *
 * Limpia cookies de sesión, gate de proyectos privados y gate de Gastos.
 * No invalida el JWT en Supabase porque los access tokens son por naturaleza
 * válidos hasta su exp — para revocar habría que llamar a
 * `auth.admin.signOut(token)`, lo dejamos como TODO.
 */
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
} from "@/lib/auth/server";
import { clearAllProjectGateCookies } from "@/lib/auth/project-gate";
import { clearGastosGateCookie } from "@/lib/auth/gastos-gate";

export async function POST(): Promise<NextResponse> {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(ACCESS_TOKEN_COOKIE);
  response.cookies.delete(REFRESH_TOKEN_COOKIE);

  // Unlock de proyecto privado / Gastos no debe sobrevivir al logout.
  const store = await cookies();
  clearAllProjectGateCookies(response, store.getAll());
  clearGastosGateCookie(response);

  return response;
}
