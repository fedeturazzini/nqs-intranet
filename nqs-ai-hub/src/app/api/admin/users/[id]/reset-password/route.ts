/**
 * POST /api/admin/users/[id]/reset-password
 *
 * Genera una password random, la setea en Supabase Auth (admin API) y la
 * devuelve UNA sola vez. NO se loguea ni se guarda en otro lado.
 * Registra la acción en usage_logs (admin.user.password_reset).
 */
import { NextResponse } from "next/server";
import crypto from "crypto";
import { requireAdminApi } from "@/lib/auth/admin-guard";
import { createServerClient } from "@/lib/db/supabase";
import { logToolUsage } from "@/lib/adapters/utils";

type RouteContext = { params: Promise<{ id: string }> };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Sin caracteres ambiguos (0/O, 1/l/I) para que sea fácil de dictar.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

function generatePassword(len = 12): string {
  const bytes = crypto.randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

export async function POST(
  _request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const guard = await requireAdminApi();
  if (guard instanceof NextResponse) return guard;

  const { id } = await context.params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const db = createServerClient();
  const newPassword = generatePassword(12);

  const { error } = await db.auth.admin.updateUserById(id, {
    password: newPassword,
  });
  if (error) {
    return NextResponse.json(
      { error: "reset_failed", message: error.message },
      { status: 500 },
    );
  }

  await logToolUsage({
    userId: guard.userId,
    toolId: "claude",
    action: "admin.user.password_reset",
    metadata: { targetUserId: id, by: guard.name },
  });

  // La password se devuelve UNA vez; no la persistimos en ningún lado.
  return NextResponse.json({ newPassword });
}
