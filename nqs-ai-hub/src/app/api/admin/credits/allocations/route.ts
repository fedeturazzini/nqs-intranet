/**
 * /api/admin/credits/allocations
 *
 * GET  → lista allocations con nombre/email del user (JOIN).
 * POST → ajusta allocation. Body: { userId, toolId, delta }.
 *
 * Reglas:
 *   - `delta` puede ser positivo (sumar) o negativo (restar).
 *   - Después del cambio, `credits_assigned >= credits_used` (no
 *     dejamos quedar el saldo neto negativo).
 *   - Registra una `credit_transaction` con type='allocation' o
 *     'adjustment' según el signo.
 *   - Si no existe row, la crea (upsert behavior).
 *
 * NO marca solicitudes como aprobadas — eso lo hace
 * /api/admin/requests/[id]/approve.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/auth/admin-guard";
import { createServerClient } from "@/lib/db/supabase";

const AllocSchema = z.object({
  userId: z.string().uuid(),
  toolId: z.string().min(1),
  delta: z.number().int().refine((n) => n !== 0, "delta no puede ser 0"),
});

export async function GET(): Promise<NextResponse> {
  const guard = await requireAdminApi();
  if (guard instanceof NextResponse) return guard;

  const db = createServerClient();
  const { data, error } = await db
    .from("credit_allocations")
    .select(
      "id, user_id, tool_id, credits_assigned, credits_used, updated_at, users(name, email)",
    )
    .order("updated_at", { ascending: false });
  if (error) {
    return NextResponse.json(
      { error: "db_error", message: error.message },
      { status: 500 },
    );
  }
  return NextResponse.json({ allocations: data ?? [] });
}

export async function POST(request: Request): Promise<NextResponse> {
  const guard = await requireAdminApi();
  if (guard instanceof NextResponse) return guard;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const parsed = AllocSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_request", message: parsed.error.issues[0].message },
      { status: 400 },
    );
  }
  const { userId, toolId, delta } = parsed.data;
  const db = createServerClient();

  // Buscar allocation existente.
  const { data: existing } = await db
    .from("credit_allocations")
    .select("id, credits_assigned, credits_used")
    .eq("user_id", userId)
    .eq("tool_id", toolId)
    .maybeSingle();

  const currentAssigned = existing?.credits_assigned ?? 0;
  const currentUsed = existing?.credits_used ?? 0;
  const newAssigned = currentAssigned + delta;

  if (newAssigned < currentUsed) {
    return NextResponse.json(
      {
        error: "invalid_delta",
        message: `el ajuste dejaría credits_assigned (${newAssigned}) por debajo de credits_used (${currentUsed})`,
      },
      { status: 422 },
    );
  }

  // Upsert.
  if (existing) {
    const { error } = await db
      .from("credit_allocations")
      .update({ credits_assigned: newAssigned })
      .eq("id", existing.id);
    if (error) {
      return NextResponse.json(
        { error: "db_error", message: error.message },
        { status: 500 },
      );
    }
  } else {
    const { error } = await db.from("credit_allocations").insert({
      user_id: userId,
      tool_id: toolId,
      credits_assigned: newAssigned,
      credits_used: 0,
    });
    if (error) {
      return NextResponse.json(
        { error: "db_error", message: error.message },
        { status: 500 },
      );
    }
  }

  // Registrar transaction. allocation (+) o adjustment (-).
  const txType = delta > 0 ? "allocation" : "adjustment";
  const { error: txErr } = await db.from("credit_transactions").insert({
    user_id: userId,
    tool_id: toolId,
    type: txType,
    amount: delta,
    reason: `admin ${txType} delta=${delta}`,
    performed_by: guard.userId,
  });
  if (txErr) {
    console.error(
      JSON.stringify({
        level: "error",
        msg: "allocation tx insert failed",
        userId,
        toolId,
        delta,
        error: txErr.message,
      }),
    );
  }

  return NextResponse.json({
    ok: true,
    credits_assigned: newAssigned,
    credits_used: currentUsed,
    remaining: newAssigned - currentUsed,
  });
}
