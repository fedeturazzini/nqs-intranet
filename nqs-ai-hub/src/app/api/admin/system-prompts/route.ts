/**
 * /api/admin/system-prompts
 *
 * GET  → lista versiones para una tool. Query: ?toolId=claude
 * POST → crea NUEVA versión. Body: { toolId, name, content, model, activate? }
 *
 * Solo admin. Crear una versión NUNCA borra las anteriores (auditoría).
 * Si `activate=true`, dejamos esa versión como is_active y las demás false.
 * Si `activate=false` (default), la versión queda inactiva — el admin
 * la activa después con POST /[id]/activate.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/auth/admin-guard";
import { createServerClient } from "@/lib/db/supabase";
import { encrypt } from "@/lib/utils/crypto";
import { defaultThinkingModeFor } from "@/lib/anthropic/thinking-mode";

const ALLOWED_MODELS = [
  "claude-haiku-4-5",
  "claude-sonnet-4-6",
  "claude-sonnet-5",
  "claude-opus-4-6",
  "claude-opus-4-7",
  "claude-opus-4-8",
  "claude-opus-5",
] as const;

const NewPromptSchema = z.object({
  toolId: z.string().min(1),
  type: z.enum(["system", "memory"]).optional().default("system"),
  // Migration 0008: cada versión pertenece a un proyecto. La versión y la
  // activación se escopean por (toolId, type, projectId).
  projectId: z.string().uuid().optional(),
  name: z.string().min(2).max(120),
  // memory puede ser vacía (ej. "no hay contexto activo"); system no
  content: z.string().min(0).max(50_000),
  model: z.enum(ALLOWED_MODELS),
  thinkingMode: z.enum(["off", "auto"]).optional(),
  activate: z.boolean().optional().default(false),
});

export async function GET(request: Request): Promise<NextResponse> {
  const guard = await requireAdminApi();
  if (guard instanceof NextResponse) return guard;

  const url = new URL(request.url);
  const toolId = url.searchParams.get("toolId");
  const typeFilter = url.searchParams.get("type");
  const projectId = url.searchParams.get("projectId");
  if (!toolId) {
    return NextResponse.json(
      { error: "bad_request", message: "missing toolId" },
      { status: 400 },
    );
  }
  if (typeFilter && typeFilter !== "system" && typeFilter !== "memory") {
    return NextResponse.json(
      { error: "bad_request", message: "type debe ser 'system' o 'memory'" },
      { status: 400 },
    );
  }

  const db = createServerClient();
  let q = db
    .from("system_prompts")
    .select(
      "id, tool_id, type, name, model, thinking_mode, is_active, version, created_by, created_at, updated_at, users!system_prompts_created_by_fkey(name)",
    )
    .eq("tool_id", toolId)
    .order("version", { ascending: false })
    .limit(50);
  if (typeFilter) q = q.eq("type", typeFilter);
  if (projectId) q = q.eq("project_id", projectId);
  const { data, error } = await q;
  if (error) {
    return NextResponse.json(
      { error: "db_error", message: error.message },
      { status: 500 },
    );
  }
  return NextResponse.json({ prompts: data ?? [] });
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
  const parsed = NewPromptSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_request", message: parsed.error.issues[0].message },
      { status: 400 },
    );
  }
  const { toolId, type, projectId, name, content, model, thinkingMode, activate } =
    parsed.data;

  const db = createServerClient();

  // Próxima version = max(version) + 1, SOLO entre prompts del mismo type
  // y proyecto (cada (type, project) lleva su propia secuencia).
  let lastQ = db
    .from("system_prompts")
    .select("version")
    .eq("tool_id", toolId)
    .eq("type", type);
  if (projectId) lastQ = lastQ.eq("project_id", projectId);
  const { data: last } = await lastQ
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextVersion = (last?.version ?? 0) + 1;

  // Si no mandaron thinkingMode: Sonnet 5 → off; resto → auto.
  const resolvedThinking = thinkingMode ?? defaultThinkingModeFor(model);

  const { data: inserted, error: insErr } = await db
    .from("system_prompts")
    .insert({
      tool_id: toolId,
      type,
      project_id: projectId ?? null,
      name,
      content_encrypted: encrypt(content),
      model,
      thinking_mode: resolvedThinking,
      is_active: false, // siempre false al crear; activate aparte si pidieron
      version: nextVersion,
      created_by: guard.userId,
    })
    .select(
      "id, tool_id, type, name, model, thinking_mode, is_active, version, created_at",
    )
    .single();
  if (insErr || !inserted) {
    return NextResponse.json(
      { error: "db_error", message: insErr?.message ?? "insert_failed" },
      { status: 500 },
    );
  }

  if (activate) {
    // Desactivar las demás versiones del mismo (toolId, type, project) y
    // activar esta. Importante: NO desactivar el otro type ni otros
    // proyectos — cada (type, project) tiene su activo independiente.
    let deacQ = db
      .from("system_prompts")
      .update({ is_active: false })
      .eq("tool_id", toolId)
      .eq("type", type)
      .neq("id", inserted.id);
    if (projectId) deacQ = deacQ.eq("project_id", projectId);
    await deacQ;
    const { error: actErr } = await db
      .from("system_prompts")
      .update({ is_active: true })
      .eq("id", inserted.id);
    if (actErr) {
      return NextResponse.json(
        {
          error: "db_error",
          message: `prompt creado pero falló la activación: ${actErr.message}`,
        },
        { status: 500 },
      );
    }
    inserted.is_active = true;
  }

  return NextResponse.json({ prompt: inserted });
}
