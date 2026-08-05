/**
 * PATCH /api/admin/system-prompts/[id]/model
 *
 * Cambia modelo y/o thinking_mode de una versión existente, sin crear una
 * nueva. Útil cuando el admin quiere abaratar/encarecer o apagar thinking
 * (Sonnet 5) sin duplicar el contenido del prompt.
 *
 * Body: { model?, thinkingMode? } — al menos uno requerido.
 *   model: Haiku / Sonnet / Opus vigentes (CHECK migration 0019)
 *   thinkingMode: "off" | "auto" (CHECK migration 0020)
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/auth/admin-guard";
import { createServerClient } from "@/lib/db/supabase";

type Ctx = { params: Promise<{ id: string }> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const BodySchema = z
  .object({
    model: z
      .enum([
        "claude-haiku-4-5",
        "claude-sonnet-4-6",
        "claude-sonnet-5",
        "claude-opus-4-6",
        "claude-opus-4-7",
        "claude-opus-4-8",
        "claude-opus-5",
      ])
      .optional(),
    thinkingMode: z.enum(["off", "auto"]).optional(),
  })
  .refine((b) => b.model != null || b.thinkingMode != null, {
    message: "pasá model y/o thinkingMode",
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

  const patch: { model?: string; thinking_mode?: string } = {};
  if (parsed.data.model != null) patch.model = parsed.data.model;
  if (parsed.data.thinkingMode != null) {
    patch.thinking_mode = parsed.data.thinkingMode;
  }

  const db = createServerClient();
  const { data, error } = await db
    .from("system_prompts")
    .update(patch)
    .eq("id", id)
    .select("id, model, thinking_mode, is_active")
    .single();
  if (error) {
    return NextResponse.json(
      { error: "db_error", message: error.message },
      { status: 500 },
    );
  }
  return NextResponse.json({
    ok: true,
    prompt: {
      id: data.id,
      model: data.model,
      thinkingMode: data.thinking_mode,
      is_active: data.is_active,
    },
  });
}
