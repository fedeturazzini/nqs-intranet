/**
 * `/` — root.
 *
 * Reglas:
 *   - sin sesión → /login
 *   - sesión employee → /hub
 *   - sesión admin → /admin
 *
 * El proxy ya redirige anónimos a /login para todas las rutas privadas,
 * pero este Server Component evita ese hop extra cuando entran a `/`
 * estando logueados.
 */
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export default async function HomePage(): Promise<never> {
  const session = await getSession();
  if (!session) redirect("/login");
  redirect(session.role === "admin" ? "/admin" : "/hub");
}
