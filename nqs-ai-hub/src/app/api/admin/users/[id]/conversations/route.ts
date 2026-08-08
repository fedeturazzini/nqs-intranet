/**
 * GET /api/admin/users/[id]/conversations
 *
 * Lista todas las conversaciones de un usuario (admin + gate de Gastos).
 * Query: ?limit=50&offset=0
 * Opción A: no chequea gate de proyectos privados.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/auth/admin-guard";
import { requireGastosGateApi } from "@/lib/auth/gastos-gate";
import {
  ADMIN_CONVERSATION_LIST_DEFAULT_LIMIT,
  ADMIN_CONVERSATION_LIST_MAX_LIMIT,
  listConversationsForUser,
} from "@/lib/db/queries/conversations";
import { createServerClient } from "@/lib/db/supabase";

type RouteContext = { params: Promise<{ id: string }> };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const QuerySchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(ADMIN_CONVERSATION_LIST_MAX_LIMIT)
    .default(ADMIN_CONVERSATION_LIST_DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function GET(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const guard = await requireAdminApi();
  if (guard instanceof NextResponse) return guard;
  const gate = await requireGastosGateApi();
  if (gate instanceof NextResponse) return gate;

  const { id: userId } = await context.params;
  if (!UUID_RE.test(userId)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    limit: url.searchParams.get("limit") ?? undefined,
    offset: url.searchParams.get("offset") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_request", message: parsed.error.issues[0].message },
      { status: 400 },
    );
  }

  // Confirmar que el user existe (404 vs lista vacía).
  const db = createServerClient();
  const { data: user, error: userErr } = await db
    .from("users")
    .select("id, name")
    .eq("id", userId)
    .maybeSingle();
  if (userErr) {
    return NextResponse.json(
      { error: "db_error", message: userErr.message },
      { status: 500 },
    );
  }
  if (!user) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  try {
    const { rows, hasMore } = await listConversationsForUser(userId, {
      limit: parsed.data.limit,
      offset: parsed.data.offset,
    });
    return NextResponse.json({
      user: { id: user.id, name: user.name },
      conversations: rows.map((c) => ({
        id: c.id,
        title: c.title,
        projectId: c.project_id,
        projectName: c.project_name,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
      })),
      limit: parsed.data.limit,
      offset: parsed.data.offset,
      hasMore,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "db_error",
        message: error instanceof Error ? error.message : "error desconocido",
      },
      { status: 500 },
    );
  }
}
