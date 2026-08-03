/**
 * PATCH /api/admin/tools/access
 *
 * Body: {
 *   userId,
 *   toolId,
 *   status: "active" | "locked",
 *   duration_minutes?: number,     // acceso temporal
 *   custom_expires_at?: string|null // ISO futuro, o null = permanente
 * }
 *
 * Toggle on/off del acceso de un user a una tool. Si no existe row en
 * `tool_access`, la crea con `granted_by = admin actual`.
 *
 * Duración (solo aplica con status="active"):
 *   - custom_expires_at presente → usa esa fecha (null = permanente)
 *   - duration_minutes → now + N minutos
 *   - ninguno → permanente (expires_at = null), compat con el toggle viejo
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/auth/admin-guard";
import { createServerClient } from "@/lib/db/supabase";

const AccessSchema = z
  .object({
    userId: z.string().uuid(),
    toolId: z.string().min(1),
    status: z.enum(["active", "locked"]),
    duration_minutes: z.number().int().positive().max(525_600).optional(),
    custom_expires_at: z.string().datetime().nullable().optional(),
  })
  .refine(
    (body) =>
      body.custom_expires_at === undefined ||
      body.duration_minutes === undefined,
    {
      message: "mandá duration_minutes o custom_expires_at, no ambos",
      path: ["custom_expires_at"],
    },
  );

function resolveExpiresAt(input: {
  status: "active" | "locked";
  duration_minutes?: number;
  custom_expires_at?: string | null;
}): { ok: true; expiresAt: string | null } | { ok: false; message: string } {
  if (input.status === "locked") {
    return { ok: true, expiresAt: null };
  }

  if (input.custom_expires_at !== undefined) {
    if (input.custom_expires_at === null) {
      return { ok: true, expiresAt: null };
    }
    const date = new Date(input.custom_expires_at);
    if (Number.isNaN(date.getTime())) {
      return { ok: false, message: "custom_expires_at inválido" };
    }
    if (date.getTime() <= Date.now()) {
      return { ok: false, message: "custom_expires_at tiene que ser a futuro" };
    }
    return { ok: true, expiresAt: date.toISOString() };
  }

  if (input.duration_minutes != null) {
    return {
      ok: true,
      expiresAt: new Date(
        Date.now() + input.duration_minutes * 60_000,
      ).toISOString(),
    };
  }

  // Default: permanente (comportamiento histórico del toggle).
  return { ok: true, expiresAt: null };
}

export async function PATCH(request: Request): Promise<NextResponse> {
  const guard = await requireAdminApi();
  if (guard instanceof NextResponse) return guard;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const parsed = AccessSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_request", message: parsed.error.issues[0].message },
      { status: 400 },
    );
  }
  const { userId, toolId, status, duration_minutes, custom_expires_at } =
    parsed.data;

  const resolved = resolveExpiresAt({
    status,
    duration_minutes,
    custom_expires_at,
  });
  if (!resolved.ok) {
    return NextResponse.json(
      { error: "bad_request", message: resolved.message },
      { status: 400 },
    );
  }

  const db = createServerClient();
  const { error } = await db.from("tool_access").upsert(
    {
      user_id: userId,
      tool_id: toolId,
      status,
      granted_by: guard.userId,
      expires_at: resolved.expiresAt,
    },
    { onConflict: "user_id,tool_id" },
  );
  if (error) {
    return NextResponse.json(
      { error: "db_error", message: error.message },
      { status: 500 },
    );
  }
  return NextResponse.json({
    ok: true,
    status,
    expires_at: resolved.expiresAt,
  });
}
