/**
 * Auth helpers — server-only.
 *
 * Flujo:
 *   1. El usuario se loguea → POST /api/auth/login setea cookies
 *      `sb-access-token` y `sb-refresh-token` (httpOnly).
 *   2. Cualquier Server Component / API Route que requiera sesión llama
 *      a `getSession()`, que:
 *        - Lee el access token de cookies.
 *        - Lo valida contra Supabase con `auth.getUser(token)` (firma JWT
 *          + expiración + revocación).
 *        - Cruza el user.id contra `public.users` para resolver el rol.
 *   3. `requireAuth()` / `requireAdmin()` redirigen si no hay sesión o
 *      el rol no alcanza.
 *
 * El resultado se cachea por request con `cache()` para no pegarle a
 * Supabase varias veces en el mismo render.
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createServerClient } from "@/lib/db/supabase";
import type { UserRole } from "@/types/db-aliases";

export const ACCESS_TOKEN_COOKIE = "sb-access-token";
export const REFRESH_TOKEN_COOKIE = "sb-refresh-token";

export type Session = {
  userId: string;
  email: string;
  name: string;
  role: UserRole;
};

/**
 * Devuelve la sesión actual o null. Cacheado por request.
 *
 * No tira excepciones: si el token expiró o no existe, devuelve null.
 * Las redirecciones las hacen los `requireX()` de arriba.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;
  if (!accessToken) return null;

  const db = createServerClient();
  const { data: userData, error: userErr } = await db.auth.getUser(accessToken);
  if (userErr || !userData.user) return null;

  const { data: profile, error: profErr } = await db
    .from("users")
    .select("id, email, name, role")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (profErr || !profile) return null;

  return {
    userId: profile.id,
    email: profile.email,
    name: profile.name,
    role: profile.role,
  };
});

/**
 * Redirige a /login si no hay sesión válida. Devuelve la sesión cuando
 * la hay (con narrowing del tipo).
 */
export async function requireAuth(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

/**
 * Redirige a /hub si la sesión no es admin. Devuelve la sesión admin.
 */
export async function requireAdmin(): Promise<Session> {
  const session = await requireAuth();
  if (session.role !== "admin") redirect("/hub");
  return session;
}
