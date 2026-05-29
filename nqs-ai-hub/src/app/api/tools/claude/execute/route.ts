/**
 * POST /api/tools/claude/execute
 *
 * Body: { prompt: string, images?: ExecuteImage[], conversationId?: uuid }
 * Response: { text, tokensInput, tokensOutput, conversationId, messageId }
 *           | { error, message? }
 *
 * Flujo:
 *   1. Verifica sesión (401 si no hay).
 *   2. Middleware de permisos (`canUseTool` → 401/403 si falla).
 *   3. Valida body con Zod (400 si no parsea).
 *   4. Delega al ClaudeAdapter.
 *   5. Devuelve resultado o error genérico.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/server";
import { getAdapter } from "@/lib/adapters";
import { requireToolAccess } from "@/lib/middleware/permissions";

const MAX_PROMPT_CHARS = 10_000;
const MAX_IMAGES = 5;

// Las imágenes ya viajaron a Storage (vía /upload-url). Acá solo
// recibimos los PATHS — el adapter valida ownership y genera signed
// URLs. El body queda chico (no más base64) → sin problema con el
// límite de 4.5MB de Vercel.
const ExecuteSchema = z.object({
  prompt: z.string().min(1).max(MAX_PROMPT_CHARS),
  imagePaths: z.array(z.string().min(1).max(500)).max(MAX_IMAGES).optional(),
  conversationId: z.string().uuid().optional(),
});

export async function POST(request: Request): Promise<NextResponse> {
  // 1) sesión
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // 2) permisos
  const denied = await requireToolAccess(session.userId, "claude");
  if (denied) return denied;

  // 3) body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "bad_request", message: "body no es JSON válido" },
      { status: 400 },
    );
  }

  const parsed = ExecuteSchema.safeParse(body);
  if (!parsed.success) {
    // Devolvemos el primer issue para que el cliente sepa qué arreglar,
    // pero sin filtrar el schema entero al usuario.
    const first = parsed.error.issues[0];
    return NextResponse.json(
      {
        error: "bad_request",
        message: `${first.path.join(".") || "body"}: ${first.message}`,
      },
      { status: 400 },
    );
  }

  // 4) ejecutar
  const adapter = getAdapter("claude");
  if (!adapter.execute) {
    return NextResponse.json(
      { error: "not_implemented" },
      { status: 501 },
    );
  }

  const result = await adapter.execute(session.userId, parsed.data);
  if (!result.ok) {
    return NextResponse.json(
      { error: "execute_failed", message: result.error.message },
      { status: 502 },
    );
  }

  return NextResponse.json(result.value);
}
