/**
 * GET /api/auth/session
 *
 * Útil para Client Components que necesitan saber si hay sesión sin
 * tener que esperar a un Server Component (ej. navbar reactiva).
 */
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/server";

export async function GET(): Promise<NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ session: null });
  }
  // No exponemos userId al cliente — alcanza con name + role.
  return NextResponse.json({
    session: {
      email: session.email,
      name: session.name,
      role: session.role,
    },
  });
}
