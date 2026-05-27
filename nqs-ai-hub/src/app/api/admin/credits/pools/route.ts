/**
 * /api/admin/credits/pools
 *
 * GET  → lista compras (credit_pools) ordenadas por fecha desc.
 * POST → registra compra. Body: { toolId, totalCredits, costUsd?, note? }.
 *
 * Solo admin. No incrementa allocations automáticamente — los pools son
 * el histórico de compras; las asignaciones a usuarios se hacen aparte
 * via /api/admin/credits/allocations.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/auth/admin-guard";
import { createServerClient } from "@/lib/db/supabase";

const PoolSchema = z.object({
  toolId: z.string().min(1),
  totalCredits: z.number().int().min(1).max(1_000_000),
  costUsd: z.number().min(0).max(1_000_000).optional(),
  note: z.string().max(500).optional(),
});

export async function GET(): Promise<NextResponse> {
  const guard = await requireAdminApi();
  if (guard instanceof NextResponse) return guard;

  const db = createServerClient();
  const { data, error } = await db
    .from("credit_pools")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) {
    return NextResponse.json(
      { error: "db_error", message: error.message },
      { status: 500 },
    );
  }
  return NextResponse.json({ pools: data ?? [] });
}

export async function POST(request: Request): Promise<NextResponse> {
  const guard = await requireAdminApi();
  if (guard instanceof NextResponse) return guard;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "bad_request", message: "body inválido" },
      { status: 400 },
    );
  }
  const parsed = PoolSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_request", message: parsed.error.issues[0].message },
      { status: 400 },
    );
  }

  const db = createServerClient();
  const { data, error } = await db
    .from("credit_pools")
    .insert({
      tool_id: parsed.data.toolId,
      total_credits: parsed.data.totalCredits,
      cost_usd: parsed.data.costUsd ?? null,
      purchase_note: parsed.data.note ?? null,
      purchased_by: guard.userId,
    })
    .select("*")
    .single();
  if (error || !data) {
    return NextResponse.json(
      { error: "db_error", message: error?.message ?? "insert_failed" },
      { status: 500 },
    );
  }
  return NextResponse.json({ pool: data });
}
