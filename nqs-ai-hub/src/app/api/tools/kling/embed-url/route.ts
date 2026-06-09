/**
 * GET /api/tools/kling/embed-url
 *
 * Valida que el user pueda entrar al módulo Kling AHORA (tool_access +
 * schedule + créditos) y devuelve la URL del iframe. Clon de 3DSky.
 */
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/server";
import { canUseTool } from "@/lib/middleware/permissions";
import { getAdapter } from "@/lib/adapters";

export async function GET(): Promise<NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const perm = await canUseTool(session.userId, "kling");
  if (!perm.allowed) {
    return NextResponse.json(
      { error: perm.reason, message: perm.message ?? null },
      { status: 403 },
    );
  }

  const adapter = getAdapter("kling");
  if (!adapter.getEmbedUrl) {
    return NextResponse.json({ error: "not_implemented" }, { status: 501 });
  }
  const url = await adapter.getEmbedUrl(session.userId);
  return NextResponse.json({ url });
}
