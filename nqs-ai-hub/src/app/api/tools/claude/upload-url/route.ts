/**
 * POST /api/tools/claude/upload-url
 *
 * Genera signed upload URLs para que el cliente suba imágenes DIRECTO a
 * Supabase Storage (sin pasar por Vercel → esquiva el límite de 4.5MB).
 *
 * Body: { mediaTypes: string[], conversationId?: uuid }
 *   - mediaTypes: 1-5 tipos MIME (jpeg/png/gif/webp). El cliente ya
 *     validó tamaño (≤10MB) y cantidad antes de pedir esto.
 * Response: { targets: [{ path, signedUrl, token }] }
 *
 * Requiere acceso a Claude (canUseTool) — no queremos que alguien sin
 * acceso genere URLs de subida.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/server";
import { requireToolAccess } from "@/lib/middleware/permissions";
import { createUploadTargets } from "@/lib/storage/claude-uploads";

const ACCEPTED = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;

const BodySchema = z.object({
  mediaTypes: z.array(z.enum(ACCEPTED)).min(1).max(5),
  conversationId: z.string().uuid().optional(),
});

export async function POST(request: Request): Promise<NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const denied = await requireToolAccess(session.userId, "claude");
  if (denied) return denied;

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

  try {
    const targets = await createUploadTargets(
      session.userId,
      parsed.data.conversationId ?? null,
      parsed.data.mediaTypes,
    );
    return NextResponse.json({ targets });
  } catch (err) {
    return NextResponse.json(
      {
        error: "storage_error",
        message: err instanceof Error ? err.message : "no_signed_url",
      },
      { status: 500 },
    );
  }
}
