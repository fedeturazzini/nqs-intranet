/**
 * PATCH /api/admin/system-prompts/[id]/model
 *
 * Cambia SOLO el modelo (Haiku/Sonnet/Opus) de una versión existente,
 * sin crear una nueva. Útil cuando el admin quiere abaratar/encarecer
 * sin tener que duplicar el contenido del prompt.
 *
 * Body: { model: "claude-haiku-4-5" | "claude-sonnet-4-6" | "claude-opus-4-7" }
 *
 * El CHECK constraint en DB también valida; acá hacemos validación
 * temprana con Zod para devolver error claro.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/auth/admin-guard";
import { createServerClient } from "@/lib/db/supabase";

type Ctx = { params: Promise<{ id: string }> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const BodySchema = z.object({
  model: z.enum([
    "claude-haiku-4-5",
    "claude-sonnet-4-6",
    "claude-opus-4-7",
  ]),
});

export async function PATCH(
  request: Request,
  ctx: Ctx,
): Promise<NextResponse> {
  const guard = await requireAdminApi();
  if (guard instanceof NextResponse) return guard;

  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_request", message: parsed.error.issues[0].message },
      { status: 400 },
    );
  }

  const db = createServerClient();
  const { data, error } = await db
    .from("system_prompts")
    .update({ model: parsed.data.model })
    .eq("id", id)
    .select("id, model, is_active")
    .single();
  if (error) {
    return NextResponse.json(
      { error: "db_error", message: error.message },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, prompt: data });
}
