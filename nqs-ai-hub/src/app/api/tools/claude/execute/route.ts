/**
 * POST /api/tools/claude/execute
 *
 * Body: { prompt, imagePaths?, conversationId?, projectId? }
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
import { resolveClaudeExecuteContext } from "@/lib/adapters/claude-execute-context";
import { requireToolAccess } from "@/lib/middleware/permissions";
import { logWarn, logError, requestIdFrom } from "@/lib/log";
import { NO_CREDITS_CODE } from "@/lib/anthropic/errors";

// La respuesta se STREAMEA (puede tardar varios MINUTOS con prompts grandes).
// Con el techo anterior (60s, el cap del plan Hobby) Vercel mataba la función
// a mitad del stream ("Vercel Runtime Timeout Error: Task timed out after 60
// seconds"): el artifact nunca recibía su cierre y el spinner "Generando
// archivo…" quedaba eterno. 300s requiere plan Pro. Con Fluid Compute
// (vercel.json "fluid": true) la espera de I/O a Anthropic no cuenta como
// Active CPU → no encarece tener la función abierta mientras streamea.
export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_PROMPT_CHARS = 10_000;
// Máximo de adjuntos por mensaje (imágenes + PDFs). `imagePaths` lleva paths
// mixtos; el adapter decide el tipo de bloque por la extensión.
const MAX_ATTACHMENTS = 10;

// Las imágenes ya viajaron a Storage (vía /upload-url). Acá solo
// recibimos los PATHS — el adapter valida ownership y genera signed
// URLs. El body queda chico (no más base64) → sin problema con el
// límite de 4.5MB de Vercel.
const ExecuteSchema = z.object({
  prompt: z.string().min(1).max(MAX_PROMPT_CHARS),
  imagePaths: z
    .array(z.string().min(1).max(500))
    .max(MAX_ATTACHMENTS)
    .optional(),
  conversationId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
});

export async function POST(request: Request): Promise<Response> {
  const requestId = requestIdFrom(request);
  // 1) sesión
  const session = await getSession();
  if (!session) {
    logWarn("execute: sin sesión válida", {
      route: "tools/claude/execute",
      status: 401,
      reason: "session_invalid",
      requestId,
    });
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

  // 4) ejecutar con STREAMING.
  const adapter = getAdapter("claude");
  if (!adapter.execute) {
    return NextResponse.json({ error: "not_implemented" }, { status: 501 });
  }
  const execute = adapter.execute.bind(adapter);
  const userId = session.userId;

  // El contexto de proyecto se valida ANTES de abrir NDJSON. Así un mismatch
  // real puede responder HTTP 409 y garantizamos que Anthropic no se invoque.
  let resolved;
  try {
    resolved = await resolveClaudeExecuteContext(userId, parsed.data, {
      requestId,
    });
  } catch (err) {
    logError("execute: no se pudo resolver el contexto de proyecto", {
      route: "tools/claude/execute",
      userId,
      requestId,
      err,
    });
    return NextResponse.json(
      { error: "db_error", message: "No pudimos validar el proyecto." },
      { status: 500 },
    );
  }
  if (!resolved.ok) {
    return NextResponse.json(
      {
        error: resolved.error.error,
        message: resolved.error.message,
      },
      { status: resolved.error.status },
    );
  }
  const params = {
    ...parsed.data,
    projectContext: resolved.value,
  };

  // Respuesta NDJSON (una línea JSON por evento):
  //   {"type":"delta","text":"…"}                        ← por cada fragmento
  //   {"type":"status","status":"generating_file"}       ← generando un archivo
  //   {"type":"done","conversationId","messageId",…}     ← al terminar OK
  //   {"type":"error","message":"…"}                     ← si falló el modelo
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      try {
        const result = await execute(
          userId,
          params,
          (delta) => send({ type: "delta", text: delta }),
          (status) => send({ type: "status", status }),
        );
        if (!result.ok) {
          if (result.error.message === NO_CREDITS_CODE) {
            // Saldo de la API agotado → mandamos un CÓDIGO propio, sin el texto de
            // billing de Anthropic. El chat lo muestra como mensaje claro.
            send({ type: "error", code: NO_CREDITS_CODE });
          } else {
            send({ type: "error", message: result.error.message });
          }
        } else {
          send({
            type: "done",
            text: result.value.text,
            conversationId: result.value.conversationId,
            messageId: result.value.messageId,
            createdAt: result.value.createdAt,
            tokensInput: result.value.tokensInput,
            tokensOutput: result.value.tokensOutput,
            stopReason: result.value.stopReason,
            // ETAPA 2: archivos generados ya en Storage + claude_files (sin URL;
            // se firma en la etapa 3). undefined si no hubo.
            files: result.value.files,
            // Parte 3.2: >0 si se generó un archivo que no se pudo adjuntar.
            filesFailed: result.value.filesFailed,
            // Se esperaba archivo y no vino (el sandbox corrió sin producir nada).
            filesMissing: result.value.filesMissing,
          });
        }
      } catch (err) {
        logError("execute: error inesperado en el stream", {
          route: "tools/claude/execute",
          userId,
          err,
        });
        send({ type: "error", message: "error inesperado" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
