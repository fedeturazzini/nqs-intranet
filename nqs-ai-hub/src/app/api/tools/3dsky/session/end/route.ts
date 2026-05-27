/**
 * POST /api/tools/3dsky/session/end
 *
 * Body: { sessionId: uuid, declaredConsumption: int ≥ 0 }
 * Response: { credits, creditsTotal, used }
 *
 * Cierra una sesión del módulo y, si el empleado declaró consumo,
 * descuenta créditos atómicamente vía el adapter (RPC consume_credit_atomic).
 *
 * Validaciones:
 *   - sessionId existe y pertenece al user actual.
 *   - sessionId no está ya cerrada.
 *   - declaredConsumption es entero ≥ 0.
 *
 * Si el descuento de créditos falla (insuficientes / no_allocation), la
 * sesión se marca cerrada igual con `declared_consumption=0` y devolvemos
 * 422 — el admin puede investigar la sesión por separado.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/server";
import { getAdapter } from "@/lib/adapters";
import { createServerClient } from "@/lib/db/supabase";

const EndSchema = z.object({
  sessionId: z.string().uuid(),
  declaredConsumption: z.number().int().min(0).max(10_000),
});

export async function POST(request: Request): Promise<NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "bad_request", message: "body no es JSON válido" },
      { status: 400 },
    );
  }

  const parsed = EndSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return NextResponse.json(
      {
        error: "bad_request",
        message: `${first.path.join(".") || "body"}: ${first.message}`,
      },
      { status: 400 },
    );
  }

  const { sessionId, declaredConsumption } = parsed.data;
  const db = createServerClient();

  // Validar ownership + que la sesión esté abierta.
  const { data: existing, error: lookupErr } = await db
    .from("module_sessions")
    .select("id, user_id, exited_at")
    .eq("id", sessionId)
    .maybeSingle();

  if (lookupErr) {
    return NextResponse.json(
      { error: "db_error", message: lookupErr.message },
      { status: 500 },
    );
  }
  if (!existing || existing.user_id !== session.userId) {
    // No leakeamos si existe — 404 unificado.
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (existing.exited_at) {
    return NextResponse.json(
      { error: "session_already_closed" },
      { status: 409 },
    );
  }

  // Descontar créditos si hay declaración.
  let consumeError: string | null = null;
  if (declaredConsumption > 0) {
    const adapter = getAdapter("3dsky");
    if (!adapter.consumeCredit) {
      return NextResponse.json(
        { error: "not_implemented" },
        { status: 501 },
      );
    }
    const result = await adapter.consumeCredit(
      session.userId,
      declaredConsumption,
      `3DSky session ${sessionId.slice(0, 8)}`,
    );
    if (!result.ok) {
      consumeError = result.error.message;
    }
  }

  // Cerrar la sesión. Si el consumo falló, guardamos 0 declarado para
  // no quedar inconsistente con `credit_transactions`.
  const declaredToPersist = consumeError ? 0 : declaredConsumption;
  const { error: updateErr } = await db
    .from("module_sessions")
    .update({
      exited_at: new Date().toISOString(),
      declared_consumption: declaredToPersist,
    })
    .eq("id", sessionId);

  if (updateErr) {
    return NextResponse.json(
      { error: "db_error", message: updateErr.message },
      { status: 500 },
    );
  }

  // Si el consumo falló, devolvemos 422 con el detalle.
  if (consumeError) {
    return NextResponse.json(
      {
        error: "consume_failed",
        message: consumeError,
      },
      { status: 422 },
    );
  }

  // Estado actualizado de créditos.
  const { data: alloc } = await db
    .from("credit_allocations")
    .select("credits_assigned, credits_used")
    .eq("user_id", session.userId)
    .eq("tool_id", "3dsky")
    .maybeSingle();
  const total = alloc?.credits_assigned ?? 0;
  const used = alloc?.credits_used ?? 0;
  return NextResponse.json({
    credits: total - used,
    creditsTotal: total,
    used,
  });
}
