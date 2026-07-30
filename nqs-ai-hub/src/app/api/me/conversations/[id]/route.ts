/**
 * GET   /api/me/conversations/[id] — mensajes de una conversación.
 * PATCH /api/me/conversations/[id] — renombrar el título de la conversación.
 *
 * Ambos validan ownership server-side (no nos fiamos de RLS solo — el
 * service_role client se la saltea).
 *
 * En Next 16 los `params` de rutas dinámicas son `Promise`.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/server";
import { createServerClient } from "@/lib/db/supabase";
import { signDownloadUrls } from "@/lib/storage/claude-uploads";
import { getActiveProjectId } from "@/lib/db/queries/projects";
import { hasProjectGate } from "@/lib/auth/project-gate";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(
  _request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  const db = createServerClient();

  // Ownership check + título de la conv en una sola query.
  const { data: conv, error: convErr } = await db
    .from("claude_conversations")
    .select("id, user_id, project_id, title, created_at, updated_at")
    .eq("id", id)
    .maybeSingle();

  if (convErr) {
    return NextResponse.json(
      { error: "db_error", message: convErr.message },
      { status: 500 },
    );
  }
  if (!conv) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (conv.user_id !== session.userId) {
    // 404 a propósito — no leakear existencia de conversaciones ajenas.
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // FIX 17.5: además del ownership, la conversación debe pertenecer al
  // proyecto activo del user. Evita abrir una conv de otro proyecto por
  // URL. 404 (no leakear).
  const activeProjectId = await getActiveProjectId(session.userId);
  if (conv.project_id !== activeProjectId) {
    return NextResponse.json({ error: "wrong_project" }, { status: 404 });
  }

  // Gate de proyecto privado (migration 0016): si el proyecto activo es privado
  // y no hay cookie de gate válida, no devolvemos los mensajes.
  if (activeProjectId && !(await hasProjectGate(activeProjectId))) {
    return NextResponse.json({ error: "project_locked" }, { status: 403 });
  }

  const { data: messages, error: msgErr } = await db
    .from("claude_messages")
    .select(
      "id, role, content, images, tokens_input, tokens_output, created_at",
    )
    .eq("conversation_id", id)
    .order("created_at", { ascending: true });

  if (msgErr) {
    return NextResponse.json(
      { error: "db_error", message: msgErr.message },
      { status: 500 },
    );
  }

  // Las imágenes se guardan como PATHS de Storage. Para mostrarlas hay
  // que firmar URLs de descarga on-demand (1h). Juntamos todos los paths
  // de la conversación, firmamos en un solo batch, y devolvemos
  // `imageUrls` por mensaje.
  const allPaths: string[] = [];
  for (const m of messages ?? []) {
    const imgs = Array.isArray(m.images) ? (m.images as unknown[]) : [];
    for (const p of imgs) {
      if (typeof p === "string" && p.length > 0) allPaths.push(p);
    }
  }
  const signedByPath = new Map<string, string>();
  if (allPaths.length > 0) {
    const signed = await signDownloadUrls(allPaths);
    for (const s of signed) signedByPath.set(s.path, s.url);
  }

  // Archivos generados (claude_files) de la conversación, agrupados por
  // message_id para adjuntarlos a cada mensaje del assistant al recargar.
  const { data: files } = await db
    .from("claude_files")
    .select("id, message_id, name, media_type, created_at")
    .eq("conversation_id", id);
  const filesByMessage = new Map<
    string,
    Array<{ id: string; name: string; mediaType: string }>
  >();
  // Los archivos con `message_id` null (el mensaje del assistant no se guardó
  // bien en la etapa 2) NO se descartan: se recuperan por TIEMPO para que
  // aparezcan al recargar.
  //
  // REGLA DURA (fix del "archivo equivocado", ver archivo-equivocado-audit.md):
  // cada huérfano va al mensaje de SU PROPIO turno. La versión anterior los
  // adjuntaba TODOS al último mensaje del assistant de la conversación, así que
  // un huérfano de un turno viejo aterrizaba en el mensaje más nuevo (y varios
  // huérfanos de turnos distintos se apilaban en el mismo mensaje).
  const orphanFiles: Array<{
    id: string;
    name: string;
    mediaType: string;
    createdAt: string | null;
  }> = [];
  for (const f of files ?? []) {
    if (!f.message_id) {
      orphanFiles.push({
        id: f.id,
        name: f.name,
        mediaType: f.media_type,
        createdAt: f.created_at,
      });
      continue;
    }
    const arr = filesByMessage.get(f.message_id) ?? [];
    arr.push({ id: f.id, name: f.name, mediaType: f.media_type });
    filesByMessage.set(f.message_id, arr);
  }
  if (orphanFiles.length > 0) {
    // `messages` viene ordenado ascendente por created_at.
    const assistantMsgs = (messages ?? []).filter((m) => m.role === "assistant");
    for (const orphan of orphanFiles) {
      // La etapa 2 inserta el archivo DESPUÉS de su mensaje del assistant, en la
      // misma vuelta → su dueño es el ÚLTIMO assistant creado en o antes que el
      // archivo. Si no podemos fecharlo, NO adivinamos (mejor no mostrarlo que
      // colgarlo del mensaje equivocado).
      if (!orphan.createdAt) continue;
      const fileTime = new Date(orphan.createdAt).getTime();
      let ownerId: string | null = null;
      for (const m of assistantMsgs) {
        if (!m.created_at) continue;
        if (new Date(m.created_at).getTime() <= fileTime) ownerId = m.id;
        else break; // ascendente: de acá en adelante todos son posteriores
      }
      if (!ownerId) continue;
      const arr = filesByMessage.get(ownerId) ?? [];
      arr.push({
        id: orphan.id,
        name: orphan.name,
        mediaType: orphan.mediaType,
      });
      filesByMessage.set(ownerId, arr);
    }
  }

  const messagesWithUrls = (messages ?? []).map((m) => {
    const imgs = Array.isArray(m.images) ? (m.images as unknown[]) : [];
    // Los paths mezclan imágenes y PDFs; se distinguen por extensión. El
    // nombre original del PDF no se persiste (solo el path uuid.pdf) → label
    // genérico. Imágenes → imageUrls (como antes); PDFs → pdfAttachments.
    const imageUrls: string[] = [];
    const pdfAttachments: Array<{ url: string; name: string }> = [];
    for (const p of imgs) {
      if (typeof p !== "string") continue;
      const url = signedByPath.get(p);
      if (!url) continue;
      if (p.toLowerCase().endsWith(".pdf")) {
        pdfAttachments.push({ url, name: "documento.pdf" });
      } else {
        imageUrls.push(url);
      }
    }
    return { ...m, imageUrls, pdfAttachments, files: filesByMessage.get(m.id) };
  });

  return NextResponse.json({
    conversation: {
      id: conv.id,
      title: conv.title,
      createdAt: conv.created_at,
      updatedAt: conv.updated_at,
    },
    messages: messagesWithUrls,
  });
}

// El título editable: no vacío y con un largo razonable. Se `trim`ea antes de
// validar, así "   " no pasa como título válido.
const RenameSchema = z.object({
  title: z.string().trim().min(1, "el título no puede estar vacío").max(100),
});

/**
 * PATCH /api/me/conversations/[id] — renombra el título de la conversación.
 * Body: { title }. Solo el dueño puede renombrar (ownership por user_id → 403).
 */
export async function PATCH(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "bad_request", message: "body no es JSON válido" },
      { status: 400 },
    );
  }

  const parsed = RenameSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_request", message: parsed.error.issues[0].message },
      { status: 400 },
    );
  }
  const title = parsed.data.title;

  const db = createServerClient();

  // Ownership: traemos la conv y validamos que sea del user antes de tocar nada.
  const { data: conv, error: convErr } = await db
    .from("claude_conversations")
    .select("id, user_id")
    .eq("id", id)
    .maybeSingle();

  if (convErr) {
    return NextResponse.json(
      { error: "db_error", message: convErr.message },
      { status: 500 },
    );
  }
  if (!conv) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (conv.user_id !== session.userId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Update con guard extra por user_id (defensa en profundidad).
  const { error: updErr } = await db
    .from("claude_conversations")
    .update({ title })
    .eq("id", id)
    .eq("user_id", session.userId);

  if (updErr) {
    return NextResponse.json(
      { error: "db_error", message: updErr.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, title });
}
